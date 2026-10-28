import type { OHLC } from "./cpr";
import { safeSetItem } from "./safeStorage.ts";

type FifteenMinuteSource = "binance" | "delta";

const DELTA_BASE = "https://api.india.delta.exchange/v2";
const CANDLE_INTERVAL_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 8;
const PREVIOUS_UPEX_CACHE_KEY = "cpr_previous_upex_results_v7";
const PREVIOUS_15M_B_CACHE_KEY = "cpr_previous_15m_b_results_v3";
const PREVIOUS_15M_TC_B_CACHE_KEY = "cpr_previous_15m_tc_b_results_v9";
const PREVIOUS_15M_MOMENTUM_B_CACHE_KEY = "cpr_previous_15m_momentum_b_results_v3";
const PREVIOUS_15M_CONSOLIDATE_A_CACHE_KEY = "cpr_previous_15m_consolidate_a_results_v9";
const PREVIOUS_15M_PP_CONSOLIDATE_A_CACHE_KEY = "cpr_previous_15m_pp_consolidate_a_results_v1";
const PREVIOUS_15M_INSIDE_R1S1_CACHE_KEY = "cpr_previous_15m_inside_r1s1_results_v3";

export interface UpexCandidate {
  symbol: string;
  source: FifteenMinuteSource;
  bc: number;
  /**
   * Lower bound used by the PD-15M-Below-BC and PD-15M-Below-TC checks (see
   * passesPrevious15MBFilter / passesPD15MBelowTCFilter): the lower of the
   * previous CPR's Prev Low (PL) and S1. Optional because MOMENTUM-A doesn't
   * use it.
   */
  floor?: number;
  /** Upper bound used by CONSOLIDATE-A: the higher of previous CPR Prev High (PH) and R1. */
  ceiling?: number;
  /**
   * R2 of the previous session — CON-A fails (→ MOM-A) when a first-crossing
   * or new-high 15m candle has open/close at or above this level.
   */
  r2?: number;
  /**
   * S2 of the previous session — CON-B fails (→ MOM-B) when a first-crossing
   * or new-low 15m candle has open/close at or below this level.
   */
  s2?: number;
}

/**
 * The level the PD-15M-Below-BC check tests candle bodies against on the
 * downside: previous CPR's PL, or its S1 when S1 sits below PL (i.e. the
 * lower of the two).
 */
export function getPrevious15MBFloor(prevLevels: {
  prevLow: number;
  s1: number;
}): number {
  return Math.min(prevLevels.prevLow, prevLevels.s1);
}

/**
 * The level the CONSOLIDATE-A check tests candle bodies against on the
 * upside: previous CPR Prev High (PH), or its R1 when R1 sits above PH (i.e. the
 * higher of the two).
 */
export function getPrevious15MACeiling(prevLevels: {
  prevHigh: number;
  r1: number;
}): number {
  return Math.max(prevLevels.prevHigh, prevLevels.r1);
}

/**
 * Bottom (BC) level for the P-CONSOLIDATE-A check. Normally the previous
 * session's own BC (PDay BC). When PDay's CPR was Overlap-Above or Inside
 * (INCPR) versus the day before it (PPDay), the bottom check uses PPDay's BC
 * instead (the "previous day BC" from the checked session's point of view),
 * mirroring getUpexBc for the current session. Falls back to PDay BC when
 * PPDay's CPR isn't available.
 */
export function getConsolidateABc(
  prevCPR: { tc: number; bc: number },
  ppCPR?: { tc: number; bc: number } | null
): number {
  if (!ppCPR || !Number.isFinite(ppCPR.bc) || !Number.isFinite(ppCPR.tc)) {
    return prevCPR.bc;
  }
  const overlapAbove =
    prevCPR.bc >= ppCPR.bc && prevCPR.bc <= ppCPR.tc && prevCPR.tc > ppCPR.tc;
  const inside =
    (prevCPR.tc <= ppCPR.tc && prevCPR.bc > ppCPR.bc) ||
    (prevCPR.tc < ppCPR.tc && prevCPR.bc >= ppCPR.bc);
  return overlapAbove || inside ? ppCPR.bc : prevCPR.bc;
}

/**
 * Top (TC) level for the P-CONSOLIDATE-B check. Normally the previous
 * session's own TC (PDay TC). When PDay's CPR was Overlap-Below or Inside
 * (INCPR) versus the day before it (PPDay), the top check uses PPDay's TC
 * instead. Mirror image of getConsolidateABc. Falls back to PDay's TC when
 * PPDay's CPR isn't available.
 */
export function getConsolidateBTc(
  prevCPR: { tc: number; bc: number },
  ppCPR?: { tc: number; bc: number } | null
): number {
  if (!ppCPR || !Number.isFinite(ppCPR.bc) || !Number.isFinite(ppCPR.tc)) {
    return prevCPR.tc;
  }
  const overlapBelow =
    prevCPR.tc <= ppCPR.tc && prevCPR.tc >= ppCPR.bc && prevCPR.bc < ppCPR.bc;
  const inside =
    (prevCPR.tc <= ppCPR.tc && prevCPR.bc > ppCPR.bc) ||
    (prevCPR.tc < ppCPR.tc && prevCPR.bc >= ppCPR.bc);
  return overlapBelow || inside ? ppCPR.tc : prevCPR.tc;
}

/**
 * One-time housekeeping: delete superseded versions of the previous-session
 * 15m result caches. Each cache key ends in `_v<N>`; whenever the check's logic
 * changes the version is bumped, which orphans the older keys in localStorage
 * (nothing reads them again). Removes every `<same prefix>_v<other N>` key and
 * leaves the current ones untouched. Returns how many keys were removed.
 */
export function pruneLegacy15MResultCaches(): number {
  if (typeof localStorage === "undefined") return 0;
  const currentKeys = [
    PREVIOUS_UPEX_CACHE_KEY,
    PREVIOUS_15M_B_CACHE_KEY,
    PREVIOUS_15M_TC_B_CACHE_KEY,
    PREVIOUS_15M_MOMENTUM_B_CACHE_KEY,
    PREVIOUS_15M_CONSOLIDATE_A_CACHE_KEY,
    PREVIOUS_15M_INSIDE_R1S1_CACHE_KEY,
  ];
  const prefixes = currentKeys.map((key) => key.replace(/\d+$/, ""));
  let removed = 0;
  try {
    for (const key of Object.keys(localStorage)) {
      if (
        !currentKeys.includes(key) &&
        prefixes.some((prefix) => key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length)))
      ) {
        localStorage.removeItem(key);
        removed++;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return removed;
}

export function getUpexBc(
  todayBc: number,
  previousBc: number,
  overlapsAboveToday: boolean
): number {
  return overlapsAboveToday ? previousBc : todayBc;
}

/**
 * Start (UTC ms) of the trading session containing `now`: the most recent
 * 00:00 UTC (= 05:30 IST), i.e. the same daily candle boundary the CPR levels
 * are built on.
 */
export function upexSessionStartUtcMs(now = Date.now()): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

export function previousUpexSessionStartUtcMs(now = Date.now()): number {
  return upexSessionStartUtcMs(now) - DAY_MS;
}

/** Start of the session before previous (PPDay) — one day before previousUpexSessionStartUtcMs. */
export function previousPreviousUpexSessionStartUtcMs(now = Date.now()): number {
  return previousUpexSessionStartUtcMs(now) - DAY_MS;
}

/**
 * MOMENTUM-A (PD15M>BC; becomes CONSOLIDATE-A when a `ceiling` is supplied): walk the previous
 * session's completed 15m candles in time order using the Reference Candle Principle.
 *  - Floor rule (BC, MOMENTUM-A and CONSOLIDATE-A): uses the Reference Candle Principle.
 *    Candles with a full body below BC are buffered until the first BC-spanning candle appears.
 *    That candle's low becomes refFloorLow; buffered candles are checked retroactively — any
 *    whose bodyHigh < refFloorLow fails. Further BC-spanning candles with a lower low update
 *    refFloorLow and re-check. If no BC-spanning candle ever appears but there were full-body-
 *    below-BC candles, the session fails on the first such candle.
 *  - Ceiling rule (CONSOLIDATE-A only, when `ceiling` is supplied): a candle whose body
 *    spans the ceiling (higher of PH / R1) sets / updates the ceiling reference with its
 *    higher wick. A candle whose body is wholly above the reference (or above ceiling if
 *    no reference has been established yet) fails the session. Candle 1 with a full body
 *    above ceiling fails immediately. MOMENTUM-A has no ceiling check.
 *  - R2 body rule (CONSOLIDATE-A only, when `r2` is supplied): fail when a
 *    first-crossing or new-high candle has open/close at or above R2. That
 *    session is MOMENTUM-A, not CONSOLIDATE-A.
 */
export function passesUpexFilter(
  candles: OHLC[],
  bc: number,
  startTime: number,
  now: number,
  ceiling?: number,
  r2?: number,
): boolean | null {
  if (!Number.isFinite(bc)) return null;
  if (ceiling !== undefined && !Number.isFinite(ceiling)) return null;

  const completed = candles.filter(
    (candle) =>
      Number.isFinite(candle.openTime) &&
      candle.openTime >= startTime &&
      candle.openTime + CANDLE_INTERVAL_MS <= now &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.close) &&
      Number.isFinite(candle.low)
  ).sort((a, b) => a.openTime - b.openTime);
  if (completed.length === 0) return null;

  let refFloorLow: number | null = null;
  let refCeilingHigh: number | null = null;
  let seenBodyInR2 = false;
  const useR2 =
    ceiling !== undefined && r2 !== undefined && Number.isFinite(r2);
  // Buffer for candles whose body is fully below BC before a BC-spanning reference candle appears.
  const pendingBelowBc: OHLC[] = [];

  for (let i = 0; i < completed.length; i++) {
    const candle = completed[i];
    const bodyLow = Math.min(candle.open, candle.close);
    const bodyHigh = Math.max(candle.open, candle.close);

    // Floor rule (BC) - applies to both MOMENTUM-A and CONSOLIDATE-A
    // Uses the Reference Candle Principle: the first candle with body in BC sets
    // refFloorLow. All earlier full-body-below-BC candles are checked retroactively.
    const bodyInBc = bodyLow <= bc && bodyHigh >= bc;
    if (bodyInBc) {
      if (refFloorLow === null || candle.low < refFloorLow) {
        refFloorLow = candle.low;
        // Retroactively check all buffered candles against the new reference low.
        for (const prev of pendingBelowBc) {
          const prevBodyHigh = Math.max(prev.open, prev.close);
          if (prevBodyHigh < refFloorLow) return false;
        }
      }
    } else if (bodyHigh < bc) {
      // Full body below BC.
      if (refFloorLow === null) {
        // No reference candle yet — buffer this candle for later retroactive check.
        pendingBelowBc.push(candle);
      } else if (bodyHigh < refFloorLow) {
        return false;
      }
    }

    // Ceiling rule (R1 / PH) - applies only to CONSOLIDATE-A
    if (ceiling !== undefined) {
      const bodyInCeiling = bodyLow <= ceiling && bodyHigh >= ceiling;
      if (bodyInCeiling) {
        if (refCeilingHigh === null || (Number.isFinite(candle.high) && candle.high > refCeilingHigh)) {
          refCeilingHigh = candle.high;
        }
      }
      if (bodyLow > (refCeilingHigh ?? ceiling)) {
        return false;
      }
    }

    // CON-A → MOM-A: first body at/above R2, or new-high candle with body at/above R2
    if (useR2) {
      const bodyInR2 = candle.open >= (r2 as number) || candle.close >= (r2 as number);
      const isNewHigh =
        refCeilingHigh === null ||
        (Number.isFinite(candle.high) && candle.high > refCeilingHigh);
      if (bodyInR2 && (isNewHigh || !seenBodyInR2)) {
        return false;
      }
      if (bodyInR2) seenBodyInR2 = true;
    }
  }

  // If no candle ever had body in BC but there were full-body-below-BC candles, fail on the first.
  if (refFloorLow === null && pendingBelowBc.length > 0) {
    return false;
  }

  return true;
}

/** Why CONSOLIDATE-A / MOMENTUM-A failed on a previous-session 15m walk. */
export type UpexFailureRule = "floor" | "freshHighAboveCeiling" | "bodyInR2";

export interface UpexFailureInfo {
  rule: UpexFailureRule;
  openTime: string;
  candleNumber: number;
  open: number;
  close: number;
  bc: number;
  ceiling?: number;
  previousLowestWick: number | null;
  previousHighestWick: number | null;
  previousHighestWickCandle: number | null;
}

/**
 * Same walk as passesUpexFilter, but reports which candle/rule failed.
 * Null when the session passes or cannot be evaluated.
 */
export function explainUpexFailure(
  candles: OHLC[],
  bc: number,
  startTime: number,
  now: number,
  ceiling?: number,
  r2?: number,
): UpexFailureInfo | null {
  if (!Number.isFinite(bc)) return null;
  if (ceiling !== undefined && !Number.isFinite(ceiling)) return null;

  const completed = candles
    .filter(
      (candle) =>
        Number.isFinite(candle.openTime) &&
        candle.openTime >= startTime &&
        candle.openTime + CANDLE_INTERVAL_MS <= now &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.close) &&
        Number.isFinite(candle.low),
    )
    .sort((a, b) => a.openTime - b.openTime);
  if (completed.length === 0) return null;

  let refFloorLow: number | null = null;
  let refCeilingHigh: number | null = null;
  let seenBodyInR2 = false;
  const useR2 = ceiling !== undefined && r2 !== undefined && Number.isFinite(r2);
  const numberOf = (c: OHLC) => Math.floor((c.openTime - startTime) / CANDLE_INTERVAL_MS) + 1;
  // Buffer for candles whose body is fully below BC before a BC-spanning reference candle appears.
  const pendingBelowBc: OHLC[] = [];

  for (let i = 0; i < completed.length; i++) {
    const candle = completed[i];
    const bodyLow = Math.min(candle.open, candle.close);
    const bodyHigh = Math.max(candle.open, candle.close);

    // Floor rule (BC) — Reference Candle Principle (mirrors CON-B ceiling check).
    const bodyInBc = bodyLow <= bc && bodyHigh >= bc;
    if (bodyInBc) {
      if (refFloorLow === null || candle.low < refFloorLow) {
        refFloorLow = candle.low;
        // Retroactively check all buffered full-body-below-BC candles.
        for (const prev of pendingBelowBc) {
          const prevBodyHigh = Math.max(prev.open, prev.close);
          if (prevBodyHigh < refFloorLow) {
            return {
              rule: "floor",
              openTime: new Date(prev.openTime).toISOString(),
              candleNumber: numberOf(prev),
              open: prev.open,
              close: prev.close,
              bc,
              ceiling,
              previousLowestWick: refFloorLow,
              previousHighestWick: refCeilingHigh,
              previousHighestWickCandle: null,
            };
          }
        }
      }
    } else if (bodyHigh < bc) {
      // Full body below BC.
      if (refFloorLow === null) {
        // No reference candle yet — buffer for later retroactive check.
        pendingBelowBc.push(candle);
      } else if (bodyHigh < refFloorLow) {
        return {
          rule: "floor",
          openTime: new Date(candle.openTime).toISOString(),
          candleNumber: numberOf(candle),
          open: candle.open,
          close: candle.close,
          bc,
          ceiling,
          previousLowestWick: refFloorLow,
          previousHighestWick: refCeilingHigh,
          previousHighestWickCandle: null,
        };
      }
    }

    if (ceiling !== undefined) {
      const bodyInCeiling = bodyLow <= ceiling && bodyHigh >= ceiling;
      if (bodyInCeiling) {
        if (refCeilingHigh === null || candle.high > refCeilingHigh) {
          refCeilingHigh = candle.high;
        }
      }
      if (bodyLow > (refCeilingHigh ?? ceiling)) {
        const wickCandle =
          refCeilingHigh === null
            ? null
            : completed.find(
                (c) => c.openTime < candle.openTime && c.high === refCeilingHigh,
              ) ?? null;
        return {
          rule: "freshHighAboveCeiling",
          openTime: new Date(candle.openTime).toISOString(),
          candleNumber: numberOf(candle),
          open: candle.open,
          close: candle.close,
          bc,
          ceiling,
          previousLowestWick: refFloorLow,
          previousHighestWick: refCeilingHigh,
          previousHighestWickCandle: wickCandle ? numberOf(wickCandle) : null,
        };
      }
    }

    if (useR2 && r2 !== undefined) {
      const bodyInR2 = candle.open >= r2 || candle.close >= r2;
      const isNewHigh =
        refCeilingHigh === null ||
        (Number.isFinite(candle.high) && candle.high > refCeilingHigh);
      if (bodyInR2 && (isNewHigh || !seenBodyInR2)) {
        return {
          rule: "bodyInR2",
          openTime: new Date(candle.openTime).toISOString(),
          candleNumber: numberOf(candle),
          open: candle.open,
          close: candle.close,
          bc,
          ceiling,
          previousLowestWick: refFloorLow,
          previousHighestWick: refCeilingHigh,
          previousHighestWickCandle: null,
        };
      }
      if (bodyInR2) seenBodyInR2 = true;
    }
  }

  // If no candle ever had body in BC but there were full-body-below-BC candles, fail on the first.
  if (refFloorLow === null && pendingBelowBc.length > 0) {
    const first = pendingBelowBc[0];
    return {
      rule: "floor",
      openTime: new Date(first.openTime).toISOString(),
      candleNumber: numberOf(first),
      open: first.open,
      close: first.close,
      bc,
      ceiling,
      previousLowestWick: null,
      previousHighestWick: refCeilingHigh,
      previousHighestWickCandle: null,
    };
  }

  return null;
}

/** Human-readable CON-A / MOM-A failure note (mirrors getPD15MBelowTCFailureNote style). */
export function formatUpexFailureNote(
  failure: UpexFailureInfo,
  ceilingName = "PH/R1",
): { label: string; detail: string } {
  const ist = new Date(Date.parse(failure.openTime) + 19_800_000).toISOString().slice(11, 16);
  const hhmm = `#${failure.candleNumber} (${ist} IST)`;
  const body = `${failure.open}→${failure.close}`;
  switch (failure.rule) {
    case "freshHighAboveCeiling":
      return {
        label: `fresh high > ${ceilingName} · candle #${failure.candleNumber}`,
        detail:
          `${hhmm} body ${body}, body bottom ${Math.min(failure.open, failure.close)}` +
          ` > earlier high ${failure.previousHighestWick ?? "—"}` +
          (failure.previousHighestWickCandle ? ` (candle #${failure.previousHighestWickCandle})` : "") +
          ` · ${ceilingName} ${failure.ceiling ?? "—"}`,
      };
    case "bodyInR2":
      return {
        label: `body ≥ R2 · candle #${failure.candleNumber}`,
        detail: `candle ${hhmm} body ${body} reached R2 (first body at/above R2, or a new high) — this is MOMENTUM-A, not CONSOLIDATE-A.`,
      };
    case "floor":
      return {
        label: `broke below BC wick · candle #${failure.candleNumber}`,
        detail: `candle ${hhmm} body ${body} went below the low-wick reference ${failure.previousLowestWick ?? "—"} set after the first body through BC ${failure.bc}.`,
      };
  }
}

/** Fetch previous-session 15m candles for one symbol (public for Pattern Stats / debug). */
export async function fetchPreviousSessionCandles(
  candidate: Pick<UpexCandidate, "symbol" | "source">,
  sessionEndMs: number,
): Promise<OHLC[] | null> {
  const endTime = upexSessionStartUtcMs(sessionEndMs);
  const startTime = previousUpexSessionStartUtcMs(sessionEndMs);
  return fetchUpexCandles(candidate, startTime, endTime);
}

export interface CandleBodyLevelMatch {
  candleNumber: number;
  openTime: string;
  ist: string;
  open: number;
  close: number;
  high: number;
  low: number;
}

/** All completed 15m candles whose body spans `level` (open/close straddle). */
export function allBodiesThroughLevel(
  candles: OHLC[],
  level: number,
  startTime: number,
  now: number,
): CandleBodyLevelMatch[] {
  if (!Number.isFinite(level)) return [];
  const completed = candles
    .filter(
      (c) =>
        Number.isFinite(c.openTime) &&
        c.openTime >= startTime &&
        c.openTime + CANDLE_INTERVAL_MS <= now &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.close),
    )
    .sort((a, b) => a.openTime - b.openTime);
  const matches: CandleBodyLevelMatch[] = [];
  for (const c of completed) {
    const bodyLow = Math.min(c.open, c.close);
    const bodyHigh = Math.max(c.open, c.close);
    if (bodyLow <= level && bodyHigh >= level) {
      const ist = new Date(c.openTime + 19_800_000).toISOString().slice(11, 16);
      matches.push({
        candleNumber: Math.floor((c.openTime - startTime) / CANDLE_INTERVAL_MS) + 1,
        openTime: new Date(c.openTime).toISOString(),
        ist,
        open: c.open,
        close: c.close,
        high: c.high,
        low: c.low,
      });
    }
  }
  return matches;
}

/** First completed 15m candle whose body spans `level` (open/close straddle). */
export function firstBodyThroughLevel(
  candles: OHLC[],
  level: number,
  startTime: number,
  now: number,
): CandleBodyLevelMatch | null {
  const matches = allBodiesThroughLevel(candles, level, startTime, now);
  return matches.length > 0 ? matches[0] : null;
}

export function formatQualifyCandle(
  q: CandleBodyLevelMatch,
  levelName: string,
  level: number,
): string {
  const ist = q.ist || new Date(Date.parse(q.openTime) + 19_800_000).toISOString().slice(11, 16);
  return (
    `Qualified on candle #${q.candleNumber} (${ist} IST): body ${q.open}→${q.close} spans ${levelName} ${level}` +
    ` (high ${q.high}, low ${q.low}).`
  );
}


/**
 * What made passesPD15MBelowTCFilter fail: which rule, which candle, and the
 * wick references that candle was judged against.
 */
interface PD15MBelowTCFailure {
  rule: "floor" | "freshHighAboveTC" | "bodyInS2";
  candle: OHLC;
  previousHighestWick: number | null;
  previousLowestWick: number | null;
  refCeilingCandle?: OHLC | null;
}

/**
 * Core walk shared by passesPD15MBelowTCFilter and explainPD15MBelowTCFailure.
 * `completed` must already be filtered and sorted by time.
 *
 * Reference Candle Principle:
 * - Ceiling rule (TC, CONSOLIDATE-B and MOMENTUM-B):
 *   Only a candle whose body spans TC sets / updates the ceiling reference high.
 *   Candles with full body above TC before any reference candle cannot set reference;
 *   once a reference candle in TC appears, all previous full-body candles are checked
 *   against its high. Any candle with full body above the reference high fails.
 *   If no candle in the entire session has body in TC, any candle with full body above TC fails.
 * - Floor rule (lower of PL / S1, CONSOLIDATE-B ONLY):
 *   A candle whose body spans the floor sets / updates the floor reference with
 *   its lower wick. A candle whose body is wholly below this reference (or below
 *   the floor if no reference has been established yet) fails the session.
 *   Candle 1 with a full body below floor fails immediately.
 *   MOMENTUM-B has no floor rule.
 */
function findPD15MBelowTCFailure(
  completed: OHLC[],
  tc: number,
  floor: number | undefined,
  s2?: number,
): PD15MBelowTCFailure | null {
  let refCeilingHigh: number | null = null;
  let refCeilingCandle: OHLC | null = null;
  let refFloorLow: number | null = null;
  let seenBodyInS2 = false;
  const useS2 = s2 !== undefined && Number.isFinite(s2);
  const pendingAboveTc: OHLC[] = [];

  for (let i = 0; i < completed.length; i++) {
    const candle = completed[i];
    const bodyLow = Math.min(candle.open, candle.close);
    const bodyHigh = Math.max(candle.open, candle.close);

    // Ceiling check (TC) - CON-B and MOM-B
    const bodyInTc = bodyLow <= tc && bodyHigh >= tc;
    if (bodyInTc) {
      if (refCeilingHigh === null || (Number.isFinite(candle.high) && candle.high > refCeilingHigh)) {
        refCeilingHigh = candle.high;
        refCeilingCandle = candle;
        // Check all previous candles that had body fully above TC
        for (const prev of pendingAboveTc) {
          const prevBodyLow = Math.min(prev.open, prev.close);
          if (prevBodyLow > refCeilingHigh) {
            return {
              rule: "freshHighAboveTC",
              candle: prev,
              previousHighestWick: refCeilingHigh,
              previousLowestWick: refFloorLow,
              refCeilingCandle,
            };
          }
        }
      }
    } else if (bodyLow > tc) {
      if (refCeilingHigh === null) {
        pendingAboveTc.push(candle);
      } else if (bodyLow > refCeilingHigh) {
        return {
          rule: "freshHighAboveTC",
          candle,
          previousHighestWick: refCeilingHigh,
          previousLowestWick: refFloorLow,
          refCeilingCandle,
        };
      }
    }

    // Floor check (PL / S1) - Only applicable to CON-B (when floor is supplied)
    if (floor !== undefined) {
      const bodyInFloor = bodyLow <= floor && bodyHigh >= floor;
      if (bodyInFloor) {
        if (refFloorLow === null || (Number.isFinite(candle.low) && candle.low < refFloorLow)) {
          refFloorLow = candle.low;
        }
      }
      if (bodyHigh < (refFloorLow ?? floor)) {
        return {
          rule: "floor",
          candle,
          previousHighestWick: refCeilingHigh,
          previousLowestWick: refFloorLow,
          refCeilingCandle,
        };
      }
    }

    // CON-B → MOM-B: first body at/below S2, or new-low candle with body at/below S2
    if (useS2) {
      const bodyInS2 = candle.open <= (s2 as number) || candle.close <= (s2 as number);
      const isNewLow =
        refFloorLow === null ||
        (Number.isFinite(candle.low) && candle.low < refFloorLow);
      if (bodyInS2 && (isNewLow || !seenBodyInS2)) {
        return {
          rule: "bodyInS2",
          candle,
          previousHighestWick: refCeilingHigh,
          previousLowestWick: refFloorLow,
          refCeilingCandle,
        };
      }
      if (bodyInS2) seenBodyInS2 = true;
    }
  }

  // If there were candles with full body above TC, but no candle ever had body in TC:
  if (refCeilingHigh === null && pendingAboveTc.length > 0) {
    return {
      rule: "freshHighAboveTC",
      candle: pendingAboveTc[0],
      previousHighestWick: null,
      previousLowestWick: refFloorLow,
      refCeilingCandle: null,
    };
  }

  return null;
}

function completedBelowTCCandles(
  candles: OHLC[],
  startTime: number,
  now: number
): OHLC[] {
  return candles
    .filter(
      (candle) =>
        Number.isFinite(candle.openTime) &&
        candle.openTime >= startTime &&
        candle.openTime + CANDLE_INTERVAL_MS <= now &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.close) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low)
    )
    .sort((a, b) => a.openTime - b.openTime);
}

/**
 * CONSOLIDATE-B mirrors CONSOLIDATE-A's two sides. Above TC, a whole candle
 * body must also sit entirely at/above every earlier wick (body low >= highest
 * earlier high) to fail. Below the
 * lower PL/S1 floor, the first body that enters below sets a low-wick
 * reference; the immediate next candle can lower that reference, and a later
 * body below it fails. Without a floor (MOMENTUM-B), only the TC rule applies.
 */
export function passesPD15MBelowTCFilter(
  candles: OHLC[],
  tc: number,
  startTime: number,
  now: number,
  floor?: number,
  s2?: number,
): boolean | null {
  if (!Number.isFinite(tc)) return null;
  if (floor !== undefined && !Number.isFinite(floor)) return null;

  const completed = completedBelowTCCandles(candles, startTime, now);
  if (completed.length === 0) return null;

  return findPD15MBelowTCFailure(completed, tc, floor, s2) === null;
}

/**
 * Debug helper for PD15MBelowTC / CONSOLIDATE-B: runs the same walk as
 * passesPD15MBelowTCFilter but reports WHICH candle and rule made it fail
 * (null when it passes or can't be evaluated). Never affects results.
 */
export function explainPD15MBelowTCFailure(
  candles: OHLC[],
  tc: number,
  startTime: number,
  now: number,
  floor?: number,
  s2?: number,
): {
  rule: "floor" | "freshHighAboveTC" | "bodyInS2";
  openTime: string;
  open: number;
  close: number;
  tc: number;
  floor?: number;
  previousHighestWick: number | null;
  previousLowestWick: number | null;
  /** 1-based 15m candle number within the session (1 = the 00:00 UTC / 05:30 IST candle). */
  candleNumber: number;
  /** Candle number whose high set previousHighestWick (first one that reached it), or null. */
  previousHighestWickCandle: number | null;
} | null {
  if (!Number.isFinite(tc)) return null;
  const effectiveFloor =
    floor !== undefined && Number.isFinite(floor) ? floor : undefined;
  const completed = completedBelowTCCandles(candles, startTime, now);
  const failure = findPD15MBelowTCFailure(completed, tc, effectiveFloor, s2);
  if (!failure) return null;
  const numberOf = (c: OHLC) => Math.floor((c.openTime - startTime) / CANDLE_INTERVAL_MS) + 1;
  const wickCandle =
    failure.refCeilingCandle ??
    (failure.previousHighestWick === null
      ? undefined
      : completed.find(
          (c) => c.openTime < failure.candle.openTime && c.high === failure.previousHighestWick,
        ));
  return {
    rule: failure.rule,
    openTime: new Date(failure.candle.openTime).toISOString(),
    candleNumber: Math.floor((failure.candle.openTime - startTime) / CANDLE_INTERVAL_MS) + 1,
    open: failure.candle.open,
    close: failure.candle.close,
    tc,
    floor,
    previousHighestWick: failure.previousHighestWick,
    previousLowestWick: failure.previousLowestWick,
    previousHighestWickCandle: wickCandle ? numberOf(wickCandle) : null,
  };
}

export interface PD15MBelowTCPassInfo {
  candles: number;
  /** Candle numbers whose whole body was above TC but under an earlier wick high (excused). */
  excusedAboveTc: number[];
  /** Candle number of the first body below the PL/S1 floor (sets the wick reference), or null. */
  floorRefCandle: number | null;
  floorRef: number | null;
  floor?: number;
  tc: number;
  highestHigh: number | null;
  lowestLow: number | null;
}

/** Why a session PASSED the CONSOLIDATE-B / MOMENTUM-B walk (same filtering as passesPD15MBelowTCFilter). */
export function explainPD15MBelowTCPass(
  candles: OHLC[],
  tc: number,
  startTime: number,
  now: number,
  floor?: number,
): PD15MBelowTCPassInfo | null {
  if (!Number.isFinite(tc)) return null;
  const completed = completedBelowTCCandles(candles, startTime, now);
  if (completed.length === 0) return null;
  const numberOf = (c: OHLC) => Math.floor((c.openTime - startTime) / CANDLE_INTERVAL_MS) + 1;
  let refCeilingHigh: number | null = null;
  let lowestLow: number | null = null;
  const pendingExcused: OHLC[] = [];
  const excused: number[] = [];
  let floorRefCandle: number | null = null;
  let floorRef: number | null = null;
  let highestHigh: number | null = null;
  for (let i = 0; i < completed.length; i++) {
    const c = completed[i];
    const bodyLow = Math.min(c.open, c.close);
    const bodyHigh = Math.max(c.open, c.close);

    const bodyInTc = bodyLow <= tc && bodyHigh >= tc;
    if (bodyInTc) {
      if (refCeilingHigh === null || (Number.isFinite(c.high) && c.high > refCeilingHigh)) {
        refCeilingHigh = c.high;
      }
    } else if (bodyLow > tc) {
      pendingExcused.push(c);
    }

    if (floor !== undefined) {
      const bodyInFloor = bodyLow <= floor && bodyHigh >= floor;
      if (bodyInFloor) {
        if (floorRef === null || (Number.isFinite(c.low) && c.low < floorRef)) {
          floorRef = c.low;
          floorRefCandle = numberOf(c);
        }
      }
    }

    highestHigh = highestHigh === null ? c.high : Math.max(highestHigh, c.high);
    lowestLow = lowestLow === null ? c.low : Math.min(lowestLow, c.low);
  }

  if (refCeilingHigh !== null) {
    for (const c of pendingExcused) {
      const bodyLow = Math.min(c.open, c.close);
      if (bodyLow <= refCeilingHigh) {
        excused.push(numberOf(c));
      }
    }
  }

  return {
    candles: completed.length,
    excusedAboveTc: excused.sort((a, b) => a - b),
    floorRefCandle,
    floorRef,
    floor,
    tc,
    highestHigh: highestHigh ?? refCeilingHigh,
    lowestLow,
  };
}

/**
 * Opt-in logging: in the browser console run
 *   localStorage.debugPD15M = "SANDUSDT"   (comma list, or "*" for all)
 * then re-run the backtest/screener to see why a symbol failed PD15MBelowTC.
 */
function shouldDebugPD15M(symbol: string): boolean {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("debugPD15M") : null;
    if (!raw) return false;
    const list = raw.split(",").map((x) => x.trim().toUpperCase());
    return list.includes("*") || list.includes(symbol.toUpperCase());
  } catch {
    return false;
  }
}

export function passesPrevious15MBFilter(
  candles: OHLC[],
  bc: number,
  startTime: number,
  now: number,
  floor?: number
): boolean | null {
  if (!Number.isFinite(bc)) return null;
  // `floor` is optional so callers that only care about BC keep working; when
  // supplied it must be a real number or the session can't be evaluated.
  if (floor !== undefined && !Number.isFinite(floor)) return null;

  const completed = candles.filter(
    (candle) =>
      Number.isFinite(candle.openTime) &&
      candle.openTime >= startTime &&
      candle.openTime + CANDLE_INTERVAL_MS <= now &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.close)
  );
  if (completed.length === 0) return null;

  // A session passes unless any candle body is wholly above the previous BC,
  // or wholly below the floor (lower of previous PL / S1). Only bodies count:
  // a wick beyond either level does not fail the session.
  return !completed.some(
    (candle) =>
      (candle.open > bc && candle.close > bc) ||
      (floor !== undefined && candle.open < floor && candle.close < floor),
  );
}

async function fetchJson(url: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status < 500) return null;
    } catch {
      clearTimeout(timeout);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
  }
  return null;
}

function parseBinanceCandles(payload: unknown): OHLC[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 6)
    .map((row) => ({
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));
}

function parseDeltaCandles(payload: unknown): OHLC[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as {
    result?: unknown[] | { candles?: unknown[] };
    candles?: unknown[];
  };
  const rows = Array.isArray(body.result)
    ? body.result
    : body.result && !Array.isArray(body.result) && Array.isArray(body.result.candles)
      ? body.result.candles
      : Array.isArray(body.candles)
        ? body.candles
        : [];
  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      openTime: Number(row.time) * (Number(row.time) > 1e10 ? 1 : 1000),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }));
}

const sessionCandleCache = new Map<string, Promise<OHLC[] | null>>();
const MAX_SESSION_CANDLE_CACHE_ENTRIES = 20_000;

function fetchUpexCandles(
  candidate: Pick<UpexCandidate, "symbol" | "source">,
  startTime: number,
  endTime: number
): Promise<OHLC[] | null> {
  const key = `${candidate.source}:${candidate.symbol}:${startTime}:${endTime}`;
  const cached = sessionCandleCache.get(key);
  if (cached) return cached;

  const fetchRequest = (async (): Promise<OHLC[] | null> => {
    if (candidate.source === "binance") {
      const payload = await fetchJson(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(candidate.symbol)}` +
          `&interval=15m&startTime=${startTime}&endTime=${endTime}&limit=100`
      );
      return payload === null ? null : parseBinanceCandles(payload);
    }

    const payload = await fetchJson(
      `${DELTA_BASE}/history/candles?symbol=${encodeURIComponent(candidate.symbol)}` +
        `&resolution=15m&start=${Math.floor(startTime / 1000)}&end=${Math.floor(endTime / 1000)}`
    );
    return payload === null ? null : parseDeltaCandles(payload);
  })().catch((error: unknown) => {
    sessionCandleCache.delete(key);
    throw error;
  });
  const request = fetchRequest.then((candles) => {
    if (candles === null) sessionCandleCache.delete(key);
    return candles;
  });
  if (sessionCandleCache.size > MAX_SESSION_CANDLE_CACHE_ENTRIES) {
    const oldestKey = sessionCandleCache.keys().next().value;
    if (oldestKey) sessionCandleCache.delete(oldestKey);
  }
  sessionCandleCache.set(key, request);
  return request;
}

async function findSymbolsForSession(
  candidates: UpexCandidate[],
  startTime: number,
  endTime: number,
  onProgress?: (done: number, total: number) => void,
  evaluate: (
    candles: OHLC[],
    bc: number,
    startTime: number,
    now: number,
    floor?: number,
    expansionLevel?: number,
  ) => boolean | null = passesUpexFilter,
): Promise<{
  included: Set<string>;
  unavailable: number;
  outcomes: Map<string, boolean | null>;
}> {
  const included = new Set<string>();
  const outcomes = new Map<string, boolean | null>();
  let unavailable = 0;

  for (let offset = 0; offset < candidates.length; offset += MAX_CONCURRENT_REQUESTS) {
    const batch = candidates.slice(offset, offset + MAX_CONCURRENT_REQUESTS);
    const results = await Promise.all(
      batch.map(async (candidate) => {
        const candles = await fetchUpexCandles(candidate, startTime, endTime);
        if (!candles) return { candidate, passes: null };
        return {
          candidate,
          passes: evaluate(
            candles,
            candidate.bc,
            startTime,
            endTime,
            candidate.ceiling !== undefined ? candidate.ceiling : candidate.floor,
            candidate.ceiling !== undefined ? candidate.r2 : candidate.s2,
          ),
        };
      })
    );

    for (const { candidate, passes } of results) {
      const symbolKey = `${candidate.source}:${candidate.symbol}`;
      outcomes.set(symbolKey, passes);
      if (passes === true) included.add(symbolKey);
      else if (passes === null) unavailable++;
    }
    onProgress?.(Math.min(offset + batch.length, candidates.length), candidates.length);
  }

  return { included, unavailable, outcomes };
}

export interface PreviousUpexScanResults {
  included: Set<string>;
  unavailable: number;
  outcomes: Map<string, boolean | null>;
}

export function findUpexSymbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now()
): Promise<{ included: Set<string>; unavailable: number }> {
  return findSymbolsForSession(candidates, upexSessionStartUtcMs(now), now, onProgress);
}

export function findPreviousConsolidateASymbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now()
): Promise<PreviousUpexScanResults> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  return findSymbolsForSession(
    candidates,
    startTime,
    endTime,
    onProgress,
    passesUpexFilter,
  );
}

export function previousConsolidateACandidateCacheKey(
  sessionStart: number,
  candidate: UpexCandidate,
): string {
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.ceiling}:${candidate.r2}`;
}

export function loadPreviousConsolidateAResults(
  sessionStart: number,
): Map<string, boolean | null> {
  try {
    const raw = localStorage.getItem(PREVIOUS_15M_CONSOLIDATE_A_CACHE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("sessionStart" in parsed) ||
      parsed.sessionStart !== sessionStart ||
      !("results" in parsed) ||
      !parsed.results ||
      typeof parsed.results !== "object"
    ) {
      return new Map();
    }

    const results = new Map<string, boolean | null>();
    for (const [key, value] of Object.entries(parsed.results)) {
      if (typeof value === "boolean") {
        results.set(key, value);
      }
    }
    return results;
  } catch {
    return new Map();
  }
}

export function savePreviousConsolidateAResults(
  sessionStart: number,
  results: Map<string, boolean | null>,
): void {
  const payload = JSON.stringify({
    sessionStart,
    results: Object.fromEntries(
      [...results].filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    ),
  });
  safeSetItem(PREVIOUS_15M_CONSOLIDATE_A_CACHE_KEY, payload);
}

/**
 * PP-CONSOLIDATE-A: same CONSOLIDATE-A body rules on the day-before-previous
 * session (PPDay). Pass `now` = end of that session (typically previous session
 * start) so the walk uses [PPDay start, PDay start).
 *
 * Reuses passesUpexFilter via findPreviousConsolidateASymbols with an adjusted
 * `now` so the session window is one day earlier.
 */
export function findPPConsolidateASymbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now()
): Promise<PreviousUpexScanResults> {
  // previousUpexSessionStartUtcMs(now) / upexSessionStartUtcMs(now) when
  // `now` is the PDay session start → window [PPDay, PDay).
  return findPreviousConsolidateASymbols(candidates, onProgress, now);
}

export function previousPPConsolidateACandidateCacheKey(
  sessionStart: number,
  candidate: UpexCandidate,
): string {
  return previousConsolidateACandidateCacheKey(sessionStart, candidate);
}

export function loadPreviousPPConsolidateAResults(
  sessionStart: number,
): Map<string, boolean | null> {
  try {
    const raw = localStorage.getItem(PREVIOUS_15M_PP_CONSOLIDATE_A_CACHE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("sessionStart" in parsed) ||
      (parsed as { sessionStart: unknown }).sessionStart !== sessionStart ||
      !("results" in parsed) ||
      !(parsed as { results: unknown }).results ||
      typeof (parsed as { results: unknown }).results !== "object"
    ) {
      return new Map();
    }
    const results = new Map<string, boolean | null>();
    for (const [key, value] of Object.entries(
      (parsed as { results: Record<string, unknown> }).results,
    )) {
      if (typeof value === "boolean") results.set(key, value);
    }
    return results;
  } catch {
    return new Map();
  }
}

export function savePreviousPPConsolidateAResults(
  sessionStart: number,
  results: Map<string, boolean | null>,
): void {
  const payload = JSON.stringify({
    sessionStart,
    results: Object.fromEntries(
      [...results].filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    ),
  });
  safeSetItem(PREVIOUS_15M_PP_CONSOLIDATE_A_CACHE_KEY, payload);
}


export function findPreviousUpexSymbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now()
): Promise<PreviousUpexScanResults> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  return findSymbolsForSession(candidates, startTime, endTime, onProgress);
}

export function findPD15MBelowSymbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now()
): Promise<PreviousUpexScanResults> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  return findSymbolsForSession(
    candidates,
    startTime,
    endTime,
    onProgress,
    passesPrevious15MBFilter,
  );
}

export function previousUpexCandidateCacheKey(
  sessionStart: number,
  candidate: UpexCandidate,
): string {
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.bc}`;
}

export function loadPreviousUpexResults(
  sessionStart: number,
): Map<string, boolean | null> {
  try {
    const raw = localStorage.getItem(PREVIOUS_UPEX_CACHE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("sessionStart" in parsed) ||
      parsed.sessionStart !== sessionStart ||
      !("results" in parsed) ||
      !parsed.results ||
      typeof parsed.results !== "object"
    ) {
      return new Map();
    }

    const results = new Map<string, boolean | null>();
    for (const [key, value] of Object.entries(parsed.results)) {
      if (typeof value === "boolean") {
        results.set(key, value);
      }
    }
    return results;
  } catch {
    return new Map();
  }
}

export function savePreviousUpexResults(
  sessionStart: number,
  results: Map<string, boolean | null>,
): void {
  const payload = JSON.stringify({
    sessionStart,
    results: Object.fromEntries(
      [...results].filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    ),
  });
  safeSetItem(PREVIOUS_UPEX_CACHE_KEY, payload);
}

export function findPD15MBelowTCSymbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now()
): Promise<PreviousUpexScanResults> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  return findSymbolsForSession(
    candidates,
    startTime,
    endTime,
    onProgress,
    passesPD15MBelowTCFilter,
  );
}

export function previous15MTCCandidateCacheKey(
  sessionStart: number,
  candidate: UpexCandidate,
): string {
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.floor}:${candidate.s2}`;
}

export function loadPD15MTCBelowResults(
  sessionStart: number,
): Map<string, boolean | null> {
  try {
    const raw = localStorage.getItem(PREVIOUS_15M_TC_B_CACHE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("sessionStart" in parsed) ||
      parsed.sessionStart !== sessionStart ||
      !("results" in parsed) ||
      !parsed.results ||
      typeof parsed.results !== "object"
    ) {
      return new Map();
    }

    const results = new Map<string, boolean | null>();
    for (const [key, value] of Object.entries(parsed.results)) {
      if (typeof value === "boolean") {
        results.set(key, value);
      }
    }
    return results;
  } catch {
    return new Map();
  }
}

export function savePD15MBelowTCResults(
  sessionStart: number,
  results: Map<string, boolean | null>,
): void {
  const payload = JSON.stringify({
    sessionStart,
    results: Object.fromEntries(
      [...results].filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    ),
  });
  safeSetItem(PREVIOUS_15M_TC_B_CACHE_KEY, payload);
}

/**
 * MOMENTUM-B: the same previous-session "Below TC" check as CONSOLIDATE-B
 * (passesPD15MBelowTCFilter), but WITHOUT the PL/S1 floor rule. Any `floor` on
 * the candidates is dropped so only the fresh-high-above-TC rule applies.
 * Has its own results cache so it never mixes with CONSOLIDATE-B's.
 */
export function findPD15MMomentumBelowSymbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now()
): Promise<PreviousUpexScanResults> {
  return findPD15MBelowTCSymbols(
    candidates.map((candidate) => ({ ...candidate, floor: undefined })),
    onProgress,
    now,
  );
}

export function previous15MMomentumCandidateCacheKey(
  sessionStart: number,
  candidate: UpexCandidate,
): string {
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.bc}`;
}

export function loadPD15MMomentumBelowResults(
  sessionStart: number,
): Map<string, boolean | null> {
  try {
    const raw = localStorage.getItem(PREVIOUS_15M_MOMENTUM_B_CACHE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("sessionStart" in parsed) ||
      parsed.sessionStart !== sessionStart ||
      !("results" in parsed) ||
      !parsed.results ||
      typeof parsed.results !== "object"
    ) {
      return new Map();
    }

    const results = new Map<string, boolean | null>();
    for (const [key, value] of Object.entries(parsed.results)) {
      if (typeof value === "boolean") {
        results.set(key, value);
      }
    }
    return results;
  } catch {
    return new Map();
  }
}

export function savePD15MMomentumBelowResults(
  sessionStart: number,
  results: Map<string, boolean | null>,
): void {
  const payload = JSON.stringify({
    sessionStart,
    results: Object.fromEntries(
      [...results].filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    ),
  });
  safeSetItem(PREVIOUS_15M_MOMENTUM_B_CACHE_KEY, payload);
}

/**
 * INSIDE-R1S1 — previous session stays inside max(R1, PH) … min(S1, PL).
 *
 * Independent of CON-A / CON-B (those use BC/TC). Bodies only; wicks ignored.
 *
 *   Fail when any completed 15m candle has:
 *     • any part of its body above `ceiling` (max of R1, PH), OR
 *     • any part of its body below `floor` (min of S1, PL).
 *
 * This matches the visual “between R1/PH and S1/PL” band. When CON/MOM all
 * fail but this band holds, exclusive bucketing assigns INSIDE-R1S1.
 *
 * Returns null when there are no usable completed candles.
 */
export function passesInsideR1S1Filter(
  candles: OHLC[],
  floor: number,
  ceiling: number,
  startTime: number,
  now: number,
): boolean | null {
  if (!Number.isFinite(floor) || !Number.isFinite(ceiling)) return null;
  if (floor > ceiling) return null;

  const completed = candles
    .filter(
      (candle) =>
        Number.isFinite(candle.openTime) &&
        candle.openTime >= startTime &&
        candle.openTime + CANDLE_INTERVAL_MS <= now &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.close),
    )
    .sort((a, b) => a.openTime - b.openTime);
  if (completed.length === 0) return null;

  for (const candle of completed) {
    const bodyHigh = Math.max(candle.open, candle.close);
    const bodyLow = Math.min(candle.open, candle.close);
    // Any body touch beyond the band fails (not full-body-only / wick-ref).
    if (bodyHigh > ceiling || bodyLow < floor) {
      return false;
    }
  }

  return true;
}

/**
 * Batch scan for INSIDE-R1S1. Candidates must carry floor + ceiling
 * (getPrevious15MBFloor / getPrevious15MACeiling). `candidate.bc` is unused
 * for the pass rule but still required by UpexCandidate.
 */
export function findInsideR1S1Symbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now(),
): Promise<PreviousUpexScanResults> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  return findInsideR1S1ForSession(candidates, startTime, endTime, onProgress);
}

async function findInsideR1S1ForSession(
  candidates: UpexCandidate[],
  startTime: number,
  endTime: number,
  onProgress?: (done: number, total: number) => void,
): Promise<PreviousUpexScanResults> {
  const included = new Set<string>();
  const outcomes = new Map<string, boolean | null>();
  let unavailable = 0;

  for (let offset = 0; offset < candidates.length; offset += MAX_CONCURRENT_REQUESTS) {
    const batch = candidates.slice(offset, offset + MAX_CONCURRENT_REQUESTS);
    const results = await Promise.all(
      batch.map(async (candidate) => {
        const floor = candidate.floor;
        const ceiling = candidate.ceiling;
        if (floor === undefined || ceiling === undefined) {
          return { candidate, passes: null as boolean | null };
        }
        const candles = await fetchUpexCandles(candidate, startTime, endTime);
        if (!candles) return { candidate, passes: null as boolean | null };
        return {
          candidate,
          passes: passesInsideR1S1Filter(candles, floor, ceiling, startTime, endTime),
        };
      }),
    );

    for (const { candidate, passes } of results) {
      const symbolKey = `${candidate.source}:${candidate.symbol}`;
      outcomes.set(symbolKey, passes);
      if (passes === true) included.add(symbolKey);
      else if (passes === null) unavailable++;
    }
    onProgress?.(Math.min(offset + batch.length, candidates.length), candidates.length);
  }

  return { included, unavailable, outcomes };
}

export function previousInsideR1S1CandidateCacheKey(
  sessionStart: number,
  candidate: UpexCandidate,
): string {
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.floor}:${candidate.ceiling}`;
}

export function loadPreviousInsideR1S1Results(
  sessionStart: number,
): Map<string, boolean | null> {
  try {
    const raw = localStorage.getItem(PREVIOUS_15M_INSIDE_R1S1_CACHE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("sessionStart" in parsed) ||
      (parsed as { sessionStart: number }).sessionStart !== sessionStart ||
      !("results" in parsed) ||
      !(parsed as { results: unknown }).results ||
      typeof (parsed as { results: unknown }).results !== "object"
    ) {
      return new Map();
    }
    const results = new Map<string, boolean | null>();
    for (const [key, value] of Object.entries(
      (parsed as { results: Record<string, unknown> }).results,
    )) {
      if (typeof value === "boolean") results.set(key, value);
    }
    return results;
  } catch {
    return new Map();
  }
}

export function savePreviousInsideR1S1Results(
  sessionStart: number,
  results: Map<string, boolean | null>,
): void {
  const payload = JSON.stringify({
    sessionStart,
    results: Object.fromEntries(
      [...results].filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    ),
  });
  safeSetItem(PREVIOUS_15M_INSIDE_R1S1_CACHE_KEY, payload);
}


export function previous15MBCandidateCacheKey(
  sessionStart: number,
  candidate: UpexCandidate,
): string {
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.floor}`;
}

export function loadPrevious15MBResults(
  sessionStart: number,
): Map<string, boolean | null> {
  try {
    const raw = localStorage.getItem(PREVIOUS_15M_B_CACHE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("sessionStart" in parsed) ||
      parsed.sessionStart !== sessionStart ||
      !("results" in parsed) ||
      !parsed.results ||
      typeof parsed.results !== "object"
    ) {
      return new Map();
    }

    const results = new Map<string, boolean | null>();
    for (const [key, value] of Object.entries(parsed.results)) {
      if (typeof value === "boolean") {
        results.set(key, value);
      }
    }
    return results;
  } catch {
    return new Map();
  }
}

export function savePrevious15MBResults(
  sessionStart: number,
  results: Map<string, boolean | null>,
): void {
  const payload = JSON.stringify({
    sessionStart,
    results: Object.fromEntries(
      [...results].filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    ),
  });
  safeSetItem(PREVIOUS_15M_B_CACHE_KEY, payload);
}

const previousUpexPassCache = new Map<string, Promise<boolean | null>>();
const previous15MBPassCache = new Map<string, Promise<boolean | null>>();
const pd15MBelowTCPassCache = new Map<string, Promise<boolean | null>>();

/** Cache key shared by findPD15MBelowTCPass and the failure-note lookup. */
function pd15MBelowTCKey(candidate: UpexCandidate, startTime: number): string {
  return `${startTime}:${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.floor}`;
}

type PD15MBelowTCFailureInfo = NonNullable<ReturnType<typeof explainPD15MBelowTCFailure>>;

/**
 * Why each PD15MBelowTC evaluation last failed (same key as the pass cache),
 * or "noCandles" when the 15m data was unavailable. Read by
 * getPD15MBelowTCFailureNote so the Backtest View cell can say WHY
 * P-CONSOLIDATE-B didn't light up without opening the console.
 */
const pd15MBelowTCFailureCache = new Map<string, PD15MBelowTCFailureInfo | "noCandles">();
const pd15MBelowTCPassInfoCache = new Map<string, PD15MBelowTCPassInfo>();

/** Readable "why it passed" note for a CONSOLIDATE-B / MOMENTUM-B pass (await findPD15MBelowTCPass first). */
export function getPD15MBelowTCPassNote(
  candidate: UpexCandidate,
  now: number,
  tcName = "TC",
): { label: string; detail: string } | null {
  const info = pd15MBelowTCPassInfoCache.get(
    pd15MBelowTCKey(candidate, previousUpexSessionStartUtcMs(now)),
  );
  if (!info) return null;
  const parts: string[] = [`${info.candles} candles`];
  parts.push(
    info.excusedAboveTc.length === 0
      ? `no body fully above ${tcName} ${info.tc}`
      : `bodies above ${tcName} ${info.tc} only at #${info.excusedAboveTc.join(", #")} (stayed within TC reference wick high)`,
  );
  if (info.floor !== undefined) {
    parts.push(
      info.floorRefCandle === null
        ? `no body below floor ${info.floor}`
        : `first body below floor ${info.floor} at #${info.floorRefCandle}, wick ref ${info.floorRef}, never broken`,
    );
  }
  if (info.highestHigh !== null && info.lowestLow !== null) {
    parts.push(`session range ${info.lowestLow}–${info.highestHigh}`);
  }
  return { label: `${tcName} ${info.tc}`, detail: parts.join(" · ") };
}

/**
 * Human-readable reason the previous-session CONSOLIDATE-B / MOMENTUM-B check
 * failed for `candidate` (same candidate you passed to findPD15MBelowTCPass —
 * `await` that first). `tcName` labels the ceiling in use ("PDay TC" or
 * "PPDay TC"). Returns null when no failure was recorded (it passed, or the
 * check never ran).
 */
export function getPD15MBelowTCFailureNote(
  candidate: UpexCandidate,
  now: number,
  tcName = "TC",
): { label: string; detail: string } | null {
  const failure = pd15MBelowTCFailureCache.get(
    pd15MBelowTCKey(candidate, previousUpexSessionStartUtcMs(now)),
  );
  if (!failure) return null;
  if (failure === "noCandles") {
    return { label: "no 15m data", detail: "Previous-session 15m candles were unavailable, so the check could not run." };
  }
  const ist = new Date(Date.parse(failure.openTime) + 19_800_000).toISOString().slice(11, 16);
  const hhmm = `#${failure.candleNumber} (${ist} IST)`;
  const body = `${failure.open}→${failure.close}`;
  switch (failure.rule) {
    case "freshHighAboveTC":
      return {
        label: `fresh high > ${tcName} · candle #${failure.candleNumber}`,
        detail:
          `#${failure.candleNumber} (${ist} IST) body ${body}, body top ${Math.max(failure.open, failure.close)}` +
          ` > earlier high ${failure.previousHighestWick ?? "—"}` +
          (failure.previousHighestWickCandle ? ` (candle #${failure.previousHighestWickCandle})` : "") +
          ` · ${tcName} ${failure.tc}`,
      };
    case "bodyInS2":
      return {
        label: `body ≤ S2 · candle #${failure.candleNumber}`,
        detail: `candle ${hhmm} body ${body} reached S2 (first body at/below S2, or a new low) — this is MOMENTUM-B, not CONSOLIDATE-B.`,
      };
    case "floor":
      return {
        label: `broke below floor wick · candle #${failure.candleNumber}`,
        detail: `candle ${hhmm} body ${body} went below the low-wick reference ${failure.previousLowestWick ?? "—"} set after the first body under the PL/S1 floor ${failure.floor ?? "—"}.`,
      };
  }
}
const previousConsolidateAPassCache = new Map<string, Promise<boolean | null>>();
const MAX_PREVIOUS_UPEX_CACHE_ENTRIES = 20_000;

/**
 * Evaluate one symbol's previous-session candles for a historical/current
 * session boundary. Successful pass/fail results are cached for date sweeps;
 * unavailable candle data is not cached so a later retry can recover.
 */
export function findPreviousUpexPass(
  candidate: UpexCandidate,
  now: number
): Promise<boolean | null> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  const key =
    `${startTime}:${candidate.source}:${candidate.symbol}:${candidate.bc}`;
  const cached = previousUpexPassCache.get(key);
  if (cached) return cached;

  const request = findSymbolsForSession([candidate], startTime, endTime).then(
    ({ included, unavailable }) => {
      if (unavailable > 0) {
        previousUpexPassCache.delete(key);
        return null;
      }
      if (previousUpexPassCache.size > MAX_PREVIOUS_UPEX_CACHE_ENTRIES) {
        const oldestKey = previousUpexPassCache.keys().next().value;
        if (oldestKey) previousUpexPassCache.delete(oldestKey);
      }
      return included.has(`${candidate.source}:${candidate.symbol}`);
    },
    (error: unknown) => {
      previousUpexPassCache.delete(key);
      throw error;
    }
  );
  previousUpexPassCache.set(key, request);
  return request;
}

/**
 * Previous-session CONSOLIDATE-A pass for a single symbol (the per-symbol
 * counterpart of findPreviousConsolidateASymbols). `candidate.bc` is the
 * previous day's BC and `candidate.ceiling` the higher of previous PH / R1
 * (see getPrevious15MACeiling). Own cache so results never collide with the
 * ceiling-less MOMENTUM-A results from findPreviousUpexPass.
 */
export function findPreviousConsolidateAPass(
  candidate: UpexCandidate,
  now: number
): Promise<boolean | null> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  const key =
    `${startTime}:${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.ceiling}:${candidate.r2}`;
  const cached = previousConsolidateAPassCache.get(key);
  if (cached) return cached;

  const request = findSymbolsForSession(
    [candidate],
    startTime,
    endTime,
    undefined,
    passesUpexFilter,
  ).then(
    ({ included, unavailable }) => {
      if (unavailable > 0) {
        previousConsolidateAPassCache.delete(key);
        return null;
      }
      if (previousConsolidateAPassCache.size > MAX_PREVIOUS_UPEX_CACHE_ENTRIES) {
        const oldestKey = previousConsolidateAPassCache.keys().next().value;
        if (oldestKey) previousConsolidateAPassCache.delete(oldestKey);
      }
      return included.has(`${candidate.source}:${candidate.symbol}`);
    },
    (error: unknown) => {
      previousConsolidateAPassCache.delete(key);
      throw error;
    }
  );
  previousConsolidateAPassCache.set(key, request);
  return request;
}

const previousInsideR1S1PassCache = new Map<string, Promise<boolean | null>>();

/**
 * Previous-session INSIDE-R1S1 pass for one symbol (max R1/PH – min S1/PL).
 * Independent of CON-A / CON-B.
 */
export function findInsideR1S1Pass(
  candidate: UpexCandidate,
  now: number
): Promise<boolean | null> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  const floor = candidate.floor;
  const ceiling = candidate.ceiling;
  const key =
    `${startTime}:${candidate.source}:${candidate.symbol}:${floor}:${ceiling}`;
  const cached = previousInsideR1S1PassCache.get(key);
  if (cached) return cached;

  const request = findInsideR1S1ForSession(
    [candidate],
    startTime,
    endTime,
  ).then(
    ({ included, unavailable }) => {
      if (unavailable > 0) {
        previousInsideR1S1PassCache.delete(key);
        return null;
      }
      if (previousInsideR1S1PassCache.size > MAX_PREVIOUS_UPEX_CACHE_ENTRIES) {
        const oldestKey = previousInsideR1S1PassCache.keys().next().value;
        if (oldestKey) previousInsideR1S1PassCache.delete(oldestKey);
      }
      return included.has(`${candidate.source}:${candidate.symbol}`);
    },
    (error: unknown) => {
      previousInsideR1S1PassCache.delete(key);
      throw error;
    },
  );
  previousInsideR1S1PassCache.set(key, request);
  return request;
}


export function findPD15MBelowPass(
  candidate: UpexCandidate,
  now: number
): Promise<boolean | null> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  const key =
    `${startTime}:${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.floor}:${candidate.s2}`;
  const cached = previous15MBPassCache.get(key);
  if (cached) return cached;

  const request = findSymbolsForSession(
    [candidate],
    startTime,
    endTime,
    undefined,
    passesPrevious15MBFilter,
  ).then(
    ({ included, unavailable }) => {
      if (unavailable > 0) {
        previous15MBPassCache.delete(key);
        return null;
      }
      if (previous15MBPassCache.size > MAX_PREVIOUS_UPEX_CACHE_ENTRIES) {
        const oldestKey = previous15MBPassCache.keys().next().value;
        if (oldestKey) previous15MBPassCache.delete(oldestKey);
      }
      return included.has(`${candidate.source}:${candidate.symbol}`);
    },
    (error: unknown) => {
      previous15MBPassCache.delete(key);
      throw error;
    }
  );
  previous15MBPassCache.set(key, request);
  return request;
}

/**
 * Previous-day 15m "Below TC" pass for a single symbol (CONSOLIDATE-B).
 * Pass `candidate.bc` = the previous day's TC (the field name is historical;
 * it is simply the level under test). Passes unless a completed 15m candle in
 * the previous session has its whole body above that level AND makes a new
 * high versus earlier candles, or has its whole body below `candidate.floor`
 * (lower of previous PL / S1) when one is supplied (see
 * passesPD15MBelowTCFilter).
 * Own cache so TC results never collide with the BC-based P-15M-B results.
 */
export function findPD15MBelowTCPass(
  candidate: UpexCandidate,
  now: number
): Promise<boolean | null> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  const key = pd15MBelowTCKey(candidate, startTime);
  const cached = pd15MBelowTCPassCache.get(key);
  if (cached) return cached;

  const request = findSymbolsForSession(
    [candidate],
    startTime,
    endTime,
    undefined,
    (candles, tc, st, now_, floor) => {
      const passes = passesPD15MBelowTCFilter(candles, tc, st, now_, floor, candidate.s2);
      if (passes === false) {
        const failure = explainPD15MBelowTCFailure(candles, tc, st, now_, floor, candidate.s2);
        if (failure) pd15MBelowTCFailureCache.set(key, failure);
        if (shouldDebugPD15M(candidate.symbol)) {
          console.info(
            `[PD15MBelowTC] ${candidate.source}:${candidate.symbol} FAILED`,
            failure
          );
        }
      } else if (passes === true) {
        pd15MBelowTCFailureCache.delete(key);
        const info = explainPD15MBelowTCPass(candles, tc, st, now_, floor);
        if (info) pd15MBelowTCPassInfoCache.set(key, info);
      }
      return passes;
    },
  ).then(
    ({ included, unavailable }) => {
      if (unavailable > 0) {
        pd15MBelowTCPassCache.delete(key);
        pd15MBelowTCFailureCache.set(key, "noCandles");
        return null;
      }
      if (pd15MBelowTCPassCache.size > MAX_PREVIOUS_UPEX_CACHE_ENTRIES) {
        const oldestKey = pd15MBelowTCPassCache.keys().next().value;
        if (oldestKey) pd15MBelowTCPassCache.delete(oldestKey);
      }
      return included.has(`${candidate.source}:${candidate.symbol}`);
    },
    (error: unknown) => {
      pd15MBelowTCPassCache.delete(key);
      throw error;
    }
  );
  pd15MBelowTCPassCache.set(key, request);
  return request;
}

/* ---------------------------------------------------------------------------
 * RECLAIM-S / RECLAIM-R — live, CURRENT-session failed-break flags.
 *
 * Unlike the P-CONSOLIDATE / P-MOMENTUM checks above (which judge the PREVIOUS
 * session once per day), these describe how TODAY is playing out: price broke
 * through one or more of today's S1..S4 (or R1..R4) levels and has since come
 * back inside them — a round trip / failed break.
 *
 *  - pierced   = how many levels (counted outward from S1 / R1) a completed
 *                15m candle has broken so far this session (see
 *                RECLAIM_BREAK_MODE). Needs candles, so it is fetched per
 *                15m window and can only grow within a session.
 *  - recrossed = how many of those pierced levels the CURRENT price is back
 *                inside. Computed from the live price at render time, so it
 *                updates on every tick with no refetch.
 *
 * A row gets the RECLAIM badge / filter once recrossed >= RECLAIM_MIN_RECROSSED.
 * Shown as "RECLAIM-S 2/3" = 3 levels pierced, price back above 2 of them.
 * ------------------------------------------------------------------------- */

/**
 * What counts as a level being "pierced" by a completed 15m candle:
 *  - "body"  : the WHOLE body is beyond the level (open AND close) — same
 *              convention as the previous-session checks above (default).
 *  - "close" : the candle's close is beyond the level.
 *  - "wick"  : the candle's high/low touched beyond the level.
 * "wick" >= "close" >= "body" in sensitivity (wick shows the deepest depth).
 */
export type ReclaimBreakMode = "body" | "close" | "wick";
export const RECLAIM_BREAK_MODE: ReclaimBreakMode = "body";
/** Minimum number of pierced levels price must be back inside for the badge / filter. */
export const RECLAIM_MIN_RECROSSED = 2;

/** Wait this long after a 15m boundary before treating the new window as settled. */
const RECLAIM_SETTLE_MS = 5_000;

/**
 * Start (UTC ms) of the trading session containing `now`: the most recent
 * 00:00 UTC (= 05:30 IST), i.e. the same daily candle boundary the CPR levels
 * are built on (same as upexSessionStartUtcMs).
 */
export function currentSessionStartUtcMs(now = Date.now()): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/**
 * Open time (UTC ms) of the forming 15m candle, i.e. the end of the last
 * completed one, lagged by RECLAIM_SETTLE_MS so a just-closed candle is final
 * before it is evaluated. Changes once every 15 minutes.
 */
export function currentReclaimWindowMs(now = Date.now()): number {
  return Math.floor((now - RECLAIM_SETTLE_MS) / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS;
}

type Four = [number, number, number, number];

/** Today's support / resistance ladders, shallowest first: [s1..s4], [r1..r4]. */
export interface ReclaimLevels {
  s: Four;
  r: Four;
}

export function reclaimLevelsFromCPR(cpr: {
  s1: number; s2: number; s3: number; s4: number;
  r1: number; r2: number; r3: number; r4: number;
}): ReclaimLevels {
  return {
    s: [cpr.s1, cpr.s2, cpr.s3, cpr.s4],
    r: [cpr.r1, cpr.r2, cpr.r3, cpr.r4],
  };
}

export interface ReclaimCandidate {
  symbol: string;
  source: FifteenMinuteSource;
  levels: ReclaimLevels;
}

export interface ReclaimDepth {
  /** Support levels pierced so far this session (0..4, counted from S1). */
  sPierced: number;
  /** Resistance levels pierced so far this session (0..4, counted from R1). */
  rPierced: number;
}

/**
 * Cheap necessary condition for any candle to have pierced S1 or R1, from the
 * row's live daily high/low (and price). Every break mode needs at least a wick
 * beyond the level, so a row whose day range never left [S1, R1] can be skipped
 * without a candle request. Unknown high/low -> true (fetch to be safe).
 */
export function mayHavePiercedFirstLevel(row: {
  todayCPR: { s1: number; r1: number };
  currentPrice: number;
  todayHigh?: number;
  todayLow?: number;
}): boolean {
  const { s1, r1 } = row.todayCPR;
  const lo = row.todayLow;
  const hi = row.todayHigh;
  if (lo === undefined || hi === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) {
    return true;
  }
  const px = row.currentPrice;
  return lo <= s1 || hi >= r1 || (Number.isFinite(px) && (px <= s1 || px >= r1));
}

/**
 * Walk the session's COMPLETED 15m candles and return how many S / R levels
 * have been pierced (see ReclaimBreakMode). `now` bounds "completed": a candle
 * counts only when openTime + 15m <= now.
 */
export function computeReclaimDepth(
  candles: OHLC[],
  levels: ReclaimLevels,
  startTime: number,
  now: number,
  mode: ReclaimBreakMode = RECLAIM_BREAK_MODE
): ReclaimDepth {
  let sPierced = 0;
  let rPierced = 0;
  for (const candle of candles) {
    if (
      !Number.isFinite(candle.openTime) ||
      candle.openTime < startTime ||
      candle.openTime + CANDLE_INTERVAL_MS > now ||
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.close) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low)
    ) {
      continue;
    }
    // The value that has to be beyond a level for that level to count as
    // pierced: body mode needs the WHOLE body beyond it (so the body's near
    // edge), close mode the close, wick mode the extreme.
    const sRef =
      mode === "body" ? Math.max(candle.open, candle.close)
      : mode === "close" ? candle.close
      : candle.low;
    const rRef =
      mode === "body" ? Math.min(candle.open, candle.close)
      : mode === "close" ? candle.close
      : candle.high;
    while (sPierced < 4 && sRef < levels.s[sPierced]) sPierced++;
    while (rPierced < 4 && rRef > levels.r[rPierced]) rPierced++;
  }
  return { sPierced, rPierced };
}

/**
 * Fetch the current session's completed 15m candles for each candidate and
 * compute its pierced depth. `now` should be currentReclaimWindowMs(): the
 * request window is then identical for every call inside one 15m window, so
 * the shared per-session candle cache de-duplicates repeat requests. A symbol
 * whose candles could not be fetched is counted as unavailable (and omitted
 * from `depths`); a symbol with candles but nothing pierced yet gets 0 / 0.
 */
export async function findReclaimDepths(
  candidates: ReclaimCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = currentReclaimWindowMs()
): Promise<{ depths: Map<string, ReclaimDepth>; unavailable: number }> {
  const windowEnd = Math.floor(now / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS;
  const startTime = currentSessionStartUtcMs(windowEnd);
  const depths = new Map<string, ReclaimDepth>();
  let unavailable = 0;

  for (let offset = 0; offset < candidates.length; offset += MAX_CONCURRENT_REQUESTS) {
    const batch = candidates.slice(offset, offset + MAX_CONCURRENT_REQUESTS);
    const results = await Promise.all(
      batch.map(async (candidate) => {
        // Nothing can be completed before the first 15m window of a session.
        if (windowEnd <= startTime) {
          return { candidate, depth: { sPierced: 0, rPierced: 0 } as ReclaimDepth | null };
        }
        const candles = await fetchUpexCandles(candidate, startTime, windowEnd);
        return {
          candidate,
          depth: candles ? computeReclaimDepth(candles, candidate.levels, startTime, windowEnd) : null,
        };
      })
    );
    for (const { candidate, depth } of results) {
      if (depth === null) unavailable++;
      else depths.set(`${candidate.source}:${candidate.symbol}`, depth);
    }
    onProgress?.(Math.min(offset + batch.length, candidates.length), candidates.length);
  }
  return { depths, unavailable };
}

/** One side (S = failed breakdown, R = failed breakout) of a row's live RECLAIM state. */
export interface ReclaimSideState {
  side: "S" | "R";
  mode: ReclaimBreakMode;
  /** Levels pierced this session (1..4), counted from S1 / R1. */
  pierced: number;
  /** Of those, how many the current price is back inside (0..pierced). */
  recrossed: number;
  /** Values of the pierced levels, shallowest first. */
  levels: number[];
  price: number;
  /** Day low (S) / day high (R) when it lies beyond the first level. */
  extreme?: number;
  /** % of the way from `extreme` back to the first level (>= 100 = first level fully reclaimed). */
  retracePct?: number;
  /** recrossed >= RECLAIM_MIN_RECROSSED — drives the badge and the filter. */
  qualifies: boolean;
}

function reclaimSideState(
  side: "S" | "R",
  ladder: Four,
  pierced: number,
  price: number,
  dayExtreme: number | undefined
): ReclaimSideState | null {
  if (pierced <= 0 || !Number.isFinite(price)) return null;
  const levels = ladder.slice(0, Math.min(pierced, 4));
  const recrossed = levels.filter((lvl) => (side === "S" ? price > lvl : price < lvl)).length;
  const first = ladder[0];
  let extreme: number | undefined;
  let retracePct: number | undefined;
  if (dayExtreme !== undefined && Number.isFinite(dayExtreme)) {
    const span = side === "S" ? first - dayExtreme : dayExtreme - first;
    if (span > 0) {
      extreme = dayExtreme;
      retracePct = Math.round(((side === "S" ? price - dayExtreme : dayExtreme - price) / span) * 100);
    }
  }
  return {
    side,
    mode: RECLAIM_BREAK_MODE,
    pierced: levels.length,
    recrossed,
    levels,
    price,
    extreme,
    retracePct,
    qualifies: recrossed >= RECLAIM_MIN_RECROSSED,
  };
}

/**
 * Live RECLAIM state for a row from its pierced depth (fetched per 15m window)
 * and its current price / day range (live). Pure and cheap — call it at
 * render / filter time.
 */
export function getReclaimStates(
  row: {
    todayCPR: {
      s1: number; s2: number; s3: number; s4: number;
      r1: number; r2: number; r3: number; r4: number;
    };
    currentPrice: number;
    todayHigh?: number;
    todayLow?: number;
  },
  depth: ReclaimDepth | undefined
): { s: ReclaimSideState | null; r: ReclaimSideState | null } {
  if (!depth) return { s: null, r: null };
  const { s, r } = reclaimLevelsFromCPR(row.todayCPR);
  return {
    s: reclaimSideState("S", s, depth.sPierced, row.currentPrice, row.todayLow),
    r: reclaimSideState("R", r, depth.rPierced, row.currentPrice, row.todayHigh),
  };
}
