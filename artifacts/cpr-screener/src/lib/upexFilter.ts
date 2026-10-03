import type { OHLC } from "./cpr";
import { toCoinDCXPair } from "./coinDCXPair.ts";

type UpexSource = "binance" | "delta" | "coindcx";

const DELTA_BASE = "https://api.india.delta.exchange/v2";
const COINDCX_BASE = "https://public.coindcx.com";
const CANDLE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 8;

export interface UpexCandidate {
  symbol: string;
  source: UpexSource;
  bc: number;
}

export function upexSessionStartUtcMs(now = Date.now()): number {
  const istNow = new Date(now + 330 * 60 * 1000);
  return Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
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
      Number.isFinite(candle.close)
  );
  if (completed.length === 0) return null;

  return !completed.some((candle) => candle.open < bc && candle.close < bc);
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

function parseCoinDCXCandles(payload: unknown): OHLC[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as { s?: string; data?: unknown[] };
  if ((body.s !== undefined && body.s !== "ok") || !Array.isArray(body.data)) return [];
  return body.data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      openTime: Number(row.time),
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
  now: number
): Promise<OHLC[] | null> {
  if (candidate.source === "binance") {
    const payload = await fetchJson(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(candidate.symbol)}` +
        `&interval=15m&startTime=${startTime}&endTime=${now}&limit=100`
    );
    return payload === null ? null : parseBinanceCandles(payload);
  }

  if (candidate.source === "delta") {
    const payload = await fetchJson(
      `${DELTA_BASE}/history/candles?symbol=${encodeURIComponent(candidate.symbol)}` +
        `&resolution=15m&start=${Math.floor(startTime / 1000)}&end=${Math.floor(now / 1000)}`
    );
    return payload === null ? null : parseDeltaCandles(payload);
  }

  const fromSec = Math.floor(startTime / 1000);
  const toSec = Math.floor(now / 1000);
  const payload = await fetchJson(
    `${COINDCX_BASE}/market_data/candlesticks?pair=${encodeURIComponent(toCoinDCXPair(candidate.symbol))}` +
      `&from=${fromSec}&to=${toSec}&resolution=15&pcode=f`
  );
  return payload === null ? null : parseCoinDCXCandles(payload);
}

export async function findUpexSymbols(
  candidates: UpexCandidate[],
  onProgress?: (done: number, total: number) => void,
  now = Date.now()
): Promise<{ included: Set<string>; unavailable: number }> {
  const startTime = upexSessionStartUtcMs(now);
  const included = new Set<string>();
  let unavailable = 0;

  for (let offset = 0; offset < candidates.length; offset += MAX_CONCURRENT_REQUESTS) {
    const batch = candidates.slice(offset, offset + MAX_CONCURRENT_REQUESTS);
    const results = await Promise.all(
      batch.map(async (candidate) => {
        const candles = await fetchUpexCandles(candidate, startTime, now);
        if (!candles) return { candidate, passes: null };
        return {
          candidate,
          passes: passesUpexFilter(candles, candidate.bc, startTime, now),
        };
      })
    );

    for (const { candidate, passes } of results) {
      if (passes === true) included.add(`${candidate.source}:${candidate.symbol}`);
      else if (passes === null) unavailable++;
    }
    onProgress?.(Math.min(offset + batch.length, candidates.length), candidates.length);
  }

  return { included, unavailable };
}
