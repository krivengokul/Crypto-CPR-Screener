import { isTouchCPRCategory, type CPRResult } from "../cpr.ts";

type CprAboveFlags = Pick<
  CPRResult,
  "narrowCPR" | "InsideCPR" | "strWideCPR" | "outCPR" | "cprRising" | "overlapHigher"
>;

export function matchesCprAboveLevelStatus(r: CprAboveFlags): boolean {
  const isNarrow = r.narrowCPR && !r.InsideCPR;
  const showWide = r.strWideCPR && !r.outCPR;
  return (isNarrow || showWide) && r.cprRising;
}

export function matchesCprAboveOverlapStatus(r: CprAboveFlags): boolean {
  const isNarrow = r.narrowCPR && !r.InsideCPR;
  const showWide = r.strWideCPR && !r.outCPR;
  return (isNarrow || showWide) && r.overlapHigher;
}

export function previousCprIsTouchCategory(
  r: Pick<CPRResult, "prevCPR" | "ppCPR">,
): boolean {
  return r.ppCPR
    ? isTouchCPRCategory(r.prevCPR, r.ppCPR)
    : false;
}
