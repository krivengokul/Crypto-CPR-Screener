import type { OHLC } from "./cpr";

export type TargetHitResult = {
  /** not-triggered = never crossed entry — ignore for PASS/FAIL stats */
  result: "pass" | "fail" | "insufficient-data" | "not-triggered";
  hitDate: string | null;
  daysToHit: 0 | 1 | null;
};

/**
 * Grade target hit within entry day + next day.
 *
 * When `entryLevel` is provided, PASS/FAIL only apply if price crossed
 * that entry on entry day or next day (Up: high >= entry, Down: low <= entry).
 * Symbols that never touch entry are `not-triggered` and should be ignored
 * in PASS/FAIL counts.
 */
export function gradeTargetHit(
  isUp: boolean,
  targetLevel: number,
  entryDate: string,
  entryDay: OHLC | null,
  nextDay: OHLC | null,
  entryLevel?: number | null,
): TargetHitResult {
  const hasEntryGate = entryLevel != null && Number.isFinite(entryLevel);

  const entryTouched = (candle: OHLC | null) =>
    !!candle &&
    hasEntryGate &&
    (isUp ? candle.high >= (entryLevel as number) : candle.low <= (entryLevel as number));

  const hitsTarget = (candle: OHLC | null) =>
    !!candle && (isUp ? candle.high >= targetLevel : candle.low <= targetLevel);

  // Require entry cross before any PASS/FAIL qualification
  if (hasEntryGate) {
    const triggered = entryTouched(entryDay) || entryTouched(nextDay);
    if (!triggered) {
      if (!entryDay && !nextDay) {
        return { result: "insufficient-data", hitDate: null, daysToHit: null };
      }
      return { result: "not-triggered", hitDate: null, daysToHit: null };
    }
  }

  if (hitsTarget(entryDay)) {
    return { result: "pass", hitDate: entryDate, daysToHit: 0 };
  }

  if (hitsTarget(nextDay)) {
    const nextDate = new Date(`${entryDate}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    return {
      result: "pass",
      hitDate: nextDate.toISOString().slice(0, 10),
      daysToHit: 1,
    };
  }

  return {
    result: entryDay || nextDay ? "fail" : "insufficient-data",
    hitDate: null,
    daysToHit: null,
  };
}
