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

export function matchesCandleCheck(r: CPRResult, code: string): boolean {
  switch (code) {
    case "CA":
      return r.PD15MConsolidateAPass === true;
    case "MA":
      return r.PD15MAboveBCPass === true && r.PD15MConsolidateAPass !== true;
    case "CB":
      return r.PD15MBelowTCPass === true;
    case "MB":
      return r.PD15MMomentumBPass === true && r.PD15MBelowTCPass !== true;
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
