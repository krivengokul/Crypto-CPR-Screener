export type EntryCrossCandidate = {
  key: string;
  symbol: string;
  source: "binance" | "delta";
  direction: "Up" | "Down";
  entry: number;
  initialPrice: number;
  payload: {
    symbol: string;
    source: "binance" | "delta";
    timeframe: string;
    direction: "Up" | "Down";
    type: string;
    patternName: string;
    patternId: string;
    entry: number;
    currentPrice: number;
    target: number;
    sl: number;
    rr: string;
    cprStatus: string;
    timestamp: number;
    dateStr: string;
    status: "ACTIVE";
  };
};

type TradeEvent = { source: "binance" | "delta"; symbol: string; price: number; timestamp: number };

/**
 * Watches already-qualified setups for actual exchange trades through their
 * entry. Setup discovery still comes from the CPR screener; this monitor does
 * not run another scan. The exchange trade timestamp is saved as the signal
 * timestamp, instead of the time the next REST refresh happened to notice it.
 */
export class LiveEntryCrossMonitor {
  private candidates = new Map<string, EntryCrossCandidate>();
  private previousPrice = new Map<string, number>();
  private fired = new Set<string>();
  private binanceSocket: WebSocket | null = null;
  private deltaSocket: WebSocket | null = null;
  private binanceSubscribed = new Set<string>();
  private deltaSubscribed = new Set<string>();
  private binanceReconnect: ReturnType<typeof setTimeout> | null = null;
  private deltaReconnect: ReturnType<typeof setTimeout> | null = null;
  private deltaPing: ReturnType<typeof setInterval> | null = null;
  private binanceRequestId = 1;
  private stopped = false;

  constructor(private readonly onCross: (candidate: EntryCrossCandidate, price: number, timestamp: number) => void) {}

  update(candidates: EntryCrossCandidate[]) {
    const next = new Map(candidates.map((candidate) => [candidate.key, candidate]));
    for (const candidate of candidates) {
      if (!this.candidates.has(candidate.key)) {
        this.previousPrice.set(candidate.key, candidate.initialPrice);
      }
    }
    for (const key of this.candidates.keys()) {
      if (!next.has(key)) {
        this.previousPrice.delete(key);
        this.fired.delete(key);
      }
    }
    this.candidates = next;
    this.syncBinance();
    this.syncDelta();
  }

  stop() {
    this.stopped = true;
    if (this.binanceReconnect) clearTimeout(this.binanceReconnect);
    if (this.deltaReconnect) clearTimeout(this.deltaReconnect);
    if (this.deltaPing) clearInterval(this.deltaPing);
    this.binanceSocket?.close();
    this.deltaSocket?.close();
    this.binanceSocket = null;
    this.deltaSocket = null;
  }

  private processTrade({ source, symbol, price, timestamp }: TradeEvent) {
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp)) return;
    const key = `${source}:${symbol.toUpperCase()}`;
    const candidate = this.candidates.get(key);
    if (!candidate) return;
    const previous = this.previousPrice.get(key);
    this.previousPrice.set(key, price);
    if (this.fired.has(key) || previous === undefined) return;
    const crossed = candidate.direction === "Up"
      ? previous < candidate.entry && price >= candidate.entry
      : previous > candidate.entry && price <= candidate.entry;
    if (!crossed) return;
    this.fired.add(key);
    this.onCross(candidate, price, timestamp);
  }

  private syncBinance() {
    const wanted = new Set(
      [...this.candidates.values()]
        .filter((candidate) => candidate.source === "binance")
        .map((candidate) => candidate.symbol.toLowerCase()),
    );
    if (wanted.size === 0) {
      if (this.binanceReconnect) clearTimeout(this.binanceReconnect);
      this.binanceReconnect = null;
      this.binanceSocket?.close();
      this.binanceSocket = null;
      this.binanceSubscribed.clear();
      return;
    }
    if (!this.binanceSocket || this.binanceSocket.readyState === WebSocket.CLOSED) {
      this.connectBinance();
      return;
    }
    if (this.binanceSocket.readyState !== WebSocket.OPEN) return;
    this.sendBinanceSubscription("UNSUBSCRIBE", [...this.binanceSubscribed].filter((symbol) => !wanted.has(symbol)));
    this.sendBinanceSubscription("SUBSCRIBE", [...wanted].filter((symbol) => !this.binanceSubscribed.has(symbol)));
  }

  private connectBinance() {
    if (this.stopped || ![...this.candidates.values()].some((candidate) => candidate.source === "binance")) return;
    const socket = new WebSocket("wss://fstream.binance.com/market/ws");
    this.binanceSocket = socket;
    socket.onopen = () => {
      if (socket !== this.binanceSocket) return;
      this.binanceSubscribed.clear();
      for (const candidate of this.candidates.values()) {
        if (candidate.source === "binance") this.previousPrice.set(candidate.key, candidate.initialPrice);
      }
      this.syncBinance();
    };
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data));
        if (event.e !== "aggTrade") return;
        this.processTrade({
          source: "binance",
          symbol: String(event.s ?? ""),
          price: Number(event.p),
          timestamp: Number(event.T),
        });
      } catch { /* ignore malformed stream messages */ }
    };
    socket.onclose = () => {
      if (socket !== this.binanceSocket) return;
      this.binanceSocket = null;
      this.binanceSubscribed.clear();
      if (!this.stopped && [...this.candidates.values()].some((candidate) => candidate.source === "binance")) {
        this.binanceReconnect = setTimeout(() => this.connectBinance(), 2_000);
      }
    };
    socket.onerror = () => socket.close();
  }

  private sendBinanceSubscription(method: "SUBSCRIBE" | "UNSUBSCRIBE", symbols: string[]) {
    if (!symbols.length || this.binanceSocket?.readyState !== WebSocket.OPEN) return;
    for (let i = 0; i < symbols.length; i += 100) {
      const batch = symbols.slice(i, i + 100);
      this.binanceSocket.send(JSON.stringify({
        method,
        params: batch.map((symbol) => `${symbol}@aggTrade`),
        id: this.binanceRequestId++,
      }));
      if (this.binanceRequestId > 4_000_000_000) this.binanceRequestId = 1;
      for (const symbol of batch) {
        if (method === "SUBSCRIBE") this.binanceSubscribed.add(symbol);
        else this.binanceSubscribed.delete(symbol);
      }
    }
  }

  private syncDelta() {
    const wanted = new Set(
      [...this.candidates.values()]
        .filter((candidate) => candidate.source === "delta")
        .map((candidate) => candidate.symbol),
    );
    if (wanted.size === 0) {
      if (this.deltaReconnect) clearTimeout(this.deltaReconnect);
      this.deltaReconnect = null;
      this.deltaSocket?.close();
      this.deltaSocket = null;
      this.deltaSubscribed.clear();
      return;
    }
    if (!this.deltaSocket || this.deltaSocket.readyState === WebSocket.CLOSED) {
      this.connectDelta();
      return;
    }
    if (this.deltaSocket.readyState !== WebSocket.OPEN) return;
    this.sendDeltaSubscription("unsubscribe", [...this.deltaSubscribed].filter((symbol) => !wanted.has(symbol)));
    this.sendDeltaSubscription("subscribe", [...wanted].filter((symbol) => !this.deltaSubscribed.has(symbol)));
  }

  private connectDelta() {
    if (this.stopped || ![...this.candidates.values()].some((candidate) => candidate.source === "delta")) return;
    const socket = new WebSocket("wss://public-socket.india.delta.exchange");
    this.deltaSocket = socket;
    socket.onopen = () => {
      if (socket !== this.deltaSocket) return;
      this.deltaSubscribed.clear();
      for (const candidate of this.candidates.values()) {
        if (candidate.source === "delta") this.previousPrice.set(candidate.key, candidate.initialPrice);
      }
      this.syncDelta();
      this.deltaPing = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
      }, 30_000);
    };
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data));
        if (event.type !== "trades") return;
        const rawTimestamp = Number(event.t);
        this.processTrade({
          source: "delta",
          symbol: String(event.sy ?? event.symbol ?? ""),
          price: Number(event.p),
          timestamp: rawTimestamp > 1e15 ? Math.floor(rawTimestamp / 1000) : rawTimestamp,
        });
      } catch { /* ignore heartbeat and malformed messages */ }
    };
    socket.onclose = () => {
      if (socket !== this.deltaSocket) return;
      this.deltaSocket = null;
      this.deltaSubscribed.clear();
      if (this.deltaPing) clearInterval(this.deltaPing);
      this.deltaPing = null;
      if (!this.stopped && [...this.candidates.values()].some((candidate) => candidate.source === "delta")) {
        this.deltaReconnect = setTimeout(() => this.connectDelta(), 2_000);
      }
    };
    socket.onerror = () => socket.close();
  }

  private sendDeltaSubscription(type: "subscribe" | "unsubscribe", symbols: string[]) {
    if (!symbols.length || this.deltaSocket?.readyState !== WebSocket.OPEN) return;
    for (let i = 0; i < symbols.length; i += 100) {
      const batch = symbols.slice(i, i + 100);
      this.deltaSocket.send(JSON.stringify({
        type,
        payload: { channels: [{ name: "trades", symbols: batch }] },
      }));
      for (const symbol of batch) {
        if (type === "subscribe") this.deltaSubscribed.add(symbol);
        else this.deltaSubscribed.delete(symbol);
      }
    }
  }
}
