import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeBreakout, analyzeBreakdown, analyzeStrongBar } from "./breakout.ts";

const T0 = 1_700_000_000_000;
const candle = (i: number, open: number, close: number, volume: number) => ({
  openTime: T0 + i * 15 * 60 * 1000,
  open,
  high: Math.max(open, close) * 1.001,
  low: Math.min(open, close) * 0.999,
  close,
  volume,
});

/** 40 choppy (NOT squeezed) candles around 100, avg volume 100. */
function chop(): ReturnType<typeof candle>[] {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const up = i % 2 === 0;
    out.push(candle(i, up ? 99 : 101.5, up ? 101.5 : 99.5, 100));
  }
  return out;
}

test("volume spike through a level flags BRK even without a squeeze", () => {
  const c = chop();
  c.push(candle(40, 100, 104, 600)); // 6x volume, closes through 102
  const r = analyzeBreakout(c, { R1: 102 });
  assert.equal(r?.signal, true);
  assert.equal(r?.barsAgo, 0);
  assert.deepEqual(r?.levelsCleared, ["R1"]);
  assert.ok((r?.relVol ?? 0) >= 4);
});

test("big move on normal volume is not a breakout", () => {
  const c = chop();
  c.push(candle(40, 100, 104, 150));
  assert.equal(analyzeBreakout(c, { R1: 102 })?.signal, false);
});

test("volume spike that clears no level and no range high is ignored", () => {
  const c = chop();
  c.push(candle(40, 100, 101, 600)); // below 102 level and below range high
  assert.equal(analyzeBreakout(c, { R1: 102 })?.signal, false);
});

test("breakout that already ran more than 30% is dropped; failed breakout is dropped", () => {
  const ran = chop();
  ran.push(candle(40, 100, 104, 600), candle(41, 104, 140, 300));
  assert.equal(analyzeBreakout(ran, { R1: 102 })?.signal, false);

  const failed = chop();
  failed.push(candle(40, 100, 104, 600), candle(41, 104, 98, 200));
  assert.equal(analyzeBreakout(failed, { R1: 102 })?.signal, false);
});

test("too few candles returns null", () => {
  assert.equal(analyzeBreakout([candle(0, 1, 2, 1)], { R1: 1 }), null);
});

test("volume spike down through a level flags BRKDN", () => {
  const c = chop();
  c.push(candle(40, 100, 96, 600)); // 6x volume, closes through 98
  const r = analyzeBreakdown(c, { S1: 98 });
  assert.equal(r?.signal, true);
  assert.equal(r?.barsAgo, 0);
  assert.deepEqual(r?.levelsCleared, ["S1"]);
  assert.ok((r?.relVol ?? 0) >= 4);
});

test("breakdown that reclaims above the candle open is dropped", () => {
  const c = chop();
  c.push(candle(40, 100, 96, 600), candle(41, 96, 101, 200));
  assert.equal(analyzeBreakdown(c, { S1: 98 })?.signal, false);
});

/** 25 small-bodied candles (body ~1, wicks small), then the caller appends. */
function calm(): ReturnType<typeof candle>[] {
  const out = [];
  for (let i = 0; i < 25; i++) out.push(candle(i, 100, i % 2 ? 100.8 : 99.2, 100));
  return out;
}

test("strong bar: outlier green body flags BIG up, outlier red flags BIG down", () => {
  const up = calm();
  up.push(candle(25, 100, 104, 100)); // body 4 vs avg ~0.8
  const u = analyzeStrongBar(up);
  assert.equal(u?.signal, true);
  assert.equal(u?.side, "up");
  assert.equal(u?.barsAgo, 0);
  assert.ok((u?.bodyMult ?? 0) >= 2.5);

  const down = calm();
  down.push(candle(25, 100, 96, 100));
  const d = analyzeStrongBar(down);
  assert.equal(d?.side, "down");
});

test("strong bar: wick-dominated range spike flags via range, direction from the dominant wick", () => {
  // Tiny body, but high-low is ~15x the calm average range → range-spike rule.
  const up = calm();
  up.push({ openTime: T0 + 25 * 15 * 60 * 1000, open: 100, close: 102, high: 110, low: 99.5, volume: 100 });
  const u = analyzeStrongBar(up);
  assert.equal(u?.signal, true);
  assert.equal(u?.via, "range");
  assert.equal(u?.side, "up"); // upper wick dominates
  assert.ok((u?.rangeMult ?? 0) >= 2.5);

  const down = calm();
  down.push({ openTime: T0 + 25 * 15 * 60 * 1000, open: 100, close: 99, high: 100.3, low: 90, volume: 100 });
  const d = analyzeStrongBar(down);
  assert.equal(d?.via, "range");
  assert.equal(d?.side, "down"); // lower wick dominates

  // A fat-body bar reports via "body".
  const fat = calm();
  fat.push(candle(25, 100, 104, 100));
  assert.equal(analyzeStrongBar(fat)?.via, "body");
});

test("strong bar: normal bars, stale bars and short series are ignored", () => {
  assert.equal(analyzeStrongBar(calm()), null);

  // Range only 2x the average (< 2.5x) and a weak body → not a strong bar.
  const mild = calm();
  mild.push({ openTime: T0 + 25 * 15 * 60 * 1000, open: 100, close: 100.4, high: 101, low: 99, volume: 100 });
  assert.equal(analyzeStrongBar(mild), null);

  const stale = calm();
  stale.push(candle(25, 100, 104, 100));
  for (let i = 26; i < 31; i++) stale.push(candle(i, 100, i % 2 ? 100.8 : 99.2, 100)); // 5 bars later > freshBars 4
  assert.equal(analyzeStrongBar(stale), null);

  assert.equal(analyzeStrongBar([candle(0, 1, 2, 1)]), null);
});
