import type { OHLC, CPRLevels } from "./cpr";

/**
 * Intraday (15m) momentum-breakout ("BRK") and breakdown ("BRKDN") detection.
 *
 * BRK: bullish candle closes up through PDH / TC / R1–R4 (or range high) on volume.
 * BRKDN: bearish candle closes down through PDL / BC / S1–S4 (or range low) on volume.
 *
 * Pure functions, no network. Candles are oldest → newest.
 */

export interface BreakoutConfig {
  volLookback: number;
  relVolMin: number;
  rangeWindow: number;
  freshBars: number;
  maxRunPct: number;
}

export const DEFAULT_BREAKOUT_CFG: BreakoutConfig = {
  volLookback: 20,
  relVolMin: 4,
  rangeWindow: 12, // 3h
  freshBars: 8, // 2h
  maxRunPct: 30,
};

export interface BreakoutResult {
  /** Fresh, not-yet-exhausted momentum signal on the 15m chart. */
  signal: boolean;
  /** Candles since the signal candle (0 = latest). null if no signal. */
  barsAgo: number | null;
  /** Epoch ms of the signal candle open, or null. */
  breakoutTime: number | null;
  /** Relative volume of the signal candle vs prior lookback average. */
  relVol: number;
  /** Pivot levels the candle closed through, e.g. ["R1","R2"] or ["S1","S2"]. */
  levelsCleared: string[];
  /** Closed beyond the recent range high (up) or range low (down). */
  rangeBreak: boolean;
  /** % move from signal close to latest close. null if no signal. */
  runPct: number | null;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

/** Upside levels for BRK. */
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

/** Downside levels for BRKDN. */
export function levelsFromCPRDown(c: CPRLevels): Record<string, number> {
  const raw: Record<string, number> = {
    PDL: c.prevLow,
    BC: c.bc,
    S1: c.s1,
    S2: c.s2,
    S3: c.s3,
    S4: c.s4,
  };
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (Number.isFinite(v) && v > 0) out[k] = v;
  return out;
}

export function analyzeBreakout(
  candles: OHLC[],
  levels: Record<string, number>,
  cfg: BreakoutConfig = DEFAULT_BREAKOUT_CFG,
): BreakoutResult | null {
  const n = candles.length;
  const minI = Math.max(cfg.volLookback, cfg.rangeWindow);
  if (n <= minI + 1) return null;

  const last = candles[n - 1];
  const relVolAt = (i: number) => {
    const avg = mean(candles.slice(i - cfg.volLookback, i).map((k) => k.volume));
    return avg > 0 ? candles[i].volume / avg : 0;
  };

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
    if (runPct > cfg.maxRunPct) continue;
    if (last.close < c.open) continue;

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

/**
 * Mirrored breakdown detector: bearish 15m candle closes down through
 * PDL / BC / S1–S4 (or the recent range low) on elevated volume.
 */
export function analyzeBreakdown(
  candles: OHLC[],
  levels: Record<string, number>,
  cfg: BreakoutConfig = DEFAULT_BREAKOUT_CFG,
): BreakoutResult | null {
  const n = candles.length;
  const minI = Math.max(cfg.volLookback, cfg.rangeWindow);
  if (n <= minI + 1) return null;

  const last = candles[n - 1];
  const relVolAt = (i: number) => {
    const avg = mean(candles.slice(i - cfg.volLookback, i).map((k) => k.volume));
    return avg > 0 ? candles[i].volume / avg : 0;
  };

  for (let i = n - 1; i >= Math.max(minI, n - 1 - cfg.freshBars); i--) {
    const c = candles[i];
    if (!(c.close < c.open)) continue; // bearish only
    const relVol = relVolAt(i);
    if (relVol < cfg.relVolMin) continue;

    const prevClose = candles[i - 1].close;
    // Closing down through levels (prev was at/above, close below).
    const levelsCleared = Object.entries(levels)
      .filter(([, lvl]) => prevClose >= lvl && c.close < lvl)
      .sort((a, b) => b[1] - a[1]) // higher levels first (S1 before S4 when going down)
      .map(([name]) => name);
    const rangeLow = Math.min(...candles.slice(i - cfg.rangeWindow, i).map((k) => k.low));
    const rangeBreak = c.close < rangeLow;
    if (!levelsCleared.length && !rangeBreak) continue;

    // runPct negative when price continued lower after the breakdown candle.
    const runPct = (last.close / c.close - 1) * 100;
    if (runPct < -cfg.maxRunPct) continue; // already extended too far down
    if (last.close > c.open) continue; // breakdown failed (reclaimed)

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


/** Strong single 15m bar (outlier body vs recent average) — not parabolic. */
export interface StrongBarResult {
  signal: boolean;
  /** green = BIG↑, red = BIG↓ */
  side: "up" | "down";
  /** body / avgBody of prior lookback bars */
  bodyMult: number;
  /** range / avgRange of prior lookback bars */
  rangeMult: number;
  /** body / range of the signal bar */
  bodyFrac: number;
  /** "body" = fat body rule; "range" = wick/spike range rule */
  via: "body" | "range";
  /** Candles since signal (0 = latest closed). */
  barsAgo: number;
}

export interface StrongBarConfig {
  lookback: number;
  bodyMultMin: number;
  minBodyFrac: number;
  /** High–low vs prior average range (catches wick spikes like MAGMA/FOGO). */
  rangeMultMin: number;
  /** Only flag bars within this many closed candles of the end. */
  freshBars: number;
}

export const DEFAULT_STRONG_BAR_CFG: StrongBarConfig = {
  lookback: 20,
  bodyMultMin: 2.5,
  minBodyFrac: 0.55,
  rangeMultMin: 2.5,
  freshBars: 4,
};

/**
 * Detect an unusually large 15m bar (closed candles only).
 * Passes if either:
 *   - fat body: body ≥ bodyMultMin × avg body AND body ≥ minBodyFrac of range
 *   - range spike: range ≥ rangeMultMin × avg range (wick-dominated spikes)
 */
export function analyzeStrongBar(
  candles: OHLC[],
  cfg: StrongBarConfig = DEFAULT_STRONG_BAR_CFG,
): StrongBarResult | null {
  if (!candles || candles.length < cfg.lookback + 2) return null;
  const closed = candles;

  const from = Math.max(cfg.lookback, closed.length - cfg.freshBars);
  let best: StrongBarResult | null = null;

  for (let i = from; i < closed.length; i++) {
    const c = closed[i];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (!(range > 0)) continue;

    const prior = closed.slice(i - cfg.lookback, i);
    const avgBody =
      prior.reduce((s, x) => s + Math.abs(x.close - x.open), 0) / prior.length;
    const avgRange =
      prior.reduce((s, x) => s + Math.max(0, x.high - x.low), 0) / prior.length;
    if (!(avgBody > 0) || !(avgRange > 0)) continue;

    const bodyMult = body / avgBody;
    const rangeMult = range / avgRange;
    const bodyFrac = body / range;

    const fatBody =
      bodyMult >= cfg.bodyMultMin && bodyFrac >= cfg.minBodyFrac;
    const rangeSpike = rangeMult >= cfg.rangeMultMin;
    if (!fatBody && !rangeSpike) continue;

    // Direction: body bias when fat body; otherwise which wick dominates the range
    let side: "up" | "down";
    if (fatBody) {
      side = c.close >= c.open ? "up" : "down";
    } else {
      const mid = (c.open + c.close) / 2;
      side = c.high - mid >= mid - c.low ? "up" : "down";
    }

    const barsAgo = closed.length - 1 - i;
    const candidate: StrongBarResult = {
      signal: true,
      side,
      bodyMult,
      rangeMult,
      bodyFrac,
      via: fatBody ? "body" : "range",
      barsAgo,
    };
    const score = (x: StrongBarResult) =>
      Math.max(x.bodyMult, x.rangeMult);
    if (
      !best ||
      candidate.barsAgo < best.barsAgo ||
      (candidate.barsAgo === best.barsAgo && score(candidate) > score(best))
    ) {
      best = candidate;
    }
  }
  return best;
}
