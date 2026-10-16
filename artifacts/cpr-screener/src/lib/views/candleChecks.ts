import type { CPRResult } from "../cpr.ts";

export const ALL_CANDLE_CHECK_CODES = ["CA", "MA", "CB", "MB"] as const;
export type CandleCheckCode = (typeof ALL_CANDLE_CHECK_CODES)[number];
export const ALL_CANDLE_CHECKS: readonly string[] = ALL_CANDLE_CHECK_CODES;

export const CANDLE_CHECK_OPTIONS: Array<{ value: CandleCheckCode | ""; label: string }> = [
  { value: "", label: "None" },
  { value: "CA", label: "P-CONSOLIDATE-A" },
  { value: "MA", label: "P-MOMENTUM-A" },
  { value: "CB", label: "P-CONSOLIDATE-B" },
  { value: "MB", label: "P-MOMENTUM-B" },
];

/**
 * Exclusive buckets aligned with Screener `candleBucket` priority:
 *   INSIDE (conA∧conB) → neither CA nor CB
 *   CB → conB && !conA
 *   MB → momB && !conB
 *   CA → conA && !conB && !momB
 *   MA → momA && !conA && !conB && !momB
 */
export function matchesCandleCheck(r: CPRResult, code: string): boolean {
  const conA = r.PD15MConsolidateAPass === true;
  const conB = r.PD15MBelowTCPass === true;
  const momA = r.PD15MAboveBCPass === true;
  const momB = r.PD15MMomentumBPass === true;
  switch (code) {
    case "CB":
      return conB && !conA;
    case "MB":
      return momB && !conB;
    case "CA":
      return conA && !conB && !momB;
    case "MA":
      return momA && !conA && !conB && !momB;
    default:
      return true;
  }
}

export function candleCheckToCategoryKey(code: string): string | undefined {
  switch (code) {
    case "CA":
      return "CON-A";
    case "MA":
      return "MOM-A";
    case "CB":
      return "CON-B";
    case "MB":
      return "MOM-B";
    default:
      return undefined;
  }
}
