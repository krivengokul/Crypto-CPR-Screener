import { OHLC, CPRResult, analyzeCPR } from "./cpr";
import { shouldExcludeSymbol } from "./symbolFilters";

const BASE = "https://api.binance.com/api/v3";
// ADK FIX: some pairs (e.g. UAIUSDT) only exist on USDⓈ-M Futures, never on
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
 * ADK FIX: Detect today's live (incomplete) daily candle using the UTC midnight
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
 * ADK FIX (venue priority): FUTURES-FIRST.
 *
 * The screener links every Binance row to TradingView's perpetual chart
 * (`BINANCE:<SYMBOL>.P`), so the candles we analyse must come from the same
 * instrument. USDⓈ-M perpetual wins on collision; Spot is only used for
 * symbols that are not listed on fapi at all. Both venues reset daily candles
 * at UTC 00:00, so isLiveDailyCandle() is unaffected.
 */
async function fetchActiveSymbols(): Promise<Set<string>> {
  const [spotRes, futRes] = await Promise.all([
    fetch(`${BASE}/exchangeInfo`),
    fetch(`${FBASE}/exchangeInfo`),
  ]);
  if (!spotRes.ok && !futRes.ok) {
    throw new Error(`Binance exchangeInfo error: spot ${spotRes.status} / futures ${futRes.status}`);
  }

  const active = new Set<string>();
  venueOf.clear();

  // 1) Perpetual futures first — these are the authoritative candles.
  if (futRes.ok) {
    const fut: {
      symbols: { symbol: string; status: string; contractType?: string }[];
    } = await futRes.json();
    for (const s of fut.symbols) {
      if (s.status !== "TRADING") continue;
      if (s.contractType && s.contractType !== "PERPETUAL") continue;
      active.add(s.symbol);
      venueOf.set(s.symbol, "futures");
    }
  }

  // 2) Spot fills in only the symbols with no perpetual listing.
  if (spotRes.ok) {
    const spot: { symbols: { symbol: string; status: string }[] } = await spotRes.json();
    for (const s of spot.symbols) {
      if (s.status !== "TRADING") continue;
      active.add(s.symbol);
      if (!venueOf.has(s.symbol)) venueOf.set(s.symbol, "spot");
    }
  }

  return active;
}

/**
 * ADK FIX (venue priority): FUTURES-FIRST, mirroring fetchActiveSymbols.
 * Perpetual 24h tickers win on collision so last price / % change / volume
 * describe the same instrument whose klines we analyse and whose `.P` chart
 * we link to. Spot only supplies symbols with no perpetual listing.
 */
async function fetchAllTickers(): Promise<Ticker24h[]> {
  const [spotRes, futRes] = await Promise.all([
    fetch(`${BASE}/ticker/24hr`),
    fetch(`${FBASE}/ticker/24hr`),
  ]);
  if (!spotRes.ok && !futRes.ok) {
    throw new Error(`Binance ticker error: spot ${spotRes.status} / futures ${futRes.status}`);
  }

  const bySymbol = new Map<string, Ticker24h>();

  if (futRes.ok) {
    const fut: Ticker24h[] = await futRes.json();
    for (const t of fut) bySymbol.set(t.symbol, t);
  }

  if (spotRes.ok) {
    const spot: Ticker24h[] = await spotRes.json();
    for (const t of spot) if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, t);
  }

  return [...bySymbol.values()];
}

export async function fetchTopUSDTSymbols(limit = 500): Promise<Ticker24h[]> {
  const [data, activeSymbols] = await Promise.all([
    fetchAllTickers(),
    fetchActiveSymbols(),
  ]);

  return data
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
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, limit);
}

// ADK FIX: bumped from 4 → 6. We need at least 3 COMPLETED daily candles
// available (pp / prev / today) plus room for the still-forming "live" candle
// on top of that (4 total in the worst case), so 4 was one candle short of
// ever having a pp-candle. 6 gives a comfortable safety margin (e.g. if
// Binance has a brief gap in daily data for a thinly-traded pair) while
// staying a cheap, single extra API page — well within rate limits.
//
// ADK FIX: routes to fapi for futures-only symbols, and falls back to the
// other venue if the primary one returns nothing.
async function fetchKlines(symbol: string): Promise<OHLC[] | null> {
  // Futures-first: unknown symbols default to fapi, spot is the fallback.
  const primary = venueOf.get(symbol) === "spot" ? BASE : FBASE;
  const secondary = primary === BASE ? FBASE : BASE;

  for (const base of [primary, secondary]) {
    try {
      const res = await fetch(`${base}/klines?symbol=${symbol}&interval=1d&limit=6`);
      if (!res.ok) continue;
      const data: KlineRaw[] = await res.json();
      if (data.length < 2) continue;
      return data.map(parseKline);
    } catch {
      // try the other venue
    }
  }
  return null;
}

export async function runScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
  const allTickers = await fetchTopUSDTSymbols(500);

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
        const klines = await fetchKlines(t.symbol);
        if (!klines || klines.length < 2) return null;

        const lastKline = klines[klines.length - 1];

        // ADK FIX: use UTC midnight boundary — matches TradingView high[1] lookahead_off
        const lastKlineIsLive = isLiveDailyCandle(lastKline.openTime);

        let prevCandle: OHLC;
        let todayCandle: OHLC;
        let liveCandle: OHLC | null = null;
        let ppCandle: OHLC | null = null;

        if (lastKlineIsLive) {
          if (klines.length < 3) return null;
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

  return results;
}
