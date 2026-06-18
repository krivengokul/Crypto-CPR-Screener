import { OHLC, CPRResult, analyzeCPR } from "./cpr";

const BASE = "https://api.india.delta.exchange/v2";

const DELTA_SESSION_OPEN_KEY_PREFIX = "delta_session_open_";

interface DeltaTicker {
  symbol: string;
  close: number;
  open: number;
  high: number;
  low: number;
  ltp_change_24h: string;
  turnover_usd: number;
  contract_type: string;
  mark_price: string;
}

interface DeltaCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type SessionOpenMap = Record<string, number>;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getTodayISTDate(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function getTodayISTSessionStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// ─── Only cache the session open map (day-open prices) ───────────────────────
// CPR results are NO LONGER cached — every scan re-fetches candles fresh,
// exactly like Binance does.

function getPinnedSessionOpenMap(): SessionOpenMap | null {
  const key = DELTA_SESSION_OPEN_KEY_PREFIX + getTodayISTDate();
  const stored = localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as SessionOpenMap) : null;
}

function setPinnedSessionOpenMap(map: SessionOpenMap): void {
  const key = DELTA_SESSION_OPEN_KEY_PREFIX + getTodayISTDate();
  localStorage.setItem(key, JSON.stringify(map));
  Object.keys(localStorage)
    .filter((k) => k.startsWith(DELTA_SESSION_OPEN_KEY_PREFIX) && k !== key)
    .forEach((k) => localStorage.removeItem(k));
}

// ─── Fetch ALL perpetual futures tickers ─────────────────────────────────────

export async function fetchDeltaPerps(): Promise<DeltaTicker[]> {
  const all: DeltaTicker[] = [];
  let after: string | null = null;

  while (true) {
    const url =
      `${BASE}/tickers?contract_types=perpetual_futures` +
      (after ? `&after=${encodeURIComponent(after)}` : "");

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Delta ticker error: ${res.status}`);
    const data = await res.json();

    const page: DeltaTicker[] = (data.result ?? []) as DeltaTicker[];
    all.push(...page);

    const nextAfter: string | null = data.meta?.after ?? null;
    if (!nextAfter || page.length === 0) break;
    after = nextAfter;
  }

  return all.sort((a, b) => (b.turnover_usd || 0) - (a.turnover_usd || 0));
}

// ─── Fetch daily candles — always fresh, no browser cache ────────────────────

async function fetchDeltaCandles(symbol: string): Promise<OHLC[] | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 6 * 86400;
    const res = await fetch(
      `${BASE}/history/candles?symbol=${symbol}&resolution=1d&start=${start}&end=${now}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result || data.result.length < 3) return null;
    return (data.result as DeltaCandle[]).map((k) => ({
      openTime: k.time * 1000,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
    }));
  } catch {
    return null;
  }
}

// ─── CPR computation for a single symbol ─────────────────────────────────────

function computeCPRForSymbol(
  t: DeltaTicker,
  candles: OHLC[],
  todaySessionStartMs: number,
  savedSessionOpen: number | null
): { result: CPRResult; sessionOpen: number | null } | null {
  const todayLiveCandleIdx = candles.findIndex(
    (c) => c.openTime === todaySessionStartMs
  );

  let todayCandle: OHLC;
  let prevCandle: OHLC;
  let todayLiveOpen: number | null = null;

  if (todayLiveCandleIdx !== -1) {
    if (todayLiveCandleIdx < 2) return null;
    todayCandle   = candles[todayLiveCandleIdx - 1];
    prevCandle    = candles[todayLiveCandleIdx - 2];
    todayLiveOpen = candles[todayLiveCandleIdx].open;
  } else {
    if (candles.length < 2) return null;
    todayCandle = candles[candles.length - 1];
    prevCandle  = candles[candles.length - 2];
    // Fall back to saved session open if live candle not in response
    todayLiveOpen = savedSessionOpen;
  }

  const currentPrice = parseFloat(t.mark_price) || t.close;
  const changeFromDayOpen =
    todayLiveOpen !== null && todayLiveOpen > 0
      ? ((currentPrice - todayLiveOpen) / todayLiveOpen) * 100
      : parseFloat(t.ltp_change_24h);

  const result = analyzeCPR(
    t.symbol,
    [prevCandle, todayCandle],
    currentPrice,
    changeFromDayOpen,
    t.turnover_usd || 0
  );

  if (!result) return null;
  return { result, sessionOpen: todayLiveOpen };
}

// ─── Main screener ────────────────────────────────────────────────────────────
// Now works exactly like Binance:
//   • Every call re-fetches all tickers (live prices)
//   • Every call re-fetches all candles (fresh CPR computation)
//   • No CPR results cached in localStorage
//   • Only the sessionOpenMap is cached (day-open price, stable all day)

export async function runDeltaScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
  const todaySessionStartMs = getTodayISTSessionStartMs();

  // Always fetch live tickers
  const tickers = await fetchDeltaPerps();

  // Load saved session open prices (these don't change during the day)
  const savedSessionMap = getPinnedSessionOpenMap() ?? {};

  const results: CPRResult[]           = [];
  const sessionOpenMap: SessionOpenMap = { ...savedSessionMap };
  const batchSize = 10;
  const delayMs   = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        // Always fetch fresh candles — no cache, same as Binance klines fetch
        const candles = await fetchDeltaCandles(t.symbol);
        if (!candles || candles.length < 3) return null;
        const savedOpen = savedSessionMap[t.symbol] ?? null;
        return computeCPRForSymbol(t, candles, todaySessionStartMs, savedOpen);
      })
    );

    batchResults.forEach((r) => {
      if (!r) return;
      results.push(r.result);
      if (r.sessionOpen !== null) {
        sessionOpenMap[r.result.symbol] = r.sessionOpen;
      }
    });

    onProgress(
      Math.min(i + batchSize, tickers.length),
      tickers.length,
      batch[batch.length - 1].symbol
    );

    if (i + batchSize < tickers.length) await sleep(delayMs);
  }

  // Only persist session open prices (stable all day, saves re-deriving them)
  setPinnedSessionOpenMap(sessionOpenMap);

  return results;
}
