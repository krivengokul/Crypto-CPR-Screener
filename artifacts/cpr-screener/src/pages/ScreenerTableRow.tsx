import { Fragment, memo, type ReactNode } from "react";
import { ExternalLink, CheckCircle2, Tag } from "lucide-react";
import {
  sessionReachedTarget,
  sessionR4OrS4Hit,
  hasStickySessionPass,
  markStickySessionPass,
  latchSessionR4OrS4,
  effectiveSessionHigh,
  effectiveSessionLow,
  entryTouchedThisSession,
} from "@/lib/signalOutcome";
import type { CPRResult } from "@/lib/cpr"
import { exclusivePPDayBadge } from "@/lib/candleExclusiveBadges";
import { isMicroOrTinyCPRSize } from "@/lib/views/cprSizes";
import type { ReclaimSideState } from "@/lib/15MCandleCheck";
import { getView } from "@/lib/views";
import ScreenerCreateViewControl from "./ScreenerCreateViewControl";


/** Pass / Fail / Active / Ready for MATCH column (above n/13; R4/S4 session extreme or preferred View). */
function renderRowStatusBadge(
  r: CPRResult,
  matchingSignals: { id: string; direction?: string | null }[],
  activeSignal?: string | null,
) {
  // Latched per symbol for the UTC day so a tag survives a rescan gap.
  const r4s4 = latchSessionR4OrS4(r.symbol, sessionR4OrS4Hit(r));
  if (r4s4) {
    const badgeClass =
      r4s4 === "S4"
        ? "border-[#ff6bb5]/50 bg-[#ff6bb5]/15 text-[#ff6bb5]"
        : r4s4 === "R4"
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
          : "border-[#ff6bb5]/40 bg-[#ff6bb5]/10 text-[#ff6bb5]";
    if (r4s4 === "R4+S4") {
      return (
        <span className="inline-flex w-fit items-center gap-0.5">
          <span
            className="inline-flex shrink-0 items-center rounded border border-emerald-500/50 bg-emerald-500/15 px-1 py-0 text-[9px] font-mono font-semibold leading-tight text-emerald-400"
            title="Today session high or last price touched R4"
          >
            PASS · R4
          </span>
          <span
            className="inline-flex shrink-0 items-center rounded border border-[#ff6bb5]/50 bg-[#ff6bb5]/15 px-1 py-0 text-[9px] font-mono font-semibold leading-tight text-[#ff6bb5]"
            title="Today session low or last price touched S4"
          >
            PASS · S4
          </span>
        </span>
      );
    }
    return (
      <span
        className={`inline-flex w-fit shrink-0 items-center rounded border px-1 py-0 text-[9px] font-mono font-semibold leading-tight ${badgeClass}`}
        title={`Session reached ${r4s4} (today high/low or last price)`}
      >
        PASS · {r4s4}
      </span>
    );
  }
  const preferred =
    (activeSignal && matchingSignals.find((m) => m.id === activeSignal)) ||
    matchingSignals.find((m) => getView(m.id)?.getEntry) ||
    matchingSignals[0];
  if (!preferred) return null;
  const view = getView(preferred.id);
  const entryFn = view?.getEntry;
  const targetFn = view?.getTarget;
  const slFn = view?.getStoploss;
  const direction = preferred.direction || view?.direction || undefined;
  const isUp = direction === "Up";
  const isDown = direction === "Down";
  let status: "pass" | "fail" | "active" | "ready" | null = null;
  const viewIdForSticky = preferred?.id ?? null;
  const sessHi = effectiveSessionHigh(r.todayHigh, r.currentPrice);
  const sessLo = effectiveSessionLow(r.todayLow, r.currentPrice);
  // Sticky Pass for this exact symbol + View this UTC day — never fall back to Active/Ready.
  if (hasStickySessionPass(r.symbol, viewIdForSticky)) {
    status = "pass";
  } else if (
    targetFn &&
    sessionReachedTarget(
      direction ?? "",
      targetFn(r),
      sessHi,
      sessLo,
      r.currentPrice,
    )
  ) {
    status = "pass";
    markStickySessionPass(r.symbol, viewIdForSticky);
  } else if (slFn) {
    const sl = slFn(r);
    const hitSlUp =
      isUp &&
      Number.isFinite(sl) &&
      ((typeof r.todayLow === "number" && r.todayLow <= sl) ||
        (typeof r.currentPrice === "number" && r.currentPrice <= sl));
    const hitSlDown =
      isDown &&
      Number.isFinite(sl) &&
      ((typeof r.todayHigh === "number" && r.todayHigh >= sl) ||
        (typeof r.currentPrice === "number" && r.currentPrice >= sl));
    if (hitSlUp || hitSlDown) status = "fail";
  }
  if (!status && entryFn) {
    status = entryTouchedThisSession(direction ?? "", entryFn(r), r.currentPrice, r.todayHigh, r.todayLow)
      ? "active"
      : "ready";
  }
  if (!status) return null;
  if (status === "pass") {
    return (
      <span
        className={`inline-flex w-fit shrink-0 items-center rounded border px-1 py-0 text-[9px] font-mono font-semibold leading-tight ${
          isDown
            ? "border-[#ff6bb5]/40 bg-[#ff6bb5]/10 text-[#ff6bb5]"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
        }`}
        title="Target reached"
      >
        Pass
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span
        className="inline-flex w-fit shrink-0 items-center rounded border px-1 py-0 text-[9px] font-mono font-semibold leading-tight"
        style={{
          color: "#f87171",
          borderColor: "rgba(248, 113, 113, 0.45)",
          backgroundColor: "rgba(248, 113, 113, 0.15)",
        }}
        title="Stop loss hit"
      >
        Fail
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        className="mt-0.5 inline-flex w-fit shrink-0 items-center rounded border border-lime-500/40 bg-lime-500/10 px-1 py-0 text-[9px] font-mono font-semibold leading-tight text-lime-400 animate-pulse"
        title="Entry touched"
      >
        Active
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 inline-flex w-fit shrink-0 items-center rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0 text-[9px] font-mono font-semibold leading-tight text-sky-300"
      title="Entry not yet touched"
    >
      Ready
    </span>
  );
}

/** True when `viewKey` is a descendant (via parentKey) of `ancestorKey`. */
function isViewUnder(viewKey: string, ancestorKey: string): boolean {
  const seen = new Set<string>();
  let cur = getView(viewKey);
  while (cur?.parentKey && !seen.has(cur.key)) {
    if (cur.parentKey === ancestorKey) return true;
    seen.add(cur.key);
    cur = getView(cur.parentKey);
  }
  return false;
}
import {
  type CPRResultWithSource,
  type ActiveTab,
  type SortKey,
  type SortDir,
  fmt,
  fmtPct,
  splitSymbol,
  getChartUrl,
  openChartInNewTab,
  hasKnownChartMapping,
  passesPattern,
  distanceFromCPR,
  pdhPdlStatus,
  computePrevPattern,
  computeInnerLevelPattern,
  computeGapBadge,
  getViewDirection,
  getAnyViewDirection,
  getMatchingSignals,
  cprDistancePct,
  levelsInDistanceRange,
  renderSSRRHHLLBadges,
  renderSSLLCategoryBadge,
  renderHHLLCategoryBadge,
  renderSSRRCategoryBadge,
  renderRRHHCategoryBadge,
  renderLevelStatusRow1Badges,
  renderLevelStatusBadge,
  renderLevelStatusRestBadges,
  renderGapColumnBadges,
  renderPivotSizeCell,
  getWidthCategory,
} from "./ScreenerUtils";
import { formatTradFiSubtitle } from "@/lib/tradfiDisplay";
import {
  getRowCategory,
  getSymbolCategoryCaption,
  CATEGORY_TEXT_COLORS,
} from "@/lib/rowCategory";
import { SRLadderRow, toSRLadderData } from "./SRLadderPanel";
import { getLadderMatchSummary, type LevelCheckCondition } from "./SRLadderDiff";

/** The exact category badge shown below a symbol in the Screener table. */
export function renderScreenerSymbolCategoryBadge(r: CPRResult): ReactNode {
  const category = getRowCategory(r);
  const isInCpr = !!(r.InsideCPR || (r as { insideCPR?: boolean }).insideCPR);
  const isOutCpr = !!r.outCPR;
  const isNarrow = !!(r.narrowCPR && !isInCpr);
  const isWide = !!(r.strWideCPR && !isOutCpr);
  const touchish = category === "touch" || r.touchCategory || !category;
  const touchColor = CATEGORY_TEXT_COLORS.touch ?? "text-lime-300";
  const touchSlash = (title: string, label: string, labelClass: string) => (
    <span
      className="mt-0.5 text-[10px] uppercase tracking-wide leading-none whitespace-nowrap"
      title={title}
    >
      <span className={touchColor}>TOUCH</span>
      <span className="text-muted-foreground">/</span>
      <span className={labelClass}>{label}</span>
    </span>
  );
  const overlapCaption = (label: string, labelClass: string, title: string) => (
    <span
      className="mt-0.5 text-[10px] uppercase tracking-wide leading-none whitespace-nowrap"
      title={title}
    >
      <span className={touchColor}>OVERLAP</span>
      {" "}
      <span className={labelClass}>{label}</span>
    </span>
  );

  if (isInCpr && touchish) {
    return touchSlash("Inside CPR — TOUCH / INCPR", "INCPR", "text-yellow-400");
  }
  if (isOutCpr && touchish) {
    return touchSlash("Outside CPR — TOUCH / OUTCPR", "OUTCPR", "text-orange-400");
  }
  if (r.overlapHigher && touchish) {
    if (isWide) {
      return overlapCaption("WIDE-A", "text-green-400", "Overlap Above (Wide) — OVERLAP WIDE-A");
    }
    if (isNarrow) {
      return overlapCaption("NARROW-A", "text-green-400", "Overlap Above (Narrow) — OVERLAP NARROW-A");
    }
    return touchSlash("Overlap Above — TOUCH / OVA", "OVA", "text-[#ff6bb5]");
  }
  if (r.overlapLower && touchish) {
    if (isWide) {
      return overlapCaption("WIDE-B", "text-[#ff6bb5]", "Overlap Below (Wide) — OVERLAP WIDE-B");
    }
    if (isNarrow) {
      return overlapCaption("NARROW-B", "text-[#ff6bb5]", "Overlap Below (Narrow) — OVERLAP NARROW-B");
    }
    return touchSlash("Overlap Below — TOUCH / OVB", "OVB", "text-green-400");
  }

  const caption = getSymbolCategoryCaption(r);
  if (!caption) return null;
  return (
    <span
      className={`mt-0.5 text-[10px] uppercase tracking-wide leading-none whitespace-nowrap ${caption.className}`}
      title={`Category: ${caption.label}`}
    >
      {caption.label}
    </span>
  );
}

/**
 * PATTERN_BADGE_CLASSES — single source of truth for pattern badge colours.
 * Keyed by badge label (CL4U3, EU4L4, ...). Used for today's pattern badges
 * and for the previous-day "p-xxxx" badge so both share the same palette.
 */
export const PATTERN_BADGE_CLASSES: Record<string, string> = {
  // --- Pattern Badges starting with C (Compressed: Cyan #00BCD4 / Sky / Light Cyan for Ultra Compressed) ---
  // Ultra Compressed (Level 4): light / vivid cyan
  CL4U4: "bg-cyan-300/10 text-cyan-200 border border-cyan-300/30",
  CU4L4: "bg-cyan-300/10 text-cyan-200 border border-cyan-300/30",
  CL4U3: "bg-cyan-400/10 text-cyan-300 border border-cyan-400/20",
  CU4L3: "bg-cyan-400/10 text-cyan-300 border border-cyan-400/20",
  CU4L2: "bg-cyan-400/10 text-cyan-300 border border-cyan-400/20",
  CL4U2: "bg-cyan-300/10 text-cyan-200 border border-cyan-300/20",
  // Compressed (Level 3): cyan / sky
  CU3L3: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  CL3U3: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  CU3L2: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20",
  CL3U2: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20",
  CU3L1: "bg-sky-400/10 text-sky-300 border border-sky-400/20",
  CL3U1: "bg-sky-400/10 text-sky-300 border border-sky-400/20",
  // Compressed (Level 2 & 1): cyan / sky
  CL2U2: "bg-cyan-600/10 text-cyan-300 border border-cyan-600/20",
  CU2L2: "bg-cyan-600/10 text-cyan-300 border border-cyan-600/20",
  CL2U1: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
  CU2L1: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
  CU2BC: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
  CL1U1: "bg-cyan-600/10 text-cyan-400 border border-cyan-600/20",
  CU1L1: "bg-cyan-600/10 text-cyan-400 border border-cyan-600/20",
  CL2UT: "bg-sky-500/10 text-sky-400 border border-sky-500/20",

  // --- Pattern Badges starting with E (Expanded: Purple #9C27B0 / Deeper Purple for Highly Expanded) ---
  // Highly Expanded (Level 4): deep / rich purple
  EU4L4: "bg-purple-800/15 text-purple-200 border border-purple-800/30",
  EL4U4: "bg-purple-800/15 text-purple-200 border border-purple-800/30",
  EU3L4: "bg-purple-700/15 text-purple-300 border border-purple-700/30",
  EL3U4: "bg-purple-700/15 text-purple-300 border border-purple-700/30",
  EL2U4: "bg-purple-700/15 text-purple-300 border border-purple-700/30",
  EU2L4: "bg-[#ff6bb5]/15 text-[#ffb3d9] border-[#ff6bb5]/45 shadow-[0_0_10px_rgba(255,107,181,0.2)]",  // soft magenta glass (2c)
  EU1L4: "bg-purple-700/15 text-purple-300 border border-purple-700/30",
  EL1U4: "bg-purple-700/15 text-purple-300 border border-purple-700/30",
  EUTL4: "bg-purple-800/15 text-purple-200 border border-purple-800/30",
  ELBU4: "bg-purple-800/15 text-purple-200 border border-purple-800/30",
  // Expanded (Level 3): purple
  EU3L3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  EL3U3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  EU2L3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  EL2U3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  EU1L3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  EL1U3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  EUTL3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  ELTU3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  ELPU3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  ELBU3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  EUBL3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  EUPL3: "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  // Moderate Expanded (Level 2 & 1): purple / violet
  EU2L2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EU1L1: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EL1U1: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EL1U2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EU1L2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EUTL2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  ELTU2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  ELBU2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  ELPU2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EUPL2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EUBL1: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EUPL1: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EUTL1: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EUBL2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EL1L2: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  EL2L1: "bg-purple-500/10 text-purple-400 border border-purple-500/20",

  // --- Other Pattern Badges ---
  L4U4: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  QU4L4: "bg-slate-500/10 text-slate-300 border border-slate-500/20",
  U4L2: "bg-green-500/10 text-green-400 border border-green-500/20",
  U3L2: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  U4L3: "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  U4L4: "bg-green-600/10 text-green-300 border border-green-600/20",
  U1L4: "bg-emerald-600/10 text-emerald-300 border border-emerald-600/20",
  U3L4: "bg-lime-600/10 text-lime-300 border border-lime-600/20",
  U2L4: "bg-green-400/10 text-green-300 border border-green-400/20",
  U3L3: "bg-emerald-400/10 text-emerald-300 border border-emerald-400/20",
  L4U3: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  L3U3: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  L4U2: "bg-pink-400/15 text-[#ff6bb5] border border-pink-400/30",
  L3U2: "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  L3U4: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  L2U4: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  L1U4: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  L2U3: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  U2L3: "bg-lime-400/10 text-lime-300 border border-lime-400/20",
  L3CP: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  L2CP: "bg-teal-600/10 text-teal-300 border border-teal-600/20",
  L3TC: "bg-sky-600/10 text-sky-300 border border-sky-600/20",

  // --- PivotPattern badges starting with E (Expanded: Purple #9C27B0 / Deeper Purple for Highly Expanded) ---
  "E-A-AA-OB": "bg-purple-500/10 text-purple-300 border border-purple-500/20",
  "E-A-OA-OB": "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  "E-A-AA-SB": "bg-purple-400/10 text-purple-300 border border-purple-400/20",
  "E-A-AA-C": "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  "E-A-OA-C": "bg-purple-600/10 text-purple-400 border border-purple-600/20",
  "E-A-AA-E": "bg-purple-700/10 text-purple-300 border border-purple-700/20",
  "E-A-OA-E": "bg-purple-700/10 text-purple-300 border border-purple-700/20",
  "E-B-RA-BB": "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  "E-B-C-BB": "bg-purple-500/10 text-purple-300 border border-purple-500/20",
  "E-B-E-BB": "bg-purple-700/10 text-purple-300 border border-purple-700/20",
  "E-B-C-OB": "bg-purple-600/10 text-purple-300 border border-purple-600/20",
  "E-B-E-OB": "bg-purple-700/10 text-purple-300 border border-purple-700/20",
  // Highly Expanded (Level E): deeper purple
  "E-E-AA-BB": "bg-purple-800/15 text-purple-200 border border-purple-800/30",
  "E-E-OA-BB": "bg-purple-800/15 text-purple-200 border border-purple-800/30",
  "E-E-AA-OB": "bg-purple-900/20 text-purple-200 border border-purple-900/30",
  "E-E-OA-OB": "bg-purple-900/20 text-purple-200 border border-purple-900/30",

  // PivotPattern badges, "LevelsAbove" half — "A-E-{RRHH}-{SSLL}"
  "A-E-AA-C": "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  "A-E-OA-C": "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  "A-E-AA-E": "bg-lime-500/10 text-lime-400 border border-lime-500/20",
  "A-E-OA-E": "bg-green-600/10 text-green-300 border border-green-600/20",
  "A-E-AA-LB": "bg-emerald-600/10 text-emerald-300 border border-emerald-600/20",
  "A-E-OA-LB": "bg-teal-600/10 text-teal-300 border border-teal-600/20",

  // PivotPattern badges, "LevelsAbove" half continued — "A-{Level}-{RRHH}-{SSLL}"
  "A-A-AA-AA": "bg-green-500/10 text-green-400 border border-green-500/20",
  "A-A-AA-OA": "bg-lime-600/10 text-lime-300 border border-lime-600/20",
  "A-A-OA-AA": "bg-green-400/10 text-green-300 border border-green-400/20",
  "A-A-OA-OA": "bg-emerald-400/10 text-emerald-300 border border-emerald-400/20",
  "A-B-C-C": "bg-teal-400/10 text-teal-300 border border-teal-400/20",
  "A-B-C-LB": "bg-lime-400/10 text-lime-300 border border-lime-400/20",
  "A-B-E-E": "bg-green-700/10 text-green-300 border border-green-700/20",
  "A-B-E-LB": "bg-emerald-700/10 text-emerald-300 border border-emerald-700/20",
  "A-B-RA-C": "bg-teal-700/10 text-teal-300 border border-teal-700/20",
  "A-B-RA-E": "bg-lime-700/10 text-lime-300 border border-lime-700/20",
  "A-B-RA-LB": "bg-green-300/10 text-green-200 border border-green-300/20",
  "A-C-C-AA": "bg-emerald-300/10 text-emerald-200 border border-emerald-300/20",
  "A-C-C-OA": "bg-teal-300/10 text-teal-200 border border-teal-300/20",
  "A-C-E-AA": "bg-lime-300/10 text-lime-200 border border-lime-300/20",
  "A-C-E-OA": "bg-green-800/10 text-green-300 border border-green-800/20",
  "A-C-RA-AA": "bg-emerald-800/10 text-emerald-300 border border-emerald-800/20",
  "A-C-RA-OA": "bg-teal-800/10 text-teal-300 border border-teal-800/20",

  // --- PivotPattern badges starting with C (Compressed: Cyan #00BCD4 / Light Cyan for Ultra Compressed) ---
  "C-A-C-AA": "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  "C-A-HA-AA": "bg-cyan-400/10 text-cyan-300 border border-cyan-400/20",
  "C-A-E-AA": "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  "C-A-OA-AA": "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20",
  "C-A-OB-AA": "bg-sky-600/10 text-sky-300 border border-sky-600/20",
  "C-A-E-OA": "bg-cyan-600/10 text-cyan-300 border border-cyan-600/20",
  "C-A-C-OA": "bg-cyan-400/10 text-cyan-300 border border-cyan-400/20",
  "C-A-OA-OA": "bg-sky-400/10 text-sky-300 border border-sky-400/20",
  "C-B-BB-LB": "bg-cyan-600/10 text-cyan-300 border border-cyan-600/20",
  "C-B-OB-LB": "bg-sky-600/10 text-sky-300 border border-sky-600/20",
  "C-B-BB-C": "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  "C-B-OB-C": "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  "C-B-BB-E": "bg-cyan-700/10 text-cyan-300 border border-cyan-700/20",
  "C-B-OB-E": "bg-sky-700/10 text-sky-300 border border-sky-700/20",
  // Ultra Compressed (Level C): light / bright cyan
  "C-C-BB-AA": "bg-cyan-300/10 text-cyan-200 border border-cyan-300/30",
  "C-C-OB-AA": "bg-cyan-400/10 text-cyan-300 border border-cyan-400/30",
  "C-C-BB-OA": "bg-sky-300/10 text-sky-200 border border-sky-300/30",
  "C-C-OB-OA": "bg-cyan-300/10 text-cyan-300 border border-cyan-300/30",
  "C-C-C-AA": "bg-cyan-400/10 text-cyan-200 border border-cyan-400/30",

  // PivotPattern badges, "LevelsBelow" half — "B-{Level}-{RRHH}-{SSLL}" (All Red family)
  "B-A-C-C": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-A-C-SB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-A-E-E": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-A-E-SB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-A-HA-C": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-A-HA-E": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-A-HA-SB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-B-BB-BB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-B-BB-OB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-B-OB-BB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-B-OB-OB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-C-BB-C": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-C-OB-C": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-C-BB-E": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-C-OB-E": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-C-BB-SB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-E-C-BB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-E-C-OB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-E-E-BB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-E-E-OB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-E-OB-BB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-E-OB-OB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
  "B-E-HA-BB": "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20",
};

/**
 * Fallback badge style for when a PivotPattern label has no entry in
 * PATTERN_BADGE_CLASSES (a genuine "unknown label" bug case, distinct
 * from "no pattern matched" — see MISSING_PATTERN_CLASSES below for
 * that). Kept as the getBadgeClasses default, unchanged.
 */
const UNKNOWN_LABEL_CLASSES = "bg-muted text-muted-foreground border border-border";

/**
 * "No pattern matched" badge style — used by renderPivotPatternBadge /
 * renderPrevPatternBadge instead of returning null, so a row that legitimately
 * has no PivotPattern combo (r.expanded/r.compressed/r.LevelsAbove/
 * r.LevelsBelow all false, or no ppCPR history yet) still shows a
 * clearly "missing" badge rather than leaving a blank gap next to the
 * "Levels VIEW" / "PDay S/R" labels. Dashed border + muted slate colour
 * so it reads as "absence", never mistaken for a real green/red/etc.
 * pattern family.
 */
const MISSING_PATTERN_CLASSES = "bg-slate-500/5 text-slate-500 border border-dashed border-slate-500/30";

export function getBadgeClasses(label: string): string {
  if (PATTERN_BADGE_CLASSES[label]) {
    return PATTERN_BADGE_CLASSES[label];
  }
  // Dynamic fallback for any pattern/subpattern/pivot-pattern starting with E (Expanded: Purple #9C27B0)
  if (label.startsWith("E")) {
    return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
  }
  // Dynamic fallback for any pattern/subpattern/pivot-pattern starting with C (Compressed: Cyan #00BCD4)
  if (label.startsWith("C")) {
    return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
  }
  // Dynamic fallback for any pattern/subpattern/pivot-pattern starting with A (LevelsAbove: Green)
  if (label.startsWith("A")) {
    return "bg-green-500/10 text-green-400 border border-green-500/20";
  }
  // Dynamic fallback for any pattern/subpattern/pivot-pattern starting with B (LevelsBelow: Red)
  if (label.startsWith("B")) {
    return "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/20";
  }
  return UNKNOWN_LABEL_CLASSES;
}

/**
 * Today's pattern badges — every individual boolean flag on a CPRResult
 * (r.CL4U3, r.L4U4, ...), same badge set/colours used in the Screener's
 * "Pattern" column. Extracted out of the row JSX so other views (e.g.
 * BacktestPanel's category/sub-category results table) can render the
 * exact same badges from any CPRResult-shaped row. Returns null when no
 * pattern flag is set.
 */
export const TODAY_OUTER_PATTERN_KEYS: (keyof CPRResult)[] = [
  "CL4U3",
  "L4U4",
  "EU3L4",
  "EU4L4",
  "EL4U4",
  "QU4L4",
  "U4L2",
  "U3L2",
  "U4L3",
  "U1L4",
  "U4L4",
  "U3L4",
  "U2L4",
  "CU3L2",
  "CU3L3",
  "EL2U4",
  "EL3U4",
  "CU4L2",
  "EU3L3",
  "EL3U3",
  "CU4L4",
  "CU4L3",
  "CL3U3",
  "L4U3",
  "L3U3",
  "L4U2",
  "L3U2",
  "L3U4",
  "L2U4",
  "CL3U2",
  "L1U4",
  "CL2U1",
  "CL4U2",
  "CL1U1",
  "CU1L1",
  "CL2U2",
  "CU2L2",
  "CU2BC",
  "CL4U4",
  "EU2L3",
  "EU2L4",
  "EU2L2",
  "EUTL2",
  "EUTL3",
  "EU1L1",
  "EL1U1",
  "EL1U2",
  "CL2UT",
  "EL1U3",
  "EL2U3",
  "ELTU2",
  "ELBU2",
  "ELTU3",
  "ELPU2",
  "ELPU3",
  "ELBU3",
  "EUPL2",
  "EUTL4",
  "L2U3",
  "CU2L1",
  "CU3L1",
  "U2L3",
  "EL1U4",
  "ELBU4",
  "U3L3",
  "CL3U1",
  "EU1L2",
  "EU1L3",
  "EU1L4",
  "EUBL1",
  "EUPL1",
  "EUTL1",
  "EUBL2",
  "EUBL3",
  "EUPL3",
  "L3CP",
  "L2CP",
  "L3TC",
  "EL1L2",
  "EL2L1",
];

/**
 * Returns active outer pattern keys as a joined string, e.g. "EU1L4" or "EU3L4".
 */
export function computeOuterLevelPattern(r: CPRResult): string | null {
  const matched = TODAY_OUTER_PATTERN_KEYS.filter((k) => !!r[k]);
  if (matched.length === 0) return null;
  return matched.join("/");
}

/**
 * Merges inner pattern (e.g. "A-A-AA-AA") and outer level pattern (e.g. "EU1L4")
 * into a single unified pattern code, e.g. "A-A-AA-AA-EU1L4".
 */
export function getCombinedPatternCode(r: CPRResult): {
  combined: string | null;
  inner: string | null;
  outer: string | null;
} {
  const inner = computeInnerLevelPattern(r);
  const outer = computeOuterLevelPattern(r);
  if (inner && outer) {
    return { combined: `${inner}-${outer}`, inner, outer };
  }
  if (inner) {
    return { combined: inner, inner, outer: null };
  }
  if (outer) {
    return { combined: outer, inner: null, outer };
  }
  return { combined: null, inner: null, outer: null };
}

/**
 * Renders the combined pattern code (inner + outer, e.g. "A-A-AA-AA-EU1L4")
 * as a clean text label in the first row of the Pattern column.
 */
export function renderCombinedPatternLabel(r: CPRResult) {
  const { combined, inner, outer } = getCombinedPatternCode(r);
  if (!combined) {
    return <span className="text-muted-foreground/60 text-xs">—</span>;
  }
  const colorClass =
    combined.startsWith("A-")
      ? "text-emerald-400"
      : combined.startsWith("E-") || combined.startsWith("EU") || combined.startsWith("EL")
      ? "text-purple-300"
      : combined.startsWith("C-") || combined.startsWith("CU") || combined.startsWith("CL")
      ? "text-cyan-300"
      : combined.startsWith("B-")
      ? "text-[#ff6bb5]"
      : combined.startsWith("U")
      ? "text-lime-300"
      : combined.startsWith("L")
      ? "text-indigo-300"
      : "text-sky-300";

  return (
    <span
      className={`font-mono text-[11px] font-bold tracking-tight whitespace-nowrap select-all ${colorClass}`}
      title={`Combined Pattern: ${combined}${inner ? ` (Inner: ${inner})` : ""}${outer ? ` (Outer: ${outer})` : ""}`}
    >
      {combined}
    </span>
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
  const activeKeys = TODAY_OUTER_PATTERN_KEYS.filter((key) => !!r[key]);
  if (activeKeys.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {activeKeys.map((key) => (
        <span
          key={key}
          className={
            key === "EU2L4"
              ? `text-[10px] px-1.5 py-0.5 rounded-md border font-semibold tracking-wide ${getBadgeClasses(key)}`
              : `text-[10px] px-1 py-0.5 rounded border font-medium ${getBadgeClasses(key)}`
          }
        >
          {key}
        </span>
      ))}
    </div>
  );
}

/**
 * Previous day's pattern badge (prevCPR vs ppCPR), rendered as "p-xxxx" and
 * colour-coded with the same palette as today's pattern badges. Extracted
 * for reuse outside ScreenerTableRow (see renderTodayPatternBadges above).
 * CHANGED: no longer returns null when there isn't enough history (no
 * ppCPR) — renders the MISSING_PATTERN_CLASSES placeholder badge instead,
 * so callers that always want a badge slot filled (e.g. SRLadder's
 * "PDay S/R" header) don't get a layout gap. Pass showMissing={false} to
 * restore the old null-when-absent behaviour for callers that don't want
 * the placeholder (e.g. dense table cells where a blank is preferable to
 * a dashed placeholder on every row).
 */
export function renderPrevPatternBadge(r: CPRResult, showMissing: boolean = true) {
  const prevSubLabel = computePrevPattern(r.prevCPR, r.ppCPR);
  if (!prevSubLabel) {
    if (!showMissing) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        <span
          className={`text-[10px] px-1 py-0.5 rounded font-medium ${MISSING_PATTERN_CLASSES}`}
          title="No previous-day pattern (not enough CPR history)"
        >
          p-—
        </span>
      </div>
    );
  }
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
 * ScreenerUtils.computeInnerLevelPattern / INNER_LEVEL_PATTERN_KEYS for the
 * HHLLCategory x RRHHCategory x SSLLCategory derivation of both sets),
 * colour-coded via the same PATTERN_BADGE_CLASSES palette as every other
 * pattern badge. Replaces the previous-day "p-xxxx" badge
 * (renderPrevPatternBadge above) in the Pattern column's second row.
 * MERGED from what used to be two separate badges (renderPivotPatternBadge
 * for E-*, renderCompressedPatternBadge for C-*) into one, since
 * r.expanded/r.compressed are mutually exclusive so a row can never match
 * both families. CHANGED: no longer returns null when the row's category
 * combo doesn't match any INNER_LEVEL_PATTERN_KEYS entry (most commonly because
 * r.expanded/r.compressed/r.LevelsAbove/r.LevelsBelow are all false) —
 * renders the MISSING_PATTERN_CLASSES placeholder badge instead, so
 * callers that always want a badge slot filled (e.g. SRLadder's
 * "Levels VIEW" header) don't get a layout gap. Pass showMissing={false}
 * to restore the old null-when-absent behaviour.
 */
export function renderPivotPatternBadge(r: CPRResult, showMissing: boolean = true) {
  const pivotPattern = computeInnerLevelPattern(r);
  if (!pivotPattern) {
    if (!showMissing) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        <span
          className={`text-[10px] px-1 py-0.5 rounded font-medium ${MISSING_PATTERN_CLASSES}`}
          title="No PivotPattern match for this row's HHLL x RRHH x SSLL combo"
        >
          —
        </span>
      </div>
    );
  }
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
 * GAP_BADGE_COLOR — colour keyed by GapBadge's first prefix letter (R/S/Q,
 * from RRSSGapCategory: RRGap/SSGap/SSRR-Q), mirroring
 * renderRRSSGapCategoryBadge's own green/red/amber palette so the GapBadge
 * reads consistently with the category it leads with.
 */
const GAP_BADGE_COLOR: Record<"R" | "S" | "Q", string> = {
  R: "bg-green-500/10 text-green-400 border border-green-500/30",
  S: "bg-[#ff6bb5]/10 text-[#ff6bb5] border border-[#ff6bb5]/30",
  Q: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
};

/**
 * GapBadge — composite label combining RRSSGapCategory + PDHPDLGapCategory
 * + prev/today HLSwitch (Gap-prefixed per hlGapWinner) into one badge, e.g.
 * "RH-GapAA", "SL-QGapA" (see ScreenerUtils.computeGapBadge for the
 * derivation). Always renders exactly one badge — computeGapBadge never
 * returns null, since all four source fields are always present.
 */
export function renderGapBadge(r: CPRResult) {
  const label = computeGapBadge(r);
  const colorKey = label.charAt(0) as "R" | "S" | "Q";
  // RH-GapBB: bright pink (overrides R-prefix green) — same 2c emphasis as EU2L4
  const classes =
    label === "RH-GapBB"
      ? "bg-[#ff6bb5]/15 text-[#ffb3d9] border border-[#ff6bb5]/45 shadow-[0_0_10px_rgba(255,107,181,0.2)]"
      : (GAP_BADGE_COLOR[colorKey] ?? GAP_BADGE_COLOR.Q);
  const isEmphasis = label === "RH-GapBB";
  return (
    <span
      className={
        isEmphasis
          ? `text-[10px] px-1.5 py-0.5 rounded-md font-semibold tracking-wide ${classes}`
          : `text-[10px] px-1 py-0.5 rounded font-medium ${classes}`
      }
      title="GapBadge — RRSSGapCategory x PDHPDLGapCategory x prev/today HLSwitch (Gap-prefixed per hlGapWinner)"
    >
      {label}
    </span>
  );
}

/**
 * renderPivotAndGapBadges — PivotPattern badge + GapBadge together on one
 * line, for the Pattern column's second row (ScreenerTableRow). Thin
 * combinator over computeInnerLevelPattern/getBadgeClasses (mirroring
 * renderPivotPatternBadge(r, showMissing=false)'s null-when-absent
 * behaviour for the pivot half) and renderGapBadge, so the two sit side by
 * side without nesting renderPivotPatternBadge's own wrapper div (which
 * would double up on its "mt-1" margin).
 *
 * flex-nowrap (not flex-wrap): the two badges must stay on ONE row. With wrap,
 * the pair overflowed the ~160px Pattern column and the GapBadge dropped to a
 * third row, making the whole table row taller. nowrap lets the column grow
 * to fit the pair instead.
 */
export function renderPivotAndGapBadges(r: CPRResult) {
  const pivotPattern = computeInnerLevelPattern(r);
  return (
    <div className="flex flex-nowrap items-center gap-1 mt-1 whitespace-nowrap">
      {pivotPattern && (
        <span
          className={`text-[10px] px-1 py-0.5 rounded border font-medium ${getBadgeClasses(pivotPattern)}`}
          title="PivotPattern — HHLL x RRHH x SSLL category combo"
        >
          {pivotPattern}
        </span>
      )}
      {renderGapBadge(r)}
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
  const isInsideCPR = !!(r.InsideCPR || (r as any).insideCPR);
  const isOutsideCPR = !!r.outCPR;
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
 * 2 is the PivotPattern badge + GapBadge together (renderPivotAndGapBadges),
 * same as the Screener's own Pattern column. Pairs with
 * renderLevelColumnRestBadges, which renders what's left of the LEVEL
 * column once the leading badge is pulled out here. The composite GapBadge
 * is shown under GAP in the expanded SR ladder.
 */
export function renderPatternColumnBadges(r: CPRResult) {
  const isInsideCPR = !!(r.InsideCPR || (r as any).insideCPR);
  const isOutsideCPR = !!r.outCPR;
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
  return (
    <div className="flex flex-col gap-1 max-w-[228px]">
      <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
        {renderCombinedPatternLabel(r)}
      </div>
      <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
        {statusBadge}
      </div>
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
  const isInsideCPR = !!(r.InsideCPR || (r as any).insideCPR);
  const isOutsideCPR = !!r.outCPR;
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

/**
 * Active Views column body — every View (left-nav leaf) this row currently
 * satisfies, across all categories (see getMatchingSignals).
 * Displays each matching View name, its direction-coloured Tag icon, and an
 * inline edit action for registered Views. Renders nothing when no View matches.
 */
export function renderMatchingSignals(
  r: CPRResult,
  views: ReturnType<typeof getMatchingSignals> = getMatchingSignals(r),
  renderAction?: (viewId: string) => ReactNode,
) {
  if (views.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 max-w-[280px]">
      {views.map((v) => {
        const view = getView(v.id);
        const direction = v.direction || view?.direction;
        const isUp = direction === "Up";
        const isDown = direction === "Down";
        const dirColor = isUp
          ? "text-emerald-400"
          : isDown
            ? "text-[#ff6bb5]"
            : "text-slate-400";
        return (
          <div key={v.id} className="flex h-11 flex-col justify-center gap-0.5 overflow-hidden">
            <div className="flex flex-nowrap items-center gap-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Tag className={`w-3 h-3 shrink-0 ${dirColor}`} aria-hidden />
                <div
                  className={`text-[11px] font-semibold leading-tight truncate ${dirColor}`}
                  title={v.label}
                >
                  {v.label}
                </div>
              </div>
              {view?.kind === "view" ? renderAction?.(v.id) : null}
            </div>
            <span className="truncate font-mono text-[10px] leading-3 text-muted-foreground" title={v.id}>
              {v.id}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface ScreenerTableHeaderProps {
  canShowCombined: boolean;
  activeTab: ActiveTab;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (key: SortKey) => void;
}

/** Table <thead> for the screener results table. Moved from Screener.tsx as-is. */
export function ScreenerTableHeader({
  sortKey,
  sortDir,
  toggleSort,
}: ScreenerTableHeaderProps) {
  // `reverse` flips the arrow for columns where the natural reading is the
  // opposite (MATCH, MOVE): asc shows ▼ and desc shows ▲. Sorting itself is
  // unchanged; only the icon differs. The unsorted ↕ stays the same.
  const SortIcon = ({ k, reverse = false }: { k: SortKey; reverse?: boolean }) => (
    <span className="text-[10px] ml-1 text-white">
      {sortKey === k
        ? (sortDir === "asc") !== reverse
          ? "▲"
          : "▼"
        : "↕"}
    </span>
  );

  return (
    <thead>
      <tr className="border-b border-border bg-muted/30">
        <th
          className="px-2 py-3 w-16 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("symbol")}
        >
          Symbol <SortIcon k="symbol" />
        </th>
        <th className="px-2 py-3 w-40 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pattern
        </th>
        <th
          className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[180px]"
          title="Every View this row currently satisfies, across all categories"
        >
          Active Views
        </th>
        <th
          className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("ladderCheck")}
          title="Level Check (matching/13) for each signal in the SIGNAL column, one line per signal, graded with its own levelCheckDefs. Sort by each row's best n/13 — desc surfaces 13/13 first, then 12/13, etc."
        >
          <span className="inline-flex items-center whitespace-nowrap">
            MATCH <SortIcon k="ladderCheck" reverse />
          </span>
        </th>
        <th
          className="pl-3 pr-2 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("priceVsCpr")}
        >
          MOVE <SortIcon k="priceVsCpr" reverse />
        </th>
        <th
          className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[160px] cursor-pointer hover:text-foreground"
          onClick={() => toggleSort("compressionRatio")}
        >
            PIVOT SIZE <SortIcon k="compressionRatio" />
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
  activePattern?: string;
  activeSignal?: string;
  /** Display name of the currently selected signal (the highlighted "SIGNALS:" pill), e.g. "A-A-AA-AA-EU3L4-GapB". Shown as a badge next to "Levels VIEW" in the expanded S/R ladder. Omit to hide it. */
  viewName?: string;
  /** The selected signal's own 13 Level Check conditions (its levelCheckDefs), passed straight through to SRLadderRow/SRLadderDiffPanel. Undefined (no signal selected, or no levelCheckDefs) renders "No levelCheckDefs" rather than a checklist — see SRLadderDiff.tsx. */
  levelCheckConditions?: LevelCheckCondition[];
  /** True when the Screener's P-CONSOLIDATE-A check passed for this row (held in Screener state, not on the row data). */
  isConsolidateA?: boolean;
  /** True when PP-CONSOLIDATE-A (day-before-previous session) passed for this row. */
  isPPConsolidateA?: boolean;
  /** True when PP-CONSOLIDATE-B (day-before-previous session) passed for this row. */
  isPPConsolidateB?: boolean;
  /** True when PP-MOMENTUM-A passed and not exclusive PP-CONSOLIDATE-A. */
  isPPMomentumA?: boolean;
  /** True when PP-MOMENTUM-B passed and not exclusive PP-CONSOLIDATE-B. */
  isPPMomentumB?: boolean;
  /** True when PP-VOLATILE-R1S1 (exclusive of PP-CON/MOM). */
  isPPVolatileR1S1?: boolean;
  /** True when this row is assigned to the exclusive P-CONSOLIDATE-B class (held in Screener state, not on the row data). */
  isConsolidateB?: boolean;
  /** True when the Screener's P-MOMENTUM-A check passed for this row and it is not CONSOLIDATE-A (momentum excludes consolidate, as in the filters). */
  isMomentumA?: boolean;
  /** True when this row is assigned to the exclusive P-MOMENTUM-B class (after earlier classes are excluded). */
  isMomentumB?: boolean;
  /** True when this row is assigned to INSIDE-R1S1 (candles fully inside R1–S1 band, or dual CON-A+CON-B). */
  isInsideR1S1?: boolean;
  /** True when floor passes and the VOL-C ceiling check fails. */
  isVolA?: boolean;
  /** True when ceiling passes and the VOL-C floor check fails. */
  isVolB?: boolean;
  /** True when PPDay floor passes and the PP-VOL-C ceiling check fails. */
  isPPVolA?: boolean;
  /** True when PPDay ceiling passes and the PP-VOL-C floor check fails. */
  isPPVolB?: boolean;
  /** True when the first 15-minute candle body overlaps today's CPR. */
  isCPRBO?: boolean;
  /** True when a session-boundary candle body overlaps today's PrevHigh. */
  isPDHBO?: boolean;
  /** True when a session-boundary candle body overlaps today's PrevLow. */
  isPDLBO?: boolean;
  /** Live RECLAIM-S state (failed breakdown this session) — only passed when it qualifies, else null/undefined. */
  reclaimS?: ReclaimSideState | null;
  /** Live RECLAIM-R state (failed breakout this session) — only passed when it qualifies, else null/undefined. */
  reclaimR?: ReclaimSideState | null;
  /** Called when the user clicks the row (expand cell) — drives Legend Card 2 like an entry-cross toast. */
  onRowFocus?: (r: CPRResultWithSource) => void;
  /** Visual highlight when this row is the legend-focused selection. */
  isFocused?: boolean;
}

/**
 * Hover text for the RECLAIM-S / RECLAIM-R badge: which levels were pierced and
 * by what rule, the day extreme, where price is now, and how far back it is.
 */
function reclaimTooltip(st: ReclaimSideState): string {
  const isS = st.side === "S";
  const prefix = isS ? "S" : "R";
  const verb = isS ? "below" : "above";
  const back = isS ? "above" : "below";
  const rule =
    st.mode === "body" ? "a completed 15m candle body" :
    st.mode === "close" ? "a completed 15m candle close" :
    "a 15m wick";
  const piercedNames = st.levels
    .map((lvl, i) => `${prefix}${i + 1} ${fmt(lvl)}`)
    .join(", ");
  const parts = [
    `${isS ? "Failed breakdown" : "Failed breakout"}: ${rule} went ${verb} ${piercedNames}`,
    st.extreme !== undefined ? `${isS ? "day low" : "day high"} ${fmt(st.extreme)}` : null,
    `price ${fmt(st.price)} is back ${back} ${st.recrossed} of ${st.pierced} pierced level${st.pierced === 1 ? "" : "s"}`,
    st.retracePct !== undefined
      ? `${st.retracePct}% of the way back to ${prefix}1`
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * A single table row (plus its expandable ADK S/R ladder row). Mechanical
 * extraction of the `<Fragment key={rowKey}>...</Fragment>` block from
 * Screener.tsx's table body — same badges, same columns, same logic. No
 * behavior changes.
 */
function ScreenerTableRow({
  r,
  rowKey,
  isExpanded,
  toggleExpand,
  activePattern: rawActivePattern,
  activeSignal,
  viewName,
  levelCheckConditions,
  isConsolidateA,
  isPPConsolidateA,
  isPPConsolidateB,
  isPPMomentumA,
  isPPMomentumB,
  isPPVolatileR1S1,
  isConsolidateB,
  isMomentumA,
  isMomentumB,
  isInsideR1S1,
  isVolA,
  isVolB,
  isPPVolA,
  isPPVolB,
  isCPRBO,
  isPDHBO,
  isPDLBO,
  reclaimS,
  reclaimR,
  onRowFocus,
  isFocused,
}: ScreenerTableRowProps) {
  const activePattern = rawActivePattern ?? activeSignal ?? "";
  // When supplied, the Screener props are the complete mutually exclusive
  // classification. Fall back to row flags only for callers without props.
  // When Screener passes exclusive bucket props, show exactly one badge.
  // Fallback (no props) uses raw flags with within-side MOM excluding CON.
  // Exclusive badges (same as Screener candleBucket):
  // INSIDE = CON-A ∩ CON-B only; pure CON-A / CON-B keep their own badges.
  const rawConA = r.PD15MConsolidateAPass === true;
  const rawPPConA = r.PD15MPPConsolidateAPass === true;
  const rawPPConB = r.PD15MPPConsolidateBPass === true;
  const rawConB = r.PD15MBelowTCPass === true;
  const rawMomA = r.PD15MAboveBCPass === true;
  const rawMomB = r.PD15MMomentumBPass === true;
  // Prefer exclusive props from Screener (exactly one of these when set).
  // Fallback: same priority as Screener candleBucket / backtest badges.
  const exclusiveFromProps =
    isInsideR1S1 !== undefined ||
    isConsolidateA !== undefined ||
    isConsolidateB !== undefined ||
    isMomentumA !== undefined ||
    isMomentumB !== undefined ||
    isVolA !== undefined ||
    isVolB !== undefined;

  let showInsideR1S1 = false;
  let showConsolidateA = false;
  let showConsolidateB = false;
  let showMomentumA = false;
  let showMomentumB = false;
  let showVolA = false;
  let showVolB = false;

  if (exclusiveFromProps) {
    showInsideR1S1 = isInsideR1S1 === true;
    showConsolidateA = !showInsideR1S1 && isConsolidateA === true;
    // PP-CON-A is independent — shown whenever it passed (alongside P-CON-A).

    showConsolidateB = !showInsideR1S1 && isConsolidateB === true;
    showMomentumA = !showInsideR1S1 && isMomentumA === true;
    showMomentumB = !showInsideR1S1 && isMomentumB === true;
    const hasAnyHigher =
      showInsideR1S1 ||
      showConsolidateA ||
      showConsolidateB ||
      showMomentumA ||
      showMomentumB;
    showVolA = !hasAnyHigher && isVolA === true;
    showVolB = !hasAnyHigher && !showVolA && isVolB === true;
  } else if (rawConA && rawConB) {
    // Zone-majority stamp (same as candleBucket); missing → A.
    if (r.PD15MConsolidateExclusive === "B") showConsolidateB = true;
    else showConsolidateA = true;
  } else if (rawConB) {
    showConsolidateB = true;
  } else if (rawMomB) {
    showMomentumB = true;
  } else if (rawConA) {
    showConsolidateA = true;
  } else if (rawMomA) {
    showMomentumA = true;
  } else if (r.PD15MInsideR1S1Pass === true) {
    showInsideR1S1 = true;
  } else if (r.PD15MVolAPass === true) {
    showVolA = true;
  } else if (r.PD15MVolBPass === true) {
    showVolB = true;
  }
  // Hoisted so the same up/down call drives both the per-row dot in the
  // Symbol column AND the new "Levels VIEW" name badge below — one row
  // shouldn't ever show a green dot next to a red badge.
  // When no left-nav section is selected (Show All, activePattern === ""),
  // getViewDirection has no section to scope to and always returns null —
  // which used to mean the dot never showed in Show All at all. Fall back
  // to getAnyViewDirection there, which checks every View across every
  // category instead of just one section.
  const dir = (activePattern ? getViewDirection(r, activePattern) : null) ?? getAnyViewDirection(r);
  const sym = splitSymbol(r.symbol, r.source);

  const isInsideCPR = !!(r.InsideCPR || (r as any).insideCPR);
  const isOutsideCPR = !!r.outCPR;
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
  // Formerly the LEVEL column's content — relocated to render underneath
  // the "Today S/R" ladder in the expanded row instead. Same badge
  // components, same colors, just a different home.
  const levelBadges = (
    <>
      <div className="flex flex-nowrap items-center gap-1">
        {renderLevelStatusRestBadges(r, isInsideCPR, showWide)}
      </div>
      {ssrrHhllRow}
    </>
  );
  // Every View this row satisfies (same list the VIEW column renders), each
  // graded with THAT View's own levelCheckDefs — same per-row approach
  // BacktestPanel uses (rowViewDefByRow). Computed once here and shared with
  // the VIEW and Ladder Check cells so their lines stay 1:1 and in order.
  const matchingSignals = getMatchingSignals(r);
  const hasSpecificMatchingView = matchingSignals.some(
    (view) => getView(view.id)?.kind === "view",
  );
  const viewLadders = matchingSignals.map((v) => {
    const viewDef = getView(v.id);
    const defs = viewDef?.levelCheckDefs;
    return {
      id: v.id,
      label: v.label,
      // Prefer signal direction; fall back to View registry so Down Views
      // always get bright-pink 13/13 in MATCH even if the signal list omits it.
      direction: v.direction || viewDef?.direction,
      defs,
      ladder: getLadderMatchSummary(r.prevCPR, r.todayCPR, defs),
    };
  });
  const anyLadderDefined = viewLadders.some((v) => v.ladder.hasConditions);
  const rowStatusBadge = renderRowStatusBadge(r, matchingSignals, activeSignal);
  // Inputs: `viewName` / `levelCheckConditions` are the View SELECTED in the
  // Screener (from Screener.tsx); `viewLadders` are the Views THIS ROW matches.
  // They're resolved once, here, into a single `primaryView` — the one View
  // the expanded row's Levels VIEW badge + LEVEL CHECK panel (SRLadderRow
  // takes exactly one) are about:
  //   • a View is selected  -> that View (name, direction, defs as passed in;
  //     if it has no defs the panel says "LevelCheck UnDefined", matching the
  //     column)
  //   • none selected       -> the first View in the VIEW column that has
  //     levelCheckDefs (previously the panel got nothing here and said
  //     "LevelCheck UnDefined" while the column showed e.g. 13/13)
  //   • nothing to show     -> undefined
  const hasSelectedView = !!viewName;
  const firstDefinedView = viewLadders.find((v) => v.ladder.hasConditions);
  const primaryView = hasSelectedView
    ? { name: viewName, direction: dir ?? undefined, defs: levelCheckConditions, key: activeSignal }
    : firstDefinedView
    ? { name: firstDefinedView.label, direction: firstDefinedView.direction ?? undefined, defs: firstDefinedView.defs, key: firstDefinedView.id }
    : undefined;
  // Key stored with an attached chart link: always a concrete View this row
  // matches — never a category / pattern id (activeSignal can be one), which
  // Legend cameras (matched by View key) could not find later.
  const selectedNode = activeSignal ? getView(activeSignal) : undefined;
  const chartViewKey =
    selectedNode?.kind === "view"
      ? selectedNode.key
      : (
          (activeSignal ? viewLadders.find((v) => isViewUnder(v.id, activeSignal)) : undefined) ??
          firstDefinedView ??
          viewLadders.find((v) => getView(v.id)?.kind === "view")
        )?.id ?? "";
  // SSLLCategory badge (e.g. "SSLL-AA") — shown above the S1 line in the
  // expanded row's "Levels VIEW" chart, right side.
  const ssllBadge = renderSSLLCategoryBadge(r);
  // HHLLCategory badge (e.g. "HHLL-AA") — shown above the S1 line in the
  // expanded row's "Levels VIEW" chart, left side (before ssllBadge).
  const hhllBadge = renderHHLLCategoryBadge(r);
  // SSRRCategory badge (e.g. "RRSS-C") — shown above the R1 line in the
  // expanded row's "Levels VIEW" chart, left side (paired with rrhhBadge
  // on the right).
  const rrssBadge = renderSSRRCategoryBadge(r);
  // RRHHCategory badge (e.g. "RRHH-AA") — shown above the R1 line in the
  // expanded row's "Levels VIEW" chart, right side, after rrssBadge.
  const rrhhBadge = renderRRHHCategoryBadge(r);
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
        id={`sc-row-${r.source}-${r.symbol.toUpperCase()}`}
        data-screener-row
      className={`hover:bg-muted/20 transition-colors ${dir ? "bg-accent/3" : ""} ${
          isFocused
            ? "ring-1 ring-inset ring-sky-500/70 bg-sky-500/10"
            : ""
        }`}
      onClick={() => onRowFocus?.(r)}
      >
        <td
          className="px-2 py-3 w-16 font-mono font-semibold text-foreground cursor-pointer select-none"
          onClick={() => {
            toggleExpand(rowKey);
            onRowFocus?.(r);
          }}

          title="Click to expand ADK S/R ladder / focus legend"
        >
          <div className="flex items-start gap-1.5">
            <span className="text-muted-foreground text-xs mt-0.5">{isExpanded ? "▼" : "▶"}</span>
            {(() => {
              if (!dir) return null;
              const isUp = dir === "Up" || (dir as string) === "up";
              return (
                <div
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    isUp ? "bg-green-400" : "bg-[#ff6bb5]"
                  }`}
                  title={isUp ? "Matches an Up sub-filter" : "Matches a Down sub-filter"}
                />
              );
            })()}
            <div className="flex flex-col leading-tight min-w-0">
              <div className="flex items-center gap-1">
                <span className="truncate">{sym.base}</span>
                {hasKnownChartMapping(r.symbol, r.source) ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openChartInNewTab(getChartUrl(r.symbol, r.source));
                    }}
                    className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                    title="Open on TradingView"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                ) : (
                  <span
                    className="text-muted-foreground/30 cursor-not-allowed inline-flex shrink-0"
                    title="Not available on TradingView"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </span>
                )}
              </div>

              {(() => {
                const tradfi = formatTradFiSubtitle(r.symbol);
                if (!tradfi) return null;
                return (
                  <span
                    className="mt-0.5 text-[10px] leading-none text-sky-300/90 truncate"
                    title={tradfi}
                  >
                    {tradfi}
                  </span>
                );
              })()}
              {renderScreenerSymbolCategoryBadge(r)}
              <span className={`mt-0.5 font-mono text-sm font-medium leading-none ${r.change24h >= 0 ? "text-green-400" : "text-[#ff6bb5]"}`}>
                {fmtPct(r.change24h)}
              </span>
            </div>
          </div>
        </td>
        <td className="px-2 py-3 w-40">
          <div className="flex flex-col gap-1 max-w-[240px]">
            <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
              {renderCombinedPatternLabel(r)}
            </div>
            <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
              {renderLevelStatusBadge(r, isInsideCPR, isOutsideCPR, showWide, nothingMatchedMain)}
              {isCPRBO && (
                <span
                  className="text-[10px] font-mono font-semibold text-lime-400"
                  title="CPRBO eligible: any of the previous session's last two or today's first two 15-minute candle bodies overlaps today's CPR TC or BC"
                >
                  CPRBO
                </span>
              )}
              {isPDHBO && (
                <span
                  className="text-[10px] font-mono font-semibold text-green-400"
                  title="PDHBO eligible: a session-boundary 15-minute candle body overlaps today's PrevHigh"
                >
                  PDHBO
                </span>
              )}
              {isPDLBO && (
                <span
                  className="text-[10px] font-mono font-semibold text-orange-400"
                  title="PDLBO eligible: a session-boundary 15-minute candle body overlaps today's PrevLow"
                >
                  PDLBO
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-3">
          {renderMatchingSignals(r, matchingSignals, (viewId) => (
            <ScreenerCreateViewControl
              key={viewId}
              row={r}
              fallbackPatternKey={activePattern}
              existingViewKey={viewId}
            />
          ))}
          {!hasSpecificMatchingView && (
            <div className="mb-1">
              <ScreenerCreateViewControl row={r} fallbackPatternKey={activePattern} />
            </div>
          )}
          {(() => {
            const ppBadge = exclusivePPDayBadge(r, {
              isPPConsolidateA,
              isPPConsolidateB,
              isPPMomentumA,
              isPPMomentumB,
              isPPVolatileR1S1,
              isPPVolA,
              isPPVolB,
            });
            // Exclusive P label (at most one)
            let pNode: ReactNode = null;
            if (showConsolidateA) {
              pNode = (
                <span
                  className="font-mono text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                  style={{ color: "#03b07c" }}
                >
                  P-CON-A
                </span>
              );
            } else if (showConsolidateB) {
              pNode = (
                <span
                  className="font-mono text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                  style={{ color: "#ff6bb5" }}
                >
                  P-CON-B
                </span>
              );
            } else if (showMomentumA) {
              pNode = (
                <span className="font-mono text-xs font-bold uppercase tracking-widest whitespace-nowrap text-cyan-400">
                  P-MOM-A
                </span>
              );
            } else if (showMomentumB) {
              pNode = (
                <span className="font-mono text-xs font-bold uppercase tracking-widest whitespace-nowrap text-violet-400">
                  P-MOM-B
                </span>
              );
            } else if (showInsideR1S1) {
              const prevIsPMicroOrTiny = isMicroOrTinyCPRSize(
                r.prevCPR?.widthPct,
              );
              const limeVol =
                r.touchCategory === true || r.ppTouchCategory === true || prevIsPMicroOrTiny;
              pNode = (
                <span
                  className="font-mono text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                  style={{ color: limeVol ? "#a3e635" : "#ff637e" }}
                  title={
                    r.touchCategory
                      ? "CPR/pCPR TOUCH + previous-session 15m inside R1/PH–S1/PL band (not CON-A/CON-B)"
                      : r.ppTouchCategory
                        ? "pCPR/ppCPR TOUCH + previous-session 15m inside R1/PH–S1/PL band (not CON-A/CON-B)"
                      : prevIsPMicroOrTiny
                        ? "pMicro or pTiny previous-day CPR + previous-session 15m inside R1/PH–S1/PL (lime without ✗)"
                        : "Previous-session 15m inside R1/PH–S1/PL band but not CON-A/CON-B (volatile)"
                  }
                >
                  {limeVol ? "P-VOL-C" : "P-VOL-C ✗"}
                </span>
              );
            } else if (showVolA) {
              const prevIsPMicro =
                Number.isFinite(r.prevCPR?.widthPct) &&
                getWidthCategory(r.prevCPR.widthPct).key === "micro";
              const limeVol = r.touchCategory === true || prevIsPMicro;
              pNode = (
                <span
                  className="font-mono text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                  style={{ color: limeVol ? "#a3e635" : "#ff637e" }}
                >
                  {limeVol ? "P-VOL-A" : "P-VOL-A ✗"}
                </span>
              );
            } else if (showVolB) {
              const prevIsPMicro =
                Number.isFinite(r.prevCPR?.widthPct) &&
                getWidthCategory(r.prevCPR.widthPct).key === "micro";
              const limeVol = r.touchCategory === true || prevIsPMicro;
              pNode = (
                <span
                  className="font-mono text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                  style={{ color: limeVol ? "#a3e635" : "#ff637e" }}
                >
                  {limeVol ? "P-VOL-B" : "P-VOL-B ✗"}
                </span>
              );
            }
            if (!ppBadge && !pNode) return null;
            return (
              <div className="mt-1 flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                {ppBadge && (
                  <span
                    className={ppBadge.className}
                    style={ppBadge.style}
                    title={`Exclusive PP label: ${ppBadge.text}`}
                  >
                    {ppBadge.text}
                  </span>
                )}
                {pNode}
              </div>
            );
          })()}
          {/* Residual P-VOLATILE ✗ removed: while P-day 15m filters are still
              loading, exclusive props are all false and InsideR1S1Pass may
              already be stamped false → every row flashed "P-VOLATILE ✗".
              Only show a label when an exclusive bucket actually matched
              (showInsideR1S1 / CON / MOM above). */}

          {/* Live current-session failed-break flags: "2/3" = 3 levels pierced,
              price back inside 2 of them. Support side sky-blue, resistance orange. */}
          {reclaimS && (
            <div
              className="mt-1 font-mono text-xs font-bold uppercase tracking-widest whitespace-nowrap"
              style={{ color: "#38bdf8" }}
              title={reclaimTooltip(reclaimS)}
            >
              RECLAIM-S {reclaimS.recrossed}/{reclaimS.pierced}
            </div>
          )}
          {reclaimR && (
            <div
              className="mt-1 font-mono text-xs font-bold uppercase tracking-widest whitespace-nowrap"
              style={{ color: "#fb923c" }}
              title={reclaimTooltip(reclaimR)}
            >
              RECLAIM-R {reclaimR.recrossed}/{reclaimR.pierced}
            </div>
          )}
        </td>
        {/* Ladder Check — right after VIEW, before PIVOT SIZE. One line per
            View in the VIEW column (same order), each graded with that
            View's own levelCheckDefs:
            • View has levelCheckDefs                   -> "n/13" (green/amber/red)
            • View has none, and a View is active in the
              Screener (hasSelectedView)                -> "LevelCheck UnDefined"
            • View has none, no View active             -> blank line
            Row matches no View                         -> blank cell */}
        <td className="px-3 py-3">
          <div className="flex flex-col items-start gap-0">
            {(rowStatusBadge || (viewLadders.length > 0 && (anyLadderDefined || hasSelectedView))) && (
              <div className="flex flex-col gap-0">
              {rowStatusBadge ? (
                <div className="flex items-center">{rowStatusBadge}</div>
              ) : null}
              {viewLadders.length > 0 && (anyLadderDefined || hasSelectedView) ? (
              viewLadders.map(({ id, label, ladder, direction }) => {
                // Tick after n/13 only when this View has "13/13 MATCH" ON
                // and the row is a full match. Full match without the flag
                // stays green "13/13" with no tick; Down Views use bright pink.
                const viewDef = getView(id);
                const requireFull = viewDef?.requireFullMatch === true;
                const isDownView =
                  direction === "Down" || viewDef?.direction === "Down";
                const fullMatchClass = isDownView
                  ? "text-[#ff6bb5]"
                  : "text-green-400";
                return (
                <div key={id} className="flex min-h-0 items-start whitespace-nowrap leading-none">
                  {!ladder.hasConditions ? (
                    hasSelectedView ? (
                      <span className="text-xs text-muted-foreground" title={label}>
                        LevelCheck UnDefined
                      </span>
                    ) : null
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-mono font-medium ${
                        ladder.fullMatch
                          ? fullMatchClass
                          : "text-orange-400"
                      }`}
                      title={
                        ladder.fullMatch
                          ? requireFull
                            ? `${label}: all ${ladder.total} levels matched (13/13 MATCH ON)`
                            : `${label}: all ${ladder.total} levels matched`
                          : `${label} — broke through: ${ladder.mismatchLabels.join(", ")}`
                      }
                    >
                      {ladder.matchingCount}/{ladder.total}
                      {ladder.fullMatch && requireFull ? (
                        <CheckCircle2 className={`w-3.5 h-3.5 ${fullMatchClass}`} />
                      ) : null}
                    </span>
                  )}
                </div>
                );
              })
              ) : null}
              </div>
            )}
          </div>
        </td>
        {(() => {
          const move = distanceFromCPR(r.currentPrice, r.todayCPR);
          const pdh = pdhPdlStatus(r);
          const pdhTitle = `PDH: ${fmt(r.todayCPR.prevHigh)}  |  PDL: ${fmt(r.todayCPR.prevLow)}`;
          const LABEL_FONT = "font-mono font-semibold text-[10px] uppercase tracking-wide leading-none";
          const moveInCpr = move.main === "IN-CPR";
          const moveLine = (
            <div className={`whitespace-nowrap ${moveInCpr ? `${LABEL_FONT} text-orange-400` : ""}`}>
              {moveInCpr ? move.main : <span className="text-[11px]">{move.main}</span>}
              {move.sub && <span className="text-[9px] ml-1">{move.sub}</span>}
            </div>
          );
          // Above R1/R2/R3/R4: MOVE only + BRK badge (no >PDH line).
          // Below S1/S2/S3/S4: MOVE only (no <PDL line).
          // >PDH / <PDL / IN-PDHL only when price has not cleared R1 (up) or S1 (down).
          const aboveR1 =
            move.sub === ">R1" ||
            move.sub === ">R2" ||
            move.sub === ">R3" ||
            move.sub === ">R4";
          const belowS1 =
            move.sub === "<S1" ||
            move.sub === "<S2" ||
            move.sub === "<S3" ||
            move.sub === "<S4";
          const showPdhRow = !aboveR1 && !belowS1;
          // Beyond PDH / PDL: show only that line — no secondary >TC / <BC line.
          const beyondPdh = pdh.sub === "> PDH";
          const beyondPdl = pdh.sub === "< PDL";
          // BRK / BRKDN: segmented pill — solid colored tag (dark text) + dark body with
          // white volume, accent-colored level(s), muted age — so the pieces read apart
          // instead of one flat tinted block.
          const renderBrkPill = (
            tag: "BRK" | "BRKDN",
            accent: string,
            d: NonNullable<typeof r.breakout>,
            title: string,
            fallbackLevel: string,
          ) => (
            <div className="mt-0.5">
              <span
                className="inline-flex shrink-0 items-stretch overflow-hidden rounded border font-mono text-[9px] font-semibold leading-tight whitespace-nowrap"
                style={{ borderColor: accent }}
                title={title}
              >
                <span
                  className="px-1 py-0 font-bold tracking-wide text-slate-950"
                  style={{ backgroundColor: accent }}
                >
                  {tag}
                </span>
                <span className="px-1 py-0 bg-slate-900 text-white">{d.relVol.toFixed(1)}x</span>
                <span
                  className="px-1 py-0 bg-slate-900 border-l border-white/10"
                  style={{ color: accent }}
                >
                  {d.levelsCleared.length > 0 ? d.levelsCleared.join("·") : fallbackLevel}
                </span>
                <span className="px-1 py-0 bg-slate-800 text-slate-300 font-medium border-l border-white/10">
                  {(d.barsAgo ?? 0) === 0 ? "now" : `${(d.barsAgo ?? 0) * 15}m`}
                </span>
              </span>
            </div>
          );
          const brkBadge = r.breakout?.signal
            ? renderBrkPill(
                "BRK",
                "#fbbf24",
                r.breakout,
                `15m momentum breakout ${r.breakout.barsAgo === 0 ? "on the latest (possibly still forming) candle" : `${r.breakout.barsAgo} candle(s) ago`} · rel. volume ${r.breakout.relVol.toFixed(1)}x · cleared ${r.breakout.levelsCleared.join("/") || "range high"} · ${(r.breakout.runPct ?? 0) >= 0 ? "+" : ""}${(r.breakout.runPct ?? 0).toFixed(1)}% since`,
                "RNG",
              )
            : null;
          const brkDnBadge = r.breakdown?.signal
            ? renderBrkPill(
                "BRKDN",
                "#ff6bb5",
                r.breakdown,
                `15m momentum breakdown ${r.breakdown.barsAgo === 0 ? "on the latest (possibly still forming) candle" : `${r.breakdown.barsAgo} candle(s) ago`} · rel. volume ${r.breakdown.relVol.toFixed(1)}x · cleared ${r.breakdown.levelsCleared.join("/") || "range low"} · ${(r.breakdown.runPct ?? 0) >= 0 ? "+" : ""}${(r.breakdown.runPct ?? 0).toFixed(1)}% since`,
                "RNG",
              )
            : null;

          // Same size as PASS / Fail / Ready (text-[9px] mono). First badge row:
          // BIG↑/BIG↓ then status. BRK/BRKDN stay on the following line.
          // BIG↑ / BIG↓: same segmented pill as BRK/BRKDN (solid tag, white multiple,
          // accent rule, muted age) in lime (up) / pink (down).
          const strongBarBadge = r.strongBar?.signal
            ? (() => {
                const sb = r.strongBar;
                const accent = sb.side === "up" ? "#a3e635" : "#ff6bb5";
                const mult = (sb.via === "range" ? sb.rangeMult : sb.bodyMult) ?? 0;
                return (
                  <span
                    className="inline-flex shrink-0 items-stretch overflow-hidden rounded border font-mono text-[9px] font-semibold leading-tight whitespace-nowrap"
                    style={{ borderColor: accent }}
                    title={`15m strong bar ${sb.side === "up" ? "up" : "down"} · ${sb.via === "range" ? "range spike" : "fat body"} · body ${sb.bodyMult.toFixed(1)}× · range ${(sb.rangeMult ?? 0).toFixed(1)}× avg · body ${Math.round(sb.bodyFrac * 100)}% of range · ${sb.barsAgo === 0 ? "latest closed" : `${sb.barsAgo} bar(s) ago`}`}
                  >
                    <span
                      className="px-1 py-0 font-bold tracking-wide text-slate-950"
                      style={{ backgroundColor: accent }}
                    >
                      {sb.side === "up" ? "BIG↑" : "BIG↓"}
                    </span>
                    <span className="px-1 py-0 bg-slate-900 text-white">{mult.toFixed(1)}x</span>
                    <span
                      className="px-1 py-0 bg-slate-900 border-l border-white/10"
                      style={{ color: accent }}
                    >
                      {sb.via === "range" ? "RNG" : "BODY"}
                    </span>
                    <span className="px-1 py-0 bg-slate-800 text-slate-300 font-medium border-l border-white/10">
                      {sb.barsAgo === 0 ? "now" : `${sb.barsAgo * 15}m`}
                    </span>
                  </span>
                );
              })()
            : null;
          // Active/Ready/Pass/Fail moved to MATCH (above n/13). MOVE keeps BIG↑/↓ only.
          // First row: BIG↑/↓ pill first, then the move text beside it.
          const firstRow = (text: ReactNode, title?: string) => (
            <div className="flex items-center gap-1 whitespace-nowrap" title={title}>
              {strongBarBadge}
              {text}
            </div>
          );
          const pdhText = (
            <div>
              <span className="text-[11px]">{pdh.main}</span>
              {pdh.sub && <span className="text-[9px] ml-1">{pdh.sub}</span>}
            </div>
          );
          // Beyond PDH: only PDH % (no >TC). Beyond PDL: only PDL % (no <BC).
          if (beyondPdh && showPdhRow) {
            return (
              <td className={`pl-3 pr-2 py-3 whitespace-nowrap text-xs font-medium ${pdh.color}`}>
                {firstRow(pdhText, pdhTitle)}
                {brkBadge}
              </td>
            );
          }
          if (beyondPdl && showPdhRow) {
            return (
              <td className={`pl-3 pr-2 py-3 whitespace-nowrap text-xs font-medium ${pdh.color}`}>
                {firstRow(pdhText, pdhTitle)}
                {brkDnBadge}
              </td>
            );
          }
          // Price above TC but still IN-PDHL (hasn't cleared PDH): IN-PDHL + >TC.
          if (move.sub === ">TC" && showPdhRow) {
            const inRange = pdh.main === "IN-PDHL";
            return (
              <td className={`pl-3 pr-2 py-3 whitespace-nowrap text-xs font-medium ${move.color}`}>
                {firstRow(moveLine)}
                <div
                  className={`mt-0.5 ${inRange ? `${LABEL_FONT} text-orange-400` : pdh.color}`}
                  title={pdhTitle}
                >
                  {pdh.main}
                  {pdh.sub && <span className="text-[10px] ml-1">{pdh.sub}</span>}
                </div>
                {brkBadge}
              </td>
            );
          }
          return (
            <td className={`pl-3 pr-2 py-3 whitespace-nowrap text-xs font-medium ${move.color}`}>
              {firstRow(moveLine)}
              {showPdhRow && (
                <div className={`mt-0.5 ${pdh.main === "IN-PDHL" ? `${LABEL_FONT} text-orange-400` : pdh.color}`} title={pdhTitle}>
                  {pdh.main}
                  {pdh.sub && <span className="text-[10px] ml-1">{pdh.sub}</span>}
                </div>
              )}
              {brkBadge}
              {brkDnBadge}
            </td>
          );
        })()}
        <td className="px-3 py-3 font-mono whitespace-nowrap">
          {renderPivotSizeCell(r.prevCPR, r.todayCPR, r.compressionRatio)}
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
          colSpan={7}
          todayPatternBadge={renderTodayPatternBadges(r)}
          // CHANGED: "PDay S/R" now shows prev day's own "p-xxxx" pattern
          // (prevCPR vs ppCPR) instead of today's PivotPattern combo —
          // the PivotPattern badge moved to "Levels VIEW" below, where it
          // more accurately belongs (it's today-vs-prev, not prev's own).
          prevPatternBadge={renderPrevPatternBadge(r)}
          pivotPatternBadge={renderPivotPatternBadge(r)}
          viewName={primaryView?.name}
          viewKey={primaryView?.key}
          chartViewKey={chartViewKey}
          viewDirection={primaryView?.direction}
          showLevelCheck
          levelCheckConditions={primaryView?.defs}
          innerLevelBadges={levelBadges}
          gapBadges={renderGapColumnBadges(r)}
          gapCompositeBadge={renderGapBadge(r)}
          ssllBadge={ssllBadge}
          hhllBadge={hhllBadge}
          rrssBadge={rrssBadge}
          rrhhBadge={rrhhBadge}
        />
      )}
    </Fragment>
  );
}

export default memo(ScreenerTableRow);
