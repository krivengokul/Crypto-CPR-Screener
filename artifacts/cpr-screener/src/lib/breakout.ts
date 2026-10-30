import type { OHLC, CPRLevels } from "./cpr";

/**
 * Intraday (15m) momentum-breakout detection ("BRK").
 *
 * A "signal" means: within the last `freshBars` candles there was a bullish
 * candle that (a) closed through at least one of today's pivot levels (or
 * above the recent range high) and (b) printed relative volume >= relVolMin
 * versus the prior `volLookback` candles. There is NO squeeze / compression
 * requirement: a coin that is already trending and then explodes on volume
 * qualifies. Signals that have already run more than `maxRunPct` since the
 * breakout candle, or whose price fell back below the breakout candle's open,
 * are dropped (late / failed).
 *
 * Pure functions, no network. Candles are oldest -> newest. The scan passes
 * CLOSED candles only; the live refresh also passes the still-forming last
 * candle so a spike is flagged as it happens (its volume so far already has
 * to clear relVolMin, which is a stricter test than a finished candle).
 */

export interface BreakoutConfig {
  volLookback: number;      // candles used for average volume
  relVolMin: number;        // breakout candle volume >= this x average
  rangeWindow: number;      // candles before the breakout candle that define the range high
  freshBars: number;        // how many recent candles may hold the breakout
  maxRunPct: number;        // ignore if price already ran this % past the breakout close
}

export const DEFAULT_BREAKOUT_CFG: BreakoutConfig = {
  volLookback: 20,
  relVolMin: 4,
  rangeWindow: 12,       // 3h
  freshBars: 8,          // 2h
  maxRunPct: 30,
};

export interface BreakoutResult {
  /** Fresh, not-yet-exhausted momentum breakout on the 15m chart. */
  signal: boolean;
  /** Candles since the breakout candle (0 = latest candle). null if no signal. */
  barsAgo: number | null;
  /** Epoch ms of the breakout candle's open. null if no signal. */
  breakoutTime: number | null;
  /** Breakout candle volume / average of the prior volLookback candles (latest candle if no signal). */
  relVol: number;
  /** Pivot levels the breakout candle closed through, e.g. ["R1","R2"]. */
  levelsCleared: string[];
  /** Breakout candle closed above the range-window high. */
  rangeBreak: boolean;
  /** % move from the breakout candle's close to the latest close. null if no signal. */
  runPct: number | null;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

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
  const minI = Math.max(cfg.volLookback, cfg.rangeWindow);
  if (n <= minI + 1) return null;

  const last = candles[n - 1];
  const relVolAt = (i: number) => {
    const avg = mean(candles.slice(i - cfg.volLookback, i).map((k) => k.volume));
    return avg > 0 ? candles[i].volume / avg : 0;
  };

  // Most recent qualifying breakout candle within the fresh window.
  for (let i = n - 1; i >= Math.max(minI, n - 1 - cfg.freshBars); i--) {
    const c = candles[i];
    if (!(c.close > c.open)) continue; // bullish only
    const relVol = relVolAt(i);
    if (relVol < cfg.relVolMin) continue;

    const prevClose = candles[i - 1].close;
    const levelsCleared = Object.entries(levels)
      .filter(([, lvl]) => prevClose <= lvl && c.close > lvl)
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
    const rangeHigh = Math.max(...candles.slice(i - cfg.rangeWindow, i).map((k) => k.high));
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
  };
}
