import { OHLC, CPRResult, analyzeCPR } from "./cpr";
import { shouldExcludeSymbol } from "./symbolFilters";

// FUTURES/PERPS ONLY — Spot is no longer used anywhere in this file. The
// screener links every row to TradingView's perpetual chart
// (`BINANCE:<SYMBOL>.P`), so candles, the tradable-symbol universe, and 24h
// tickers must all come from the same USDⓈ-M Futures instrument. Mixing in
// Spot data (even just as a fallback) risks analysing a different
// instrument than the one being charted/linked.
const FBASE = "https://fapi.binance.com/fapi/v1";

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
    open:     parseFloat(k[1] as string),
    high:     parseFloat(k[2] as string),
    low:      parseFloat(k[3] as string),
    close:    parseFloat(k[4] as string),
    volume:   parseFloat(k[5] as string),
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * FIX (very slow scans): every fetch used to have no timeout at all. On a
 * flaky connection a single hung request could sit open for a very long
 * time (well past any sane wait), and — because the old scan loop awaited
 * a whole `Promise.all` batch of 10 before moving on — that one hang stalled
 * the other 9 requests in its batch right along with it. Every request now
 * gets a hard timeout via AbortController, so a stuck connection fails fast
 * and gets retried instead of silently stalling the whole scan.
 *
 * FIX (missing symbols): every network read now goes through one retrying
 * fetch. Binance answers a burst of parallel requests with 429 / 418 (and
 * occasionally 5xx) and the old code treated those as "no data" — the symbol
 * was silently dropped from the results instead of being retried. That is the
 * single biggest cause of the row count sagging between two scans minutes
 * apart with no error shown anywhere.
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
      // 429 = rate limited, 418 = banned-for-a-bit, 5xx = transient upstream.
      const retryable = res.status === 429 || res.status === 418 || res.status >= 500;
      if (!retryable) return res;
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : baseDelayMs * 2 ** i + Math.random() * 250;
      if (i < attempts - 1) await sleep(waitMs);
    } catch {
      // Includes AbortError (timeout) and genuine network errors — both are
      // transient, so retry with the same backoff as a 429/5xx.
      clearTimeout(timer);
      if (i < attempts - 1) await sleep(baseDelayMs * 2 ** i + Math.random() * 250);
    }
  }
  if (lastStatus) console.warn(`[binance] giving up on ${url} (last status ${lastStatus})`);
  return null;
}

const PINNED_KEY_PREFIX = "cpr_symbols_";

function getTodayISTDate(): string {
  const now = new Date();
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return istDate.toISOString().slice(0, 10);
}

function getPinnedSymbols(): string[] | null {
  const key = PINNED_KEY_PREFIX + getTodayISTDate();
  const stored = localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as string[]) : null;
}

function setPinnedSymbols(symbols: string[]): void {
  const key = PINNED_KEY_PREFIX + getTodayISTDate();
  localStorage.setItem(key, JSON.stringify(symbols));
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PINNED_KEY_PREFIX) && k !== key)
    .forEach((k) => localStorage.removeItem(k));
}

/**
 * FIX: Detect today's live (incomplete) daily candle using the UTC midnight
 * boundary — identical to TradingView's `high[1]` + `lookahead_off` behaviour.
 *
 * USDⓈ-M Futures resets daily candles at UTC 00:00.
 *
 * Exported so backtest.ts's history cache can also recognise (and refuse to
 * permanently freeze) a still-forming candle — see fetchBinanceHistory in
 * backtest.ts.
 */
export function isLiveDailyCandle(openTimeMs: number): boolean {
  const now = new Date();
  const utcMidnightToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return openTimeMs >= utcMidnightToday;
}

// FIX (intermittent "network error" abort — universe list only): a single
// transient blip on exchangeInfo used to throw and abort the *entire* scan
// (the "Refusing to scan a partial symbol universe" error). exchangeInfo
// only decides which symbols are tradable — it plays no part in price/%
// math — and that list changes rarely (new listing events), so a
// few-minutes-stale universe is a safe trade for "scan still works": this
// call gets extra retry attempts, and falls back to the last successful
// response (cached in module scope) only if every retry still fails.
//
// IMPORTANT: this fallback deliberately does NOT extend to fetchAllTickers.
// A ticker snapshot feeds `currentPrice` directly, while `openPrice` always
// comes fresh from fetchDailyKlines (never cached) — so reusing a stale
// ticker snapshot pairs an old lastPrice with a brand-new open price for
// every symbol in the scan, producing wildly wrong "change %" values across
// the whole table (e.g. a coin showing -70% because its cached lastPrice was
// from hours/days ago while its OPrice is today's real open). Price data
// must be correct or the scan should say so — never silently wrong — so
// fetchAllTickers keeps the original hard-fail behaviour; it only gets the
// extra retry attempts.
let cachedActiveSymbols: Set<string> | null = null;

/**
 * FUTURES/PERPS ONLY. The screener links every row to TradingView's
 * perpetual chart (`BINANCE:<SYMBOL>.P`), so the tradable universe is drawn
 * exclusively from USDⓈ-M Futures — Spot is never consulted, so a symbol
 * with no perpetual listing simply isn't scanned.
 */
async function fetchActiveSymbols(): Promise<Set<string>> {
  const futRes = await fetchWithRetry(`${FBASE}/exchangeInfo`, { attempts: 6 });
  if (!futRes?.ok) {
    if (cachedActiveSymbols) {
      console.warn(
        `[binance] exchangeInfo unavailable (${futRes?.status ?? "network error"}) — ` +
          `reusing the last successful symbol universe (${cachedActiveSymbols.size} symbols) for this scan.`
      );
      return cachedActiveSymbols;
    }
    throw new Error(
      `Binance futures exchangeInfo unavailable (${futRes?.status ?? "network error"}). ` +
        `Refusing to scan a partial symbol universe — retry in a moment.`
    );
  }

  const active = new Set<string>();

  const fut: {
    symbols: { symbol: string; status: string; contractType?: string }[];
  } = await futRes.json();
  for (const s of fut.symbols) {
    if (s.status !== "TRADING") continue;
    if (s.contractType && s.contractType !== "PERPETUAL") continue;
    active.add(s.symbol);
  }

  cachedActiveSymbols = active;
  return active;
}

/**
 * FUTURES/PERPS ONLY, mirroring fetchActiveSymbols. Perpetual 24h tickers
 * describe the same instrument whose klines we analyse and whose `.P`
 * chart we link to — Spot tickers are never consulted.
 *
 * FIX (wrong % change / stale prices): no stale-cache fallback here — see
 * the comment above `cachedActiveSymbols`. A failed fetch fails loudly
 * instead of silently pairing an old price snapshot with fresh open prices.
 */
async function fetchAllTickers(): Promise<Ticker24h[]> {
  const futRes = await fetchWithRetry(`${FBASE}/ticker/24hr`, { attempts: 6 });
  if (!futRes?.ok) {
    throw new Error(
      `Binance futures 24h tickers unavailable (${futRes?.status ?? "network error"}). ` +
        `Refusing to scan a partial symbol universe — retry in a moment.`
    );
  }

  const fut: Ticker24h[] = await futRes.json();
  return fut;
}

/**
 * FIX (missing symbols): `limit` no longer defaults to 500. Binance's
 * tradable USDT perpetual-futures universe is already north of 400 pairs and
 * still growing, so a 500 cap was quietly amputating the tail of the list every
 * single scan. Pass a number only if you deliberately want a top-N slice.
 */
export async function fetchTopUSDTSymbols(limit?: number): Promise<Ticker24h[]> {
  const [data, activeSymbols] = await Promise.all([
    fetchAllTickers(),
    fetchActiveSymbols(),
  ]);

  const filtered = data
    .filter(
      (t) =>
        activeSymbols.has(t.symbol) &&     // ← filters out delisted coins
        t.symbol.endsWith("USDT") &&
        !t.symbol.includes("DOWN") &&
        !t.symbol.includes("UP") &&
        !t.symbol.includes("BEAR") &&
        !t.symbol.includes("BULL") &&
        !shouldExcludeSymbol(t.symbol) &&  // excludes stablecoins + non-ASCII tickers
        parseFloat(t.quoteVolume) > 0
    )
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}

// FIX: bumped from 4 → 6. We need at least 3 COMPLETED daily candles
// available (pp / prev / today) plus room for the still-forming "live" candle
// on top of that (4 total in the worst case), so 4 was one candle short of
// ever having a pp-candle. 6 gives a comfortable safety margin (e.g. if
// Binance has a brief gap in daily data for a thinly-traded pair) while
// staying a cheap, single extra API page — well within rate limits.
//
// FUTURES/PERPS ONLY: always fetches from fapi. Rate-limited responses are
// retried with backoff rather than dropping the symbol from the scan, but
// there is no Spot fallback — a symbol with no perpetual listing (or one
// whose futures request keeps failing) is simply skipped, never silently
// analysed on Spot data.
/**
 * SINGLE SOURCE OF TRUTH for Binance daily candles.
 *
 * Every consumer (live screener, backtest, anything added later) must go
 * through this function so that retry/backoff on 429/418/5xx and kline
 * parsing exist in exactly one place. `limit` lets callers ask for the small
 * live window (6 candles) or a long history page (up to 1500 candles ≈ 4
 * years).
 */
export async function fetchDailyKlines(
  symbol: string,
  limit = 6
): Promise<OHLC[] | null> {
  const res = await fetchWithRetry(
    `${FBASE}/klines?symbol=${symbol}&interval=1d&limit=${limit}`
  );
  if (res?.ok) {
    try {
      const data: KlineRaw[] = await res.json();
      if (Array.isArray(data) && data.length >= 2) {
        return data.map(parseKline);
      }
    } catch {
      // malformed payload — fall through to the "no klines" warning below
    }
  }
  console.warn(`[binance] no futures klines for ${symbol} — dropped from results`);
  return null;
}

// FIX: bumped from 4 → 6 (see note above); thin wrapper over the shared
// fetcher so the live screener and the backtest cannot drift apart.
async function fetchKlines(symbol: string): Promise<OHLC[] | null> {
  return fetchDailyKlines(symbol, 6);
}

/**
 * FIX (missing symbols): the daily pin used to freeze whatever list the
 * FIRST scan of the IST day happened to produce. If that scan ran while a
 * venue was rate-limited, the short list stayed pinned for the rest of the
 * day and newly listed pairs never appeared. The pin now only ever grows: any
 * symbol currently tradable is merged in, while symbols pinned earlier today
 * are still kept so rows don't disappear mid-session.
 */
function reconcilePinnedSymbols(currentSymbols: string[]): Set<string> {
  const pinned = getPinnedSymbols();
  const merged = new Set<string>(pinned ?? []);
  for (const s of currentSymbols) merged.add(s);
  if (!pinned || merged.size !== pinned.length) {
    setPinnedSymbols([...merged]);
  }
  return merged;
}

/**
 * FIX (very slow scans): the old loop processed the universe in fixed
 * batches of 10 and always waited a flat 300ms after each batch — even when
 * every request in that batch had already come back in 50ms. Worse, one
 * slow/hung request in a batch blocked the other 9 from starting their
 * follow-up work (they'd all resolve, but the *next* batch of 10 couldn't
 * start until the whole `Promise.all` settled), so a handful of slow
 * symbols could stretch a scan out far longer than the sum of the actual
 * network time. A bounded worker pool instead keeps `concurrency` requests
 * continuously in flight — the moment one finishes, the next symbol starts
 * immediately, with no artificial pause and no batch-of-10 waiting on a
 * straggler. `fetchWithRetry`'s own timeout+retry logic still protects
 * against hammering Binance if a symbol keeps failing.
 */
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

export async function runScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
  // No limit: scan the full tradable USDT universe.
  const allTickers = await fetchTopUSDTSymbols();

  const pinnedSet = reconcilePinnedSymbols(allTickers.map((t) => t.symbol));
  // Only symbols with a live ticker can be analysed, but the pin no longer
  // shrinks the universe — it can only ever be a superset of past scans.
  const tickers = allTickers.filter((t) => pinnedSet.has(t.symbol));

  const skipped: string[] = [];
  let done = 0;
  const CONCURRENCY = 10;

  const perSymbolResults = await mapWithConcurrency(tickers, CONCURRENCY, async (t) => {
    const klines = await fetchKlines(t.symbol);
    done++;
    onProgress(done, tickers.length, t.symbol);

    if (!klines || klines.length < 2) {
      skipped.push(t.symbol);
      return null;
    }

    const lastKline = klines[klines.length - 1];

    // FIX: use UTC midnight boundary — matches TradingView high[1] lookahead_off
    const lastKlineIsLive = isLiveDailyCandle(lastKline.openTime);

    let prevCandle: OHLC;
    let todayCandle: OHLC;
    let liveCandle: OHLC | null = null;
    let ppCandle: OHLC | null = null;

    if (lastKlineIsLive) {
      if (klines.length < 3) {
        skipped.push(t.symbol);
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

    const currentPrice = parseFloat(t.lastPrice);
    // AFTER — always derive % from the same openPrice that's displayed
    const openPriceUsed = liveCandle ? liveCandle.open : todayCandle.open;
    const changeFromDayOpen = ((currentPrice - openPriceUsed) / openPriceUsed) * 100;

    const candlesForAnalysis: OHLC[] = ppCandle
      ? [ppCandle, prevCandle, todayCandle]
      : [prevCandle, todayCandle];

    return analyzeCPR(
      t.symbol,
      candlesForAnalysis,
      currentPrice,
      changeFromDayOpen,
      parseFloat(t.quoteVolume),
      liveCandle ? liveCandle.open : todayCandle.open
    );
  });

  const results: CPRResult[] = perSymbolResults.filter((r): r is CPRResult => r !== null);

  if (skipped.length) {
    console.warn(
      `[binance] scanned ${tickers.length} symbols, ${results.length} analysed, ` +
        `${skipped.length} skipped for missing candle data:`,
      skipped
    );
  }

  return results;
}
