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
  HLSwitch: HLSwitch;
  // hlGap — |prevHigh - r1| magnitude for this single level set. Used only
  // to compare "today's gap" vs "prev's gap" (see CPRResult.hlGapWinner) —
  // a cosmetic modifier on the existing HL-A/HL-B PDH/PDL badges, not a new
  // filterable category.
  hlGap: number;
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
  // r1DirVsPrev / s1DirVsPrev — tolerance-aware direction (dirTol: -1 down,
  // 0 flat, +1 up) of today's R1/S1 vs prev's R1/S1. Computed once here and
  // reused by compressed/LevelsBelow/LevelsAbove below, and by analyzeCPR's
  // SSRRCategory partition (same underlying R1/S1 comparison), so it's
  // exposed on the flags object instead of being recomputed per caller.
  r1DirVsPrev: -1 | 0 | 1;
  s1DirVsPrev: -1 | 0 | 1;

  // Band-classification flags (order below matches pickPattern priority)
  CL4U3: boolean;
  CU3L2: boolean;
  CU3L3: boolean;
  EU4L4: boolean;
  EL4U4: boolean;
  /** QU4L4 — today's R4 equals prev's R4 AND today's S4 equals prev's S4 (within eqTol). */
  QU4L4: boolean;
  /** InsideCPR — today's CPR band sits strictly inside prev day's CPR band. */
  InsideCPR: boolean;
  U3L4: boolean;
  U2L4: boolean;
  U1L4: boolean;
  U4L2: boolean;
  U3L2: boolean;
  U4L3: boolean;
  U4L4: boolean;
  L4U4: boolean;
  EU3L4: boolean;
  EL2U4: boolean;
  EL3U4: boolean;
  CU4L2: boolean;
  CU4L4: boolean;
  CL4U4: boolean;
  EU2L3: boolean;
  CU4L3: boolean;
  CL3U3: boolean;
  L4U3: boolean;
  L3U3: boolean;
  CL3U2: boolean;
  L4U2: boolean;
  L3U2: boolean;
  L3U4: boolean;
  L2U4: boolean;
  L1U4: boolean;
  CL2U1: boolean;
  CL4U2: boolean;
  EU3L3: boolean;
  EL3U3: boolean;
  CL1U1: boolean;
  CU1L1: boolean;
  CL2U2: boolean;
  CU2L2: boolean;
  U3L3: boolean;
  CL3U1: boolean;

  // Additional flags consumed elsewhere on CPRResult (not part of the
  // pivotSubLabel chain, but still pure functions of a (today, prev) pair).
  EU1L2: boolean;
  EU1L3: boolean;
  EU1L4: boolean;
  EUBL1: boolean;
  EUPL1: boolean;
  // EUTL1 — same L1 support band as EUBL1/EUPL1 (prev's S4 inside
  // today's S1/BC), AND prev's R4 lands inside today's Pivot/TC band —
  // one band higher than EUPL1's BC/Pivot band, same TC-anchored
  // resistance band as EUTL2/EUTL3.
  EUTL1: boolean;
  EUBL2: boolean;
  EUBL3: boolean;
  EUPL3: boolean;
  EUTL3: boolean;
  EU2L4: boolean;
  EU2L2: boolean;
  EUTL2: boolean;
  EU1L1: boolean;
  // EL1U1 — same band shape as EU1L1 (prev's S4 inside today's S1/BC (L1)
  // AND prev's R4 inside today's TC/R1 (U1)), but split from it by which
  // gap is larger: if today's R1-to-prev's R4 gap is bigger, this fires
  // (EL1U1); if today's S1-to-prev's S4 gap is bigger, EU1L1 fires instead.
  EL1U1: boolean;
  // EL1U2 — prev's R4 lands inside today's R1/R2 band (U2), AND prev's S4
  // lands inside today's BC/S1 band (L1). Same "L1" support band as
  // EU1L1/EUBL1 but paired with the wider U2 (R1→R2) resistance band
  // instead of U1 (TC→R1).
  EL1U2: boolean;
  CL2UT: boolean;
  // compressed — "COMPRESSED": RRSS-C only (see classifyCPRPair for the
  // exact tolerance-aware R1/S1 test, mirroring SSRRCategory === "RRSS-C").
  // Note: r1 down + s1 flat is NOT compressed — that lands in LevelsBelow
  // (RRSS-B) instead. Formerly a two-clause CPR-band test named
  // L1pU1Above; simplified.
  compressed: boolean;
  // expanded — "EXPANDED": RRSS-E only (see classifyCPRPair for the
  // exact tolerance-aware R1/S1 test, mirroring SSRRCategory === "RRSS-E").
  // Mirrors compressed above.
  expanded: boolean;
  // LevelsBelow — "LEVEL BELOW": RRSS-B only (today's R1 down AND today's
  // S1 not up vs prev — this includes r1 down + s1 flat — OR today's R1
  // flat AND today's S1 down, i.e. same tolerance-aware test as
  // SSRRCategory === "RRSS-B"). Formerly a two-clause CPR-band test named
  // pCPR1Above; simplified.
  LevelsBelow: boolean;
  // LevelsAbove — "LEVEL ABOVE": RRSS-A only (today's R1 up AND today's S1
  // not down vs prev, i.e. same tolerance-aware test as SSRRCategory ===
  // "RRSS-A"), AND NOT R1AbovePR4 (see below) — that carve-out belongs to
  // "ABOVE LEVEL4" instead. Formerly a two-clause CPR-band test named
  // CPRs1Above; simplified.
  LevelsAbove: boolean;
  // R1AbovePR4 — "ABOVE LEVEL4" base condition: today's R1 above prev's R4
  // (plain magnitude comparison, no tolerance — matches the raw
  // `today.r1 > prev.r4` test formerly inlined at every "R1AbovePR4" call
  // site). Also subtracted out of LevelsAbove above so the two sections
  // never share a symbol.
  R1AbovePR4: boolean;
  // S1BelowPS4 — "BELOW LEVEL4" base condition, mirroring R1AbovePR4:
  // today's S1 below prev's S4 (plain magnitude comparison, no tolerance
  // — matches the raw `today.s1 < prev.s4` test). Also subtracted out of
  // LevelsBelow below so the two sections never share a symbol.
  S1BelowPS4: boolean;
  // EL1U3 — prev's R4 lands inside today's R2/R3 band (U3), AND prev's S4
  // lands inside today's BC/S1 band (L1). Same L1 support band as EL1U2/
  // EU1L1/EUBL1 but paired with the wider U3 (R2→R3) resistance band.
  EL1U3: boolean;
  // EL2U3 — prev's R4 lands inside today's R2/R3 band (U3, same
  // resistance band as EL1U3), AND prev's S3 (not S4) lands inside
  // today's S1/S2 band (L2).
  EL2U3: boolean;
  // ELTU2 — prev's R4 lands inside today's R1/R2 band (U2), AND prev's S4
  // lands inside today's TC/R1 band (a "TC"-anchored band, same naming
  // convention as EUTL2/EUTL3/CL2UT which pair a level against today's
  // Pivot/TC or TC/R1 boundary rather than the usual S-side L bands).
  ELTU2: boolean;
  // ELBU2 — prev's R4 lands inside today's R1/R2 band (U2), AND prev's S4
  // lands inside today's BC/Pivot band (the lower half of today's CPR).
  ELBU2: boolean;
  // ELTU3 — prev's R4 lands inside today's R2/R3 band (U3), AND prev's S4
  // lands inside today's TC/R1 band. Same TC-anchored support band as
  // ELTU2, paired with the wider U3 resistance band instead of U2.
  ELTU3: boolean;
  // ELPU2 — prev's R4 lands inside today's R1/R2 band (U2), AND prev's S4
  // lands inside today's Pivot/TC band (the upper half of today's CPR).
  // Same U2 resistance band as ELBU2/EL1U2/ELTU2, paired with the
  // upper-CPR-half support band instead of BC/Pivot.
  ELPU2: boolean;
  // ELPU3 — prev's R4 lands inside today's R2/R3 band (U3), AND prev's S4
  // lands inside today's Pivot/TC band (the upper half of today's CPR).
  // Same U3 resistance band as ELTU3/EL1U3/EL2U3, paired with the
  // upper-CPR-half support band instead of TC/R1.
  ELPU3: boolean;
  // ELBU3 — prev's R4 lands inside today's R2/R3 band (U3), AND prev's S4
  // lands inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U3 resistance band as ELTU3/ELPU3, paired with the
  // lower-CPR-half support band instead of TC/R1 or Pivot/TC.
  ELBU3: boolean;
  // EL1U4 — prev's R4 lands inside today's R3/R4 band (U4), AND prev's S4
  // lands inside today's BC/S1 band (L1). Bearish-continuation shape used
  // by the L1<pL4 sub-filter ss-EL1U4-U4:10PM.
  EL1U4: boolean;
  // ELBU4 — prev's R4 lands inside today's R3/R4 band (U4), AND prev's S4
  // lands inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U4 resistance band as EL1U4, paired with the lower-CPR-half
  // support band instead of BC/S1.
  ELBU4: boolean;
  // L3CP — today's R4 lands inside prev's Pivot/BC band (the lower half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same "today lands inside prev's band" shape as CL2UT/CL2U1, but the
  // resistance side is measured against prev's BC→Pivot gap (lower CPR
  // half) instead of TC→R1 (U1) or Pivot→TC (TC), and paired with the
  // wider L3 (S2→S3) support band instead of L2 (S1→S2).
  L3CP: boolean;
  // L2CP — same shape as L3CP (today's R4 lands inside prev's Pivot/BC
  // band), but paired with the narrower L2 (S1/S2) support band instead of
  // L3 (S2/S3).
  L2CP: boolean;
  // L3TC — today's R4 lands inside prev's Pivot/TC band (the upper half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same L3 support band as L3CP, but the resistance side is measured
  // against prev's Pivot→TC gap (upper CPR half) instead of BC→Pivot
  // (lower half).
  L3TC: boolean;
  // EL1L2 / EL2L1 — prev's R4 AND prev's S4 both land inside today's
  // S1/S2 band (an unusually collapsed range — prev's whole R4-to-S4 span
  // squeezed into one of today's support bands). Split into Hi/Lo variants
  // by whether today's PDL sits above (Hi) or below (Lo) prev's Pivot.
  EL1L2: boolean;
  EL2L1: boolean;
  // EUPL2 — prev's S4 lands inside today's S2/S1 band (L2), AND prev's R4
  // lands inside today's BC/Pivot band (the lower half of today's CPR).
  // Same L2 support band as EUBL2/EU1L2/EU2L2/EUTL2, paired with the
  // BC/Pivot resistance band instead of the usual U-side (R-anchored) bands.
  EUPL2: boolean;
  // EUTL4 — prev's S4 lands inside today's S4/S3 band (L4, same support
  // band as EU2L4/EU1L4), AND prev's R4 lands inside today's Pivot/TC
  // band (the upper half of today's CPR). Same TC-anchored resistance band
  // as EUTL2/EUTL3, paired with the widest L4 support band instead of
  // L2/L3.
  EUTL4: boolean;
  // L2U3 — today's R4 lands inside prev's R2/R3 band (U3, same
  // resistance band as L4U3/L3U3), AND prev's S4 lands inside today's
  // S2/S1 band (L2). Same L2 support band as L2U4, but paired with the
  // narrower U3 resistance band instead of U4.
  L2U3: boolean;
  // CU2L1 — today's S4 lands inside prev's S1/BC band (L1), AND today's R4
  // lands inside prev's R1/R2 band (U2). Same "today lands inside prev's
  // band" shape as CL2U1/CL2U2, but pairs the L1 support band with the
  // wider U2 resistance band instead of L2+U1 or L2+U2.
  CU2L1: boolean;
  // CU3L1 — today's S4 lands inside prev's S1/BC band (L1, same support
  // band as CU2L1/CU1L1), AND today's R4 lands inside prev's R2/R3 band
  // (U3, same resistance band as CU3L2/CU3L3/CL4U3). Pairs the
  // narrowest support band (L1) with the wider U3 resistance band.
  CU3L1: boolean;
  U2L3: boolean;
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
  r1DirVsPrev: -1 | 0 | 1;
  s1DirVsPrev: -1 | 0 | 1;
  CL4U3: boolean;
  CU3L2: boolean;
  CU3L3: boolean;
  EU4L4: boolean;
  EL4U4: boolean;
  /** QU4L4 — today's R4 equals prev's R4 AND today's S4 equals prev's S4 (within eqTol). */
  QU4L4: boolean;
  /** InsideCPR — today's CPR band sits strictly inside prev day's CPR band. */
  InsideCPR: boolean;
  U4L2: boolean;
  U3L2: boolean;
  U4L3: boolean;
  U4L4: boolean;
  U3L4: boolean;
  U2L4: boolean;
  U1L4: boolean;
  L4U4: boolean;
  EU3L4: boolean;
  EL2U4: boolean;
  EL3U4: boolean;
  CU4L2: boolean;
  equalCPR: boolean;
  EU3L3: boolean;
  EL3U3: boolean;
  CU4L4: boolean;
  CL4U4: boolean;
  EU2L3: boolean;
  CU4L3: boolean;
  CL3U3: boolean;
  L4U3: boolean;
  L3U3: boolean;
  L4U2: boolean;
  L3U2: boolean;
  L3U4: boolean;
  L2U4: boolean;
  CL3U2: boolean;
  L1U4: boolean;
  CL4U2: boolean;
  EU1L2: boolean;
  EU1L3: boolean;
  EU1L4: boolean;
  EUBL1: boolean;
  EUPL1: boolean;
  // EUTL1 — same L1 support band as EUBL1/EUPL1 (prev's S4 inside
  // today's S1/BC), AND prev's R4 lands inside today's Pivot/TC band —
  // one band higher than EUPL1's BC/Pivot band, same TC-anchored
  // resistance band as EUTL2/EUTL3.
  EUTL1: boolean;
  EUBL2: boolean;
  EUBL3: boolean;
  EUPL3: boolean;
  EUTL3: boolean;
  EU2L4: boolean;
  EU2L2: boolean;
  EUTL2: boolean;
  EU1L1: boolean;
  EL1U1: boolean;
  EL1U2: boolean;
  CL2UT: boolean;
  compressed: boolean;
  expanded: boolean;
  LevelsBelow: boolean;
  LevelsAbove: boolean;
  R1AbovePR4: boolean;
  S1BelowPS4: boolean;
  EL1U3: boolean;
  EL2U3: boolean;
  ELTU2: boolean;
  ELBU2: boolean;
  ELTU3: boolean;
  ELPU2: boolean;
  ELPU3: boolean;
  ELBU3: boolean;
  EL1U4: boolean;
  ELBU4: boolean;
  CL1U1: boolean;
  CL2U1: boolean;
  CU1L1: boolean;
  CL2U2: boolean;
  CU2L2: boolean;
  U3L3: boolean;
  CL3U1: boolean;
  L3CP: boolean;
  L2CP: boolean;
  L3TC: boolean;
  EL1L2: boolean;
  EL2L1: boolean;
  EUPL2: boolean;
  EUTL4: boolean;
  L2U3: boolean;
  CU2L1: boolean;
  CU3L1: boolean;
  U2L3: boolean;
  passes: boolean;
  currentPrice: number;
  openPrice: number;
  change24h: number;
  quoteVolume: number;
  prevR1Gap: number;
  prevS1Gap: number;
  r4Distance: number;
  s4Distance: number;
  // PDHPDLGapCategory — compares the gap between today's PDH and prev's
  // PDH (HHGap) against the gap between today's PDL and prev's PDL
  // (LLGap). "HHGap" when the PDH gap is larger, "LLGap" when the PDL gap
  // is larger, "HHLL=" when the two gaps are equal.
  PDHPDLGapCategory: PDHPDLGapCategory;
  // RRSSGapCategory — mirrors PDHPDLGapCategory, but over R1/S1 instead of
  // PDH/PDL: compares the gap between today's R1 and prev's R1 (RRGap)
  // against the gap between today's S1 and prev's S1 (SSGap). "RRGap" when
  // the R1 gap is larger, "SSGap" when the S1 gap is larger, "SSRR=" when
  // the two gaps are equal.
  RRSSGapCategory: RRSSGapCategory;
  // SSRRCategory — single-badge 6-way partition over today's R1/S1 vs
  // prev's R1/S1 (mirrors HHLLCategory's shape):
  //   RRSS-A (Above)      — today.r1 >  prev.r1 AND today.s1 >= prev.s1
  //   RRSS-B (Below)      — today.r1 <  prev.r1 AND today.s1 <= prev.s1,
  //                         OR today.r1 == prev.r1 AND today.s1 < prev.s1
  //   RRSS-C (Compressed) — today.r1 <= prev.r1 AND today.s1 >  prev.s1
  //   RRSS-E (Expanded)   — today.r1 >  prev.r1 AND today.s1 <  prev.s1
  //   RRSS-Q (Equal)      — today.r1 == prev.r1 AND today.s1 == prev.s1 (eqTol)
  // Note: r1 down + s1 flat lands in RRSS-B (not RRSS-C) — a narrowing R1
  // with an unmoved S1 reads as the range shifting down, not compressing.
  // "none" when none of the five conditions match. This field is the ONLY
  // source for that classification — the raw SSRRAbove/SSRRBelow booleans
  // have been removed from CPRResult.
  SSRRCategory: SSRRCategory;
  // HHLLCategory — 6-way mutually exclusive partition classifying today's
  // PDH/PDL (prevHigh/prevLow) move against prev's PDH/PDL:
  //   HHLL-A (Above)      — today.prevHigh >= prev.prevHigh AND today.prevLow >= prev.prevLow (excluding the both-equal case, which is HHLL=)
  //   HHLL-B (Below)      — today.prevHigh < prev.prevHigh AND today.prevLow < prev.prevLow
  //   HHLL-C (Compressed) — today.prevHigh < prev.prevHigh AND today.prevLow >= prev.prevLow
  //   HHLL-E (Expanded)   — today.prevHigh >= prev.prevHigh AND today.prevLow < prev.prevLow
  //   HHLL-Q (Equal)      — today.prevHigh == prev.prevHigh AND today.prevLow == prev.prevLow (eqTol)
  // Mutually exclusive AND exhaustive: comparisons use a tolerance-aware
  // direction (eqTol). CHANGED: the one-sided "PDH flat + PDL up" case
  // resolves to HHLL-A (a flat top with the bottom rising still counts as
  // the range moving up). CHANGED (Aug 2026): the one-sided "PDH flat +
  // PDL down" case now resolves to HHLL-E instead of HHLL-B (a flat top
  // with a falling bottom still counts as the range expanding). Only
  // "PDH down + PDL flat" remains a one-sided case that resolves to
  // HHLL-C. "none" is unreachable for finite inputs. HHLL-A/HHLL-B carry
  // conditions similar to the removed
  // HHLLAbove/HHLLBelow booleans used to hold; this field is now the only
  // source for that classification (see ScreenerUtils.renderHHLLCategoryBadge),
  // also covering the Compressed/Expanded/Equal cases those two booleans
  // never captured.
  HHLLCategory: HHLLCategory;
  // SSLLCategory — single-badge 6-way partition comparing the band formed
  // by today's [S1, PDL] (sorted low→high) against the band formed by
  // prev's [S1, PDL]. S1 and PDL don't have a fixed relative order, so the
  // band's top/bottom are computed via min/max rather than same-field
  // comparison:
  //   todayLo/todayHi = min/max(today.s1, today.prevLow)
  //   prevLo/prevHi   = min/max(prev.s1, prev.prevLow)
  //   SSLL-A (Above)      — todayHi >= prevHi AND todayLo >= prevLo (excluding the both-equal case, which is SSLL=)
  //   SSLL-B (Below)      — todayHi <= prevHi AND todayLo <  prevLo (band shifted down)
  //   SSLL-C (Compressed) — todayHi <  prevHi AND todayLo >= prevLo (band narrowed)
  //   SSLL-E (Expanded)   — todayHi >  prevHi AND todayLo <  prevLo (band widened)
  //   SSLL-Q (Equal)      — todayHi == prevHi AND todayLo == prevLo (eqTol)
  // CHANGED: the one-sided "todayHi flat, todayLo rose" case now resolves
  // to Above (AA/OA), not Compressed — mirroring "todayHi flat, todayLo
  // fell" already resolving to Below. A/B are additionally gated on S1
  // keeping the same top/bottom role on both days (S1 is the band's hi
  // level on both days, or its lo level on both days). If S1 was on top
  // yesterday but PDL is on top today (or vice versa), the "shift" claim
  // isn't comparing the same identities, so this resolves to SSLL-SB/
  // SSLL-LB instead of a misleading A/B. C/E don't need this gate since
  // band-width change stays meaningful under a role swap.
  // "none" is otherwise a defensive fallback for non-finite inputs only.
  SSLLCategory: SSLLCategory;
  // RRHHCategory — 7-way partition over the ceiling band formed by
  // [R1, PDH] for today and the previous day, mirroring SSLLCategory.
  // (mirrors SSLLCategory's construction, over r1/prevHigh instead of
  // s1/prevLow). Each side's ceiling level is picked dynamically from its
  // own HLSwitch state:
  //   Axis 1 (primary):   todayLevel1 = today.HLSwitch === "HL-A" ? today.r1 : today.prevHigh
  //                        prevLevel1  = prev.HLSwitch  === "HL-A" ? prev.prevHigh : prev.r1
  //   Axis 2 (mirrored):  todayLevel2 = today.HLSwitch === "HL-A" ? today.prevHigh : today.r1
  //                        prevLevel2  = prev.HLSwitch  === "HL-A" ? prev.r1 : prev.prevHigh
  //   RRHH-AA/RRHH-OA (Above) — todayLevel1 >  prevLevel1 AND todayLevel2 >= prevLevel2
  //   RRHH-BB/RRHH-OB (Below) — todayLevel1 <= prevLevel1 AND todayLevel2 <  prevLevel2
  //   RRHH-C         — everything else (Compressed, plus the
  //                    mathematically-near-impossible exact-Equal case)
  // Only 3 badges: unlike SSRR/HHLL/SSLL, "Expanded" is provably impossible
  // for this pairing (r1 and prevHigh always move together for a given
  // day's HLSwitch state, so axis2 can never fall below axis1).
  // "none" is a defensive fallback for non-finite inputs only.
  RRHHCategory: RRHHCategory;
  // hlGapWinner — cosmetic-only comparison of todayCPR.hlGap vs
  // prevCPR.hlGap (tolerance-aware via dirTol): "today" swaps the PDH/PDL
  // "HL-A"/"HL-B" badge to "HLGap-A"/"HLGap-B"; "prev" swaps "pHL-A"/
  // "pHL-B" to "pHLGap-A"/"pHLGap-B"; "none" leaves both badges plain
  // (gaps tied within tolerance). Deliberately NOT part of
  // classifyCPRPair/CPRPairFlags — that classifier is also reused for the
  // (prev, pp) comparison in ScreenerUtils.computePrevPattern, and this
  // gap-winner concept is scoped to today vs prev only (a relabel of the
  // existing badges, not a new filterable category).
  hlGapWinner: "today" | "prev" | "none";
}

export type PDHPDLGapCategory = "HHGap" | "LLGap" | "HHLL=";
export type RRSSGapCategory = "RRGap" | "SSGap" | "SSRR-Q";
export type HLSwitch = "HL-A" | "HL-B" | "HL=";
export type SSRRCategory = "RRSS-A" | "RRSS-B" | "RRSS-C" | "RRSS-E" | "RRSS-Q" | "none";
export type HHLLCategory = "HHLL-A" | "HHLL-B" | "HHLL-C" | "HHLL-E" | "HHLL-Q" | "none";
export type SSLLCategory = "SSLL-AA" | "SSLL-OA" | "SSLL-BB" | "SSLL-OB" | "SSLL-C" | "SSLL-E" | "SSLL-SB" | "SSLL-LB" | "SSLL-Q" | "none";
export type RRHHCategory = "RRHH-AA" | "RRHH-OA" | "RRHH-BB" | "RRHH-OB" | "RRHH-C" | "RRHH-E" | "RRHH-RA" | "RRHH-HA" | "RRHH-Q" | "none";

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
 * Single source of truth — used for both the "HL=" case of HLSwitch
 * (calcCPR) and equalCPR
 * (analyzeCPR) so "equal" means the same thing everywhere in this file.
 */
function eqTol(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.00001;
}

/**
 * dirTol — tolerance-aware direction of `today` relative to `prev`:
 * +1 when today is meaningfully higher, -1 when meaningfully lower, and 0
 * when the two levels are equal within eqTol. Used by all the two-axis
 * category classifiers so an exactly-flat axis is an explicit state rather
 * than a value that satisfies neither `<` nor `>`.
 */
export function dirTol(today: number, prev: number): -1 | 0 | 1 {
  if (eqTol(today, prev)) return 0;
  return today > prev ? 1 : -1;
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
  // Uses eqTol (not strict ===) for the "HL=" case since h and r1 reach
  // the "same" value through different arithmetic paths and can differ by
  // a float rounding hair even when they display identically. "HL-A" /
  // "HL-B" exclude the equal band so exactly one of the three states is
  // ever picked.
  const HLSwitch: HLSwitch =
    eqTol(h, r1) ? "HL=" :
    h > r1 ? "HL-A" :
    "HL-B";

  // hlGap — see CPRLevels.hlGap doc comment above.
  const hlGap = Math.abs(h - r1);

  return {
    pivot, bc, tc, width, widthPct,
    prevHigh: h, prevLow: l,
    r1, r2, r3, r4,
    s1, s2, s3, s4,
    HLSwitch,
    hlGap,
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

  const CL4U3 = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                 (today.r4 > prev.r2 && today.r4 < prev.r3);
  const CU3L2 = (today.s4 >= prev.s2 && today.s4 < prev.s1) &&
                   (today.r4 > prev.r2 && today.r4 < prev.r3);
  const CU3L3 = (today.s4 > prev.s3 && today.s4 < prev.s2) &&
                   (today.r4 > prev.r2 && today.r4 < prev.r3) && srCompressedHigher;
  const CL3U3   = (today.s4 >= prev.s3 && today.s4 < prev.s2) &&
                   (today.r4 > prev.r2 && today.r4 < prev.r3) && srCompressedLower;

  // QU4L4 — exact (within eqTol) day-over-day tie on BOTH outer levels:
  // today's R4 == prev's R4 and today's S4 == prev's S4.
  const QU4L4 = eqTol(today.r4, prev.r4) && eqTol(today.s4, prev.s4);

  // InsideCPR — today's CPR band is contained inside prev day's CPR band
  // (single source of truth; ScreenerUtils reuses r.InsideCPR).
  const InsideCPR =
    (today.tc <= prev.tc && today.bc > prev.bc) ||
    (today.tc < prev.tc && today.bc >= prev.bc);
  const U3L4   = (prev.r4 >= today.r2 && prev.r4 < today.r3) &&
                   (today.s4 > prev.s4 && today.s4 < prev.s3);
  // U2L4 — today's S4 lands inside prev's S3/S4 band (L4, same support
  // band as U3L4/U4L4), AND prev's R4 lands inside today's R1/R2 band
  // (U2, one tier narrower than U3L4's U3 band).
  const U2L4   = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                   (prev.r4 > today.r1 && prev.r4 < today.r2);
  const U4L2   = (today.s4 > prev.s2 && today.s4 < prev.s1) &&
                   (prev.r4 > today.r3 && prev.r4 < today.r4);
  // U3L2 — today's S4 lands inside prev's S1/S2 band (L2, same support
  // band as U4L2), AND prev's R4 lands inside today's R2/R3 band (U3,
  // one tier narrower than U4L2's U4 band).
  const U3L2   = (today.s4 >= prev.s2 && today.s4 < prev.s1) &&
                   (prev.r4 > today.r2 && prev.r4 < today.r3);
  const U4L3   = (today.s4 >= prev.s3 && today.s4 < prev.s2) &&
                   (prev.r4 > today.r3 && prev.r4 < today.r4);
  const U4L4   = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                   (today.s4 >= prev.s4 && today.s4 < prev.s3);
  // U1L4 — today's S4 sits inside prev's S4/S3 band (L4) while prev's R4
  // lands inside today's BC/R1 band (U1): a much shallower upside overlap
  // than U4L4/U3/U2.
  const U1L4   = (today.s4 >= prev.s4 && today.s4 < prev.s3) &&
                   (prev.r4 > today.bc && prev.r4 < today.r1);
  const L4U4   = (today.r4 < prev.r4 && today.r4 > prev.r3) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  // eXHiU1L3 removed — it was an exact duplicate of EU1L3 (same U1/L3
  // band conditions, just written in reverse order). All references now
  // point at EU1L3 (see below).
  const EU3L4 = (prev.s4 > today.s4 && prev.s4 < today.s3) &&
                   (prev.r4 > today.r2 && prev.r4 < today.r3);
  const EL2U4 = (prev.r4 < today.r4 && prev.r4 > today.r3) &&
                   (prev.s4 < today.s1 && prev.s4 > today.s2);
  const EL3U4  = (prev.r4 < today.r4 && prev.r4 > today.r3) &&
                   (prev.s4 < today.s2 && prev.s4 >= today.s3);
  const CU4L2 = (today.s4 < prev.s1 && today.s4 > prev.s2) &&
                   (today.r4 < prev.r4 && today.r4 > prev.r3);
  const CU4L4   = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                   (today.r4 > prev.r3 && today.r4 <= prev.r4) && (srCompressedHigher || srHigher);
  const CL4U4   = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                   (today.r4 > prev.r3 && today.r4 < prev.r4) && srCompressedLower;
  const EU2L3   = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                   (prev.r4 > today.r1 && prev.r4 < today.r2);
  const CU4L3   = (today.s4 >= prev.s3 && today.s4 < prev.s2) &&
                   (today.r4 > prev.r3 && today.r4 < prev.r4);
  
  const L4U3   = (today.r4 > prev.r2 && today.r4 <= prev.r3) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  const L3U3  = (today.r4 > prev.r2 && today.r4 < prev.r3) &&
                   (prev.s4 > today.s3 && prev.s4 < today.s2);
  const L4U2   = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  const L3U2   = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (prev.s4 > today.s3 && prev.s4 < today.s2);
  // L2U3 — today's R4 lands inside prev's R2/R3 band (U3, same resistance
  // band as L4U3/L3U3), AND prev's S4 lands inside today's S2/S1 band
  // (L2, same support band as L2U4) instead of the L4/L3 bands used by
  // L4U3/L3U3.
  const L2U3   = (today.r4 > prev.r2 && today.r4 <= prev.r3) &&
                   (prev.s4 > today.s2 && prev.s4 < today.s1);
  const L3U4  = (today.r4 > prev.r3 && today.r4 < prev.r4) &&
                   (prev.s4 >= today.s3 && prev.s4 < today.s2);
  const L2U4 = (today.r4 > prev.r3 && today.r4 < prev.r4) &&
                   (prev.s4 > today.s2 && prev.s4 < today.s1);
  const CL3U2 = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (today.s4 > prev.s3 && today.s4 < prev.s2);
  const L1U4 = (today.r4 > prev.r3 && today.r4 < prev.r4) &&
                    (prev.s4 > today.s1 && prev.s4 < today.bc);
  const CL4U2 = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (today.s4 > prev.s4 && today.s4 < prev.s3);

  const EU3L3 = (prev.r4 < today.r3 && prev.r4 > today.r2) &&
                 (prev.s4 > today.s3 && prev.s4 < today.s2) && srExpandedHigher;
  const EL3U3 = (prev.r4 < today.r3 && prev.r4 > today.r2) &&
                 (prev.s4 > today.s3 && prev.s4 < today.s2) && srExpandedLower;

   const EU4L4   = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3) && srExpandedHigher;
  const EL4U4   = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3) && srExpandedLower;

  const EU1L2 = (prev.s4 > today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);
  const EU1L3 = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);
  const EU1L4 = (prev.s4 > today.s4 && prev.s4 < today.s3) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);

  const EUBL1 = (prev.s4 > today.s1 && prev.s4 < today.bc) &&
                  (prev.r4 > today.s1 && prev.r4 < today.bc);
  // EUPL1 — prev's S4 lands inside today's S1/BC band (L1, same support
  // band as EUBL1), AND prev's R4 lands inside today's BC/Pivot band (the
  // lower half of today's CPR) instead of the wider S1/BC (CP) band EUBL1 uses.
  const EUPL1 = (prev.s4 >= today.s1 && prev.s4 < today.bc) &&
                  (prev.r4 > today.bc && prev.r4 < today.pivot);
  // EUTL1 — prev's S4 lands inside today's S1/BC band (L1, same support
  // band as EUBL1/EUPL1), AND prev's R4 lands inside today's Pivot/TC
  // band — one band higher than EUPL1's BC/Pivot band, same TC-anchored
  // resistance band as EUTL2/EUTL3.
  const EUTL1 = (prev.s4 > today.s1 && prev.s4 < today.bc) &&
                  (prev.r4 > today.pivot && prev.r4 < today.tc);
  const EUBL2 = (prev.s4 > today.s2 && prev.s4 < today.s1) &&
                  (prev.r4 > today.s1 && prev.r4 < today.bc);
  const EUBL3 = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                  (prev.r4 > today.s1 && prev.r4 < today.bc);
  // EUPL3 — prev's S4 lands inside today's S2/S3 band (L3, same support
  // band as EUBL3), AND prev's R4 lands inside today's BC/Pivot band (the
  // lower half of today's CPR) instead of the wider S1/BC (CP) band EUBL3 uses.
  const EUPL3 = (prev.s4 >= today.s3 && prev.s4 < today.s2) &&
                  (prev.r4 > today.bc && prev.r4 < today.pivot);

  const EU2L4 = (prev.s4 > today.s4 && prev.s4 < today.s3) &&
                 (prev.r4 > today.r1  && prev.r4 < today.r2);
  const EU2L2 = (prev.s4 >= today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.r1  && prev.r4 < today.r2);
  const EUTL2 = (prev.s4 > today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.pivot && prev.r4 < today.tc);
  const EUTL3 = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                 (prev.r4 > today.pivot && prev.r4 < today.tc);
  // EU1L1 / EL1U1 — same band shape (prev's S4 inside today's S1/BC (L1)
  // AND prev's R4 inside today's TC/R1 (U1)), split by which gap is larger:
  // if today's R1-to-prev's R4 gap is bigger, EL1U1 fires; if today's
  // S1-to-prev's S4 gap is bigger, EU1L1 fires.
  const eXL1U1Base = (prev.s4 > today.s1 && prev.s4 < today.bc) &&
                      (prev.r4 > today.tc  && prev.r4 < today.r1);
  const r1U1Gap = Math.abs(today.r1 - prev.r4);
  const s1U1Gap = Math.abs(today.s1 - prev.s4);
  const EU1L1 = eXL1U1Base && s1U1Gap > r1U1Gap;
  const EL1U1 = eXL1U1Base && r1U1Gap > s1U1Gap;

  // EL1U2 — prev's R4 sits inside today's R1/R2 band (U2) AND prev's S4
  // sits inside today's BC/S1 band (L1). Same L1 support band as EU1L1,
  // but the wider U2 resistance band instead of U1.
  const EL1U2 = (prev.r4 > today.r1 && prev.r4 < today.r2) &&
                 (prev.s4 > today.s1 && prev.s4 < today.bc);

  // EL1U3 — prev's R4 sits inside today's R2/R3 band (U3) AND prev's S4
  // sits inside today's BC/S1 band (L1). Same L1 support band as EL1U2,
  // but the wider U3 resistance band (R2→R3) instead of U2 (R1→R2).
  const EL1U3 = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.s1 && prev.s4 < today.bc);

  // EL2U3 — same U3 resistance band as EL1U3 (prev's R4 inside today's
  // R2/R3 band), but the support side is measured against prev's S3
  // (not S4) landing inside today's S1/S2 band (L2) instead of prev's
  // S4 landing inside today's BC/S1 band (L1).
  const EL2U3 = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.s2 && prev.s4 < today.s1);

  // ELTU2 — prev's R4 sits inside today's R1/R2 band (U2) AND prev's S4
  // sits inside today's TC/R1 band. Same U2 resistance band as EL1U2, but
  // the support-side condition is measured against today's TC→R1 gap
  // instead of the usual BC→S1 (L1) band — same "TC"-anchored naming
  // convention as EUTL2/EUTL3/CL2UT.
  const ELTU2 = (prev.r4 > today.r1 && prev.r4 < today.r2) &&
                 (prev.s4 > today.tc && prev.s4 < today.r1);

  // ELBU2 — prev's R4 sits inside today's R1/R2 band (U2) AND prev's S4
  // sits inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U2 resistance band as EL1U2/ELTU2, but the support-side
  // condition is measured against today's BC→Pivot gap instead of the
  // usual BC→S1 (L1) or TC→R1 (TC) bands.
  const ELBU2 = (prev.r4 > today.r1 && prev.r4 < today.r2) &&
                 (prev.s4 > today.bc && prev.s4 < today.pivot);

  // ELTU3 — prev's R4 sits inside today's R2/R3 band (U3) AND prev's S4
  // sits inside today's TC/R1 band. Same TC-anchored support band as
  // ELTU2, but paired with the wider U3 resistance band (R2→R3) instead
  // of U2 (R1→R2).
  const ELTU3 = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.tc && prev.s4 < today.r1);

  // ELPU2 — prev's R4 sits inside today's R1/R2 band (U2) AND prev's S4
  // sits inside today's Pivot/TC band (the upper half of today's CPR).
  // Same U2 resistance band as ELBU2, but the support-side condition is
  // measured against today's Pivot→TC gap instead of BC→Pivot.
  const ELPU2 = (prev.r4 > today.r1 && prev.r4 < today.r2) &&
                 (prev.s4 > today.pivot && prev.s4 < today.tc);

  // ELPU3 — prev's R4 sits inside today's R2/R3 band (U3) AND prev's S4
  // sits inside today's Pivot/TC band (the upper half of today's CPR).
  // Same U3 resistance band as ELTU3, but the support-side condition is
  // measured against today's Pivot→TC gap instead of TC→R1.
  const ELPU3 = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.pivot && prev.s4 < today.tc);

  // ELBU3 — prev's R4 sits inside today's R2/R3 band (U3) AND prev's S4
  // sits inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U3 resistance band as ELTU3/ELPU3, but the support-side
  // condition is measured against today's BC→Pivot gap instead of TC→R1
  // or Pivot→TC.
  const ELBU3 = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                 (prev.s4 > today.bc && prev.s4 < today.pivot);

  // EUPL2 — prev's S4 sits inside today's S2/S1 band (L2) AND prev's R4
  // sits inside today's BC/Pivot band (the lower half of today's CPR).
  // Same L2 support band as EUBL2, but the resistance-side condition is
  // measured against today's BC→Pivot gap instead of the usual S1→BC band.
  const EUPL2 = (prev.s4 >= today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.bc && prev.r4 <= today.pivot);

  // EUTL4 — prev's S4 sits inside today's S4/S3 band (L4, same support
  // band as EU2L4) AND prev's R4 sits inside today's Pivot/TC band (the
  // upper half of today's CPR). Same TC-anchored resistance band as
  // EUTL2/EUTL3, paired with the widest L4 support band instead of L2/L3.
  const EUTL4 = (prev.s4 >= today.s4 && prev.s4 < today.s3) &&
                 (prev.r4 > today.pivot && prev.r4 < today.tc);

  // EL1U4 — prev's R4 sits inside today's R3/R4 band (U4) AND prev's S4
  // sits inside today's BC/S1 band (L1). Mirror shape to EL1U2/EL1U3
  // but with the widest U-band (R3→R4) on the resistance side.
  const EL1U4 = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                 (prev.s4 > today.s1 && prev.s4 < today.bc);

  // ELBU4 — prev's R4 sits inside today's R3/R4 band (U4) AND prev's S4
  // sits inside today's BC/Pivot band (the lower half of today's CPR).
  // Same U4 resistance band as EL1U4, but the support-side condition is
  // measured against today's BC→Pivot gap instead of BC→S1 (L1).
  const ELBU4 = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                 (prev.s4 > today.bc && prev.s4 < today.pivot);

  // L3CP — today's R4 lands inside prev's Pivot/BC band (the lower half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same "today lands inside prev's band" shape as CL2UT, but the
  // resistance side is measured against prev's BC→Pivot gap instead of
  // Pivot→TC, and paired with the wider L3 band instead of L2.
  const L3CP = (today.r4 > prev.bc && today.r4 < prev.pivot) &&
                 (today.s4 > prev.s3 && today.s4 < prev.s2);

  // L2CP — same resistance-side condition as L3CP (today's R4 inside
  // prev's Pivot/BC band), but paired with the narrower L2 (S1/S2) support
  // band instead of L3 (S2/S3).
  const L2CP = (today.r4 > prev.bc && today.r4 < prev.pivot) &&
                 (today.s4 > prev.s2 && today.s4 < prev.s1);

  // L3TC — today's R4 lands inside prev's Pivot/TC band (the upper half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same L3 support band as L3CP, but the resistance side is measured
  // against prev's Pivot→TC gap instead of BC→Pivot.
  const L3TC = (today.r4 > prev.pivot && today.r4 < prev.tc) &&
                 (today.s4 > prev.s3 && today.s4 < prev.s2);

  // EL1L2 / EL2L1 — prev's R4 AND prev's S4 both land inside today's
  // S1/S2 band (an unusually collapsed range where prev's entire R4-to-S4
  // span squeezed into a single today support band). Split by whether
  // today's PDL (today.prevLow) sits above (Hi) or below (Lo) prev's Pivot.
  const eXHiLoL2L1Bands = (prev.r4 > today.s2 && prev.r4 < today.s1) &&
                          (prev.s4 > today.s2 && prev.s4 < today.s1);
  const EL1L2 = eXHiLoL2L1Bands && (today.prevLow > prev.pivot);
  const EL2L1 = eXHiLoL2L1Bands && (today.prevLow < prev.pivot);

  // CL2UT — today's R4 lands inside the previous day's Pivot/TC band,
  // AND today's S4 lands inside the previous day's S1/S2 band. Same
  // compressed-band shape as CL2U1 but the resistance side is measured
  // against prev's Pivot→TC gap instead of prev's TC→R1 gap.
  const CL2UT = (today.r4 > prev.pivot && today.r4 < prev.tc) &&
                 (today.s4 > prev.s2 && today.s4 < prev.s1);

  // Shared R1/S1 tolerance-aware direction (dirTol: -1 down, 0 flat, +1 up)
  // vs prev — feeds compressed/LevelsBelow/LevelsAbove below, and mirrors
  // the SSRRDirR1/SSRRDirS1 pairing used for SSRRCategory in analyzeCPR.
  const r1DirVsPrev = dirTol(today.r1, prev.r1);
  const s1DirVsPrev = dirTol(today.s1, prev.s1);

  // compressed — "COMPRESSED": RRSS-C only. Same tolerance-aware R1/S1
  // direction test used for SSRRCategory === "RRSS-C": today's R1 not up
  // vs prev's R1 AND today's S1 up vs prev's S1 (i.e. r1 down or flat,
  // s1 strictly up). Note: r1 down + s1 flat is NOT compressed — that
  // case belongs to LevelsBelow/RRSS-B below. Formerly a two-clause
  // CPR-band test named L1pU1Above; simplified.
  const compressed = r1DirVsPrev <= 0 && s1DirVsPrev > 0;

  // expanded — "EXPANDED": RRSS-E only. Same tolerance-aware R1/S1
  // direction test used for SSRRCategory === "RRSS-E": today's R1 up vs
  // prev's R1 AND today's S1 down vs prev's S1. Mirrors compressed above.
  const expanded = r1DirVsPrev > 0 && s1DirVsPrev < 0;

  // LevelsBelow — "LEVEL BELOW": RRSS-B only. Replaces the old two-clause
  // CPR-band condition (formerly named pCPR1Above) with the same
  // tolerance-aware R1/S1 direction test used for SSRRCategory ===
  // "RRSS-B": today's R1 down vs prev's R1 AND today's S1 not up vs
  // prev's S1 (covers r1 down + s1 flat too), OR today's R1 flat AND
  // today's S1 down vs prev's S1. Excludes S1BelowPS4 (see below) — a
  // symbol whose today's S1 has already dropped below prev's S4 belongs
  // exclusively to the "BELOW LEVEL4" (S1BelowPS4) section, not LEVELs
  // BELOW, so it's carved out here at the source rather than in each
  // caller (mirrors the R1AbovePR4/LevelsAbove carve-out below).
  const LevelsBelow = ((r1DirVsPrev < 0 && s1DirVsPrev <= 0) ||
                       (r1DirVsPrev === 0 && s1DirVsPrev < 0)) &&
                       !(today.s1 < prev.s4);

  // LevelsAbove — "LEVEL ABOVE": RRSS-A only. Replaces the old two-clause
  // CPR-band condition (formerly named CPRs1Above) with the same
  // tolerance-aware R1/S1 direction test used for SSRRCategory ===
  // "RRSS-A": today's R1 up vs prev's R1, AND today's S1 not down vs
  // prev's S1. Excludes R1AbovePR4 (see below) — a symbol whose today's
  // R1 has already cleared prev's R4 belongs exclusively to the "ABOVE
  // LEVEL4" (R1AbovePR4) section, not LEVEL ABOVE, so it's carved out
  // here at the source rather than in each caller.
  const R1AbovePR4 = today.r1 > prev.r4;
  const LevelsAbove = r1DirVsPrev > 0 && s1DirVsPrev >= 0 && !R1AbovePR4;
  // S1BelowPS4 — "BELOW LEVEL4" base condition, mirroring R1AbovePR4:
  // today's S1 below prev's S4 (plain magnitude comparison, no
  // tolerance). Also subtracted out of LevelsBelow above so the two
  // sections never share a symbol.
  const S1BelowPS4 = today.s1 < prev.s4;

  // CL1U1 / CU1L1 — split by which side (R1 vs S1) moved further.
  const r1Move = Math.abs(prev.r1 - today.r1);
  const s1Move = Math.abs(prev.s1 - today.s1);
  const cOU1L1Base = (today.s4 > prev.s1 && today.s4 < prev.tc) &&
                     (today.r4 > prev.bc && today.r4 < prev.r1);
  const CL1U1 = cOU1L1Base && r1Move > s1Move;
  const CU1L1 = cOU1L1Base && r1Move < s1Move;

  const CL2U1 = (today.s4 > prev.s2 && today.s4 < prev.s1) &&
                 (today.r4 < prev.r1 && today.r4 > prev.tc);

  // U3L3 — today's S4 lands inside prev's S3/S2 band (L3) AND prev's R4
  // lands inside today's R2/R3 band (U3).
  const U3L3 = (today.s4 > prev.s3 && today.s4 < prev.s2) &&
                 (prev.r4 > today.r2 && prev.r4 < today.r3);

  // U2L3 — today's S4 lands inside prev's S3/S2 band (L3, same support
  // band as U3L3), AND prev's R4 lands inside prev's OWN R1/R2 band (U2)
  // instead of today's R-levels.
  const U2L3 = (today.s4 >= prev.s3 && today.s4 < prev.s2) &&
                 (prev.r4 < today.r2 && prev.r4 > today.r1);

  // CL3U1 — today's R4 lands inside prev's TC/R1 band (U1) AND today's S4
  // lands inside prev's S3/S2 band (L3).
  const CL3U1 = (today.r4 > prev.tc && today.r4 < prev.r1) &&
                 (today.s4 > prev.s3 && today.s4 < prev.s2);

  // CL2U2 / CU2L2 — split by which side (R2 vs S2) moved further.
  const r2Move = Math.abs(prev.r2 - today.r4);
  const s2Move = Math.abs(prev.s2 - today.s4);
  const cOU2L2Base = (today.s4 >= prev.s2 && today.s4 < prev.s1) &&
                     (today.r4 > prev.r1 && today.r4 < prev.r2);
  const CL2U2 = cOU2L2Base && r2Move > s2Move;
  const CU2L2 = cOU2L2Base && r2Move < s2Move;

  // CU2L1 — today's S4 lands inside prev's S1/BC band (L1) AND today's R4
  // lands inside prev's R1/R2 band (U2). Same U2 resistance band as
  // CL2U2/CU2L2, but the support side uses prev's S1→BC gap (L1) instead
  // of S2→S1 (L2).
  const CU2L1 = (today.s4 >= prev.s1 && today.s4 < prev.bc) &&
                 (today.r4 > prev.r1 && today.r4 < prev.r2);

  // CU3L1 — today's S4 lands inside prev's S1/BC band (L1, same support
  // band as CU2L1) AND today's R4 lands inside prev's R2/R3 band (U3,
  // same resistance band as CU3L2/CU3L3).
  const CU3L1 = (today.s4 >= prev.s1 && today.s4 < prev.bc) &&
                 (today.r4 > prev.r2 && today.r4 < prev.r3);

  return {
    r4Distance, s4Distance,
    srHigher, srLower, srExpanded, srCompressed,
    srCompressedHigher, srCompressedLower, srExpandedHigher, srExpandedLower,
    r1DirVsPrev, s1DirVsPrev,
    CL4U3, CU3L2, CU3L3, EU4L4, EL4U4, QU4L4, InsideCPR, U3L4, U2L4, U4L2, U3L2, U4L3, U4L4, U1L4,
    L4U4, EU3L4, EL2U4, EL3U4, CU4L2, CU4L4, CL4U4, EU2L3,
    CU4L3, CL3U3, L4U3, L3U3, CL3U2, L4U2, L3U2, L3U4, L2U4,
    L1U4, CL2U1, CL4U2, EU3L3, EL3U3,
    CL1U1, CU1L1, CL2U2, CU2L2,
    U3L3, CL3U1,
    EU1L2, EU1L3, EU1L4, EUBL1, EUPL1, EUTL1, EUBL2, EUBL3, EUPL3,
    EUTL3, EU2L4, EU2L2, EUTL2, EU1L1, EL1U1, EL1U2, CL2UT, compressed, expanded, LevelsBelow, LevelsAbove, R1AbovePR4, S1BelowPS4,
    EL1U3, EL2U3, ELTU2, ELBU2, ELTU3, ELPU2, ELPU3, ELBU3, EL1U4, ELBU4, L3CP, L2CP, L3TC,
    EL1L2, EL2L1, EUPL2, EUTL4, L2U3, CU2L1, CU3L1, U2L3,
  };
}

/**
 * pickPattern — priority-ordered label lookup. This is the ONLY
 * place the label strings and their tie-break order live. The order below
 * must match the if-chain that historically lived in ScreenerUtils.
 */
export function pickPattern(f: CPRPairFlags): string | null {
  if (f.CL4U3)    return "CL4U3";
  if (f.CU3L2)  return "CU3L2";
  if (f.CU3L3)  return "CU3L3";
  if (f.QU4L4)    return "QU4L4";
  if (f.EU4L4)    return "EU4L4";
  if (f.EL4U4)    return "EL4U4";
  if (f.U3L4)   return "U3L4";
  if (f.U2L4)   return "U2L4";
  if (f.U1L4)   return "U1L4";
  if (f.U4L2)    return "U4L2";
  if (f.U3L2)    return "U3L2";
  if (f.U4L3)    return "U4L3";
  if (f.U4L4)    return "U4L4";
  if (f.L4U4)    return "L4U4";
  if (f.EU3L4)  return "EU3L4";
  if (f.EL2U4)  return "EL2U4";
  if (f.EL3U4)   return "EL3U4";
  if (f.CU4L2)  return "CU4L2";
  if (f.CU4L4)    return "CU4L4";
  if (f.CL4U4)    return "CL4U4";
  if (f.EU2L3)    return "EU2L3";
  if (f.CU4L3)    return "CU4L3";
  if (f.CL3U3)    return "CL3U3";
  if (f.L4U3)    return "L4U3";
  if (f.L3U3)   return "L3U3";
  // CL3U2 checked before other U2-band branches so its badge wins ties.
  if (f.CL3U2)  return "CL3U2";
  if (f.L4U2)    return "L4U2";
  if (f.L3U2)    return "L3U2";
  if (f.L3U4)   return "L3U4";
  if (f.L2U4)  return "L2U4";
  if (f.CU2L2)    return "CU2L2";
  if (f.L1U4) return "L1U4";
  if (f.CL2U1)    return "CL2U1";
  if (f.CL4U2)  return "CL4U2";
  if (f.EU3L3)    return "EU3L3";
  if (f.EL3U3)    return "EL3U3";
  if (f.CL1U1)    return "CL1U1";
  if (f.CU1L1)    return "CU1L1";
  if (f.CL2U2)    return "CL2U2";
  if (f.U3L3)    return "U3L3";
  if (f.CL3U1)    return "CL3U1";
  if (f.EU1L2)    return "EU1L2";
  if (f.EU1L3)    return "EU1L3";
  if (f.EU1L4)    return "EU1L4";
  if (f.EUBL1)   return "EUBL1";
  if (f.EUPL1)   return "EUPL1";
  if (f.EUTL1)   return "EUTL1";
  if (f.EUBL2)   return "EUBL2";
  if (f.EUBL3)   return "EUBL3";
  if (f.EUPL3)   return "EUPL3";
  if (f.EUTL3)    return "EUTL3";
  if (f.EU2L4)    return "EU2L4";
  if (f.EU2L2)    return "EU2L2";
  if (f.EUTL2)    return "EUTL2";
  if (f.EU1L1)    return "EU1L1";
  if (f.EL1U1)    return "EL1U1";
  if (f.EL1U2)    return "EL1U2";
  if (f.CL2UT)    return "CL2UT";
  if (f.EL1U3)    return "EL1U3";
  if (f.EL2U3)    return "EL2U3";
  if (f.ELTU2)    return "ELTU2";
  if (f.ELBU2)    return "ELBU2";
  if (f.ELTU3)    return "ELTU3";
  if (f.ELPU2)    return "ELPU2";
  if (f.ELPU3)    return "ELPU3";
  if (f.ELBU3)    return "ELBU3";
  if (f.EL1U4)    return "EL1U4";
  if (f.ELBU4)    return "ELBU4";
  if (f.L3CP)    return "L3CP";
  if (f.L2CP)    return "L2CP";
  if (f.L3TC)    return "L3TC";
  if (f.EL1L2)  return "EL1L2";
  if (f.EL2L1)  return "EL2L1";
  if (f.EUPL2)    return "EUPL2";
  if (f.EUTL4)    return "EUTL4";
  if (f.L2U3)    return "L2U3";
  if (f.CU2L1)    return "CU2L1";
  if (f.CU3L1)    return "CU3L1";
  if (f.U2L3)    return "U2L3";
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
 *  - `EU2L3` is a legacy lowercase-x spelling (not `eXL3U2`) but is still
 *    an Expanded-family flag; it's included here under its actual key.
 *    It does not start with "eXU" (case-sensitive), so it lands in
 *    "eXHigher".
 *  - `EL1L2` and `EL2L1` start with "eX", not "Hi"/"Lo" — the
 *    Hi/Lo in their names refers to the PDL-vs-prev-Pivot split described
 *    in cpr.ts, not the Higher/Lower category. Neither starts with "eXU",
 *    but both are categorized here as "eXLower" as a deliberate override
 *    of the name-prefix rule.
 *  - `CL2UT` doesn't start with "cOU" (it's a `cOTCL2`-derived name), but
 *    is categorized here as "cOLower" as a deliberate override of the
 *    name-prefix rule.
 *
 * Flags that don't carry a cO/eX/Hi/Lo prefix (srHigher/srLower/srExpanded/
 * srCompressed and their *Higher/*Lower variants, r4Distance, s4Distance,
 * L1pU1Above (now compressed), expanded, pCPR1Above (now LevelsBelow), LevelsAbove,
 * QU4L4) are intentionally excluded — they're aggregate/directional signals
 * or otherwise don't belong in a prefix-based category map.
 */
export const PATTERN_CATEGORY: Record<string, PatternCategory> = {
  // ---- Compressed: cOLower (name starts with "cOU") ----
  CL4U3: "cOLower",
  CL4U4: "cOLower",
  CL3U3: "cOLower",
  CL3U2: "cOLower",
  CL2U1: "cOLower",
  CL4U2: "cOLower",
  CL1U1: "cOLower",
  CL2U2: "cOLower",
  CL3U1: "cOLower",
  CL2UT: "cOLower",

  // ---- Compressed: cOHigher (remaining cO...) ----
  CU3L2: "cOHigher",
  CU3L3: "cOHigher",
  CU4L2: "cOHigher",
  CU4L4: "cOHigher",
  CU4L3: "cOHigher",
  CU1L1: "cOHigher",
  CU2L2: "cOHigher",
  CU2L1: "cOHigher",
  CU3L1: "cOHigher",

  // ---- Expanded: eXLower (name starts with "eXU") ----
  EL4U4: "eXLower",
  EL2U4: "eXLower",
  EL3U4: "eXLower",
  EL3U3: "eXLower",
  EL1U1: "eXLower",
  EL1U2: "eXLower",
  EL1U3: "eXLower",
  EL2U3: "eXLower",
  ELTU2: "eXLower",
  ELBU2: "eXLower",
  ELTU3: "eXLower",
  ELPU2: "eXLower",
  ELPU3: "eXLower",
  ELBU3: "eXLower",
  EL1U4: "eXLower",
  ELBU4: "eXLower",
  EL1L2: "eXLower", // name contains "Hi" but prefix is "eX" — see note above
  EL2L1: "eXLower", // name contains "Lo" but prefix is "eX" — see note above

  // ---- Expanded: eXHigher (remaining eX... / legacy EU2L3) ----
  EU4L4: "eXHigher",
  EU3L4: "eXHigher",
  EU2L3: "eXHigher", // legacy lowercase spelling — see note above
  EU3L3: "eXHigher",
  EU1L2: "eXHigher",
  EU1L3: "eXHigher",
  EU1L4: "eXHigher",
  EUBL1: "eXHigher",
  EUPL1: "eXHigher",
  EUTL1: "eXHigher",
  EUBL2: "eXHigher",
  EUBL3: "eXHigher",
  EUPL3: "eXHigher",
  EUTL3: "eXHigher",
  EU2L4: "eXHigher",
  EU2L2: "eXHigher",
  EUTL2: "eXHigher",
  EU1L1: "eXHigher",
  EUPL2: "eXHigher",
  EUTL4: "eXHigher",

  // ---- Higher (Hi...) ----
  U3L4: "Higher",
  U2L4: "Higher",
  U1L4: "Higher",
  U4L2: "Higher",
  U3L2: "Higher",
  U4L3: "Higher",
  U4L4: "Higher",
  U3L3: "Higher",
  U2L3: "Higher",

  // ---- Lower (Lo...) ----
  L4U4: "Lower",
  L4U3: "Lower",
  L3U3: "Lower",
  L4U2: "Lower",
  L3U2: "Lower",
  L3U4: "Lower",
  L2U4: "Lower",
  L1U4: "Lower",
  L3CP: "Lower",
  L2CP: "Lower",
  L3TC: "Lower",
  L2U3: "Lower",
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


  // PDHPDLGapCategory — HHGap = |today's PDH - prev's PDH|, LLGap =
  // |today's PDL - prev's PDL|. Whichever gap is larger wins; equal gaps
  // fall back to "HHLL=".
  const HHGapVal = Math.abs(todayCPR.prevHigh - prevCPR.prevHigh);
  const LLGapVal = Math.abs(todayCPR.prevLow - prevCPR.prevLow);
  const PDHPDLGapCategory: PDHPDLGapCategory =
    HHGapVal > LLGapVal ? "HHGap" :
    LLGapVal > HHGapVal ? "LLGap" :
    "HHLL=";

  // RRSSGapCategory — mirrors PDHPDLGapCategory over R1/S1: RRGap =
  // |today's R1 - prev's R1|, SSGap = |today's S1 - prev's S1|. Whichever
  // gap is larger wins; equal gaps fall back to "SSRR-Q".
  const RRGapVal = Math.abs(todayCPR.r1 - prevCPR.r1);
  const SSGapVal = Math.abs(todayCPR.s1 - prevCPR.s1);
  const RRSSGapCategory: RRSSGapCategory =
    RRGapVal > SSGapVal ? "RRGap" :
    SSGapVal > RRGapVal ? "SSGap" :
    "SSRR-Q";

  // SSRRCategory / HHLLCategory / SSLLCategory / RRHHCategory
  //
  // All four partitions are built from the same tolerance-aware axis
  // direction helper (dirTol: -1 down, 0 flat within eqTol, +1 up), so a
  // level that is *exactly* flat no longer slips between two strict
  // comparisons and falls through to "none".
  //
  // Generic rules (per pair of axes, axis1 = ceiling/primary, axis2 = floor/mirror):
  //   Above      — axis1 up   AND axis2 not down            (flat axis1 + axis2 up also counts)
  //   Below      — axis1 not up AND axis2 down              (axis1 down + flat axis2 also counts)
  //   Compressed — axis1 down AND axis2 up, plus the one-sided
  //                narrowing cases (axis1 down + axis2 flat,
  //                axis1 flat + axis2 up) for the HH/LL-style pairs
  //   Expanded   — axis1 up   AND axis2 down
  //   Equal      — both axes flat
  // R1/S1 direction already computed once in classifyCPRPair (see
  // flags.r1DirVsPrev / flags.s1DirVsPrev — also backs compressed/
  // LevelsBelow/LevelsAbove above), reused here instead of recomputing.
  const SSRRDirR1 = flags.r1DirVsPrev;
  const SSRRDirS1 = flags.s1DirVsPrev;
  const SSRRCategory: SSRRCategory =
    (SSRRDirR1 === 0 && SSRRDirS1 === 0) ? "RRSS-Q" :
    (SSRRDirR1 > 0 && SSRRDirS1 >= 0) ? "RRSS-A" :
    (SSRRDirR1 > 0 && SSRRDirS1 < 0) ? "RRSS-E" :
    (SSRRDirR1 <= 0 && SSRRDirS1 > 0) ? "RRSS-C" :
    (SSRRDirR1 < 0 && SSRRDirS1 <= 0) ? "RRSS-B" :
    (SSRRDirR1 === 0 && SSRRDirS1 < 0) ? "RRSS-B" :
    "none";

  // HHLLCategory — today's PDH/PDL vs prev's PDH/PDL. Exhaustive: "Above"
  // absorbs "PDH flat + PDL up", and "Expanded" now also absorbs "PDH flat
  // + PDL down" (flat top with a falling bottom still counts as the range
  // expanding), leaving only "PDH down + PDL flat" as the one-sided gap
  // that resolves to HHLL-C, and "PDH down + PDL down" as HHLL-B.
  const HHDir = dirTol(todayCPR.prevHigh, prevCPR.prevHigh);
  const LLDir = dirTol(todayCPR.prevLow, prevCPR.prevLow);
  const HHLLCategory: HHLLCategory =
    (HHDir === 0 && LLDir === 0) ? "HHLL-Q" :
    (HHDir >= 0 && LLDir >= 0) ? "HHLL-A" :
    (HHDir >= 0 && LLDir < 0) ? "HHLL-E" :
    (HHDir < 0 && LLDir < 0) ? "HHLL-B" :
    (HHDir < 0 && LLDir >= 0) ? "HHLL-C" :
    "none";

  // SSLLCategory — S1 and PDL don't have a fixed top/bottom relationship
  // like R1/S1 do (S1 can sit above or below PDL on any given day), so
  // same-field comparison (today.s1 vs prev.s1) alone breaks once the two
  // levels swap relative order day-to-day. Instead, compare the band each
  // day forms: today's [lo,hi] band from min/max(s1, prevLow) vs prev's
  // [lo,hi] band. If the band's top rose and its bottom rose too, that's
  // "Above"; both fell is "Below"; top rose while bottom fell is
  // "Expanded" (band widened); top fell while bottom rose is "Compressed"
  // (band narrowed). This still mirrors HHLLCategory's A/B/C/X shape, just
  // over the sorted band edges instead of the raw named fields.
  //
  // "Above"/"Below" are additionally gated on the two RAW same-field
  // trends agreeing with that verdict: today.s1 vs prev.s1 and
  // today.prevLow vs prev.prevLow must both be non-decreasing (for Above)
  // or both non-increasing (for Below). A swap in which level sits on top
  // (S1 above PDL one day, below it the next) does NOT by itself break
  // this — e.g. today.s1/today.prevLow both sitting above prev.s1/
  // prev.prevLow entirely is still an unambiguous "Above" even though S1's
  // relative position flipped. What actually makes the verdict unsafe is
  // the two individual fields disagreeing in direction (one rose, the
  // other fell) — that case resolves to "SSLL-SB"/"SSLL-LB" instead of a
  // false-confidence A/B. Expanded/Compressed don't need this gate since
  // they only describe how the band's width changed and stay meaningful
  // regardless of role swaps or same-field disagreement.
  const todaySSLLLo = Math.min(todayCPR.s1, todayCPR.prevLow);
  const todaySSLLHi = Math.max(todayCPR.s1, todayCPR.prevLow);
  const prevSSLLLo = Math.min(prevCPR.s1, prevCPR.prevLow);
  const prevSSLLHi = Math.max(prevCPR.s1, prevCPR.prevLow);

  // SSLLAbove/SSLLBelow — internal-only helpers feeding the AA/OA/BB/OB
  // split below. Not exposed on CPRResult: consumers should check
  // r.SSLLCategory === "SSLL-AA" / "SSLL-BB" instead (single source of
  // truth, tolerance-aware via dirTol, so it stays consistent with every
  // other SSLLCategory-based check). Reuses prevSSLLHi/prevSSLLLo (just
  // computed above) rather than recomputing Math.max/min a second time.
  //
  // Both use STRICT inequality on purpose: a boundary touch (today's s1 or
  // prevLow landing exactly on prevSSLLHi/prevSSLLLo) does NOT count as
  // "full separation" — today's band and prev's band would still share
  // that one price level, so it resolves to the overlapping variant
  // (SSLL-OA/SSLL-OB), not the clean AA/BB one. Switching either to >=/<=
  // would fold that touch case into AA/BB instead.
  //
  // FIXED: "strict" is enforced via dirTol, not raw >/<. today.s1 and
  // prev.s1 (or today.prevLow and prev.prevLow) are independently computed
  // floats from two different days' OHLC that can land on the same real
  // price — raw floating-point arithmetic on different inputs converging
  // to the "same" number is essentially never bit-for-bit equal, so a
  // sub-cent noise difference was enough to satisfy raw `<`/`>` and
  // silently promote a true boundary touch (e.g. today.s1 == prev.s1 to
  // every decimal that matters) from the overlapping variant into AA/BB.
  // dirTol's eqTol tolerance treats that noise as equal (returns 0),
  // keeping boundary touches in the overlapping bucket as intended.
  const SSLLAbove = dirTol(todayCPR.s1, prevSSLLHi) > 0 && dirTol(todayCPR.prevLow, prevSSLLHi) > 0;
  const SSLLBelow = dirTol(todayCPR.s1, prevSSLLLo) < 0 && dirTol(todayCPR.prevLow, prevSSLLLo) < 0;
  const SSLLDirHi = dirTol(todaySSLLHi, prevSSLLHi);
  const SSLLDirLo = dirTol(todaySSLLLo, prevSSLLLo);
  const SSLLDirS1 = dirTol(todayCPR.s1, prevCPR.s1);
  const SSLLDirPL = dirTol(todayCPR.prevLow, prevCPR.prevLow);
  const SSLLSameFieldAgreesUp = SSLLDirS1 >= 0 && SSLLDirPL >= 0;
  const SSLLSameFieldAgreesDown = SSLLDirS1 <= 0 && SSLLDirPL <= 0;
  // Which field (S1 vs PDL) actually drove the divergence decides SB vs LB —
  // not merely which shape (A vs B) the band matched, since either shape
  // can be produced by either field swapping to the top/bottom role. That
  // gate is checked first, inline, for each shape; once it passes, the
  // shape is further split into a "full separation" vs "overlapping" badge
  // using SSLLAbove/SSLLBelow (single source of truth — see those flags
  // above): the "A" shape -> SSLL-AA (SSLLAbove) or SSLL-OA (overlapping);
  // the "B" shape -> SSLL-BB (SSLLBelow) or SSLL-OB (overlapping).
  //
  // CHANGED: the "A" shape's Hi test is now >=0 (was >0), so a flat top
  // with a rising bottom (SSLLDirHi===0, SSLLDirLo>0) now qualifies for
  // Above instead of falling through to Compressed — mirroring the "B"
  // shape, whose Hi test was already <=0 (inclusive) rather than <0. The
  // SB/LB disagreement gate above it is broadened the same way, so a
  // newly-included flat-top+rising-bottom row still correctly falls to
  // SB/LB (not a false-confidence OA) when S1 and PDL's raw trends
  // disagree — same principle as every other SB/LB row. The old standalone
  // "SSLLDirHi === 0 && SSLLDirLo > 0 -> SSLL-C" branch is now dead (the
  // broadened Above branch above it catches it first) and has been removed.
  const SSLLCategory: SSLLCategory =
    (SSLLDirHi === 0 && SSLLDirLo === 0) ? "SSLL-Q" :
    (SSLLDirHi >= 0 && SSLLDirLo >= 0 && !SSLLSameFieldAgreesUp) ? (SSLLDirS1 >= SSLLDirPL ? "SSLL-LB" : "SSLL-SB") :
    (SSLLDirHi >= 0 && SSLLDirLo >= 0) ? (SSLLAbove ? "SSLL-AA" : "SSLL-OA") :
    (SSLLDirHi > 0 && SSLLDirLo < 0) ? "SSLL-E" :
    (SSLLDirHi <= 0 && SSLLDirLo < 0 && !SSLLSameFieldAgreesDown) ? (SSLLDirS1 >= SSLLDirPL ? "SSLL-LB" : "SSLL-SB") :
    (SSLLDirHi <= 0 && SSLLDirLo < 0) ? (SSLLBelow ? "SSLL-BB" : "SSLL-OB") :
    (SSLLDirHi < 0 && SSLLDirLo >= 0) ? "SSLL-C" :
    "none";

  // RRHHCategory — mirror SSLLCategory over the resistance-side ceiling band
  // [R1, PDH], where PDH is stored as prevHigh in each CPRLevels object.
  // Sorting is required because R1 and PDH can swap their relative order.
  const todayRRHHLo = Math.min(todayCPR.r1, todayCPR.prevHigh);
  const todayRRHHHi = Math.max(todayCPR.r1, todayCPR.prevHigh);
  const prevRRHHLo = Math.min(prevCPR.r1, prevCPR.prevHigh);
  const prevRRHHHi = Math.max(prevCPR.r1, prevCPR.prevHigh);
  const RRHHValid =
    isFinite(todayRRHHLo) && isFinite(todayRRHHHi) &&
    isFinite(prevRRHHLo) && isFinite(prevRRHHHi);

  const RRHHDirHi = dirTol(todayRRHHHi, prevRRHHHi);
  const RRHHDirLo = dirTol(todayRRHHLo, prevRRHHLo);
  const RRHHDirR1 = dirTol(todayCPR.r1, prevCPR.r1);
  const RRHHDirPDH = dirTol(todayCPR.prevHigh, prevCPR.prevHigh);
  const RRHHSameFieldAgreesUp = RRHHDirR1 >= 0 && RRHHDirPDH >= 0;
  const RRHHSameFieldAgreesDown = RRHHDirR1 <= 0 && RRHHDirPDH <= 0;

  // RRHHAbove/RRHHBelow — internal-only helpers feeding the AA/OA/BB/OB
  // split below. Not exposed on CPRResult: consumers should check
  // r.RRHHCategory === "RRHH-AA" / "RRHH-BB" instead (single source of
  // truth, tolerance-aware via dirTol). Reuses prevRRHHHi/prevRRHHLo
  // (already computed above) rather than recomputing Math.max/min again.
  //
  // Both use STRICT inequality on purpose, mirroring SSLLAbove/SSLLBelow:
  // a boundary touch (today's r1 or prevHigh landing exactly on
  // prevRRHHHi/prevRRHHLo) does NOT count as "full separation" — it
  // resolves to the overlapping variant (RRHH-OA/RRHH-OB), not the clean
  // AA/BB one.
  //
  // FIXED: same floating-point bug as SSLLAbove/SSLLBelow — "strict" is
  // now enforced via dirTol, not raw >/<, so a boundary touch between two
  // independently-computed floats (today.r1/prev.r1 or
  // today.prevHigh/prev.prevHigh) stays in the overlapping bucket instead
  // of getting silently promoted to AA/BB by floating-point noise. See
  // the SSLLAbove/SSLLBelow comment above for the full explanation.
  const RRHHAbove = dirTol(todayCPR.r1, prevRRHHHi) > 0 && dirTol(todayCPR.prevHigh, prevRRHHHi) > 0;
  const RRHHBelow = dirTol(todayCPR.r1, prevRRHHLo) < 0 && dirTol(todayCPR.prevHigh, prevRRHHLo) < 0;

  // Which field (R1 vs PDH) actually drove the divergence decides RA vs HA —
  // not merely which shape (A vs B) the band matched, since either shape
  // can be produced by either field swapping to the top/bottom role. That
  // gate is checked first, inline, for each shape; once it passes, the
  // shape is further split into a "full separation" vs "overlapping" badge
  // using RRHHAbove/RRHHBelow (single source of truth — see those flags
  // above): the "A" shape -> RRHH-AA (RRHHAbove) or RRHH-OA (overlapping);
  // the "B" shape -> RRHH-BB (RRHHBelow) or RRHH-OB (overlapping).
  //
  // CHANGED: same broadening as SSLLCategory — the "A" shape's Hi test is
  // now >=0 (was >0), so a flat top with a rising bottom now qualifies for
  // Above instead of Compressed, mirroring the "B" shape's already-
  // inclusive <=0 Hi test. The RA/HA disagreement gate is broadened the
  // same way for the same reason. The old standalone "RRHHDirHi === 0 &&
  // RRHHDirLo > 0 -> RRHH-C" branch is now dead and has been removed.
  const RRHHCategory: RRHHCategory =
    !RRHHValid ? "none" :
    (RRHHDirHi === 0 && RRHHDirLo === 0) ? "RRHH-Q" :
    (RRHHDirHi >= 0 && RRHHDirLo >= 0 && !RRHHSameFieldAgreesUp) ? (RRHHDirR1 >= RRHHDirPDH ? "RRHH-RA" : "RRHH-HA") :
    (RRHHDirHi >= 0 && RRHHDirLo >= 0) ? (RRHHAbove ? "RRHH-AA" : "RRHH-OA") :
    (RRHHDirHi > 0 && RRHHDirLo < 0) ? "RRHH-E" :
    (RRHHDirHi <= 0 && RRHHDirLo < 0 && !RRHHSameFieldAgreesDown) ? (RRHHDirR1 >= RRHHDirPDH ? "RRHH-RA" : "RRHH-HA") :
    (RRHHDirHi <= 0 && RRHHDirLo < 0) ? (RRHHBelow ? "RRHH-BB" : "RRHH-OB") :
    (RRHHDirHi < 0 && RRHHDirLo >= 0) ? "RRHH-C" :
    "none";

  // hlGapWinner — see CPRResult.hlGapWinner doc comment above.
  const hlGapDir = dirTol(todayCPR.hlGap, prevCPR.hlGap);
  const hlGapWinner: CPRResult["hlGapWinner"] =
    hlGapDir === 1 ? "today" :
    hlGapDir === -1 ? "prev" :
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
    PDHPDLGapCategory,
    RRSSGapCategory,
    SSRRCategory,
    HHLLCategory,
    SSLLCategory,
    RRHHCategory,
    hlGapWinner,
  };
}