import { OHLC, CPRResult, analyzeCPR } from "./cpr";
import { shouldExcludeSymbol } from "./symbolFilters";
import { isLiveDailyCandle, candlesAreContiguous } from "./binance";

// FUTURES ONLY. CoinDCX futures instruments are named `B-<BASE>_USDT`
// (the `B-` prefix means the contract is routed to Binance), e.g.
// `B-BTC_USDT`. To stay consistent with binance.ts and symbolFilters.ts the
// rest of the app sees the symbol as `BTCUSDT` — `toCoinDCXPair` /
// `fromCoinDCXPair` below are the ONLY place the two forms are converted.
//
// Endpoints used (all public, no API key):
//   GET api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments
//   GET public.coindcx.com/market_data/candlesticks   (pcode=f, resolution=1D)
//   GET public.coindcx.com/market_data/v3/current_prices/futures/rt
//
// BROWSER / CORS: CoinDCX's public endpoints do not send CORS headers, so a
// browser app (e.g. on GitHub Pages) cannot call them directly. Set
// VITE_COINDCX_PROXY (build-time, no trailing slash) to a relay that maps
//   <proxy>/api/...    -> https://api.coindcx.com/...
//   <proxy>/public/... -> https://public.coindcx.com/...
// (see coindcx-proxy-worker.js). Unset = call CoinDCX directly, which is
// fine for server-side use or a browser with CORS disabled.
const PROXY = (
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_COINDCX_PROXY ?? ""
).replace(/\/+$/, "");
const API_BASE = PROXY ? `${PROXY}/api` : "https://api.coindcx.com";
const PUBLIC_BASE = PROXY ? `${PROXY}/public` : "https://public.coindcx.com";

const QUOTE = "USDT";
const PAIR_PREFIX = "B-";

export function toCoinDCXPair(symbol: string): string {
  // "BTCUSDT" -> "B-BTC_USDT"
  const base = symbol.endsWith(QUOTE) ? symbol.slice(0, -QUOTE.length) : symbol;
  return `${PAIR_PREFIX}${base}_${QUOTE}`;
}

export function fromCoinDCXPair(pair: string): string | null {
  // "B-BTC_USDT" -> "BTCUSDT"; anything not B-*_USDT is not scanned.
  if (!pair.startsWith(PAIR_PREFIX) || !pair.endsWith(`_${QUOTE}`)) return null;
  const base = pair.slice(PAIR_PREFIX.length, -(QUOTE.length + 1));
  return base ? `${base}${QUOTE}` : null;
}

interface CandleRaw {
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
  time: number; // open time, ms
}

interface CandlesResponse {
  s?: string;
  data?: CandleRaw[];
}

function parseCandle(c: CandleRaw): OHLC {
  return {
    openTime: Number(c.time),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume),
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Same retry policy as binance.ts: hard timeout per request via
 * AbortController, exponential backoff on 429 / 5xx / network errors, and
 * `Retry-After` honoured when present. A rate-limited or hung request is
 * retried instead of silently dropping the symbol from the scan.
 */
async function fetchWithRetry(
  url: string,
  {
    attempts = 5,
    baseDelayMs = 500,
    timeoutMs = 12000,
  }: { attempts?: number; baseDelayMs?: number; timeoutMs?: number } = {}
): Promise<Response | null> {
  let lastStatus = 0;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      lastStatus = res.status;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) return res;
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : baseDelayMs * 2 ** i + Math.random() * 250;
      if (i < attempts - 1) await sleep(waitMs);
    } catch {
      clearTimeout(timer);
      if (i < attempts - 1) await sleep(baseDelayMs * 2 ** i + Math.random() * 250);
    }
  }
  if (lastStatus) console.warn(`[coindcx] giving up on ${url} (last status ${lastStatus})`);
  return null;
}

// Daily symbol pin — same "only ever grows" behaviour as binance.ts, under
// its own localStorage prefix so the two venues never clean each other up.
const PINNED_KEY_PREFIX = "cpr_coindcx_symbols_";

function getTodayISTDate(): string {
  const now = new Date();
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return istDate.toISOString().slice(0, 10);
}

function getPinnedSymbols(): string[] | null {
  try {
    const stored = localStorage.getItem(PINNED_KEY_PREFIX + getTodayISTDate());
    return stored ? (JSON.parse(stored) as string[]) : null;
  } catch {
    return null;
  }
}

function setPinnedSymbols(symbols: string[]): void {
  try {
    const key = PINNED_KEY_PREFIX + getTodayISTDate();
    localStorage.setItem(key, JSON.stringify(symbols));
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PINNED_KEY_PREFIX) && k !== key)
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable — pin is a convenience, not required */
  }
}

function reconcilePinnedSymbols(currentSymbols: string[]): Set<string> {
  const pinned = getPinnedSymbols();
  const merged = new Set<string>(pinned ?? []);
  for (const s of currentSymbols) merged.add(s);
  if (!pinned || merged.size !== pinned.length) {
    setPinnedSymbols([...merged]);
  }
  return merged;
}

// Last successful universe, reused only if every retry of the (rarely
// changing) instrument list fails — same trade-off as binance.ts.
let cachedActiveSymbols: string[] | null = null;

/**
 * Tradable USDT-margined futures universe, as screener symbols (`BTCUSDT`).
 */
async function fetchActiveSymbols(): Promise<string[]> {
  const url =
    `${API_BASE}/exchange/v1/derivatives/futures/data/active_instruments` +
    `?margin_currency_short_name%5B%5D=${QUOTE}`;
  const res = await fetchWithRetry(url, { attempts: 6 });
  if (!res?.ok) {
    if (cachedActiveSymbols) {
      console.warn(
        `[coindcx] active_instruments unavailable (${res?.status ?? "network error"}) — ` +
          `reusing the last successful symbol universe (${cachedActiveSymbols.length} symbols).`
      );
      return cachedActiveSymbols;
    }
    throw new Error(
      `CoinDCX futures instrument list unavailable (${res?.status ?? "network error"}). ` +
        `Refusing to scan a partial symbol universe — retry in a moment.`
    );
  }

  const pairs: unknown = await res.json();
  if (!Array.isArray(pairs)) {
    throw new Error("CoinDCX futures instrument list returned an unexpected payload.");
  }

  const symbols: string[] = [];
  for (const p of pairs) {
    if (typeof p !== "string") continue;
    const sym = fromCoinDCXPair(p);
    if (!sym) continue;
    if (shouldExcludeSymbol(sym)) continue; // stablecoins + non-ASCII tickers
    symbols.push(sym);
  }

  cachedActiveSymbols = symbols;
  return symbols;
}

interface PriceRow {
  ls?: number | string;   // last price
  pc?: number | string;   // 24h change %
  v?: number | string;    // 24h volume
  mp?: number | string;   // mark price
  btST?: number | string; // time (ms) of the last tick behind this row
}

// A snapshot row whose last tick is older than this (relative to the
// snapshot's own timestamp) is a dead/halted instrument still listed with an
// old price (seen in practice: months-old rows). Using it would pair an old
// price with today's fresh open and fake a huge "change %", so such rows are
// ignored and the scan falls back to the latest candle close instead.
const MAX_TICK_AGE_MS = 60 * 60 * 1000;

/**
 * Last traded price per symbol from the futures real-time price snapshot.
 * Keys are screener symbols (`BTCUSDT`). Exported so the live-price refresh
 * hook can reuse it. Returns an empty map on failure — callers fall back to
 * the live candle's close, which is fetched in the same scan and therefore
 * never stale relative to the open price it is paired with.
 */
export async function fetchCoinDCXLastPrices(attempts = 4): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const res = await fetchWithRetry(
    `${PUBLIC_BASE}/market_data/v3/current_prices/futures/rt`,
    { attempts }
  );
  if (!res?.ok) {
    console.warn(
      `[coindcx] current prices unavailable (${res?.status ?? "network error"}) — ` +
        `falling back to the latest candle close.`
    );
    return out;
  }
  try {
    const body = await res.json();
    const rows: Record<string, PriceRow> = body?.prices ?? body ?? {};
    const snapshotTs = Number(body?.ts);
    const stale: string[] = [];
    for (const [pair, row] of Object.entries(rows)) {
      const sym = fromCoinDCXPair(pair);
      const last = Number(row?.ls);
      if (!sym || !Number.isFinite(last) || last <= 0) continue;
      const tickTs = Number(row?.btST);
      if (
        Number.isFinite(snapshotTs) &&
        Number.isFinite(tickTs) &&
        snapshotTs - tickTs > MAX_TICK_AGE_MS
      ) {
        stale.push(sym);
        continue;
      }
      out.set(sym, last);
    }
    if (stale.length) {
      console.warn(
        `[coindcx] ignored ${stale.length} stale price row(s) (last tick > 1h before snapshot):`,
        stale
      );
    }
  } catch {
    console.warn("[coindcx] current prices payload could not be parsed.");
  }
  return out;
}

/**
 * SINGLE SOURCE OF TRUTH for CoinDCX daily candles (mirrors
 * fetchDailyKlines in binance.ts). Returns candles oldest → newest. CoinDCX
 * daily candles open at UTC 00:00, so `isLiveDailyCandle` from binance.ts
 * applies unchanged.
 */
export async function fetchCoinDCXDailyKlines(
  symbol: string,
  limit = 6
): Promise<OHLC[] | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  // +2 days of slack so a missing candle doesn't leave us short of `limit`.
  const fromSec = nowSec - (limit + 2) * 24 * 60 * 60;
  const url =
    `${PUBLIC_BASE}/market_data/candlesticks?pair=${toCoinDCXPair(symbol)}` +
    `&from=${fromSec}&to=${nowSec}&resolution=1D&pcode=f`;

  const res = await fetchWithRetry(url);
  if (res?.ok) {
    try {
      const body: CandlesResponse = await res.json();
      if ((body.s === undefined || body.s === "ok") && Array.isArray(body.data)) {
        // Sort defensively: the spot candles endpoint returns newest-first,
        // the futures one has been seen oldest-first.
        const candles = body.data
          .map(parseCandle)
          .filter((c) => Number.isFinite(c.openTime) && Number.isFinite(c.close))
          .sort((a, b) => a.openTime - b.openTime)
          .slice(-limit);
        if (candles.length >= 2) return candles;
      }
    } catch {
      // malformed payload — fall through to the warning below
    }
  }
  console.warn(`[coindcx] no futures candles for ${symbol} — dropped from results`);
  return null;
}

async function fetchKlines(symbol: string): Promise<OHLC[] | null> {
  return fetchCoinDCXDailyKlines(symbol, 6);
}

// Bounded worker pool, same idea as binance.ts. Concurrency is lower than
// Binance's 10 because CoinDCX does not publish public rate limits for the
// market-data endpoints; raise it if scans prove stable.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker)
  );
  return results;
}

export async function runCoinDCXScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
  const [activeSymbols, lastPrices] = await Promise.all([
    fetchActiveSymbols(),
    fetchCoinDCXLastPrices(),
  ]);

  const pinnedSet = reconcilePinnedSymbols(activeSymbols);
  const symbols = activeSymbols.filter((s) => pinnedSet.has(s));

  const skipped: string[] = [];
  let done = 0;
  const CONCURRENCY = 6;

  const perSymbolResults = await mapWithConcurrency(symbols, CONCURRENCY, async (symbol) => {
    const klines = await fetchKlines(symbol);
    done++;
    onProgress(done, symbols.length, symbol);

    if (!klines || klines.length < 2) {
      skipped.push(symbol);
      return null;
    }

    const lastKline = klines[klines.length - 1];
    const lastKlineIsLive = isLiveDailyCandle(lastKline.openTime);

    let prevCandle: OHLC;
    let todayCandle: OHLC;
    let liveCandle: OHLC | null = null;
    let ppCandle: OHLC | null = null;

    if (lastKlineIsLive) {
      if (klines.length < 3) {
        skipped.push(symbol);
        return null;
      }
      prevCandle  = klines[klines.length - 3]; // 2 days ago (completed)
      todayCandle = klines[klines.length - 2]; // yesterday (completed) → today's CPR
      liveCandle  = lastKline;                  // today's forming candle (not used for CPR)
      if (klines.length >= 4) ppCandle = klines[klines.length - 4];
    } else {
      prevCandle  = klines[klines.length - 2];
      todayCandle = klines[klines.length - 1];
      liveCandle  = null;
      if (klines.length >= 3) ppCandle = klines[klines.length - 3];
    }

    const candleChain: OHLC[] = ppCandle
      ? [ppCandle, prevCandle, todayCandle]
      : [prevCandle, todayCandle];
    if (!candlesAreContiguous(candleChain)) {
      console.warn(
        `[coindcx] ${symbol} — daily candles are not contiguous ` +
          `(likely a relisting or trading-halt gap); keeping the symbol, ` +
          `but its OPrice/Move may be unreliable — worth spot-checking.`
      );
    }

    const openPriceUsed = liveCandle ? liveCandle.open : todayCandle.open;
    // Snapshot price when available; otherwise the newest candle's close
    // (fetched moments ago alongside the open, so never stale vs. OPrice).
    const newestCandle = liveCandle ?? todayCandle;
    const currentPrice = lastPrices.get(symbol) ?? newestCandle.close;
    const changeFromDayOpen = ((currentPrice - openPriceUsed) / openPriceUsed) * 100;

    // Approximate USDT volume: newest candle's base volume × price. This is
    // a display-only figure — it plays no part in CPR/pattern maths.
    const quoteVolume = newestCandle.volume * currentPrice;

    return analyzeCPR(
      symbol,
      candleChain,
      currentPrice,
      changeFromDayOpen,
      quoteVolume,
      openPriceUsed
    );
  });

  const results: CPRResult[] = perSymbolResults.filter((r): r is CPRResult => r !== null);

  if (skipped.length) {
    console.warn(
      `[coindcx] scanned ${symbols.length} symbols, ${results.length} analysed, ` +
        `${skipped.length} skipped for missing candle data:`,
      skipped
    );
  }

  return results;
}