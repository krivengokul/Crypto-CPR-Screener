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

/**
 * Splits a raw exchange symbol into { base, quote } for display.
 *
 * Delta symbols are normally underscore-delimited (e.g. "BTC_USDT"). A
 * handful of Delta products — notably tokenized-stock instruments like
 * "INTCBUSD" — don't follow that convention and have no underscore at
 * all. Previously those fell straight through to { base: symbol, quote:
 * "" }, showing the whole raw ticker with a blank quote in the UI (e.g.
 * "INTCBUSD /"). Added a fallback: if there's no underscore, try
 * stripping a known quote suffix off the end instead. Longest/most-
 * specific suffixes are checked first ("BUSD" before "USD") so e.g.
 * "INTCBUSD" correctly splits to base "INTC" / quote "BUSD" rather than
 * base "INTCB" / quote "USD".
 */
const DELTA_QUOTE_SUFFIXES = ["USDT", "BUSD", "USDC", "USD", "INR"];

export function splitSymbol(symbol: string, source: "binance" | "delta") {
  if (source === "binance") {
    if (symbol.endsWith("USDT")) return { base: symbol.slice(0, -4), quote: "USDT" };
    return { base: symbol, quote: "" };
  }
  const parts = symbol.split("_");
  if (parts.length === 2) return { base: parts[0], quote: parts[1] };
  // Fallback for non-underscore Delta symbols (e.g. stock-token tickers).
  for (const q of DELTA_QUOTE_SUFFIXES) {
    if (symbol.length > q.length && symbol.endsWith(q)) {
      return { base: symbol.slice(0, -q.length), quote: q };
    }
  }
  return { base: symbol, quote: "" };
}

/**
 * Whether we have a reliable TradingView chart mapping for this symbol.
 * Binance symbols always map cleanly (BINANCE:<symbol>).
 *
 * FIX (scoped to /BUSD only): Delta's TradingView (DELTAIN:) integration
 * doesn't carry Delta's BUSD-quoted tokenized-stock instruments (e.g.
 * "INTCBUSD") — those are the only Delta symbols known to be missing.
 * Previously this also excluded every non-underscore Delta symbol (i.e.
 * anything not shaped like "BTC_USDT"), which was too broad and hid the
 * chart link for perfectly valid Delta symbols that just don't happen to
 * use an underscore. Now the check is specific: only symbols whose quote
 * (per splitSymbol) is "BUSD" are treated as unmapped; every other Delta
 * symbol — underscore-delimited or not — gets a chart link as normal.
 */
export function hasKnownChartMapping(symbol: string, source: "binance" | "delta"): boolean {
  if (source === "binance") return true;
  return splitSymbol(symbol, "delta").quote !== "BUSD";
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
 * CPR>PU4 — sub-toggle condition for the "U1>PU4" filter (BigCPR Above):
 * today's BC sits above previous day's R4.
 */
export function isCprAbovePU4(r: CPRResult): boolean {
  return r.todayCPR.bc > r.prevCPR.r4;
}

/**
 * L1>PU4 — nested sub-toggle condition, applied on top of CPR>PU4
 * (BigCPR Above → U1>PU4 → CPR>PU4 → L1>PU4): today's S1 sits above
 * previous day's R4.
 */
export function isL1AbovePU4(r: CPRResult): boolean {
  return r.todayCPR.s1 > r.prevCPR.r4;
}

/**
 * pWideAbove — sub-toggle condition nested under "U1>PU4" (BigCPR Above):
 * Previous day's CPR is wider than pp-CPR (the day before previous) AND
 * Previous day's CPR sits above pp-CPR (mirrors the cprRising check, but
 * one day back). Returns false when ppCPR isn't available (not enough
 * candle history).
 */
export function isPWideAbove(r: CPRResult): boolean {
  if (!r.ppCPR) return false;
  const minGap = r.ppCPR.pivot * 0.001;
  const prevAbovePP = (r.prevCPR.bc - r.ppCPR.tc) >= minGap;
  const prevWiderThanPP = r.prevCPR.widthPct > r.ppCPR.widthPct;
  return prevAbovePP && prevWiderThanPP;
}

/**
 * CPR Width Category ladder — replaces the old 3-tier Tiny/Mini/Small scheme
 * with 8 tiers, ordered tightest → widest:
 *
 *   Width %          Category
 *   ≤ 0.10%          Micro
 *   0.10 – 0.22%     Tiny
 *   0.22 – 0.50%     Mini
 *   0.60 – 1.10%     Small
 *   1.10 – 2.00%     Medium
 *   2.00 – 5.00%     Large
 *   5.00 – 10.00%    Mega
 *   > 10.00%         Ultra
 *
 * Each tier has a badge color (today's CPR) and a slightly muted "p"
 * variant used for previous day's CPR (pMicro, pTiny, pMini, pSmall,
 * pMedium, pLarge, pMega, pUltra). Colors run cool→warm as width grows,
 * mirroring "tight/coiled" → "blown-out/volatile".
 */
export type WidthCategoryKey =
  | "micro" | "tiny" | "mini" | "small" | "medium" | "large" | "mega" | "ultra";

export interface WidthCategoryInfo {
  key: WidthCategoryKey;
  label: string;
  max: number; // inclusive upper bound of this tier (Infinity for Ultra)
  classes: string;  // today's CPR badge
  pClasses: string; // previous day's CPR badge (muted variant)
}

export const WIDTH_CATEGORIES: WidthCategoryInfo[] = [
  { key: "micro",  label: "Micro",  max: 0.10,     classes: "bg-violet-500/10 text-violet-400 border-violet-500/20", pClasses: "bg-violet-500/10 text-violet-300 border-violet-400/20" },
  { key: "tiny",   label: "Tiny",   max: 0.22,     classes: "bg-purple-500/10 text-purple-400 border-purple-500/20", pClasses: "bg-purple-500/10 text-purple-300 border-purple-400/20" },
  { key: "mini",   label: "Mini",   max: 0.60,     classes: "bg-teal-500/10 text-teal-400 border-teal-500/20",       pClasses: "bg-teal-500/10 text-teal-300 border-teal-400/20" },
  { key: "small",  label: "Small",  max: 1.10,     classes: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20", pClasses: "bg-indigo-500/10 text-indigo-300 border-indigo-400/20" },
  { key: "medium", label: "Medium", max: 2.00,     classes: "bg-blue-500/10 text-blue-400 border-blue-500/20",       pClasses: "bg-blue-500/10 text-blue-300 border-blue-400/20" },
  { key: "large",  label: "Large",  max: 5.00,     classes: "bg-amber-500/10 text-amber-400 border-amber-500/20",    pClasses: "bg-amber-500/10 text-amber-300 border-amber-400/20" },
  { key: "mega",   label: "Mega",   max: 10.00,    classes: "bg-orange-500/10 text-orange-400 border-orange-500/20", pClasses: "bg-orange-500/10 text-orange-300 border-orange-400/20" },
  { key: "ultra",  label: "Ultra",  max: Infinity, classes: "bg-rose-500/10 text-rose-400 border-rose-500/20",       pClasses: "bg-rose-500/10 text-rose-300 border-rose-400/20" },
];

/**
 * Classifies a CPR width% into its tier. ≤0.10% → Micro, then each
 * successive tier's upper bound is exclusive-open/inclusive-close on the
 * previous one (e.g. Tiny is >0.10% and ≤0.25%), matching the table above.
 */
export function getWidthCategory(widthPct: number): WidthCategoryInfo {
  for (const cat of WIDTH_CATEGORIES) {
    if (widthPct <= cat.max) return cat;
  }
  return WIDTH_CATEGORIES[WIDTH_CATEGORIES.length - 1];
}

/**
 * Width filter — used by the "CPR:" filter row. Unprefixed keys
 * (micro/tiny/mini/small/medium/large/mega/ultra) look at TODAY's CPR
 * width; "p"-prefixed keys (pmicro/ptiny/pmini/psmall/pmedium/plarge/
 * pmega/pultra) look at PREVIOUS day's CPR width. `null` (no filter
 * selected) always passes. Moved here from Screener.tsx so the filtering
 * logic lives alongside the rest of the pattern/condition helpers and
 * isn't duplicated inline.
 */
export type WidthFilter =
  | "micro" | "tiny" | "mini" | "small" | "medium" | "large" | "mega" | "ultra"
  | "pmicro" | "ptiny" | "pmini" | "psmall" | "pmedium" | "plarge" | "pmega" | "pultra"
  | null;

function widthMatchesTier(width: number, key: WidthCategoryKey): boolean {
  switch (key) {
    case "micro":  return width <= 0.10;
    case "tiny":   return width > 0.10 && width <= 0.22;
    case "mini":   return width > 0.22 && width <= 0.60;
    case "small":  return width > 0.60 && width <= 1.10;
    case "medium": return width > 1.10 && width <= 2.00;
    case "large":  return width > 2.00 && width <= 5.00;
    case "mega":   return width > 5.00 && width <= 10.00;
    case "ultra":  return width > 10.00;
    default: return true;
  }
}

/**
 * CHANGED: split into two independent filters — one for prev day's CPR
 * width (the "p"-prefixed pMicro..pUltra buttons), one for today's CPR
 * width (the plain Micro..Ultra buttons). Previously both groups shared a
 * single WidthFilter value, so picking one from either group always
 * cleared the other. Now each group has its own state (see Screener.tsx:
 * prevWidthFilter / todayWidthFilter) and both are ANDed together here —
 * a row must satisfy whichever ones are actually selected (either, both,
 * or neither).
 */
export function matchesWidthFilter(
  r: CPRResult,
  prevWidthFilter: WidthCategoryKey | null,
  todayWidthFilter: WidthCategoryKey | null
): boolean {
  if (prevWidthFilter && !widthMatchesTier(r.prevCPR.widthPct, prevWidthFilter)) return false;
  if (todayWidthFilter && !widthMatchesTier(r.todayCPR.widthPct, todayWidthFilter)) return false;
  return true;
}

/**
 * Human-readable label for the active CPR Width filter, e.g. "psmall" ->
 * "pSmall (0.60%-1.20%)". Used by the result-count summary line in
 * Screener.tsx. Was previously called but never defined/exported — calling
 * it with any width filter active threw a ReferenceError and crashed the
 * component. Fixed by adding it here alongside the other width-filter helpers.
 */
const WIDTH_FILTER_LABELS: Record<NonNullable<WidthFilter>, string> = {
  micro:  "Micro (\u22640.10%)",
  tiny:   "Tiny (0.10%-0.22%)",
  mini:   "Mini (0.22%-0.60%)",
  small:  "Small (0.60%-1.10%)",
  medium: "Medium (1.10%-2.00%)",
  large:  "Large (2.00%-5.00%)",
  mega:   "Mega (5.00%-10.00%)",
  ultra:  "Ultra (>10.00%)",
  pmicro:  "pMicro (\u22640.10%)",
  ptiny:   "pTiny (0.10%-0.22%)",
  pmini:   "pMini (0.22%-0.60%)",
  psmall:  "pSmall (0.60%-1.10%)",
  pmedium: "pMedium (1.10%-2.00%)",
  plarge:  "pLarge (2.00%-5.00%)",
  pmega:   "pMega (5.00%-10.00%)",
  pultra:  "pUltra (>10.00%)",
};

export function formatWidthFilterLabel(widthFilter: WidthFilter): string {
  if (!widthFilter) return "";
  return WIDTH_FILTER_LABELS[widthFilter];
}

export function passesPattern(r: CPRResult, pattern: string): boolean {
  switch (pattern) {
    case "littleabove":
      return r.cprRising && r.narrowCPR;
    case "la-2tiny":
      return r.cprRising && r.narrowCPR && r.bothTight;
    case "LA-PL12CL23":
      return r.cprRising && r.narrowCPR && r.PL12CL23;
    case "sT-cOL2U3-APU4":
      return (
        r.cprRising && r.narrowCPR && r.cOHiL2U3 &&
        (r.todayCPR.r3 > r.prevCPR.r2 && r.todayCPR.r3 < r.prevCPR.r3 && r.todayCPR.s1 > r.prevCPR.pivot) && // Added Condition for nonmatching Charts
        r.prevCPR.widthPct > 0.60 && r.prevCPR.widthPct <= 1.10 &&   // pSmall
        r.todayCPR.widthPct > 0.10 && r.todayCPR.widthPct <= 0.22   // Tiny
      );
    case "la-allstepup":
      return r.cprRising && r.narrowCPR && r.allupabove && r.allupbelow;
    // NEW: 1LHr-L4U3-U4 — Little Above + Compressed:
    // today's S4 above prev S4 AND below prev S3, today's R3 above prev R4,
    // today's CPR Narrow with width < 0.1%, prev CPR width between 0.1% and 1%
    case "1LHr-L4U3-U4":
      return (
        r.cprRising &&
        r.narrowCPR &&
        r.todayCPR.s4 > r.prevCPR.s4 &&
        r.todayCPR.s4 < r.prevCPR.s3 &&
        r.todayCPR.r3 > r.prevCPR.r4 &&
        r.todayCPR.widthPct < 0.1 &&
        r.prevCPR.widthPct > 0.1 && r.prevCPR.widthPct < 1
      );
    case "eXHiU1L3":
      return r.cprRising && r.narrowCPR && r.eXHiU1L3;
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
    // NEW: lbE11-cOLoL3U2-PU4 — LittleCPR Below, placed next to lb-c-l34c4/u23c4:
    // today's R4 inside prev day's R1/R2 AND today's S4 inside prev day's S2/S3,
    // AND prev day CPR width between 1% and 1.5%, today CPR width between 1% and 1.5%.
    // Target: Bullish to PU4.
    case "lbE11-cOLoL3U2-PU4":
      return (
        r.cprFalling &&
        r.narrowCPR &&
        r.todayCPR.r4 > r.prevCPR.r1 && r.todayCPR.r4 < r.prevCPR.r2 &&
        r.todayCPR.s4 < r.prevCPR.s2 && r.todayCPR.s4 > r.prevCPR.s3 &&
        r.prevCPR.widthPct >= 1 && r.prevCPR.widthPct <= 1.5 &&
        r.todayCPR.widthPct >= 1 && r.todayCPR.widthPct <= 1.5
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
    // NEW: eXLoL3U4-AU4 — Big Below (structure-bigbelow: cprFalling + strWideCPR):
    // prev R4 between today's R3/R4 AND prev S4 above today's S3, today's
    // CPR width between 0.5% and 2%, prev CPR width < 0.5%. Moved here from
    // LittleCPR Below — placed next to eX-U4L34 under Big Below.
    case "eXLoL3U4-AU4":
      return (
        r.cprFalling && r.strWideCPR && r.eXLoL3U4 &&
        r.todayCPR.widthPct > 0.5 && r.todayCPR.widthPct < 2 && r.prevCPR.widthPct < 0.5
      );
      //EXP_U4APU4L4BPL4
    // RENAMED: was "eXL4U4" — this pattern is specific to Overlapping Lower
    // only. Renamed to "eXLo-L4U4-U4" to make that scope explicit and to
    // free up the plain "eXL4U4" name for the new section-independent
    // Pivot Level badge (see getPivotLevel doc-comment below). The
    // underlying boolean this reads (r.eXL4U4, computed in cpr.ts) is
    // UNCHANGED — only this case's key/name changed.
    case "eXLo-L4U4-U4":
      return (
        r.overlapLower && r.eXL4U4 &&
        r.todayCPR.widthPct >= 0.1 &&
        r.todayCPR.widthPct < 0.5
      );
    // NEW: eXHi-L4U4-U4 — Overlapping Higher counterpart of eXLo-L4U4-U4.
    // Reuses the same r.eXL4U4 boolean from cpr.ts (prev R4 inside today's
    // R3/R4 AND prev S4 inside today's S3/S4), but gated on r.overlapHigher
    // instead of r.overlapLower, since the raw R/S math itself is direction-
    // agnostic. Width condition matches the reference chart's badges
    // exactly: prev day CPR category = pSmall (0.60%–1.20%), today's CPR
    // category = Tiny (0.10%–0.25%) — rather than a loose "< X%" threshold.
    case "eXHi-L4U4-U4":
      return (
        r.overlapHigher && r.eXL4U4 &&
        ((r.prevCPR.widthPct > 0.60 && r.prevCPR.widthPct <= 1.10 &&   // pSmall
        r.todayCPR.widthPct > 0.10 && r.todayCPR.widthPct <= 0.22 ) ||  // Tiny
        (r.prevCPR.widthPct > 0.60 && r.prevCPR.widthPct <= 1.10 &&   // pSmall
          r.compressionRatio > 120 && r.compressionRatio < 180 ))// Wider
      );
    // NEW: 1T-HiL4U4-FAU4 — BigCPR Above: Wide Above (cprRising +
    // strWideCPR) + HiL4U4 (prev R4 inside today's R3/R4, today's S4
    // inside prev day's S3/S4) + prev CPR width category pMicro (<=0.10%)
    // + today's CPR width category Tiny (0.10%-0.25%).
    case "1T-HiL4U4-FAU4":
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.HiL4U4 &&
        r.prevCPR.widthPct <= 0.10 &&
        r.todayCPR.widthPct > 0.10 && r.todayCPR.widthPct <= 0.25
      );
    case "Exp-U3>U3":
      return (
        r.overlapLower &&
        r.narrowCPR &&
        r.todayCPR.r3 > r.prevCPR.r4 &&
        r.todayCPR.s3 < r.prevCPR.s4 && r.compressionRatio > 50
      );
    case "OBN-LoL4U4-U4":
      return (
        r.overlapLower &&
        r.narrowCPR &&
        r.LoL4U4 &&
        r.compressionRatio > 50
      );
    case "OBW-LoL4U4-L4":
      return (
        r.overlapLower &&
        r.strWideCPR &&
        r.LoL4U4 &&
        r.compressionRatio > 50
      );
    case "eXHi-L4U234-U4":
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.eXHiL4U234 &&
       r.compressionRatio >= 100 && r.compressionRatio <= 150
      );
    case "inside-cpr":
      return (r.todayCPR.tc <= r.prevCPR.tc && r.todayCPR.bc > r.prevCPR.bc) ||
              (r.todayCPR.tc < r.prevCPR.tc && r.todayCPR.bc >= r.prevCPR.bc);
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
    // NEW: eXHrL3U3-AU4 — Outside CPR + prev S4 between today's S3/S4 AND
    // prev R4 between today's R2/R3, today's CPR width between 0.5% and 2%,
    // prev CPR width < 0.5% (tight prior day, today's range expanded outside it)
    case "eXHrL3U3-AU4":
      return (
        r.todayCPR.tc > r.prevCPR.tc &&
        r.todayCPR.bc < r.prevCPR.bc &&
        r.prevCPR.s4 < r.todayCPR.s3 &&
        r.prevCPR.s4 > r.todayCPR.s4 &&
        r.prevCPR.r4 > r.todayCPR.r2 &&
        r.prevCPR.r4 < r.todayCPR.r3 &&
        r.todayCPR.widthPct > 0.5 && r.todayCPR.widthPct < 2 &&
        r.prevCPR.widthPct < 0.5
      );
    case "overlapping-higher":
      return r.overlapHigher;
    case "cOHiL3U3-pL4":
      return r.overlapHigher && r.cOHiL3U3 && r.prevCPR.widthPct <= 0.10 &&   // pMicro
              r.todayCPR.widthPct > 0.60 && r.todayCPR.widthPct <= 1.10;   // Small;
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
      return r.cprRising && r.strWideCPR && !(r.todayCPR.r1 > r.prevCPR.r4);
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
    // Standalone top-level category: same condition as HA-U1>PU4
    case "u1-gt-pu4":
      return (r.cprRising && r.strWideCPR && r.todayCPR.r1 > r.prevCPR.r4);
    case "HAThin-U1>PU4":
      return (r.cprRising && r.strWideCPR && r.bothTight && r.todayCPR.r1 > r.prevCPR.r4);
    // NEW: hR-HAL — BigCPR Above, top-level toggle next to Show All.
    // WideAbove (cprRising + strWideCPR) + Pivot Level: Higher (srHigher) +
    // today's TC between prev R1 and prev R2 + today's R3 above prev R4.
    case "hR-HAL":
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.srHigher &&
        r.todayCPR.tc > r.prevCPR.r1 && r.todayCPR.tc < r.prevCPR.r3 &&  //Includes two variations: Type1 CPR>R1 && R3>pR4
        r.todayCPR.r3 > r.prevCPR.r4 && r.todayCPR.r1 < r.prevCPR.r4 &&  // && Type2 CPR>R2 && R2>pR4 (More Bullish)
        r.prevCPR.widthPct >= 0.1 // NEW: exclude pTiny — prev day CPR must not be tiny (<0.1% width)
      );
      // NEW: HA55-HrL4U34-FAU4 — BigCPR Above, placed next to hR-HAL
    // Logic: today S4 between prev S4/S3 + prev R4 between today R3/R2 + both CPRs >=5% wide + cprRising + strWideCPR
    case "HA55-HrL4U34-FAU4":
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.todayCPR.widthPct >= 5 &&
        r.prevCPR.widthPct >= 5 &&
        r.todayCPR.s4 > r.prevCPR.s4 &&
        r.todayCPR.s4 < r.prevCPR.s3 &&
        r.prevCPR.r4 > r.todayCPR.r3 &&
        r.prevCPR.r4 < r.todayCPR.r2
      );
    case "structure-bigbelow":
      return r.cprFalling && r.strWideCPR && !(r.todayCPR.s1 < r.prevCPR.s4);
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
        r.todayCPR.s1 < r.prevCPR.s4
      );
    // Standalone top-level category: same condition as L1<pL4
    case "l1-lt-pl4":
      return (
        r.cprFalling &&
        r.strWideCPR &&
        r.todayCPR.s1 < r.prevCPR.s4
      );
    // NEW: eXU4L234-AU4 — Big Below (structure-bigbelow: cprFalling +
    // strWideCPR) + Pivot Level: eXU4L234 (prev R4 inside today's R3/R4 AND
    // prev S4 inside today's S1/S2) + prev day's R3 above today's R3 + either
    // today's R1 or prev day's S1 sits between prev day's Pivot and today's
    // Pivot + prev CPR width category pSmall (0.6%-1.1%) + today's CPR width
    // between 1% and 2%.
    case "eXU4L234-AU4": {
      const pivotLow = Math.min(r.prevCPR.pivot, r.todayCPR.pivot);
      const pivotHigh = Math.max(r.prevCPR.pivot, r.todayCPR.pivot);
      const r1BetweenPivots = r.todayCPR.r1 >= pivotLow && r.todayCPR.r1 <= pivotHigh;
      const pS1BetweenPivots = r.prevCPR.s1 >= pivotLow && r.prevCPR.s1 <= pivotHigh;
      return (
        r.cprFalling &&
        r.strWideCPR &&
        r.eXU4L234 &&
        r.prevCPR.r3 > r.todayCPR.r3 &&
        (r1BetweenPivots || pS1BetweenPivots) &&
        r.prevCPR.widthPct >= 0.6 && r.prevCPR.widthPct <= 1.1 &&
        r.todayCPR.widthPct >= 1 && r.todayCPR.widthPct <= 2
      );
    }
    case "HB-L1<PL1-PU12CU23":
      return r.cprFalling && r.strWideCPR && r.hbJPattern1;
    case "HB-L1<PL4-U1>TCPR":
      return r.cprFalling && r.strWideCPR && r.hbJPattern2;
    case "HB-L1<PL2-U12CPU12":
      return r.cprFalling && r.strWideCPR && r.hbJPattern3;
    case "HB-L1>PL1-PU1CU234":
      return r.cprFalling && r.strWideCPR && r.hbJPattern4;
    // Equal CPR: today TC, Pivot and BC match yesterday within a tiny tolerance
    case "equal-cpr":
      return r.equalCPR;
    // eXLoL3U3-L3: Equal CPR AND eX-Lower (srExpandedLower) — Equal bands
    // that also show lower-side expansion dominance at the L3/U3 boundary.
    case "eXLoL3U3-L3":
      return r.equalCPR && r.srExpandedLower;
    default:
      return false;
  }
}

/**
 * Sub-filter direction map, grouped by top-level section (activePattern).
 * Used purely to color the row dot in the Symbol column — NOT tied to
 * whether the sub-filter's toggle button is currently pressed. A row gets
 * a dot the moment its data satisfies ANY sub-filter condition belonging
 * to the active section, via the same passesPattern() check the toggle
 * buttons use internally. Direction ("up" = bullish target = green, "down"
 * = bearish target = red) is taken from each pattern's own "Target"
 * description already shown in the Screener legend/tooltips — e.g.
 * pMini-L34C4/U3>4 lives under "Big Below" but its own title says
 * "Target-APU4", so it's green; LA-PL12CL23 lives under "Little ABOVE" but
 * its own title says "Bearish Target: 2PL4", so it's red.
 *
 * When a row matches more than one sub-filter in the section, the FIRST
 * match (in array order below) determines the dot's color.
 */
export type SubFilterDirection = "up" | "down";

interface SubFilterDef {
  key: string;
  direction: SubFilterDirection;
}

const SUBFILTERS_BY_SECTION: Record<string, SubFilterDef[]> = {
  littleabove: [
    { key: "la-2tiny", direction: "up" },
    { key: "la-allstepup", direction: "up" },
    { key: "1LHr-L4U3-U4", direction: "up" },
    { key: "LA-PL12CL23", direction: "down" },
    { key: "sT-cOL2U3-APU4", direction: "up" },
  ],
  littlebelow: [
    { key: "lb-2tiny", direction: "down" },
    { key: "lb-allstepdown", direction: "down" },
    { key: "lb-cmprss-l4>3-u4<2", direction: "up" },
    { key: "lb-c-l34c4/u23c4", direction: "down" },
    { key: "lbE11-cOLoL3U2-PU4", direction: "up" },
    { key: "co2-l2u2", direction: "up" },
  ],
  "overlapping-higher": [
    { key: "eXHi-L4U4-U4",  direction: "up" },
    { key: "cOHiL3U3-pL4",  direction: "down" },
  ],
  "overlapping-lower": [
    { key: "eXLo-L4U4-U4", direction: "up" },
    { key: "Exp-U3>U3", direction: "up" },
    { key: "OBN-LoL4U4-U4", direction: "up" },
    { key: "OBW-LoL4U4-L4", direction: "up" },
  ],
  "inside-cpr": [
    { key: "inside-cpr-expanded", direction: "up" },
    { key: "inside-cpr-narrow", direction: "up" },
    { key: "cO-U4L3", direction: "up" },
  ],
  "outside-cpr": [
    { key: "outside-cpr-compressed", direction: "up" },
    { key: "eXHrL3U3-AU4", direction: "up" },
  ],
  "structure-bigabove": [
    { key: "bigabove-pl34cl4-u3>pu4", direction: "up" },
    { key: "bacomp-l3>pl1/u3>pu1", direction: "up" },
    { key: "eXHi-L4U234-U4", direction: "up" },
    { key: "hR-HAL", direction: "up" },
    { key: "HA55-HrL4U34-FAU4", direction: "up" },
    { key: "1T-HiL4U4-FAU4", direction: "up" },
  ],
  "u1-gt-pu4": [],
  "structure-bigbelow": [
    { key: "bigbelow-pmini-pl3", direction: "up" },
    { key: "eX-U4L34", direction: "down" },
    { key: "eXLoL3U4-AU4", direction: "down" },
    { key: "eXU4L234-AU4", direction: "down" },
  ],
  "l1-lt-pl4": [],
  "equal-cpr": [
    { key: "eXLoL3U3-L3", direction: "down" },
  ],
};

/**
 * Returns "up"/"down" if row r matches any sub-filter condition for the
 * given section, or null if it matches none (or the section has no
 * sub-filters defined, e.g. "falling"/"inside-value").
 */
export function getSubFilterDirection(r: CPRResult, activePattern: string): SubFilterDirection | null {
  const defs = SUBFILTERS_BY_SECTION[activePattern];
  if (!defs) return null;
  for (const def of defs) {
    if (passesPattern(r, def.key)) return def.direction;
  }
  return null;
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
 * All six original buckets are mutually exclusive and exhaustive by
 * construction — cpr.ts guarantees exactly one of srExpanded / srCompressed /
 * srHigher / srLower is true for every row, and within srExpanded/srCompressed
 * exactly one of the High/Low sub-flags is true (ties are folded into the
 * Higher variant in cpr.ts). getPivotLevel here just reads those flags in
 * order — no re-derivation, no ties, no null/unclassified rows.
 *
 * FIX (duplicate badge bug): cOLoL2U1 / cOLoL4U3 / LoL4U4 are intentionally
 * NOT checked here anymore. They're independent booleans (not mutually
 * exclusive sub-buckets of "Lower" the way eX-Higher/eX-Lower or
 * cO-Higher/cO-Lower are) and Screener.tsx already renders them as their
 * OWN separate second-row badges alongside the primary Pivot Level badge.
 * Having getPivotLevel() also return them as the PRIMARY label caused the
 * same badge (e.g. "LoL4U4") to show twice on a row — once as the primary
 * badge instead of "Lower", and once again in the second row. The pivot
 * level filter buttons for cOLoL2U1/cOLoL4U3/LoL4U4 in Screener.tsx already
 * check the raw r.cOLoL2U1/r.cOLoL4U3/r.LoL4U4 flags directly rather than
 * relying on this function's return value, so removing them here does not
 * affect filtering — only the primary badge, which now correctly falls
 * through to "Lower" for these rows.
 *
 * NEW: eXL4U4 — same treatment as cOLoL2U1/cOLoL4U3/LoL4U4/eXHiL4U234
 * above: an independent, section-agnostic boolean (r.eXL4U4 from cpr.ts —
 * prev R4 inside today's R3/R4 AND prev S4 inside today's S3/S4). It is
 * NOT returned as the primary label here (same reasoning as above — it can
 * co-occur with any of eX-Higher/eX-Lower/cO-Higher/cO-Lower/Higher/Lower
 * and isn't mutually exclusive with them). Screener.tsx renders it as its
 * own second-row badge and its own Pivot Level filter button, checking
 * r.eXL4U4 directly — independent of activePattern/section, unlike the
 * "eXLo-L4U4-U4" / "eXHi-L4U4-U4" *patterns*, which gate the same boolean
 * behind overlapLower / overlapHigher respectively for their own sections.
 *
 * NEW: eXU4L234 — same treatment again: an independent, section-agnostic
 * boolean (r.eXU4L234 from cpr.ts — prev R4 inside today's R3/R4 AND prev
 * S4 inside today's S1/S2). Not returned as the primary label here for the
 * same reason as eXL4U4/HiL4U4/etc — Screener.tsx renders it as its own
 * second-row badge and its own Pivot Level filter button, checking
 * r.eXU4L234 directly, regardless of activePattern/left-nav section. The
 * "eXU4L234-AU4" *pattern* (Big Below) additionally requires strWideCPR +
 * cprFalling + extra R3/pivot/width conditions on top of this raw flag.
 */
export interface PivotLevelInfo {
  label: "eX-Higher" | "eX-Lower" | "cO-Higher" | "cO-Lower" | "Higher" | "cOLoL2U1" | "cOLoL4U3" | "LoL4U4"| "eXHiL4U234" | "eXL4U4" | "HiL4U4" | "HiL4U34" | "cOHiL2U3" | "cOHiL3U3" | "eXU4L234" | "cOHiL2U4" | "eXL3U3" | "Lower";
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

/**
 * matchesPivotLevelFlag — raw Pivot Level flag check, factored out of the
 * inline pivotLevelFilter block in Screener.tsx's `displayed` filter so
 * other consumers (the Backtest panel's Pivot Level sub-category scans,
 * e.g. "Overlap Above" → "HiL4U34") can reuse the exact same lookups
 * without duplicating the switch. For the six mutually-exclusive primary
 * labels (eX-Higher/eX-Lower/cO-Higher/cO-Lower/Higher/Lower) this falls
 * back to getPivotLevel(r)'s label; for the independent, section-agnostic
 * booleans (cOLoL2U1, cOLoL4U3, LoL4U4, eXHiL4U234, eXL4U4, HiL4U4,
 * HiL4U34, cOHiL2U3, eXU4L234) it reads the raw flag directly — same as
 * Screener.tsx does today.
 */
export function matchesPivotLevelFlag(r: CPRResult, label: string): boolean {
  switch (label) {
    case "cOLoL2U1": return r.cOLoL2U1;
    case "cOLoL4U3": return r.cOLoL4U3;
    case "LoL4U4": return r.LoL4U4;
    case "eXHiL4U234": return r.eXHiL4U234;
    case "eXL4U4": return r.eXL4U4;
    case "HiL4U4": return r.HiL4U4;
    case "HiL4U34": return r.HiL4U34;
    case "cOHiL2U3": return r.cOHiL2U3;
    case "cOHiL3U3": return r.cOHiL3U3;
    case "eXU4L234": return r.eXU4L234;
    case "cOHiL2U4": return r.cOHiL2U4;
    case "eXL3U3": return r.eXL3U3;
    default: return getPivotLevel(r)?.label === label;
  }
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
