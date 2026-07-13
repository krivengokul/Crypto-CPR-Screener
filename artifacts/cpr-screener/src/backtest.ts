import { OHLC, CPRResult, analyzeCPR } from "./cpr";
import { fetchTopUSDTSymbols } from "./binance";
import { fetchDeltaPerps } from "./delta";

export type BacktestSource = "binance" | "delta";

/**
 * A backtestable pattern needs a machine-readable target level, not just
 * the descriptive "Target" text in Screener.tsx's legend. Each entry here
 * pins down: which CPR level counts as "the target" for that pattern, and
 * whether price needs to go UP to it (bullish) or DOWN to it (bearish).
 *
 * v1 scope: only 2 patterns, chosen to exercise both target styles you'll
 * need later — "target = today's own CPR level" vs "target = previous
 * day's CPR level". Add more entries here once this is validated; each one
 * needs its target level worked out from that pattern's legend/condition.
 */
export interface BacktestTargetDef {
  key: string;          // matches passesPattern's pattern-key string exactly
  label: string;        // display name
  direction: "bullish" | "bearish";
  getTarget: (r: CPRResult) => number;
  targetLabel: string;  // e.g. "U4 (today's R4)"
}

export const BACKTEST_TARGETS: BacktestTargetDef[] = [
  {
    key: "littleabove",
    label: "LittleCPR Above",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  {
    key: "HA-U1>PU4",
    label: "U1 > Previous U4 (BigCPR Above)",
    direction: "bullish",
    targetLabel: "PU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
  },
];

export interface BacktestRow {
  symbol: string;
  source: BacktestSource;
  entryDate: string;               // YYYY-MM-DD (UTC) — the date the pattern was flagged
  todayCPR: CPRResult["todayCPR"];
  prevCPR: CPRResult["prevCPR"];
  targetLevel: number;
  targetLabel: string;
  result: "pass" | "fail" | "insufficient-data";
  hitDate: string | null;          // which day (entryDate or entryDate+1) hit target, if any
  daysToHit: 0 | 1 | null;
}

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches the 5-day window [D-3, D-2, D-1, D, D+1] of daily candles for a
 * Binance symbol, keyed by UTC date string. D-3/D-2/D-1 reconstruct the CPR
 * that would have been active on entry date D (same candle selection
 * runScreener uses live — pp/prev/today); D and D+1 are the lookahead
 * window used to check "target hit by end of the very next day".
 *
 * Reuses the same /klines endpoint runScreener already calls — just adds
 * the `endTime` param (which runScreener doesn't currently use, since it
 * only ever needs "now") to pin the window to a past date instead.
 */
async function fetchBinanceWindow(symbol: string, entryDateISO: string): Promise<Map<string, OHLC> | null> {
  const dPlus1 = addDaysISO(entryDateISO, 1);
  const endTimeMs = new Date(dPlus1 + "T23:59:59.999Z").getTime();
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&endTime=${endTimeMs}&limit=8`
    );
    if (!res.ok) return null;
    const raw: Array<[number, string, string, string, string, string]> = await res.json();
    if (!raw.length) return null;
    const map = new Map<string, OHLC>();
    for (const k of raw) {
      const openTime = k[0];
      map.set(utcDateKey(openTime), {
        openTime,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      });
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Same window, for Delta Exchange India symbols — reuses the same
 * history/candles endpoint runDeltaScreener calls live, just with
 * start/end pinned to the historical window instead of "last 8 days".
 */
async function fetchDeltaWindow(symbol: string, entryDateISO: string): Promise<Map<string, OHLC> | null> {
  const dMinus3 = addDaysISO(entryDateISO, -3);
  const dPlus1 = addDaysISO(entryDateISO, 1);
  const start = Math.floor(new Date(dMinus3 + "T00:00:00.000Z").getTime() / 1000);
  const end = Math.floor(new Date(dPlus1 + "T23:59:59.999Z").getTime() / 1000);
  try {
    const res = await fetch(
      `https://api.india.delta.exchange/v2/history/candles?symbol=${symbol}&resolution=1d&start=${start}&end=${end}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    let raw: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> | null = null;
    if (Array.isArray(data.result)) raw = data.result;
    else if (data.result && Array.isArray(data.result.candles)) raw = data.result.candles;
    else if (Array.isArray(data.candles)) raw = data.candles;
    else if (Array.isArray(data)) raw = data;
    if (!raw || !raw.length) return null;
    const map = new Map<string, OHLC>();
    for (const k of raw) {
      const openTimeMs = k.time > 1e10 ? k.time : k.time * 1000;
      map.set(utcDateKey(openTimeMs), {
        openTime: openTimeMs,
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume: Number(k.volume),
      });
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Backtests one symbol on one date:
 *   1. Reconstruct the CPR that would have been active on entryDate D
 *      (todayCPR from D-1's candle, prevCPR from D-2's, ppCPR from D-3's —
 *      identical candle selection to the live scanner).
 *   2. Check whether the pattern condition actually held on that date.
 *      If not, this symbol isn't part of the backtest for D — returns null,
 *      NOT a "fail" (fail is reserved for "matched the pattern but target
 *      wasn't hit").
 *   3. If it matched, check whether target was reached by end of D+1,
 *      using D's and D+1's high (bullish) or low (bearish).
 *
 * Returns null when there isn't enough candle history to evaluate at all
 * (e.g. symbol didn't exist yet, or D is too recent for D+1 data to exist).
 */
export async function backtestSymbolOnDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string,
  target: BacktestTargetDef,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean
): Promise<BacktestRow | null> {
  const dMinus3 = addDaysISO(entryDateISO, -3);
  const dMinus2 = addDaysISO(entryDateISO, -2);
  const dMinus1 = addDaysISO(entryDateISO, -1);
  const dPlus1 = addDaysISO(entryDateISO, 1);

  const window =
    source === "binance"
      ? await fetchBinanceWindow(symbol, entryDateISO)
      : await fetchDeltaWindow(symbol, entryDateISO);
  if (!window) return null;

  const ppCandle = window.get(dMinus3) ?? null;
  const prevCandle = window.get(dMinus2);
  const todayCandle = window.get(dMinus1);
  if (!prevCandle || !todayCandle) return null; // not enough history to reconstruct the CPR

  const candlesForAnalysis: OHLC[] = ppCandle ? [ppCandle, prevCandle, todayCandle] : [prevCandle, todayCandle];

  // currentPrice/change24h/quoteVolume aren't read by passesPattern for
  // either of the v1 target patterns, so placeholder values are fine here.
  const result = analyzeCPR(symbol, candlesForAnalysis, todayCandle.close, 0, 0, todayCandle.open);
  if (!result) return null;
  if (!passesPatternFn(result, target.key)) return null; // didn't match the pattern on this date

  const targetLevel = target.getTarget(result);
  const entryDayCandle = window.get(entryDateISO) ?? null;
  const nextDayCandle = window.get(dPlus1) ?? null;

  const hits = (c: OHLC | null) =>
    !!c && (target.direction === "bullish" ? c.high >= targetLevel : c.low <= targetLevel);

  let hitDate: string | null = null;
  let daysToHit: 0 | 1 | null = null;
  if (hits(entryDayCandle)) {
    hitDate = entryDateISO;
    daysToHit = 0;
  } else if (hits(nextDayCandle)) {
    hitDate = dPlus1;
    daysToHit = 1;
  }

  const outcome: BacktestRow["result"] =
    entryDayCandle || nextDayCandle ? (hitDate ? "pass" : "fail") : "insufficient-data";

  return {
    symbol,
    source,
    entryDate: entryDateISO,
    todayCPR: result.todayCPR,
    prevCPR: result.prevCPR,
    targetLevel,
    targetLabel: target.targetLabel,
    result: outcome,
    hitDate,
    daysToHit,
  };
}

/**
 * Runs the full symbol universe through backtestSymbolOnDate.
 *
 * KNOWN LIMITATION: the "universe" of symbols is fetched from the CURRENT
 * top-500-by-volume (Binance) / current perpetuals list (Delta) — not a
 * point-in-time snapshot of what was actively traded/liquid on entryDate.
 * A coin that's since been delisted, or one that's only recently become
 * liquid, won't be included even if it would have matched the pattern
 * historically. Fine for the v1 prove-out; flag if you need a true
 * point-in-time universe later (would need a separate historical-listings
 * source, which neither exchange's public API straightforwardly provides).
 */
export async function runBacktest(
  patternKey: string,
  entryDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<BacktestRow[]> {
  const target = BACKTEST_TARGETS.find((t) => t.key === patternKey);
  if (!target) throw new Error(`No backtest target defined yet for pattern "${patternKey}"`);

  const symbols: string[] =
    source === "binance"
      ? (await fetchTopUSDTSymbols(500)).map((t) => t.symbol)
      : (await fetchDeltaPerps()).map((t) => t.symbol);

  const rows: BacktestRow[] = [];
  const batchSize = 10;
  const delayMs = 300;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((sym) => backtestSymbolOnDate(sym, source, entryDateISO, target, passesPatternFn))
    );
    batchResults.forEach((r) => {
      if (r) rows.push(r);
    });
    onProgress?.(Math.min(i + batchSize, symbols.length), symbols.length, batch[batch.length - 1]);
    if (i + batchSize < symbols.length) await new Promise((res) => setTimeout(res, delayMs));
  }

  return rows;
}
