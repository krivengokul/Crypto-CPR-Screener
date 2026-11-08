import test from "node:test";
import assert from "node:assert/strict";

// --- minimal browser stubs (the monitor touches storage + WebSocket) -------
const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
};
const g = globalThis as any;
g.localStorage = mem();
g.sessionStorage = mem();

class FakeWS {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWS[] = [];
  readyState = FakeWS.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeWS.instances.push(this);
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    this.readyState = FakeWS.CLOSED;
  }
}
g.WebSocket = FakeWS;

const { LiveEntryCrossMonitor } = await import("./liveEntryCrossMonitor.ts");
type Cand = import("./liveEntryCrossMonitor.ts").EntryCrossCandidate;

function cand(over: Partial<Cand> & { target?: number } = {}): Cand {
  const direction = over.direction ?? "Up";
  const entry = over.entry ?? 100;
  const target = over.target ?? (direction === "Up" ? 120 : 80);
  return {
    key: over.key ?? "binance:BTCUSDT",
    symbol: "BTCUSDT",
    source: "binance",
    direction,
    entry,
    initialPrice: over.initialPrice ?? (direction === "Up" ? 90 : 110),
    payload: { target } as Cand["payload"],
  };
}

function setup() {
  g.localStorage.clear();
  g.sessionStorage.clear();
  FakeWS.instances.length = 0;
  const crosses: { price: number }[] = [];
  const m: any = new LiveEntryCrossMonitor((_c, price) => crosses.push({ price }));
  const trade = (price: number) =>
    m.processTrade({ source: "binance", symbol: "BTCUSDT", price, timestamp: Date.now() });
  const reconnect = () => {
    const sock = FakeWS.instances[FakeWS.instances.length - 1];
    sock.readyState = FakeWS.OPEN;
    sock.onopen?.();
  };
  return { m, crosses, trade, reconnect };
}

test("Up: a real step through entry alerts once", () => {
  const { m, crosses, trade } = setup();
  m.update([cand()]);
  trade(95);
  trade(101);
  trade(102);
  assert.equal(crosses.length, 1);
  assert.equal(crosses[0].price, 101);
  m.stop();
});

test("Down: a real step through entry alerts once", () => {
  const { m, crosses, trade } = setup();
  m.update([cand({ direction: "Down" })]);
  trade(105);
  trade(99);
  trade(98);
  assert.equal(crosses.length, 1);
  m.stop();
});

test("already past entry when first seen: never alerts", () => {
  const { m, crosses, trade } = setup();
  m.update([cand({ initialPrice: 105 })]);
  trade(95);
  trade(101);
  assert.equal(crosses.length, 0);
  m.stop();
});

test("already past target when first seen: never alerts", () => {
  const { m, crosses, trade } = setup();
  m.update([cand({ initialPrice: 125 })]);
  trade(90);
  trade(101);
  assert.equal(crosses.length, 0);
  m.stop();
});

test("print at/through target: marked done, no entry alert", () => {
  const { m, crosses, trade } = setup();
  m.update([cand()]);
  trade(95);
  trade(120); // jumps straight through entry AND target
  trade(95);
  trade(101);
  assert.equal(crosses.length, 0);
  m.stop();
});

test("refreshed candidate already past target is armed off", () => {
  const { m, crosses, trade } = setup();
  m.update([cand()]);
  trade(95);
  m.update([cand({ initialPrice: 121 })]); // same key, scan refresh
  trade(101);
  assert.equal(crosses.length, 0);
  m.stop();
});

test("reconnect keeps the last real tick (no reset to initialPrice)", () => {
  // entry 100, initial 90. Last real tick before the reconnect is 99.
  // If reconnect reset previous to 90, the next tick of 99.5 would look like
  // 90 -> 99.5 (still no cross), so use a tick that only crosses from 99:
  // entry 99.2 -> 99 -> 99.5 is a real cross, 90 -> 99.5 would be too, so
  // assert on the observable: exactly one alert at the first print above entry.
  const { m, crosses, trade, reconnect } = setup();
  m.update([cand()]); // initial 90
  trade(99);
  reconnect();
  trade(99.5);
  assert.equal(crosses.length, 0);
  assert.equal(m.previousPrice.get("binance:BTCUSDT"), 99.5);
  trade(101);
  assert.equal(crosses.length, 1);
  m.stop();
});

test("reconnect does not overwrite an existing previousPrice", () => {
  const { m, reconnect, trade } = setup();
  m.update([cand()]); // initial 90
  trade(97);
  reconnect();
  assert.equal(m.previousPrice.get("binance:BTCUSDT"), 97);
  m.stop();
});

test("reconnect with fresh initialPrice past entry arms off", () => {
  const { m, crosses, trade, reconnect } = setup();
  m.update([cand()]);
  trade(95);
  m.update([cand({ initialPrice: 105 })]); // woke up: scan says already above
  reconnect();
  trade(106);
  assert.equal(crosses.length, 0);
  m.stop();
});

test("alerted key stays off for the rest of the UTC day", () => {
  const { m, crosses, trade } = setup();
  m.update([cand()]);
  trade(95);
  trade(101);
  m.update([]); // candidate drops out
  m.update([cand()]); // and comes back
  trade(95);
  trade(101);
  assert.equal(crosses.length, 1);
  m.stop();
});
