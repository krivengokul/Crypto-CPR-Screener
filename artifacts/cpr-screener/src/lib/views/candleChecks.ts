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
export type CandleBucket =
  | "consolidate-a"
  | "momentum-a"
  | "consolidate-b"
  | "momentum-b"
  | "inside-r1s1"
  | null;

/** Exclusive assignment matching Screener / charts (CON-A ∩ CON-B → INSIDE). */
export function resolveCandleBucket(r: {
  PD15MConsolidateAPass?: boolean;
  PD15MBelowTCPass?: boolean;
  PD15MAboveBCPass?: boolean;
  PD15MMomentumBPass?: boolean;
}): CandleBucket {
  const conA = r.PD15MConsolidateAPass === true;
  const conB = r.PD15MBelowTCPass === true;
  const momA = r.PD15MAboveBCPass === true;
  const momB = r.PD15MMomentumBPass === true;
  if (conA && conB) return "inside-r1s1";
  if (conB) return "consolidate-b";
  if (momB) return "momentum-b";
  if (conA) return "consolidate-a";
  if (momA) return "momentum-a";
  return null;
}

export function matchesCandleCheck(r: CPRResult, code: string): boolean {
  const bucket = resolveCandleBucket(r);
  switch (code) {
    case "IR":
      return bucket === "inside-r1s1";
    case "CA":
      return bucket === "consolidate-a";
    case "MA":
      return bucket === "momentum-a";
    case "CB":
      return bucket === "consolidate-b";
    case "MB":
      return bucket === "momentum-b";
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
