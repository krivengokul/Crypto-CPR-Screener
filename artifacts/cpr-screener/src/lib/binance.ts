import { OHLC, CPRResult, analyzeCPR } from "./cpr";

const BASE = "https://api.binance.com/api/v3";

interface KlineRaw extends Array<string | number> {
  0: number;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
}

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

function parseKline(k: KlineRaw): OHLC {
  return {
    openTime: k[0] as number,
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const PINNED_KEY_PREFIX = "cpr_symbols_";

function getTodayISTDate(): string {
  const now = new Date();
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return istDate.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getPinnedSymbols(): string[] | null {
  const key = PINNED_KEY_PREFIX + getTodayISTDate();
  const stored = localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as string[]) : null;
}

function setPinnedSymbols(symbols: string[]): void {
  const key = PINNED_KEY_PREFIX + getTodayISTDate();
  localStorage.setItem(key, JSON.stringify(symbols));
  // Clean up previous days
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PINNED_KEY_PREFIX) && k !== key)
    .forEach((k) => localStorage.removeItem(k));
}

function getTodayUTCMidnightMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export async function fetchTopUSDTSymbols(limit = 500): Promise<Ticker24h[]> {
  const res = await fetch(`${BASE}/ticker/24hr`);
  if (!res.ok) throw new Error(`Binance ticker error: ${res.status}`);
  const data: Ticker24h[] = await res.json();

  return data
    .filter(
      (t) =>
        t.symbol.endsWith("USDT") &&
        !t.symbol.includes("DOWN") &&
        !t.symbol.includes("UP") &&
        !t.symbol.includes("BEAR") &&
        !t.symbol.includes("BULL") &&
        parseFloat(t.quoteVolume) > 0
    )
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, limit);
}

async function fetchKlines(symbol: string): Promise<OHLC[] | null> {
  try {
    const res = await fetch(
      `${BASE}/klines?symbol=${symbol}&interval=1d&limit=4`
    );
    if (!res.ok) return null;
    const data: KlineRaw[] = await res.json();
    if (data.length < 2) return null;
    return data.map(parseKline);
  } catch {
    return null;
  }
}

export async function runScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
const allTickers = await fetchTopUSDTSymbols(500);
  // Pin today's symbol universe on first scan; reuse on rescans
  let pinnedSymbols = getPinnedSymbols();
  if (!pinnedSymbols) {
    pinnedSymbols = allTickers.map((t) => t.symbol);
    setPinnedSymbols(pinnedSymbols);
  }
  const pinnedSet = new Set(pinnedSymbols);
  const tickers = allTickers.filter((t) => pinnedSet.has(t.symbol));
  
  const results: CPRResult[] = [];
  const batchSize = 10;
  const delayMs = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
        batch.map(async (t) => {
       +    const klines = await fetchKlines(t.symbol);
    if (!klines || klines.length < 2) return null;

    const nowMs = Date.now();
    const lastKline = klines[klines.length - 1];
    const lastKlineIsLive = (nowMs - lastKline.openTime) < 24 * 60 * 60 * 1000;

    let prevCandle: OHLC;
    let todayCandle: OHLC;
    let liveCandle: OHLC | null = null;

    if (lastKlineIsLive) {
      if (klines.length < 3) return null;
      prevCandle  = klines[klines.length - 3];
      todayCandle = klines[klines.length - 2];
      liveCandle  = lastKline;
    } else {
      prevCandle  = klines[klines.length - 2];
      todayCandle = klines[klines.length - 1];
      liveCandle  = null;
    }

    const currentPrice = parseFloat(t.lastPrice);
    const changeFromDayOpen = liveCandle
      ? ((currentPrice - liveCandle.open) / liveCandle.open) * 100
      : parseFloat(t.priceChangePercent);
        return analyzeCPR(
          t.symbol,
          [prevCandle, todayCandle],
          currentPrice,
          changeFromDayOpen,
          parseFloat(t.quoteVolume)
        );
      })
    );

    batchResults.forEach((r) => {
      if (r) results.push(r);
    });

    const processed = Math.min(i + batchSize, tickers.length);
    onProgress(processed, tickers.length, batch[batch.length - 1].symbol);

    if (i + batchSize < tickers.length) {
      await sleep(delayMs);
    }
  }

  return results;
}
