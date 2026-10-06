import type { OHLC } from "./cpr";
import { safeSetItem } from "./safeStorage.ts";

type FifteenMinuteSource = "binance" | "delta";

const DELTA_BASE = "https://api.india.delta.exchange/v2";
const CANDLE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 8;
const PREVIOUS_UPEX_CACHE_KEY = "cpr_previous_upex_results_v1";
const PREVIOUS_15M_B_CACHE_KEY = "cpr_previous_15m_b_results_v2";
const PREVIOUS_15M_TC_B_CACHE_KEY = "cpr_previous_15m_tc_b_results_v2";

export interface UpexCandidate {
  symbol: string;
  source: FifteenMinuteSource;
  bc: number;
}

export function getUpexBc(
  todayBc: number,
  previousBc: number,
  overlapsAboveToday: boolean
): number {
  return overlapsAboveToday ? previousBc : todayBc;
}

export function upexSessionStartUtcMs(now = Date.now()): number {
  const istNow = new Date(now + 330 * 60 * 1000);
  return Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
}

export function previousUpexSessionStartUtcMs(now = Date.now()): number {
  return upexSessionStartUtcMs(now) - 24 * 60 * 60 * 1000;
}

export function passesUpexFilter(
  candles: OHLC[],
  bc: number,
  startTime: number,
  now: number
): boolean | null {
  if (!Number.isFinite(bc)) return null;

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
  for (const candle of completed) {
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
  }

  return true;
}

/**
 * P-15M-TC-B ("Below TC"), the mirror image of passesUpexFilter (P-15M-A / BC):
 * walk the previous session's completed 15m candles in time order and fail as
 * soon as a candle's WHOLE body is above `tc` AND that body's top is higher
 * than the highest wick seen on any earlier candle (a fresh high above TC).
 * A body above TC that stays at or under an earlier candle's high does not
 * fail. The first candle has no earlier wick, so a full body above TC on it
 * fails (same as the BC rule).
 */
export function passesPD15MBelowTCFilter(
  candles: OHLC[],
  tc: number,
  startTime: number,
  now: number
): boolean | null {
  if (!Number.isFinite(tc)) return null;
  const completed = candles
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

  if (completed.length === 0) return null;

  let previousHighestWick: number | null = null;
  for (const candle of completed) {
    const fullBodyAboveTc = candle.open > tc && candle.close > tc;
    const bodyHigh = Math.max(candle.open, candle.close);
    if (
      fullBodyAboveTc &&
      (previousHighestWick === null || bodyHigh > previousHighestWick)
    ) {
      return false;
    }
    previousHighestWick =
      previousHighestWick === null
        ? candle.high
        : Math.max(previousHighestWick, candle.high);
  }
  return true;
}

export function passesPrevious15MBFilter(
  candles: OHLC[],
  bc: number,
  startTime: number,
  now: number
): boolean | null {
  if (!Number.isFinite(bc)) return null;

  const completed = candles.filter(
    (candle) =>
      Number.isFinite(candle.openTime) &&
      candle.openTime >= startTime &&
      candle.openTime + CANDLE_INTERVAL_MS <= now &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.close)
  );
  if (completed.length === 0) return null;

  // A session passes unless any candle body is wholly above the previous BC.
  return !completed.some((candle) => candle.open > bc && candle.close > bc);
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
  candidate: UpexCandidate,
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
    now: number
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
          passes: evaluate(candles, candidate.bc, startTime, endTime),
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

export function findPreviousUpexSymbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now()
): Promise<PreviousUpexScanResults> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  return findSymbolsForSession(candidates, startTime, endTime, onProgress);
}

export function findPrevious15MBSymbols(
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

export function findPrevious15MTCSymbols(
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
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.bc}`;
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

export function previous15MBCandidateCacheKey(
  sessionStart: number,
  candidate: UpexCandidate,
): string {
  return `${sessionStart}|${candidate.source}:${candidate.symbol}:${candidate.bc}`;
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

export function findPrevious15MBPass(
  candidate: UpexCandidate,
  now: number
): Promise<boolean | null> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  const key =
    `${startTime}:${candidate.source}:${candidate.symbol}:${candidate.bc}`;
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
 * Previous-day 15m "Below TC" pass for a single symbol (P-15M-TC-B).
 * Pass `candidate.bc` = the previous day's TC (the field name is historical;
 * it is simply the level under test). Passes unless a completed 15m candle in
 * the previous session has its whole body above that level AND makes a new
 * high versus earlier candles (see passesPD15MBelowTCFilter).
 * Own cache so TC results never collide with the BC-based P-15M-B results.
 */
export function findPD15MBelowTCPass(
  candidate: UpexCandidate,
  now: number
): Promise<boolean | null> {
  const endTime = upexSessionStartUtcMs(now);
  const startTime = previousUpexSessionStartUtcMs(now);
  const key =
    `${startTime}:${candidate.source}:${candidate.symbol}:${candidate.bc}`;
  const cached = pd15MBelowTCPassCache.get(key);
  if (cached) return cached;

  const request = findSymbolsForSession(
    [candidate],
    startTime,
    endTime,
    undefined,
    passesPD15MBelowTCFilter,
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
