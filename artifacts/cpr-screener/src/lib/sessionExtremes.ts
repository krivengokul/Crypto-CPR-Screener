// src/lib/sessionExtremes.ts
//
// Today's (UTC-day) high / low for live rows, without trusting Binance's
// /ticker/24hr highPrice / lowPrice.
//
// Why: the 24hr ticker is a ROLLING 24-hour window, so at any time of day it
// still contains part of yesterday. Feeding it straight into todayHigh /
// todayLow would let a spike from yesterday evening latch a false Pass (or
// stop hit) for today. The ticker is therefore used only as a TRIGGER — "the
// rolling extreme is beyond what we track, something might have happened
// today" — and the actual extreme is read from the current UTC daily candle.
//
// No "@/..." imports on purpose, so the repo's node test runner can load this.

/** Max symbols that get a daily-candle lookup per poll (keeps request count bounded). */
export const MAX_DAY_CANDLE_LOOKUPS = 40;
/** Parallel daily-candle requests. */
export const DAY_CANDLE_CONCURRENCY = 6;

const DAY_MS = 86_400_000;

export type ExtremesRow = {
  symbol: string;
  currentPrice: number;
  todayHigh?: number;
  todayLow?: number;
};

export type DayCandle = { openTime: number; high: number; low: number };

const isPos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** 00:00 UTC of the day containing `nowMs`. */
export function utcDayStartMs(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS) * DAY_MS;
}

/**
 * Parse a Binance klines response (`interval=1d&limit=1`) into today's candle.
 * Returns null unless the last candle opened during the current UTC day, so a
 * previous day's candle (e.g. just after midnight on a quiet symbol) is never
 * mistaken for today's.
 */
export function parseDayCandle(raw: unknown, nowMs: number): DayCandle | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const k = raw[raw.length - 1];
  if (!Array.isArray(k)) return null;
  const openTime = Number(k[0]);
  const high = parseFloat(String(k[2]));
  const low = parseFloat(String(k[3]));
  if (!Number.isFinite(openTime) || openTime > nowMs || openTime < utcDayStartMs(nowMs)) return null;
  if (!isPos(high) || !isPos(low) || low > high) return null;
  return { openTime, high, low };
}

/**
 * Which symbols deserve a daily-candle lookup this poll: only those where the
 * rolling 24h extreme is beyond what we already track (so the ticker says
 * "something may have printed beyond todayHigh/todayLow"). Never-checked
 * symbols go first, then the least recently checked, so every candidate is
 * covered over successive polls even when more than `max` qualify.
 */
export function pickDayCandleLookups(
  rows: ExtremesRow[],
  rollingHigh: Map<string, number>,
  rollingLow: Map<string, number>,
  livePrice: Map<string, number>,
  lastLookup: Map<string, number>,
  max = MAX_DAY_CANDLE_LOOKUPS,
): string[] {
  const picked: Array<{ symbol: string; last: number; excess: number }> = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    const px = livePrice.get(r.symbol) ?? r.currentPrice;
    const trackedHigh = Math.max(isPos(r.todayHigh) ? r.todayHigh : 0, isPos(px) ? px : 0);
    const trackedLow = Math.min(
      isPos(r.todayLow) ? r.todayLow : Infinity,
      isPos(px) ? px : Infinity,
    );
    const rh = rollingHigh.get(r.symbol);
    const rl = rollingLow.get(r.symbol);
    let excess = 0;
    if (isPos(rh) && trackedHigh > 0 && rh > trackedHigh) excess = Math.max(excess, (rh - trackedHigh) / trackedHigh);
    if (isPos(rl) && Number.isFinite(trackedLow) && rl < trackedLow) excess = Math.max(excess, (trackedLow - rl) / trackedLow);
    if (excess > 0) picked.push({ symbol: r.symbol, last: lastLookup.get(r.symbol) ?? -Infinity, excess });
  }
  picked.sort((a, b) => a.last - b.last || b.excess - a.excess);
  return picked.slice(0, Math.max(0, max)).map((p) => p.symbol);
}

/**
 * Look up today's UTC-day high/low for `symbols`. `fetchJson` is injected so
 * the caller owns timeouts/network and tests can fake it. Spot-only symbols use
 * the spot klines endpoint; everything else uses futures.
 */
export async function fetchDayExtremes(opts: {
  symbols: string[];
  spotSymbols?: Set<string>;
  nowMs: number;
  fetchJson: (url: string) => Promise<unknown>;
  lastLookup?: Map<string, number>;
  concurrency?: number;
}): Promise<{ dayHigh: Map<string, number>; dayLow: Map<string, number> }> {
  const { symbols, spotSymbols, nowMs, fetchJson, lastLookup, concurrency = DAY_CANDLE_CONCURRENCY } = opts;
  const dayHigh = new Map<string, number>();
  const dayLow = new Map<string, number>();
  const queue = symbols.slice();

  const worker = async () => {
    for (;;) {
      const symbol = queue.shift();
      if (symbol === undefined) return;
      const base = spotSymbols?.has(symbol)
        ? "https://api.binance.com/api/v3/klines"
        : "https://fapi.binance.com/fapi/v1/klines";
      let candle: DayCandle | null = null;
      try {
        candle = parseDayCandle(
          await fetchJson(`${base}?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=1`),
          nowMs,
        );
      } catch {
        candle = null;
      }
      lastLookup?.set(symbol, nowMs);
      if (candle) {
        dayHigh.set(symbol, candle.high);
        dayLow.set(symbol, candle.low);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, symbols.length || 1)) }, worker));
  return { dayHigh, dayLow };
}
