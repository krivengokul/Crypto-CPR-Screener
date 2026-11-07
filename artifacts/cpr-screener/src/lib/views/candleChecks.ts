import type { CPRResult } from "../cpr.ts";

export const ALL_CANDLE_CHECK_CODES = ["CA", "MA", "VR", "CB", "MB", "PPCA", "PPCB", "PPMA", "PPMB", "PPVR", "PPVA", "PPVB", "VA", "VB"] as const;
export type CandleCheckCode = (typeof ALL_CANDLE_CHECK_CODES)[number];
export const ALL_CANDLE_CHECKS: readonly string[] = ALL_CANDLE_CHECK_CODES;

/** P-day exclusive candle options (Create/Edit/Copy View P dropdown). */
export const CANDLE_CHECK_OPTIONS: Array<{ value: CandleCheckCode | ""; label: string }> = [
  { value: "", label: "None" },
  { value: "CA", label: "P-CON-A" },
  { value: "MA", label: "P-MOM-A" },
  { value: "VR", label: "P-VOL-C" },
  { value: "VA", label: "P-VOL-A" },
  { value: "VB", label: "P-VOL-B" },
  { value: "CB", label: "P-CON-B" },
  { value: "MB", label: "P-MOM-B" },
];

/** PP-day independent options (Create/Edit/Copy View PP dropdown). */
export const PP_CANDLE_CHECK_OPTIONS: Array<{ value: "PPCA" | "PPCB" | "PPMA" | "PPMB" | "PPVR" | "PPVA" | "PPVB" | ""; label: string }> = [
  { value: "", label: "None" },
  { value: "PPCA", label: "PP-CON-A" },
  { value: "PPMA", label: "PP-MOM-A" },
  { value: "PPCB", label: "PP-CON-B" },
  { value: "PPMB", label: "PP-MOM-B" },
  { value: "PPVR", label: "PP-VOL-C" },
  { value: "PPVA", label: "PP-VOL-A" },
  { value: "PPVB", label: "PP-VOL-B" },
];

/** Split stored candleCheck ("PPCA+CA" or single code) into PP + P parts. */
export function splitCandleCheck(code: string | undefined | null): {
  pp: "" | "PPCA" | "PPCB" | "PPMA" | "PPMB" | "PPVR" | "PPVA" | "PPVB";
  p: string;
} {
  const raw = (code ?? "").trim();
  if (!raw) return { pp: "", p: "" };
  const parts = raw.split("+").map((s) => s.trim()).filter(Boolean);
  let pp: "" | "PPCA" | "PPCB" | "PPMA" | "PPMB" | "PPVR" | "PPVA" | "PPVB" = "";
  const pParts: string[] = [];
  for (const part of parts) {
    if (part === "PPCA" || part === "PPCB" || part === "PPMA" || part === "PPMB" || part === "PPVR" || part === "PPVA" || part === "PPVB") pp = part;
    else pParts.push(part);
  }
  return { pp, p: pParts[0] ?? "" };
}

/** Join PP + P dropdown values into the stored candleCheck string. */
export function joinCandleCheck(pp: string, p: string): string {
  return [pp.trim(), p.trim()].filter(Boolean).join("+");
}

/**
 * Exclusive buckets aligned with Screener `candleBucket`. When both CON-A and CON-B pass, CON-A is the exclusive P label (zone majority; tie → A).
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
  const volA = r.PD15MVolAPass === true;
  const volB = r.PD15MVolBPass === true;
  const ppA = r.PD15MPPConsolidateAPass === true;
  const ppB = r.PD15MPPConsolidateBPass === true;
  const ppMomA = r.PD15MPPMomentumAPass === true;
  const ppMomB = r.PD15MPPMomentumBPass === true;
  const ppInside = r.PD15MPPInsideR1S1Pass === true;
  const ppVolA = r.PD15MPPVolAPass === true;
  const ppVolB = r.PD15MPPVolBPass === true;
  switch (raw) {
    case "CB":
      if (!conB) return false;
      if (!conA) return true;
      return r.PD15MConsolidateExclusive === "B";
    case "MB":
      return momB && !conB && !conA;
    case "CA":
      if (!conA) return false;
      if (!conB) return true;
      return r.PD15MConsolidateExclusive !== "B";
    case "MA":
      return momA && !conA && !conB;
    case "VR":
    case "IR":
    case "INSIDE":
      return inside && !conA && !conB;
    case "VA":
      return volA && !conA && !conB && !momA && !momB && !inside;
    case "VB":
      return volB && !conA && !conB && !momA && !momB && !inside;
    case "PPCB":
      if (!ppB) return false;
      if (!ppA) return true;
      return r.PD15MPPConsolidateExclusive === "B";
    case "PPMB":
      return ppMomB && !ppB && !ppA;
    case "PPCA":
      // Both PP-CON sides pass → zone-majority exclusive side (mirrors CA; missing/tie → A).
      if (!ppA) return false;
      if (!ppB) return true;
      return r.PD15MPPConsolidateExclusive !== "B";
    case "PPMA":
      // Mirror MA: momentum exclusive of both PP-CON sides.
      return ppMomA && !ppA && !ppB;
    case "PPVR":
      // Mirror VR: inside R1/PH–S1/PL on PPDay, exclusive of PP-CON-A/B.
      return ppInside && !ppA && !ppB;
    case "PPVA":
      return ppVolA && !ppA && !ppB && !ppMomA && !ppMomB && !ppInside;
    case "PPVB":
      return ppVolB && !ppA && !ppB && !ppMomA && !ppMomB && !ppInside && !ppVolA;
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
  // Both CON-A+CON-B → exclusive side from scan-time zone midpoint counts.
  let p = "";
  if (conA && conB) {
    p = r.PD15MConsolidateExclusive === "B" ? "CB" : "CA";
  } else if (conB) p = "CB";
  else if (momB) p = "MB";
  else if (conA) p = "CA";
  else if (momA) p = "MA";
  else if (inside) p = "VR";
  else if (r.PD15MVolAPass === true) p = "VA";
  else if (r.PD15MVolBPass === true) p = "VB";
  // Do NOT bind residual "P-VOLATILE ✗" as VR — that badge means
  // no exclusive P-pass, so Create View must leave P as None or the
  // new view will require INSIDE and never match this row.
  const ppA = r.PD15MPPConsolidateAPass === true;
  const ppB = r.PD15MPPConsolidateBPass === true;
  let pp = "";
  if (ppA && ppB) {
    pp = r.PD15MPPConsolidateExclusive === "B" ? "PPCB" : "PPCA";
  } else if (ppB) pp = "PPCB";
  else if (r.PD15MPPMomentumBPass === true) pp = "PPMB";
  else if (ppA) pp = "PPCA";
  else if (r.PD15MPPMomentumAPass === true) pp = "PPMA";
  else if (r.PD15MPPInsideR1S1Pass === true) pp = "PPVR";
  else if (r.PD15MPPVolAPass === true) pp = "PPVA";
  else if (r.PD15MPPVolBPass === true) pp = "PPVB";
  return joinCandleCheck(pp, p);
}
