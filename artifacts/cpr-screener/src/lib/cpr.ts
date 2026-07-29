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
 * ScreenerUtils.computePivotSubLabel (prev vs pp) so there is a single
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

  // Band-classification flags (order below matches pickCPRSubLabel priority)
  cOU3L4: boolean;
  cOHiL2U3: boolean;
  cOHiL3U3: boolean;
  eXLoL3U4: boolean;
  eXL4U4: boolean;
  HiL4U34: boolean;
  HiL2U4: boolean;
  HiL3U4: boolean;
  HiL4U4: boolean;
  LoU4L4: boolean;
  eXHiU1L3: boolean;
  eXHiL4U3: boolean;
  eXU4L234: boolean;
  eXU4L34: boolean;
  cOHiL2U4: boolean;
  cOL4U4: boolean;
  cOU4L4: boolean;
  exL3U2: boolean;
  cOL3U4: boolean;
  cOU3L3: boolean;
  LoU3L4: boolean;
  LoU3L34: boolean;
  cOLoU2L3: boolean;
  LoU2L4: boolean;
  LoU2L3: boolean;
  LoU4L34: boolean;
  LoU4L234: boolean;
  cOHiL2U2: boolean;
  LoU4L1234: boolean;
  cOU1L2: boolean;
  cOLoU2L4: boolean;
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
  eXL1CPR: boolean;
  eXL2CPR: boolean;
  eXL3CPR: boolean;
  eXL3TC: boolean;
  eXL4U2: boolean;
  eXL2U2: boolean;
  eXL2TC: boolean;
  eXL1U1: boolean;
  // eXU2L1 — prev's R4 lands inside today's R1/R2 band (U2), AND prev's S4
  // lands inside today's BC/S1 band (L1). Same "L1" support band as
  // eXL1U1/eXL1CPR but paired with the wider U2 (R1→R2) resistance band
  // instead of U1 (TC→R1).
  eXU2L1: boolean;
  cOTCL2: boolean;
  L1pU1Above: boolean;
  // eXU3L1 — prev's R4 lands inside today's R2/R3 band (U3), AND prev's S4
  // lands inside today's BC/S1 band (L1). Same L1 support band as eXU2L1/
  // eXL1U1/eXL1CPR but paired with the wider U3 (R2→R3) resistance band.
  eXU3L1: boolean;
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
  // eXU4L1 — prev's R4 lands inside today's R3/R4 band (U4), AND prev's S4
  // lands inside today's BC/S1 band (L1). Bearish-continuation shape used
  // by the L1<pL4 sub-filter ss-eXU4L1-U4:10PM.
  eXU4L1: boolean;
  // LoCPL3 — today's R4 lands inside prev's Pivot/BC band (the lower half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same "today lands inside prev's band" shape as cOTCL2/cOU1L2, but the
  // resistance side is measured against prev's BC→Pivot gap (lower CPR
  // half) instead of TC→R1 (U1) or Pivot→TC (TC), and paired with the
  // wider L3 (S2→S3) support band instead of L2 (S1→S2).
  LoCPL3: boolean;
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
  cOHiL2U3: boolean;
  cOHiL3U3: boolean;
  eXLoL3U4: boolean;
  eXL4U4: boolean;
  HiL2U4: boolean;
  HiL3U4: boolean;
  HiL4U4: boolean;
  HiL4U34: boolean;
  LoU4L4: boolean;
  eXHiU1L3: boolean;
  eXHiL4U3: boolean;
  eXU4L234: boolean;
  eXU4L34: boolean;
  cOHiL2U4: boolean;
  equalCPR: boolean;
  eXL3U3: boolean;
  eXU3L3: boolean;
  cOL4U4: boolean;
  cOU4L4: boolean;
  exL3U2: boolean;
  cOL3U4: boolean;
  cOU3L3: boolean;
  LoU3L4: boolean;
  LoU3L34: boolean;
  LoU2L4: boolean;
  LoU2L3: boolean;
  LoU4L34: boolean;
  LoU4L234: boolean;
  cOHiL2U2: boolean;
  cOLoU2L3: boolean;
  LoU4L1234: boolean;
  cOLoU2L4: boolean;
  eXL2U1: boolean;
  eXL3U1: boolean;
  eXL4U1: boolean;
  eXL1CPR: boolean;
  eXL2CPR: boolean;
  eXL3CPR: boolean;
  eXL3TC: boolean;
  eXL4U2: boolean;
  eXL2U2: boolean;
  eXL2TC: boolean;
  eXL1U1: boolean;
  eXU2L1: boolean;
  cOTCL2: boolean;
  L1pU1Above: boolean;
  eXU3L1: boolean;
  eXU2TC: boolean;
  eXU2BC: boolean;
  eXU3TC: boolean;
  eXU2CP: boolean;
  eXU4L1: boolean;
  cOU1L1: boolean;
  cOU1L2: boolean;
  cOL1U1: boolean;
  cOU2L2: boolean;
  cOL2U2: boolean;
  HiL3U3: boolean;
  cOU1L3: boolean;
  LoCPL3: boolean;
  passes: boolean;
  currentPrice: number;
  openPrice: number;
  change24h: number;
  quoteVolume: number;
  prevR1Gap: number;
  prevS1Gap: number;
  r4Distance: number;
  s4Distance: number;
}

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
 * (todayCPR, prevCPR); ScreenerUtils.computePivotSubLabel uses it for
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

  const srHigher     = today.r4 > prev.r4 && today.s4 > prev.s4;
  const srLower      = today.r4 < prev.r4 && today.s4 < prev.s4;
  const srExpanded   = today.r4 > prev.r4 && today.s4 < prev.s4;
  const srCompressed = today.r4 < prev.r4 && today.s4 > prev.s4;

  const srCompressedHigher = srCompressed && (s4Distance > r4Distance || (s4Distance === r4Distance && s3S4Gap > r3R4Gap));
  const srCompressedLower  = srCompressed && (r4Distance > s4Distance || (r4Distance === s4Distance && r3R4Gap > s3S4Gap));
  const srExpandedHigher   = srExpanded   && (r4Distance > s4Distance || (r4Distance === s4Distance && r3R4Gap > s3S4Gap));
  const srExpandedLower    = srExpanded   && (s4Distance > r4Distance || (s4Distance === r4Distance && s3S4Gap > r3R4Gap));

  const cOU3L4 = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                 (today.r4 > prev.r2 && today.r4 < prev.r3);
  const cOHiL2U3 = (today.s4 > prev.s2 && today.s4 < prev.s1) &&
                   (today.r4 > prev.r2 && today.r4 < prev.r3);
  const cOHiL3U3 = (today.s4 > prev.s3 && today.s4 < prev.s2) &&
                   (today.r4 > prev.r2 && today.r4 < prev.r3) && srCompressedHigher;
  const eXLoL3U4 = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                   (prev.s4 > today.s3 && prev.s4 < today.s2);
  const eXL4U4   = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  const HiL4U34  = (prev.r4 > today.r2 && prev.r4 < today.r3) &&
                   (today.s4 > prev.s4 && today.s4 < prev.s3);
  const HiL2U4   = (today.s4 > prev.s2 && today.s4 < prev.s1) &&
                   (prev.r4 > today.r3 && prev.r4 < today.r4);
  const HiL3U4   = (today.s4 > prev.s3 && today.s4 < prev.s2) &&
                   (prev.r4 > today.r3 && prev.r4 < today.r4);
  const HiL4U4   = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                   (today.s4 > prev.s4 && today.s4 < prev.s3);
  const LoU4L4   = (today.r4 < prev.r4 && today.r4 > prev.r3) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  const eXHiU1L3 = (prev.r4 < today.r1 && prev.r4 > today.tc) &&
                   (prev.s4 > today.s3 && prev.s4 < today.s2);
  const eXHiL4U3 = (prev.s4 > today.s4 && prev.s4 < today.s3) &&
                   (prev.r4 > today.r2 && prev.r4 < today.r3);
  const eXU4L234 = (prev.r4 < today.r4 && prev.r4 > today.r3) &&
                   (prev.s4 < today.s1 && prev.s4 > today.s2);
  const eXU4L34  = (prev.r4 < today.r4 && prev.r4 > today.r3) &&
                   (prev.s4 < today.s2 && prev.s4 >= today.s3);
  const cOHiL2U4 = (today.s4 < prev.s1 && today.s4 > prev.s2) &&
                   (prev.r3 > today.r3 && prev.r3 < today.r4);
  const cOL4U4   = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                   (today.r4 > prev.r3 && today.r4 < prev.r4) && srCompressedHigher;
  const cOU4L4   = (today.s4 > prev.s4 && today.s4 < prev.s3) &&
                   (today.r4 > prev.r3 && today.r4 < prev.r4) && srCompressedLower;
  const exL3U2   = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                   (prev.r4 > today.r1 && prev.r4 < today.r2);
  const cOL3U4   = (today.s4 > prev.s3 && today.s4 < prev.s2) &&
                   (today.r4 > prev.r3 && today.r4 < prev.r4);
  const cOU3L3   = (today.s4 > prev.s3 && today.s4 < prev.s2) &&
                   (today.r4 > prev.r2 && today.r4 < prev.r3);
  const LoU3L4   = (today.r4 > prev.r2 && today.r4 <= prev.r3) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  const LoU3L34  = (today.r4 > prev.r2 && today.r4 < prev.r3) &&
                   (prev.s4 > today.s3 && prev.s4 < today.s2);
  const LoU2L4   = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (prev.s4 > today.s4 && prev.s4 < today.s3);
  const LoU2L3   = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (prev.s4 > today.s3 && prev.s4 < today.s2);
  const LoU4L34  = (today.r4 > prev.r3 && today.r4 < prev.r4) &&
                   (prev.s4 >= today.s3 && prev.s4 < today.s2);
  const LoU4L234 = (today.r4 > prev.r3 && today.r4 < prev.r4) &&
                   (prev.s4 > today.s2 && prev.s4 < today.s1);
  const cOHiL2U2 = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (today.r3 > prev.r1) &&
                   (today.s4 > prev.s2 && today.s4 < prev.s1);
  const cOLoU2L3 = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (today.s4 > prev.s3 && today.s4 < prev.s2);
  const LoU4L1234 = (today.r4 > prev.r3 && today.r4 < prev.r4) &&
                    (prev.s4 > today.s1 && prev.s4 < today.bc);
  const cOLoU2L4 = (today.r4 > prev.r1 && today.r4 < prev.r2) &&
                   (today.s4 > prev.s4 && today.s4 < prev.s3);

  const eXL3U3 = (prev.r4 < today.r3 && prev.r4 > today.r2) &&
                 (prev.s4 > today.s3 && prev.s4 < today.s2) && srExpandedHigher;
  const eXU3L3 = (prev.r4 < today.r3 && prev.r4 > today.r2) &&
                 (prev.s4 > today.s3 && prev.s4 < today.s2) && srExpandedLower;

  const eXL2U1 = (prev.s4 > today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);
  const eXL3U1 = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);
  const eXL4U1 = (prev.s4 > today.s4 && prev.s4 < today.s3) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);

  const eXL1CPR = (prev.s4 > today.s1 && prev.s4 < today.bc) &&
                  (prev.r4 > today.s1 && prev.r4 < today.bc);
  const eXL2CPR = (prev.s4 > today.s2 && prev.s4 < today.s1) &&
                  (prev.r4 > today.s1 && prev.r4 < today.bc);
  const eXL3CPR = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                  (prev.r4 > today.s1 && prev.r4 < today.bc);

  const eXL4U2 = (prev.s4 > today.s4 && prev.s4 < today.s3) &&
                 (prev.r4 > today.r1  && prev.r4 < today.r2);
  const eXL2U2 = (prev.s4 >= today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.r1  && prev.r4 < today.r2);
  const eXL2TC = (prev.s4 > today.s2 && prev.s4 < today.s1) &&
                 (prev.r4 > today.pivot && prev.r4 < today.tc);
  const eXL3TC = (prev.s4 > today.s3 && prev.s4 < today.s2) &&
                 (prev.r4 > today.pivot && prev.r4 < today.tc);
  const eXL1U1 = (prev.s4 > today.s1 && prev.s4 < today.bc) &&
                 (prev.r4 > today.tc  && prev.r4 < today.r1);

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

  // eXU4L1 — prev's R4 sits inside today's R3/R4 band (U4) AND prev's S4
  // sits inside today's BC/S1 band (L1). Mirror shape to eXU2L1/eXU3L1
  // but with the widest U-band (R3→R4) on the resistance side.
  const eXU4L1 = (prev.r4 > today.r3 && prev.r4 < today.r4) &&
                 (prev.s4 > today.s1 && prev.s4 < today.bc);

  // LoCPL3 — today's R4 lands inside prev's Pivot/BC band (the lower half
  // of prev's CPR), AND today's S4 lands inside prev's S2/S3 band (L3).
  // Same "today lands inside prev's band" shape as cOTCL2, but the
  // resistance side is measured against prev's BC→Pivot gap instead of
  // Pivot→TC, and paired with the wider L3 band instead of L2.
  const LoCPL3 = (today.r4 > prev.bc && today.r4 < prev.pivot) &&
                 (today.s4 > prev.s3 && today.s4 < prev.s2);

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

  // cOU1L3 — today's R4 lands inside prev's TC/R1 band (U1) AND today's S4
  // lands inside prev's S3/S2 band (L3).
  const cOU1L3 = (today.r4 > prev.tc && today.r4 < prev.r1) &&
                 (today.s4 > prev.s3 && today.s4 < prev.s2);

  // cOU2L2 / cOL2U2 — split by which side (R2 vs S2) moved further.
  const r2Move = Math.abs(prev.r2 - today.r2);
  const s2Move = Math.abs(prev.s2 - today.s2);
  const cOU2L2Base = (today.s4 > prev.s2 && today.s4 < prev.s1) &&
                     (today.r4 > prev.r1 && today.r4 < prev.r2);
  const cOU2L2 = cOU2L2Base && r2Move > s2Move;
  const cOL2U2 = cOU2L2Base && r2Move < s2Move;

  return {
    r4Distance, s4Distance,
    srHigher, srLower, srExpanded, srCompressed,
    srCompressedHigher, srCompressedLower, srExpandedHigher, srExpandedLower,
    cOU3L4, cOHiL2U3, cOHiL3U3, eXLoL3U4, eXL4U4, HiL4U34, HiL2U4, HiL3U4, HiL4U4,
    LoU4L4, eXHiU1L3, eXHiL4U3, eXU4L234, eXU4L34, cOHiL2U4, cOL4U4, cOU4L4, exL3U2,
    cOL3U4, cOU3L3, LoU3L4, LoU3L34, cOLoU2L3, LoU2L4, LoU2L3, LoU4L34, LoU4L234,
    cOHiL2U2, LoU4L1234, cOU1L2, cOLoU2L4, eXL3U3, eXU3L3,
    cOU1L1, cOL1U1, cOU2L2, cOL2U2,
    HiL3U3, cOU1L3,
    eXL2U1, eXL3U1, eXL4U1, eXL1CPR, eXL2CPR, eXL3CPR,
    eXL3TC, eXL4U2, eXL2U2, eXL2TC, eXL1U1, eXU2L1, cOTCL2, L1pU1Above,
    eXU3L1, eXU2TC, eXU2BC, eXU3TC, eXU2CP, eXU4L1, LoCPL3,
  };
}

/**
 * pickCPRSubLabel — priority-ordered label lookup. This is the ONLY
 * place the label strings and their tie-break order live. The order below
 * must match the if-chain that historically lived in ScreenerUtils.
 */
export function pickCPRSubLabel(f: CPRPairFlags): string | null {
  if (f.cOU3L4)    return "cOU3L4";
  if (f.cOHiL2U3)  return "cOHiL2U3";
  if (f.cOHiL3U3)  return "cOHiL3U3";
  if (f.eXLoL3U4)  return "eXLoL3U4";
  if (f.eXL4U4)    return "eXL4U4";
  if (f.HiL4U34)   return "HiL4U34";
  if (f.HiL2U4)    return "HiL2U4";
  if (f.HiL3U4)    return "HiL3U4";
  if (f.HiL4U4)    return "HiL4U4";
  if (f.LoU4L4)    return "LoU4L4";
  if (f.eXHiU1L3)  return "eXHiU1L3";
  if (f.eXHiL4U3)  return "eXHiL4U3";
  if (f.eXU4L234)  return "eXU4L234";
  if (f.eXU4L34)   return "eXU4L34";
  if (f.cOHiL2U4)  return "cOHiL2U4";
  if (f.cOL4U4)    return "cOL4U4";
  if (f.cOU4L4)    return "cOU4L4";
  if (f.exL3U2)    return "exL3U2";
  if (f.cOL3U4)    return "cOL3U4";
  if (f.cOU3L3)    return "cOU3L3";
  if (f.LoU3L4)    return "LoU3L4";
  if (f.LoU3L34)   return "LoU3L34";
  // cOLoU2L3 checked before other U2-band branches so its badge wins ties.
  if (f.cOLoU2L3)  return "cOLoU2L3";
  if (f.LoU2L4)    return "LoU2L4";
  if (f.LoU2L3)    return "LoU2L3";
  if (f.LoU4L34)   return "LoU4L34";
  if (f.LoU4L234)  return "LoU4L234";
  if (f.cOHiL2U2)  return "cOHiL2U2";
  if (f.LoU4L1234) return "LoU4L1234";
  if (f.cOU1L2)    return "cOU1L2";
  if (f.cOLoU2L4)  return "cOLoU2L4";
  if (f.eXL3U3)    return "eXL3U3";
  if (f.eXU3L3)    return "eXU3L3";
  if (f.cOU1L1)    return "cOU1L1";
  if (f.cOL1U1)    return "cOL1U1";
  if (f.cOU2L2)    return "cOU2L2";
  if (f.cOL2U2)    return "cOL2U2";
  if (f.HiL3U3)    return "HiL3U3";
  if (f.cOU1L3)    return "cOU1L3";
  if (f.eXL2U1)    return "eXL2U1";
  if (f.eXL3U1)    return "eXL3U1";
  if (f.eXL4U1)    return "eXL4U1";
  if (f.eXL1CPR)   return "eXL1CPR";
  if (f.eXL2CPR)   return "eXL2CPR";
  if (f.eXL3CPR)   return "eXL3CPR";
  if (f.eXL3TC)    return "eXL3TC";
  if (f.eXL4U2)    return "eXL4U2";
  if (f.eXL2U2)    return "eXL2U2";
  if (f.eXL2TC)    return "eXL2TC";
  if (f.eXL1U1)    return "eXL1U1";
  if (f.eXU2L1)    return "eXU2L1";
  if (f.cOTCL2)    return "cOTCL2";
  if (f.eXU3L1)    return "eXU3L1";
  if (f.eXU2TC)    return "eXU2TC";
  if (f.eXU2BC)    return "eXU2BC";
  if (f.eXU3TC)    return "eXU3TC";
  if (f.eXU2CP)    return "eXU2CP";
  if (f.eXU4L1)    return "eXU4L1";
  if (f.LoCPL3)    return "LoCPL3";
  return null;
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

  if (!isValidCandle(prevCandle) || !isValidCandle(todayCandle)) return null;

  const prevCPR  = calcCPR(prevCandle);
  const todayCPR = calcCPR(todayCandle);

  const ppCandle = candles.length >= 3 ? candles[candles.length - 3] : null;
  const ppCPR = ppCandle && isValidCandle(ppCandle) ? calcCPR(ppCandle) : undefined;

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

  return {
    symbol,
    todayCPR,
    prevCPR,
    ppCPR,
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
  };
}
