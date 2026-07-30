import { Fragment } from "react";
import { ExternalLink, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";

/**
 * PATTERN_BADGE_CLASSES — single source of truth for pattern badge colours.
 * Keyed by badge label (cOU3L4, eXL4U4, ...). Used for today's pattern badges
 * and for the previous-day "p-xxxx" badge so both share the same palette.
 */
export const PATTERN_BADGE_CLASSES: Record<string, string> = {
  cOU3L4: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  LoU4L4: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  eXHiL4U3: "bg-green-500/10 text-green-400 border border-green-500/20",
  eXL4U4: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  HiL2U4: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  HiL3U4: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  HiL4U4: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  HiL4U34: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  cOHiL2U3: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  cOHiL3U3: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  HiL3U3: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  cOU1L3: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  eXU4L234: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  eXU4L34: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
  cOHiL2U4: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  eXL3U3: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  eXU3L3: "bg-red-500/10 text-red-400 border border-red-500/20",
  cOL4U4: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  cOL3U4: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  cOU3L3: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  LoU3L4: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  LoU3L34: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  LoU2L4: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  LoU2L3: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  LoU4L34: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  LoU4L234: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  cOLoU2L3: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  LoU4L1234: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  cOU1L2: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  cOLoU2L4: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  cOU1L1: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  cOL1U1: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  cOU2L2: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  cOL2U2: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  cOU4L4: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  exL3U2: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  eXL4U2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  eXL2U2: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  eXL2TC: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  eXL3TC: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  eXL1U1: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  eXU2L1: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  cOTCL2: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  eXU3L1: "bg-red-500/10 text-red-400 border border-red-500/20",
  eXU2TC: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  eXU2BC: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  eXU3TC: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  eXU2CP: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  eXU4L1: "bg-green-500/10 text-green-400 border border-green-500/20",
  eXL2U1: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  eXL3U1: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  eXL4U1: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  eXL1CPR: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  eXL2CPR: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  eXL3CPR: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  LoCPL3: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  LoCPL2: "bg-teal-600/10 text-teal-300 border border-teal-600/20",
  LoTCL3: "bg-sky-600/10 text-sky-300 border border-sky-600/20",
};

export function getBadgeClasses(label: string): string {
  return (
    PATTERN_BADGE_CLASSES[label] ??
    "bg-muted text-muted-foreground border border-border"
  );
}

/**
 * Today's pattern badges — every individual boolean flag on a CPRResult
 * (r.cOU3L4, r.LoU4L4, ...), same badge set/colours used in the Screener's
 * "Pattern" column. Extracted out of the row JSX so other views (e.g.
 * BacktestPanel's category/sub-category results table) can render the
 * exact same badges from any CPRResult-shaped row. Returns null when no
 * pattern flag is set.
 */
export function renderTodayPatternBadges(r: CPRResult) {
  const hasAny =
    r.cOU3L4 || r.LoU4L4 || r.eXHiL4U3 || r.eXL4U4 || r.HiL4U4 || r.HiL4U34 || r.cOHiL2U3 || r.cOHiL3U3 || r.eXU4L234 || r.eXU4L34 || r.cOHiL2U4 || r.eXL3U3 || r.eXU3L3 || r.cOL4U4 || r.cOL3U4 || r.cOU3L3 || r.LoU3L4 || r.LoU3L34 || r.LoU2L4 || r.LoU2L3 || r.LoU4L34 || r.LoU4L234 || r.HiL2U4 || r.HiL3U4 || r.cOLoU2L3 || r.LoU4L1234 || r.cOU1L2 || r.cOLoU2L4 || r.eXL2U1 || r.eXL3U1 || r.eXL4U1 || r.eXL1CPR || r.eXL2CPR || r.eXL3CPR || r.cOU1L1 || r.cOL1U1 || r.cOU2L2 || r.cOL2U2 || r.cOU4L4 || r.exL3U2 || r.eXL3TC || r.eXL4U2 || r.eXL2U2 || r.eXL2TC || r.eXL1U1 || r.eXU2L1 || r.cOTCL2 || r.eXU3L1 || r.eXU2TC || r.eXU2BC || r.eXU3TC || r.eXU2CP || r.eXU4L1 || r.HiL3U3 || r.cOU1L3 || r.LoCPL3 || r.LoCPL2 || r.LoTCL3;
  if (!hasAny) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {r.cOU3L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">cOU3L4</span>}
      {r.LoU4L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">LoU4L4</span>}
      {r.eXHiL4U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-medium">eXHiL4U3</span>}
      {r.eXL4U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">eXL4U4</span>}
      {r.HiL2U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">HiL2U4</span>}
      {r.HiL3U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">HiL3U4</span>}
      {r.HiL4U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">HiL4U4</span>}
      {r.HiL4U34 && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">HiL4U34</span>}
      {r.cOHiL2U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">cOHiL2U3</span>}
      {r.cOHiL3U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">cOHiL3U3</span>}
      {r.eXU4L234 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">eXU4L234</span>}
      {r.eXU4L34 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">eXU4L34</span>}
      {r.cOHiL2U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">cOHiL2U4</span>}
      {r.eXL3U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">eXL3U3</span>}
      {r.eXU3L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">eXU3L3</span>}
      {r.cOL4U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">cOL4U4</span>}
      {r.cOL3U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">cOL3U4</span>}
      {r.cOU3L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">cOU3L3</span>}
      {r.LoU3L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">LoU3L4</span>}
      {r.LoU3L34 && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">LoU3L34</span>}
      {r.LoU2L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">LoU2L4</span>}
      {r.LoU2L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">LoU2L3</span>}
      {r.LoU4L34 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">LoU4L34</span>}
      {r.LoU4L234 && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">LoU4L234</span>}
      {r.cOLoU2L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">cOLoU2L3</span>}
      {r.LoU4L1234 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">LoU4L1234</span>}
      {r.cOU1L2 && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">cOU1L2</span>}
      {r.cOLoU2L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">cOLoU2L4</span>}
      {r.cOU1L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">cOU1L1</span>}
      {r.cOL1U1 && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">cOL1U1</span>}
      {r.cOU2L2 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">cOU2L2</span>}
      {r.cOL2U2 && <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">cOL2U2</span>}
      {r.cOU4L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">cOU4L4</span>}
      {r.exL3U2 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">exL3U2</span>}
      {r.eXL4U2 && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">eXL4U2</span>}
      {r.eXL2U2 && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">eXL2U2</span>}
      {r.eXL2TC && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">eXL2TC</span>}
      {r.eXL3TC && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">eXL3TC</span>}
      {r.eXL1U1 && <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">eXL1U1</span>}
      {r.eXU2L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">eXU2L1</span>}
      {r.cOTCL2 && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">cOTCL2</span>}
      {r.eXU3L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">eXU3L1</span>}
      {r.eXU2TC && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">eXU2TC</span>}
      {r.eXU2BC && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">eXU2BC</span>}
      {r.eXU3TC && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">eXU3TC</span>}
      {r.eXU2CP && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">eXU2CP</span>}
      {r.eXU4L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-medium">eXU4L1</span>}
      {r.HiL3U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">HiL3U3</span>}
      {r.cOU1L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">cOU1L3</span>}
      {r.eXL2U1 && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">eXL2U1</span>}
      {r.eXL3U1 && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">eXL3U1</span>}
      {r.eXL4U1 && <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">eXL4U1</span>}
      {r.eXL1CPR && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">eXL1CPR</span>}
      {r.eXL2CPR && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">eXL2CPR</span>}
      {r.eXL3CPR && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">eXL3CPR</span>}
      {r.LoCPL3 && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">LoCPL3</span>}
      {r.LoCPL2 && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-600/10 text-teal-300 border border-teal-600/20 font-medium">LoCPL2</span>}
      {r.LoTCL3 && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-600/10 text-sky-300 border border-sky-600/20 font-medium">LoTCL3</span>}
    </div>
  );
}

/**
 * Previous day's pattern badge (prevCPR vs ppCPR), rendered as "p-xxxx" and
 * colour-coded with the same palette as today's pattern badges. Extracted
 * for reuse outside ScreenerTableRow (see renderTodayPatternBadges above).
 * Returns null when there isn't enough history (no ppCPR) to compute it.
 */
export function renderPrevPatternBadge(r: CPRResult) {
  const prevSubLabel = computePivotSubLabel(r.prevCPR, r.ppCPR);
  if (!prevSubLabel) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      <span
        className={`text-xs px-1.5 py-0.5 rounded border font-medium ${getBadgeClasses(prevSubLabel)}`}
        title="Previous day's CPR sub-category (prevCPR vs ppCPR)"
      >
        p-{prevSubLabel}
      </span>
    </div>
  );
}

import type { CPRResult } from "@/lib/cpr";
import {
  type CPRResultWithSource,
  type ActiveTab,
  type SortKey,
  type SortDir,
  fmt,
  fmtPct,
  splitSymbol,
  getChartUrl,
  hasKnownChartMapping,
  passesPattern,
  distanceFromCPR,
  pdhPdlStatus,
  isRisingAboveTC,
  computePivotSubLabel,
  SRLadder,
  getSubFilterDirection,
  getWidthCategory,
  cprDistancePct,
  levelsInDistanceRange,
} from "./ScreenerUtils";

export interface ScreenerTableHeaderProps {
  canShowCombined: boolean;
  activeTab: ActiveTab;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (key: SortKey) => void;
}

/** Table <thead> for the screener results table. Moved from Screener.tsx as-is. */
export function ScreenerTableHeader({
  canShowCombined,
  activeTab,
  sortKey,
  sortDir,
  toggleSort,
}: ScreenerTableHeaderProps) {
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === "asc"
        ? <ChevronUp className="w-3 h-3 inline ml-1 text-primary" />
        : <ChevronDown className="w-3 h-3 inline ml-1 text-primary" />
      : <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />;

  return (
    <thead>
      <tr className="border-b border-border bg-muted/30">
        {canShowCombined && activeTab === "combined" && (
          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exchange</th>
        )}
        <th
          className="px-3 py-3 w-20 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("symbol")}
        >
          Symbol <SortIcon k="symbol" />
        </th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pattern
        </th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          PIVOT LEVEL
        </th>
        <th
          className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground min-w-[220px]"
          onClick={() => toggleSort("compressionRatio")}
        >
          PIVOT SIZE <SortIcon k="compressionRatio" />
        </th>
        <th
          className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("change24h")}
        >
          Price <SortIcon k="change24h" />
        </th>
        <th
          className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("priceVsCpr")}
        >
          Price/CPR <SortIcon k="priceVsCpr" />
        </th>
        <th
          className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("pdhPdlPct")}
          title="Position vs yesterday's High/Low"
        >
          PDH / PDL <SortIcon k="pdhPdlPct" />
        </th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          CPR-GAP
        </th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Chart
        </th>
      </tr>
    </thead>
  );
}

export interface ScreenerTableRowProps {
  r: CPRResultWithSource;
  rowKey: string;
  isExpanded: boolean;
  toggleExpand: (key: string) => void;
  canShowCombined: boolean;
  activeTab: ActiveTab;
  activePattern: string;
  showHAU1: boolean;
  showBigBelowPMiniPL3: boolean;
}

/**
 * A single table row (plus its expandable ADK S/R ladder row). Mechanical
 * extraction of the `<Fragment key={rowKey}>...</Fragment>` block from
 * Screener.tsx's table body — same badges, same columns, same logic. No
 * behavior changes.
 */
export default function ScreenerTableRow({
  r,
  rowKey,
  isExpanded,
  toggleExpand,
  canShowCombined,
  activeTab,
  activePattern,
  showBigBelowPMiniPL3,
}: ScreenerTableRowProps) {
  const sym = splitSymbol(r.symbol, r.source);

  // Shared "pU1 vs pL1" badge — compares previous day's Pivot→R1 gap against
  // Pivot→S1 gap. Only meaningful (and only rendered) for Inside-CPR rows;
  // used in both the CPR column (replacing "Narrow") and the GAP column.
  const isInsideCPR = passesPattern(r, "inside-cpr");
  const gapBadge = isInsideCPR
    ? r.prevR1Gap > r.prevS1Gap ? (
        <span
          key="pu1-gt-pl1"
          className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30 font-medium"
          title={`Prev R1 gap ${fmt(r.prevR1Gap)} > Prev S1 gap ${fmt(r.prevS1Gap)}`}
        >
          pU1&gt;pL1
        </span>
      ) : r.prevS1Gap > r.prevR1Gap ? (
        <span
          key="pl1-gt-pu1"
          className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 font-medium"
          title={`Prev S1 gap ${fmt(r.prevS1Gap)} > Prev R1 gap ${fmt(r.prevR1Gap)}`}
        >
          pL1&gt;pU1
        </span>
      ) : (
        <span
          key="pu1-eq-pl1"
          className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border font-medium"
          title={`Prev R1 gap = Prev S1 gap (${fmt(r.prevR1Gap)})`}
        >
          pU1=pL1
        </span>
      )
    : null;

  return (
    <Fragment key={rowKey}>
      <tr
        className={`hover:bg-muted/20 transition-colors ${getSubFilterDirection(r, activePattern) ? "bg-accent/3" : ""}`}
      >
        {canShowCombined && activeTab === "combined" && (
          <td className="px-4 py-3 whitespace-nowrap">
            <span
              className={`text-xs px-1.5 py-0.5 rounded border font-medium ${
                r.source === "binance"
                  ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                  : "bg-blue-500/10 text-blue-400 border-blue-500/20"
              }`}
            >
              {r.source === "binance" ? "Binance" : "Delta"}
            </span>
          </td>
        )}
        <td
          className="px-3 py-3 w-20 font-mono font-semibold text-foreground cursor-pointer select-none"
          onClick={() => toggleExpand(rowKey)}
          title="Click to expand ADK S/R ladder"
        >
          <div className="flex items-start gap-1.5">
            <span className="text-muted-foreground text-xs mt-0.5">{isExpanded ? "▼" : "▶"}</span>
            {(() => {
              const dir = getSubFilterDirection(r, activePattern);
              if (!dir) return null;
              return (
                <div
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    dir === "up" ? "bg-green-400" : "bg-red-400"
                  }`}
                  title={dir === "up" ? "Matches a bullish sub-filter" : "Matches a bearish sub-filter"}
                />
              );
            })()}
            <div className="flex flex-col leading-tight min-w-0">
              <div className="flex items-center gap-1">
                <span className="truncate">{sym.base}</span>
                {hasKnownChartMapping(r.symbol, r.source) ? (
                  <a
                    href={getChartUrl(r.symbol, r.source)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                    title="Open on TradingView"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span
                    className="text-muted-foreground/30 cursor-not-allowed inline-flex shrink-0"
                    title="Not available on TradingView"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </span>
                )}
              </div>
              <span className="text-muted-foreground text-xs font-normal">/{sym.quote}</span>
              {isRisingAboveTC(r) && activePattern === "structure-bigbelow" && showBigBelowPMiniPL3 && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/30 mt-0.5 inline-block w-fit"
                  title="Currently trading above today's TC"
                >
                  Rising
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {renderTodayPatternBadges(r)}
          {renderPrevPatternBadge(r)}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex flex-wrap gap-1">
            {r.cprRising && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">Above</span>}
            {r.cprFalling && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">Below</span>}
            {passesPattern(r, "inside-cpr") && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">Inside</span>}
            {passesPattern(r, "outside-cpr") && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">Outside</span>}
            {r.overlapLower && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">oV-Below</span>}
            {r.strWideCPR && <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">Wide</span>}
            {r.overlapHigher && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">oV-Above</span>}
            {r.narrowCPR && (isInsideCPR ? gapBadge : <span className="text-xs px-1.5 py-0.5 rounded bg-chart-3/10 text-chart-3 border border-chart-3/20 font-medium">Narrow</span>)}
            {r.equalCPR && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Equal</span>}
            {!r.cprRising &&
              !r.cprFalling &&
              !r.narrowCPR &&
              !r.equalCPR &&
              !r.strWideCPR &&
              !passesPattern(r, "inside-cpr") &&
              !passesPattern(r, "outside-cpr") &&
              !(passesPattern(r, activePattern) && ["overlapping-lower", "overlapping-higher", "equal-cpr"].includes(activePattern)) && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Skip</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 font-mono whitespace-nowrap min-w-[220px]">
          {(() => {
            const prevCat = getWidthCategory(r.prevCPR.widthPct);
            const todayCat = getWidthCategory(r.todayCPR.widthPct);
            return (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span
                  className={`font-sans text-xs px-1.5 py-0.5 rounded border font-medium flex flex-col items-center leading-tight ${prevCat.pClasses}`}
                  title={`Prev day CPR width: ${r.prevCPR.widthPct.toFixed(4)}%`}
                >
                  <span>p{prevCat.label}</span>
                  <span className="text-[10px] font-mono">{r.prevCPR.widthPct.toFixed(4)}%</span>
                </span>
                <span className="font-sans text-[11px] font-semibold text-slate-300 bg-slate-500/10 border border-slate-500/30 rounded-full px-2 py-0.5 shrink-0">
                  {r.compressionRatio.toFixed(1)}%
                </span>
                <span
                  className={`font-sans text-xs px-1.5 py-0.5 rounded border font-medium flex flex-col items-center leading-tight ${todayCat.classes}`}
                  title={`Today's CPR width: ${r.todayCPR.widthPct.toFixed(4)}%`}
                >
                  <span>{todayCat.label}</span>
                  <span className="text-[10px] font-mono">{r.todayCPR.widthPct.toFixed(4)}%</span>
                </span>
              </div>
            );
          })()}
        </td>
        <td className="px-4 py-3 font-mono whitespace-nowrap">
          <div className="text-sm font-bold text-foreground">
            {fmt(r.currentPrice)}
            <span className={r.change24h >= 0 ? "text-green-400" : "text-destructive"}>
              ({fmtPct(r.change24h)})
            </span>
          </div>
          <div className="text-xs text-muted-foreground">OPrice: {fmt(r.openPrice)}</div>
        </td>
        <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).color}`}>
          <div>{distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).main}</div>
          <div>{distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).sub}</div>
        </td>
        <td
          className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${pdhPdlStatus(r).color}`}
          title={`PDH: ${fmt(r.todayCPR.prevHigh)}  |  PDL: ${fmt(r.todayCPR.prevLow)}`}
        >
          <div>{pdhPdlStatus(r).main}</div>
          <div>{pdhPdlStatus(r).sub}</div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono font-medium">
          {(() => {
            const dist = cprDistancePct(r);
            if (dist === null) return <span className="text-muted-foreground">—</span>;
            const levels = levelsInDistanceRange(r);
            return (
              <>
                <div className={r.cprRising ? "text-blue-400" : "text-orange-400"}>
                  {dist.toFixed(2)}%
                </div>
                {levels.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 whitespace-normal max-w-[72px]">
                    {levels.map((lvl) => lvl.label).join(", ")}
                  </div>
                )}
              </>
            );
          })()}
          {gapBadge && <div className="flex flex-wrap gap-1 mt-1">{gapBadge}</div>}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {(() => {
            const pdh = r.todayCPR.prevHigh;
            const pdl = r.todayCPR.prevLow;
            const u1 = (r.todayCPR as any).r1 ?? (r.todayCPR as any).u1;
            const l1 = (r.todayCPR as any).s1 ?? (r.todayCPR as any).l1;
            const badges: JSX.Element[] = [];
            if (pdh != null && u1 != null) {
              if (pdh > u1) {
                badges.push(
                  <span
                    key="pdh-gt-u1"
                    className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30 font-medium"
                    title={`PDH ${fmt(pdh)} > U1 ${fmt(u1)}`}
                  >
                    PDH&gt;U1
                  </span>
                );
              } else if (pdh === u1) {
                badges.push(
                  <span
                    key="pdh-eq-u1"
                    className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-medium"
                    title={`PDH = U1 (${fmt(pdh)})`}
                  >
                    PDH=U1
                  </span>
                );
              }
            }
            if (pdl != null && l1 != null && pdl < l1) {
              badges.push(
                <span
                  key="pdl-lt-l1"
                  className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 font-medium"
                  title={`PDL ${fmt(pdl)} < L1 ${fmt(l1)}`}
                >
                  PDL&lt;L1
                </span>
              );
            }
            if (badges.length === 0) {
              return <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">—</span>;
            }
            return <div className="flex flex-wrap gap-1">{badges}</div>;
          })()}
        </td>
      </tr>

      {isExpanded && (
        <tr key={`${rowKey}-sr`} className="bg-muted/20 border-b border-border">
          <td colSpan={20} className="px-6 py-4">
            <div className="flex flex-wrap gap-10 items-start">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-6 items-start">
                  {r.ppCPR && (
                    <div className="min-w-[140px]">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">PDay-1 CPR</p>
                      <div className="rounded-lg border border-border bg-card/40 px-3 py-2 font-mono space-y-1.5">
                        <div className="flex justify-between gap-4 text-xs">
                          <span style={{ color: "#6b7280" }}>TC:</span>
                          <span style={{ color: "#9ca3af" }}>{fmt(r.ppCPR.tc)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-xs" style={{ color: "#6b7280" }}>Pivot</span>
                          <span className="font-bold text-sm" style={{ color: "#d1d5db" }}>{fmt(r.ppCPR.pivot)}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-xs">
                          <span style={{ color: "#6b7280" }}>BC:</span>
                          <span style={{ color: "#9ca3af" }}>{fmt(r.ppCPR.bc)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="min-w-[140px]">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Prev Day CPR</p>
                    <div className="rounded-lg border border-border bg-card/60 px-3 py-2 font-mono space-y-1.5">
                      <div className="flex justify-between gap-4 text-xs">
                        <span style={{ color: "#6b7280" }}>TC:</span>
                        <span style={{ color: "#9ca3af" }}>{fmt(r.prevCPR.tc)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-xs" style={{ color: "#6b7280" }}>Pivot</span>
                        <span className="font-bold text-sm" style={{ color: "#d1d5db" }}>{fmt(r.prevCPR.pivot)}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-xs">
                        <span style={{ color: "#6b7280" }}>BC:</span>
                        <span style={{ color: "#9ca3af" }}>{fmt(r.prevCPR.bc)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="min-w-[140px]">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Today CPR</p>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 font-mono space-y-1.5">
                    <div className="flex justify-between gap-4 text-xs">
                      <span style={{ color: "#6b7280" }}>TC:</span>
                      <span style={{ color: "#9ca3af" }}>{fmt(r.todayCPR.tc)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-xs" style={{ color: "#6b7280" }}>Pivot</span>
                      <span className="font-bold text-sm" style={{ color: "#ffffff" }}>{fmt(r.todayCPR.pivot)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-xs">
                      <span style={{ color: "#6b7280" }}>BC:</span>
                      <span style={{ color: "#9ca3af" }}>{fmt(r.todayCPR.bc)}</span>
                    </div>
                  </div>
                </div>
                {(() => {
                  const r4Gap = Math.abs(r.todayCPR.r4 - r.prevCPR.r4);
                  const s4Gap = Math.abs(r.todayCPR.s4 - r.prevCPR.s4);
                  const r4d = (r as any).r4Distance as number | undefined;
                  const s4d = (r as any).s4Distance as number | undefined;
                  if (r4d == null || s4d == null || !isFinite(r4d) || !isFinite(s4d)) return null;
                  const maxD = Math.max(r4d, s4d);
                  const diffPct = maxD > 0 ? ((r4d - s4d) / maxD) * 100 : 0;
                  const diffColor =
                    diffPct > 0 ? "text-green-400" : diffPct < 0 ? "text-orange-400" : "text-muted-foreground";
                  return (
                    <div className="min-w-[140px]">
                      <div
                        className="rounded-lg border border-border bg-card/60 px-3 py-2 font-mono space-y-1"
                        title={`Normalized: U4Δ ${r4d.toFixed(2)}× vs L4Δ ${s4d.toFixed(2)}× of prev CPR width`}
                      >
                        <div className="flex justify-between gap-4 text-xs text-chart-3">
                          <span className="text-muted-foreground">U4Gap:</span>
                          <span>{fmt(r4Gap)}</span>
                        </div>
                        <div className={`text-xs font-semibold ${diffColor}`}>
                          {diffPct >= 0 ? "+" : ""}
                          {diffPct.toFixed(2)}%
                          <div className="w-full bg-muted rounded-full h-1 mt-0.5">
                            <div
                              className={`h-1 rounded-full transition-all ${
                                diffPct > 0 ? "bg-green-400" : diffPct < 0 ? "bg-orange-400" : "bg-muted-foreground"
                              }`}
                              style={{ width: `${Math.min(Math.abs(diffPct), 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex justify-between gap-4 text-xs text-chart-3/70">
                          <span className="text-muted-foreground">L4Gap:</span>
                          <span>{fmt(s4Gap)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="hidden sm:block w-px self-stretch bg-border/50 mx-2" />
              <SRLadder cpr={r.todayCPR} currentPrice={r.currentPrice} label="Today S/R" />
              <SRLadder cpr={r.prevCPR} currentPrice={r.currentPrice} label="Prev Day S/R" />
              {r.ppCPR && (
                <SRLadder cpr={r.ppCPR} currentPrice={r.currentPrice} label="PDay-1 S/R" />
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
