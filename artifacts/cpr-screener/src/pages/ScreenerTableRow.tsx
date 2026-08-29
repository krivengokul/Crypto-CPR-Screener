import { Fragment } from "react";
import { ExternalLink } from "lucide-react";

/**
 * PATTERN_BADGE_CLASSES — single source of truth for pattern badge colours.
 * Keyed by badge label (CL4U3, EU4L4, ...). Used for today's pattern badges
 * and for the previous-day "p-xxxx" badge so both share the same palette.
 */
export const PATTERN_BADGE_CLASSES: Record<string, string> = {
  CL4U3: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  L4U4: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  EU3L4: "bg-green-500/10 text-green-400 border border-green-500/20",
  EU4L4: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  EL4U4: "bg-red-500/10 text-red-400 border border-red-500/20",
  QU4L4: "bg-slate-500/10 text-slate-300 border border-slate-500/20",
  U4L2: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  U3L2: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  U4L3: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  U4L4: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  U1L4: "bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20",
  U3L4: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  U2L4: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  CU3L2: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  CU3L3: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  U3L3: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  CL3U1: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  EL2U4: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  EL3U4: "bg-blue-600/10 text-blue-400 border border-blue-600/20",
  CU4L2: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  EU3L3: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  EL3U3: "bg-red-500/10 text-red-400 border border-red-500/20",
  CU4L4: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  CU4L3: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  CL3U3: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  L4U3: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  L3U3: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  L4U2: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  L3U2: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  L3U4: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  L2U4: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  CL3U2: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  L1U4: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  CL2U1: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  CL4U2: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  CL1U1: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  CU1L1: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  CL2U2: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  CU2L2: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  CL4U4: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  EU2L3: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  EU2L4: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EU2L2: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  EUTL2: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  EUTL3: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  EU1L1: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  EL1U1: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  EL1U2: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  CL2UT: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  EL1U3: "bg-red-500/10 text-red-400 border border-red-500/20",
  EL2U3: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  ELTU2: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  ELBU2: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  ELTU3: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  ELPU2: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  ELPU3: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  ELBU3: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  EUPL2: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  EUTL4: "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20",
  L2U3: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  CU2L1: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  CU3L1: "bg-cyan-600/10 text-cyan-300 border border-cyan-600/20",
  U2L3: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  EL1U4: "bg-green-500/10 text-green-400 border border-green-500/20",
  ELBU4: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  EU1L2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EU1L3: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  EU1L4: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  EUBL1: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  EUPL1: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  EUTL1: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  EUBL2: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  EUBL3: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  EUPL3: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  L3CP: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  L2CP: "bg-teal-600/10 text-teal-300 border border-teal-600/20",
  L3TC: "bg-sky-600/10 text-sky-300 border border-sky-600/20",
  EL1L2: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  EL2L1: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  // PivotPattern badges — "E-{Level}-{RRHH}-{SSLL}" (see
  // ScreenerUtils.computePivotPattern / PIVOT_PATTERN_KEYS). Grouped by
  // Level (A: green family, B: amber/orange family, E: purple/pink
  // family) so the three Levels stay visually distinct at a glance.
  "E-A-AA-OB": "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  "E-A-OA-OB": "bg-green-500/10 text-green-400 border border-green-500/20",
  "E-A-AA-SB": "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  "E-A-AA-C": "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  "E-A-OA-C": "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  "E-A-AA-E": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  "E-A-OA-E": "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  "E-B-RA-BB": "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  "E-B-C-BB": "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  "E-B-E-BB": "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  "E-B-C-OB": "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  "E-B-E-OB": "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  "E-E-AA-BB": "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  "E-E-OA-BB": "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  "E-E-AA-OB": "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  "E-E-OA-OB": "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  // PivotPattern badges, "LevelsAbove" half — "A-E-{RRHH}-{SSLL}"
  // (renamed from RRSSA-EC/EE/ELB/EOB — see ScreenerUtils.PIVOT_PATTERNS
  // / PIVOT_PATTERN_KEYS). Own amber/yellow/lime/green/emerald/teal family
  // so this LevelsAbove group reads distinctly from the E-*/C-* families
  // above/below even though it shares the HHLL-E condition space with them.
  // "A-E-AA-OB" is excluded from PIVOT_PATTERN_KEYS (see that comment in
  // ScreenerUtils.tsx), so getBadgeClasses is never actually called with
  // it via the PivotPatternBadge — left here harmlessly in case it's ever
  // used as a badge label from another call site.
  "A-E-AA-C": "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  "A-E-OA-C": "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  "A-E-AA-E": "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  "A-E-OA-E": "bg-green-500/10 text-green-400 border border-green-500/20",
  "A-E-AA-LB": "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  "A-E-OA-LB": "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  // PivotPattern badges, "LevelsAbove" half continued — "A-{Level}-
  // {RRHH}-{SSLL}" for HHLL-A/B/C (renamed from RRSSA-AAA-*/AOA-*/CC/CE/
  // CRA/BC-*/BE-*/BRA-* — see ScreenerUtils.PIVOT_PATTERNS /
  // PIVOT_PATTERN_KEYS). Continues the same orange->yellow->lime->green->
  // emerald->teal LevelsAbove palette started by A-E-* above so the whole
  // "LevelsAbove" super-family reads as one continuous colour band,
  // distinct from the E-*/C-* families. "A-A-OA-AA"/"A-A-OA-OA" are
  // excluded from PIVOT_PATTERN_KEYS (exact duplicates of "C-A-OA-AA"/
  // "C-A-OA-OA" — see that comment in ScreenerUtils.tsx), so they have no
  // entry here either.
  "A-A-AA-AA": "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  "A-A-AA-OA": "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  "A-B-C-C": "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  "A-B-C-LB": "bg-green-500/10 text-green-400 border border-green-500/20",
  "A-B-E-E": "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  "A-B-E-LB": "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  "A-B-RA-C": "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  "A-B-RA-E": "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  "A-B-RA-LB": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  "A-C-C-AA": "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  "A-C-C-OA": "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  "A-C-E-AA": "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  "A-C-E-OA": "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  "A-C-RA-AA": "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  "A-C-RA-OA": "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  // PivotPattern badges, "compressed" half — "C-{Level}-{RRHH}-{SSLL}"
  // (see ScreenerUtils.computePivotPattern / PIVOT_PATTERN_KEYS — merged
  // with the E-* "expanded" half above into one combined key list/badge,
  // since r.expanded/r.compressed are mutually exclusive). Same grouping
  // idea as the E-* badges above but with a distinct palette per Level
  // (A: teal/cyan/sky/blue/indigo/emerald/green family, B: amber/orange/
  // yellow/lime/red/rose family, C: violet/purple/fuchsia/pink family) so
  // the two families never look alike at a glance.
  "C-A-C-AA": "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  "C-A-HA-AA": "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  "C-A-E-AA": "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  "C-A-OA-AA": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  "C-A-E-OA": "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  "C-A-C-OA": "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  "C-A-OA-OA": "bg-green-500/10 text-green-400 border border-green-500/20",
  "C-B-BB-LB": "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  "C-B-OB-LB": "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  "C-B-BB-C": "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  "C-B-OB-C": "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  "C-B-BB-E": "bg-red-500/10 text-red-400 border border-red-500/20",
  "C-B-OB-E": "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  "C-C-BB-AA": "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  "C-C-OB-AA": "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  "C-C-BB-OA": "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  "C-C-OB-OA": "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  // PivotPattern badges, "LevelsBelow" half — "B-{Level}-{RRHH}-{SSLL}"
  // for HHLL-A/B/C/E (renamed from RRSSB-A{RRHH}-{SSLL}/B{RRHH}-{SSLL}/
  // C{SSLL}/E{RRHH} — see ScreenerUtils.PIVOT_PATTERNS / PIVOT_PATTERN_KEYS).
  // Own palette per Level so the four LevelsBelow sub-groups stay visually
  // distinct at a glance, same idea as the LevelsAbove/compressed/expanded
  // families above (colour reuse across unrelated top-level families,
  // e.g. teal/cyan/sky reappearing here, is the established convention —
  // see C-A-*/A-B-* both already sharing that same run).
  "B-A-C-C": "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  "B-A-C-SB": "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  "B-A-E-E": "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  "B-A-E-SB": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  "B-A-HA-C": "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  "B-A-HA-E": "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  "B-A-HA-SB": "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  "B-B-BB-BB": "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  "B-B-BB-OB": "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  "B-B-OB-BB": "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  "B-B-OB-OB": "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  "B-C-BB-C": "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  "B-C-OB-C": "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  "B-C-BB-E": "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  "B-C-OB-E": "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  "B-C-BB-SB": "bg-red-500/10 text-red-400 border border-red-500/20",
  "B-C-OB-SB": "bg-rose-600/10 text-rose-300 border border-rose-600/20",
  "B-E-C-BB": "bg-green-500/10 text-green-400 border border-green-500/20",
  "B-E-C-OB": "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  "B-E-E-BB": "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  "B-E-E-OB": "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  "B-E-OB-BB": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  "B-E-HA-BB": "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  "B-E-HA-OB": "bg-indigo-600/10 text-indigo-300 border border-indigo-600/20",
};

export function getBadgeClasses(label: string): string {
  return (
    PATTERN_BADGE_CLASSES[label] ??
    "bg-muted text-muted-foreground border border-border"
  );
}

/**
 * Today's pattern badges — every individual boolean flag on a CPRResult
 * (r.CL4U3, r.L4U4, ...), same badge set/colours used in the Screener's
 * "Pattern" column. Extracted out of the row JSX so other views (e.g.
 * BacktestPanel's category/sub-category results table) can render the
 * exact same badges from any CPRResult-shaped row. Returns null when no
 * pattern flag is set.
 */
export function renderTodayPatternBadges(r: CPRResult) {
  const hasAny =
    r.CL4U3 || r.L4U4 || r.EU3L4 || r.EU4L4 || r.EL4U4 || r.QU4L4 || r.U4L4 || r.U3L4 || r.U2L4 || r.U1L4 || r.CU3L2 || r.CU3L3 || r.EL2U4 || r.EL3U4 || r.CU4L2 || r.EU3L3 || r.EL3U3 || r.CU4L4 || r.CU4L3 || r.CL3U3 || r.L4U3 || r.L3U3 || r.L4U2 || r.L3U2 || r.L3U4 || r.L2U4 || r.U4L2 || r.U3L2 || r.U4L3 || r.CL3U2 || r.L1U4 || r.CL2U1 || r.CL4U2 || r.EU1L2 || r.EU1L3 || r.EU1L4 || r.EUBL1 || r.EUPL1 || r.EUTL1 || r.EUBL2 || r.EUBL3 || r.EUPL3 || r.CL1U1 || r.CU1L1 || r.CL2U2 || r.CU2L2 || r.CL4U4 || r.EU2L3 || r.EUTL3 || r.EU2L4 || r.EU2L2 || r.EUTL2 || r.EU1L1 || r.EL1U1 || r.EL1U2 || r.CL2UT || r.EL1U3 || r.EL2U3 || r.ELTU2 || r.ELBU2 || r.ELTU3 || r.ELPU2 || r.ELPU3 || r.ELBU3 || r.EL1U4 || r.ELBU4 || r.U3L3 || r.CL3U1 || r.L3CP || r.L2CP || r.L3TC || r.EL1L2 || r.EL2L1 || r.EUPL2 || r.EUTL4 || r.L2U3 || r.CU2L1 || r.CU3L1 || r.U2L3;
  if (!hasAny) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {r.CL4U3 && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">CL4U3</span>}
      {r.L4U4 && <span className="text-[10px] px-1 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">L4U4</span>}
      {r.EU3L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-medium">EU3L4</span>}
      {r.EU4L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">EU4L4</span>}
      {r.EL4U4 && <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">EL4U4</span>}
      {r.QU4L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-slate-500/10 text-slate-300 border border-slate-500/20 font-medium">QU4L4</span>}
      {r.U4L2 && <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">U4L2</span>}
      {r.U3L2 && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">U3L2</span>}
      {r.U4L3 && <span className="text-[10px] px-1 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">U4L3</span>}
      {r.U1L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20 font-medium">U1L4</span>}
      {r.U4L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">U4L4</span>}
      {r.U3L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">U3L4</span>}
      {r.U2L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">U2L4</span>}
      {r.CU3L2 && <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">CU3L2</span>}
      {r.CU3L3 && <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">CU3L3</span>}
      {r.EL2U4 && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">EL2U4</span>}
      {r.EL3U4 && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-600/10 text-blue-400 border border-blue-600/20 font-medium">EL3U4</span>}
      {r.CU4L2 && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">CU4L2</span>}
      {r.EU3L3 && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">EU3L3</span>}
      {r.EL3U3 && <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">EL3U3</span>}
      {r.CU4L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">CU4L4</span>}
      {r.CU4L3 && <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">CU4L3</span>}
      {r.CL3U3 && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">CL3U3</span>}
      {r.L4U3 && <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">L4U3</span>}
      {r.L3U3 && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">L3U3</span>}
      {r.L4U2 && <span className="text-[10px] px-1 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">L4U2</span>}
      {r.L3U2 && <span className="text-[10px] px-1 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">L3U2</span>}
      {r.L3U4 && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">L3U4</span>}
      {r.L2U4 && <span className="text-[10px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">L2U4</span>}
      {r.CL3U2 && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">CL3U2</span>}
      {r.L1U4 && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">L1U4</span>}
      {r.CL2U1 && <span className="text-[10px] px-1 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">CL2U1</span>}
      {r.CL4U2 && <span className="text-[10px] px-1 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">CL4U2</span>}
      {r.CL1U1 && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">CL1U1</span>}
      {r.CU1L1 && <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">CU1L1</span>}
      {r.CL2U2 && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">CL2U2</span>}
      {r.CU2L2 && <span className="text-[10px] px-1 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">CU2L2</span>}
      {r.CL4U4 && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">CL4U4</span>}
      {r.EU2L3 && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">EU2L3</span>}
      {r.EU2L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">EU2L4</span>}
      {r.EU2L2 && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">EU2L2</span>}
      {r.EUTL2 && <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">EUTL2</span>}
      {r.EUTL3 && <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">EUTL3</span>}
      {r.EU1L1 && <span className="text-[10px] px-1 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">EU1L1</span>}
      {r.EL1U1 && <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">EL1U1</span>}
      {r.EL1U2 && <span className="text-[10px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">EL1U2</span>}
      {r.CL2UT && <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">CL2UT</span>}
      {r.EL1U3 && <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">EL1U3</span>}
      {r.EL2U3 && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">EL2U3</span>}
      {r.ELTU2 && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">ELTU2</span>}
      {r.ELBU2 && <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">ELBU2</span>}
      {r.ELTU3 && <span className="text-[10px] px-1 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">ELTU3</span>}
      {r.ELPU2 && <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">ELPU2</span>}
      {r.ELPU3 && <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">ELPU3</span>}
      {r.ELBU3 && <span className="text-[10px] px-1 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">ELBU3</span>}
      {r.EUPL2 && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">EUPL2</span>}
      {r.EUTL4 && <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">EUTL4</span>}
      {r.L2U3 && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">L2U3</span>}
      {r.CU2L1 && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">CU2L1</span>}
      {r.CU3L1 && <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-600/10 text-cyan-300 border border-cyan-600/20 font-medium">CU3L1</span>}
      {r.U2L3 && <span className="text-[10px] px-1 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">U2L3</span>}
      {r.EL1U4 && <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-medium">EL1U4</span>}
      {r.ELBU4 && <span className="text-[10px] px-1 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">ELBU4</span>}
      {r.U3L3 && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">U3L3</span>}
      {r.CL3U1 && <span className="text-[10px] px-1 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">CL3U1</span>}
      {r.EU1L2 && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">EU1L2</span>}
      {r.EU1L3 && <span className="text-[10px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">EU1L3</span>}
      {r.EU1L4 && <span className="text-[10px] px-1 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">EU1L4</span>}
      {r.EUBL1 && <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">EUBL1</span>}
      {r.EUPL1 && <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">EUPL1</span>}
      {r.EUTL1 && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">EUTL1</span>}
      {r.EUBL2 && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">EUBL2</span>}
      {r.EUBL3 && <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">EUBL3</span>}
      {r.EUPL3 && <span className="text-[10px] px-1 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">EUPL3</span>}
      {r.L3CP && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">L3CP</span>}
      {r.L2CP && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-600/10 text-teal-300 border border-teal-600/20 font-medium">L2CP</span>}
      {r.L3TC && <span className="text-[10px] px-1 py-0.5 rounded bg-sky-600/10 text-sky-300 border border-sky-600/20 font-medium">L3TC</span>}
      {r.EL1L2 && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">EL1L2</span>}
      {r.EL2L1 && <span className="text-[10px] px-1 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">EL2L1</span>}
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
        className={`text-[10px] px-1 py-0.5 rounded border font-medium ${getBadgeClasses(prevSubLabel)}`}
        title="Previous day's CPR sub-category (prevCPR vs ppCPR)"
      >
        p-{prevSubLabel}
      </span>
    </div>
  );
}

/**
 * PivotPattern badge — "E-{Level}-{RRHH}-{SSLL}" ("expanded") or
 * "C-{Level}-{RRHH}-{SSLL}" ("compressed") (see
 * ScreenerUtils.computePivotPattern / PIVOT_PATTERN_KEYS for the
 * HHLLCategory x RRHHCategory x SSLLCategory derivation of both sets),
 * colour-coded via the same PATTERN_BADGE_CLASSES palette as every other
 * pattern badge. Replaces the previous-day "p-xxxx" badge
 * (renderPrevPatternBadge above) in the Pattern column's second row.
 * MERGED from what used to be two separate badges (renderPivotPatternBadge
 * for E-*, renderCompressedPatternBadge for C-*) into one, since
 * r.expanded/r.compressed are mutually exclusive so a row can never match
 * both families. Returns null when the row's category combo doesn't match
 * any of the 33 PIVOT_PATTERN_KEYS (most commonly because r.expanded and
 * r.compressed are both false).
 */
export function renderPivotPatternBadge(r: CPRResult) {
  const pivotPattern = computePivotPattern(r);
  if (!pivotPattern) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      <span
        className={`text-[10px] px-1 py-0.5 rounded border font-medium ${getBadgeClasses(pivotPattern)}`}
        title="PivotPattern — HHLL x RRHH x SSLL category combo"
      >
        {pivotPattern}
      </span>
    </div>
  );
}

/**
 * "LEVEL" column body — row 1: Above/Below/Inside/Outside/Skip, then
 * oV-B/oV-A, then Narrow/Wide (merged into a single badge wherever
 * Above/Below/oV-B/oV-A pairs with Narrow/Wide — see
 * renderLevelStatusRow1Badges for the full merge table), then the SSRR
 * category badge, then Equal — all rendered inline on one line; row 2:
 * SSLL + RRHH category badges, always on their own row underneath row
 * 1. Extracted out of the row JSX so other views (e.g. BacktestPanel) can
 * reuse the same LEVEL column. Mirrors ScreenerTableRow's own LEVEL cell,
 * minus the activePattern-aware tweak to the "Skip" fallback, which only
 * makes sense inside the Screener's own pattern-filter context.
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
  // SSLL + RRHH now always render on their own row, regardless of
  // Inside/Outside/narrow state. SSRR now renders entirely on row 1.
  const ssrrHhllRow = renderSSRRHHLLBadges(r);
  return (
    <div className="flex flex-col gap-1 max-w-[228px]">
      <div className="flex flex-nowrap items-center gap-1">
        {renderLevelStatusRow1Badges(r, isInsideCPR, isOutsideCPR, showWide, nothingMatched)}
      </div>
      {ssrrHhllRow}
    </div>
  );
}

/**
 * "Pattern" column body for callers outside ScreenerTableRow's own row
 * (BacktestPanel's two results tables) — mirrors the same restructuring
 * applied to the Screener's own Pattern column: row 1 is the LEVEL
 * column's leading status badge (Narow-B/Inside/Wide-A/etc, via
 * renderLevelStatusBadge) shown inline with today's pattern badge(s); row
 * 2 is the prev-day "p-xxxx" badge, unchanged. Pairs with
 * renderLevelColumnRestBadges, which renders what's left of the LEVEL
 * column once the leading badge is pulled out here. Returns null when
 * there's nothing to show in either row.
 */
export function renderPatternColumnBadges(r: CPRResult) {
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
  const statusBadge = renderLevelStatusBadge(r, isInsideCPR, isOutsideCPR, showWide, nothingMatched);
  const todayBadges = renderTodayPatternBadges(r);
  const pivotPatternBadge = renderPivotPatternBadge(r);
  if (!statusBadge && !todayBadges && !pivotPatternBadge) return null;
  return (
    <div className="flex flex-col gap-1 max-w-[228px]">
      <div className="flex flex-nowrap items-center gap-1">
        {statusBadge}
        {todayBadges}
      </div>
      {pivotPatternBadge}
    </div>
  );
}

/**
 * "LEVEL" column body for callers outside ScreenerTableRow's own row
 * (BacktestPanel's two results tables) — same as renderLevelBadges, minus
 * the leading status badge that renderPatternColumnBadges now shows in the
 * Pattern column instead. Row 1: whatever's left of
 * renderLevelStatusRow1Badges (oV-B/oV-A when unmerged, SSRR, Equal); row
 * 2: SSLL + RRHH, unchanged.
 */
export function renderLevelColumnRestBadges(r: CPRResult) {
  const isInsideCPR = passesPattern(r, "inside-cpr");
  const isOutsideCPR = passesPattern(r, "outside-cpr");
  const showWide = r.strWideCPR && !isOutsideCPR;
  const ssrrHhllRow = renderSSRRHHLLBadges(r);
  return (
    <div className="flex flex-col gap-1 max-w-[228px]">
      <div className="flex flex-nowrap items-center gap-1">
        {renderLevelStatusRestBadges(r, isInsideCPR, showWide)}
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
  computePrevPattern,
  computePivotPattern,
  getViewDirection,
  cprDistancePct,
  levelsInDistanceRange,
  renderSSRRHHLLBadges,
  renderLevelStatusRow1Badges,
  renderLevelStatusBadge,
  renderLevelStatusRestBadges,
  renderGapColumnBadges,
  renderPivotSizeCell,
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
          className="px-2 py-3 w-16 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("symbol")}
        >
          Symbol <SortIcon k="symbol" />
        </th>
        <th className="px-2 py-3 w-56 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          LEVEL
        </th>
        <th
          className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground min-w-[150px]"
          onClick={() => toggleSort("pdhPdlPct")}
          title="Position vs yesterday's High/Low"
        >
          GAP <SortIcon k="pdhPdlPct" />
        </th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pattern
        </th>
        <th
          className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("compressionRatio")}
        >
            PIVOT SIZE <SortIcon k="compressionRatio" />
        </th>
        <th
          className="px-3 py-3 pr-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("change24h")}
        >
          Price <SortIcon k="change24h" />
        </th>
        <th
          className="pl-3 pr-2 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("priceVsCpr")}
        >
          MOVE <SortIcon k="priceVsCpr" />
        </th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          PPWAY
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
}: ScreenerTableRowProps) {
  const sym = splitSymbol(r.symbol, r.source);

  const isInsideCPR = passesPattern(r, "inside-cpr");
  const isOutsideCPR = passesPattern(r, "outside-cpr");
  // Outside-CPR rows don't need the "Wide" badge — Outside already implies
  // the CPR bands separated from prev day's, so width-category noise (Wide)
  // is redundant there; only show it for non-Outside rows.
  const showWide = r.strWideCPR && !isOutsideCPR;

  // SSLL/RRHH category badges — LEVEL-column-only second row. SSRR
  // (CPRResult.SSRRCategory) now renders entirely on row
  // 1 instead (2nd badge, right after the status badge). Always rendered
  // on its own row underneath the Above/Below/Inside/Outside row,
  // regardless of Inside/Outside/narrow state, via the shared
  // renderSSRRHHLLBadges helper.
  const ssrrHhllRow = renderSSRRHHLLBadges(r);
  // Row 1 keeps every LEVEL-status badge inline on one line (Above/Below/
  // Inside/Outside/Skip, then oV-B/oV-A, then Narrow/Wide, then SSRR, then
  // Equal) so nothing gets pushed down to a second line.
  const nothingMatchedMain =
    !r.cprRising &&
    !r.cprFalling &&
    !r.narrowCPR &&
    !r.equalCPR &&
    !showWide &&
    !isInsideCPR &&
    !isOutsideCPR &&
    !(passesPattern(r, activePattern) && ["overlapping-lower", "overlapping-higher", "equal-cpr"].includes(activePattern));

  return (
    <Fragment key={rowKey}>
      <tr
        className={`hover:bg-muted/20 transition-colors ${getViewDirection(r, activePattern) ? "bg-accent/3" : ""}`}
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
          className="px-2 py-3 w-16 font-mono font-semibold text-foreground cursor-pointer select-none"
          onClick={() => toggleExpand(rowKey)}
          title="Click to expand ADK S/R ladder"
        >
          <div className="flex items-start gap-1.5">
            <span className="text-muted-foreground text-xs mt-0.5">{isExpanded ? "▼" : "▶"}</span>
            {(() => {
              const dir = getViewDirection(r, activePattern);
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
            </div>
          </div>
        </td>
        <td className="px-2 py-3 w-56">
          <div className="flex flex-col gap-1 max-w-[200px]">
            <div className="flex flex-nowrap items-center gap-1">
              {renderLevelStatusRestBadges(r, isInsideCPR, showWide)}
            </div>
            {ssrrHhllRow}
          </div>
        </td>
        <td
          className="px-3 py-3 whitespace-nowrap text-xs font-medium min-w-[150px]"
          title={`PDH: ${fmt(r.todayCPR.prevHigh)}  |  PDL: ${fmt(r.todayCPR.prevLow)}`}
        >
          {renderGapColumnBadges(r)}
        </td>
        <td className="px-2 py-3 w-56">
          <div className="flex flex-col gap-1 max-w-[200px]">
            <div className="flex flex-nowrap items-center gap-1">
              {renderLevelStatusBadge(r, isInsideCPR, isOutsideCPR, showWide, nothingMatchedMain)}
              {renderTodayPatternBadges(r)}
            </div>
            {renderPivotPatternBadge(r)}
          </div>
        </td>
        <td className="px-3 py-3 font-mono whitespace-nowrap">
          {renderPivotSizeCell(r.prevCPR, r.todayCPR, r.compressionRatio)}
        </td>
        <td className="px-3 py-3 pr-3 font-mono whitespace-nowrap">
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
        <td className={`pl-3 pr-2 py-3 whitespace-nowrap text-xs font-medium ${distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).color}`}>
          <div>
            {distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).main}
            {distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).sub && (
              <span className="text-[10px] ml-1">{distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).sub}</span>
            )}
          </div>
          <div className={`mt-0.5 ${pdhPdlStatus(r).color}`} title={`PDH: ${fmt(r.todayCPR.prevHigh)}  |  PDL: ${fmt(r.todayCPR.prevLow)}`}>
            {pdhPdlStatus(r).main}
            {pdhPdlStatus(r).sub && (
              <span className="text-[10px] ml-1">{pdhPdlStatus(r).sub}</span>
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
        </td>
      </tr>

      {isExpanded && (
        <SRLadderRow
          key={`${rowKey}-sr`}
          r={toSRLadderData(r)}
          rowKey={rowKey}
          colSpan={20}
          todayPatternBadge={renderTodayPatternBadges(r)}
          prevPatternBadge={renderPivotPatternBadge(r)}
        />
      )}
    </Fragment>
  );
}
