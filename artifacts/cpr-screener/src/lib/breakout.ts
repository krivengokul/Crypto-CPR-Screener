import type { OHLC, CPRLevels } from "./cpr";

/**
 * Intraday (15m) squeeze + volume-breakout detection.
 *
 * A "signal" means: within the last `freshBars` CLOSED 15m candles there was a
 * bullish candle that (a) closed through at least one of today's pivot levels
 * or above the recent range high, (b) printed relative volume >= relVolMin, and
 * (c) came out of a recent compression (ATR and Bollinger width both low vs the
 * last 48h, OR ATR below tightAtrPctMax of price). Signals that have already run more than `maxRunPct`
 * since the breakout candle, or whose price fell back below the breakout
 * candle's open, are dropped (late / failed).
 *
 * Pure functions, no network. Pass CLOSED candles only, oldest -> newest.
 */

export interface BreakoutConfig {
  volLookback: number;      // candles used for average volume
  relVolMin: number;        // breakout candle volume >= this x average
  atrPeriod: number;
  atrBaseLookback: number;  // candles that define "normal" ATR
  atrRatioMax: number;      // compressed if ATR <= this x normal ATR ...
  tightAtrPctMax: number;   // ... or if ATR is below this % of price (catches coins flat for days, where relative tests read "normal")
  bbPeriod: number;
  bbPctileLookback: number;
  bbPctileMax: number;      // compressed if BB width percentile <= this
  squeezeWindow: number;    // candles before the breakout that must contain a squeeze
  freshBars: number;        // how many recent closed candles may hold the breakout
  maxRunPct: number;        // ignore if price already ran this % past the breakout close
}

export const DEFAULT_BREAKOUT_CFG: BreakoutConfig = {
  volLookback: 20,
  relVolMin: 4,
  atrPeriod: 14,
  atrBaseLookback: 192,  // 48h of 15m candles
  atrRatioMax: 0.6,
  tightAtrPctMax: 0.4,
  bbPeriod: 20,
  bbPctileLookback: 192,
  bbPctileMax: 15,
  squeezeWindow: 12,     // 3h
  freshBars: 8,          // 2h
  maxRunPct: 15,
};

export interface BreakoutResult {
  /** Fresh, not-yet-extended squeeze breakout on the 15m chart. */
  signal: boolean;
  /** Closed 15m candles since the breakout candle (0 = latest closed). null if no signal. */
  barsAgo: number | null;
  /** Epoch ms of the breakout candle's open. null if no signal. */
  breakoutTime: number | null;
  /** Breakout candle volume / average of the prior volLookback candles (latest candle if no signal). */
  relVol: number;
  /** Pivot levels the breakout candle closed through, e.g. ["R1","R2"]. */
  levelsCleared: string[];
  /** Breakout candle closed above the squeeze-window high. */
  rangeBreak: boolean;
  /** % move from the breakout candle's close to the latest close. */
  runPct: number | null;
  /** Price is currently coiled: a squeeze occurred within the last squeezeWindow candles. */
  squeezeNow: boolean;
  /** ATR now / normal ATR (latest closed candle). */
  atrRatio: number;
  /** Bollinger-width percentile (latest closed candle), 0-100. */
  bbPctile: number;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

function atrSeries(c: OHLC[], period: number): number[] {
  const out: number[] = new Array(c.length).fill(NaN);
  if (c.length < period) return out;
  const tr = c.map((k, i) =>
    i === 0
      ? k.high - k.low
      : Math.max(k.high - k.low, Math.abs(k.high - c[i - 1].close), Math.abs(k.low - c[i - 1].close))
  );
  out[period - 1] = mean(tr.slice(0, period));
  for (let i = period; i < c.length; i++) out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  return out;
}

function bbWidthSeries(c: OHLC[], period: number): number[] {
  const out: number[] = new Array(c.length).fill(NaN);
  for (let i = period - 1; i < c.length; i++) {
    const w = c.slice(i - period + 1, i + 1).map((k) => k.close);
    const m = mean(w);
    const sd = Math.sqrt(mean(w.map((x) => (x - m) ** 2)));
    out[i] = m > 0 ? (4 * sd) / m : NaN; // (upper - lower) / mid at 2 std devs
  }
  return out;
}

function percentRank(window: number[], value: number): number {
  const v = window.filter((x) => !Number.isNaN(x));
  if (!v.length || Number.isNaN(value)) return NaN;
  return (v.filter((x) => x <= value).length / v.length) * 100;
}

/** Pivot levels the breakout is tested against, taken from today's CPR set. */
export function levelsFromCPR(c: CPRLevels): Record<string, number> {
  const raw: Record<string, number> = {
    PDH: c.prevHigh,
    TC: c.tc,
    R1: c.r1,
    R2: c.r2,
    R3: c.r3,
    R4: c.r4,
  };
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (Number.isFinite(v) && v > 0) out[k] = v;
  return out;
}

export function analyzeBreakout(
  candles: OHLC[],
  levels: Record<string, number>,
  cfg: BreakoutConfig = DEFAULT_BREAKOUT_CFG
): BreakoutResult | null {
  const n = candles.length;
  const warm = Math.max(cfg.atrBaseLookback, cfg.bbPctileLookback) + Math.max(cfg.atrPeriod, cfg.bbPeriod);
  const minI = warm + cfg.squeezeWindow + 1;
  if (n <= minI) return null;

  const atr = atrSeries(candles, cfg.atrPeriod);
  const bbw = bbWidthSeries(candles, cfg.bbPeriod);

  // Squeeze state per candle j, computed lazily.
  const sqCache: (null | { sq: boolean; atrRatio: number; bbP: number })[] = new Array(n).fill(null);
  const squeezeAt = (j: number) => {
    const hit = sqCache[j];
    if (hit) return hit;
    const base = mean(atr.slice(j - cfg.atrBaseLookback + 1, j + 1).filter((x) => !Number.isNaN(x)));
    const atrRatio = base > 0 ? atr[j] / base : NaN;
    const bbP = percentRank(bbw.slice(j - cfg.bbPctileLookback + 1, j + 1), bbw[j]);
    const atrPct = (atr[j] / candles[j].close) * 100;
    const relativelyQuiet = atrRatio <= cfg.atrRatioMax && bbP <= cfg.bbPctileMax;
    const absolutelyTight = atrPct <= cfg.tightAtrPctMax;
    const res = { sq: relativelyQuiet || absolutelyTight, atrRatio, bbP };
    sqCache[j] = res;
    return res;
  };
  // Was there a squeeze in the squeezeWindow candles ending at candle `end` (inclusive)?
  const squeezedBefore = (end: number) => {
    for (let j = end; j > end - cfg.squeezeWindow; j--) if (squeezeAt(j).sq) return true;
    return false;
  };

  const last = candles[n - 1];
  const relVolAt = (i: number) => {
    const avg = mean(candles.slice(i - cfg.volLookback, i).map((k) => k.volume));
    return avg > 0 ? candles[i].volume / avg : 0;
  };

  const lastSq = squeezeAt(n - 1);
  const squeezeNow = squeezedBefore(n - 1);

  // Most recent qualifying breakout candle within the fresh window.
  for (let i = n - 1; i >= Math.max(minI, n - 1 - cfg.freshBars); i--) {
    const c = candles[i];
    if (!(c.close > c.open)) continue; // bullish only
    const relVol = relVolAt(i);
    if (relVol < cfg.relVolMin) continue;
    if (!squeezedBefore(i - 1)) continue;

    const prevClose = candles[i - 1].close;
    const levelsCleared = Object.entries(levels)
      .filter(([, lvl]) => prevClose <= lvl && c.close > lvl)
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
    const rangeHigh = Math.max(...candles.slice(i - cfg.squeezeWindow, i).map((k) => k.high));
    const rangeBreak = c.close > rangeHigh;
    if (!levelsCleared.length && !rangeBreak) continue;

    const runPct = (last.close / c.close - 1) * 100;
    if (runPct > cfg.maxRunPct) continue; // already extended
    if (last.close < c.open) continue;    // breakout failed

    return {
      signal: true,
      barsAgo: n - 1 - i,
      breakoutTime: c.openTime,
      relVol,
      levelsCleared,
      rangeBreak,
      runPct,
      squeezeNow,
      atrRatio: lastSq.atrRatio,
      bbPctile: lastSq.bbP,
    };
  }

  return {
    signal: false,
    barsAgo: null,
    breakoutTime: null,
    relVol: relVolAt(n - 1),
    levelsCleared: [],
    rangeBreak: false,
    runPct: null,
    squeezeNow,
    atrRatio: lastSq.atrRatio,
    bbPctile: lastSq.bbP,
  };
}
