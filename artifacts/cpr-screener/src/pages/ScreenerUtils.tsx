import type React from "react";
import {
  classifyCPRPair,
  pickPattern,
  getPatternCategory,
  type CPRLevels,
  type CPRResult,
  type PDHPDLGapCategory,
  type RRSSGapCategory,
  type HLSwitch,
  type SSRRCategory,
  type HHLLCategory,
  type SSLLCategory,
} from "@/lib/cpr";

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
    return { main: `+${pct.toFixed(2)}%`, sub: "> PDH", color: "text-green-400" };
  }
  if (price < pdl) {
    const pct = ((pdl - price) / pdl) * 100;
    return { main: `−${pct.toFixed(2)}%`, sub: "< PDL", color: "text-destructive" };
  }
  // RENAMED: "IN-PDH/PDL" -> "IN-PDHL", moved from `sub` into `main` so it
  // renders with the same font-size/weight/brightness as distanceFromCPR's
  // "IN-CPR" (main-only, text-xs font-medium, no muted opacity-80 "sub"
  // treatment) — same {main, sub, color} shape as distanceFromCPR itself.
  return { main: "IN-PDHL", sub: "", color: "text-yellow-400" };
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
 * Returns the TradingView chart URL for the market scanned by this screener.
 * Binance results use USDⓈ-M perpetual candles, so always request TradingView's
 * perpetual symbol (`BINANCE:<SYMBOL>.P`). This also fixes futures-only listings
 * such as UAIUSDT and IDOLUSDT when older call sites only pass symbol + source.
 */
export type BinanceVenue = "spot" | "futures";

export function getChartUrl(
  symbol: string,
  source: "binance" | "delta",
  _venue?: BinanceVenue,
): string {
  const normalizedSymbol = symbol.trim().toUpperCase().replace(/\.P$/i, "");

  if (source === "delta") {
    // Delta Exchange India symbols on TradingView: DELTAIN: prefix, in.tradingview.com, .p suffix
    // e.g. AAPLXUSD → https://in.tradingview.com/chart/?symbol=DELTAIN:AAPLXUSD.p
    const tvSymbol = encodeURIComponent(`DELTAIN:${normalizedSymbol}.P`);
    return `https://in.tradingview.com/chart/?symbol=${tvSymbol}`;
  }

  const tvSymbol = encodeURIComponent(`BINANCE:${normalizedSymbol}.P`);
  return `https://www.tradingview.com/chart/?symbol=${tvSymbol}`;
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
  return WIDTH_CATEGORIES[WIDTH_CATEGORIES.length - 1] ?? {
    key: "ultra",
    label: "Ultra",
    max: Infinity,
    classes: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    pClasses: "bg-rose-500/10 text-rose-300 border-rose-400/20",
  };
}

/**
 * renderPivotSizeCell — the PIVOT SIZE column's contents: the prev/today
 * width-category badges (pMedium/Medium etc, via getWidthCategory) with
 * the compressionRatio value shown plain between them (no pill/badge/
 * border — just a small colored number, matching the CPR-GAP column's
 * plain "x.xx%" style). Shared by the Screener table (ScreenerTableRow)
 * and BacktestPanel's results tables so the column looks identical
 * everywhere, and rounds compressionRatio to a whole number, capped at
 * "999%" display for anything larger.
 */
export function renderPivotSizeCell(
  prevCPR: { widthPct: number },
  todayCPR: { widthPct: number },
  compressionRatio: number
) {
  const prevCat = getWidthCategory(prevCPR.widthPct);
  const todayCat = getWidthCategory(todayCPR.widthPct);
  return (
    <div className="flex flex-nowrap items-center justify-start gap-2">
      <span
        className={`font-sans text-xs px-1.5 py-0.5 rounded border font-medium flex flex-col items-center leading-tight ${prevCat.pClasses}`}
        title={`Prev day CPR width: ${prevCPR.widthPct.toFixed(4)}%`}
      >
        <span className="text-[10px]">p{prevCat.label}</span>
        <span className="text-[10px] font-mono">{prevCPR.widthPct.toFixed(2)}%</span>
      </span>
      <span className="font-sans text-[10px] font-semibold text-muted-foreground shrink-0">
        {compressionRatio > 999 ? "999%" : `${Math.round(compressionRatio)}%`}
      </span>
      <span
        className={`font-sans text-xs px-1.5 py-0.5 rounded border font-medium flex flex-col items-center leading-tight ${todayCat.classes}`}
        title={`Today's CPR width: ${todayCPR.widthPct.toFixed(4)}%`}
      >
        <span className="text-[10px]">{todayCat.label}</span>
        <span className="text-[10px] font-mono">{todayCPR.widthPct.toFixed(2)}%</span>
      </span>
    </div>
  );
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
        r.cprRising && r.narrowCPR && r.cOL2U3 &&
        (r.todayCPR.r3 > r.prevCPR.r2 && r.todayCPR.r3 < r.prevCPR.r3 && r.todayCPR.s1 > r.prevCPR.pivot) && // Added Condition for nonmatching Charts
        r.prevCPR.widthPct > 0.60 && r.prevCPR.widthPct <= 1.10 &&   // pSmall
        r.todayCPR.widthPct > 0.10 && r.todayCPR.widthPct <= 0.22   // Tiny
      );
    // NEW: T1-U4:6AM — Little Above: today's pivot > prev R1,
    // prev CPR width in (0.10%, 0.22%], today CPR width <= 0.10%
    case "T1-U4:6AM":
      return (
        r.cprRising &&
        r.narrowCPR &&
        r.exL3U2 &&
        r.todayCPR.pivot > r.prevCPR.r1 &&
        r.prevCPR.widthPct > 0.10 && r.prevCPR.widthPct <= 0.22 &&
        r.todayCPR.widthPct <= 0.10
      );
    case "la-allstepup":
      return r.cprRising && r.narrowCPR && r.allupabove && r.allupbelow;
    // NEW: Ss-HiL4U4-FAU4:2AM — Little Above: cprRising + narrowCPR +
    // all step up above & below + today S1 above prev PDL + today R1 above
    // prev PDH + today PDH > today R1. Prev CPR width 0.60%-1.10% (Small),
    // Today CPR width 0.60%-1.10% (Small). Target: Far Above U4 at ~2AM.
    case "Ss-HiL4U4-FAU4:2AM":
      return (
        r.cprRising &&
        r.narrowCPR &&
        r.allupabove &&
        r.allupbelow &&
        r.todayCPR.s1 > r.prevCPR.prevLow &&
        r.todayCPR.r1 > r.prevCPR.prevHigh &&
        r.todayCPR.prevHigh > r.todayCPR.r1 &&
        r.prevCPR.widthPct > 0.60 && r.prevCPR.widthPct <= 1.10 &&
        r.todayCPR.widthPct > 0.60 && r.todayCPR.widthPct <= 1.10
      );
    // NEW: MeMi-eXL4U3-U4:6PM — Little Above: cprRising + narrowCPR +
    // eXL4U3 (prev S4 in today's L4 band, prev R4 in today's U3 band)
    // + today's TC >= prev R1. Prev CPR width 1.10%-2.00% (Medium),
    // Today CPR width 0.22%-0.60% (Mini). Target: U4 at ~6PM.
    case "MeMi-eXL4U3-U4:6PM":
      return (
        r.cprRising &&
        r.narrowCPR &&
        r.eXL4U3 &&
        r.todayCPR.tc >= r.prevCPR.r1 &&
        r.prevCPR.widthPct > 1.10 && r.prevCPR.widthPct <= 2.00 &&
        r.todayCPR.widthPct > 0.22 && r.todayCPR.widthPct <= 0.60
      );
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
      // eXHiU1L3 raw flag was removed from cpr.ts (exact duplicate of
      // eXL3U1); this composite pattern key is kept for any external
      // caller still passing "eXHiU1L3", now pointed at eXL3U1.
      return r.cprRising && r.narrowCPR && r.eXL3U1;
    case "littlebelow":
      return r.cprFalling && r.narrowCPR;
    case "lb-2tiny":
      return r.cprFalling && r.narrowCPR && r.bothTight;
    // NEW: Micro2-ApU4 — Little Below, both CPRs micro-narrow (<=0.10%),
    // all step-down / all up-below stacked, plus prev R4 inside today's R3/R4
    // AND prev S4 inside today's S3/S4 (cOU4L4).
    case "lb-micro2-apu4":
      return (
        r.cprFalling &&
        r.narrowCPR &&
        r.alldownabove &&
        r.allupbelow &&
        r.cOU4L4 &&
        r.prevCPR.widthPct <= 0.10 &&
        r.todayCPR.widthPct <= 0.10
      );
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
    // NEW: L1-cOU1L2-U4:1AM — LittleBelow + cOU1L2 (today's S4 inside prev
    // L2 band, today's R4 inside prev U1 band) + today's R1 above prev
    // CPR's BC + today's R1 below today's PDH + prev CPR width category
    // Large (2%-5%) + today's CPR width category Micro (<=0.10%).
    case "L1-cOU1L2-U4:1AM":
      return (
        r.cprFalling &&
        r.narrowCPR &&
        r.cOU1L2 &&
        r.todayCPR.r1 > r.prevCPR.bc &&
        r.todayCPR.r1 < r.todayCPR.prevHigh &&
        r.prevCPR.widthPct > 2 && r.prevCPR.widthPct <= 5 &&
        r.todayCPR.widthPct <= 0.10
      );
    // NEW: eXU4L3-AU4 — Big Below (structure-bigbelow: cprFalling + strWideCPR):
    // prev R4 between today's R3/R4 AND prev S4 above today's S3, today's
    // CPR width between 0.5% and 2%, prev CPR width < 0.5%. Moved here from
    // LittleCPR Below — placed next to eX-U4L34 under Big Below.
    case "eXU4L3-AU4":
      return (
        r.cprFalling && r.strWideCPR && r.eXU4L3 &&
        r.todayCPR.widthPct > 0.5 && r.todayCPR.widthPct < 2 && r.prevCPR.widthPct < 0.5
      );
      //EXP_U4APU4L4BPL4
    // RENAMED: was "eXL4U4" — this pattern is specific to Overlapping Lower
    // only. Renamed to "eXLo-L4U4-U4" to make that scope explicit and to
    // free up the plain "eXL4U4" name for the new section-independent
    // Pattern badge (see getPatternInfo doc-comment below). The
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
    // NEW: 1S-cOL3U4-FAU4:1AM — Big Above: Pattern cOL3U4 + today's S1 above
    // prev day pivot + prev CPR width <= 0.10 (pMicro/pTiny) + today's CPR
    // width 0.60%-1.10% (Small).
    case "1S-cOL3U4-FAU4:1AM":
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.cOL3U4 &&
        r.todayCPR.s1 > r.prevCPR.pivot &&
        r.prevCPR.widthPct <= 0.10 &&
        r.todayCPR.widthPct > 0.60 && r.todayCPR.widthPct <= 1.10  // small
      );
    // NEW: TS-cOL3U4-AU4R:4PM — Big Above: same setup as 1S-cOHi-FAU4:1AM
    // (Pattern cOL3U4 + today's S1 above prev day pivot + today's CPR
    // width 0.60%-1.10% / Small) but for prev CPR width category Tiny
    // (0.10%-0.22%) instead of pMicro (<=0.10%). Reverse-engineered from a
    // chart showing prev CPR "Tiny (0.149%)" and today's CPR "Small (1.037%)".
    case "TS-cOL3U4-AU4R:4PM":
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.cOL3U4 &&
        r.todayCPR.s1 > r.prevCPR.pivot &&
        r.prevCPR.widthPct > 0.10 && r.prevCPR.widthPct <= 0.22 &&
        r.todayCPR.widthPct > 0.60 && r.todayCPR.widthPct <= 1.10
      );
    case "OBN-LoU4L4-U4":
      return (
        r.overlapLower &&
        r.narrowCPR &&
        r.LoU4L4 &&
        r.compressionRatio > 50
      );
    case "OBW-LoU4L4-L4":
      return (
        r.overlapLower &&
        r.strWideCPR &&
        r.LoU4L4 &&
        r.compressionRatio > 50
      );
    // RENAMED from "Exp-U3>U3": Overlap Below + HHLLAbove (today's PDH AND
    // today's R1 both above prev's R1/PDH) + SSRRBelow (today's S1 AND
    // today's PDL both below prev's S1/PDL). Bullish, entry ~9AM, targets
    // today's own R4 / U4 by ~9PM.
    case "9AM:SSRRBHHLLA-U4:9PM":
      return (r.overlapLower && r.HHLLCategory === "HHLL-A" && r.SSRRCategory === "RRSS-B");
    case "pRRHHLLA":
      return (r.overlapLower && r.RRHHCategory === "RRHH-B" && r.HHLLCategory === "HHLL-B");
    // NEW: 9AM:pRRHHLLA-U4:9PM — Overlap Below + RRHH-B (today's R1 AND
    // today's PDH both below the lower of prev's R1/PDH) + HHLLAbove
    // (today's PDH strictly above prev's PDH AND today's PDL >= prev's
    // PDL) + (today's R1 above prev day's TC) + (today's S2 above prev
    // day's PDH) + (today's S2 above prev day's S2) + (prev day's PDH
    // above today's S1). Bullish, green color family, entry ~9AM, targets
    // today's own U4 by ~9PM.
    case "9AM:pRRHHLLA-U4:9PM":
      return (
        r.overlapLower &&
        r.RRHHCategory === "RRHH-B" &&
        r.HHLLCategory === "HHLL-B" &&
        r.todayCPR.r1 > r.prevCPR.tc &&
        r.prevCPR.prevHigh > r.todayCPR.s1
      );
    // NEW: 2PM:SSLLpRRHHA-ApU4:5PM — Overlap Below + SSLL-AA (today's S1
    // AND today's PDL both above the higher of prev's S1/PDL, full
    // separation) + RRHH-B
    // (today's R1 AND today's PDH both below the lower of prev's R1/PDH)
    // + (prev day's R1 above today's R2 OR today's S3 above prev day's S2).
    // Bullish, entry ~2PM, targets ApU4 (prev day's R4) by ~5PM.
    case "2PM:SSLLpRRHHA-ApU4:5PM":
      return (
        r.overlapLower &&
        r.SSLLCategory === "SSLL-AA" &&
        r.RRHHCategory === "RRHH-B" &&
        (r.prevCPR.r1 > r.todayCPR.r2 || r.todayCPR.s3 > r.prevCPR.s2)
      );
    // NEW: 8AM:SSLLpRRHHA-L4:1PM — same base conditions as
    // "2PM:SSLLpRRHHA-ApU4:5PM" (overlapLower + SSLL-AA + RRHH-B), but
    // with the comparison direction reversed (prev day's R1 below today's
    // R2 OR today's S3 below prev day's S2). Bearish, entry ~8AM, targets
    // today's own L4/S4 by ~1PM. Red color family.
    case "8AM:SSLLpRRHHA-L4:1PM":
      return (
        r.overlapLower &&
        r.SSLLCategory === "SSLL-AA" &&
        r.RRHHCategory === "RRHH-B" &&
        (r.prevCPR.r1 < r.todayCPR.r2 || r.todayCPR.s3 < r.prevCPR.s2)
      );
    case "LBT-PU1>U1PL1>L1":
      return (r.overlapLower && r.lbtJPattern1 && r.bothTight);
    case "inside-cpr":
      return r.InsideCPR;
    // NEW: 8AM:CoLApHA-U4+1:8AM — nested under "Inside CPR" (inside-cpr)
    // in ViewsSidebar's left-nav, same as its "8AM:SRBHHLLA-pU4+1:8AM" /
    // "2PM:pPDHLA-SRA-U4:7PM" / "8AM:pPDHA-SRA-U4+2:2AM" siblings below —
    // but (per backtest.ts's BACKTEST_CATEGORIES) sits directly on the
    // "inside-cpr" category's own subPatternKeys rather than behind a
    // "Pattern" /arrow. Base InsideCPR condition + today's PDL
    // above prev day's S1 ("PDL>pS1") + EITHER today's PDH above prev
    // day's R1 ("PDH>pR1") OR prev day's PDH above today's R1
    // ("pPDH>R1") + today's pivot and today's PDH move the SAME direction
    // relative to prev day's (both up OR both down) — i.e. pivot and PDH
    // aren't drifting in opposite directions — EXCLUDING rows where prev
    // day's own pattern (p-xxx, i.e. getPatternCategory(computePrevPattern
    // (prevCPR, ppCPR))) falls in the "eXLower" or "cOLower" category.
    // Bullish, entry ~8AM, targets pU4 (prev day's R4) by ~8AM the next
    // day. Green color family.
    case "8AM:CoLApHA-U4+1:8AM": {
      const prevCat = getPatternCategory(computePrevPattern(r.prevCPR, r.ppCPR));
      return (
        r.InsideCPR && r.SSLLCategory === "SSLL-AA" &&  r.prevCPR.HLSwitch === "HL-A" && r.todayCPR.HLSwitch === "HL-B" && 
        (r.todayCPR.prevHigh > r.prevCPR.r1 || r.prevCPR.prevHigh > r.todayCPR.r1) &&
        prevCat !== "eXLower" && prevCat !== "cOLower" // exclude prev day's own pattern (p-xxx) falling in eXLower/cOLower
      );
    }
    // NEW: 8AM:SRBHHLLA-pU4+1:8AM — Inside CPR + cOL3U3 + prev CPR width
    // category pLarge (2.00%-5.00%) + today CPR width category Medium
    // (1.10%-2.00%) + prev day's own PDL below prev S1 ("p-PDL<L1") +
    // today's PDH above today's R1 ("PDH>U1") + prev R1 above today R1 +
    // prev S1 above today S1 (today's pivots have contracted inside prev
    // day's) + today's PDH above prev day's PDH + today's PDL above prev
    // day's PDL. Bullish, entry ~8AM, targets pU4 (prev day's R4) by ~8AM
    // the next day.
    case "8AM:SRBHHLLA-pU4+1:8AM":
      return (
        (r.InsideCPR) &&
          (r.cOL3U3 || r.cOU3L3) && 
        r.SSRRCategory === "RRSS-B" && r.HHLLCategory === "HHLL-A"
        //r.prevCPR.widthPct > 2.00 && r.prevCPR.widthPct <= 5.00 &&   // pLarge
        //r.todayCPR.widthPct > 1.10 && r.todayCPR.widthPct <= 2.00 && // Medium
        //r.prevCPR.HLSwitch === "HL-B" && r.todayCPR.HLSwitch === "HL-A" &&       // p-HL-B  // HL-A
      );
    // NEW: 2PM:pPDHLA-SRA-U4:7PM — Inside CPR + cOL4U4 + prev CPR width
    // category pLarge (2.00%-5.00%) + today CPR width category Large
    // (2.00%-5.00%) + prev day's PDH above prev R1 ("p-PDH>U1") + today's
    // PDL below today's S1 ("PDL<L1") + today R1 above prev R1 + today S1
    // above prev S1 (today's pivots stepped up out of prev day's) + prev
    // day's PDH above today's PDH + prev day's PDL above today's PDL.
    // Bullish, entry ~2PM, targets U4 (today's R4) by ~7PM.
    case "2PM:pPDHLA-SRA-U4:7PM":
      return (
        (r.InsideCPR) &&
        r.cOL4U4 &&
        r.prevCPR.widthPct > 2.00 && r.prevCPR.widthPct <= 5.00 &&   // pLarge
        r.todayCPR.widthPct > 2.00 && r.todayCPR.widthPct <= 5.00 && // Large
        r.prevCPR.HLSwitch === "HL-A" && r.todayCPR.HLSwitch === "HL-B" &&            // p-PDH>U1     // PDL<L1
        r.SSRRCategory === "RRSS-A" &&
        r.prevCPR.prevHigh > r.todayCPR.prevHigh &&
        r.prevCPR.prevLow > r.todayCPR.prevLow
      );
    // NEW: 8AM:pPDHA-SRA-U4+2:2AM — Inside CPR + raw eXL4U4 flag (prev R4
    // inside today's R3/R4, prev S4 inside today's S3/S4) + today's
    // SSRRAbove (today's R1 above prev R1 AND today's S1 held at/above prev
    // S1) + prev day's PDH above today's PDH ("prev prevHigh > today
    // prevHigh") + prev day's PDL above today's PDL ("prev prevLow > today
    // prevLow") + IF today's own PDH is below today's own R1 (HLSwitch ===
    // "HL-B"),
    // additionally require BOTH prev day's PDH above today's R1 ("p-PDHA",
    // i.e. prev's high still cleared today's R1 even though today hasn't
    // broken out yet) AND today's PDL above prev day's S1. Bullish, entry
    // ~8AM, targets today's U4 two days out (+2), by ~2AM. Green color
    // family.
    case "8AM:pPDHA-SRA-U4+2:2AM":
      return (
        (r.InsideCPR) &&
        r.eXL4U4 &&
        r.SSRRCategory === "RRSS-A" &&
        r.prevCPR.prevHigh > r.todayCPR.prevHigh &&
        r.prevCPR.prevLow > r.todayCPR.prevLow &&
        (r.todayCPR.HLSwitch !== "HL-B" ||
          (r.prevCPR.prevHigh > r.todayCPR.r1 && r.todayCPR.prevLow > r.prevCPR.s1))
      );
    // NEW: SMi-L1pU1>-APU4:11PM — Inside CPR + L1pU1Above (from cpr.ts)
    // + compression ratio >= 30. Target ApU4 by 11PM.
    // NEW: pCPR>U1 CPR>pL1 — prev Pivot inside today's R1/R2 band and
    // today's BC inside prev's S1/BC band.
    // NEW: CPR 1ABOVE — today's TC inside prev's R1/R2 band AND today's S1
    // inside prev's BC/R1 band. Sits above "PREVCPR 1ABOVE" in the left-nav.
    case "cpr-1-above":
      return r.CPRs1Above;
    // 9AM:MegL-U4+1:3PM — CPR 1ABOVE + previous pair eXU1L1 + current pair
    // eXL4U2 + pMega/Large widths + both PDLs below their respective L1s.
    case "9AM:MegL-U4+1:3PM":
      return (
        r.CPRs1Above &&
        computePrevPattern(r.prevCPR, r.ppCPR) === "eXU1L1" &&
        r.eXL4U2 &&
        r.prevCPR.widthPct > 5.00 && r.prevCPR.widthPct <= 10.00 &&
        r.todayCPR.widthPct > 2.00 && r.todayCPR.widthPct <= 5.00 &&
        r.prevCPR.prevLow < r.prevCPR.s1 &&
        r.todayCPR.prevLow < r.todayCPR.s1
      );
    // NEW: 7PM:MoMi->U4:2AM — CPR 1ABOVE + the PREVIOUS day's own pivot
    // sub-label (prevCPR vs ppCPR) being cOL1U1 ("p-cOL1U1" badge) +
    // today's Pattern eXL4U2 + prev CPR width category pMicro (<=0.10%)
    // + today CPR width category Mini (0.22%-0.60%) + both prev and
    // today PDL below their respective L1s (S1).
    case "7PM:MoMi->U4:2AM":
      return (
        r.CPRs1Above &&
        computePrevPattern(r.prevCPR, r.ppCPR) === "cOL1U1" &&
        r.eXL4U2 &&
        r.prevCPR.widthPct <= 0.10 &&                                // pMicro
        r.todayCPR.widthPct > 0.22 && r.todayCPR.widthPct <= 0.60 && // Mini
        r.prevCPR.prevLow < r.prevCPR.s1 &&                          // p-PDL<L1
        r.todayCPR.prevLow < r.todayCPR.s1 &&                        // PDL<L1
        r.todayCPR.prevLow > r.prevCPR.pivot
      );
    case "7PM:MoMi-<L4:2AM":
    return (
      r.CPRs1Above &&
      computePrevPattern(r.prevCPR, r.ppCPR) === "cOL1U1" &&
      r.eXL4U2 &&
      r.prevCPR.widthPct <= 0.10 &&                                // pMicro
      r.todayCPR.widthPct > 0.22 && r.todayCPR.widthPct <= 0.60 && // Mini
      r.prevCPR.prevLow < r.prevCPR.s1 &&                          // p-PDL<L1
      r.todayCPR.prevLow < r.todayCPR.s1  &&                       // PDL<L1
      r.todayCPR.prevLow < r.prevCPR.pivot
    );
    // NEW: 6PM:APHS1A-FAU4:9PM — CPR 1ABOVE + Pattern eXL4U2 + the
    // PREVIOUS day's own pivot sub-label (prevCPR vs ppCPR) being eXL4U3
    // ("p-eXL4U3" badge) + today's BC above prev day's own PDH
    // (todayCPR.bc > prevCPR.prevHigh) + today's S1 above prev day's TC
    // (todayCPR.s1 > prevCPR.tc). Bullish, entry ~6PM, targets Far Above
    // U4 by ~9PM. Green color family, same as its 9AM:MegL-U4+1:3PM
    // sibling.
    case "6PM:APHS1A-FAU4:9PM":
      return (
        r.CPRs1Above && r.eXL4U2 &&
        r.todayCPR.bc > r.prevCPR.prevHigh && r.todayCPR.s1 > r.prevCPR.tc &&
        (computePrevPattern(r.prevCPR, r.ppCPR) === "eXL3U3" || //Target next day
        computePrevPattern(r.prevCPR, r.ppCPR) === "LoU4L4" ||
        (computePrevPattern(r.prevCPR, r.ppCPR) === "eXL4U3" &&
        r.prevCPR.pivot > r.todayCPR.prevLow && r.todayCPR.s3 > r.prevCPR.s3 ))
      );
    // NEW: 9AM:pPALPApH-FAU4:2PM — sub-filter under "CPR 1ABOVE" → Pattern
    // "HiL3U4" (today's S4 in prev's S3/S2 band L3, prev's R4 in today's
    // R3/R4 band U4). Base CPRs1Above condition PLUS the raw HiL3U4 flag
    // PLUS prev day's Pivot above today's PDL ("pPivot > PDL") PLUS
    // today's own Pivot above today's PDH ("Pivot > PAH"). Bullish, entry
    // ~9AM, targets Far Above U4 by ~2PM. Green color family, same as its
    // 9AM:MegL-U4+1:3PM / 6PM:APHS1A-FAU4:9PM siblings.
    case "9AM:pPALPApH-FAU4:2PM":
      return (
        r.CPRs1Above &&
        r.HiL3U4 &&
        r.prevCPR.pivot > r.todayCPR.prevLow &&
        r.todayCPR.pivot > r.prevCPR.prevHigh
      );
    case "pcpr-u1-cpr-pl1":
      return r.pCPR1Above;
    // NEW: BC>pPDL-U3:5AM — sub-filter under "PREVCPR 1ABOVE": base pCPR1Above
    // condition PLUS today's BC above prev day's PDH (prevCPR.prevHigh,
    // i.e. the actual candle high of the day before prev day).
    case "BC>pPDL-U3:5AM":
      return r.pCPR1Above && r.cOU3L4  && r.todayCPR.bc > r.prevCPR.prevLow && r.prevCPR.bc > r.todayCPR.r1 && r.todayCPR.HLSwitch === "HL-A" && r.prevCPR.HLSwitch === "HL-A";
    // NEW: PDH>pTC-U4:5AM — sub-filter under "PREVCPR 1ABOVE" → "LoU3L3"
    // Pattern: base pCPR1Above condition PLUS the parent's raw
    // LoU3L3 flag PLUS today's PDH (todayCPR.prevHigh) above prev day's TC
    // (prevCPR.tc) — today already traded above the top of prev's CPR.
    // Also requires a specific width-tier combo — (prev CPR Mini AND today
    // CPR Small) OR (prev CPR Small AND today CPR Large). Mini: >0.22%–≤0.60%.
    // Small: >0.60%–≤1.10%. Large: >2.00%–≤5.00%.
    case "PDH>pTC-U4:5AM": {
      const pMini  = r.prevCPR.widthPct  > 0.22 && r.prevCPR.widthPct  <= 0.60;
      const small  = r.todayCPR.widthPct > 0.60 && r.todayCPR.widthPct <= 1.10;
      const pSmall = r.prevCPR.widthPct  > 0.60 && r.prevCPR.widthPct  <= 1.10;
      const large  = r.todayCPR.widthPct > 2.00 && r.todayCPR.widthPct <= 5.00;
      return r.pCPR1Above && r.LoU3L3 && r.todayCPR.prevHigh > r.prevCPR.tc &&
        ((pMini && small) || (pSmall && large));
    }
    // NEW: 11AM:pCPR1AHi-FApU4:1PM — sub-filter under "PREVCPR 1ABOVE" →
    // "LoU3L4" Pattern: base pCPR1Above condition PLUS the
    // parent's raw LoU3L4 flag PLUS HHLLBelow (today's PDH at/below prev
    // day's PDH AND today's PDL below prev day's PDL) PLUS prev day's own
    // PDH below prev day's own R1 (p-HL-B, prevCPR.HLSwitch === "HL-B") PLUS
    // today's PDH above today's own R1 (HL-A, todayCPR.HLSwitch === "HL-A") PLUS
    // today's R1 at/above prev day's BC. Bullish, targets Far Above pU4
    // (prev day's R4) by ~1PM. Green color family.
    case "11AM:pCPR1AHi-FApU4:1PM":
      return r.pCPR1Above && r.LoU3L4 && r.HHLLCategory === "HHLL-B" &&
        r.prevCPR.HLSwitch === "HL-B" && r.todayCPR.HLSwitch === "HL-A" &&
        r.todayCPR.r1 > r.prevCPR.bc;
    case "l1pu1-above":
      return r.L1pU1Above ; 
    case "SMi-L1pU1>-APU4:11PM": {
      return r.L1pU1Above && r.prevCPR.HLSwitch === "HL-A" && !r.outCPR && r.compressionRatio >= 30;
    }
    // NEW: S0-L1pU1>-AU4:7PM — second sub-pattern under "L1pU1 Above".
    // Same L1pU1Above base as SMi-L1pU1>-APU4:11PM, but a 1-Line CPR
    // (compressionRatio == 0) with today's R1 below prev day's TC.
    // Target AU4 (prev day's R4) by ~7PM.
    case "S0-L1pU1>-AU4:7PM": {
      return (r.L1pU1Above && r.prevCPR.HLSwitch === "HL-A" && (r.todayCPR.HLSwitch === "HL-A" || r.todayCPR.HLSwitch === "HL=" )
                    && !r.outCPR && (r.todayCPR.r1 < r.prevCPR.tc) && r.compressionRatio == 0); // 1 Line CPR ,  R1< PCPR.tc
    }
     case "T0-L1pU1>-BPL4:5AM": {
      return (r.L1pU1Above && r.prevCPR.HLSwitch === "HL-A" && r.todayCPR.HLSwitch === "HL-B"
              && !r.outCPR && r.compressionRatio > 300 && r.prevCPR.tc < r.todayCPR.s1) || //pTiny, Mini, pcpr < S1
              (r.L1pU1Above && r.prevCPR.HLSwitch === "HL-A" && (r.todayCPR.HLSwitch === "HL-A" || r.todayCPR.HLSwitch === "HL=" ) 
              && !r.outCPR && (r.todayCPR.tc < r.prevCPR.tc) && r.compressionRatio == 0); // 1 Line CPR , - todayCPR.tc < PCPR.tc
    }
    case "outside-cpr":
      return r.outCPR;
    case "outside-cpr-compressed":
      return r.outCPR && r.todayCPR.r4 < r.prevCPR.r4 && r.todayCPR.s4 > r.prevCPR.s4;
    // NEW: eXHrL3U3-AU4 — Outside CPR + prev S4 between today's S3/S4 AND
    // prev R4 between today's R2/R3, today's CPR width between 0.5% and 2%,
    // prev CPR width < 0.5% (tight prior day, today's range expanded outside it)
    case "eXHrL3U3-AU4":
      return (
        r.outCPR &&
        r.prevCPR.s4 < r.todayCPR.s3 &&
        r.prevCPR.s4 > r.todayCPR.s4 &&
        r.prevCPR.r4 > r.todayCPR.r2 &&
        r.prevCPR.r4 < r.todayCPR.r3 &&
        r.todayCPR.widthPct > 0.5 && r.todayCPR.widthPct < 2 &&
        r.prevCPR.widthPct < 0.5
      );
    case "overlapping-higher":
      return r.overlapHigher;
    // NEW: LMe-eXL2U2-L4:10PM — Overlap Above + eXL2U2 pivot band,
    // compression ratio 60–90 (Little–Medium bracket). Target L4, ~10PM.
    case "LMe-eXL2U2-L4:10PM":
      return (
        r.overlapHigher &&
        r.eXL2U2 &&
        r.compressionRatio >= 60 &&
        r.compressionRatio <= 90
      );
    // NEW: 7AM:MiMi-pU4:11PM — Overlap Above + today's cOL4U4 (prev R4 inside
    // today's R3/R4, prev S4 inside today's S3/S4 direction-agnostic cO
    // variant) + the PREVIOUS day's own pivot sub-label (prevCPR vs ppCPR)
    // being HiL4U4 ("p-HiL4U4" badge) + prev CPR width category pMini
    // (0.22%-0.60%) + today CPR width category Mini (0.22%-0.60%) +
    // prev day's PDH above prev R1 + today's PDH above today's R1.
    // Bullish, target U4 (today's R4) by ~11PM IST.
    case "7AM:MiMi-pU4:11PM":
      return (
        r.overlapHigher &&
        r.cOL4U4 &&
        computePrevPattern(r.prevCPR, r.ppCPR) === "HiL4U4" &&
        r.prevCPR.widthPct > 0.22 && r.prevCPR.widthPct <= 0.60 &&   // pMini
        r.todayCPR.widthPct > 0.22 && r.todayCPR.widthPct <= 0.60 && // Mini
        r.prevCPR.HLSwitch === "HL-A" &&
        r.todayCPR.HLSwitch === "HL-A"
      );
    case "cOL3U3-pL4":
      return r.overlapHigher && r.cOL3U3 && r.prevCPR.widthPct <= 0.10 &&   // pMicro
              r.todayCPR.widthPct > 0.60 && r.todayCPR.widthPct <= 1.10;   // Small;
    // NEW: 6PM:LaLa->U4:2AM — Overlap Above + the PREVIOUS day's own pivot
    // sub-label (prevCPR vs ppCPR) being cOU3L3 ("p-cOU3L3" badge) + raw
    // eXL4U4 flag (prev R4 inside today's R3/R4 AND prev S4 inside today's
    // S3/S4) + prev CPR width category pLarge (2.00%-5.00%) + today CPR
    // width category Large (2.00%-5.00%) + prev day's own PDL below prev
    // day's S1 ("p-PDL<L1") + today's PDH above today's R1 ("PDH>U1") +
    // today's PDH above prev day's R1 + today's PDL above prev day's S1.
    // Bullish, entry ~6PM, target U4 (today's R4) by ~2AM.
    case "6PM:LaLa->U4:2AM":
      return (
        r.overlapHigher &&
        computePrevPattern(r.prevCPR, r.ppCPR) === "cOU3L3" &&
        r.eXL4U4 &&
        r.prevCPR.widthPct > 2.00 && r.prevCPR.widthPct <= 5.00 &&   // pLarge
        r.todayCPR.widthPct > 2.00 && r.todayCPR.widthPct <= 5.00 && // Large
        r.prevCPR.prevLow < r.prevCPR.s1 &&                          // p-PDL<L1
        r.todayCPR.HLSwitch === "HL-A" &&                                      // PDH>U1
        r.todayCPR.prevHigh > r.prevCPR.r1 &&
        r.todayCPR.prevLow > r.prevCPR.s1
      );
    case  "LAT-PU12CU23":
      return r.overlapHigher && r.PU12CU23 && r.PL12CL23 && r.todayCPR.prevHigh > r.prevCPR.prevHigh;
    case "overlapping-lower":
      return r.overlapLower;
    case "lower-bullish":
      return (r.cprFalling && r.cprNarrowing && r.prevCPR.r1  > r.todayCPR.r4);
    case "Price-AbovePDH":
      return (r.currentPrice > r.todayCPR.prevHigh);
    case "Price-BelowPDL":
      return (r.currentPrice < r.todayCPR.prevLow);
    case "structure-bigabove":
      return r.cprRising && r.strWideCPR && !(r.todayCPR.r1 > r.prevCPR.r4);
    // RENAMED: was "bigabove-pl34cl4-u3>pu4" -> "9AM:SSRRHHLLA-U4:11PM"
    case "9AM:SSRRHHLLA-U4:11PM":
    return (r.cprRising && r.strWideCPR && 
            r.SSRRCategory === "RRSS-A" && r.HHLLCategory === "HHLL-A" && r.todayCPR.HLSwitch === "HL-A");
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
    // NEW: 9AM:APHS1A-FAU4:4AM — U1>pU4 sub-pattern.
    // Condition: Big CPR + CPR Above (cprRising + strWideCPR) + today R1 above
    // prev R4 (parent U1>pU4) + Pattern eXL3U1 + compressionRatio > 300.
    // Legend labels: Pattern eXL3U1, PCPR Small, CPR Large. Target FAU4 @ 3PM.
    case "9AM:APHS1A-FAU4:4AM":
      return (
        r.cprRising && r.strWideCPR && r.todayCPR.r1 > r.prevCPR.r4 &&   // U1 > pU4
        r.eXL3TC &&
        r.todayCPR.bc > r.prevCPR.prevHigh &&
        r.todayCPR.s1 > r.prevCPR.tc
      );
    // NEW: 6AM:pX-APHS1A-pL4:4AM — U1>pU4 sub-pattern, same "eXL3U1" Pattern
    //  and identical base condition as 9AM:APHS1A-FAU4:4AM
    // (cprRising + strWideCPR + today R1 above prev R4 + eXL3TC + today's
    // BC above prev day's PDH + today's S1 above prev day's TC), PLUS one
    // extra check: the PREVIOUS day's own pivot sub-label (prevCPR vs
    // ppCPR) is eXL4U3 ("p-eXL4U3" badge). Bearish, targets pL4 (prev
    // day's S4) by ~4AM. Red color family.
    case "6AM:pX-APHS1A-pL4:4AM":
      return (
        r.cprRising && r.strWideCPR && r.todayCPR.r1 > r.prevCPR.r4 &&   // U1 > pU4
        r.eXL3TC &&
        r.todayCPR.bc > r.prevCPR.prevHigh &&
        r.todayCPR.s1 > r.prevCPR.tc &&
        computePrevPattern(r.prevCPR, r.ppCPR) === "eXL4U3"
      );
    // NEW: 8AM:APHS1A-FAU4:4AM — U1>pU4 sub-pattern, nested under the same
    // "eXL3U1" Pattern as 9AM:APHS1A-FAU4:4AM.
    // Condition: Big CPR + CPR Above (cprRising + strWideCPR) + today R1
    // above prev R4 (parent U1>pU4) + Pattern eXL3U1 + today's BC above
    // prev day's PDH (todayCPR.bc > prevCPR.prevHigh) + today's S1 above
    // prev day's TC (todayCPR.s1 > prevCPR.tc). Bullish, targets Far
    // Above U4 (today's R4) by ~4AM. Green color family.
    case "8AM:APHS1A-FAU4:4AM":
      return (
       r.cprRising && r.strWideCPR && r.todayCPR.r1 > r.prevCPR.r4 &&   // U1 > pU4
        r.eXL3U1 &&
        r.todayCPR.bc > r.prevCPR.prevHigh &&
        r.todayCPR.s1 > r.prevCPR.tc
      );
    // NEW: TiMe-eXL3TC-AU4:2PM — U1>pU4 sub-pattern (moved from Big Above).
    // Condition: Big CPR + CPR Above (cprRising + strWideCPR) + today R1
    // above prev R4 (parent U1>pU4) + Pattern eXL3TC (prev's S4 inside
    // today's S3/S2 band (L3), prev's R4 inside today's Pivot/TC band
    // (TC)) + prev CPR width category Tiny (0.10%-0.22%) + today's CPR
    // width category Mega (5.00%-10.00%). Reverse-engineered from a chart
    // showing prev CPR "Tiny (0.21%)" and today's CPR "Mega (5.081%)" with
    // price trading well above today's R4. Target AU4 (prev day's R4) by
    // ~2PM.
    case "TiMe-eXL3TC-AU4:2PM":
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.todayCPR.r1 > r.prevCPR.r4 &&
        r.eXL3TC &&
        r.prevCPR.widthPct > 0.10 && r.prevCPR.widthPct <= 0.22 &&   // Tiny
        r.todayCPR.widthPct > 5.00 && r.todayCPR.widthPct <= 10.00   // Mega
      );
    // NEW: SMg-exHiL2L1-U4:3AM — U1>pU4 sub-pattern.
    // Condition: parent U1>pU4 (cprRising + strWideCPR + today R1 > prev R4)
    // + Pattern eXHiL2L1 (prev's R4 and prev's S4 both inside today's S2/S1
    // band, with today's PDL above prev's Pivot) + prev day's own CPR
    // sub-label (prevCPR vs ppCPR) falling in the "Compressed" category —
    // i.e. getPatternCategory(computePrevPattern(prev, pp)) === "cOHigher"
    // || "cOLower" (the former single "Compressed" category was split into
    // cOHigher/cOLower in cpr.ts; this check now matches either half).
    // Target U4 (today's R4) @ 3AM.
    case "SMg-exHiL2L1-U4:3AM": {
      const prevCat = getPatternCategory(computePrevPattern(r.prevCPR, r.ppCPR));
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.todayCPR.r1 > r.prevCPR.r4 &&
        r.eXHiL2L1 &&
        (prevCat === "cOHigher" || prevCat === "cOLower")
      );
    }
    // NEW: 6AM:MegMeg-L3:8PM — U1>pU4 sub-pattern, nested under the
    // "eXL4U1" Pattern. Condition: Big CPR + CPR Above
    // (cprRising + strWideCPR) + today R1 above prev R4 (parent U1>pU4) +
    // Pattern eXL4U1 + prev CPR width category Mega (5.00%-10.00%,
    // pMega) + today's CPR width category Mega (5.00%-10.00%). Bearish,
    // targets L3 (today's S3) by ~8PM. Red color family.
    case "6AM:MegMeg-L3:8PM":
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.todayCPR.r1 > r.prevCPR.r4 &&
        r.eXL4U1 &&
        r.prevCPR.widthPct > 5.00 && r.prevCPR.widthPct <= 10.00 &&   // pMega
        r.todayCPR.widthPct > 5.00 && r.todayCPR.widthPct <= 10.00    // Mega
      );
    case "HAThin-U1>PU4":
      return (r.cprRising && r.strWideCPR && r.bothTight && r.todayCPR.r1 > r.prevCPR.r4);
    // NEW: hR-HAL — BigCPR Above, top-level toggle next to Show All.
    // WideAbove (cprRising + strWideCPR) + Pattern: Higher (srHigher) +
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
    // NEW: eXL4U2-U4:4AM — BigCPR Above, placed next to HA55-HrL4U34-FAU4.
    // Logic: cprRising + strWideCPR + Pattern eXL4U2 + today's S1 above
    // prev day's TC + today's BC above prev day's R1 + compressionRatio >= 300.
    case "eXL4U2-U4:4AM":
      return (
        r.cprRising &&
        r.strWideCPR &&
        r.eXL4U2 &&
        r.todayCPR.s1 > r.prevCPR.tc &&
        r.todayCPR.bc > r.prevCPR.r1 &&
        r.compressionRatio >= 300
      );
    // NEW: TiMi-cOL2U2-pL4:5AM — BigCPR Above sub-pattern, nested under the
    // "cOL2U2" Pattern. Base structure-bigabove condition
    // (cprRising + strWideCPR + !(today R1 > prev R4)) PLUS: today's raw
    // cOL2U2 flag, today's PDH below today's R1, prev CPR width category
    // Tiny (0.10%-0.22%), today CPR width category Mini (0.22%-0.60%), and
    // the PREVIOUS day's own pivot sub-label (prevCPR vs ppCPR) being
    // cOL4U4 — i.e. the "p-cOL4U4" badge shown by renderPrevPatternBadge in
    // ScreenerTableRow.tsx. Bearish, targets PL4 (prev day's S4) by ~5AM.
    case "TiMi-cOL2U2-pL4:5AM":
      return (
        r.cprRising &&
        r.strWideCPR &&
        !(r.todayCPR.r1 > r.prevCPR.r4) &&
        r.cOL2U2 &&
        r.todayCPR.prevHigh < r.todayCPR.r1 &&
        r.prevCPR.widthPct > 0.10 && r.prevCPR.widthPct <= 0.22 &&    // pTiny
        r.todayCPR.widthPct > 0.22 && r.todayCPR.widthPct <= 0.60 &&  // Mini
        computePrevPattern(r.prevCPR, r.ppCPR) === "cOL4U4"
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
    // NEW: ss-eXU4L1-U4:10PM — L1<pL4 sub-filter.
    // cprFalling + strWideCPR + prevCPR.HLSwitch === "HL-A" + todayCPR.HLSwitch === "HL-A" +
    // eXU4L1 (prev R4 inside today R3/R4 AND prev S4 inside today BC/S1)
    // + prev CPR's BC above today's R1. Target U4 by ~10PM IST.
    case "ss-eXU4L1-U4:10PM":
      return (
        r.cprFalling && r.strWideCPR && r.prevCPR.HLSwitch === "HL-A" && r.todayCPR.HLSwitch === "HL-A" &&
        r.eXU4L1 && r.prevCPR.bc >= r.todayCPR.prevHigh && r.prevCPR.s2 >= r.todayCPR.tc &&
        r.prevCPR.widthPct > 0.60 && r.prevCPR.widthPct <= 1.10 && //pSmall
        r.todayCPR.widthPct > 0.60 && r.todayCPR.widthPct <= 1.10 //Small
      );
    // Standalone top-level category: same condition as L1<pL4
    case "l1-lt-pl4":
      return (
        r.cprFalling &&
        r.strWideCPR &&
        r.todayCPR.s1 < r.prevCPR.s4
      );
    // NEW: eXU4L2-AU4 — Big Below (structure-bigbelow: cprFalling +
    // strWideCPR) + Pattern: eXU4L2 (prev R4 inside today's R3/R4 AND
    // prev S4 inside today's S1/S2) + prev day's R3 above today's R3 + either
    // today's R1 or prev day's S1 sits between prev day's Pivot and today's
    // Pivot + prev CPR width category pSmall (0.6%-1.1%) + today's CPR width
    // between 1% and 2%.
    case "eXU4L2-AU4": {
      const pivotLow = Math.min(r.prevCPR.pivot, r.todayCPR.pivot);
      const pivotHigh = Math.max(r.prevCPR.pivot, r.todayCPR.pivot);
      const r1BetweenPivots = r.todayCPR.r1 >= pivotLow && r.todayCPR.r1 <= pivotHigh;
      const pS1BetweenPivots = r.prevCPR.s1 >= pivotLow && r.prevCPR.s1 <= pivotHigh;
      return (
        r.cprFalling &&
        r.strWideCPR &&
        r.eXU4L2 &&
        r.prevCPR.r3 > r.todayCPR.r3 &&
        (r1BetweenPivots || pS1BetweenPivots) &&
        r.prevCPR.widthPct >= 0.6 && r.prevCPR.widthPct <= 1.1 &&
        r.todayCPR.widthPct >= 1 && r.todayCPR.widthPct <= 2
      );
    }
    // NEW: 1T-cOU4L4-ApU4:3PM — Big Below (cprFalling + strWideCPR) +
    // cOU4L4 Pattern + prev R1 between today's R1/R2 + today's S1
    // between prev day's S1/S2 + prev day PDH above prev R1 + prev CPR
    // width <= 0.10% (pMicro) + today CPR width 0.10%-0.22% (Tiny).
    case "1T-cOU4L4-ApU4:3PM":
      return (
        r.cprFalling &&
        r.strWideCPR &&
        r.cOU4L4 &&
        r.prevCPR.r1 >= r.todayCPR.r1 && r.prevCPR.r1 <= r.todayCPR.r2 &&
        r.todayCPR.s1 <= r.prevCPR.s1 && r.todayCPR.s1 >= r.prevCPR.s2 &&
        r.prevCPR.prevHigh > r.prevCPR.r1 &&
        r.prevCPR.widthPct <= 0.10 &&
        r.todayCPR.widthPct > 0.10 && r.todayCPR.widthPct <= 0.22
      );
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
    // NEW: TOP 15 GAINERS / TOP 15 LOSERS — these categories aren't
    // CPR-shape filters, they're a ranking over the whole symbol universe
    // by day-over-day % change (CategoryScanRow.changePct). Every symbol
    // passes the base condition here; BacktestPanel sorts the resulting
    // CategoryScanRow list by changePct and keeps only the top 15 in each
    // direction.
    case "top15gainers":
    case "top15losers":
      return true;
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
    { key: "T1-U4:6AM", direction: "up" },
    { key: "Ss-HiL4U4-FAU4:2AM", direction: "up" },
    { key: "MeMi-eXL4U3-U4:6PM", direction: "up" },
  ],
  littlebelow: [
    { key: "lb-micro2-apu4", direction: "down" },
    { key: "lb-allstepdown", direction: "down" },
    { key: "lb-cmprss-l4>3-u4<2", direction: "up" },
    { key: "lb-c-l34c4/u23c4", direction: "down" },
    { key: "lbE11-cOLoL3U2-PU4", direction: "up" },
    { key: "co2-l2u2", direction: "up" },
  ],
  "overlapping-higher": [
    { key: "eXHi-L4U4-U4",  direction: "up" },
    { key: "cOL3U3-pL4",  direction: "down" },
    { key: "LMe-eXL2U2-L4:10PM", direction: "down" },
    { key: "7AM:MiMi-pU4:11PM", direction: "up" },
    { key: "6PM:LaLa->U4:2AM", direction: "up" },
  ],
  "overlapping-lower": [
    { key: "eXLo-L4U4-U4", direction: "up" },
    { key: "9AM:SSRRBHHLLA-U4:9PM", direction: "up" },
    { key: "9AM:pRRHHLLA-U4:9PM", direction: "up" },
    { key: "OBN-LoU4L4-U4", direction: "up" },
    { key: "OBW-LoU4L4-L4", direction: "up" },
    { key: "2PM:SSLLpRRHHA-ApU4:5PM", direction: "up" },
    { key: "8AM:SSLLpRRHHA-L4:1PM", direction: "down" },
  ],
  "pcpr-u1-cpr-pl1": [
    { key: "BC>pPDL-U3:5AM", direction: "up" },
    { key: "PDH>pTC-U4:5AM", direction: "up" },
    // FIX: "11AM:pCPR1AHi-FApU4:1PM" (nested under the "LoU3L4" Pattern
    // ) was missing here, so rows matching it never got the
    // per-row green direction dot even though the Views button itself
    // filtered correctly. Bullish → "up".
    { key: "11AM:pCPR1AHi-FApU4:1PM", direction: "up" },
    // NEW: "cOU2L4" Pattern (arrow), nested under "PCPR
    // 1ABOVE" in backtest.ts. Bullish (Compressed, same pCPR1Above base
    // condition) → "up".
    { key: "cOU2L4", direction: "up" },
  ],
  "cpr-1-above": [
    { key: "9AM:MegL-U4+1:3PM", direction: "up" },
    { key: "7PM:MoMi->U4:2AM", direction: "up" },
    { key: "7PM:MoMi-<L4:2AM", direction: "down" },
    { key: "6PM:APHS1A-FAU4:9PM", direction: "up" },
  ],
  "l1pu1-above": [
    { key: "SMi-L1pU1>-APU4:11PM", direction: "up" },
    { key: "S0-L1pU1>-AU4:7PM", direction: "up" },
    { key: "T0-L1pU1>-BPL4:5AM", direction: "down" },
  ],
  "inside-cpr": [
    { key: "8AM:CoLApHA-U4+1:8AM", direction: "up" },
    { key: "8AM:SRBHHLLA-pU4+1:8AM", direction: "up" },
    { key: "2PM:pPDHLA-SRA-U4:7PM", direction: "up" },
    { key: "8AM:pPDHA-SRA-U4+2:2AM", direction: "up" },
  ],
  "outside-cpr": [
    { key: "outside-cpr-compressed", direction: "up" },
    { key: "eXHrL3U3-AU4", direction: "up" },
  ],
  "structure-bigabove": [
    { key: "9AM:SSRRHHLLA-U4:11PM", direction: "up" },
    { key: "bacomp-l3>pl1/u3>pu1", direction: "up" },
    { key: "hR-HAL", direction: "up" },
    { key: "HA55-HrL4U34-FAU4", direction: "up" },
    { key: "eXL4U2-U4:4AM", direction: "up" },
    { key: "1T-HiL4U4-FAU4", direction: "up" },
    { key: "1S-cOL3U4-FAU4:1AM", direction: "up" },
    { key: "TS-cOL3U4-AU4R:4PM", direction: "up" },
    { key: "TiMi-cOL2U2-pL4:5AM", direction: "down" },
  ],
  "u1-gt-pu4": [
    { key: "9AM:APHS1A-FAU4:4AM", direction: "up" },
    // FIX: "8AM:APHS1A-FAU4:4AM" (nested under the same "eXL3U1" Pattern
    //  as 9AM:APHS1A-FAU4:4AM above) was missing here, so
    // rows matching it never got the per-row green direction dot even
    // though the Views button itself filtered correctly. Bullish → "up".
    { key: "8AM:APHS1A-FAU4:4AM", direction: "up" },
    { key: "6AM:pX-APHS1A-pL4:4AM", direction: "down" },
    { key: "TiMe-eXL3TC-AU4:2PM", direction: "up" },
    { key: "SMg-exHiL2L1-U4:3AM", direction: "up" },
    // NEW: "6AM:MegMeg-L3:8PM" (nested under the new "eXL4U1" Pattern
    // ). Bearish → "down".
    { key: "6AM:MegMeg-L3:8PM", direction: "down" },
  ],
  "structure-bigbelow": [
    { key: "bigbelow-pmini-pl3", direction: "up" },
    { key: "eX-U4L34", direction: "down" },
    { key: "eXU4L3-AU4", direction: "down" },
    { key: "eXU4L2-AU4", direction: "down" },
    { key: "1T-cOU4L4-ApU4:3PM", direction: "down" },
  ],
  // FIX: "l1-lt-pl4" was left as an empty array while the comment below
  // (for "ss-eXU4L1-U4:10PM") described it as belonging here — the actual
  // entry was never added, so every row matching that pattern showed no
  // per-row direction dot even though the Views button filtered
  // correctly. Bullish sweep from a deep-below setup back up to U4 by
  // ~10PM → "up".
  "l1-lt-pl4": [
    { key: "ss-eXU4L1-U4:10PM", direction: "up" },
  ],
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
 * Pattern — classifies today's CPR range relative to yesterday's using
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
 * Higher variant in cpr.ts). getPatternInfo here just reads those flags in
 * order — no re-derivation, no ties, no null/unclassified rows.
 *
 * FIX (duplicate badge bug): cOU1L2 / cOU3L4 / LoU4L4 are intentionally
 * NOT checked here anymore. They're independent booleans (not mutually
 * exclusive sub-buckets of "Lower" the way eX-Higher/eX-Lower or
 * cO-Higher/cO-Lower are) and Screener.tsx already renders them as their
 * OWN separate second-row badges alongside the primary Pattern badge.
 * Having getPatternInfo() also return them as the PRIMARY label caused the
 * same badge (e.g. "LoU4L4") to show twice on a row — once as the primary
 * badge instead of "Lower", and once again in the second row. The pivot
 * level filter buttons for cOU1L2/cOU3L4/LoU4L4 in Screener.tsx already
 * check the raw r.cOU1L2/r.cOU3L4/r.LoU4L4 flags directly rather than
 * relying on this function's return value, so removing them here does not
 * affect filtering — only the primary badge, which now correctly falls
 * through to "Lower" for these rows.
 *
 * NEW: eXL4U4 — same treatment as cOU1L2/cOU3L4/LoU4L4
 * above: an independent, section-agnostic boolean (r.eXL4U4 from cpr.ts —
 * prev R4 inside today's R3/R4 AND prev S4 inside today's S3/S4). It is
 * NOT returned as the primary label here (same reasoning as above — it can
 * co-occur with any of eX-Higher/eX-Lower/cO-Higher/cO-Lower/Higher/Lower
 * and isn't mutually exclusive with them). Screener.tsx renders it as its
 * own second-row badge and its own Pattern filter button, checking
 * r.eXL4U4 directly — independent of activePattern/section, unlike the
 * "eXLo-L4U4-U4" / "eXHi-L4U4-U4" *patterns*, which gate the same boolean
 * behind overlapLower / overlapHigher respectively for their own sections.
 *
 * NEW: eXU4L2 — same treatment again: an independent, section-agnostic
 * boolean (r.eXU4L2 from cpr.ts — prev R4 inside today's R3/R4 AND prev
 * S4 inside today's S1/S2). Not returned as the primary label here for the
 * same reason as eXL4U4/HiL4U4/etc — Screener.tsx renders it as its own
 * second-row badge and its own Pattern filter button, checking
 * r.eXU4L2 directly, regardless of activePattern/left-nav section. The
 * "eXU4L2-AU4" *pattern* (Big Below) additionally requires strWideCPR +
 * cprFalling + extra R3/pivot/width conditions on top of this raw flag.
 *
 * NEW: cOU1L1 / cOL1U1 / cOU2L2 / cOL2U2 — same treatment again:
 * independent, section-agnostic booleans (from cpr.ts). Not returned as the
 * primary label here; Screener.tsx renders them as their own second-row
 * badges and Pattern filter buttons, checking the raw flags directly.
 *
 * NEW: cOTCL2 — same treatment again: an independent, section-agnostic
 * boolean (r.cOTCL2 from cpr.ts — today's R4 inside prev day's Pivot/TC
 * band AND today's S4 inside prev day's S1/S2 band). Not returned as the
 * primary label here; Screener.tsx (ScreenerTableRow.tsx) renders it as
 * its own second-row badge, checking the raw flag directly.
 */
export interface PatternInfo {
  label: "eX-Higher" | "eX-Lower" | "cO-Higher" | "cO-Lower" | "Higher" | "cOU3L4" | "LoU4L4" | "eXL4U3" | "eXL4U4" | "eXU4L4" | "EqL4U4" | "HiL4U4" | "HiL4U3" | "HiL4U2" | "HiL4U1" | "HiL2U3" | "cOL2U3" | "cOL3U3" | "eXU4L2" | "eXU4L3" | "cOL2U4" | "eXL3U3" | "eXL2U1" | "eXL3U1" | "eXL4U1" | "eXL1BC" | "eXL1CP" | "eXL1TC" | "eXL2BC" | "eXL3BC" | "eXL3CP" | "eXL3TC" | "eXL4U2" | "eXL2U2" | "eXL2TC" | "eXL1U1" | "eXU1L1" | "eXU2L1" | "cOTCL2" | "eXU3L1" | "eXU3L2" | "eXU2TC" | "eXU2BC" | "eXU3TC" | "eXU2CP" | "eXU3CP" | "eXU3BC" | "eXU4L1" | "eXU4BC" | "cOU1L1" | "cOL1U1" | "cOU2L2" | "cOL2U2" | "cOU1L2" | "cOU4L4" | "exL3U2" | "LoCPL3" | "LoCPL2" | "LoTCL3" | "eXHiL2L1" | "eXLoL2L1" | "eXL2CP" | "eXL4TC" | "LoU3L2" | "cOL1U2" | "cOL1U3" | "HiL3U2" | "Lower";
  classes: string;
}



export function getPatternInfo(r: CPRResult): PatternInfo {
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
 * matchesPatternFlag — raw Pattern flag check, factored out of the
 * inline PatternFilter block in Screener.tsx's `displayed` filter so
 * other consumers (the Backtest panel's Pattern scans,
 * e.g. "Overlap Above" → "HiL4U3") can reuse the exact same lookups
 * without duplicating the switch. For the six mutually-exclusive primary
 * labels (eX-Higher/eX-Lower/cO-Higher/cO-Lower/Higher/Lower) this falls
 * back to getPatternInfo(r)'s label; for the independent, section-agnostic
 * booleans (cOU1L2, cOU3L4, LoU4L4, eXL4U4, HiL4U4,
 * HiL4U3, HiL4U2, cOL2U3, eXU4L2, eXU4L3, cOU1L1, cOL1U1, cOU2L2, cOL2U2, cOTCL2)
 * it reads the raw flag directly — same as Screener.tsx does today.
 */
export function matchesPatternFlag(r: CPRResult, label: string): boolean {
  switch (label) {
    case "cOU3L4": return r.cOU3L4;
    // NEW: LoU3L3 — Pattern raw flag (see BacktestPanel's
    // "PREVCPR 1ABOVE" → "LoU3L3" nesting in backtest.ts).
    case "LoU3L3": return r.LoU3L3;
    // NEW: LoU3L4 — Pattern raw flag, same shape as its
    // LoU3L3 sibling (see BacktestPanel's "PREVCPR 1ABOVE" → "LoU3L4"
    // nesting in backtest.ts).
    case "LoU3L4": return r.LoU3L4;
    case "LoU4L4": return r.LoU4L4;
    // NEW: pRRHHLLA — Pattern compound flag for Overlap
    // Below's "9AM:pRRHHLLA-U4:9PM" family: today's R1/PDH both below
    // prev's tighter ceiling (RRHHCategory === "RRHH-B") AND today's PDH
    // strictly above prev's PDH with today's PDL >= prev's PDL (HHLLBelow).
    // The base overlapLower condition is already covered by the parent
    // "overlapping-lower" category key, so this only needs the raw
    // Pattern-flag part — same shape as LoU4L4 above. Symbol-list-only
    // nesting under "Overlap Below" in backtest.ts.
    case "pRRHHLLA": return r.RRHHCategory === "RRHH-B" && r.HHLLCategory === "HHLL-B";
    case "eXL4U3": return r.eXL4U3;
    case "eXL4U4": return r.eXL4U4;
    // NEW: eXU4L4 — same treatment as eXL4U4 above: an independent,
    // section-agnostic boolean (r.eXU4L4 from cpr.ts — prev R4 inside
    // today's R3/R4 AND prev S4 inside today's S4/S3, gated on
    // srExpandedLower instead of srExpandedHigher). Screener.tsx renders
    // it as its own Pattern-flag filter chip, same as eXL4U4.
    case "eXU4L4": return r.eXU4L4;
    case "EqL4U4": return r.EqL4U4;
    case "HiL4U4": return r.HiL4U4;
    case "HiL4U3": return r.HiL4U3;
    case "HiL4U2": return r.HiL4U2;
    case "HiL4U1": return r.HiL4U1;
    case "cOL2U3": return r.cOL2U3;
    case "cOL3U3": return r.cOL3U3;
    // NEW: cOL4U4 — Pattern raw flag (see BacktestPanel's
    // "CPR Inside" -> "cOL4U4" nesting in backtest.ts).
    case "cOL4U4": return r.cOL4U4;
    case "eXU4L2": return r.eXU4L2;
    case "eXU4L3": return r.eXU4L3;
    case "cOL2U4": return r.cOL2U4;
    case "eXL3U3": return r.eXL3U3;
    // NEW: eXL*U1 / eXL*CPR sub-type badges
    case "eXL2U1": return r.eXL2U1;
    case "eXL3U1": return r.eXL3U1;
    case "eXL4U1": return r.eXL4U1;
    case "eXL1BC": return r.eXL1BC;
    case "eXL1CP": return r.eXL1CP;
    // NEW: eXL1TC (prev S4 in today S1/BC, prev R4 in today Pivot/TC —
    // one band higher than eXL1CP's BC/Pivot band)
    case "eXL1TC": return r.eXL1TC;
    case "eXL2BC": return r.eXL2BC;
    case "eXL3BC": return r.eXL3BC;
    case "eXL3CP": return r.eXL3CP;
    // NEW: expanded family — eXL3TC / eXL4U2 / eXL2U2 / eXL2TC / eXL1U1
    case "eXL3TC": return r.eXL3TC;
    case "eXL4U2": return r.eXL4U2;
    case "eXL2U2": return r.eXL2U2;
    case "eXL2TC": return r.eXL2TC;
    case "eXL1U1": return r.eXL1U1;
    // NEW: eXU1L1 — same band shape as eXL1U1, split by which gap (R1-R4 vs S1-S4) is larger
    case "eXU1L1": return r.eXU1L1;
    case "eXU2L1": return r.eXU2L1;
    // NEW: eXU3L1 / eXU2TC
    case "eXU3L1": return r.eXU3L1;
    case "eXU3L2": return r.eXU3L2;
    case "eXU2TC": return r.eXU2TC;
    // NEW: eXU2BC / eXU3TC / eXU2CP
    case "eXU2BC": return r.eXU2BC;
    case "eXU3TC": return r.eXU3TC;
    case "eXU2CP": return r.eXU2CP;
    // NEW: eXU3CP — prev R4 inside today R2/R3 (U3) AND prev S4 inside today Pivot/TC.
    case "eXU3CP": return r.eXU3CP;
    // NEW: eXU3BC — prev R4 inside today R2/R3 (U3) AND prev S4 inside today BC/Pivot.
    case "eXU3BC": return r.eXU3BC;
    // NEW: eXL2CP (prev S4 in today S2/S1, prev R4 in today BC/Pivot)
    case "eXL2CP": return r.eXL2CP;
    // NEW: eXL4TC (prev S4 in today S4/S3, prev R4 in today Pivot/TC)
    case "eXL4TC": return r.eXL4TC;
    // NEW: LoU3L2 (today R4 in prev R2/R3, prev S4 in today S2/S1)
    case "LoU3L2": return r.LoU3L2;
    // NEW: cOL1U2 (today S4 in prev S1/BC, today R4 in prev R1/R2)
    case "cOL1U2": return r.cOL1U2;
    // NEW: cOL1U3 (today S4 in prev S1/BC, today R4 in prev R2/R3)
    case "cOL1U3": return r.cOL1U3;
    // NEW: HiL3U2 (today S4 in prev S3/S2, prev R4 in prev R1/R2)
    case "HiL3U2": return r.HiL3U2;
    // NEW: HiL3U4 — Pattern raw flag (see BacktestPanel's
    // "CPR 1ABOVE" → "HiL3U4" nesting in backtest.ts).
    case "HiL3U4": return r.HiL3U4;
    // NEW: eXU4L1 — prev R4 inside today R3/R4 (U4) AND prev S4 inside today BC/S1 (L1).
    case "eXU4L1": return r.eXU4L1;
    // NEW: eXU4BC — prev R4 inside today R3/R4 (U4) AND prev S4 inside today BC/Pivot.
    case "eXU4BC": return r.eXU4BC;
    // NEW: cOU1L1 / cOL1U1 / cOU2L2 / cOL2U2
    case "cOU1L1": return r.cOU1L1;
    case "cOL1U1": return r.cOL1U1;
    case "cOU2L2": return r.cOU2L2;
    case "cOL2U2": return r.cOL2U2;
    // NEW: cOU1L2 — independent, section-agnostic Pattern flag (see cpr.ts).
    case "cOU1L2": return r.cOU1L2;
    // NEW: cOU2L4 — Pattern raw flag (see BacktestPanel's
    // "PREVCPR 1ABOVE" (PCPR 1ABOVE) nesting in backtest.ts).
    case "cOU2L4": return r.cOU2L4;
    case "cOU4L4": return r.cOU4L4;
    case "exL3U2": return r.exL3U2;
    // NEW: cOTCL2 — independent, section-agnostic Pattern flag (see cpr.ts).
    // Today's R4 inside prev day's Pivot/TC band AND today's S4 inside
    // prev day's S1/S2 band.
    case "cOTCL2": return r.cOTCL2;
    // NEW: LoCPL3 — independent, section-agnostic Pattern flag (see cpr.ts).
    // Today's R4 inside prev day's Pivot/BC band AND today's S4 inside
    // prev day's S2/S3 band.
    case "LoCPL3": return r.LoCPL3;
    // NEW: LoCPL2 — same shape as LoCPL3, paired with prev day's S1/S2
    // band instead of S2/S3.
    case "LoCPL2": return r.LoCPL2;
    // NEW: LoTCL3 — same L3 (S2/S3) support band as LoCPL3, resistance
    // side measured against prev day's Pivot/TC band instead of Pivot/BC.
    case "LoTCL3": return r.LoTCL3;
    case "eXHiL2L1": return r.eXHiL2L1;
    case "eXLoL2L1": return r.eXLoL2L1;
    default: return getPatternInfo(r)?.label === label;
  }
}

/**
 * computePrevPattern — given two CPR-level objects, computes which
 * Pattern pivot label applies to the (today, prev) pair. Delegates
 * entirely to classifyCPRPair + pickPattern in cpr.ts, which is
 * the single source of truth for the band conditions and label priority.
 *
 * Used in the U1>pU4 section to find the PREVIOUS day's Pattern:
 * call with (prevCPR, ppCPR). Returns null when prev is undefined/null or
 * no known Pattern matches. The "p" prefix is added by the caller.
 */
export function computePrevPattern(
  today: CPRLevels,
  prev: CPRLevels | undefined | null,
): string | null {
  if (!prev) return null;
  return pickPattern(classifyCPRPair(today, prev));
}


/**
 * renderPrevPdhPdlBadge / renderTodayPdhPdlBadge — the individual prev-day
 * (pHL-A/pHL=/pHL-B) and today (HL-A/HL=/HL-B) PDH/PDL sub badges, split
 * out so callers that need to place them in different rows (e.g.
 * BacktestPanel's "result section" PDH/PDL column: Gap badge + today
 * badge on row 1, prev "p-xx" badge on row 2) can do so without relying on
 * cloneElement/DOM-order tricks. All comparisons come straight from
 * cpr.ts's calcCPR (HLSwitch: "HL-A"/"HL="/"HL-B" on each CPRLevels set) —
 * the three states are mutually exclusive and exhaustive, so every row
 * always has exactly one badge on each side.
 *
 * renderPdhPdlSubBadges — the original combined "2nd row" PDH/PDL badges
 * (both prev + today in one inline row), now a thin wrapper around the two
 * functions above for existing call sites (ScreenerTableRow's PDH/PDL
 * column, BacktestPanel's category-scan table) that still want both
 * badges together on one line. Returns null when neither side has any
 * badge to show.
 */
/**
 * HL_SWITCH_BADGE — display config for each HLSwitch value ("HL-A" /
 * "HL=" / "HL-B"), styled to exactly match HHLL_CATEGORY_BADGE: same
 * text-[10px] size, font-medium weight, px-1 py-0.5 rounded border shape,
 * and the same /10 (bg) + /30 (border) + solid -400 (text) brightness
 * level. HL-A/HL-B reuse HHLL-A/HHLL-B's green/red; HL= gets the matching
 * amber at the same brightness.
 */
const HL_SWITCH_BADGE: Record<HLSwitch, { className: string }> = {
  "HL-A": { className: "bg-green-500/10 text-green-400 border-green-500/30" },
  "HL=": { className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  "HL-B": { className: "bg-red-500/10 text-red-400 border-red-500/30" },
};

export function renderPrevPdhPdlBadge(r: CPRResult): React.JSX.Element | null {
  const sw = r.prevCPR.HLSwitch;
  const label = sw === "HL-A" ? "pHL-A" : sw === "HL=" ? "pHL=" : "pHL-B";
  const title =
    sw === "HL-A" ? `Prev PDH ${fmt(r.prevCPR.prevHigh)} > Prev U1 ${fmt(r.prevCPR.r1)}` :
    sw === "HL=" ? `PDH ${fmt(r.prevCPR.prevHigh)} = U1 ${fmt(r.prevCPR.r1)}` :
    `Prev PDH ${fmt(r.prevCPR.prevHigh)} < Prev U1 ${fmt(r.prevCPR.r1)}`;
  return (
    <span
      key="p-hl-switch"
      className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${HL_SWITCH_BADGE[sw].className}`}
      title={title}
    >
      {label}
    </span>
  );
}

export function renderTodayPdhPdlBadge(r: CPRResult): React.JSX.Element | null {
  const sw = r.todayCPR.HLSwitch;
  const label = sw === "HL-A" ? "HL-A" : sw === "HL=" ? "HL=" : "HL-B";
  const title =
    sw === "HL-A" ? `PDH ${fmt(r.todayCPR.prevHigh)} > U1 ${fmt(r.todayCPR.r1)}` :
    sw === "HL=" ? `PDH ${fmt(r.todayCPR.prevHigh)} = U1 ${fmt(r.todayCPR.r1)}` :
    `PDH ${fmt(r.todayCPR.prevHigh)} < U1 ${fmt(r.todayCPR.r1)}`;
  return (
    <span
      key="hl-switch"
      className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${HL_SWITCH_BADGE[sw].className}`}
      title={title}
    >
      {label}
    </span>
  );
}

export function renderPdhPdlSubBadges(r: CPRResult) {
  const prevBadge = renderPrevPdhPdlBadge(r);
  const todayBadge = renderTodayPdhPdlBadge(r);
  const badges = [prevBadge, todayBadge].filter((b): b is React.JSX.Element => b !== null);
  if (badges.length === 0) return null;
  return <div className="flex flex-nowrap items-center gap-1">{badges}</div>;
}

/**
 * SSRR_BADGE — display config for each CPRResult.SSRRCategory value, keyed
 * by category so renderSSRRHHLLBadges/renderSSRRCategoryBadge stay in sync.
 * "none" renders nothing.
 */
const SSRR_BADGE: Record<Exclude<SSRRCategory, "none">, { label: string; className: string; title: string }> = {
  "RRSS-A": {
    label: "RRSS-A",
    className: "bg-green-500/10 text-green-400 border-green-500/30",
    title: "Today's R1 > Prev R1 and Today's S1 >= Prev S1",
  },
  "RRSS-B": {
    label: "RRSS-B",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
    title: "Today's R1 <= Prev R1 and Today's S1 < Prev S1",
  },
  "RRSS-C": {
    label: "RRSS-C",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    title: "Compressed: Today's R1 < Prev R1 and Today's S1 > Prev S1",
  },
  "RRSS-E": {
    label: "RRSS-E",
    className: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    title: "Expanded: Today's R1 > Prev R1 and Today's S1 < Prev S1",
  },
  "RRSS=": {
    label: "RRSS=",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    title: "Equal: Today's R1 == Prev R1 and Today's S1 == Prev S1",
  },
};

/**
 * renderSSRRCategoryBadge — single badge for CPRResult.SSRRCategory
 * ("RRSS-A" | "RRSS-B" | "RRSS-C" | "RRSS-E" | "RRSS=" | "none"), same
 * solid-badge styling used elsewhere (renderPDHPDLGapCategoryBadge). Always
 * renders at most one badge, since SSRRCategory is a mutually exclusive
 * partition. Returns null for "none".
 */
export function renderSSRRCategoryBadge(r: CPRResult) {
  const cat = r.SSRRCategory;
  if (cat === "none") return null;
  const cfg = SSRR_BADGE[cat];
  return (
    <span
      className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${cfg.className}`}
      title={cfg.title}
    >
      {cfg.label}
    </span>
  );
}

/**
 * SSLL_BADGE — display config for each CPRResult.SSLLCategory value, keyed
 * by category so renderSSRRHHLLBadges/renderSSLLCategoryBadge stay in sync.
 */
const SSLL_BADGE: Record<Exclude<SSLLCategory, "none">, { label: string; className: string; title: string }> = {
  "SSLL-AA": {
    label: "SSLL-AA",
    className: "bg-green-500/10 text-green-400 border-green-500/30",
    title: "Today's whole S1/PDL band sits strictly above prev's whole band (full separation, no overlap)",
  },
  "SSLL-OA": {
    label: "SSLL-OA",
    className: "bg-green-500/10 text-green-400 border-green-500/30",
    title: "Today's S1/PDL band shifted up (band top and bottom both rose vs prev), but today's band overlaps prev's band",
  },
  "SSLL-BB": {
    label: "SSLL-BB",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
    title: "Today's whole S1/PDL band sits strictly below prev's whole band (full separation, no overlap)",
  },
  "SSLL-OB": {
    label: "SSLL-OB",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
    title: "Today's S1/PDL band shifted down (band top and bottom both fell vs prev), but today's band overlaps prev's band",
  },
  "SSLL-C": {
    label: "SSLL-C",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    title: "Compressed: today's S1/PDL band narrowed vs prev (top fell, bottom rose)",
  },
  "SSLL-E": {
    label: "SSLL-E",
    className: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    title: "Expanded: today's S1/PDL band widened vs prev (top rose, bottom fell)",
  },
  "SSLL-SB": {
    label: "SSLL-SB",
    className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    title: "Ambiguous Above: band top and bottom both rose vs prev, but S1 and PDL disagree in direction, so the Above verdict isn't safe",
  },
  "SSLL-LB": {
    label: "SSLL-LB",
    className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    title: "Ambiguous Below: band top and bottom both fell vs prev, but S1 and PDL disagree in direction, so the Below verdict isn't safe",
  },
  "SSLL=": {
    label: "SSLL=",
    className: "bg-slate-500/10 text-slate-300 border-slate-500/30",
    title: "Equal: today's S1/PDL band unchanged vs prev",
  },
};

/**
 * renderSSLLCategoryBadge — single badge for CPRResult.SSLLCategory
 * ("SSLL-AA" | "SSLL-OA" | "SSLL-BB" | "SSLL-OB" | "SSLL-C" | "SSLL-E" |
 * "SSLL-SB" | "SSLL-LB" | "SSLL=" | "none"), same solid-badge styling used
 * elsewhere (renderSSRRCategoryBadge). Always renders at most one badge,
 * since SSLLCategory is a mutually exclusive partition. Returns null for
 * "none". SSLL-AA/SSLL-OA (full separation vs overlap, both "up") and
 * SSLL-BB/SSLL-OB (full separation vs overlap, both "down") are computed
 * directly in cpr.ts's SSLLCategory — this is a plain lookup, no
 * SSLLAbove/SSLLBelow branching needed here anymore.
 */
export function renderSSLLCategoryBadge(r: CPRResult) {
  const cat = r.SSLLCategory;
  if (cat === "none") return null;
  const cfg = SSLL_BADGE[cat];
  return (
    <span
      className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${cfg.className}`}
      title={cfg.title}
    >
      {cfg.label}
    </span>
  );
}

/**
 * RRHH_BADGE — display config for each mirrored RRHH category, keyed by
 * category so renderSSRRHHLLBadges/renderRRHHCategoryBadge stay in sync.
 */
const RRHH_BADGE: Record<Exclude<RRHHCategory, "none">, { label: string; className: string; title: string }> = {
  "RRHH-A": {
    label: "RRHH-A",
    className: "bg-green-500/10 text-green-400 border-green-500/30",
    title: "Today's R1 > Prev R1 and Today's PDH > Prev PDH, with R1/PDH keeping the same top/bottom role on both days",
  },
  "RRHH-B": {
    label: "RRHH-B",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
    title: "Today's R1 < Prev R1 and Today's PDH < Prev PDH, with R1/PDH keeping the same top/bottom role on both days",
  },
  "RRHH-C": {
    label: "RRHH-C",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    title: "Compressed: Today's R1 < Prev R1 while Today's PDH > Prev PDH",
  },
  "RRHH-E": {
    label: "RRHH-E",
    className: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    title: "Expanded: Today's R1 > Prev R1 while Today's PDH < Prev PDH",
  },
  "RRHH-RA": {
    label: "RRHH-RA",
    className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    title: "Ambiguous Above: Today's R1 and PDH both rose, but their top/bottom roles differ between the two days",
  },
  "RRHH-HA": {
    label: "RRHH-HA",
    className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    title: "Ambiguous Below: Today's R1 and PDH both fell, but their top/bottom roles differ between the two days",
  },
  "RRHH=": {
    label: "RRHH=",
    className: "bg-slate-500/10 text-slate-300 border-slate-500/30",
    title: "Equal: today's R1/PDH pair is unchanged from the previous day's R1/PDH pair",
  },
};

/**
 * renderRRHHCategoryBadge — single badge for the mirrored R1/PDH RRHH pair,
 * using the same solid-badge styling and mutually-exclusive categories as
 * renderSSLLCategoryBadge.
 */
export function renderRRHHCategoryBadge(r: CPRResult) {
  const cat = r.RRHHCategory;
  if (cat === "none") return null;
  const cfg = RRHH_BADGE[cat];
  return (
    <span
      className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${cfg.className}`}
      title={cfg.title}
    >
      {cfg.label}
    </span>
  );
}

/**
 * renderSSRRHHLLBadges — the LEVEL column's second-row badges. Renders the
 * SSLL badge and the mirrored RRHH badge in that order. SSRR
 * (CPRResult.SSRRCategory) no longer appears here — it now renders on row 1
 * instead (see renderLevelStatusRow1Badges). Returns null when both are absent.
 */
export function renderSSRRHHLLBadges(r: CPRResult) {
  const ssllBadge = renderSSLLCategoryBadge(r);
  const rrhhBadge = renderRRHHCategoryBadge(r);
  const badges = [ssllBadge, rrhhBadge].filter((b): b is React.JSX.Element => b !== null);
  if (badges.length === 0) return null;
  return <div className="flex flex-nowrap items-center gap-1">{badges}</div>;
}

/**
 * renderLevelStatusRow1Badges — the LEVEL column's row-1 badges, shared by
 * renderLevelBadges and ScreenerTableRow's own LEVEL cell so both stay in
 * sync. Order:
 *   1. Status badge — Above / Below / Inside / Outside / Skip (always
 *      exactly one, mutually exclusive).
 *   2. oV-B / oV-A (overlapLower / overlapHigher).
 *   3. Narow / Wide — merged into a single badge wherever Above/Below/
 *      oV-B/oV-A pairs with Narow/Wide: oV-ANarow -> Nrow-oVA,
 *      AboveNarow -> Narow-A, BelowNarow -> Narow-B, oV-BNarow ->
 *      Nrow-oVB, oV-AWide -> Wide-AoV, AboveWide -> Wide-A, BelowWide ->
 *      Wide-B, oV-BWide -> Wide-BoV. The merged badge replaces both
 *      halves' bare badges (so "Above" becomes "Narow-A" in place, rather
 *      than appearing twice); when nothing merges, the bare
 *      Above/Below/oV-B/oV-A/Narrow/Wide badges render as before (the
 *      standalone "Narrow"/"Wide" fallback badges keep their original
 *      spelling — only the four/four merged combo labels were renamed to
 *      "Nrow-oVA"/"Nrow-oVB"/"Wide-*BoV"). Priority when more than one combo could
 *      apply on the same row: for Narow, oV-A > Above > Below > oV-B; for
 *      Wide, oV-A > Above > Below > oV-B (matches the row's own
 *      left-to-right badge order).
 *   4. SSRR badge — CPRResult.SSRRCategory (RRSS-A/RRSS-B/RRSS-C/RRSS-E/RRSS=),
 *      pulled out of row 2 to sit here, right after the Narow/Wide badges
 *      (row 2 now only carries SSLL + RRHH — see renderSSRRHHLLBadges).
 *   5. Equal.
 *
 * Two unconditional badges now sit right after the mutually-exclusive
 * status badge (Above/Below/Inside/Outside/Skip), before oV-B/oV-A, in
 * this order:
 *   1. SSRR badge — CPRResult.SSRRCategory (RRSS-A/RRSS-B/RRSS-C/RRSS-E/
 *      RRSS=, via renderSSRRCategoryBadge/SSRR_BADGE) — moved up from its
 *      old slot after Narow/Wide (see point 4 above, now superseded).
 *   2. RRSSGapCategory badge (RRGap/SSGap/SSRR=, via
 *      renderRRSSGapCategoryBadge), right after the SSRR badge.
 * Both are unconditional (always exactly one of their possible values,
 * like PDHPDLGapCategory), so neither needs a "none" guard here.
 */
export function renderLevelStatusRow1Badges(
  r: CPRResult,
  isInsideCPR: boolean,
  isOutsideCPR: boolean,
  showWide: boolean,
  nothingMatched: boolean
) {
  const isNarrow = r.narrowCPR && !isInsideCPR;

  const narrowMerge: "AoV" | "A" | "B" | "BoV" | null =
    isNarrow && r.overlapHigher ? "AoV" :
    isNarrow && r.cprRising ? "A" :
    isNarrow && r.cprFalling ? "B" :
    isNarrow && r.overlapLower ? "BoV" :
    null;
  const wideMerge: "AoV" | "A" | "B" | "BoV" | null =
    showWide && r.overlapHigher ? "AoV" :
    showWide && r.cprRising ? "A" :
    showWide && r.cprFalling ? "B" :
    showWide && r.overlapLower ? "BoV" :
    null;

  const aboveConsumed = narrowMerge === "A" || wideMerge === "A";
  const belowConsumed = narrowMerge === "B" || wideMerge === "B";
  const ovLowerConsumed = narrowMerge === "BoV" || wideMerge === "BoV";
  const ovHigherConsumed = narrowMerge === "AoV" || wideMerge === "AoV";
  const narrowConsumed = narrowMerge !== null;
  const wideConsumed = wideMerge !== null;

  const smallBadge = "text-[10px] px-1 py-0.5 rounded font-medium whitespace-nowrap shrink-0";

  return (
    <>
      {r.cprRising && !aboveConsumed && (
        <span className={`${smallBadge} bg-blue-500/10 text-blue-400 border border-blue-500/20`}>Above</span>
      )}
      {r.cprFalling && !belowConsumed && (
        <span className={`${smallBadge} bg-orange-500/10 text-orange-400 border border-orange-500/20`}>Below</span>
      )}
      {isInsideCPR && (
        <span className={`${smallBadge} bg-orange-500/10 text-orange-400 border border-orange-500/20`}>Inside</span>
      )}
      {isOutsideCPR && (
        <span className={`${smallBadge} bg-purple-500/10 text-purple-400 border border-purple-500/20`}>Outside</span>
      )}
      {nothingMatched && <span className={`${smallBadge} bg-muted text-muted-foreground`}>Skip</span>}
      {r.SSRRCategory !== "none" && (
        <span
          className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${SSRR_BADGE[r.SSRRCategory].className}`}
          title={SSRR_BADGE[r.SSRRCategory].title}
        >
          {SSRR_BADGE[r.SSRRCategory].label}
        </span>
      )}
      {renderRRSSGapCategoryBadge(r)}
      {r.overlapLower && !ovLowerConsumed && (
        <span className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">oV-B</span>
      )}
      {r.overlapHigher && !ovHigherConsumed && (
        <span className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">oV-A</span>
      )}
      {narrowMerge === "AoV" && (
        <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Nrow-oVA</span>
      )}
      {narrowMerge === "A" && (
        <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Narow-A</span>
      )}
      {narrowMerge === "B" && (
        <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Narow-B</span>
      )}
      {narrowMerge === "BoV" && (
        <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Nrow-oVB</span>
      )}
      {wideMerge === "AoV" && (
        <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide-AoV</span>
      )}
      {wideMerge === "A" && (
        <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide-A</span>
      )}
      {wideMerge === "B" && (
        <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide-B</span>
      )}
      {wideMerge === "BoV" && (
        <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide-BoV</span>
      )}
      {isNarrow && !narrowConsumed && (
        <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Narrow</span>
      )}
      {showWide && !wideConsumed && (
        <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide</span>
      )}
      {r.equalCPR && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Equal</span>
      )}
    </>
  );
}

/**
 * renderLevelStatusBadge — just the single, mutually-exclusive "first
 * button" out of renderLevelStatusRow1Badges (Above/Below/Inside/Outside/
 * Skip, or its Narow-A/Narow-B/Nrow-oVA/Nrow-oVB/Wide-A/Wide-B/Wide-AoV/
 * Wide-BoV merged form, or the bare Narrow/Wide fallback). Split out so the
 * Screener's Pattern column can show it as the leading badge alongside
 * today's pattern badge(s), while the LEVEL column keeps the rest (see
 * renderLevelStatusRestBadges). Always returns at most one badge.
 */
export function renderLevelStatusBadge(
  r: CPRResult,
  isInsideCPR: boolean,
  isOutsideCPR: boolean,
  showWide: boolean,
  nothingMatched: boolean
) {
  const isNarrow = r.narrowCPR && !isInsideCPR;

  const narrowMerge: "AoV" | "A" | "B" | "BoV" | null =
    isNarrow && r.overlapHigher ? "AoV" :
    isNarrow && r.cprRising ? "A" :
    isNarrow && r.cprFalling ? "B" :
    isNarrow && r.overlapLower ? "BoV" :
    null;
  const wideMerge: "AoV" | "A" | "B" | "BoV" | null =
    showWide && r.overlapHigher ? "AoV" :
    showWide && r.cprRising ? "A" :
    showWide && r.cprFalling ? "B" :
    showWide && r.overlapLower ? "BoV" :
    null;

  const aboveConsumed = narrowMerge === "A" || wideMerge === "A";
  const belowConsumed = narrowMerge === "B" || wideMerge === "B";
  const narrowConsumed = narrowMerge !== null;
  const wideConsumed = wideMerge !== null;

  const smallBadge = "text-[10px] px-1 py-0.5 rounded font-medium whitespace-nowrap shrink-0";

  if (narrowMerge === "AoV") return <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Nrow-oVA</span>;
  if (narrowMerge === "A") return <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Narow-A</span>;
  if (narrowMerge === "B") return <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Narow-B</span>;
  if (narrowMerge === "BoV") return <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Nrow-oVB</span>;
  if (wideMerge === "AoV") return <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide-AoV</span>;
  if (wideMerge === "A") return <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide-A</span>;
  if (wideMerge === "B") return <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide-B</span>;
  if (wideMerge === "BoV") return <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide-BoV</span>;
  if (r.cprRising && !aboveConsumed) return <span className={`${smallBadge} bg-blue-500/10 text-blue-400 border border-blue-500/20`}>Above</span>;
  if (r.cprFalling && !belowConsumed) return <span className={`${smallBadge} bg-orange-500/10 text-orange-400 border border-orange-500/20`}>Below</span>;
  if (isInsideCPR) return <span className={`${smallBadge} bg-orange-500/10 text-orange-400 border border-orange-500/20`}>Inside</span>;
  if (isOutsideCPR) return <span className={`${smallBadge} bg-purple-500/10 text-purple-400 border border-purple-500/20`}>Outside</span>;
  if (nothingMatched) return <span className={`${smallBadge} bg-muted text-muted-foreground`}>Skip</span>;
  if (isNarrow && !narrowConsumed) return <span className={`${smallBadge} bg-chart-3/10 text-chart-3 border border-chart-3/20`}>Narrow</span>;
  if (showWide && !wideConsumed) return <span className={`${smallBadge} bg-pink-500/10 text-pink-400 border border-pink-500/20`}>Wide</span>;
  return null;
}

/**
 * renderLevelStatusRestBadges — everything renderLevelStatusRow1Badges
 * renders MINUS the single leading status badge (see
 * renderLevelStatusBadge): the SSRR category badge (RRSS-A/RRSS-B/RRSS-C/
 * RRSS-E/RRSS=), the RRSSGapCategory badge (RRGap/SSGap/SSRR=, right after
 * it), oV-B/oV-A (only when not absorbed into a Narrow/Wide merge), and
 * Equal. Used by the Screener's own LEVEL column now that the leading
 * status badge has moved to the Pattern column.
 */
export function renderLevelStatusRestBadges(
  r: CPRResult,
  isInsideCPR: boolean,
  showWide: boolean
) {
  const isNarrow = r.narrowCPR && !isInsideCPR;

  const narrowMerge: "AoV" | "A" | "B" | "BoV" | null =
    isNarrow && r.overlapHigher ? "AoV" :
    isNarrow && r.cprRising ? "A" :
    isNarrow && r.cprFalling ? "B" :
    isNarrow && r.overlapLower ? "BoV" :
    null;
  const wideMerge: "AoV" | "A" | "B" | "BoV" | null =
    showWide && r.overlapHigher ? "AoV" :
    showWide && r.cprRising ? "A" :
    showWide && r.cprFalling ? "B" :
    showWide && r.overlapLower ? "BoV" :
    null;

  const ovLowerConsumed = narrowMerge === "BoV" || wideMerge === "BoV";
  const ovHigherConsumed = narrowMerge === "AoV" || wideMerge === "AoV";

  return (
    <>
      {r.SSRRCategory !== "none" && (
        <span
          className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${SSRR_BADGE[r.SSRRCategory].className}`}
          title={SSRR_BADGE[r.SSRRCategory].title}
        >
          {SSRR_BADGE[r.SSRRCategory].label}
        </span>
      )}
      {renderRRSSGapCategoryBadge(r)}
      {r.overlapLower && !ovLowerConsumed && (
        <span className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">oV-B</span>
      )}
      {r.overlapHigher && !ovHigherConsumed && (
        <span className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">oV-A</span>
      )}
      {r.equalCPR && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Equal</span>
      )}
    </>
  );
}

/**
 * renderPDHPDLGapCategoryBadge — single badge for CPRResult.PDHPDLGapCategory
 * ("HHGap" | "LLGap" | "HHLL="), same solid-badge styling as the
 * SSLL + HHLL-A/HHLL-B badges above (renderSSRRHHLLBadges):
 * green for HHGap (PDH gap bigger), red for LLGap (PDL gap bigger),
 * yellow/neutral for HHLL= (gaps equal) — matching the "IN-CPR"/"IN-PDHL"
 * neutral colour used elsewhere. Always renders exactly one badge, since
 * PDHPDLGapCategory is always exactly one of the three values.
 */
export function renderPDHPDLGapCategoryBadge(r: CPRResult) {
  const cat = r.PDHPDLGapCategory;
  const styles: Record<PDHPDLGapCategory, string> = {
    HHGap: "bg-green-500/10 text-green-400 border-green-500/30",
    LLGap: "bg-red-500/10 text-red-400 border-red-500/30",
    "HHLL=": "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  };
  const titles: Record<PDHPDLGapCategory, string> = {
    HHGap: "Gap between today's PDH and prev's PDH is larger than the PDL gap",
    LLGap: "Gap between today's PDL and prev's PDL is larger than the PDH gap",
    "HHLL=": "PDH gap and PDL gap are equal",
  };
  return (
    <span
      className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${styles[cat]}`}
      title={titles[cat]}
    >
      {cat}
    </span>
  );
}

/**
 * renderRRSSGapCategoryBadge — single badge for CPRResult.RRSSGapCategory
 * ("RRGap" | "SSGap" | "SSRR="), mirrors renderPDHPDLGapCategoryBadge but
 * over R1/S1 instead of PDH/PDL: green for RRGap (R1 gap bigger), red for
 * SSGap (S1 gap bigger), yellow/neutral for SSRR= (gaps equal). Always
 * renders exactly one badge, since RRSSGapCategory is always exactly one
 * of the three values.
 */
export function renderRRSSGapCategoryBadge(r: CPRResult) {
  const cat = r.RRSSGapCategory;
  const styles: Record<RRSSGapCategory, string> = {
    RRGap: "bg-green-500/10 text-green-400 border-green-500/30",
    SSGap: "bg-red-500/10 text-red-400 border-red-500/30",
    "SSRR=": "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  };
  const titles: Record<RRSSGapCategory, string> = {
    RRGap: "Gap between today's R1 and prev's R1 is larger than the S1 gap",
    SSGap: "Gap between today's S1 and prev's S1 is larger than the R1 gap",
    "SSRR=": "R1 gap and S1 gap are equal",
  };
  return (
    <span
      className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${styles[cat]}`}
      title={titles[cat]}
    >
      {cat}
    </span>
  );
}

/**
 * HHLL_CATEGORY_BADGE — display config for each CPRResult.HHLLCategory
 * value (Above/Below reuse the same green/red the removed HHLLAbove/
 * HHLLBelow booleans used to render with; Compressed/Expanded/Equal are
 * new). Keyed by category so renderHHLLCategoryBadge stays easy to extend.
 */
const HHLL_CATEGORY_BADGE: Record<Exclude<HHLLCategory, "none">, { label: string; className: string; title: string }> = {
  "HHLL-A": {
    label: "HHLL-A",
    className: "bg-green-500/10 text-green-400 border-green-500/30",
    title: "Today's PDH > Prev PDH and Today's PDL >= Prev PDL (Above)",
  },
  "HHLL-B": {
    label: "HHLL-B",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
    title: "Today's PDH <= Prev PDH and Today's PDL < Prev PDL (Below)",
  },
  "HHLL-C": {
    label: "HHLL-C",
    className: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    title: "Today's PDH < Prev PDH and Today's PDL > Prev PDL (Compressed)",
  },
  "HHLL-E": {
    label: "HHLL-E",
    className: "bg-pink-500/10 text-pink-400 border-pink-500/30",
    title: "Today's PDH > Prev PDH and Today's PDL < Prev PDL (Expanded)",
  },
  "HHLL=": {
    label: "HHLL=",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    title: "Today's PDH == Prev PDH and Today's PDL == Prev PDL (Equal)",
  },
};

/**
 * renderHHLLCategoryBadge — single badge for CPRResult.HHLLCategory
 * ("HHLL-A" | "HHLL-B" | "HHLL-C" | "HHLL-E" | "HHLL=" | "none"), same
 * solid-badge styling as renderPDHPDLGapCategoryBadge /
 * renderSSRRCategoryBadge. MOVED here from the LEVEL column (see
 * renderSSRRHHLLBadges) — HHLL-A/HHLL-B keep their original green/red
 * colours, HHLL-C/HHLL-E/HHLL= are new. Returns null for "none".
 */
export function renderHHLLCategoryBadge(r: CPRResult) {
  const cat = r.HHLLCategory;
  if (cat === "none") return null;
  const cfg = HHLL_CATEGORY_BADGE[cat];
  return (
    <span
      className={`text-[10px] whitespace-nowrap px-1 py-0.5 rounded border font-medium ${cfg.className}`}
      title={cfg.title}
    >
      {cfg.label}
    </span>
  );
}

/**
 * renderPdhPdlColumnBadges — the full PDH/PDL table column body, shared by
 * ScreenerTableRow and BacktestPanel's two result tables so all three call
 * sites stay in sync. Layout (updated):
 *   Row 1: HHLLCategory badge (HHLL-A/B/C/X/=) first, then the Gap badge
 *          (HHGap/LLGap/EqGap) — kept on a single non-wrapping line so the
 *          pair stays inline instead of stacking.
 *   Row 2: prev day's "p-xx" PDH/PDL badge first, then today's own "xx"
 *          PDH/PDL badge second — also kept non-wrapping so the pair never
 *          spills onto a 3rd row.
 * (Previously Row 1 was Gap badge + today badge, Row 2 was prev badge
 * alone — the HHLLCategory badge now takes the first slot on Row 1, and
 * today's own-PDH-vs-own-R1 badge shifted down to join prev's equivalent
 * badge on Row 2, since those two are a matched pair.)
 * Returns a "—" placeholder span when none of the four badges apply.
 */
export function renderPdhPdlColumnBadges(r: CPRResult) {
  const hhllBadge = renderHHLLCategoryBadge(r);
  const gapBadge = renderPDHPDLGapCategoryBadge(r);
  const prevBadge = renderPrevPdhPdlBadge(r);
  const todayBadge = renderTodayPdhPdlBadge(r);
  if (!hhllBadge && !gapBadge && !prevBadge && !todayBadge) {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-nowrap items-center gap-2">
        {hhllBadge}
        {gapBadge}
      </div>
      {(prevBadge || todayBadge) && (
        <div className="flex flex-nowrap items-center gap-2">
          {prevBadge}
          {todayBadge}
        </div>
      )}
    </div>
  );
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
    return { main: `+${pct.toFixed(2)}%`, sub: ">TC", color: "text-green-400" };
  }
  if (price < bc) {
    const pct = ((bc - price) / bc) * 100;
    return { main: `−${pct.toFixed(2)}%`, sub: "<BC", color: "text-destructive" };
  }
  return { main: "IN-CPR", sub: "", color: "text-yellow-400" };
}
