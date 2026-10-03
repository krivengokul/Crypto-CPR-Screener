import type { OHLC } from "./cpr";

export type TargetHitResult = {
  result: "pass" | "fail" | "insufficient-data";
  hitDate: string | null;
  daysToHit: 0 | 1 | null;
};

export function gradeTargetHit(
  isUp: boolean,
  targetLevel: number,
  entryDate: string,
  entryDay: OHLC | null,
  nextDay: OHLC | null
): TargetHitResult {
  const hits = (candle: OHLC | null) =>
    !!candle && (isUp ? candle.high >= targetLevel : candle.low <= targetLevel);

  if (hits(entryDay)) {
    return { result: "pass", hitDate: entryDate, daysToHit: 0 };
  }

  if (hits(nextDay)) {
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
