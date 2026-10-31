import type { CPRResult } from "../cpr.ts";

export const ALL_CANDLE_CHECK_CODES = ["CA", "MA", "VR", "CB", "MB", "PPCA", "PPCB", "PPMA", "PPMB", "PPVR"] as const;
export type CandleCheckCode = (typeof ALL_CANDLE_CHECK_CODES)[number];
export const ALL_CANDLE_CHECKS: readonly string[] = ALL_CANDLE_CHECK_CODES;

/** P-day exclusive candle options (Create/Edit/Copy View P dropdown). */
export const CANDLE_CHECK_OPTIONS: Array<{ value: CandleCheckCode | ""; label: string }> = [
  { value: "", label: "None" },
  { value: "CA", label: "P-CONSOLIDATE-A" },
  { value: "MA", label: "P-MOMENTUM-A" },
  { value: "VR", label: "P-VOLATILE-R1S1" },
  { value: "CB", label: "P-CONSOLIDATE-B" },
  { value: "MB", label: "P-MOMENTUM-B" },
];

/** PP-day independent options (Create/Edit/Copy View PP dropdown). */
export const PP_CANDLE_CHECK_OPTIONS: Array<{ value: "PPCA" | "PPCB" | "PPMA" | "PPMB" | "PPVR" | ""; label: string }> = [
  { value: "", label: "None" },
  { value: "PPCA", label: "PP-CON-A" },
  { value: "PPMA", label: "PP-MOM-A" },
  { value: "PPCB", label: "PP-CON-B" },
  { value: "PPMB", label: "PP-MOM-B" },
  { value: "PPVR", label: "PP-VOLATILE-R1S1" },
];

/** Split stored candleCheck ("PPCA+CA" or single code) into PP + P parts. */
export function splitCandleCheck(code: string | undefined | null): {
  pp: "" | "PPCA" | "PPCB" | "PPMA" | "PPMB" | "PPVR";
  p: string;
} {
  const raw = (code ?? "").trim();
  if (!raw) return { pp: "", p: "" };
  const parts = raw.split("+").map((s) => s.trim()).filter(Boolean);
  let pp: "" | "PPCA" | "PPCB" | "PPMA" | "PPMB" | "PPVR" = "";
  const pParts: string[] = [];
  for (const part of parts) {
    if (part === "PPCA" || part === "PPCB" || part === "PPMA" || part === "PPMB" || part === "PPVR") pp = part;
    else pParts.push(part);
  }
  return { pp, p: pParts[0] ?? "" };
}

/** Join PP + P dropdown values into the stored candleCheck string. */
export function joinCandleCheck(pp: string, p: string): string {
  return [pp.trim(), p.trim()].filter(Boolean).join("+");
}

/**
 * Exclusive buckets aligned with Screener `candleBucket` priority for P-codes.
 * PPCA / PPCB / PPMA / PPMB are independent of P-buckets (AND when combined via "+").
 */
export function matchesCandleCheck(r: CPRResult, code: string): boolean {
  const raw = (code ?? "").trim();
  if (!raw) return true;
  // Combined PP + P: every segment must pass.
  if (raw.includes("+")) {
    return raw.split("+").map((s) => s.trim()).filter(Boolean).every((c) => matchesCandleCheck(r, c));
  }
  const conA = r.PD15MConsolidateAPass === true;
  const conB = r.PD15MBelowTCPass === true;
  const momA = r.PD15MAboveBCPass === true;
  const momB = r.PD15MMomentumBPass === true;
  const inside = r.PD15MInsideR1S1Pass === true;
  const ppA = r.PD15MPPConsolidateAPass === true;
  const ppB = r.PD15MPPConsolidateBPass === true;
  const ppMomA = r.PD15MPPMomentumAPass === true;
  const ppMomB = r.PD15MPPMomentumBPass === true;
  const ppInside = r.PD15MPPInsideR1S1Pass === true;
  switch (raw) {
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
      return inside && !conA && !conB;
    case "PPCB":
      return ppB;
    case "PPMB":
      return ppMomB && !ppB;
    case "PPCA":
      // Exclusive: A only when B did not pass (same as CA vs CB).
      return ppA && !ppB;
    case "PPMA":
      // Mirror MA: momentum exclusive of both PP-CON sides.
      return ppMomA && !ppA && !ppB;
    case "PPVR":
      // Mirror VR: inside R1/PH–S1/PL on PPDay, exclusive of PP-CON-A/B.
      return ppInside && !ppA && !ppB;
    default:
      return true;
  }
}

export function candleCheckToCategoryKey(code: string): string | undefined {
  // Only the P segment maps to a left-nav P category.
  const { p } = splitCandleCheck(code);
  switch (p) {
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

/**
 * Derive the Create-View candleCheck string from a live/backtest row's
 * 15m flags — same exclusive P-bucket priority as matchesCandleCheck /
 * Screener, plus independent PP-CON / PP-MOM when those flags pass.
 * Used to preselect the PP / P dropdowns (like existingGapBadge for Gap).
 */
export function candleCheckFromRow(r: CPRResult): string {
  const conA = r.PD15MConsolidateAPass === true;
  const conB = r.PD15MBelowTCPass === true;
  const momA = r.PD15MAboveBCPass === true;
  const momB = r.PD15MMomentumBPass === true;
  const inside = r.PD15MInsideR1S1Pass === true;
  let p = "";
  if (conB) p = "CB";
  else if (momB) p = "MB";
  else if (conA) p = "CA";
  else if (momA) p = "MA";
  else if (inside) p = "VR";
  // Exclusive PP: CON-B > MOM-B > CON-A > MOM-A (mirrors P-day priority).
  let pp = "";
  if (r.PD15MPPConsolidateBPass === true) pp = "PPCB";
  else if (r.PD15MPPMomentumBPass === true) pp = "PPMB";
  else if (r.PD15MPPConsolidateAPass === true) pp = "PPCA";
  else if (r.PD15MPPMomentumAPass === true) pp = "PPMA";
  else if (r.PD15MPPInsideR1S1Pass === true) pp = "PPVR";
  return joinCandleCheck(pp, p);
}
