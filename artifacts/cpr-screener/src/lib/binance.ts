import { OHLC, CPRResult, analyzeCPR } from "./cpr";
import { shouldExcludeSymbol } from "./symbolFilters";

const BASE = "https://api.binance.com/api/v3";
// FIX: some pairs (e.g. UAIUSDT) only exist on USDⓈ-M Futures, never on
// Spot. Scanning Spot alone silently drops them from the universe.
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

/** Which venue a symbol's klines must be fetched from. */
type Venue = "spot" | "futures";
const venueOf = new Map<string, Venue>();

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
 * FIX (missing symbols): every network read now goes through one retrying
 * fetch. Binance answers a burst of parallel requests with 429 / 418 (and
 * occasionally 5xx) and the old code treated those as "no data" — the symbol
 * was silently dropped from the results instead of being retried. That is the
 * single biggest cause of the row count sagging between two scans minutes
 * apart with no error shown anywhere.
 */
async function fetchWithRetry(
  url: string,
  { attempts = 4, baseDelayMs = 500 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<Response | null> {
  let lastStatus = 0;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
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
      if (i < attempts - 1) await sleep(baseDelayMs * 2 ** i);
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
 * Both Binance Spot and USDⓈ-M Futures reset daily candles at UTC 00:00, so the
 * same check is valid for either venue.
 */
function isLiveDailyCandle(openTimeMs: number): boolean {
  const now = new Date();
  const utcMidnightToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return openTimeMs >= utcMidnightToday;
}

/**
 * FIX (venue priority): FUTURES-FIRST.
 *
 * The screener links every Binance row to TradingView's perpetual chart
 * (`BINANCE:<SYMBOL>.P`), so the candles we analyse must come from the same
 * instrument. USDⓈ-M perpetual wins on collision; Spot is only used for
 * symbols that are not listed on fapi at all.
 *
 * FIX (missing symbols): a venue that fails is now a hard error instead of
 * a silent half-universe. Previously, one 429 from fapi quietly reduced the
 * scan to Spot-only and ~170 perp-only pairs vanished with no warning.
 */
async function fetchActiveSymbols(): Promise<Set<string>> {
  const [spotRes, futRes] = await Promise.all([
    fetchWithRetry(`${BASE}/exchangeInfo`),
    fetchWithRetry(`${FBASE}/exchangeInfo`),
  ]);
  if (!spotRes?.ok || !futRes?.ok) {
    throw new Error(
      `Binance exchangeInfo unavailable (spot ${spotRes?.status ?? "network error"} / ` +
        `futures ${futRes?.status ?? "network error"}). Refusing to scan a partial ` +
        `symbol universe — retry in a moment.`
    );
  }

  const active = new Set<string>();
  venueOf.clear();

  // 1) Perpetual futures first — these are the authoritative candles.
  const fut: {
    symbols: { symbol: string; status: string; contractType?: string }[];
  } = await futRes.json();
  for (const s of fut.symbols) {
    if (s.status !== "TRADING") continue;
    if (s.contractType && s.contractType !== "PERPETUAL") continue;
    active.add(s.symbol);
    venueOf.set(s.symbol, "futures");
  }

  // 2) Spot fills in only the symbols with no perpetual listing.
  const spot: { symbols: { symbol: string; status: string }[] } = await spotRes.json();
  for (const s of spot.symbols) {
    if (s.status !== "TRADING") continue;
    active.add(s.symbol);
    if (!venueOf.has(s.symbol)) venueOf.set(s.symbol, "spot");
  }

  return active;
}

/**
 * FIX (venue priority): FUTURES-FIRST, mirroring fetchActiveSymbols.
 * Perpetual 24h tickers win on collision so last price / % change / volume
 * describe the same instrument whose klines we analyse and whose `.P` chart
 * we link to. Spot only supplies symbols with no perpetual listing.
 *
 * Also fails loudly when either venue is down — same reasoning as above.
 */
async function fetchAllTickers(): Promise<Ticker24h[]> {
  const [spotRes, futRes] = await Promise.all([
    fetchWithRetry(`${BASE}/ticker/24hr`),
    fetchWithRetry(`${FBASE}/ticker/24hr`),
  ]);
  if (!spotRes?.ok || !futRes?.ok) {
    throw new Error(
      `Binance 24h tickers unavailable (spot ${spotRes?.status ?? "network error"} / ` +
        `futures ${futRes?.status ?? "network error"}). Refusing to scan a partial ` +
        `symbol universe — retry in a moment.`
    );
  }

  const bySymbol = new Map<string, Ticker24h>();

  const fut: Ticker24h[] = await futRes.json();
  for (const t of fut) bySymbol.set(t.symbol, t);

  const spot: Ticker24h[] = await spotRes.json();
  for (const t of spot) if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, t);

  return [...bySymbol.values()];
}

/**
 * FIX (missing symbols): `limit` no longer defaults to 500. Binance's
 * tradable USDT universe (perp + spot union) is already north of 650 pairs and
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
// FIX: routes to fapi for futures-only symbols, and falls back to the
// other venue if the primary one returns nothing. Rate-limited responses are
// now retried with backoff rather than dropping the symbol from the scan.
/**
 * SINGLE SOURCE OF TRUTH for Binance daily candles.
 *
 * Every consumer (live screener, backtest, anything added later) must go
 * through this function so that venue resolution (futures-first, spot
 * fallback), retry/backoff on 429/418/5xx and kline parsing exist in exactly
 * one place. `limit` lets callers ask for the small live window (6 candles) or
 * a long history page (up to 1500 candles ≈ 4 years).
 */
export async function fetchDailyKlines(
  symbol: string,
  limit = 6
): Promise<OHLC[] | null> {
  // Futures-first: unknown symbols default to fapi, spot is the fallback.
  const primary = venueOf.get(symbol) === "spot" ? BASE : FBASE;
  const secondary = primary === BASE ? FBASE : BASE;

  for (const base of [primary, secondary]) {
    const res = await fetchWithRetry(
      `${base}/klines?symbol=${symbol}&interval=1d&limit=${limit}`
    );
    if (!res?.ok) continue;
    try {
      const data: KlineRaw[] = await res.json();
      if (!Array.isArray(data) || data.length < 2) continue;
      // Remember which venue actually answered so later calls skip the miss.
      venueOf.set(symbol, base === FBASE ? "futures" : "spot");
      return data.map(parseKline);
    } catch {
      // malformed payload — try the other venue
    }
  }
  console.warn(`[binance] no klines for ${symbol} — dropped from results`);
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

export async function runScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
  // No limit: scan the full tradable USDT universe.
  const allTickers = await fetchTopUSDTSymbols();

  const pinnedSet = reconcilePinnedSymbols(allTickers.map((t) => t.symbol));
  // Only symbols with a live ticker can be analysed, but the pin no longer
  // shrinks the universe — it can only ever be a superset of past scans.
  const tickers = allTickers.filter((t) => pinnedSet.has(t.symbol));

  const results: CPRResult[] = [];
  const skipped: string[] = [];
  const batchSize = 10;
  const delayMs = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const klines = await fetchKlines(t.symbol);
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
      })
    );

    batchResults.forEach((r) => { if (r) results.push(r); });

    const processed = Math.min(i + batchSize, tickers.length);
    onProgress(processed, tickers.length, batch[batch.length - 1].symbol);

    if (i + batchSize < tickers.length) await sleep(delayMs);
  }

  if (skipped.length) {
    console.warn(
      `[binance] scanned ${tickers.length} symbols, ${results.length} analysed, ` +
        `${skipped.length} skipped for missing candle data:`,
      skipped
    );
  }

  return results;
}
