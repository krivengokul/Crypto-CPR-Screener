import { OHLC, CPRResult, analyzeCPR } from "./cpr";
import { analyzeBreakout, levelsFromCPR } from "./breakout";
import { safeSetItem } from "./safeStorage";
import { shouldExcludeSymbol } from "./symbolFilters";

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

function getPinnedSessionOpenMap(): SessionOpenMap | null {
  try {
    const key = DELTA_SESSION_OPEN_KEY_PREFIX + getTodayISTDate();
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as SessionOpenMap) : null;
  } catch {
    return null;
  }
}

function setPinnedSessionOpenMap(map: SessionOpenMap): void {
  const key = DELTA_SESSION_OPEN_KEY_PREFIX + getTodayISTDate();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(DELTA_SESSION_OPEN_KEY_PREFIX) && k !== key)
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
  // Quota-safe: a full localStorage must never abort a completed Delta scan.
  safeSetItem(key, JSON.stringify(map));
}

/**
 * ADK FIX: Use UTC midnight boundary to detect live (incomplete) daily candles.
 * Delta Exchange resets daily candles at UTC 00:00, same as TradingView.
 * This matches ADK's `high[1]` + `lookahead_off` behaviour exactly.
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

export async function fetchDeltaPerps(): Promise<DeltaTicker[]> {
  const all: DeltaTicker[] = [];
  let after: string | null = null;
  let pageNum = 0;

  while (true) {
    const url: string =
      `${BASE}/tickers?contract_types=perpetual_futures&page_size=500` +
      (after ? `&after=${encodeURIComponent(after)}` : "");

    const res: Response = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Delta ticker error: ${res.status}`);
    const data: any = await res.json();

    if (pageNum === 0) {
      console.log(
        "[Delta tickers DEBUG] meta:",
        JSON.stringify(data.meta ?? data.pagination ?? null)
      );
    }
    pageNum++;

    const page: DeltaTicker[] = (data.result ?? []) as DeltaTicker[];
    all.push(...page);

    const nextAfter: string | null =
      data.meta?.after ??
      data.meta?.cursor ??
      data.meta?.next_cursor ??
      data.pagination?.after ??
      data.pagination?.cursor ??
      null;

    if (!nextAfter || page.length === 0) break;
    after = nextAfter;
  }

  return all
  .filter((t) => !shouldExcludeSymbol(t.symbol)) // NEW: excludes stablecoins + non-ASCII tickers
  .sort((a, b) => (b.turnover_usd || 0) - (a.turnover_usd || 0));
}

const DELTA_QUOTE_SUFFIXES = ["USDT", "BUSD", "USDC", "USD", "INR"];

/** Base ticker of a Delta symbol ("AAPLXUSD" -> "AAPLX", "BTC_USDT" -> "BTC"). */
function deltaBaseOf(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.includes("_")) return upper.split("_")[0];
  for (const q of DELTA_QUOTE_SUFFIXES) {
    if (upper.length > q.length && upper.endsWith(q)) return upper.slice(0, -q.length);
  }
  return upper;
}

let _deltaBasesCache: { at: number; bases: Set<string> } | null = null;
let _deltaBasesInflight: Promise<Set<string>> | null = null;
const DELTA_BASES_TTL_MS = 10 * 60 * 1000;

/**
 * Base tickers currently listed on Delta, used by binance.ts to decide which
 * Binance TradFi perps to scan ("match Delta's list").
 *
 * Delta lists tokenized stocks with an "X" suffix on the base (AAPLXUSD), while
 * Binance uses the plain ticker (AAPLUSDT), so each base is added both as-is
 * and with one trailing "X" stripped. Never throws: on failure it returns the
 * last good set (or an empty one) so a Delta hiccup can't abort the Binance scan.
 */
export async function fetchDeltaBaseTickers(): Promise<Set<string>> {
  if (_deltaBasesCache && Date.now() - _deltaBasesCache.at < DELTA_BASES_TTL_MS) {
    return _deltaBasesCache.bases;
  }
  if (_deltaBasesInflight) return _deltaBasesInflight;
  _deltaBasesInflight = (async () => {
    try {
      const tickers = await fetchDeltaPerps();
      const bases = new Set<string>();
      for (const t of tickers) {
        const base = deltaBaseOf(t.symbol);
        if (!base) continue;
        bases.add(base);
        if (base.length > 2 && base.endsWith("X")) bases.add(base.slice(0, -1));
      }
      _deltaBasesCache = { at: Date.now(), bases };
      return bases;
    } catch (e) {
      console.warn("[delta] base-ticker fetch failed; TradFi matching uses last known set", e);
      return _deltaBasesCache?.bases ?? new Set<string>();
    } finally {
      _deltaBasesInflight = null;
    }
  })();
  return _deltaBasesInflight;
}

let _candleDebugLogged = false;

// ADK FIX: window bumped from 6 → 8 days. We need at least 3 COMPLETED daily
// candles available (pp / prev / today) plus room for the still-forming
// "live" candle on top of that, so a handful of extra days of buffer avoids
// ever coming up short (e.g. if the exchange has a brief gap in daily data
// for a thinly-traded pair). Cheap — this is one HTTP call per symbol either
// way, just asking for a slightly wider range.
async function fetchDeltaCandles(symbol: string): Promise<OHLC[] | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 8 * 86400;
    const res = await fetch(
      `${BASE}/history/candles?symbol=${symbol}&resolution=1d&start=${start}&end=${now}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();

    if (!_candleDebugLogged) {
      _candleDebugLogged = true;
      console.log(
        `[Delta candles DEBUG] symbol=${symbol} raw:`,
        JSON.stringify(data).slice(0, 500)
      );
    }

    let raw: DeltaCandle[] | null = null;

    if (Array.isArray(data.result)) {
      raw = data.result as DeltaCandle[];
    } else if (data.result && Array.isArray(data.result.candles)) {
      raw = data.result.candles as DeltaCandle[];
    } else if (Array.isArray(data.candles)) {
      raw = data.candles as DeltaCandle[];
    } else if (Array.isArray(data)) {
      raw = data as DeltaCandle[];
    }

    if (!raw || raw.length < 3) return null;

    raw.sort((a, b) => a.time - b.time);

    return raw.map((k) => ({
      openTime: k.time > 1e10 ? k.time : k.time * 1000,
      open:     Number(k.open),
      high:     Number(k.high),
      low:      Number(k.low),
      close:    Number(k.close),
      volume:   Number(k.volume),
    }));
  } catch {
    return null;
  }
}

/**
 * Closed 15m candles (~4 days) for the squeeze/breakout detector. Optional
 * data: null on any failure; never blocks the CPR scan. Drops the forming candle.
 */
async function fetchDeltaIntradayCandles(symbol: string): Promise<OHLC[] | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 4 * 86400;
    const res = await fetch(
      `${BASE}/history/candles?symbol=${symbol}&resolution=15m&start=${start}&end=${now}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const raw: DeltaCandle[] | null = Array.isArray(data.result)
      ? data.result
      : Array.isArray(data.result?.candles)
      ? data.result.candles
      : Array.isArray(data.candles)
      ? data.candles
      : null;
    if (!raw || raw.length < 2) return null;
    raw.sort((a, b) => a.time - b.time);
    const nowMs = Date.now();
    return raw
      .map((k) => ({
        openTime: k.time > 1e10 ? k.time : k.time * 1000,
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume: Number(k.volume),
      }))
      .filter((c) => c.openTime + 15 * 60 * 1000 <= nowMs);
  } catch {
    return null;
  }
}

export async function runDeltaScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
  _candleDebugLogged = false;

  const tickers = await fetchDeltaPerps();
  console.log(`[Delta] Fetched ${tickers.length} perpetual futures tickers`);

  const savedSessionMap = getPinnedSessionOpenMap() ?? {};
  const sessionOpenMap: SessionOpenMap = { ...savedSessionMap };

  const results: CPRResult[] = [];
  let nullCount = 0;
  const batchSize = 10;
  const delayMs = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const [candles, intraday] = await Promise.all([
          fetchDeltaCandles(t.symbol),
          fetchDeltaIntradayCandles(t.symbol),
        ]);
        if (!candles || candles.length < 3) { nullCount++; return null; }

        const lastCandle = candles[candles.length - 1];

        // ADK FIX: UTC midnight boundary — matches TradingView high[1] lookahead_off
        const lastCandleIsLive = isLiveDailyCandle(lastCandle.openTime);

        let prevCandle: OHLC;
        let todayCandle: OHLC;
        let todayLiveOpen: number | null = null;
        let liveHigh: number | null = null;
        let liveLow: number | null = null;
        // ADK FIX: pp candle — the completed daily candle immediately before
        // prevCandle. Needed for the "pWideAbove" sub-toggle. Previously this
        // was always undefined because only [prevCandle, todayCandle] was
        // ever forwarded to analyzeCPR, regardless of how many candles were
        // actually fetched (which was already generous here — up to ~8 days).
        let ppCandle: OHLC | null = null;

        if (lastCandleIsLive) {
          if (candles.length < 3) return null;
          prevCandle     = candles[candles.length - 3]; // 2 days ago (completed)
          todayCandle    = candles[candles.length - 2]; // yesterday (completed) → today's CPR
          todayLiveOpen  = lastCandle.open;              // today's forming candle open (fresh from API)
          liveHigh       = lastCandle.high;              // session extremes for the Pass latch
          liveLow        = lastCandle.low;
          if (candles.length >= 4) ppCandle = candles[candles.length - 4];
        } else {
          if (candles.length < 2) return null;
          prevCandle    = candles[candles.length - 2];
          todayCandle   = candles[candles.length - 1];
          // ADK FIX: use today's completed candle's open straight from the API
          // (matches binance.ts) instead of a stale localStorage-cached value.
          todayLiveOpen = todayCandle.open;
          if (candles.length >= 3) ppCandle = candles[candles.length - 3];
        }

        if (todayLiveOpen !== null) {
          sessionOpenMap[t.symbol] = todayLiveOpen;
        }

        const currentPrice = parseFloat(t.mark_price) || t.close;
        const changeFromDayOpen =
          todayLiveOpen !== null && todayLiveOpen > 0
            ? ((currentPrice - todayLiveOpen) / todayLiveOpen) * 100
            : parseFloat(t.ltp_change_24h);

        // ADK FIX: prepend ppCandle (when available) so analyzeCPR's
        // `candles[candles.length - 3]` lookup actually resolves to a real
        // completed candle instead of always being undefined.
        const candlesForAnalysis: OHLC[] = ppCandle
          ? [ppCandle, prevCandle, todayCandle]
          : [prevCandle, todayCandle];

        const cprResult = analyzeCPR(
          t.symbol,
          candlesForAnalysis,
          currentPrice,
          changeFromDayOpen,
          t.turnover_usd || 0,
          todayLiveOpen ?? undefined   // today's session open (5:30 AM IST) for OPrice display
        );
        if (cprResult && liveHigh !== null && liveLow !== null) {
          cprResult.todayHigh = Math.max(liveHigh, currentPrice);
          cprResult.todayLow = Math.min(liveLow, currentPrice);
        }
        if (cprResult && intraday) {
          try {
            cprResult.breakout = analyzeBreakout(intraday, levelsFromCPR(cprResult.todayCPR)) ?? undefined;
          } catch (e) {
            console.warn(`[delta] breakout analysis failed for ${t.symbol}`, e);
          }
        }
        return cprResult;
      })
    );

    batchResults.forEach((r) => { if (r) results.push(r); });

    onProgress(
      Math.min(i + batchSize, tickers.length),
      tickers.length,
      batch[batch.length - 1].symbol
    );

    if (i + batchSize < tickers.length) await sleep(delayMs);
  }

  console.log(
    `[Delta scan] total=${tickers.length} nullCandles=${nullCount} results=${results.length} matches=${results.filter((r) => r.passes).length}`
  );

  setPinnedSessionOpenMap(sessionOpenMap);
  return results;
}
