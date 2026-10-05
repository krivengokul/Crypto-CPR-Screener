import type { OHLC } from "./cpr";
import { safeSetItem } from "./safeStorage.ts";

type FifteenMinuteSource = "binance" | "delta";

const DELTA_BASE = "https://api.india.delta.exchange/v2";
const CANDLE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 8;
const PREVIOUS_UPEX_CACHE_KEY = "cpr_previous_upex_results_v1";

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

async function fetchUpexCandles(
  candidate: UpexCandidate,
  startTime: number,
  endTime: number
): Promise<OHLC[] | null> {
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
}

async function findSymbolsForSession(
  candidates: UpexCandidate[],
  startTime: number,
  endTime: number,
  onProgress?: (done: number, total: number) => void,
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
          passes: passesUpexFilter(candles, candidate.bc, startTime, endTime),
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
      if (typeof value === "boolean" || value === null) {
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
    results: Object.fromEntries(results),
  });
  safeSetItem(PREVIOUS_UPEX_CACHE_KEY, payload);
}

const previousUpexPassCache = new Map<string, Promise<boolean | null>>();
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
