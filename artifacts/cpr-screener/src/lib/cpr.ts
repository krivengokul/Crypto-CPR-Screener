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
}

export interface CPRResult {
  symbol: string;
  todayCPR: CPRLevels;
  prevCPR: CPRLevels;
  // NEW: ppCPR — CPR of the candle before prevCandle (previous-of-previous
  // day). Optional — only present when there are at least 3 valid candles.
  // Used solely by the "pWideAbove" sub-toggle (nested under U1>PU4).
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
  cOLoL2U1: boolean;
  cOU3L4: boolean;
  cOHiL2U3: boolean;
  cOHiL3U3: boolean;
  eXLoL3U4: boolean;
  eXL4U4: boolean;
  HiL2U4: boolean;
  HiL3U4: boolean;
  HiL4U4: boolean;
  HiL4U34: boolean;
  LoL4U4:boolean;
  eXHiU1L3: boolean;
  eXHiL4U234: boolean;
  eXU4L234: boolean;
  cOHiL2U4: boolean;
  equalCPR: boolean;
  eXL3U3: boolean;
  eXU3L3: boolean;
  cOL4U4: boolean;
  cOU4L4: boolean;
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
  cOLoU1L2: boolean;
  cOLoU2L4: boolean;
  // NEW: eXL*U1 / eXL*CPR — Expanded-Higher sub-type pivot badges.
  // These narrow "eX-Higher" into specific S/R bands for the U1>pU4 section.
  //   eXL2U1:  prevS4 in today's L2 band (s1/s2),  prevR4 in today's U1 band (tc/r1)
  //   eXL3U1:  prevS4 in today's L3 band (s2/s3),  prevR4 in today's U1 band (tc/r1)
  //   eXL4U1:  prevS4 in today's L4 band (s3/s4),  prevR4 in today's U1 band (tc/r1)
  //   eXL1CPR: prevS4 and prevR4 both inside today's CPR band (s1/bc)
  //   eXL2CPR: prevS4 in today's L2 band (s1/s2),  prevR4 in today's CPR band (s1/bc)
  //   eXL3CPR: prevS4 in today's L3 band (s2/s3),  prevR4 in today's CPR band (s1/bc)
  eXL2U1: boolean;
  eXL3U1: boolean;
  eXL4U1: boolean;
  eXL1CPR: boolean;
  eXL2CPR: boolean;
  eXL3CPR: boolean;
  // NEW: cOU1L1 / cOL1U1 / cOU2L2 / cOL2U2 — independent, section-agnostic
  // Pivot Level badges (see doc-comment above getPivotLevel in
  // ScreenerUtils.tsx for how these are surfaced/filterable).
  //   cOU1L1: today's S4 in prev L1 band (s1→tc), today's R4 in prev U1 band
  //           (bc→r1), AND the R1-side move (|prevR1-todayR1|) is bigger
  //           than the S1-side move (|prevS1-todayS1|)
  //   cOL1U1: same bands as cOU1L1, but the S1-side move is bigger
  //   cOU2L2: today's S4 in prev L2 band (s2→s1), today's R4 in prev U2
  //           band (r1→r2), AND today's S3 is below prev S1
  //   cOL2U2: same bands as cOU2L2, but today's R3 is above prev R1
  cOU1L1: boolean;
  cOL1U1: boolean;
  cOU2L2: boolean;
  cOL2U2: boolean;
  passes: boolean;
  currentPrice: number;
  openPrice: number;
  change24h: number;
  quoteVolume: number;
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
 * ADK Classic Pivot CPR calculation.
 *
 * Matches "CPR by Ask Dinesh Kumar (ADK)" TradingView indicator exactly:
 *   Pivot  = (H + L + C) / 3
 *   BC     = (H + L) / 2          — always the lower CPR boundary
 *   TC     = 2 × Pivot − BC       — always the upper CPR boundary
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
 *
 * prevHigh / prevLow are stored so the S/R ladder can display them
 * exactly as ADK shows "PH" and "PL" lines on the chart.
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
  // TradingView-style extension
  const r4 = r3 + r2 - r1;
  const s4 = s3 + s2 - s1;

  return {
    pivot,
    bc,
    tc,
    width,
    widthPct,
    prevHigh: h,
    prevLow:  l,
    r1,
    r2,
    r3,
    r4,
    s1,
    s2,
    s3,
    s4
  };
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

  // NEW: ppCPR — CPR of the candle before prevCandle, used only for the
  // "pWideAbove" sub-toggle (Previous CPR wider than pp-CPR AND Previous
  // CPR positioned above pp-CPR). Optional — only present when there are
  // at least 3 candles and that 3rd-from-last candle is valid.
  const ppCandle = candles.length >= 3 ? candles[candles.length - 3] : null;
  const ppCPR = ppCandle && isValidCandle(ppCandle) ? calcCPR(ppCandle) : undefined;

  const minGap     = prevCPR.pivot * 0.001;
  const cprRising  = todayCPR.bc > prevCPR.tc;
  const cprFalling = todayCPR.tc < prevCPR.bc;
  const strWideCPR    = todayCPR.widthPct > prevCPR.widthPct;
  const narrowCPR    = todayCPR.widthPct < prevCPR.widthPct;
  const compressionRatio = prevCPR.width > 0 ? (todayCPR.width / prevCPR.width) * 100 : 100;
  const cprNarrowing     = compressionRatio < 50;
  const bothTight        = todayCPR.widthPct < 0.5 && prevCPR.widthPct < 0.5;
  const srHigher =  todayCPR.r4 > prevCPR.r4 && todayCPR.s4 > prevCPR.s4;
  const srLower = todayCPR.r4 < prevCPR.r4 && todayCPR.s4 < prevCPR.s4;
  const srExpanded = todayCPR.r4 > prevCPR.r4 && todayCPR.s4 < prevCPR.s4;
  const srCompressed = todayCPR.r4 < prevCPR.r4 && todayCPR.s4 > prevCPR.s4;
  // Shared distances — normalized by prev day's CPR width so the R-side move
  // and the S-side move are compared on equal footing regardless of the
  // asset's price scale. Raw price differences (todayCPR.r4 - prevCPR.r4 vs
  // todayCPR.s4 - prevCPR.s4) unfairly favor whichever side sits at a larger
  // absolute price level — e.g. a token whose R-side lives near 0.0146 but
  // whose S-side lives near 0 would almost always show a "bigger" R4 move in
  // raw terms even when the S4 move is proportionally much larger. Dividing
  // by prevCPR.width expresses each move as "how many CPR-widths did this
  // side travel", which is scale-independent.
  const normDenom  = prevCPR.width > 0 ? prevCPR.width : prevCPR.pivot * 0.0001;
  const r4Distance = Math.abs(todayCPR.r4 - prevCPR.r4) / normDenom;
  const s4Distance = Math.abs(todayCPR.s4 - prevCPR.s4) / normDenom;
  // Secondary tiebreaker: gap between the adjacent S/R levels on each side.
  // Used when r4Distance === s4Distance to decide Higher vs Lower.
  // r3R4Gap = how far today's R3 is from prev R4 (upper-side adjacency)
  // s3S4Gap = how far prev S4 is from today's S3 (lower-side adjacency)
  // The side with the larger adjacent gap expanded more → wins the tie.
  const r3R4Gap = Math.abs(todayCPR.r3 - prevCPR.r4);
  const s3S4Gap = Math.abs(prevCPR.s4 - todayCPR.s3);
  // Compressed: bigger S4 move (support rising) = bullish squeeze
  const srCompressedHigher = srCompressed && (s4Distance > r4Distance || (s4Distance === r4Distance && s3S4Gap > r3R4Gap));
  const srCompressedLower  = srCompressed && (r4Distance > s4Distance || (r4Distance === s4Distance && r3R4Gap > s3S4Gap));
  // Expanded: bigger R4 move (resistance rising) = bullish expansion
  const srExpandedHigher   = srExpanded   && (r4Distance > s4Distance || (r4Distance === s4Distance && r3R4Gap > s3S4Gap));
  const srExpandedLower    = srExpanded   && (s4Distance > r4Distance || (s4Distance === r4Distance && s3S4Gap > r3R4Gap));
  const cOLoL2U1 = (prevCPR.s1  < todayCPR.s3 && prevCPR.s1 > todayCPR.s4) &&
                    (todayCPR.r4  < prevCPR.r1 && todayCPR.r4 > prevCPR.tc);
  const cOU3L4 =(todayCPR.s4 > prevCPR.s4 && todayCPR.s4 < prevCPR.s3 ) &&
                  (todayCPR.r4 > prevCPR.r2  && todayCPR.r4 < prevCPR.r3);
  const cOHiL2U3 =(todayCPR.s4 > prevCPR.s2 && todayCPR.s4 < prevCPR.s1 ) &&
                  (todayCPR.r4 > prevCPR.r2  && todayCPR.r4 < prevCPR.r3);
  const cOHiL3U3 = (todayCPR.s4 > prevCPR.s3 && todayCPR.s4 < prevCPR.s2) &&
                   (todayCPR.r4 > prevCPR.r2  && todayCPR.r4 < prevCPR.r3) && srCompressedHigher;
  const eXLoL3U4 = (prevCPR.r4 > todayCPR.r3 && prevCPR.r4 < todayCPR.r4) &&
                    (prevCPR.s4 > todayCPR.s3 && prevCPR.s4 < todayCPR.s2); 
  const eXL4U4 = (prevCPR.r4 > todayCPR.r3 && prevCPR.r4 < todayCPR.r4) &&
                  (prevCPR.s4 > todayCPR.s4 && prevCPR.s4 < todayCPR.s3);
  const HiL4U34 = (prevCPR.r4 > todayCPR.r2 && prevCPR.r4 < todayCPR.r3) &&
                  (todayCPR.s4 > prevCPR.s4 && todayCPR.s4 < prevCPR.s3);
  // HiL2U4: today's S4 in prev L2 band (S2→S1), prev R4 in today's U4 band (R3→R4)
  const HiL2U4 = (todayCPR.s4 > prevCPR.s2 && todayCPR.s4 < prevCPR.s1) &&
                 (prevCPR.r4 > todayCPR.r3 && prevCPR.r4 < todayCPR.r4);
  // HiL3U4: today's S4 in prev L3 band (S3→S2), prev R4 in today's U4 band (R3→R4)
  const HiL3U4 = (todayCPR.s4 > prevCPR.s3 && todayCPR.s4 < prevCPR.s2) &&
                 (prevCPR.r4 > todayCPR.r3 && prevCPR.r4 < todayCPR.r4);
  const HiL4U4 = (prevCPR.r4 > todayCPR.r3 && prevCPR.r4 < todayCPR.r4) &&
                  (todayCPR.s4 > prevCPR.s4 && todayCPR.s4 < prevCPR.s3);
  const LoL4U4   = (todayCPR.r4 < prevCPR.r4 && todayCPR.r4 > prevCPR.r3) &&
                  (prevCPR.s4 > todayCPR.s4 && prevCPR.s4 < todayCPR.s3);
  const eXHiU1L3 = (prevCPR.r4 < todayCPR.r1 && prevCPR.r4 > todayCPR.tc) &&
                     (prevCPR.s4 > todayCPR.s3 && prevCPR.s4 < todayCPR.s2);
  const eXHiL4U234 = (prevCPR.s4 > todayCPR.s4 && prevCPR.s4 < todayCPR.s3) &&
                     (prevCPR.r4 > todayCPR.r1 && prevCPR.r4 < todayCPR.r2);
  const eXU4L234 = (prevCPR.r4 < todayCPR.r4 && prevCPR.r4 > todayCPR.r3) &&
                   (prevCPR.s4 < todayCPR.s1 && prevCPR.s4 > todayCPR.s2);
  const cOHiL2U4 = (todayCPR.s4 < prevCPR.s1 && todayCPR.s4 > prevCPR.s2) &&
                 (prevCPR.r3 > todayCPR.r3 && prevCPR.r3 < todayCPR.r4);
  // cOL4U4: today's S4 sits in the prev L4–L3 band, today's R4 sits in the prev U3–U4 band
  const cOL4U4 = (todayCPR.s4 > prevCPR.s4 && todayCPR.s4 < prevCPR.s3) &&
                 (todayCPR.r4 > prevCPR.r3 && todayCPR.r4 < prevCPR.r4) && srCompressedHigher;
  const cOU4L4 = (todayCPR.s4 > prevCPR.s4 && todayCPR.s4 < prevCPR.s3) && 
                  (todayCPR.r4 > prevCPR.r3 && todayCPR.r4 < prevCPR.r4) && srCompressedLower;
  // cOL3U4: today's S4 sits in the prev L3–L2 band, today's R4 sits in the prev U3–U4 band
  const cOL3U4 = (todayCPR.s4 > prevCPR.s3 && todayCPR.s4 < prevCPR.s2) &&
                 (todayCPR.r4 > prevCPR.r3 && todayCPR.r4 < prevCPR.r4);
  // cOU3L3: today's S4 sits in the prev L3–L2 band, today's R4 sits in the prev U2–U3 band
  const cOU3L3 = (todayCPR.s4 > prevCPR.s3 && todayCPR.s4 < prevCPR.s2) &&
                 (todayCPR.r4 > prevCPR.r2 && todayCPR.r4 < prevCPR.r3) && srCompressedLower;
  // LoU3L4: today's R4 in prev U3 band (R2→R3), prev S4 between today's S4 and today's S3
  const LoU3L4 = (todayCPR.r4 > prevCPR.r2 && todayCPR.r4 < prevCPR.r3) &&
                 (prevCPR.s4 > todayCPR.s4 && prevCPR.s4 < todayCPR.s3);
  // LoU3L34: today's R4 in prev U3 band (R2→R3), prev S4 between today's S3 and today's S2
  const LoU3L34 = (todayCPR.r4 > prevCPR.r2 && todayCPR.r4 < prevCPR.r3) &&
                  (prevCPR.s4 > todayCPR.s3 && prevCPR.s4 < todayCPR.s2);
  // LoU2L4: today's R4 in prev U2 band (R1→R2), prev S4 between today's S4 and today's S3
  const LoU2L4 = (todayCPR.r4 > prevCPR.r1 && todayCPR.r4 < prevCPR.r2) &&
                 (prevCPR.s4 > todayCPR.s4 && prevCPR.s4 < todayCPR.s3);
  // LoU2L3: today's R4 in prev U2 band (R1→R2), prev S4 between today's S3 and today's S2
  const LoU2L3 = (todayCPR.r4 > prevCPR.r1 && todayCPR.r4 < prevCPR.r2) &&
                 (prevCPR.s4 > todayCPR.s3 && prevCPR.s4 < todayCPR.s2);
  // LoU4L34: today's R4 in prev U4 band (R3→R4), prev S4 between today's S3 and today's S2
  const LoU4L34 = (todayCPR.r4 > prevCPR.r3 && todayCPR.r4 < prevCPR.r4) &&
                  (prevCPR.s4 > todayCPR.s3 && prevCPR.s4 < todayCPR.s2);
  // LoU4L234: today's R4 in prev U4 band (R3→R4), prev S4 between today's S2 and today's S1
  const LoU4L234 = (todayCPR.r4 > prevCPR.r3 && todayCPR.r4 < prevCPR.r4) &&
                   (prevCPR.s4 > todayCPR.s2 && prevCPR.s4 < todayCPR.s1);
  // cOHiL2U2: today's R4 in prevU2 (R1→R2), today's R3 above prev R1, today's S4 between prev S2→S1
  const cOHiL2U2 = (todayCPR.r4 > prevCPR.r1 && todayCPR.r4 < prevCPR.r2) &&
                   (todayCPR.r3 > prevCPR.r1) &&
                   (todayCPR.s4 > prevCPR.s2 && todayCPR.s4 < prevCPR.s1);
  // cOLoU2L3: today's R4 in prevU2 (R1→R2), today's S4 between prev S3→S2, today's S3 below prev S2
  const cOLoU2L3 = (todayCPR.r4 > prevCPR.r1 && todayCPR.r4 < prevCPR.r2) &&
                   (todayCPR.s4 > prevCPR.s3 && todayCPR.s4 < prevCPR.s2) &&
                   (todayCPR.s3 < prevCPR.s2);
  // LoU4L1234: today's R4 in prevU4 (R3→R4), prev S4 between today's S1 and today's BC
  const LoU4L1234 = (todayCPR.r4 > prevCPR.r3 && todayCPR.r4 < prevCPR.r4) &&
                    (prevCPR.s4 > todayCPR.s1 && prevCPR.s4 < todayCPR.bc);
  // cOLoU1L2: today's R4 in prevU1 (TC→R1), today's S4 between prev S2→S1
  const cOLoU1L2 = (todayCPR.r4 > prevCPR.tc && todayCPR.r4 < prevCPR.r1) &&
                   (todayCPR.s4 > prevCPR.s2 && todayCPR.s4 < prevCPR.s1);
  // cOLoU2L4: today's R4 in prevU2 (R1→R2), today's S4 between prev S4→S3
  const cOLoU2L4 = (todayCPR.r4 > prevCPR.r1 && todayCPR.r4 < prevCPR.r2) &&
                   (todayCPR.s4 > prevCPR.s4 && todayCPR.s4 < prevCPR.s3);
  const PL12CL23 = (todayCPR.s2 < prevCPR.s1 && todayCPR.s3 > prevCPR.s2); //LA-PL12CL23:2PL4;
  const PU12CU23  =  (prevCPR.r1 < todayCPR.r2 && prevCPR.r2 > todayCPR.r3); //PU12CU23
  const PU23CU34  =  (prevCPR.r2 < todayCPR.r3 && prevCPR.r3 > todayCPR.r4); //PU23CU34
  const PL34CL34  =  (prevCPR.s3 > todayCPR.s3 && prevCPR.s4 < todayCPR.s4); //PL34CL34
  const PL34CL4  =  (prevCPR.s3 > todayCPR.s4 && prevCPR.s4 < todayCPR.s4); //PL34CL4
  const lbJPattern1  = ((prevCPR.bc  - todayCPR.tc) >= minGap) && todayCPR.widthPct < 1 && 
                          (todayCPR.s2 < prevCPR.s1 && todayCPR.s3 > prevCPR.s2); //1LB-PL12CL23:2PU4
  const lbJPattern2  = ((prevCPR.bc  - todayCPR.tc) >= minGap) && todayCPR.widthPct < 1 && todayCPR.r2 < prevCPR.r1 &&
                        (todayCPR.s1 < prevCPR.s1 && todayCPR.s2 < prevCPR.s2 && 
                          todayCPR.s3 < prevCPR.s3 && todayCPR.s4 < prevCPR.s4); //LBALLD-U2<PU1:2U4
  
  const overlapHigher    = (todayCPR.bc >= prevCPR.bc && todayCPR.bc <= prevCPR.tc) && todayCPR.tc > prevCPR.tc;

  const allupabove =  (todayCPR.r1 > prevCPR.r1) && (todayCPR.r1 < prevCPR.r2) &&// R1 stepped up
                      (todayCPR.r2 > prevCPR.r2) && (todayCPR.r2 < prevCPR.r3) &&// R2 stepped up
                      (todayCPR.r3 > prevCPR.r3) && (todayCPR.r3 < prevCPR.r4) &&// R3 stepped up
                      (todayCPR.r4 > prevCPR.r4);// R4 stepped up
  
  const allupbelow =  (todayCPR.s1 > prevCPR.s1) && (todayCPR.s1 < prevCPR.bc) &&// S1 stepped up
                      (todayCPR.s2 > prevCPR.s2) && (todayCPR.s2 < prevCPR.s1) &&// S2 stepped up
                      (todayCPR.s3 > prevCPR.s3) && (todayCPR.s3 < prevCPR.s2) &&// S3 stepped up
                      (todayCPR.s4 > prevCPR.s4) && (todayCPR.s4 < prevCPR.s3);// S4 stepped up

  const alldownabove = (todayCPR.r1 < prevCPR.r1 && todayCPR.r1 > prevCPR.tc) && // R1 stepped down
                        (todayCPR.r2 < prevCPR.r2  && todayCPR.r2 > prevCPR.r1)&& 
                        (todayCPR.r3 < prevCPR.r3  && todayCPR.r3 > prevCPR.r2) && 
                        (todayCPR.r4 < prevCPR.r4 && todayCPR.r4 > prevCPR.r3); // R4 stepped down

  const alldownbelow = (todayCPR.s1 < prevCPR.s1 && todayCPR.s1 > prevCPR.s2) && // S1 stepped down
                        (todayCPR.s2 < prevCPR.s2  && todayCPR.s2 > prevCPR.s3)&& 
                        (todayCPR.s3 < prevCPR.s3  && todayCPR.s3 > prevCPR.s4) && 
                          todayCPR.s4 < prevCPR.s4 ; // S4 stepped down

  const overlapLower    = (todayCPR.tc <= prevCPR.tc && todayCPR.tc >= prevCPR.bc) && todayCPR.bc < prevCPR.bc;
  const lbtJPattern1   = (todayCPR.r1 < prevCPR.r1 && todayCPR.s1 < prevCPR.s1) &&
                          (prevCPR.r1 > todayCPR.r1 && prevCPR.r2 > todayCPR.r2 && prevCPR.r3 > todayCPR.r3 && prevCPR.r4 > todayCPR.r4)
  
  const hbJPattern1  = (todayCPR.s1 < prevCPR.s2 && todayCPR.s1 > prevCPR.s3) && prevCPR.widthPct < 0.5 && // L1<PL2
                          (todayCPR.s2 > prevCPR.r1 && todayCPR.s3 < prevCPR.r2); //HB-PU12CU23:2PU4
  const hbJPattern2  = (todayCPR.s1 < prevCPR.s4 && todayCPR.r1 > prevCPR.tc) && prevCPR.widthPct < 0.5; //ONE,2 MORE COND
  const hbJPattern3  = (todayCPR.s1 < prevCPR.s2 && todayCPR.s1 > prevCPR.s3) && prevCPR.widthPct < 0.5 && // L1<PL2
                        ((todayCPR.r1 < prevCPR.r1 && todayCPR.r1 > prevCPR.tc) && (todayCPR.r2 > prevCPR.r2 && todayCPR.r2 < prevCPR.r3)); //HB-U12CPU12:2L4 REFACTOR THIS
  const hbJPattern4  = (todayCPR.s1 > prevCPR.s1 && todayCPR.s1 < prevCPR.bc) && prevCPR.widthPct < 0.5 && // L1>PL1
                        todayCPR.r4 < prevCPR.r1 ; //HB-PU1CU234:2L4

  // Equal CPR: today TC, Pivot and BC are within 0.001% of yesterday
  const eqTol = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.00001;
  const equalCPR =
    eqTol(prevCPR.tc, todayCPR.tc) &&
    eqTol(prevCPR.pivot, todayCPR.pivot) &&
    eqTol(prevCPR.bc, todayCPR.bc);

  const eXL3U3 = (prevCPR.r4 < todayCPR.r3 && prevCPR.r4 > todayCPR.r2) && 
                  (prevCPR.s4 > todayCPR.s3 && prevCPR.s4 < todayCPR.s2) && srExpandedHigher;
  const eXU3L3 = (prevCPR.r4 < todayCPR.r3 && prevCPR.r4 > todayCPR.r2) && 
                  (prevCPR.s4 > todayCPR.s3 && prevCPR.s4 < todayCPR.s2) && srExpandedLower;

  // NEW: eXL*U1 — prevS4 in today's L2/L3/L4 band, prevR4 in today's U1 band (tc→r1)
  const eXL2U1 = (prevCPR.s4 > todayCPR.s2 && prevCPR.s4 < todayCPR.s1) &&
                 (prevCPR.r4 > todayCPR.tc  && prevCPR.r4 < todayCPR.r1);
  const eXL3U1 = (prevCPR.s4 > todayCPR.s3 && prevCPR.s4 < todayCPR.s2) &&
                 (prevCPR.r4 > todayCPR.tc  && prevCPR.r4 < todayCPR.r1);
  const eXL4U1 = (prevCPR.s4 > todayCPR.s4 && prevCPR.s4 < todayCPR.s3) &&
                 (prevCPR.r4 > todayCPR.tc  && prevCPR.r4 < todayCPR.r1);

  // NEW: eXL*CPR — prevS4 in today's L1/L2/L3 band, prevR4 inside today's CPR (s1→bc)
  const eXL1CPR = (prevCPR.s4 > todayCPR.s1 && prevCPR.s4 < todayCPR.bc) &&
                  (prevCPR.r4 > todayCPR.s1 && prevCPR.r4 < todayCPR.bc);
  const eXL2CPR = (prevCPR.s4 > todayCPR.s2 && prevCPR.s4 < todayCPR.s1) &&
                  (prevCPR.r4 > todayCPR.s1 && prevCPR.r4 < todayCPR.bc);
  const eXL3CPR = (prevCPR.s4 > todayCPR.s3 && prevCPR.s4 < todayCPR.s2) &&
                  (prevCPR.r4 > todayCPR.s1 && prevCPR.r4 < todayCPR.bc);

  // NEW: cOU1L1 / cOL1U1 — today's S4 in prev L1 band (s1→tc), today's R4 in
  // prev U1 band (bc→r1); split by which side (R1 vs S1) moved further
  // between prev-day and today (normalized-free, raw price gap per spec).
  const r1Move = Math.abs(prevCPR.r1 - todayCPR.r1);
  const s1Move = Math.abs(prevCPR.s1 - todayCPR.s1);
  const cOU1L1Base = (todayCPR.s4 > prevCPR.s1 && todayCPR.s4 < prevCPR.tc) &&
                      (todayCPR.r4 > prevCPR.bc && todayCPR.r4 < prevCPR.r1);
  const cOU1L1 = cOU1L1Base && r1Move > s1Move;
  const cOL1U1 = cOU1L1Base && r1Move < s1Move;

  // NEW: cOU2L2 / cOL2U2 — today's S4 in prev L2 band (s2→s1), today's R4 in
  // prev U2 band (r1→r2); split by an extra confirming condition on the S3/R3 side.
  const r2Move = Math.abs(prevCPR.r2 - todayCPR.r2);
  const s2Move = Math.abs(prevCPR.s2 - todayCPR.s2);
  const cOU2L2Base = (todayCPR.s4 > prevCPR.s2 && todayCPR.s4 < prevCPR.s1) &&
                      (todayCPR.r4 > prevCPR.r1 && todayCPR.r4 < prevCPR.r2);
  const cOU2L2 = cOU2L2Base && r2Move > s2Move;
  const cOL2U2 = cOU2L2Base && r2Move < s2Move;

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
    lbtJPattern1,
    strWideCPR,
    narrowCPR,  
    bothTight,
    srHigher,
    srLower,
    srExpanded,
    srCompressed,
    srCompressedHigher,
    srCompressedLower,
    srExpandedHigher,
    srExpandedLower,
    cOLoL2U1,
    cOU3L4,
    cOHiL2U3,
    cOHiL3U3,
    eXLoL3U4,
    eXL4U4,
    HiL2U4,
    HiL3U4,
    HiL4U4,
    HiL4U34,
    LoL4U4,
    eXHiU1L3,
    eXHiL4U234,
    eXU4L234,
    cOHiL2U4,
    equalCPR,
    eXL3U3,
    eXU3L3,
    cOL4U4,
    cOU4L4,
    cOL3U4,
    cOU3L3,
    LoU3L4,
    LoU3L34,
    LoU2L4,
    LoU2L3,
    LoU4L34,
    LoU4L234,
    cOHiL2U2,
    cOLoU2L3,
    LoU4L1234,
    cOLoU1L2,
    cOLoU2L4,
    eXL2U1,
    eXL3U1,
    eXL4U1,
    eXL1CPR,
    eXL2CPR,
    eXL3CPR,
    cOU1L1,
    cOL1U1,
    cOU2L2,
    cOL2U2,
    passes: cprRising && cprNarrowing,
    currentPrice,
    openPrice: openPrice ?? todayCandle.open,
    change24h,
    quoteVolume,
  };
}
