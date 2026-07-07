import type { CPRResult } from "@/lib/cpr";

export type SortKey =
  | "symbol"
  | "compressionRatio"
  | "cprWidth"
  | "prevCprWidth"
  | "change24h"
  | "volume24h"
  | "distanceFromCPR"
  | "cprDistancePct"
  | "pivotLevel";

export type SortDir = "asc" | "desc";
export type ActiveTab = "binance" | "delta" | "combined";
export type WidthFilter = "nano" | "micro" | "narrow" | "wide" | null;

export interface CPRResultWithSource extends CPRResult {
  source: "binance" | "delta";
}

export interface PivotLevelInfo {
  label: "Inside CPR" | "Above TC" | "Below BC" | "Between BC-P" | "Between P-TC";
  color: string;
}

// Formatting Helpers
export const fmt = (v: number | undefined | null) =>
  v !== undefined && v !== null ? (v < 1 ? v.toFixed(4) : v.toFixed(2)) : "-";

export const fmtPct = (v: number | undefined | null) =>
  v !== undefined && v !== null ? `${v.toFixed(2)}%` : "-";

export const fmtVol = (v: number | undefined | null) => {
  if (v === undefined || v === null) return "-";
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
};

export const splitSymbol = (sym: string) => {
  if (sym.endsWith("USDT")) return { base: sym.replace("USDT", ""), quote: "USDT" };
  if (sym.endsWith("USDC")) return { base: sym.replace("USDC", ""), quote: "USDC" };
  return { base: sym, quote: "" };
};

export const getChartUrl = (sym: string, source: "binance" | "delta") => {
  const { base } = splitSymbol(sym);
  if (source === "delta") {
    return `https://www.delta.exchange/app/futures/trade/P_${base}_USDT`;
  }
  return `https://www.binance.com/en/trade/${base}_USDT?type=futures`;
};

// Value Extractors for Sorting
export const getVal = (r: CPRResult, key: SortKey): string | number => {
  switch (key) {
    case "symbol": return r.symbol;
    case "compressionRatio": return r.compressionRatio;
    case "cprWidth": return r.cprWidth;
    case "prevCprWidth": return r.prevCPR.width;
    case "change24h": return r.change24h;
    case "volume24h": return r.volume24h;
    case "distanceFromCPR": return distanceFromCPR(r);
    case "cprDistancePct": return cprDistancePct(r);
    case "pivotLevel": return getPivotLevel(r).label;
    default: return 0;
  }
};

// Structural Filter Helper Evaluations
export const distanceFromCPR = (r: CPRResult): number => {
  const price = r.currentPrice || r.closePrice;
  const high = Math.max(r.todayCPR.tc, r.todayCPR.bc);
  const low = Math.min(r.todayCPR.tc, r.todayCPR.bc);
  if (price > high) return ((price - high) / high) * 100;
  if (price < low) return ((low - price) / low) * 100;
  return 0;
};

export const cprDistancePct = (r: CPRResult): number => {
  const prevP = r.prevCPR.p;
  const todayP = r.todayCPR.p;
  return ((todayP - prevP) / prevP) * 100;
};

export const pdhPdlStatus = (r: CPRResult) => {
  const price = r.currentPrice || r.closePrice;
  return {
    isAbovePDH: price > r.prevCPR.high,
    isBelowPDL: price < r.prevCPR.low,
  };
};

export const isRisingAboveTC = (r: CPRResult): boolean => {
  const price = r.currentPrice || r.closePrice;
  return price > r.todayCPR.tc;
};

export const isCprAbovePU4 = (r: CPRResult): boolean => r.todayCPR.bc > r.prevCPR.r4;
export const isL1AbovePU4 = (r: CPRResult): boolean => r.todayCPR.s1 > r.prevCPR.r4;

export const isPWideAbove = (r: CPRResult): boolean => {
  const pCprWidth = r.prevCPR.width;
  const ppHigh = Math.max(r.ppCPR.tc, r.ppCPR.bc);
  const pLow = Math.min(r.prevCPR.tc, r.prevCPR.bc);
  return pCprWidth > r.ppCPR.width && pLow > ppHigh;
};

export const getPivotLevel = (r: CPRResult): PivotLevelInfo => {
  const price = r.currentPrice || r.closePrice;
  const { tc, bc, p } = r.todayCPR;
  const high = Math.max(tc, bc);
  const low = Math.min(tc, bc);

  if (price >= low && price <= high) return { label: "Inside CPR", color: "text-amber-500 bg-amber-500/10" };
  if (price > high) return { label: "Above TC", color: "text-emerald-500 bg-emerald-500/10" };
  if (price < low) {
    if (price > p && low === tc) return { label: "Between P-TC", color: "text-blue-400 bg-blue-500/10" };
    if (price < p && low === tc) return { label: "Between BC-P", color: "text-indigo-400 bg-indigo-500/10" };
    if (price > p && low === bc) return { label: "Between BC-P", color: "text-indigo-400 bg-indigo-500/10" };
    if (price < p && low === bc) return { label: "Between P-TC", color: "text-blue-400 bg-blue-500/10" };
    return { label: "Below BC", color: "text-rose-500 bg-rose-500/10" };
  }
  return { label: "Above TC", color: "text-emerald-500 bg-emerald-500/10" };
};

export const matchesWidthFilter = (r: CPRResult, filter: WidthFilter): boolean => {
  if (!filter) return true;
  const w = r.cprWidth;
  if (filter === "nano") return w <= 0.15;
  if (filter === "micro") return w > 0.15 && w <= 0.25;
  if (filter === "narrow") return w > 0.25 && w <= 0.5;
  if (filter === "wide") return w > 1.0;
  return true;
};

export const levelsInDistanceRange = (r: CPRResult, minPct = 0, maxPct = 0.35): string[] => {
  const price = r.currentPrice || r.closePrice;
  const targets: { label: string; val: number }[] = [
    { label: "TC", val: r.todayCPR.tc },
    { label: "P", val: r.todayCPR.p },
    { label: "BC", val: r.todayCPR.bc },
    { label: "R1", val: r.todayCPR.r1 },
    { label: "S1", val: r.todayCPR.s1 },
    { label: "R2", val: r.todayCPR.r2 },
    { label: "S2", val: r.todayCPR.s2 },
    { label: "R3", val: r.todayCPR.r3 },
    { label: "S3", val: r.todayCPR.s3 },
    { label: "R4", val: r.todayCPR.r4 },
    { label: "S4", val: r.todayCPR.s4 },
  ];

  return targets
    .map((t) => {
      const dist = Math.abs(price - t.val) / price * 100;
      return { label: t.label, dist };
    })
    .filter((t) => t.dist >= minPct && t.dist <= maxPct)
    .sort((a, b) => a.dist - b.dist)
    .map((t) => `${t.label}(${t.dist.toFixed(2)}%)`);
};

// S&R Ladder Display Utility
export const SRLadder = (r: CPRResult) => {
  const entries = [
    { label: "R4", val: r.todayCPR.r4 },
    { label: "R3", val: r.todayCPR.r3 },
    { label: "R2", val: r.todayCPR.r2 },
    { label: "R1", val: r.todayCPR.r1 },
    { label: "TC", val: r.todayCPR.tc },
    { label: "P", val: r.todayCPR.p },
    { label: "BC", val: r.todayCPR.bc },
    { label: "S1", val: r.todayCPR.s1 },
    { label: "S2", val: r.todayCPR.s2 },
    { label: "S3", val: r.todayCPR.s3 },
    { label: "S4", val: r.todayCPR.s4 },
  ];
  return entries.sort((a, b) => b.val - a.val);
};

// Core Pattern Rules Engine
export function passesPattern(r: CPRResult, pattern: string | undefined): boolean {
  if (!pattern) return true;

  const tHigh = Math.max(r.todayCPR.tc, r.todayCPR.bc);
  const tLow = Math.min(r.todayCPR.tc, r.todayCPR.bc);
  const pHigh = Math.max(r.prevCPR.tc, r.prevCPR.bc);
  const pLow = Math.min(r.prevCPR.tc, r.prevCPR.bc);

  switch (pattern) {
    case "littleabove":
      return tLow > pHigh && r.compressionRatio <= 1.25;

    case "la-2tiny":
      return tLow > pHigh && r.cprWidth <= 0.25 && r.prevCPR.width <= 0.25;

    case "la-allstepup":
      return tLow > pHigh && r.todayCPR.p > r.prevCPR.p && r.prevCPR.p > r.ppCPR.p;

    case "1LHr-L4U3-U4":
      return (
        tLow > pHigh &&
        r.todayCPR.s1 > r.prevCPR.high &&
        r.todayCPR.s4 > r.prevCPR.r3 &&
        r.todayCPR.r4 < r.prevCPR.r4
      );

    case "LA-PL12CL23":
      return (
        tLow > pHigh &&
        r.prevCPR.s1 > r.ppCPR.low &&
        r.prevCPR.s2 > r.ppCPR.low &&
        r.todayCPR.s2 > r.prevCPR.low &&
        r.todayCPR.s3 > r.prevCPR.low
      );

    case "mP-U34>pU2":
      return (
        tLow > pHigh &&
        r.cprWidth <= 0.35 &&
        r.todayCPR.r3 > r.prevCPR.r2 &&
        r.todayCPR.r4 > r.prevCPR.r2
      );

    case "outside-cpr":
      return tHigh > pHigh && tLow < pLow;

    case "outside-cpr-compressed":
      return tHigh > pHigh && tLow < pLow && r.compressionRatio <= 1.1;

    case "eXHrL3U3-AU4":
      return (
        tHigh > pHigh &&
        tLow < pLow &&
        r.prevCPR.width >= 1.0 &&
        r.todayCPR.s3 < r.prevCPR.s3 &&
        r.todayCPR.r3 > r.prevCPR.r3 &&
        r.todayCPR.r4 > r.prevCPR.r4
      );

    case "cOHrL3U32-AU4":
      return (
        tHigh > pHigh &&
        tLow < pLow &&
        r.cprWidth <= 0.5 &&
        r.todayCPR.s3 < r.prevCPR.s3 &&
        r.todayCPR.r3 > r.prevCPR.r3 &&
        r.todayCPR.r4 > r.prevCPR.r4
      );

    case "inside-cpr":
      return tHigh < pHigh && tLow > pLow;

    case "inside-cpr-expanded":
      return tHigh < pHigh && tLow > pLow && r.compressionRatio >= 1.5;

    case "inside-cpr-narrow":
      return tHigh < pHigh && tLow > pLow && r.cprWidth < 0.5;

    case "cO-U4L3":
      return (
        tHigh < pHigh &&
        tLow > pLow &&
        r.cprWidth <= 0.35 &&
        tHigh < r.prevCPR.r4 &&
        tLow > r.prevCPR.s3
      );

    case "overlapping-lower":
      return tHigh < pHigh && tLow < pLow && tHigh > pLow;

    case "Exp-U4>pU4":
      return (
        tHigh < pHigh &&
        tLow < pLow &&
        tHigh > pLow &&
        r.compressionRatio >= 1.35 &&
        r.todayCPR.r4 > r.prevCPR.r4
      );

    case "Exp-U3>pU3":
      return (
        tHigh < pHigh &&
        tLow < pLow &&
        tHigh > pLow &&
        r.compressionRatio >= 1.35 &&
        r.todayCPR.r3 > r.prevCPR.r3
      );

    case "structure-bigbelow":
      return r.compressionRatio >= 1.5 && r.todayCPR.p < r.prevCPR.p;

    case "bigbelow-pmini-pl3":
      return (
        r.compressionRatio >= 1.5 &&
        r.todayCPR.p < r.prevCPR.p &&
        r.cprWidth <= 0.4 &&
        tHigh < r.prevCPR.s3 &&
        r.todayCPR.r3 > r.prevCPR.s4
      );

    case "eX-U4L34":
      return (
        r.compressionRatio >= 1.5 &&
        r.todayCPR.p < r.prevCPR.p &&
        r.prevCPR.width >= 1.0 &&
        r.todayCPR.r3 < r.prevCPR.s3 &&
        r.todayCPR.s4 < r.prevCPR.s4
      );

    case "L1<pL4":
      return (
        r.compressionRatio >= 1.5 &&
        r.todayCPR.p < r.prevCPR.p &&
        r.todayCPR.r1 < r.prevCPR.s4
      );

    case "structure-bigabove":
      return r.compressionRatio >= 1.5 && r.todayCPR.p > r.prevCPR.p;

    case "bigabove-pl34cl4-u3>pu4":
      return (
        r.compressionRatio >= 1.5 &&
        r.todayCPR.p > r.prevCPR.p &&
        r.cprWidth <= 0.4 &&
        tLow > r.prevCPR.r3 &&
        r.todayCPR.s3 < r.prevCPR.r4
      );

    case "bacomp-l3>pl1/u3>pu1":
      return (
        r.compressionRatio >= 1.5 &&
        r.todayCPR.p > r.prevCPR.p &&
        r.cprWidth <= 0.35 &&
        r.todayCPR.s3 > r.prevCPR.r1 &&
        r.todayCPR.r3 > r.prevCPR.r1
      );

    case "hR-HAL":
      return (
        r.compressionRatio >= 1.5 &&
        r.todayCPR.p > r.prevCPR.p &&
        r.prevCPR.width >= 1.0 &&
        r.todayCPR.s4 > r.prevCPR.r4
      );

    case "HA-U1>PU4":
      return (
        r.compressionRatio >= 1.5 &&
        r.todayCPR.p > r.prevCPR.p &&
        r.todayCPR.s1 > r.prevCPR.r4
      );

    case "littlebelow":
      return tHigh < pLow && r.compressionRatio <= 1.25;

    case "lb-cmprss-l4>3-u4<2":
      return (
        tHigh < pLow &&
        r.compressionRatio <= 1.25 &&
        r.todayCPR.s4 > r.prevCPR.s3 &&
        r.todayCPR.r4 < r.prevCPR.s2
      );

    case "lb-c-l34c4/u23c4":
      return (
        tHigh < pLow &&
        r.cprWidth <= 0.35 &&
        r.todayCPR.s3 > r.prevCPR.s4 &&
        r.todayCPR.s4 > r.prevCPR.s4 &&
        r.todayCPR.r2 < r.prevCPR.s4 &&
        r.todayCPR.r3 < r.prevCPR.s4
      );

    case "co2-l2u2":
      return (
        tHigh < pLow &&
        r.cprWidth <= 0.35 &&
        tHigh < r.prevCPR.r2 &&
        tLow > r.prevCPR.s2
      );

    case "lb-2tiny":
      return tHigh < pLow && r.cprWidth <= 0.25 && r.prevCPR.width <= 0.25;

    case "overlapping-upper":
      return tHigh > pHigh && tLow > pLow && tLow < pHigh;

    case "unchanged":
      return Math.abs(r.todayCPR.p - r.prevCPR.p) / r.prevCPR.p < 0.001;

    default:
      return true;
  }
}
