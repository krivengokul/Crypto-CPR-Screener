export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
}

export interface CPRLevels {
  pivot: number;
  bc: number;
  tc: number;
  width: number;
  widthPct: number;
  // ADK: Previous Day High/Low shown as additional S/R levels
  prevHigh: number;
  prevLow: number;
  // ADK Classic Pivot Resistance levels
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  // ADK Classic Pivot Support levels
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  // PDH (this level set's high) vs R1 classification
  PDHLAbove: boolean;
  PDHLBelow: boolean;
  PDHLEqual: boolean;
}

/**
 * Flags produced by classifyCPRPair for any two CPRLevels (a "today" and a
 * "prev"). These are pure band-position classifications — they do NOT depend
 * on equalCPR / widthPct / rising / falling / narrowing / etc., which are
 * only meaningful for the today/prev pair on CPRResult.
 *
 * The exact same classifier is used by analyzeCPR (today vs prev) and by
 * ScreenerUtils.computePrevPattern (prev vs pp) so there is a single
 * source of truth for both the band conditions and the label priority order.
 */
export interface CPRPairFlags {
  // Distances / directional aggregates
  r4Distance: number;
  s4Distance: number;
  srHigher: boolean;
  srLower: boolean;
  srExpanded: boolean;
  srCompressed: boolean;
  srCompressedHigher: boolean;
  srCompressedLower: boolean;
  srExpandedHigher: boolean;
  srExpandedLower: boolean;

  // Band-classification flags (order below matches pickPattern priority)
  cOU3L4: boolean;
  cOL2U3: boolean;
  cOL3U3: boolean;
  eXL4U4: boolean;
  eXU4L4: boolean;
  /** EqL4U4 — today's R4 equals prev's R4 AND today's S4 equals prev's S4 (within eqTol). */
  EqL4U4: boolean;
  /** InsideCPR — today's CPR band sits strictly inside prev day's CPR band. */
  InsideCPR: boolean;
  HiL4U3: boolean;
  HiL4U2: boolean;
  HiL4U1: boolean;
  HiL2U4: boolean;
  HiL2U3: boolean;
  HiL3U4: boolean;
  HiL4U4: boolean;
  LoU4L4: boolean;
  eXL4U3: boolean;
  eXU4L2: boolean;
  eXU4L3: boolean;
  cOL2U4: boolean;
  cOL4U4: boolean;
  cOU4L4: boolean;
  exL3U2: boolean;
  cOL3U4: boolean;
  cOU3L3: boolean;
  LoU3L4: boolean;
  LoU3L3: boolean;
  cOU2L3: boolean;
  LoU2L4: boolean;
  LoU2L3: boolean;
  LoU4L3: boolean;
  LoU4L2: boolean;
  LoU4L1: boolean;
  cOU1L2: boolean;
  cOU2L4: boolean;
  eXL3U3: boolean;
  eXU3L3: boolean;
  cOU1L1: boolean;
  cOL1U1: boolean;
  cOU2L2: boolean;
  cOL2U2: boolean;
  HiL3U3: boolean;
  cOU1L3: boolean;

  // Additional flags consumed elsewhere on CPRResult (not part of the
  // pivotSubLabel chain, but still pure functions of a (today, prev) pair).
  eXL2U1: boolean;
  eXL3U1: boolean;
  eXL4U1: boolean;
  eXL1BC: boolean;
  eXL1CP: boolean;
  // eXL1TC — same L1 support band as eXL1BC/eXL1CP (prev's S4 inside
  // today's S1/BC), AND prev's R4 lands inside today's Pivot/TC band —
  // one band higher than eXL1CP's BC/Pivot band, same TC-anchored
  // resistance band as eXL2TC/eXL3TC.
  eXL1TC: boolean;
  eXL2BC: boolean;
  eXL3BC: boolean;
  eXL3CP: boolean;
  eXL3TC: boolean;
  eXL4U2: boolean;
  eXL2U2: boolean;
  eXL2TC: boolean;
  eXL1U1: boolean;
  // eXU1L1 — same band shape as eXL1U1 (prev's S4 inside today's S1/BC (L1)
  // AND prev's R4 inside today's TC/R1 (U1)), but split from it by which
  // gap is larger: if today's R1-to-prev's R4 gap is bigger, this fires
  // (eXU1L1); if today's S1-to-prev's S4 gap is bigger, eXL1U1 fires instead.
  eXU1L1: boolean;
  // eXU2L1 — prev's R4 lands inside today's R1/R2 band (U2), AND prev's S4
  // lands inside today's BC/S1 band (L1). Same "L1" support band as
  // eXL1U1/eXL1BC but paired with the wider U2 (R1→R2) resistance band
  // instead of U1 (TC→R1).
  eXU2L1: boolean;
  cOTCL2: boolean;
  L1pU1Above: boolean;
  // pCPR1Above — prev day's Pivot sits inside today's R1/R2 band (U1 side)
  // AND today's BC sits inside prev day's S1/BC band (pL1 side).
  pCPR1Above: boolean;
  // CPRs1Above — "CPR 1ABOVE": today's TC sits inside prev day's R1/R2 band
  // (U2 side) AND today's S1 sits inside prev day's BC/R1 band (a wide
  // band spanning prev's entire CPR, TC/Pivot/BC, up to prev's R1).
  CPRs1Above: boolean;
  // eXU3L1 — prev's R4 lands inside today's R2/R3 band (U3), AND prev's S4
  // lands inside today's BC/S1 band (L1). Same L1 support band as eXU2L1/
  // eXL1U1/eXL1BC but paired with the wider U3 (R2→R3) resistance band.
  eXU3L1: boolean;
  // eXU3L2 — prev's R4 lands inside today's R2/R3 band (U3, same
  // resistance band as eXU3L1), AND prev's S3 (not S4) lands inside
  // today's S1/S2 band (L2).
  eXU3L2: boolean;
  // eXU2TC — prev's R4 lands inside today's R1/R2 band (U2), AND prev's S4
  // lands inside today's TC/R1 band (a "TC"-anchored band, same naming
  // convention as eXL2TC/eXL3TC/cOTCL2 which pair a level against today's
  // Pivot/TC or TC/R1 boundary rather than the usual S-side L bands).
  eXU2TC: boolean;
  // eXU2BC — prev's R4 lands inside today's R1/R2 band (U2), AND prev's S4
  // lands inside today's BC/Pivot band (the lower half of today's CPR).
  eXU2BC: boolean;
  // eXU3TC — prev's R4 lands inside today's R2/R3 band (U3), AND prev's S4
  // lands inside today's TC/R1 band. Same TC-anchored support band as
  // eXU2TC, paired with the wider U3 resistance band instead of U2.
  eXU3TC: boolean;
  // eXU2CP — prev's R4 lands inside today's R1/R2 band (U2), AND prev's S4
  // lands inside today's Pivot/TC band (the upper half of today's CPR).
  // Same U2 resistance band as eXU2BC/eXU2L1/eXU2TC, paired with the
  // upper-CPR-half support band instead of BC/Pivot.
  eXU2CP: boolean;
  // eXU3CP — prev's R4 lands inside today's R2/R3 band (U3), AND prev's S4
  // lands inside today's Pivot/TC band (the upper half of today's CPR).
  // Same U3 resistance band as eXU3TC/eXU3L1/eXU3L2, paired with the
  // upper-CPR-half support band instead of TC/R1.
  eXU3CP: boolean;
  // eXU3BC — prev's R4 lands inside today's R2/R3 band (U3), AND prev's S4
  // lands inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U3 resistance band as eXU3TC/eXU3CP, paired with the
  // lower-CPR-half support band instead of TC/R1 or Pivot/TC.
  eXU3BC: boolean;
  // eXU4L1 — prev's R4 lands inside today's R3/R4 band (U4), AND prev's S4
  // lands inside today's BC/S1 band (L1). Bearish-continuation shape used
  // by the L1<pL4 sub-filter ss-eXU4L1-U4:10PM.
  eXU4L1: boolean;
  // eXU4BC — prev's R4 lands inside today's R3/R4 band (U4), AND prev's S4
  // lands inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U4 resistance band as eXU4L1, paired with the lower-CPR-half
  // support band instead of BC/S1.
  eXU4BC: boolean;
  // LoCPL3 — today's R4 lands inside prev's Pivot/BC band (the lower half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same "today lands inside prev's band" shape as cOTCL2/cOU1L2, but the
  // resistance side is measured against prev's BC→Pivot gap (lower CPR
  // half) instead of TC→R1 (U1) or Pivot→TC (TC), and paired with the
  // wider L3 (S2→S3) support band instead of L2 (S1→S2).
  LoCPL3: boolean;
  // LoCPL2 — same shape as LoCPL3 (today's R4 lands inside prev's Pivot/BC
  // band), but paired with the narrower L2 (S1/S2) support band instead of
  // L3 (S2/S3).
  LoCPL2: boolean;
  // LoTCL3 — today's R4 lands inside prev's Pivot/TC band (the upper half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same L3 support band as LoCPL3, but the resistance side is measured
  // against prev's Pivot→TC gap (upper CPR half) instead of BC→Pivot
  // (lower half).
  LoTCL3: boolean;
  // eXHiL2L1 / eXLoL2L1 — prev's R4 AND prev's S4 both land inside today's
  // S1/S2 band (an unusually collapsed range — prev's whole R4-to-S4 span
  // squeezed into one of today's support bands). Split into Hi/Lo variants
  // by whether today's PDL sits above (Hi) or below (Lo) prev's Pivot.
  eXHiL2L1: boolean;
  eXLoL2L1: boolean;
  // eXL2CP — prev's S4 lands inside today's S2/S1 band (L2), AND prev's R4
  // lands inside today's BC/Pivot band (the lower half of today's CPR).
  // Same L2 support band as eXL2BC/eXL2U1/eXL2U2/eXL2TC, paired with the
  // BC/Pivot resistance band instead of the usual U-side (R-anchored) bands.
  eXL2CP: boolean;
  // eXL4TC — prev's S4 lands inside today's S4/S3 band (L4, same support
  // band as eXL4U2/eXL4U1), AND prev's R4 lands inside today's Pivot/TC
  // band (the upper half of today's CPR). Same TC-anchored resistance band
  // as eXL2TC/eXL3TC, paired with the widest L4 support band instead of
  // L2/L3.
  eXL4TC: boolean;
  // LoU3L2 — today's R4 lands inside prev's R2/R3 band (U3, same
  // resistance band as LoU3L4/LoU3L3), AND prev's S4 lands inside today's
  // S2/S1 band (L2). Same L2 support band as LoU4L2, but paired with the
  // narrower U3 resistance band instead of U4.
  LoU3L2: boolean;
  // cOL1U2 — today's S4 lands inside prev's S1/BC band (L1), AND today's R4
  // lands inside prev's R1/R2 band (U2). Same "today lands inside prev's
  // band" shape as cOU1L2/cOU2L2, but pairs the L1 support band with the
  // wider U2 resistance band instead of L2+U1 or L2+U2.
  cOL1U2: boolean;
  // cOL1U3 — today's S4 lands inside prev's S1/BC band (L1, same support
  // band as cOL1U2/cOL1U1), AND today's R4 lands inside prev's R2/R3 band
  // (U3, same resistance band as cOL2U3/cOL3U3/cOU3L4). Pairs the
  // narrowest support band (L1) with the wider U3 resistance band.
  cOL1U3: boolean;
  HiL3U2: boolean;
}

export interface CPRResult {
  symbol: string;
  todayCPR: CPRLevels;
  prevCPR: CPRLevels;
  ppCPR?: CPRLevels;
  compressionRatio: number;
  cprRising: boolean;
  PL12CL23: boolean;
  allupabove: boolean;
  allupbelow: boolean;
  alldownabove: boolean;
  alldownbelow: boolean;
  cprFalling: boolean;
  PU12CU23: boolean;
  PU23CU34: boolean;
  PL34CL34: boolean;
  PL34CL4: boolean;
  lbJPattern1: boolean;
  lbJPattern2: boolean;
  cprNarrowing: boolean;
  overlapHigher: boolean;
  overlapLower: boolean;
  // OutCPR — today's CPR band completely engulfs prev's CPR band
  // (today.tc > prev.tc AND today.bc < prev.bc). Single source of truth,
  // consumed by ScreenerUtils instead of recomputing the raw comparison.
  outCPR: boolean;
  lbtJPattern1: boolean;
  hbJPattern1: boolean;
  hbJPattern2: boolean;
  hbJPattern3: boolean;
  hbJPattern4: boolean;
  strWideCPR: boolean;
  narrowCPR: boolean;
  bothTight: boolean;
  srHigher: boolean;
  srLower: boolean;
  srExpanded: boolean;
  srCompressed: boolean;
  srCompressedHigher: boolean;
  srCompressedLower: boolean;
  srExpandedHigher: boolean;
  srExpandedLower: boolean;
  cOU3L4: boolean;
  cOL2U3: boolean;
  cOL3U3: boolean;
  eXL4U4: boolean;
  eXU4L4: boolean;
  /** EqL4U4 — today's R4 equals prev's R4 AND today's S4 equals prev's S4 (within eqTol). */
  EqL4U4: boolean;
  /** InsideCPR — today's CPR band sits strictly inside prev day's CPR band. */
  InsideCPR: boolean;
  HiL2U4: boolean;
  HiL2U3: boolean;
  HiL3U4: boolean;
  HiL4U4: boolean;
  HiL4U3: boolean;
  HiL4U2: boolean;
  HiL4U1: boolean;
  LoU4L4: boolean;
  eXL4U3: boolean;
  eXU4L2: boolean;
  eXU4L3: boolean;
  cOL2U4: boolean;
  equalCPR: boolean;
  eXL3U3: boolean;
  eXU3L3: boolean;
  cOL4U4: boolean;
  cOU4L4: boolean;
  exL3U2: boolean;
  cOL3U4: boolean;
  cOU3L3: boolean;
  LoU3L4: boolean;
  LoU3L3: boolean;
  LoU2L4: boolean;
  LoU2L3: boolean;
  LoU4L3: boolean;
  LoU4L2: boolean;
  cOU2L3: boolean;
  LoU4L1: boolean;
  cOU2L4: boolean;
  eXL2U1: boolean;
  eXL3U1: boolean;
  eXL4U1: boolean;
  eXL1BC: boolean;
  eXL1CP: boolean;
  // eXL1TC — same L1 support band as eXL1BC/eXL1CP (prev's S4 inside
  // today's S1/BC), AND prev's R4 lands inside today's Pivot/TC band —
  // one band higher than eXL1CP's BC/Pivot band, same TC-anchored
  // resistance band as eXL2TC/eXL3TC.
  eXL1TC: boolean;
  eXL2BC: boolean;
  eXL3BC: boolean;
  eXL3CP: boolean;
  eXL3TC: boolean;
  eXL4U2: boolean;
  eXL2U2: boolean;
  eXL2TC: boolean;
  eXL1U1: boolean;
  eXU1L1: boolean;
  eXU2L1: boolean;
  cOTCL2: boolean;
  L1pU1Above: boolean;
  pCPR1Above: boolean;
  CPRs1Above: boolean;
  eXU3L1: boolean;
  eXU3L2: boolean;
  eXU2TC: boolean;
  eXU2BC: boolean;
  eXU3TC: boolean;
  eXU2CP: boolean;
  eXU3CP: boolean;
  eXU3BC: boolean;
  eXU4L1: boolean;
  eXU4BC: boolean;
  cOU1L1: boolean;
  cOU1L2: boolean;
  cOL1U1: boolean;
  cOU2L2: boolean;
  cOL2U2: boolean;
  HiL3U3: boolean;
  cOU1L3: boolean;
  LoCPL3: boolean;
  LoCPL2: boolean;
  LoTCL3: boolean;
  eXHiL2L1: boolean;
  eXLoL2L1: boolean;
  eXL2CP: boolean;
  eXL4TC: boolean;
  LoU3L2: boolean;
  cOL1U2: boolean;
  cOL1U3: boolean;
  HiL3U2: boolean;
  passes: boolean;
  currentPrice: number;
  openPrice: number;
  change24h: number;
  quoteVolume: number;
  prevR1Gap: number;
  prevS1Gap: number;
  r4Distance: number;
  s4Distance: number;
  // SSLLAbove — both today's S1 AND today's PDL (prevLow) sit above the
  // higher of prev's S1 / prev's PDL (support and PDL both climbed above
  // whichever of prev's two floor levels was higher).
  SSLLAbove: boolean;
  // HHRRBelow — both today's R1 AND today's PDH (prevHigh) sit below the
  // lower of prev's R1 / prev's PDH (resistance and PDH both stayed under
  // whichever of prev's two ceiling levels was lower).
  HHRRBelow: boolean;
  // PDHPDLGapCategory — compares the gap between today's PDH and prev's
  // PDH (HHGap) against the gap between today's PDL and prev's PDL
  // (LLGap). "HHGap" when the PDH gap is larger, "LLGap" when the PDL gap
  // is larger, "EqGap" when the two gaps are equal.
  PDHPDLGapCategory: PDHPDLGapCategory;
  // SSRRCategory — single-badge 5-way partition over today's R1/S1 vs
  // prev's R1/S1 (mirrors HHLLCategory's shape):
  //   SSRR-A (Above)      — today.r1 >  prev.r1 AND today.s1 >= prev.s1
  //   SSRR-B (Below)      — today.r1 <= prev.r1 AND today.s1 <  prev.s1
  //   SSRR-C (Compressed) — today.r1 <  prev.r1 AND today.s1 >  prev.s1
  //   SSRR-X (Expanded)   — today.r1 >  prev.r1 AND today.s1 <  prev.s1
  //   SSRR=  (Equal)      — today.r1 == prev.r1 AND today.s1 == prev.s1
  // "none" when none of the five conditions match. This field is the ONLY
  // source for that classification — the raw SSRRAbove/SSRRBelow booleans
  // have been removed from CPRResult.
  SSRRCategory: SSRRCategory;
  // HHLLCategory — 5-way mutually exclusive partition classifying today's
  // PDH/PDL (prevHigh/prevLow) move against prev's PDH/PDL:
  //   HHLL-A (Above)      — today.prevHigh > prev.prevHigh AND today.prevLow >= prev.prevLow
  //   HHLL-B (Below)      — today.prevHigh <= prev.prevHigh AND today.prevLow < prev.prevLow
  //   HHLL-C (Compressed) — today.prevHigh < prev.prevHigh AND today.prevLow > prev.prevLow
  //   HHLL-X (Expanded)   — today.prevHigh > prev.prevHigh AND today.prevLow < prev.prevLow
  //   HHLL=  (Equal)      — today.prevHigh == prev.prevHigh AND today.prevLow == prev.prevLow
  // Verified mutually exclusive (no row can satisfy two of the five), but
  // not exhaustive: PDH flat + PDL up, or PDH down + PDL flat, match none
  // of the five and fall through to "none". HHLL-A/HHLL-B carry the same
  // conditions the removed HHLLAbove/HHLLBelow booleans used to hold; this
  // field is now the only source for that classification (see
  // ScreenerUtils.renderHHLLCategoryBadge), also covering the
  // Compressed/Expanded/Equal cases those two booleans never captured.
  HHLLCategory: HHLLCategory;
}

export type PDHPDLGapCategory = "HHGap" | "LLGap" | "EqGap";
export type SSRRCategory = "SSRR-A" | "SSRR-B" | "SSRR-C" | "SSRR-X" | "SSRR=" | "none";
export type HHLLCategory = "HHLL-A" | "HHLL-B" | "HHLL-C" | "HHLL-X" | "HHLL=" | "none";

function isValidCandle(c: OHLC): boolean {
  return (
    c.high > 0 &&
    c.low > 0 &&
    c.close > 0 &&
    c.high >= c.low &&
    !isNaN(c.high) &&
    !isNaN(c.low) &&
    !isNaN(c.close)
  );
}

/**
 * eqTol — relative-tolerance equality for two price levels. Raw levels are
 * derived through chained floating-point arithmetic (Pivot, R1, etc.), so
 * two values that are mathematically equal and display identically when
 * rounded can still differ by a few units in the last binary digit. Strict
 * `===` misses those cases; this catches them within 0.001% of magnitude.
 * Single source of truth — used for both PDHLEqual (calcCPR) and equalCPR
 * (analyzeCPR) so "equal" means the same thing everywhere in this file.
 */
function eqTol(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.00001;
}

/**
 * ADK Classic Pivot CPR calculation.
 *
 * Matches "CPR by Ask Dinesh Kumar (ADK)" TradingView indicator exactly:
 *   Pivot  = (H + L + C) / 3
 *   BC     = (H + L) / 2
 *   TC     = 2 × Pivot − BC
 *
 * Resistance (R1–R4):
 *   R1 = 2P − L
 *   R2 = P + (H − L)
 *   R3 = H + 2 × (P − L)
 *   R4 = R3 + R2 − R1
 *
 * Support (S1–S4):
 *   S1 = 2P − H
 *   S2 = P − (H − L)
 *   S3 = L − 2 × (H − P)
 *   S4 = S3 + S2 − S1
 */
export function calcCPR(candle: OHLC): CPRLevels {
  const h = candle.high;
  const l = candle.low;
  const c = candle.close;

  const pivot    = (h + l + c) / 3;
  const midpoint = (h + l) / 2;
  const other    = 2 * pivot - midpoint;
  const bc       = Math.min(midpoint, other);
  const tc       = Math.max(midpoint, other);
  const width    = tc - bc;
  const widthPct = (width / pivot) * 100;
  const range    = h - l;
  const r1 = 2 * pivot - l;
  const s1 = 2 * pivot - h;
  const r2 = pivot + range;
  const s2 = pivot - range;
  const r3 = h + 2 * (pivot - l);
  const s3 = l - 2 * (h - pivot);
  const r4 = r3 + r2 - r1;
  const s4 = s3 + s2 - s1;

  // PDH (previous day high, i.e. this level set's candle high) vs R1.
  // PDHLEqual uses eqTol (not strict ===) since h and r1 reach the "same"
  // value through different arithmetic paths and can differ by a float
  // rounding hair even when they display identically. PDHLAbove/Below
  // exclude the equal band so exactly one of the three flags is ever true.
  const PDHLEqual  = eqTol(h, r1);
  const PDHLAbove  = !PDHLEqual && h > r1;
  const PDHLBelow  = !PDHLEqual && h < r1;

  return {
    pivot, bc, tc, width, widthPct,
    prevHigh: h, prevLow: l,
    r1, r2, r3, r4,
    s1, s2, s3, s4,
    PDHLAbove, PDHLBelow, PDHLEqual,
  };
}

/**
 * classifyCPRPair — pure band-position classifier for any (today, prev) pair.
 *
 * This is the ONLY place the band conditions live. analyzeCPR uses it for
 * (todayCPR, prevCPR); ScreenerUtils.computePrevPattern uses it for
 * (prevCPR, ppCPR) so both callers see identical logic. Change a boundary
 * here and both today/prev flags on CPRResult and the p(...) sub-label
 * update together.
 */
export function classifyCPRPair(today: CPRLevels, prev: CPRLevels): CPRPairFlags {
  // Distances — normalized by prev day's CPR width so R-side vs S-side moves
  // are compared on equal footing regardless of the asset's price scale.
  const normDenom  = prev.width > 0 ? prev.width : prev.pivot * 0.0001;
  const r4Distance = Math.abs(today.r4 - prev.r4) / normDenom;
  const s4Distance = Math.abs(today.s4 - prev.s4) / normDenom;

  // Secondary tiebreaker: adjacent S/R gaps on each side.
  const r3R4Gap = Math.abs(today.r3 - prev.r4);
  const s3S4Gap = Math.abs(prev.s4 - today.s3);

  // r4Fell / s4Fell — did this side genuinely drop, beyond eqTol's
  // floating-point tolerance? A tie (within tolerance) counts as "did not
  // fall" on that axis. Deriving all four sr* flags from these two
  // booleans makes them mutually exclusive AND exhaustive — exactly one
  // of the four is always true, so an exact R4/S4 tie (e.g. COOKIEUSDT:
  // both r4 and s4 unchanged day-over-day) now correctly lands in
  // srHigher instead of silently falling through every strict inequality
  // and defaulting to "Lower" in getPatternInfo.
  const r4Fell = today.r4 < prev.r4 && !eqTol(today.r4, prev.r4);
  const s4Fell = today.s4 < prev.s4 && !eqTol(today.s4, prev.s4);

  const srHigher     = !r4Fell && !s4Fell;
  const srLower      =  r4Fell &&  s4Fell;
  const srExpanded   = !r4Fell &&  s4Fell;
  const srCompressed =  r4Fell && !s4Fell;

  const srCompressedHigher = srCompressed && (s4Distance > r4Distance || (s4Distance === r4Distance && s3S4Gap > r3R4Gap));
  const srCompressedLower  = srCompressed && (r4Distance > s4Distance || (r4Distance === s4Distance && r3R4Gap > s3S4Gap));
  const srExpandedHigher   = srExpanded   && (r4Distance > s4Distance || (r4Distance === s4Distance && r3R4Gap > s3S4Gap));
  const srExpandedLower    = srExpanded   && (s4Distance > r4Distance || (s4Distance === r4Distance && s3S4Gap > r3R4Gap));

  const cOU3L4 = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                 (today.r4 > prev.r2 && today.r4 < prev.r3);
  const cOL2U3 = (today.s4 >= prev.s2 && today.s4 < prev.s1) &&
                   (today.r4 > prev.r2 && today.r4 < prev.r3);
  const cOL3U3 = (today.s4 > prev.s3 && today.s4 < prev.s2) &&
                   (today.r4 > prev.r2 && today.r4 < prev.r3) && srCompressedHigher;
  const cOU3L3   = (today.s4 >= prev.s3 && today.s4 < prev.s2) &&
                   (today.r4 > prev.r2 && today.r4 < prev.r3) && srCompressedLower;

  // EqL4U4 — exact (within eqTol) day-over-day tie on BOTH outer levels:
  // today's R4 == prev's R4 and today's S4 == prev's S4.
  const EqL4U4 = eqTol(today.r4, prev.r4) && eqTol(today.s4, prev.s4);

  // InsideCPR — today's CPR band is contained inside prev day's CPR band
  // (single source of truth; ScreenerUtils reuses r.InsideCPR).
  const InsideCPR =
    (today.tc <= prev.tc && today.bc > prev.bc) ||
    (today.tc < prev.tc && today.bc >= prev.bc);
  const HiL4U3   = (prev.r4 >= today.r2 && prev.r4 < today.r3) &&
                   (today.s4 > prev.s4 && today.s4 < prev.s3);
  // HiL4U2 — today's S4 lands inside prev's S3/S4 band (L4, same support
  // band as HiL4U3/HiL4U4), AND prev's R4 lands inside today's R1/R2 band
  // (U2, one tier narrower than HiL4U3's U3 band).
  const HiL4U2   = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                   (prev.r4 > today.r1 && prev.r4 < today.r2);
  const HiL2U4   = (today.s4 > prev.s2 && today.s4 < prev.s1) &&
                   (prev.r4 > today.r3 && prev.r4 < today.r4);
  // HiL2U3 — today's S4 lands inside prev's S1/S2 band (L2, same support
  // band as HiL2U4), AND prev's R4 lands inside today's R2/R3 band (U3,
  // one tier narrower than HiL2U4's U4 band).
  const HiL2U3   = (today.s4 >= prev.s2 && today.s4 < prev.s1) &&
                   (prev.r4 > today.r2 && prev.r4 < today.r3);
  const HiL3U4   = (today.s4 >= prev.s3 && today.s4 < prev.s2) &&
                   (prev.r4 > today.r3 && prev.r4 < today.r4);
  const HiL4U4   = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                   (today.s4 >= prev.s4 && today.s4 < prev.s3);
  // HiL4U1 — today's S4 sits inside prev's S4/S3 band (L4) while prev's R4
  // lands inside today's BC/R1 band (U1): a much shallower upside overlap
  // than HiL4U4/U3/U2.
  const HiL4U1   = (today.s4 >= prev.s4 && today.s4 < prev.s3) &&
                   (prev.r4 > today.bc && prev.r4 < today.r1);
  const LoU4L4   = (today.r4 < prev.r4 && today.r4 > prev.r3) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  // eXHiU1L3 removed — it was an exact duplicate of eXL3U1 (same U1/L3
  // band conditions, just written in reverse order). All references now
  // point at eXL3U1 (see below).
  const eXL4U3 = (prev.s4 > today.s4 && prev.s4 < today.s3) &&
                   (prev.r4 > today.r2 && prev.r4 < today.r3);
  const eXU4L2 = (prev.r4 < today.r4 && prev.r4 > today.r3) &&
                   (prev.s4 < today.s1 && prev.s4 > today.s2);
  const eXU4L3  = (prev.r4 < today.r4 && prev.r4 > today.r3) &&
                   (prev.s4 < today.s2 && prev.s4 >= today.s3);
  const cOL2U4 = (today.s4 < prev.s1 && today.s4 > prev.s2) &&
                   (prev.r3 > today.r3 && prev.r3 < today.r4);
  const cOL4U4   = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                   (today.r4 > prev.r3 && today.r4 <= prev.r4) && (srCompressedHigher || srHigher);
  const cOU4L4   = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                   (today.r4 > prev.r3 && today.r4 < prev.r4) && srCompressedLower;
  const exL3U2   = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                   (prev.r4 > today.r1 && prev.r4 < today.r2);
  const cOL3U4   = (today.s4 >= prev.s3 && today.s4 < prev.s2) &&
                   (today.r4 > prev.r3 && today.r4 < prev.r4);
  
  const LoU3L4   = (today.r4 > prev.r2 && today.r4 <= prev.r3) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  const LoU3L3  = (today.r4 > prev.r2 && today.r4 < prev.r3) &&
                   (prev.s4 > today.s3 && prev.s4 < today.s2);
  const LoU2L4   = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  const LoU2L3   = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (prev.s4 > today.s3 && prev.s4 < today.s2);
  // LoU3L2 — today's R4 lands inside prev's R2/R3 band (U3, same resistance
  // band as LoU3L4/LoU3L3), AND prev's S4 lands inside today's S2/S1 band
  // (L2, same support band as LoU4L2) instead of the L4/L3 bands used by
  // LoU3L4/LoU3L3.
  const LoU3L2   = (today.r4 > prev.r2 && today.r4 <= prev.r3) &&
                   (prev.s4 > today.s2 && prev.s4 < today.s1);
  const LoU4L3  = (today.r4 > prev.r3 && today.r4 < prev.r4) &&
                   (prev.s4 >= today.s3 && prev.s4 < today.s2);
  const LoU4L2 = (today.r4 > prev.r3 && today.r4 < prev.r4) &&
                   (prev.s4 > today.s2 && prev.s4 < today.s1);
  const cOU2L3 = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (today.s4 > prev.s3 && today.s4 < prev.s2);
  const LoU4L1 = (today.r4 > prev.r3 && today.r4 < prev.r4) &&
                    (prev.s4 > today.s1 && prev.s4 < today.bc);
  const cOU2L4 = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (today.s4 > prev.s4 && today.s4 < prev.s3);

  const eXL3U3 = (prev.r4 < today.r3 && prev.r4 > today.r2) &&
                 (prev.s4 > today.s3 && prev.s4 < today.s2) && srExpandedHigher;
  const eXU3L3 = (prev.r4 < today.r3 && prev.r4 > today.r2) &&
                 (prev.s4 > today.s3 && prev.s4 < today.s2) && srExpandedLower;

   const eXL4U4   = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3) && srExpandedHigher;
  const eXU4L4   = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3) && srExpandedLower;

  const eXL2U1 = (prev.s4 > today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);
  const eXL3U1 = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);
  const eXL4U1 = (prev.s4 > today.s4 && prev.s4 < today.s3) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);

  const eXL1BC = (prev.s4 > today.s1 && prev.s4 < today.bc) &&
                  (prev.r4 > today.s1 && prev.r4 < today.bc);
  // eXL1CP — prev's S4 lands inside today's S1/BC band (L1, same support
  // band as eXL1BC), AND prev's R4 lands inside today's BC/Pivot band (the
  // lower half of today's CPR) instead of the wider S1/BC (CP) band eXL1BC uses.
  const eXL1CP = (prev.s4 >= today.s1 && prev.s4 < today.bc) &&
                  (prev.r4 > today.bc && prev.r4 < today.pivot);
  // eXL1TC — prev's S4 lands inside today's S1/BC band (L1, same support
  // band as eXL1BC/eXL1CP), AND prev's R4 lands inside today's Pivot/TC
  // band — one band higher than eXL1CP's BC/Pivot band, same TC-anchored
  // resistance band as eXL2TC/eXL3TC.
  const eXL1TC = (prev.s4 > today.s1 && prev.s4 < today.bc) &&
                  (prev.r4 > today.pivot && prev.r4 < today.tc);
  const eXL2BC = (prev.s4 > today.s2 && prev.s4 < today.s1) &&
                  (prev.r4 > today.s1 && prev.r4 < today.bc);
  const eXL3BC = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                  (prev.r4 > today.s1 && prev.r4 < today.bc);
  // eXL3CP — prev's S4 lands inside today's S2/S3 band (L3, same support
  // band as eXL3BC), AND prev's R4 lands inside today's BC/Pivot band (the
  // lower half of today's CPR) instead of the wider S1/BC (CP) band eXL3BC uses.
  const eXL3CP = (prev.s4 >= today.s3 && prev.s4 < today.s2) &&
                  (prev.r4 > today.bc && prev.r4 < today.pivot);

  const eXL4U2 = (prev.s4 > today.s4 && prev.s4 < today.s3) &&
                 (prev.r4 > today.r1  && prev.r4 < today.r2);
  const eXL2U2 = (prev.s4 >= today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.r1  && prev.r4 < today.r2);
  const eXL2TC = (prev.s4 > today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.pivot && prev.r4 < today.tc);
  const eXL3TC = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                 (prev.r4 > today.pivot && prev.r4 < today.tc);
  // eXL1U1 / eXU1L1 — same band shape (prev's S4 inside today's S1/BC (L1)
  // AND prev's R4 inside today's TC/R1 (U1)), split by which gap is larger:
  // if today's R1-to-prev's R4 gap is bigger, eXU1L1 fires; if today's
  // S1-to-prev's S4 gap is bigger, eXL1U1 fires.
  const eXL1U1Base = (prev.s4 > today.s1 && prev.s4 < today.bc) &&
                      (prev.r4 > today.tc  && prev.r4 < today.r1);
  const r1U1Gap = Math.abs(today.r1 - prev.r4);
  const s1U1Gap = Math.abs(today.s1 - prev.s4);
  const eXL1U1 = eXL1U1Base && s1U1Gap > r1U1Gap;
  const eXU1L1 = eXL1U1Base && r1U1Gap > s1U1Gap;

  // eXU2L1 — prev's R4 sits inside today's R1/R2 band (U2) AND prev's S4
  // sits inside today's BC/S1 band (L1). Same L1 support band as eXL1U1,
  // but the wider U2 resistance band instead of U1.
  const eXU2L1 = (prev.r4 > today.r1 && prev.r4 < today.r2) &&
                 (prev.s4 > today.s1 && prev.s4 < today.bc);

  // eXU3L1 — prev's R4 sits inside today's R2/R3 band (U3) AND prev's S4
  // sits inside today's BC/S1 band (L1). Same L1 support band as eXU2L1,
  // but the wider U3 resistance band (R2→R3) instead of U2 (R1→R2).
  const eXU3L1 = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.s1 && prev.s4 < today.bc);

  // eXU3L2 — same U3 resistance band as eXU3L1 (prev's R4 inside today's
  // R2/R3 band), but the support side is measured against prev's S3
  // (not S4) landing inside today's S1/S2 band (L2) instead of prev's
  // S4 landing inside today's BC/S1 band (L1).
  const eXU3L2 = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.s2 && prev.s4 < today.s1);

  // eXU2TC — prev's R4 sits inside today's R1/R2 band (U2) AND prev's S4
  // sits inside today's TC/R1 band. Same U2 resistance band as eXU2L1, but
  // the support-side condition is measured against today's TC→R1 gap
  // instead of the usual BC→S1 (L1) band — same "TC"-anchored naming
  // convention as eXL2TC/eXL3TC/cOTCL2.
  const eXU2TC = (prev.r4 > today.r1 && prev.r4 < today.r2) &&
                 (prev.s4 > today.tc && prev.s4 < today.r1);

  // eXU2BC — prev's R4 sits inside today's R1/R2 band (U2) AND prev's S4
  // sits inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U2 resistance band as eXU2L1/eXU2TC, but the support-side
  // condition is measured against today's BC→Pivot gap instead of the
  // usual BC→S1 (L1) or TC→R1 (TC) bands.
  const eXU2BC = (prev.r4 > today.r1 && prev.r4 < today.r2) &&
                 (prev.s4 > today.bc && prev.s4 < today.pivot);

  // eXU3TC — prev's R4 sits inside today's R2/R3 band (U3) AND prev's S4
  // sits inside today's TC/R1 band. Same TC-anchored support band as
  // eXU2TC, but paired with the wider U3 resistance band (R2→R3) instead
  // of U2 (R1→R2).
  const eXU3TC = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.tc && prev.s4 < today.r1);

  // eXU2CP — prev's R4 sits inside today's R1/R2 band (U2) AND prev's S4
  // sits inside today's Pivot/TC band (the upper half of today's CPR).
  // Same U2 resistance band as eXU2BC, but the support-side condition is
  // measured against today's Pivot→TC gap instead of BC→Pivot.
  const eXU2CP = (prev.r4 > today.r1 && prev.r4 < today.r2) &&
                 (prev.s4 > today.pivot && prev.s4 < today.tc);

  // eXU3CP — prev's R4 sits inside today's R2/R3 band (U3) AND prev's S4
  // sits inside today's Pivot/TC band (the upper half of today's CPR).
  // Same U3 resistance band as eXU3TC, but the support-side condition is
  // measured against today's Pivot→TC gap instead of TC→R1.
  const eXU3CP = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.pivot && prev.s4 < today.tc);

  // eXU3BC — prev's R4 sits inside today's R2/R3 band (U3) AND prev's S4
  // sits inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U3 resistance band as eXU3TC/eXU3CP, but the support-side
  // condition is measured against today's BC→Pivot gap instead of TC→R1
  // or Pivot→TC.
  const eXU3BC = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.bc && prev.s4 < today.pivot);

  // eXL2CP — prev's S4 sits inside today's S2/S1 band (L2) AND prev's R4
  // sits inside today's BC/Pivot band (the lower half of today's CPR).
  // Same L2 support band as eXL2BC, but the resistance-side condition is
  // measured against today's BC→Pivot gap instead of the usual S1→BC band.
  const eXL2CP = (prev.s4 >= today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.bc && prev.r4 <= today.pivot);

  // eXL4TC — prev's S4 sits inside today's S4/S3 band (L4, same support
  // band as eXL4U2) AND prev's R4 sits inside today's Pivot/TC band (the
  // upper half of today's CPR). Same TC-anchored resistance band as
  // eXL2TC/eXL3TC, paired with the widest L4 support band instead of L2/L3.
  const eXL4TC = (prev.s4 >= today.s4 && prev.s4 < today.s3) &&
                 (prev.r4 > today.pivot && prev.r4 < today.tc);

  // eXU4L1 — prev's R4 sits inside today's R3/R4 band (U4) AND prev's S4
  // sits inside today's BC/S1 band (L1). Mirror shape to eXU2L1/eXU3L1
  // but with the widest U-band (R3→R4) on the resistance side.
  const eXU4L1 = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                 (prev.s4 > today.s1 && prev.s4 < today.bc);

  // eXU4BC — prev's R4 sits inside today's R3/R4 band (U4) AND prev's S4
  // sits inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U4 resistance band as eXU4L1, but the support-side condition is
  // measured against today's BC→Pivot gap instead of BC→S1 (L1).
  const eXU4BC = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                 (prev.s4 > today.bc && prev.s4 < today.pivot);

  // LoCPL3 — today's R4 lands inside prev's Pivot/BC band (the lower half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same "today lands inside prev's band" shape as cOTCL2, but the
  // resistance side is measured against prev's BC→Pivot gap instead of
  // Pivot→TC, and paired with the wider L3 band instead of L2.
  const LoCPL3 = (today.r4 > prev.bc && today.r4 < prev.pivot) &&
                 (today.s4 > prev.s3 && today.s4 < prev.s2);

  // LoCPL2 — same resistance-side condition as LoCPL3 (today's R4 inside
  // prev's Pivot/BC band), but paired with the narrower L2 (S1/S2) support
  // band instead of L3 (S2/S3).
  const LoCPL2 = (today.r4 > prev.bc && today.r4 < prev.pivot) &&
                 (today.s4 > prev.s2 && today.s4 < prev.s1);

  // LoTCL3 — today's R4 lands inside prev's Pivot/TC band (the upper half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same L3 support band as LoCPL3, but the resistance side is measured
  // against prev's Pivot→TC gap instead of BC→Pivot.
  const LoTCL3 = (today.r4 > prev.pivot && today.r4 < prev.tc) &&
                 (today.s4 > prev.s3 && today.s4 < prev.s2);

  // eXHiL2L1 / eXLoL2L1 — prev's R4 AND prev's S4 both land inside today's
  // S1/S2 band (an unusually collapsed range where prev's entire R4-to-S4
  // span squeezed into a single today support band). Split by whether
  // today's PDL (today.prevLow) sits above (Hi) or below (Lo) prev's Pivot.
  const eXHiLoL2L1Bands = (prev.r4 > today.s2 && prev.r4 < today.s1) &&
                          (prev.s4 > today.s2 && prev.s4 < today.s1);
  const eXHiL2L1 = eXHiLoL2L1Bands && (today.prevLow > prev.pivot);
  const eXLoL2L1 = eXHiLoL2L1Bands && (today.prevLow < prev.pivot);

  // cOTCL2 — today's R4 lands inside the previous day's Pivot/TC band,
  // AND today's S4 lands inside the previous day's S1/S2 band. Same
  // compressed-band shape as cOU1L2 but the resistance side is measured
  // against prev's Pivot→TC gap instead of prev's TC→R1 gap.
  const cOTCL2 = (today.r4 > prev.pivot && today.r4 < prev.tc) &&
                 (today.s4 > prev.s2 && today.s4 < prev.s1);

  // L1pU1Above — prev's (R1 or PDH, whichever is lower) sits above today's
  // (PDH or R1, whichever is higher), AND today's (S1 or PDL, whichever is
  // higher) sits above prev's (PDL or S1, whichever is higher).
  const prevLowerR1PDH   = Math.min(prev.r1, prev.prevHigh);
  const todayHigherPDHR1 = Math.max(today.prevHigh, today.r1);
  const todayHigherS1PDL = Math.min(today.s1, today.prevLow);
  const prevHigherPDLS1  = Math.max(prev.prevLow, prev.s1);
  const L1pU1Above = (prevLowerR1PDH > todayHigherPDHR1) &&
                     (todayHigherS1PDL > prevHigherPDLS1);

  // pCPR1Above — "pCPR>U1 CPR>pL1":
  //   prev day's Pivot is above today's R1 and below today's R2, AND
  //   today's BC is above prev day's S1 and below prev day's BC.
  const pCPR1Above = (prev.pivot > today.r1 && prev.pivot < today.r2) &&
                       (today.tc > prev.s1 && today.tc < prev.bc); //In Some Scenarios p<s1 went up, so tc instead of pivot check

  // CPRs1Above — "CPR 1ABOVE":
  //   today's Pivot is above prev day's R1 and below prev day's R2, AND
  //   prev day's Pivot is below today's S1 and above today's S2.
  // FIX: was combined with || (OR), so a symbol matched on either clause
  // alone, pulling in an unrelated second population of symbols and
  // inflating the match count. Both clauses must now hold (AND).
  const CPRs1Above = (today.tc > prev.r1 && today.tc < prev.r2) && //tc instead of pivot check
                    (prev.bc < today.s1 && prev.bc > today.s2);//In Some Scenarios p>s1 went up, so bc instead of pivot check

  // cOU1L1 / cOL1U1 — split by which side (R1 vs S1) moved further.
  const r1Move = Math.abs(prev.r1 - today.r1);
  const s1Move = Math.abs(prev.s1 - today.s1);
  const cOU1L1Base = (today.s4 > prev.s1 && today.s4 < prev.tc) &&
                     (today.r4 > prev.bc && today.r4 < prev.r1);
  const cOU1L1 = cOU1L1Base && r1Move > s1Move;
  const cOL1U1 = cOU1L1Base && r1Move < s1Move;

  const cOU1L2 = (today.s4 > prev.s2 && today.s4 < prev.s1) &&
                 (today.r4 < prev.r1 && today.r4 > prev.tc);

  // HiL3U3 — today's S4 lands inside prev's S3/S2 band (L3) AND prev's R4
  // lands inside today's R2/R3 band (U3).
  const HiL3U3 = (today.s4 > prev.s3 && today.s4 < prev.s2) &&
                 (prev.r4 > today.r2 && prev.r4 < today.r3);

  // HiL3U2 — today's S4 lands inside prev's S3/S2 band (L3, same support
  // band as HiL3U3), AND prev's R4 lands inside prev's OWN R1/R2 band (U2)
  // instead of today's R-levels.
  const HiL3U2 = (today.s4 >= prev.s3 && today.s4 < prev.s2) &&
                 (prev.r4 < today.r2 && prev.r4 > today.r1);

  // cOU1L3 — today's R4 lands inside prev's TC/R1 band (U1) AND today's S4
  // lands inside prev's S3/S2 band (L3).
  const cOU1L3 = (today.r4 > prev.tc && today.r4 < prev.r1) &&
                 (today.s4 > prev.s3 && today.s4 < prev.s2);

  // cOU2L2 / cOL2U2 — split by which side (R2 vs S2) moved further.
  const r2Move = Math.abs(prev.r2 - today.r4);
  const s2Move = Math.abs(prev.s2 - today.s4);
  const cOU2L2Base = (today.s4 >= prev.s2 && today.s4 < prev.s1) &&
                     (today.r4 > prev.r1 && today.r4 < prev.r2);
  const cOU2L2 = cOU2L2Base && r2Move > s2Move;
  const cOL2U2 = cOU2L2Base && r2Move < s2Move;

  // cOL1U2 — today's S4 lands inside prev's S1/BC band (L1) AND today's R4
  // lands inside prev's R1/R2 band (U2). Same U2 resistance band as
  // cOU2L2/cOL2U2, but the support side uses prev's S1→BC gap (L1) instead
  // of S2→S1 (L2).
  const cOL1U2 = (today.s4 >= prev.s1 && today.s4 < prev.bc) &&
                 (today.r4 > prev.r1 && today.r4 < prev.r2);

  // cOL1U3 — today's S4 lands inside prev's S1/BC band (L1, same support
  // band as cOL1U2) AND today's R4 lands inside prev's R2/R3 band (U3,
  // same resistance band as cOL2U3/cOL3U3).
  const cOL1U3 = (today.s4 >= prev.s1 && today.s4 < prev.bc) &&
                 (today.r4 > prev.r2 && today.r4 < prev.r3);

  return {
    r4Distance, s4Distance,
    srHigher, srLower, srExpanded, srCompressed,
    srCompressedHigher, srCompressedLower, srExpandedHigher, srExpandedLower,
    cOU3L4, cOL2U3, cOL3U3, eXL4U4, eXU4L4, EqL4U4, InsideCPR, HiL4U3, HiL4U2, HiL2U4, HiL2U3, HiL3U4, HiL4U4, HiL4U1,
    LoU4L4, eXL4U3, eXU4L2, eXU4L3, cOL2U4, cOL4U4, cOU4L4, exL3U2,
    cOL3U4, cOU3L3, LoU3L4, LoU3L3, cOU2L3, LoU2L4, LoU2L3, LoU4L3, LoU4L2,
    LoU4L1, cOU1L2, cOU2L4, eXL3U3, eXU3L3,
    cOU1L1, cOL1U1, cOU2L2, cOL2U2,
    HiL3U3, cOU1L3,
    eXL2U1, eXL3U1, eXL4U1, eXL1BC, eXL1CP, eXL1TC, eXL2BC, eXL3BC, eXL3CP,
    eXL3TC, eXL4U2, eXL2U2, eXL2TC, eXL1U1, eXU1L1, eXU2L1, cOTCL2, L1pU1Above, pCPR1Above, CPRs1Above,
    eXU3L1, eXU3L2, eXU2TC, eXU2BC, eXU3TC, eXU2CP, eXU3CP, eXU3BC, eXU4L1, eXU4BC, LoCPL3, LoCPL2, LoTCL3,
    eXHiL2L1, eXLoL2L1, eXL2CP, eXL4TC, LoU3L2, cOL1U2, cOL1U3, HiL3U2,
  };
}

/**
 * pickPattern — priority-ordered label lookup. This is the ONLY
 * place the label strings and their tie-break order live. The order below
 * must match the if-chain that historically lived in ScreenerUtils.
 */
export function pickPattern(f: CPRPairFlags): string | null {
  if (f.cOU3L4)    return "cOU3L4";
  if (f.cOL2U3)  return "cOL2U3";
  if (f.cOL3U3)  return "cOL3U3";
  if (f.EqL4U4)    return "EqL4U4";
  if (f.eXL4U4)    return "eXL4U4";
  if (f.eXU4L4)    return "eXU4L4";
  if (f.HiL4U3)   return "HiL4U3";
  if (f.HiL4U2)   return "HiL4U2";
  if (f.HiL4U1)   return "HiL4U1";
  if (f.HiL2U4)    return "HiL2U4";
  if (f.HiL2U3)    return "HiL2U3";
  if (f.HiL3U4)    return "HiL3U4";
  if (f.HiL4U4)    return "HiL4U4";
  if (f.LoU4L4)    return "LoU4L4";
  if (f.eXL4U3)  return "eXL4U3";
  if (f.eXU4L2)  return "eXU4L2";
  if (f.eXU4L3)   return "eXU4L3";
  if (f.cOL2U4)  return "cOL2U4";
  if (f.cOL4U4)    return "cOL4U4";
  if (f.cOU4L4)    return "cOU4L4";
  if (f.exL3U2)    return "exL3U2";
  if (f.cOL3U4)    return "cOL3U4";
  if (f.cOU3L3)    return "cOU3L3";
  if (f.LoU3L4)    return "LoU3L4";
  if (f.LoU3L3)   return "LoU3L3";
  // cOU2L3 checked before other U2-band branches so its badge wins ties.
  if (f.cOU2L3)  return "cOU2L3";
  if (f.LoU2L4)    return "LoU2L4";
  if (f.LoU2L3)    return "LoU2L3";
  if (f.LoU4L3)   return "LoU4L3";
  if (f.LoU4L2)  return "LoU4L2";
  if (f.cOL2U2)    return "cOL2U2";
  if (f.LoU4L1) return "LoU4L1";
  if (f.cOU1L2)    return "cOU1L2";
  if (f.cOU2L4)  return "cOU2L4";
  if (f.eXL3U3)    return "eXL3U3";
  if (f.eXU3L3)    return "eXU3L3";
  if (f.cOU1L1)    return "cOU1L1";
  if (f.cOL1U1)    return "cOL1U1";
  if (f.cOU2L2)    return "cOU2L2";
  if (f.HiL3U3)    return "HiL3U3";
  if (f.cOU1L3)    return "cOU1L3";
  if (f.eXL2U1)    return "eXL2U1";
  if (f.eXL3U1)    return "eXL3U1";
  if (f.eXL4U1)    return "eXL4U1";
  if (f.eXL1BC)   return "eXL1BC";
  if (f.eXL1CP)   return "eXL1CP";
  if (f.eXL1TC)   return "eXL1TC";
  if (f.eXL2BC)   return "eXL2BC";
  if (f.eXL3BC)   return "eXL3BC";
  if (f.eXL3CP)   return "eXL3CP";
  if (f.eXL3TC)    return "eXL3TC";
  if (f.eXL4U2)    return "eXL4U2";
  if (f.eXL2U2)    return "eXL2U2";
  if (f.eXL2TC)    return "eXL2TC";
  if (f.eXL1U1)    return "eXL1U1";
  if (f.eXU1L1)    return "eXU1L1";
  if (f.eXU2L1)    return "eXU2L1";
  if (f.cOTCL2)    return "cOTCL2";
  if (f.eXU3L1)    return "eXU3L1";
  if (f.eXU3L2)    return "eXU3L2";
  if (f.eXU2TC)    return "eXU2TC";
  if (f.eXU2BC)    return "eXU2BC";
  if (f.eXU3TC)    return "eXU3TC";
  if (f.eXU2CP)    return "eXU2CP";
  if (f.eXU3CP)    return "eXU3CP";
  if (f.eXU3BC)    return "eXU3BC";
  if (f.eXU4L1)    return "eXU4L1";
  if (f.eXU4BC)    return "eXU4BC";
  if (f.LoCPL3)    return "LoCPL3";
  if (f.LoCPL2)    return "LoCPL2";
  if (f.LoTCL3)    return "LoTCL3";
  if (f.eXHiL2L1)  return "eXHiL2L1";
  if (f.eXLoL2L1)  return "eXLoL2L1";
  if (f.eXL2CP)    return "eXL2CP";
  if (f.eXL4TC)    return "eXL4TC";
  if (f.LoU3L2)    return "LoU3L2";
  if (f.cOL1U2)    return "cOL1U2";
  if (f.cOL1U3)    return "cOL1U3";
  if (f.HiL3U2)    return "HiL3U2";
  return null;
}

/**
 * PatternCategory — the six structural buckets every band-classification
 * pattern flag (CPRPairFlags key) belongs to, derived from the flag's name
 * prefix (and, for cO/eX, whether the name starts with cOU/eXU):
 *   cOU... -> "cOLower"   (Compressed, name starts with "cOU")
 *   cO...  -> "cOHigher"  (Compressed, everything else)
 *   eXU... -> "eXLower"   (Expanded, name starts with "eXU")
 *   eX...  -> "eXHigher"  (Expanded, everything else)
 *   Hi     -> "Higher"    (today's band sits higher relative to prev's)
 *   Lo     -> "Lower"     (today's band sits lower relative to prev's)
 *
 * cO/eX were originally a single "Compressed"/"Expanded" category each;
 * they were split into Higher/Lower sub-buckets purely by name prefix
 * (cOU.../eXU... vs everything else) so left-nav sub-filters can group
 * them more granularly. This split is name-prefix based only — it is
 * NOT the same thing as the pre-existing "Higher"/"Lower" category
 * (Hi.../Lo... prefixed flags), which is unrelated and unchanged.
 */
export type PatternCategory = "cOHigher" | "cOLower" | "eXHigher" | "eXLower" | "Higher" | "Lower";

/**
 * PATTERN_CATEGORY — single source of truth mapping every pattern flag
 * name to its PatternCategory, for gating left-nav sub-filter (view)
 * check conditions (e.g. "only show this view's checkbox under the
 * cOHigher group"). Built directly from the CPRPairFlags keys above —
 * do not re-derive a flag's category by eyeballing its name at the call
 * site, look it up here instead.
 *
 * Two gotchas baked into this table on purpose:
 *  - `exL3U2` is a legacy lowercase-x spelling (not `eXL3U2`) but is still
 *    an Expanded-family flag; it's included here under its actual key.
 *    It does not start with "eXU" (case-sensitive), so it lands in
 *    "eXHigher".
 *  - `eXHiL2L1` and `eXLoL2L1` start with "eX", not "Hi"/"Lo" — the
 *    Hi/Lo in their names refers to the PDL-vs-prev-Pivot split described
 *    in cpr.ts, not the Higher/Lower category. Neither starts with "eXU",
 *    so both are categorized here as "eXHigher".
 *
 * Flags that don't carry a cO/eX/Hi/Lo prefix (srHigher/srLower/srExpanded/
 * srCompressed and their *Higher/*Lower variants, r4Distance, s4Distance,
 * L1pU1Above, pCPR1Above, CPRs1Above) are intentionally excluded — they're
 * aggregate/directional signals, not named band-classification patterns,
 * so they don't belong in a prefix-based category map.
 */
export const PATTERN_CATEGORY: Record<string, PatternCategory> = {
  // ---- Compressed: cOLower (name starts with "cOU") ----
  cOU3L4: "cOLower",
  cOU4L4: "cOLower",
  cOU3L3: "cOLower",
  cOU2L3: "cOLower",
  cOU1L2: "cOLower",
  cOU2L4: "cOLower",
  cOU1L1: "cOLower",
  cOU2L2: "cOLower",
  cOU1L3: "cOLower",

  // ---- Compressed: cOHigher (remaining cO...) ----
  cOL2U3: "cOHigher",
  cOL3U3: "cOHigher",
  cOL2U4: "cOHigher",
  cOL4U4: "cOHigher",
  cOL3U4: "cOHigher",
  cOL1U1: "cOHigher",
  cOL2U2: "cOHigher",
  cOTCL2: "cOHigher",
  cOL1U2: "cOHigher",
  cOL1U3: "cOHigher",

  // ---- Expanded: eXLower (name starts with "eXU") ----
  eXU4L4: "eXLower",
  eXU4L2: "eXLower",
  eXU4L3: "eXLower",
  eXU3L3: "eXLower",
  eXU1L1: "eXLower",
  eXU2L1: "eXLower",
  eXU3L1: "eXLower",
  eXU3L2: "eXLower",
  eXU2TC: "eXLower",
  eXU2BC: "eXLower",
  eXU3TC: "eXLower",
  eXU2CP: "eXLower",
  eXU3CP: "eXLower",
  eXU3BC: "eXLower",
  eXU4L1: "eXLower",
  eXU4BC: "eXLower",

  // ---- Expanded: eXHigher (remaining eX... / legacy exL3U2) ----
  eXL4U4: "eXHigher",
  eXL4U3: "eXHigher",
  exL3U2: "eXHigher", // legacy lowercase spelling — see note above
  eXL3U3: "eXHigher",
  eXL2U1: "eXHigher",
  eXL3U1: "eXHigher",
  eXL4U1: "eXHigher",
  eXL1BC: "eXHigher",
  eXL1CP: "eXHigher",
  eXL1TC: "eXHigher",
  eXL2BC: "eXHigher",
  eXL3BC: "eXHigher",
  eXL3CP: "eXHigher",
  eXL3TC: "eXHigher",
  eXL4U2: "eXHigher",
  eXL2U2: "eXHigher",
  eXL2TC: "eXHigher",
  eXL1U1: "eXHigher",
  eXHiL2L1: "eXHigher", // name contains "Hi" but prefix is "eX" — see note above
  eXLoL2L1: "eXHigher", // name contains "Lo" but prefix is "eX" — see note above
  eXL2CP: "eXHigher",
  eXL4TC: "eXHigher",

  // ---- Higher (Hi...) ----
  HiL4U3: "Higher",
  HiL4U2: "Higher",
  HiL4U1: "Higher",
  HiL2U4: "Higher",
  HiL2U3: "Higher",
  HiL3U4: "Higher",
  HiL4U4: "Higher",
  HiL3U3: "Higher",
  HiL3U2: "Higher",
  EqL4U4: "Higher", // exact R4/S4 tie — lands in srHigher (see classifyCPRPair)

  // ---- Lower (Lo...) ----
  LoU4L4: "Lower",
  LoU3L4: "Lower",
  LoU3L3: "Lower",
  LoU2L4: "Lower",
  LoU2L3: "Lower",
  LoU4L3: "Lower",
  LoU4L2: "Lower",
  LoU4L1: "Lower",
  LoCPL3: "Lower",
  LoCPL2: "Lower",
  LoTCL3: "Lower",
  LoU3L2: "Lower",
};

/**
 * getPatternCategory — look up a pattern flag's category by name (e.g.
 * the string returned by pickPattern / computePrevPattern). Returns
 * null for names outside PATTERN_CATEGORY (unprefixed aggregate flags,
 * or an unrecognized string) instead of throwing, since sub-label strings
 * may originate from user-facing filter config.
 */
export function getPatternCategory(name: string | null | undefined): PatternCategory | null {
  if (!name) return null;
  return PATTERN_CATEGORY[name] ?? null;
}

export function analyzeCPR(
    symbol: string,
    candles: OHLC[],
    currentPrice: number,
    change24h: number,
    quoteVolume: number,
    openPrice?: number
  ): CPRResult | null {
  if (candles.length < 2) return null;

  const prevCandle  = candles[candles.length - 2];
  const todayCandle = candles[candles.length - 1];

  if (!prevCandle || !todayCandle) return null;
  if (!isValidCandle(prevCandle) || !isValidCandle(todayCandle)) return null;

  const prevCPR  = calcCPR(prevCandle);
  const todayCPR = calcCPR(todayCandle);

  const ppCandle = candles.length >= 3 ? candles[candles.length - 3] : null;
  const ppCPR = ppCandle && isValidCandle(ppCandle) ? calcCPR(ppCandle) : undefined;
  const ppCPRField = ppCPR ? { ppCPR } : {};

  // Single source of truth for the (today, prev) band classification. Every
  // pivot-band flag on CPRResult comes from here via spread; ScreenerUtils
  // uses the same classifier for (prev, pp) to build the p(...) sub-label.
  const flags = classifyCPRPair(todayCPR, prevCPR);

  const minGap = prevCPR.pivot * 0.001;
  // Equal CPR computed FIRST so wider/narrower/overlap flags can exclude it —
  // otherwise a hair-thin numeric drift lights up both "Equal" and
  // "Wide"/"Narrow"/"Overlap Below" badges at once.
  const equalCPR =
    eqTol(prevCPR.tc, todayCPR.tc) &&
    eqTol(prevCPR.pivot, todayCPR.pivot) &&
    eqTol(prevCPR.bc, todayCPR.bc);

  const cprRising        = !equalCPR && todayCPR.bc > prevCPR.tc;
  const cprFalling       = !equalCPR && todayCPR.tc < prevCPR.bc;
  const outCPR           = todayCPR.tc > prevCPR.tc && todayCPR.bc < prevCPR.bc;
  const strWideCPR       = !equalCPR && todayCPR.widthPct > prevCPR.widthPct;
  const narrowCPR        = !equalCPR && todayCPR.widthPct < prevCPR.widthPct;
  const compressionRatio = prevCPR.width > 0 ? (todayCPR.width / prevCPR.width) * 100 : 100;
  const cprNarrowing     = compressionRatio < 50;
  const bothTight        = todayCPR.widthPct < 0.5 && prevCPR.widthPct < 0.5;

  const PL12CL23 = (todayCPR.s2 < prevCPR.s1 && todayCPR.s3 > prevCPR.s2);
  const PU12CU23 = (prevCPR.r1 < todayCPR.r2 && prevCPR.r2 > todayCPR.r3);
  const PU23CU34 = (prevCPR.r2 < todayCPR.r3 && prevCPR.r3 > todayCPR.r4);
  const PL34CL34 = (prevCPR.s3 > todayCPR.s3 && prevCPR.s4 < todayCPR.s4);
  const PL34CL4  = (prevCPR.s3 > todayCPR.s4 && prevCPR.s4 < todayCPR.s4);

  const lbJPattern1 = ((prevCPR.bc - todayCPR.tc) >= minGap) && todayCPR.widthPct < 1 &&
                      (todayCPR.s2 < prevCPR.s1 && todayCPR.s3 > prevCPR.s2);
  const lbJPattern2 = ((prevCPR.bc - todayCPR.tc) >= minGap) && todayCPR.widthPct < 1 && todayCPR.r2 < prevCPR.r1 &&
                      (todayCPR.s1 < prevCPR.s1 && todayCPR.s2 < prevCPR.s2 &&
                       todayCPR.s3 < prevCPR.s3 && todayCPR.s4 < prevCPR.s4);

  const overlapHigher = !equalCPR && (todayCPR.bc >= prevCPR.bc && todayCPR.bc <= prevCPR.tc) && todayCPR.tc > prevCPR.tc;
  const overlapLower  = !equalCPR && (todayCPR.tc <= prevCPR.tc && todayCPR.tc >= prevCPR.bc) && todayCPR.bc < prevCPR.bc;

  const allupabove = (todayCPR.r1 > prevCPR.r1) && (todayCPR.r1 < prevCPR.r2) &&
                     (todayCPR.r2 > prevCPR.r2) && (todayCPR.r2 < prevCPR.r3) &&
                     (todayCPR.r3 > prevCPR.r3) && (todayCPR.r3 < prevCPR.r4) &&
                     (todayCPR.r4 > prevCPR.r4);
  const allupbelow = (todayCPR.s1 > prevCPR.s1) && (todayCPR.s1 < prevCPR.bc) &&
                     (todayCPR.s2 > prevCPR.s2) && (todayCPR.s2 < prevCPR.s1) &&
                     (todayCPR.s3 > prevCPR.s3) && (todayCPR.s3 < prevCPR.s2) &&
                     (todayCPR.s4 > prevCPR.s4) && (todayCPR.s4 < prevCPR.s3);
  const alldownabove = (todayCPR.r1 < prevCPR.r1 && todayCPR.r1 > prevCPR.tc) &&
                       (todayCPR.r2 < prevCPR.r2 && todayCPR.r2 > prevCPR.r1) &&
                       (todayCPR.r3 < prevCPR.r3 && todayCPR.r3 > prevCPR.r2) &&
                       (todayCPR.r4 < prevCPR.r4 && todayCPR.r4 > prevCPR.r3);
  const alldownbelow = (todayCPR.s1 < prevCPR.s1 && todayCPR.s1 > prevCPR.s2) &&
                       (todayCPR.s2 < prevCPR.s2 && todayCPR.s2 > prevCPR.s3) &&
                       (todayCPR.s3 < prevCPR.s3 && todayCPR.s3 > prevCPR.s4) &&
                       todayCPR.s4 < prevCPR.s4;

  const lbtJPattern1 = (todayCPR.r1 < prevCPR.r1 && todayCPR.s1 < prevCPR.s1) &&
                       (prevCPR.r1 > todayCPR.r1 && prevCPR.r2 > todayCPR.r2 &&
                        prevCPR.r3 > todayCPR.r3 && prevCPR.r4 > todayCPR.r4);

  const hbJPattern1 = (todayCPR.s1 < prevCPR.s2 && todayCPR.s1 > prevCPR.s3) && prevCPR.widthPct < 0.5 &&
                      (todayCPR.s2 > prevCPR.r1 && todayCPR.s3 < prevCPR.r2);
  const hbJPattern2 = (todayCPR.s1 < prevCPR.s4 && todayCPR.r1 > prevCPR.tc) && prevCPR.widthPct < 0.5;
  const hbJPattern3 = (todayCPR.s1 < prevCPR.s2 && todayCPR.s1 > prevCPR.s3) && prevCPR.widthPct < 0.5 &&
                      ((todayCPR.r1 < prevCPR.r1 && todayCPR.r1 > prevCPR.tc) &&
                       (todayCPR.r2 > prevCPR.r2 && todayCPR.r2 < prevCPR.r3));
  const hbJPattern4 = (todayCPR.s1 > prevCPR.s1 && todayCPR.s1 < prevCPR.bc) && prevCPR.widthPct < 0.5 &&
                      todayCPR.r4 < prevCPR.r1;

  // Previous day Pivot→R1 / Pivot→S1 gaps (raw price units)
  const prevR1Gap = prevCPR.r1 - prevCPR.pivot;
  const prevS1Gap = prevCPR.pivot - prevCPR.s1;


  // SSLLAbove / HHRRBelow — today vs prev S1/PDL and R1/PDH directional
  // classification, anchored to whichever of prev's two levels is more
  // extreme (higher floor / lower ceiling).
  const prevSLLFloor = Math.max(prevCPR.s1, prevCPR.prevLow);
  const SSLLAbove = todayCPR.s1 > prevSLLFloor && todayCPR.prevLow > prevSLLFloor;

  const prevRHHCeiling = Math.min(prevCPR.r1, prevCPR.prevHigh);
  const HHRRBelow = todayCPR.r1 < prevRHHCeiling && todayCPR.prevHigh < prevRHHCeiling;

  // PDHPDLGapCategory — HHGap = |today's PDH - prev's PDH|, LLGap =
  // |today's PDL - prev's PDL|. Whichever gap is larger wins; equal gaps
  // fall back to "EqGap".
  const HHGapVal = Math.abs(todayCPR.prevHigh - prevCPR.prevHigh);
  const LLGapVal = Math.abs(todayCPR.prevLow - prevCPR.prevLow);
  const PDHPDLGapCategory: PDHPDLGapCategory =
    HHGapVal > LLGapVal ? "HHGap" :
    LLGapVal > HHGapVal ? "LLGap" :
    "EqGap";

  // SSRRCategory — see field doc on CPRResult. 5-way partition over
  // today's R1/S1 vs prev's R1/S1; falls through to "none".
  const SSRRAbove = todayCPR.r1 > prevCPR.r1 && todayCPR.s1 >= prevCPR.s1;
  const SSRRBelow = todayCPR.r1 <= prevCPR.r1 && todayCPR.s1 < prevCPR.s1;
  const SSRRCompressed = todayCPR.r1 < prevCPR.r1 && todayCPR.s1 > prevCPR.s1;
  const SSRRExpanded = todayCPR.r1 > prevCPR.r1 && todayCPR.s1 < prevCPR.s1;
  const SSRREqual = todayCPR.r1 === prevCPR.r1 && todayCPR.s1 === prevCPR.s1;
  const SSRRCategory: SSRRCategory =
    SSRRAbove ? "SSRR-A" :
    SSRRBelow ? "SSRR-B" :
    SSRRCompressed ? "SSRR-C" :
    SSRRExpanded ? "SSRR-X" :
    SSRREqual ? "SSRR=" :
    "none";

  // HHLLCategory — see field doc on CPRResult. A true 5-way mutually
  // exclusive partition over today's PDH/PDL vs prev's PDH/PDL (verified:
  // no two of the five conditions can both be true for the same row).
  // Not exhaustive — a PDH held flat while PDL rose, or PDH fell while PDL
  // held flat, matches none of the five and falls through to "none".
  const HHLLCategory: HHLLCategory =
    (todayCPR.prevHigh > prevCPR.prevHigh && todayCPR.prevLow >= prevCPR.prevLow) ? "HHLL-A" :
    (todayCPR.prevHigh <= prevCPR.prevHigh && todayCPR.prevLow < prevCPR.prevLow) ? "HHLL-B" :
    (todayCPR.prevHigh < prevCPR.prevHigh && todayCPR.prevLow > prevCPR.prevLow) ? "HHLL-C" :
    (todayCPR.prevHigh > prevCPR.prevHigh && todayCPR.prevLow < prevCPR.prevLow) ? "HHLL-X" :
    (todayCPR.prevHigh === prevCPR.prevHigh && todayCPR.prevLow === prevCPR.prevLow) ? "HHLL=" :
    "none";

  return {
    symbol,
    todayCPR,
    prevCPR,
    ...ppCPRField,
    compressionRatio,
    cprRising,
    PL12CL23,
    allupabove,
    allupbelow,
    alldownabove,
    alldownbelow,
    cprFalling,
    PU12CU23,
    PU23CU34,
    PL34CL34,
    PL34CL4,
    lbJPattern1,
    lbJPattern2,
    hbJPattern1,
    hbJPattern2,
    hbJPattern3,
    hbJPattern4,
    cprNarrowing,
    overlapHigher,
    overlapLower,
    outCPR,
    lbtJPattern1,
    strWideCPR,
    narrowCPR,
    bothTight,
    equalCPR,
    ...flags,
    passes: cprRising && cprNarrowing,
    currentPrice,
    openPrice: openPrice ?? todayCandle.open,
    change24h,
    quoteVolume,
    prevR1Gap,
    prevS1Gap,
    SSLLAbove,
    HHRRBelow,
    PDHPDLGapCategory,
    SSRRCategory,
    HHLLCategory,
  };
}
