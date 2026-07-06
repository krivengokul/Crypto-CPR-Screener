import type { CPRLevels, CPRResult } from "@/lib/cpr";

export type SortKey = "symbol" | "compressionRatio" | "currentPrice" | "change24h" | "quoteVolume" | "priceVsCpr" | "cprDistance" | "pdhPdlPct";
export type SortDir = "asc" | "desc";
export type ActiveTab = "binance" | "delta" | "combined";

export interface CPRResultWithSource extends CPRResult {
  source: "binance" | "delta";
}

export function fmt(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(v) >= 1) return v.toFixed(4);
  if (Math.abs(v) >= 0.001) return v.toFixed(5);
  return v.toFixed(8);
}

export function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fmtVol(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function priceVsCprValue(r: CPRResultWithSource): number {
  const { currentPrice: price, todayCPR } = r;
  const { tc, bc } = todayCPR;
  if (price > tc) return ((price - tc) / tc) * 100;
  if (price < bc) return -((bc - price) / bc) * 100;
  return 0;
}

/**
 * PDH/PDL % — how far current price sits beyond yesterday's High/Low
 * (r.todayCPR.prevHigh / r.todayCPR.prevLow — the "PH"/"PL" levels used
 * to build today's CPR). Positive when price has broken above PDH,
 * negative when it's broken below PDL, 0 when it's still inside the
 * PDH–PDL range. Used for the PDH/PDL table column and its sort.
 */
export function pdhPdlValue(r: CPRResult): number {
  const { currentPrice: price, todayCPR } = r;
  const { prevHigh: pdh, prevLow: pdl } = todayCPR;
  if (price > pdh) return ((price - pdh) / pdh) * 100;
  if (price < pdl) return -((pdl - price) / pdl) * 100;
  return 0;
}

export function pdhPdlStatus(r: CPRResult): { main: string; sub: string; color: string } {
  const { currentPrice: price, todayCPR } = r;
  const { prevHigh: pdh, prevLow: pdl } = todayCPR;
  if (price > pdh) {
    const pct = ((price - pdh) / pdh) * 100;
    return { main: `+${pct.toFixed(2)}%`, sub: "above PDH", color: "text-green-400" };
  }
  if (price < pdl) {
    const pct = ((pdl - price) / pdl) * 100;
    return { main: `−${pct.toFixed(2)}%`, sub: "below PDL", color: "text-destructive" };
  }
  return { main: "Inside", sub: "PDH/PDL", color: "text-yellow-500" };
}

/**
 * DISTANCE% — gap between today's and previous day's CPR bands, as a
 * percentage, only when the CPR has clearly shifted (Above/Below):
 *   CPR Above (cprRising):  gap between prevCPR.tc and todayCPR.bc,
 *                            expressed as % of prevCPR.tc
 *   CPR Below (cprFalling): gap between todayCPR.tc and prevCPR.bc,
 *                            expressed as % of todayCPR.tc
 * Returns null for all other conditions (overlapping/inside/outside CPR etc).
 */
export function cprDistancePct(r: CPRResult): number | null {
  if (r.cprRising) {
    const prevTc = r.prevCPR.tc;
    const todayBc = r.todayCPR.bc;
    return ((todayBc - prevTc) / prevTc) * 100;
  }
  if (r.cprFalling) {
    const todayTc = r.todayCPR.tc;
    const prevBc = r.prevCPR.bc;
    return ((prevBc - todayTc) / todayTc) * 100;
  }
  return null;
}

export interface DistanceLevel {
  label: string;
  value: number;
}

/**
 * Returns which R/S levels (today's and previous day's) fall inside the
 * DIST gap computed by cprDistancePct — i.e. between prevCPR.tc and
 * todayCPR.bc (CPR Above) or between todayCPR.tc and prevCPR.bc (CPR Below).
 * Naming follows the ADK ladder convention: R1→U1, R2→U2, R3→U3, S1→L1,
 * S2→L2, S3→L3; previous-day levels get a "P" prefix (PU1, PL1, etc).
 * Sorted low → high. Empty when the CPR isn't clearly Above/Below.
 */
export function levelsInDistanceRange(r: CPRResult): DistanceLevel[] {
  const dist = cprDistancePct(r);
  if (dist === null) return [];

  let low: number, high: number;
  if (r.cprRising) {
    low = r.prevCPR.tc;
    high = r.todayCPR.bc;
  } else {
    low = r.todayCPR.tc;
    high = r.prevCPR.bc;
  }
  if (low > high) [low, high] = [high, low];

  const candidates: DistanceLevel[] = [
    { label: "U1",  value: r.todayCPR.r1 },
    { label: "U2",  value: r.todayCPR.r2 },
    { label: "U3",  value: r.todayCPR.r3 },
    { label: "L1",  value: r.todayCPR.s1 },
    { label: "L2",  value: r.todayCPR.s2 },
    { label: "L3",  value: r.todayCPR.s3 },
    { label: "PU1", value: r.prevCPR.r1 },
    { label: "PU2", value: r.prevCPR.r2 },
    { label: "PU3", value: r.prevCPR.r3 },
    { label: "PL1", value: r.prevCPR.s1 },
    { label: "PL2", value: r.prevCPR.s2 },
    { label: "PL3", value: r.prevCPR.s3 },
  ];

  return candidates
    .filter((c) => c.value >= low && c.value <= high)
    .sort((a, b) => a.value - b.value);
}

export function getVal(r: CPRResultWithSource, key: SortKey): number | string {
  switch (key) {
    case "symbol":          return r.symbol;
    case "compressionRatio": return r.compressionRatio;
    case "currentPrice":    return r.currentPrice;
    case "change24h":       return r.change24h;
    case "quoteVolume":     return r.quoteVolume;
    case "priceVsCpr":      return priceVsCprValue(r);
    case "cprDistance":     return cprDistancePct(r) ?? -Infinity;
    case "pdhPdlPct":       return pdhPdlValue(r);
  }
}

export function splitSymbol(symbol: string, source: "binance" | "delta") {
  if (source === "binance") {
    if (symbol.endsWith("USDT")) return { base: symbol.slice(0, -4), quote: "USDT" };
    return { base: symbol, quote: "" };
  }
  const parts = symbol.split("_");
  if (parts.length === 2) return { base: parts[0], quote: parts[1] };
  return { base: symbol, quote: "" };
}

/**
 * Returns TradingView chart URL.
 * Your screener scans Binance USDM perpetual futures.
 * TradingView uses SYMBOL.P for perps (e.g. BTCUSDT.P, STBLUSDT.P).
 * Most symbols exist as both spot and perp on TradingView — for these,
 * .P works fine. A small number exist on TradingView spot but NOT as perp
 * (e.g. QKCUSDT) — those need the plain spot URL.
 *
 * Strategy: always try .P (perp) first since that's what your screener tracks.
 * User can open chart and if it errors, they remove .P manually (rare case).
 * This is better than spot-first because perp candles match your CPR data.
 */

// Symbols that only exist as perp on TradingView (no spot) — append .P
const PERP_ONLY_ON_TV = new Set([
  "STBLUSDT",
]);

export function getChartUrl(symbol: string, source: "binance" | "delta"): string {
  if (source === "delta") {
    // Delta Exchange India symbols on TradingView: DELTAIN: prefix, in.tradingview.com, .p suffix
    // e.g. AAPLXUSD → https://in.tradingview.com/chart/?symbol=DELTAIN:AAPLXUSD.p
    return `https://in.tradingview.com/chart/?symbol=DELTAIN:${symbol}.p`;
  }
  // Binance — default no suffix, .P only for known perp-only symbols
  const suffix = PERP_ONLY_ON_TV.has(symbol) ? ".P" : "";
  return `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}${suffix}`;
}

/**
 * EXP_U4APU4L4BPL4 — shared condition for the "Exp-U4>pU4" pattern:
 * previous day's R4 sits between today's R3 and R4 (U4 Above prev U4),
 * and previous day's S4 sits between today's S4 and S3 (L4 Below prev L4).
 * Note: hyphens aren't valid in JS/TS identifiers, so underscores replace them
 * in this variable's name.
 */
export function EXP_U4APU4L4BPL4(r: CPRResult): boolean {
  return (
    r.prevCPR.r4 > r.todayCPR.r3 &&
    r.prevCPR.r4 < r.todayCPR.r4 &&
    r.prevCPR.s4 > r.todayCPR.s4 &&
    r.prevCPR.s4 < r.todayCPR.s3
  );
}

export function passesPattern(r: CPRResult, pattern: string): boolean {
  switch (pattern) {
    case "littleabove":
      return r.cprRising && r.narrowCPR;
    case "la-2tiny":
      return r.cprRising && r.narrowCPR && r.bothTight;
    case "LA-PL12CL23":
      return r.cprRising && r.narrowCPR && r.PL12CL23;
    // NEW: mP-U34>pU2 — Little Above + Compressed:
    // today S4 > prev S2, today R3 > prev R2, today R4 < prev R4,
    // today CPR width < 0.5%, prev CPR width < 2%, GAP (cprDistancePct) < 10%
    case "mP-U34>pU2":
      return (
        r.cprRising &&
        r.narrowCPR &&
        r.todayCPR.widthPct < 0.5 &&
        r.prevCPR.widthPct < 2 &&
        r.todayCPR.s4 > r.prevCPR.s2 &&
        r.todayCPR.r3 > r.prevCPR.r2 &&
        r.todayCPR.r4 < r.prevCPR.r4 &&
        (cprDistancePct(r) ?? Infinity) < 10
      );
    case "la-allstepup":
      return r.cprRising && r.narrowCPR && r.allupabove && r.allupbelow;
    case "littlebelow":
      return r.cprFalling && r.narrowCPR;
    case "lb-2tiny":
      return r.cprFalling && r.narrowCPR && r.bothTight;
    case "lb-allstepdown":
      return r.cprFalling && r.narrowCPR && r.alldownabove && r.alldownbelow;
    case "LB-PU12CU23":
      return r.cprFalling && r.narrowCPR  && r.todayCPR.s2  > r.prevCPR.s2 && (r.PU12CU23 || r.PU23CU34);
    case "1LB-PL12CL23":
      return r.lbJPattern1;
    case "LBALLD-U2<PU1":
      return r.lbJPattern2;
    // NEW: LB Compressed — LittleBelow + today S4 > prev S3 + today R4 < prev R2
    case "lb-cmprss-l4>3-u4<2":
      return (
        r.cprFalling &&
        r.narrowCPR &&
        (r.todayCPR.s4 > r.prevCPR.s3 && r.todayCPR.s4 < r.prevCPR.s2) &&
        (r.todayCPR.r4 < r.prevCPR.r2 && r.todayCPR.r4 > r.prevCPR.r1)
      );
    // NEW: LB-C-L34C4/U23C4 — LittleBelow + PL34CL4 + today R4 between prev R2 and R3
    case "lb-c-l34c4/u23c4":
      return (
        r.cprFalling &&
        r.narrowCPR &&
        r.PL34CL4 &&
        r.todayCPR.r4 > r.prevCPR.r2 &&
        r.todayCPR.r4 < r.prevCPR.r3
      );
    // NEW: cO2-L2U2 — LittleBelow + Compressed:
    // today's S2 above prev S2, today's R2 below prev R2 (CPR narrowing inward),
    // today's S4/R4 compressed inside prev S2/R2, GAP < 1%
    case "co2-l2u2":
      return (
        r.cprFalling &&
        r.narrowCPR &&
        r.todayCPR.s2 > r.prevCPR.s2 &&
        r.todayCPR.r2 < r.prevCPR.r2 &&
        r.todayCPR.s4 > r.prevCPR.s2 &&
        r.todayCPR.r4 < r.prevCPR.r2 &&
        Math.abs(cprDistancePct(r) ?? Infinity) < 1
      );
    case "Exp-U4>pU4":
      return (
        r.overlapLower &&
        EXP_U4APU4L4BPL4(r) &&
        r.todayCPR.widthPct >= 0.1 &&
        r.todayCPR.widthPct < 0.5
      );
    // Exp-U3>U3 (displayed as "Exp-U3>pU4") — Overlapping Lower + today's R3
    // above prev day's R4, today's S3 below prev day's S4, today's CPR Narrow.
    // (Fixed to match the on-screen description: previously checked "prev R4
    // inside today's R2/R3", which no longer matched the UI text.)
    case "Exp-U3>U3":
      return (
        r.overlapLower &&
        r.narrowCPR &&
        r.todayCPR.r3 > r.prevCPR.r4 &&
        r.todayCPR.s3 < r.prevCPR.s4
      );
    case "inside-cpr":
      return r.todayCPR.tc < r.prevCPR.tc && r.todayCPR.bc > r.prevCPR.bc;
    case "inside-cpr-expanded":
      return r.todayCPR.tc < r.prevCPR.tc && r.todayCPR.bc > r.prevCPR.bc && (r.todayCPR.r4 > r.prevCPR.r4 || r.todayCPR.s4 < r.prevCPR.s4);
    // NEW: inside-cpr-narrow — Inside CPR (today's CPR inside prev day's CPR)
    // + today's CPR is Narrow (widthPct < 0.5%). Coiled-spring setup: sibling
    // of inside-cpr-expanded, differentiated purely on today's CPR width%
    // (no PDH/PDL width considered per Gokul's spec).
    case "inside-cpr-narrow":
      return (
        r.todayCPR.tc < r.prevCPR.tc &&
        r.todayCPR.bc > r.prevCPR.bc &&
        r.todayCPR.widthPct < 0.5
      );
    // NEW: cO-U4L3 — Compressed inside prev R4 and prev S3: today's R4 below
    // prev day's R4 AND today's S4 above prev day's S3. Literal condition
    // only, no extra base condition (per Gokul's spec) — sibling of
    // inside-cpr-expanded / inside-cpr-narrow under the inside-cpr tab.
    case "cO-U4L3":
      return (
        r.todayCPR.r4 < r.prevCPR.r4 &&
        r.todayCPR.s4 > r.prevCPR.s3
      );
    case "outside-cpr":
      return r.todayCPR.tc > r.prevCPR.tc && r.todayCPR.bc < r.prevCPR.bc;
    case "outside-cpr-compressed":
      return r.todayCPR.tc > r.prevCPR.tc && r.todayCPR.bc < r.prevCPR.bc && r.todayCPR.r4 < r.prevCPR.r4 && r.todayCPR.s4 > r.prevCPR.s4;
    case "overlapping-higher":
      return r.overlapHigher;
    case  "LAT-PU12CU23":
      return r.overlapHigher && r.PU12CU23 && r.PL12CL23 && r.todayCPR.prevHigh > r.prevCPR.prevHigh;
    case "overlapping-lower":
      return r.overlapLower;
    case "LBT-PU1>U1PL1>L1":
      return (r.overlapLower && r.lbtJPattern1 && r.bothTight);
    case "lower-bullish":
      return (r.cprFalling && r.cprNarrowing && r.prevCPR.r1  > r.todayCPR.r4);
    case "Price-AbovePDH":
      return (r.currentPrice > r.todayCPR.prevHigh);
    case "Price-BelowPDL":
      return (r.currentPrice < r.todayCPR.prevLow);
    case "structure-bigabove":
      return r.cprRising && r.strWideCPR;
    case "bigabove-pl34cl4-u3>pu4":
      return r.cprRising && r.strWideCPR && r.PL34CL4 && r.todayCPR.r3 > r.prevCPR.r4;
    // NEW: BAComp-l3>pl1/u3>pu1 — BigCPR Above + prev S1 inside today S3/S4 AND prev R1 inside today R2/R3
    case "bacomp-l3>pl1/u3>pu1":
      return (
        r.cprRising &&
        r.strWideCPR &&
        (r.prevCPR.s1 < r.todayCPR.s3 && r.prevCPR.s1 > r.todayCPR.s4) &&
        (r.prevCPR.r1 > r.todayCPR.r2 && r.prevCPR.r1 < r.todayCPR.r3)
      );
    case "HA-U1>PU4":
      return (r.cprRising && r.strWideCPR && r.todayCPR.r1 > r.prevCPR.r4);
    case "HAThin-U1>PU4":
      return (r.cprRising && r.strWideCPR && r.bothTight && r.todayCPR.r1 > r.prevCPR.r4);
    case "structure-bigbelow":
      return r.cprFalling && r.strWideCPR;
    case "bigbelow-pmini-pl3":
      return r.cprFalling && r.strWideCPR && r.prevCPR.widthPct < 0.5 && r.PL34CL4 &&
             r.prevCPR.r3  > r.todayCPR.r4;
    // NEW: eX-U4L34 — Big Below + prev R4 inside today's R3/R4, prev S4 inside
    // today's S2/S3, prev day CPR tight (<1%), today's CPR tight (<3%)
    case "eX-U4L34":
      return (
        r.cprFalling &&
        r.strWideCPR &&
        r.prevCPR.r4 > r.todayCPR.r3 &&
        r.prevCPR.r4 < r.todayCPR.r4 &&
        r.prevCPR.s4 > r.todayCPR.s3 &&
        r.prevCPR.s4 < r.todayCPR.s2 &&
        r.todayCPR.prevLow < r.todayCPR.s1 &&
        r.prevCPR.widthPct < 1 && r.todayCPR.widthPct < 3
      );
    // NEW: L1<pL4 — Big Below: today's S1 below prev day's S4 AND today's R2
    // above prev day's R4, wide CPR below prev CPR (structure-bigbelow base)
    case "L1<pL4":
      return (
        r.cprFalling &&
        r.strWideCPR &&
        r.todayCPR.s1 < r.prevCPR.s4 &&
        r.todayCPR.r2 > r.prevCPR.r4
      );
    case "HB-L1<PL1-PU12CU23":
      return r.cprFalling && r.strWideCPR && r.hbJPattern1;
    case "HB-L1<PL4-U1>TCPR":
      return r.cprFalling && r.strWideCPR && r.hbJPattern2;
    case "HB-L1<PL2-U12CPU12":
      return r.cprFalling && r.strWideCPR && r.hbJPattern3;
    case "HB-L1>PL1-PU1CU234":
      return r.cprFalling && r.strWideCPR && r.hbJPattern4;
    default:
      return false;
  }
}

/**
 * Pivot Level — classifies today's CPR range relative to yesterday's using
 * the directional sub-flags computed in cpr.ts:
 *   eX-Higher / eX-Lower:  Expanded (today R4 > prev R4 AND today S4 < prev S4),
 *                          split by which side expanded more (srExpandedHigher/Lower)
 *   cO-Higher / cO-Lower:  Compressed (today R4 < prev R4 AND today S4 > prev S4),
 *                          split by which side squeezed harder (srCompressedHigher/Lower)
 *   Higher:     today R4 >= prev R4  AND today S4 >= prev S4  (range shifted up, ties included)
 *   Lower:      everything else not covered above (range shifted down)
 *
 * All six buckets are mutually exclusive and exhaustive by construction —
 * cpr.ts guarantees exactly one of srExpanded / srCompressed / srHigher /
 * srLower is true for every row, and within srExpanded/srCompressed exactly
 * one of the High/Low sub-flags is true (ties are folded into the Higher
 * variant in cpr.ts). getPivotLevel here just reads those flags in order —
 * no re-derivation, no ties, no null/unclassified rows.
 */
export interface PivotLevelInfo {
  label: "eX-Higher" | "eX-Lower" | "cO-Higher" | "cO-Lower" | "Higher" | "Lower";
  classes: string;
}

export function getPivotLevel(r: CPRResult): PivotLevelInfo {
  if (r.srExpandedHigher) {
    return { label: "eX-Higher", classes: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
  }
  if (r.srExpandedLower) {
    return { label: "eX-Lower", classes: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20" };
  }
  if (r.srCompressedHigher) {
    return { label: "cO-Higher", classes: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" };
  }
  if (r.srCompressedLower) {
    return { label: "cO-Lower", classes: "bg-teal-500/10 text-teal-400 border-teal-500/20" };
  }
  if (r.srHigher) {
    return { label: "Higher", classes: "bg-green-500/10 text-green-400 border-green-500/20" };
  }
  return { label: "Lower", classes: "bg-destructive/10 text-destructive border-destructive/20" };
}

export function isRisingAboveTC(r: CPRResult): boolean {
  return r.currentPrice > r.todayCPR.tc;
}

export function distanceFromCPR(
  price: number,
  tc: number,
  bc: number
): { main: string; sub: string; color: string } {
  if (price > tc) {
    const pct = ((price - tc) / tc) * 100;
    return { main: `+${pct.toFixed(2)}%`, sub: "above TC", color: "text-green-400" };
  }
  if (price < bc) {
    const pct = ((bc - price) / bc) * 100;
    return { main: `−${pct.toFixed(2)}%`, sub: "below BC", color: "text-destructive" };
  }
  return { main: "Inside", sub: "CPR", color: "text-yellow-500" };
}

/**
 * ADK-style S/R Ladder.
 *
 * Shows all CPR levels in the same order as "CPR by Ask Dinesh Kumar (ADK)":
 *   R4, R3, R2, PH (Previous High), R1, TC, Pivot, BC, PL (Previous Low), S1, S2, S3, S4
 *
 * The live price row is inserted at the correct position in the ladder.
 */
export function SRLadder({
  cpr,
  currentPrice,
  label,
}: {
  cpr: CPRLevels;
  currentPrice: number;
  label: string;
}) {
  const levels = [
    { key: "R4",    value: cpr.r4 },
    { key: "R3",    value: cpr.r3 },
    { key: "R2",    value: cpr.r2 },
    { key: "PH",    value: cpr.prevHigh },
    { key: "R1",    value: cpr.r1 },
    { key: "TC",    value: cpr.tc },
    { key: "Pivot", value: cpr.pivot },
    { key: "BC",    value: cpr.bc },
    { key: "PL",    value: cpr.prevLow },
    { key: "S1",    value: cpr.s1 },
    { key: "S2",    value: cpr.s2 },
    { key: "S3",    value: cpr.s3 },
    { key: "S4",    value: cpr.s4 },
  ].sort((a, b) => b.value - a.value);

  type Row =
    | { type: "level"; key: string; value: number }
    | { type: "price" };

  const rows: Row[] = [];
  let priceInserted = false;
  for (const lvl of levels) {
    if (!priceInserted && currentPrice > lvl.value) {
      rows.push({ type: "price" });
      priceInserted = true;
    }
    rows.push({ type: "level", key: lvl.key, value: lvl.value });
  }
  if (!priceInserted) rows.push({ type: "price" });

  const rowColor = (key: string) => {
    if (key === "TC" || key === "BC" || key === "Pivot")
      return "text-yellow-500 font-semibold bg-yellow-500/5";
    if (key === "PH" || key === "PL")
      return "text-orange-400 font-medium bg-orange-500/5";
    if (key.startsWith("R")) return "text-red-400";
    return "text-green-400";
  };

  return (
    <div className="min-w-[170px]">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </p>
      {rows.map((row, i) =>
        row.type === "price" ? (
          <div
            key={`price-${i}`}
            className="flex justify-between bg-blue-500 text-white text-xs px-2 py-1 rounded font-bold my-0.5"
          >
            <span>▶ Price</span>
            <span className="font-mono">{fmt(currentPrice)}</span>
          </div>
        ) : (
          <div
            key={row.key}
            className={`flex justify-between text-xs px-2 py-0.5 rounded ${rowColor(row.key)}`}
          >
            <span className="w-14 shrink-0">{row.key}</span>
            <span className="font-mono">{fmt(row.value)}</span>
          </div>
        )
      )}
    </div>
  );
}
