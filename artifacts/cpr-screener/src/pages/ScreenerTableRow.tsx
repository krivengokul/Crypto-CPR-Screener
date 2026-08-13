import { Fragment } from "react";
import { ExternalLink } from "lucide-react";

/**
 * PATTERN_BADGE_CLASSES — single source of truth for pattern badge colours.
 * Keyed by badge label (cOU3L4, eXL4U4, ...). Used for today's pattern badges
 * and for the previous-day "p-xxxx" badge so both share the same palette.
 */
export const PATTERN_BADGE_CLASSES: Record<string, string> = {
  cOU3L4: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  LoU4L4: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  eXL4U3: "bg-green-500/10 text-green-400 border border-green-500/20",
  eXL4U4: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  eXU4L4: "bg-red-500/10 text-red-400 border border-red-500/20",
  EqL4U4: "bg-slate-500/10 text-slate-300 border border-slate-500/20",
  HiL2U4: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  HiL2U3: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  HiL3U4: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  HiL4U4: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  HiL4U1: "bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20",
  HiL4U3: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  HiL4U2: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  cOL2U3: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  cOL3U3: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  HiL3U3: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  cOU1L3: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  eXU4L2: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  eXU4L3: "bg-blue-600/10 text-blue-400 border border-blue-600/20",
  cOL2U4: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  eXL3U3: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  eXU3L3: "bg-red-500/10 text-red-400 border border-red-500/20",
  cOL4U4: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  cOL3U4: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  cOU3L3: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  LoU3L4: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  LoU3L3: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  LoU2L4: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  LoU2L3: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  LoU4L3: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  LoU4L2: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  cOU2L3: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  LoU4L1: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  cOU1L2: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  cOU2L4: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
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
  eXU1L1: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  eXU2L1: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  cOTCL2: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  eXU3L1: "bg-red-500/10 text-red-400 border border-red-500/20",
  eXU3L2: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  eXU2TC: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  eXU2BC: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  eXU3TC: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  eXU2CP: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  eXU3CP: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  eXU3BC: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  eXL2CP: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  eXL4TC: "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20",
  LoU3L2: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  cOL1U2: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  cOL1U3: "bg-cyan-600/10 text-cyan-300 border border-cyan-600/20",
  HiL3U2: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  eXU4L1: "bg-green-500/10 text-green-400 border border-green-500/20",
  eXU4BC: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  eXL2U1: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  eXL3U1: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  eXL4U1: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  eXL1BC: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  eXL1CP: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  eXL1TC: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  eXL2BC: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  eXL3BC: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  eXL3CP: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  LoCPL3: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  LoCPL2: "bg-teal-600/10 text-teal-300 border border-teal-600/20",
  LoTCL3: "bg-sky-600/10 text-sky-300 border border-sky-600/20",
  eXHiL2L1: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  eXLoL2L1: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
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
    r.cOU3L4 || r.LoU4L4 || r.eXL4U3 || r.eXL4U4 || r.eXU4L4 || r.EqL4U4 || r.HiL4U4 || r.HiL4U3 || r.HiL4U2 || r.HiL4U1 || r.cOL2U3 || r.cOL3U3 || r.eXU4L2 || r.eXU4L3 || r.cOL2U4 || r.eXL3U3 || r.eXU3L3 || r.cOL4U4 || r.cOL3U4 || r.cOU3L3 || r.LoU3L4 || r.LoU3L3 || r.LoU2L4 || r.LoU2L3 || r.LoU4L3 || r.LoU4L2 || r.HiL2U4 || r.HiL2U3 || r.HiL3U4 || r.cOU2L3 || r.LoU4L1 || r.cOU1L2 || r.cOU2L4 || r.eXL2U1 || r.eXL3U1 || r.eXL4U1 || r.eXL1BC || r.eXL1CP || r.eXL1TC || r.eXL2BC || r.eXL3BC || r.eXL3CP || r.cOU1L1 || r.cOL1U1 || r.cOU2L2 || r.cOL2U2 || r.cOU4L4 || r.exL3U2 || r.eXL3TC || r.eXL4U2 || r.eXL2U2 || r.eXL2TC || r.eXL1U1 || r.eXU1L1 || r.eXU2L1 || r.cOTCL2 || r.eXU3L1 || r.eXU3L2 || r.eXU2TC || r.eXU2BC || r.eXU3TC || r.eXU2CP || r.eXU3CP || r.eXU3BC || r.eXU4L1 || r.eXU4BC || r.HiL3U3 || r.cOU1L3 || r.LoCPL3 || r.LoCPL2 || r.LoTCL3 || r.eXHiL2L1 || r.eXLoL2L1 || r.eXL2CP || r.eXL4TC || r.LoU3L2 || r.cOL1U2 || r.cOL1U3 || r.HiL3U2;
  if (!hasAny) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {r.cOU3L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">cOU3L4</span>}
      {r.LoU4L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">LoU4L4</span>}
      {r.eXL4U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-medium">eXL4U3</span>}
      {r.eXL4U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">eXL4U4</span>}
      {r.eXU4L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">eXU4L4</span>}
      {r.EqL4U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-300 border border-slate-500/20 font-medium">EqL4U4</span>}
      {r.HiL2U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">HiL2U4</span>}
      {r.HiL2U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">HiL2U3</span>}
      {r.HiL3U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">HiL3U4</span>}
      {r.HiL4U1 && <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20 font-medium">HiL4U1</span>}
      {r.HiL4U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">HiL4U4</span>}
      {r.HiL4U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">HiL4U3</span>}
      {r.HiL4U2 && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">HiL4U2</span>}
      {r.cOL2U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">cOL2U3</span>}
      {r.cOL3U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">cOL3U3</span>}
      {r.eXU4L2 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">eXU4L2</span>}
      {r.eXU4L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-400 border border-blue-600/20 font-medium">eXU4L3</span>}
      {r.cOL2U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">cOL2U4</span>}
      {r.eXL3U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">eXL3U3</span>}
      {r.eXU3L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">eXU3L3</span>}
      {r.cOL4U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">cOL4U4</span>}
      {r.cOL3U4 && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">cOL3U4</span>}
      {r.cOU3L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">cOU3L3</span>}
      {r.LoU3L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">LoU3L4</span>}
      {r.LoU3L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">LoU3L3</span>}
      {r.LoU2L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">LoU2L4</span>}
      {r.LoU2L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">LoU2L3</span>}
      {r.LoU4L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">LoU4L3</span>}
      {r.LoU4L2 && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">LoU4L2</span>}
      {r.cOU2L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">cOU2L3</span>}
      {r.LoU4L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">LoU4L1</span>}
      {r.cOU1L2 && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">cOU1L2</span>}
      {r.cOU2L4 && <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">cOU2L4</span>}
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
      {r.eXU1L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">eXU1L1</span>}
      {r.eXU2L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">eXU2L1</span>}
      {r.cOTCL2 && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">cOTCL2</span>}
      {r.eXU3L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">eXU3L1</span>}
      {r.eXU3L2 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">eXU3L2</span>}
      {r.eXU2TC && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">eXU2TC</span>}
      {r.eXU2BC && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">eXU2BC</span>}
      {r.eXU3TC && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">eXU3TC</span>}
      {r.eXU2CP && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">eXU2CP</span>}
      {r.eXU3CP && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">eXU3CP</span>}
      {r.eXU3BC && <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">eXU3BC</span>}
      {r.eXL2CP && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">eXL2CP</span>}
      {r.eXL4TC && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">eXL4TC</span>}
      {r.LoU3L2 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">LoU3L2</span>}
      {r.cOL1U2 && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">cOL1U2</span>}
      {r.cOL1U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-600/10 text-cyan-300 border border-cyan-600/20 font-medium">cOL1U3</span>}
      {r.HiL3U2 && <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">HiL3U2</span>}
      {r.eXU4L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-medium">eXU4L1</span>}
      {r.eXU4BC && <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">eXU4BC</span>}
      {r.HiL3U3 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">HiL3U3</span>}
      {r.cOU1L3 && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">cOU1L3</span>}
      {r.eXL2U1 && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">eXL2U1</span>}
      {r.eXL3U1 && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">eXL3U1</span>}
      {r.eXL4U1 && <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">eXL4U1</span>}
      {r.eXL1BC && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">eXL1BC</span>}
      {r.eXL1CP && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">eXL1CP</span>}
      {r.eXL1TC && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">eXL1TC</span>}
      {r.eXL2BC && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">eXL2BC</span>}
      {r.eXL3BC && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">eXL3BC</span>}
      {r.eXL3CP && <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">eXL3CP</span>}
      {r.LoCPL3 && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">LoCPL3</span>}
      {r.LoCPL2 && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-600/10 text-teal-300 border border-teal-600/20 font-medium">LoCPL2</span>}
      {r.LoTCL3 && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-600/10 text-sky-300 border border-sky-600/20 font-medium">LoTCL3</span>}
      {r.eXHiL2L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">eXHiL2L1</span>}
      {r.eXLoL2L1 && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">eXLoL2L1</span>}
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
  const prevSubLabel = computePrevPattern(r.prevCPR, r.ppCPR);
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

/**
 * "LEVEL" column body — row 1: Above/Below/Inside/Outside/Skip, oV-B/oV-A,
 * Narrow/Wide, Equal — all rendered inline on one line (Narrow/Wide is
 * always the badge right after oV-B/oV-A); row 2:
 * SSRR-A/SSRR-B + HHLL-A/HHLL-B, shown only for Inside-CPR-narrow or
 * Outside-CPR rows, always on its own row underneath row 1. Extracted out
 * of the row JSX so other views (e.g. BacktestPanel) can reuse the same
 * LEVEL column. Mirrors ScreenerTableRow's own LEVEL cell, minus the
 * activePattern-aware tweak to the "Skip" fallback, which only makes sense
 * inside the Screener's own pattern-filter context.
 */
export function renderLevelBadges(r: CPRResult) {
  const isInsideCPR = passesPattern(r, "inside-cpr");
  const isOutsideCPR = passesPattern(r, "outside-cpr");
  const showWide = r.strWideCPR && !isOutsideCPR;
  const nothingMatched =
    !r.cprRising &&
    !r.cprFalling &&
    !r.narrowCPR &&
    !r.equalCPR &&
    !showWide &&
    !isInsideCPR &&
    !isOutsideCPR;
  // Row 1 keeps every LEVEL-status badge inline on one line (Above/Below/
  // Inside/Outside/Skip, then oV-B/oV-A, then Narrow/Wide, then Equal) so
  // nothing gets pushed down to a second line.
  const secondBadge =
    r.narrowCPR && !isInsideCPR ? (
      <span className="text-[10px] px-1 py-0.5 rounded bg-chart-3/10 text-chart-3 border border-chart-3/20 font-medium whitespace-nowrap shrink-0">
        Narrow
      </span>
    ) : showWide ? (
      <span className="text-[10px] px-1 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium whitespace-nowrap shrink-0">
        Wide
      </span>
    ) : null;
  // SSRR-A/SSRR-B + HHLL-A/HHLL-B now always render on their own row,
  // regardless of Inside/Outside/narrow state.
  const ssrrHhllRow = renderSSRRHHLLBadges(r);
  return (
    <div className="flex flex-col gap-1 max-w-[130px]">
      <div className="flex flex-wrap items-center gap-1">
        {r.cprRising && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium whitespace-nowrap shrink-0">Above</span>}
        {r.cprFalling && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium whitespace-nowrap shrink-0">Below</span>}
        {isInsideCPR && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium whitespace-nowrap shrink-0">Inside</span>}
        {isOutsideCPR && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium whitespace-nowrap shrink-0">Outside</span>}
        {nothingMatched && <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap shrink-0">Skip</span>}
        {r.overlapLower && <span className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">oV-B</span>}
        {r.overlapHigher && <span className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">oV-A</span>}
        {secondBadge}
        {r.equalCPR && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Equal</span>}
      </div>
      {ssrrHhllRow}
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
  computePrevPattern,
  getSubFilterDirection,
  getWidthCategory,
  cprDistancePct,
  levelsInDistanceRange,
  renderPdhPdlSubBadges,
  renderSSRRHHLLBadges,
} from "./ScreenerUtils";
import { SRLadderRow, toSRLadderData } from "./SRLadderPanel";

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
  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="text-[10px] ml-1 text-white">
      {sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
    </span>
  );

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
        <th className="px-2 py-3 w-28 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          LEVEL
        </th>
        <th
          className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground min-w-[190px]"
          onClick={() => toggleSort("compressionRatio")}
        >
            PIVOT SIZE <SortIcon k="compressionRatio" />
        </th>
        <th
          className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("change24h")}
        >
          Price <SortIcon k="change24h" />
        </th>
        <th
          className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground min-w-[110px]"
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
  // used in both the CPR column (replacing "NaroW") and the GAP column.
  const isInsideCPR = passesPattern(r, "inside-cpr");
  const isOutsideCPR = passesPattern(r, "outside-cpr");
  // Outside-CPR rows don't need the "Wide" badge — Outside already implies
  // the CPR bands separated from prev day's, so width-category noise (Wide)
  // is redundant there; only show it for non-Outside rows.
  const showWide = r.strWideCPR && !isOutsideCPR;
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

  // "SSRR-A / SSRR-B" + "HHLL-A / HHLL-B" badges — LEVEL-column-only
  // replacement for the pU1/pL1 gap badges above. Driven by
  // CPRResult.SSRRAbove / SSRRBelow (today's R1/S1 vs prev's R1/S1) and
  // CPRResult.HHLLAbove / HHLLBelow (today's PDH/PDL vs prev's PDH/PDL),
  // both from cpr.ts. Always rendered on its own row underneath the
  // Above/Below/Inside/Outside row, regardless of Inside/Outside/narrow
  // state, via the shared renderSSRRHHLLBadges helper.
  const ssrrHhllRow = renderSSRRHHLLBadges(r);
  // Row 1 keeps every LEVEL-status badge inline on one line (Above/Below/
  // Inside/Outside/Skip, then oV-B/oV-A, then Narrow/Wide, then Equal) so
  // nothing gets pushed down to a second line.
  const levelSecondBadge =
    r.narrowCPR && !isInsideCPR ? (
      <span className="text-[10px] px-1 py-0.5 rounded bg-chart-3/10 text-chart-3 border border-chart-3/20 font-medium whitespace-nowrap shrink-0">
        Narrow
      </span>
    ) : showWide ? (
      <span className="text-[10px] px-1 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium whitespace-nowrap shrink-0">
        Wide
      </span>
    ) : null;

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
        <td className="px-2 py-3 w-28">
          <div className="flex flex-col gap-1 max-w-[130px]">
            <div className="flex flex-wrap items-center gap-1">
              {r.cprRising && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium whitespace-nowrap shrink-0">Above</span>}
              {r.cprFalling && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium whitespace-nowrap shrink-0">Below</span>}
              {isInsideCPR && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium whitespace-nowrap shrink-0">Inside</span>}
              {isOutsideCPR && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium whitespace-nowrap shrink-0">Outside</span>}
              {!r.cprRising &&
                !r.cprFalling &&
                !r.narrowCPR &&
                !r.equalCPR &&
                !showWide &&
                !isInsideCPR &&
                !isOutsideCPR &&
                !(passesPattern(r, activePattern) && ["overlapping-lower", "overlapping-higher", "equal-cpr"].includes(activePattern)) && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap shrink-0">Skip</span>
              )}
              {r.overlapLower && <span className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">oV-B</span>}
              {r.overlapHigher && <span className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">oV-A</span>}
              {levelSecondBadge}
              {r.equalCPR && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Equal</span>}
            </div>
            {ssrrHhllRow}
          </div>
        </td>
        <td className="px-4 py-3 font-mono whitespace-nowrap min-w-[190px]">
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
                <span className="font-sans text-[11px] font-semibold text-muted-foreground bg-slate-500/10 border border-slate-500/30 rounded-full px-2 py-0.5 shrink-0">
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
            <span className="text-muted-foreground">(</span>
            <span className={r.change24h >= 0 ? "text-green-400" : "text-destructive"}>
              {fmtPct(r.change24h)}
            </span>
            <span className="text-muted-foreground">)</span>
          </div>
          <div className="text-xs text-muted-foreground">OPrice: {fmt(r.openPrice)}</div>
        </td>
        <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium min-w-[110px] ${distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).color}`}>
          <div>
            {distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).main}
            {distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).sub && (
              <span className="text-[10px] ml-1">{distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).sub}</span>
            )}
          </div>
        </td>
        <td
          className="px-4 py-3 whitespace-nowrap text-xs font-medium"
          title={`PDH: ${fmt(r.todayCPR.prevHigh)}  |  PDL: ${fmt(r.todayCPR.prevLow)}`}
        >
          <div>
            {pdhPdlStatus(r).main && (
              <span className={pdhPdlStatus(r).color}>{pdhPdlStatus(r).main}</span>
            )}
            {pdhPdlStatus(r).sub && (
              <span
                className={`font-normal ml-1 opacity-80 ${
                  pdhPdlStatus(r).sub === "> PDH"
                    ? "text-green-400/70"
                    : pdhPdlStatus(r).sub === "< PDL"
                    ? "text-red-400/70"
                    : "text-yellow-500/85"
                }`}
              >
                {pdhPdlStatus(r).sub}
              </span>
            )}
          </div>
          <div className="mt-0.5">
            {renderPdhPdlSubBadges(r) ?? (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">—</span>
            )}
          </div>
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
      </tr>

      {isExpanded && (
        <SRLadderRow
          key={`${rowKey}-sr`}
          r={toSRLadderData(r)}
          rowKey={rowKey}
          colSpan={20}
          todayPatternBadge={renderTodayPatternBadges(r)}
          prevPatternBadge={renderPrevPatternBadge(r)}
        />
      )}
    </Fragment>
  );
}
