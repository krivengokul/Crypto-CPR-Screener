import type { OHLC } from "./cpr";
import { safeSetItem } from "./safeStorage.ts";

type FifteenMinuteSource = "binance" | "delta";

const DELTA_BASE = "https://api.india.delta.exchange/v2";
const CANDLE_INTERVAL_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 8;
const PREVIOUS_UPEX_CACHE_KEY = "cpr_previous_upex_results_v1";
const PREVIOUS_15M_B_CACHE_KEY = "cpr_previous_15m_b_results_v3";
const PREVIOUS_15M_TC_B_CACHE_KEY = "cpr_previous_15m_tc_b_results_v5";
const PREVIOUS_15M_MOMENTUM_B_CACHE_KEY = "cpr_previous_15m_momentum_b_results_v1";
const PREVIOUS_15M_CONSOLIDATE_A_CACHE_KEY = "cpr_previous_15m_consolidate_a_results_v2";

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

/**
 * MOMENTUM-A (PD15M>BC; becomes CONSOLIDATE-A when a `ceiling` is supplied): walk the previous
 * session's completed 15m candles in time order.
 *  - BC rule: fail when a candle's WHOLE body is below `bc` AND the body's
 *    bottom is lower than the lowest wick of any earlier candle (a fresh low).
 *  - Ceiling rule (CONSOLIDATE-A, mirror of the BC rule): fail when a candle's
 *    WHOLE body is above `ceiling` (higher of previous PH / R1) AND the body's
 *    top is higher than the highest wick of any earlier candle (a fresh high).
 *    A body above the ceiling that stays at or under an earlier candle's high
 *    does not fail. The first candle has no earlier wick, so a full body above
 *    the ceiling on it fails (same as the BC rule).
 */
export function passesUpexFilter(
  candles: OHLC[],
  bc: number,
  startTime: number,
  now: number,
  ceiling?: number
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

  let previousLowestWick: number | null = null;
  let previousHighestWick: number | null = null;
  for (const candle of completed) {
    if (
      ceiling !== undefined &&
      candle.open > ceiling &&
      candle.close > ceiling &&
      (previousHighestWick === null ||
        Math.max(candle.open, candle.close) > previousHighestWick)
    ) {
      return false;
    }
    const fullBodyBelowBc = candle.open < bc && candle.close < bc;
    const bodyLow = Math.min(candle.open, candle.close);
    if (
      fullBodyBelowBc &&
      (previousLowestWick === null || bodyLow < previousLowestWick)
    ) {
      return false;
    }
    previousLowestWick =
      previousLowestWick === null
        ? candle.low
        : Math.min(previousLowestWick, candle.low);
    if (Number.isFinite(candle.high)) {
      previousHighestWick =
        previousHighestWick === null
          ? candle.high
          : Math.max(previousHighestWick, candle.high);
    }
  }

  return true;
}

/**
 * What made passesPD15MBelowTCFilter fail: which rule, which candle, and the
 * wick references that candle was judged against.
 */
interface PD15MBelowTCFailure {
  rule: "floor" | "freshHighAboveTC";
  candle: OHLC;
  previousHighestWick: number | null;
  previousLowestWick: number | null;
}

/**
 * Core walk shared by passesPD15MBelowTCFilter and explainPD15MBelowTCFailure.
 * `completed` must already be filtered and sorted by time. Returns the first
 * failure, or null when the session passes.
 *
 * Next-candle confirmation (`confirmWithNextCandle`), one per side:
 * - Upper: a candle whose whole body is above `tc` and whose body top beats
 *   every earlier wick is a "crossing" candle. Normally that fails the
 *   session. With confirmation, if the IMMEDIATE next candle's high is above
 *   the crossing candle's high, the crossing candle is forgiven and the next
 *   candle's top wick becomes the reference for all later candles (the next
 *   candle itself is not judged by the TC rule). If there is no next candle,
 *   or it does not make a higher high, the crossing candle fails as before.
 * - Lower (mirror): a candle whose whole body is below `floor` with a body
 *   bottom under every earlier wick low is forgiven when the immediate next
 *   candle's low is under the crossing candle's low; that low then becomes
 *   the reference.
 * Each side is forgiven at most once: any later fresh high above TC (or fresh
 * low below the floor) beyond the new reference fails the session.
 */
function findPD15MBelowTCFailure(
  completed: OHLC[],
  tc: number,
  floor: number | undefined,
  confirmWithNextCandle: boolean
): PD15MBelowTCFailure | null {
  let previousHighestWick: number | null = null;
  let previousLowestWick: number | null = null;
  let upperConfirmUsed = false;
  let lowerConfirmUsed = false;
  let upperConfirming = false; // this candle is the confirmation candle
  let lowerConfirming = false;

  for (let i = 0; i < completed.length; i++) {
    const candle = completed[i];
    const next: OHLC | undefined = completed[i + 1];
    const skipLower = lowerConfirming;
    const skipUpper = upperConfirming;
    lowerConfirming = false;
    upperConfirming = false;

    const fullBodyBelowFloor =
      floor !== undefined && candle.open < floor && candle.close < floor;
    const bodyLow = Math.min(candle.open, candle.close);
    if (
      fullBodyBelowFloor &&
      !skipLower &&
      (previousLowestWick === null || bodyLow < previousLowestWick)
    ) {
      if (
        confirmWithNextCandle &&
        !lowerConfirmUsed &&
        next !== undefined &&
        next.low < candle.low
      ) {
        lowerConfirmUsed = true;
        lowerConfirming = true;
      } else {
        return { rule: "floor", candle, previousHighestWick, previousLowestWick };
      }
    }

    const fullBodyAboveTc = candle.open > tc && candle.close > tc;
    const bodyHigh = Math.max(candle.open, candle.close);
    if (
      fullBodyAboveTc &&
      !skipUpper &&
      (previousHighestWick === null || bodyHigh > previousHighestWick)
    ) {
      if (
        confirmWithNextCandle &&
        !upperConfirmUsed &&
        next !== undefined &&
        next.high > candle.high
      ) {
        upperConfirmUsed = true;
        upperConfirming = true;
      } else {
        return {
          rule: "freshHighAboveTC",
          candle,
          previousHighestWick,
          previousLowestWick,
        };
      }
    }

    // After a forgiven crossing the next candle's high/low is the highest/
    // lowest wick so far (it is beyond the crossing candle's), so the usual
    // running max/min below already makes it the reference.
    previousHighestWick =
      previousHighestWick === null
        ? candle.high
        : Math.max(previousHighestWick, candle.high);
    previousLowestWick =
      previousLowestWick === null
        ? candle.low
        : Math.min(previousLowestWick, candle.low);
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
        Number.isFinite(candle.high)
    )
    .sort((a, b) => a.openTime - b.openTime);
}

/**
 * CONSOLIDATE-B ("Below TC"), the mirror image of passesUpexFilter (MOMENTUM-A / BC):
 * walk the previous session's completed 15m candles in time order and fail as
 * soon as a candle's WHOLE body is above `tc` AND that body's top is higher
 * than the highest wick seen on any earlier candle (a fresh high above TC).
 * A body above TC that stays at or under an earlier candle's high does not
 * fail. The first candle has no earlier wick, so a full body above TC on it
 * fails (same as the BC rule).
 *
 * Optional `floor` (lower of the previous CPR's PL / S1, see
 * getPrevious15MBFloor) adds the mirror-image second rule: the session also
 * fails if a candle's whole body is below the floor AND that body's bottom is
 * lower than the lowest wick seen on any earlier candle (a fresh low below
 * the floor). A body below the floor that stays at or above an earlier
 * candle's low does not fail; neither does a wick below the floor or a body
 * exactly on it. The first candle has no earlier wick, so a full body below
 * the floor on it fails (same as the TC rule). Without a floor only the TC
 * rule applies.
 *
 * `confirmWithNextCandle` (defaults to ON when a floor is supplied, i.e. for
 * CONSOLIDATE-B, and OFF for MOMENTUM-B which has no floor) enables the
 * next-candle confirmation described on findPD15MBelowTCFailure.
 */
export function passesPD15MBelowTCFilter(
  candles: OHLC[],
  tc: number,
  startTime: number,
  now: number,
  floor?: number,
  confirmWithNextCandle: boolean = floor !== undefined
): boolean | null {
  if (!Number.isFinite(tc)) return null;
  if (floor !== undefined && !Number.isFinite(floor)) return null;

  const completed = completedBelowTCCandles(candles, startTime, now);
  if (completed.length === 0) return null;

  return findPD15MBelowTCFailure(completed, tc, floor, confirmWithNextCandle) === null;
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
  confirmWithNextCandle: boolean = floor !== undefined
): {
  rule: "floor" | "freshHighAboveTC";
  openTime: string;
  open: number;
  close: number;
  tc: number;
  floor?: number;
  previousHighestWick: number | null;
  previousLowestWick: number | null;
} | null {
  if (!Number.isFinite(tc)) return null;
  const effectiveFloor =
    floor !== undefined && Number.isFinite(floor) ? floor : undefined;
  const failure = findPD15MBelowTCFailure(
    completedBelowTCCandles(candles, startTime, now),
    tc,
    effectiveFloor,
    confirmWithNextCandle
  );
  if (!failure) return null;
  return {
    rule: failure.rule,
    openTime: new Date(failure.candle.openTime).toISOString(),
    open: failure.candle.open,
    close: failure.candle.close,
    tc,
    floor,
    previousHighestWick: failure.previousHighestWick,
    previousLowestWick: failure.previousLowestWick,
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
    floor?: number
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
          passes: evaluate(candles, candidate.bc, startTime, endTime, candidate.ceiling !== undefined ? candidate.ceiling : candidate.floor),
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
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.ceiling}`;
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
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.floor}`;
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
    `${startTime}:${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.ceiling}`;
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

export function findPD15MBelowPass(
  candidate: UpexCandidate,
  now: number
): Promise<boolean | null> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  const key =
    `${startTime}:${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.floor}`;
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
  const key =
    `${startTime}:${candidate.source}:${candidate.symbol}:${candidate.bc}:${candidate.floor}`;
  const cached = pd15MBelowTCPassCache.get(key);
  if (cached) return cached;

  const request = findSymbolsForSession(
    [candidate],
    startTime,
    endTime,
    undefined,
    (candles, tc, st, now_, floor) => {
      const passes = passesPD15MBelowTCFilter(candles, tc, st, now_, floor);
      if (passes === false && shouldDebugPD15M(candidate.symbol)) {
        console.info(
          `[PD15MBelowTC] ${candidate.source}:${candidate.symbol} FAILED`,
          explainPD15MBelowTCFailure(candles, tc, st, now_, floor)
        );
      }
      return passes;
    },
  ).then(
    ({ included, unavailable }) => {
      if (unavailable > 0) {
        pd15MBelowTCPassCache.delete(key);
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
