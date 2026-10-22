import type { CPRResult } from "../cpr.ts";

export const ALL_CANDLE_CHECK_CODES = ["CA", "MA", "VR", "CB", "MB"] as const;
export type CandleCheckCode = (typeof ALL_CANDLE_CHECK_CODES)[number];
export const ALL_CANDLE_CHECKS: readonly string[] = ALL_CANDLE_CHECK_CODES;

export const CANDLE_CHECK_OPTIONS: Array<{ value: CandleCheckCode | ""; label: string }> = [
  { value: "", label: "None" },
  { value: "CA", label: "P-CONSOLIDATE-A" },
  { value: "MA", label: "P-MOMENTUM-A" },
  { value: "VR", label: "P-VOLATILE-R1S1" },
  { value: "CB", label: "P-CONSOLIDATE-B" },
  { value: "MB", label: "P-MOMENTUM-B" },
];

/**
 * Exclusive buckets aligned with Screener `candleBucket` priority:
 *   VR (P-VOLATILE-R1S1: R1/PH–S1/PL pass, not CON-A/CON-B) → separate from CA/CB
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
  const inside = r.PD15MInsideR1S1Pass === true;
  switch (code) {
    case "CB":
      return conB;
    case "MB":
      return momB && !conB;
    case "CA":
      return conA && !conB;
    case "MA":
      return momA && !conA && !conB;
    case "VR":
    case "IR":
    case "INSIDE":
      // INSIDE band only when not already CON-A or CON-B
      return inside && !conA && !conB;
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
    case "VR":
      return "INSIDE-R1S1";
    case "MB":
      return "MOM-B";
    default:
      return undefined;
  }
}
