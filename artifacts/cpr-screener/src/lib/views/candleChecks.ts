import type { CPRResult } from "../cpr.ts";

export const ALL_CANDLE_CHECK_CODES = ["CA", "MA", "CB", "MB", "IR"] as const;
export type CandleCheckCode = (typeof ALL_CANDLE_CHECK_CODES)[number];
export const ALL_CANDLE_CHECKS: readonly string[] = ALL_CANDLE_CHECK_CODES;

export const CANDLE_CHECK_OPTIONS: Array<{ value: CandleCheckCode | ""; label: string }> = [
  { value: "", label: "None" },
  { value: "CA", label: "P-CONSOLIDATE-A" },
  { value: "MA", label: "P-MOMENTUM-A" },
  { value: "CB", label: "P-CONSOLIDATE-B" },
  { value: "MB", label: "P-MOMENTUM-B" },
  { value: "IR", label: "P-INSIDE-R1S1" },
];

/**
 * Mutually exclusive P-filter match (same rules as Screener candleBucket):
 *   IR = CON-A ∩ CON-B
 *   CB = CON-B only
 *   CA = CON-A only
 *   MB / MA = momentum only on that side
 */
export function matchesCandleCheck(r: CPRResult, code: string): boolean {
  const conA = r.PD15MConsolidateAPass === true;
  const conB = r.PD15MBelowTCPass === true;
  const momA = r.PD15MAboveBCPass === true;
  const momB = r.PD15MMomentumBPass === true;

  switch (code) {
    case "IR":
      return conA && conB;
    case "CA":
      return conA && !conB;
    case "MA":
      return momA && !conA;
    case "CB":
      return conB && !conA;
    case "MB":
      return momB && !conB;
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
    case "IR":
      return "INSIDE-R1S1";
    default:
      return undefined;
  }
}
