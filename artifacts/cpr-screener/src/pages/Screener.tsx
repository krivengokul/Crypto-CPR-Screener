import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue, Fragment, type Dispatch, type SetStateAction } from "react";
import { pivotcategories, Views, VIEW_LABEL_BY_ID } from "@/lib/ViewsSidebar";
import { getView, VIEWS } from "@/lib/views";
import {
  entryTouchedThisSession,
  latchViewSessionPass,
  sessionReachedTarget,
  sessionReachedR4OrS4,
  sessionR4OrS4Hit,
} from "@/lib/signalOutcome";
import {
  TrendingUp,
  RefreshCw,
  Download,
  Search,
  ExternalLink,
  Bell,
  BellOff,
  ShieldAlert,
  X,
} from "lucide-react";
import { COINDCX_ENABLED, DELTA_ENABLED } from "@/lib/featureFlags";
import {
  readHideTradfiWeekend,
  shouldHideTradfiCommodRow,
  HIDE_TRADFI_WEEKEND_CHANGED_EVENT,
} from "@/lib/weekendMarketFilter";
import { NIFTY_MOCK_CONTRACTS } from "@/lib/nifty";
import NiftyWorkspace from "@/components/NiftyWorkspace";
import {

  getReclaimStates,
  type ReclaimDepth,
} from "@/lib/15MCandleCheck";
import type { CPRResult } from "@/lib/cpr";
import { isMicroOrTinyCPRSize } from "@/lib/views/cprSizes";
import { utcTodayISO, ENTRY_DEFS } from "@/lib/backtest";
import {
  formatISTTime,
  formatScanTime,
  formatScanDate,
} from "@/lib/scheduler";
import {
  type SortKey,
  type SortDir,
  type ActiveTab,
  type SourceId,
  type CPRResultWithSource,
  type WidthFilter,
  type WidthCategoryKey,
  fmt,
  fmtPct,
  fmtVol,
  getVal,
  splitSymbol,
  getChartUrl,
  hasKnownChartMapping,
  passesPattern,
  matchesWidthFilter,
  formatWidthFilterLabel,
  getWidthCategory,
  distanceFromCPR,
  pdhPdlStatus,
  cprDistancePct,
  levelsInDistanceRange,
  getOuterLevelPatternInfo,
  computePrevPattern,
  type PatternInfo,
  getViewDirection,
  getRowDirection,
  getMatchingSignals,
} from "./ScreenerUtils";
import LiveClock from "./LiveClock";
import ScreenerLegend, { type ScreenerLegendFocusToast } from "./ScreenerLegend";
import { getLadderMatchSummary } from "./SRLadderDiff";
import ScreenerTableRow, { getBadgeClasses } from "./ScreenerTableRow";
import { useExchangeScan } from "@/hooks/useExchangeScan";
import { usePreviousCandleFilters } from "@/hooks/usePreviousCandleFilters";
import { useReclaimFilters } from "@/hooks/useReclaimFilters";
import { useCPRBOFilter } from "@/hooks/useCPRBOFilter";
import { ScreenerResultsTable } from "@/components/ScreenerResultsTable";
import { ScreenerToolbar } from "@/components/ScreenerToolbar";
import { CPR_LIVE_PRICE_REFRESH_EVENT } from "@/hooks/useLivePriceRefresh";

/**
 * ViewCount — "(n)" badge shown at the end of every Views filter button,
 * matching the white count style used in the left-nav (ViewsSidebar).
 * Renders nothing until counts for that view id are available, and nothing
 * when the count is zero.
 */
function ViewCount({ id, counts }: { id: string; counts: Record<string, number> }) {
  const n = counts[id];
  if (typeof n !== "number" || n === 0) return null;
  return <span className="ml-1 text-white">({n})</span>;
}

/**
 * NoSignalsPanel — SignalDesk-style empty-state card: dashed border,
 * shield-alert icon, bold title, muted subtitle. Used both while a scan
 * is actively running (nothing to show yet) and once a completed scan
 * has zero results, so the Scanner screen is never a blank gap.
 */
function NoSignalsPanel({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
      <div className="w-12 h-12 rounded-full border border-border flex items-center justify-center mx-auto mb-4">
        <ShieldAlert className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="text-sm font-semibold text-foreground mb-1">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  );
}

/**
 * GENERIC_VIEW_CATEGORIES — left-nav categories whose Views are rendered
 * generically (see the "Generic Views" block in the JSX below and the
 * matching fallback in the active result pool), instead of each View
 * getting its own hand-written useState + button + pool block like the
 * older hardcoded categories above it used to.
 *
 * Why: every new View under those older categories needs a new
 * useState, a cleanup-effect entry, an active-pool branch, an
 * anySubFilter entry, AND a JSX button — five places to touch, and it's
 * easy to add a View to navigation while forgetting to wire its Screener
 * filter. The generic path only needs the registry definition:
 * passesPattern(r, sub.id) already resolves any View id generically, so no
 * per-View code is needed on this side.
 *
 * Categories are derived from the registry-backed sidebar Views map, so
 * adding a View to a category automatically wires its Screener filter UI.
 */
const GENERIC_VIEW_CATEGORIES = new Set(
  Object.entries(Views)
    .filter(([, views]) => views.length > 0)
    .map(([categoryId]) => categoryId),
);

/** View ids used by hand-written filter buttons that still need a "(n)" count. */
const EXTRA_VIEW_COUNT_IDS: string[] = [];

/**
 * Flat id → label lookup covering every registry definition and sidebar
 * category.
 * Used by the header's active-signal stat card so it can show a readable
 * label instead of the raw activeSignal id (mirrors SignalDesk's
 * VIEW_LABEL_BY_ID).
 */
/**
 * S1-R1 IN — TOUCH-category rows only: today's S1/R1 inside (or touching) the
 * previous day's CPR band, OR the previous day's S1/R1 inside (or touching)
 * today's CPR band. Shared by the S1-R1 IN filter and its "(n)" count so the
 * two can never disagree.
 */
function matchesS1R1In(r: CPRResult): boolean {
  if (!r.touchCategory) return false;
  const inBand = (lvl: number, b: { bc: number; tc: number }) => {
    const lo = Math.min(b.bc, b.tc), hi = Math.max(b.bc, b.tc);
    return lvl >= lo && lvl <= hi;
  };
  const todayInPrev = inBand(r.todayCPR.s1, r.prevCPR) || inBand(r.todayCPR.r1, r.prevCPR);
  const prevInToday = inBand(r.prevCPR.s1, r.todayCPR) || inBand(r.prevCPR.r1, r.todayCPR);
  return todayInPrev || prevInToday;
}

/**
 * Active / Ready status of a row — same rule as the per-row "Active Views"
 * pills and Signal Desk: a tradable View (has its own entry) the row matches
 * is Active once price has touched the entry line, otherwise Ready. A row is
 * "active" if any of its Views is Active, "ready" if any is Ready.
 */
function getRowStatus(r: CPRResult): {
  active: boolean;
  ready: boolean;
  pass: boolean;
  fail: boolean;
} {
  let active = false;
  let ready = false;
  let pass = false;
  let fail = false;
  // R4 / S4 session extreme — PASS even with no matching View. Persist the
  // terminal result for each matching View so a rescan cannot restore Active.
  const sessionPassed = sessionReachedR4OrS4(r);
  if (sessionPassed) pass = true;

  for (const v of getMatchingSignals(r)) {
    if (latchViewSessionPass(r.symbol, v.id, sessionPassed)) {
      pass = true;
      continue;
    }
    const view = getView(v.id);
    const entryFn = view?.getEntry;
    if (!entryFn) continue;
    const dir = v.direction ?? "";
    const targetFn = view?.getTarget;
    const slFn = view?.getStoploss;
    const passed =
      !!targetFn &&
      sessionReachedTarget(dir, targetFn(r), r.todayHigh, r.todayLow, r.currentPrice);
    if (passed) {
      pass = true;
      latchViewSessionPass(r.symbol, v.id, true);
      continue;
    }
    if (slFn) {
      const sl = slFn(r);
      const isUp = dir === "Up";
      const isDown = dir === "Down";
      if (
        isUp &&
        Number.isFinite(sl) &&
        ((typeof r.todayLow === "number" && r.todayLow <= sl) ||
          (typeof r.currentPrice === "number" && r.currentPrice <= sl))
      ) {
        fail = true;
        continue;
      }
      if (
        isDown &&
        Number.isFinite(sl) &&
        ((typeof r.todayHigh === "number" && r.todayHigh >= sl) ||
          (typeof r.currentPrice === "number" && r.currentPrice >= sl))
      ) {
        fail = true;
        continue;
      }
    }
    if (entryTouchedThisSession(dir, entryFn(r), r.currentPrice, r.todayHigh, r.todayLow)) active = true;
    else ready = true;
  }
  // Session outcome is exclusive: Pass/Fail never also show as Active/Ready.
  if (pass) {
    active = false;
    ready = false;
  } else if (fail) {
    active = false;
    ready = false;
  }
  return { active, ready, pass, fail };
}

/** Status for one View on a row — same priority as STATUS column: Pass → Fail → Active → Ready. */
function getSignalStatus(
  r: CPRResult,
  viewId: string,
): "pass" | "fail" | "active" | "ready" | null {
  const view = getView(viewId);
  if (!view?.getEntry) return null;
  const dir = view.direction ?? "";
  const entryFn = view.getEntry;
  const targetFn = view.getTarget;
  const slFn = view.getStoploss;
  if (latchViewSessionPass(r.symbol, viewId, sessionReachedR4OrS4(r))) {
    return "pass";
  }
  if (
    targetFn &&
    sessionReachedTarget(dir, targetFn(r), r.todayHigh, r.todayLow, r.currentPrice)
  ) {
    latchViewSessionPass(r.symbol, viewId, true);
    return "pass";
  }
  if (slFn) {
    const sl = slFn(r);
    const isUp = dir === "Up";
    const isDown = dir === "Down";
    if (
      isUp &&
      Number.isFinite(sl) &&
      ((typeof r.todayLow === "number" && r.todayLow <= sl) ||
        (typeof r.currentPrice === "number" && r.currentPrice <= sl))
    ) {
      return "fail";
    }
    if (
      isDown &&
      Number.isFinite(sl) &&
      ((typeof r.todayHigh === "number" && r.todayHigh >= sl) ||
        (typeof r.currentPrice === "number" && r.currentPrice >= sl))
    ) {
      return "fail";
    }
  }
  return entryTouchedThisSession(dir, entryFn(r), r.currentPrice, r.todayHigh, r.todayLow) ? "active" : "ready";
}

/**
 * getSignalStatus for a partial legend-focus row (symbol + source + a few CPR
 * fields rather than a full CPRResult). A View's entry/target/stop functions may
 * read fields such a row lacks, so any throw yields "no status" instead of
 * breaking the toast / click / search focus.
 */
function safeSignalStatus(
  row: { prevCPR?: CPRResult["prevCPR"]; todayCPR?: CPRResult["todayCPR"] },
  viewId: string,
): ReturnType<typeof getSignalStatus> {
  try {
    return getSignalStatus(row as unknown as CPRResult, viewId);
  } catch {
    return null;
  }
}



/** Prefer Active/Pass matching View on the row; else first Active Views entry. */
function pickPrimaryMatchingViewId(r: CPRResult, preferred?: string): string {
  const matches = getMatchingSignals(r);
  if (matches.length === 0) return (preferred || "").trim();
  if (preferred && matches.some((m) => m.id === preferred)) return preferred;

  const statusOf = (id: string) => getSignalStatus(r, id);

  for (const rank of ["pass", "active", "ready"] as const) {
    const hit = matches.find((m) => statusOf(m.id) === rank);
    if (hit) return hit.id;
  }
  return matches[0].id;
}

/** Set by App when an entry-cross toast should scroll to + highlight a row. */
export interface ScreenerFocusSymbol {
  symbol: string;
  source: SourceId;
  patternId?: string;
}

export default function Screener({
  activeSignal = "levelsabove",
  scanKey = 0,
  onCounts,
  onSignalSymbols,
  onResults,
  activeTab: activeTabProp,
  onActiveTabChange,
  onActiveSignalChange,
  focusSymbol,
  onFocusSymbolConsumed,
}: {
  activeSignal?: string;
  scanKey?: number;
  onCounts?: (counts: Record<string, number>) => void;
  // Full unfiltered scan pool (both Binance + Delta, every symbol) — NOT
  // scoped to the current tab/showAll/pattern filter, unlike `displayed`/
  // `signalSymbols` below. SignalDesk's auto-save-to-Journal effect needs
  // this to check every symbol against every left-nav View's
  // passesPattern(), independent of whichever single view happens to be
  // on screen. Without this prop, SignalDesk's activeSignalSymbols stays
  // permanently empty and it silently never writes to the Journal.
  onResults?: (results: CPRResultWithSource[]) => void;
  onSignalSymbols?: (
    symbols: Array<{
      key: string;
      symbol: string;
      source: SourceId;
      currentPrice: number;
      change24h: number;
      direction: "Up" | "Down";
      s4: number;
      s3: number;
      s2: number;
      s1: number;
      pivot: number;
      r1: number;
      r2: number;
      r3: number;
      r4: number;
    }>,
  ) => void;
  // NEW: lift activeTab (Binance/Delta/Combined) to be controllable from
  // outside — App.tsx now owns this as shared app-level state so
  // SignalDesk's own Binance/Delta toggle can drive the SAME source that
  // feeds Screener's onCounts (and therefore the left-nav sidebar counts),
  // instead of the two staying out of sync. Falls back to Screener's own
  // local state when unset, so Screener still works standalone.
  activeTab?: ActiveTab;
  onActiveTabChange?: (tab: ActiveTab) => void;
  // NEW: lets the Show All button clear whatever category/View is
  // currently highlighted in the left nav (App.tsx owns that selection
  // as activeSignal/setActiveSignal — Screener only ever receives it as a
  // prop, so it needs this callback to reset it back up to "").
  onActiveSignalChange?: (id: string) => void;
  // Scroll to + highlight this symbol's table row (entry-cross toast).
  focusSymbol?: ScreenerFocusSymbol | null;
  onFocusSymbolConsumed?: () => void;
}) {
  // ── UI / filter state (stays in Screener) ─────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("compressionRatio");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(true);
  /** Asset class chip: null = all, else CRYPTO | COMMOD | TRADFI. */
  const [classFilter, setClassFilter] = useState<"CRYPTO" | "COMMOD" | "TRADFI" | null>(null);
  const [activeGenericSignal, setActiveGenericSignal] = useState<string | null>(null);
  // NEW: PDH/PDL filter — independent of activeSignal, mutually exclusive (like pivot/width filters).
  const [pdhPdlFilter, setPdhPdlFilter] = useState<"above" | "below" | "abovepu4" | "belowpl4" | "pdhgtu1" | "pdlltl1" | "s1r1in" | null>(null);
  const [PatternFilter, setPatternFilter] = useState<string | null>(null);
  const [breakoutMode, setBreakoutMode] = useState<"off" | "brk">("off");
  const [strongBarFilter, setStrongBarFilter] = useState<"off" | "up" | "down">("off");
  const [showPatternList, setShowPatternList] = useState(false);
  const [showTouchList, setShowTouchList] = useState(false);
  const [showClassList, setShowClassList] = useState(false);
  const [touchFilter, setTouchFilter] = useState<string | null>(null);
  const [showSizeList, setShowSizeList] = useState(false);
  const [showPriceList, setShowPriceList] = useState(false);
  const [showCandleList, setShowCandleList] = useState(false);
  const [showEntryLevelList, setShowEntryLevelList] = useState(false);
  const [entryLevelFilter, setEntryLevelFilter] = useState<string | null>(null);

  const entrySignalViews = useMemo(
    () => VIEWS.filter((v) => v.kind === "view" && !!v.getTarget),
    []
  );
  const [prevWidthFilter, setPrevWidthFilter] = useState<WidthCategoryKey | null>(null);
  const [todayWidthFilter, setTodayWidthFilter] = useState<WidthCategoryKey | null>(null);


  const [previousCandleFilter, setPreviousCandleFilter] = useState<
    "all" | "consolidate-a" | "pp-consolidate-a" | "pp-consolidate-b" | "pp-momentum-a" | "pp-momentum-b" | "pp-volatile-r1s1" | "pp-vol-a" | "pp-vol-b" | "momentum-a" | "consolidate-b" | "momentum-b" | "inside-r1s1" | "vol-a" | "vol-b"
  >("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ready" | "pass" | "fail">("all");
  // Independent of All/Active/Ready/Pass/Fail: drop rows already at target so the
  // working list stays Active/Ready (and Fail if any) without switching tabs.
  const [hidePass, setHidePass] = useState(false);
  /** When ON (default) and today is Sat/Sun, hide Binance TRADFI + COMMOD rows. */
  const [hideTradfiWeekend, setHideTradfiWeekend] = useState(() => readHideTradfiWeekend());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ on?: boolean }>).detail;
      if (typeof detail?.on === "boolean") {
        setHideTradfiWeekend(detail.on);
      } else {
        setHideTradfiWeekend(readHideTradfiWeekend());
      }
    };
    window.addEventListener(HIDE_TRADFI_WEEKEND_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(HIDE_TRADFI_WEEKEND_CHANGED_EVENT, onChange);
  }, []);

  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());
  /** Persist toast row PDay + MATCH in Legend Card 2 until the next toast. */
  const [legendToastFocus, setLegendToastFocus] = useState<ScreenerLegendFocusToast | null>(null);
  /** Row key highlighted after click / search / toast focus. */
  const [focusedRowKey, setFocusedRowKey] = useState<string | null>(null);

  // Click outside a result row (and outside the legend) clears row selection + Card 2/3 focus.
  useEffect(() => {
    if (!focusedRowKey && !legendToastFocus) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el || typeof el.closest !== "function") return;
      if (el.closest("[data-screener-row]")) return;
      if (el.closest("[data-screener-legend]")) return;
      if (el.closest("input, textarea, select, button, a, [role='dialog']")) return;
      setFocusedRowKey(null);
      setLegendToastFocus(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [focusedRowKey, legendToastFocus]);



  const toggleExpand = useCallback((key: string) => {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // Entry-cross toast → scroll to + highlight the symbol's table row.
  // Search is set to the symbol so the row survives other filters; retries
  // briefly while tab / pattern filter settle. Runs automatically when
  // focusSymbol arrives (no toast click required).
  const focusConsumedRef = useRef(onFocusSymbolConsumed);
  focusConsumedRef.current = onFocusSymbolConsumed;
  useEffect(() => {
    if (!focusSymbol) return;
    setSearch(focusSymbol.symbol);
    // Soft "Show All": clear every extra filter that could hide the toast's
    // row (sub-filters, width/PDH-PDL/touch/entry-level, breakout, UPEX,
    // previous-candle, reclaim). The View itself is set just below from the
    // toast's patternId, so only that View's filter remains.
    setStatusFilter("all");
    // leave hidePass as user preference
    setPatternFilter(null);
    setTouchFilter(null);
    setEntryLevelFilter(null);
    setPrevWidthFilter(null);
    setTodayWidthFilter(null);
    setPdhPdlFilter(null);
    setBreakoutMode("off");
    onScanOrTabReset();
    if (!focusSymbol.patternId) {
      // No View to switch to: full Show All, same as the Show All button.
      setShowAll(true);
      setActiveGenericSignal(null);
      onActiveSignalChange?.("");
    }
    // Show legend (including Card 3 View trade sheet). Parent sets
    // activeSignal from toast patternId; leave Show All so the row is visible
    // under that View filter and the 3-card legend is rendered.
    if (focusSymbol.patternId) {
      setShowAll(false);
      onActiveSignalChange?.(focusSymbol.patternId);
    }

    // Switch exchange tab to the toast's source when not already on combined.
    if (
      focusSymbol.source === "binance" ||
      focusSymbol.source === "delta" ||
      focusSymbol.source === "coindcx"
    ) {
      // activeTab / setActiveTab come from the scan hook below; effect re-runs
      // after first render when they exist. Use onActiveTabChange when lifted.
      onActiveTabChange?.(focusSymbol.source);
    }
    const id = `sc-row-${focusSymbol.source}-${focusSymbol.symbol.toUpperCase()}`;
    let attempts = 0;
    let retryTimer: number | undefined;
    const tryFocus = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-cyan-400/70", "ring-inset");
        window.setTimeout(
          () => el.classList.remove("ring-2", "ring-cyan-400/70", "ring-inset"),
          4000,
        );
        focusConsumedRef.current?.();
        return;
      }
      if (++attempts < 16) {
        retryTimer = window.setTimeout(tryFocus, 150);
      } else {
        focusConsumedRef.current?.();
      }
    };
    retryTimer = window.setTimeout(tryFocus, 80);
    return () => window.clearTimeout(retryTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSymbol]);

  // Reclaim reset is filled after useReclaimFilters mounts
  const reclaimResetRef = useRef<() => void>(() => {});
  const cprboResetRef = useRef<() => void>(() => {});

  const onScanOrTabReset = useCallback(() => {
    setPreviousCandleFilter("all");
    reclaimResetRef.current();
    cprboResetRef.current();
  }, []);

  // ── Exchange scans (Binance / Delta / CoinDCX) ─────────────────────────
  const {
    activeTab,
    setActiveTab,
    status,
    progress,
    allResults,
    setAllResults,
    filtered,
    setFiltered,
    binanceScannedAt,
    error,
    countdown,
    nextScanUtc,
    alreadyScannedToday,
    lastScanDate,
    deltaStatus,
    deltaProgress,
    deltaAllResults,
    setDeltaAllResults,
    deltaFiltered,
    setDeltaFiltered,
    deltaScannedAt,
    deltaError,
    coindcxStatus,
    coindcxProgress,
    coindcxAllResults,
    setCoinDCXAllResults,
    coindcxFiltered,
    setCoinDCXFiltered,
    coindcxScannedAt,
    coindcxError,
    doScan,
    doDeltaScan,
    doCoinDCXScan,
    allResultsRef,
    deltaAllResultsRef,
    coindcxAllResultsRef,
  } = useExchangeScan({
    activeSignal,
    scanKey,
    activeTab: activeTabProp,
    onActiveTabChange,
    onScanOrTabReset,
  });

  // ── Previous-session 15m P-filters ────────────────────────────────────
  const {
    previousConsolidateAIncludedSymbols,
    previousConsolidateAProgress,
    previousConsolidateAReady,
    previousConsolidateAMessage,
    previousPPConsolidateAProgress,
    previousPPConsolidateAReady,
    previousPPConsolidateAMessage,
    previousPPConsolidateBProgress,
    previousPPConsolidateBReady,
    previousPPConsolidateBMessage,
    previousPPMomentumAProgress,
    previousPPMomentumAReady,
    previousPPMomentumAMessage,
    previousPPMomentumBProgress,
    previousPPMomentumBReady,
    previousPPMomentumBMessage,
    previousPPInsideR1S1Progress,
    previousPPInsideR1S1Ready,
    previousPPInsideR1S1Message,
    previousUpexIncludedSymbols,
    previousUpexProgress,
    previousUpexReady,
    upexMessageFromPrep,
    previous15MTCIncludedSymbols,
    previous15MTCProgress,
    previous15MTCReady,
    previous15MTCMessage,
    previous15MMomentumIncludedSymbols,
    previous15MMomentumProgress,
    previous15MMomentumReady,
    previous15MMomentumMessage,
    candleBucket,
    hasConsolidateB,
    hasMomentumB,
    hasConsolidateA,
    hasPPConsolidateA,
    hasPPConsolidateB,
    hasPPMomentumA,
    hasPPMomentumB,
    hasPPVolatileR1S1,
    hasPPVolA,
    hasPPVolB,
    hasMomentumA,
    hasInsideR1S1,
    hasVolA,
    hasVolB,
    previousInsideR1S1Ready,
    previousInsideR1S1Progress,
    previousInsideR1S1Message,
    previousVolAReady,
    previousVolAProgress,
    previousVolAMessage,
    previousVolBReady,
    previousVolBProgress,
    previousVolBMessage,
    previousPPVolAReady,
    previousPPVolAProgress,
    previousPPVolAMessage,
    previousPPVolBReady,
    previousPPVolBProgress,
    previousPPVolBMessage,
    resetConsolidateAMessage,
    resetPPConsolidateAMessage,
    resetPPConsolidateBMessage,
    resetPPMomentumAMessage,
    resetPPMomentumBMessage,
    resetPPInsideR1S1Message,
    resetPPVolAMessage,
    resetPPVolBMessage,
    resetMomentumAMessage,
    resetConsolidateBMessage,
    resetMomentumBMessage,
    resetInsideR1S1Message,
    resetVolAMessage,
    resetVolBMessage,
  } = usePreviousCandleFilters({
    status,
    deltaStatus,
    allResults,
    deltaAllResults,
    setAllResults,
    setDeltaAllResults,
  });

  // Legend Card 2 — shared builder for toast focus, row click, and search.
  // Must sit AFTER scan + candle hooks so allResults / has* exist (TDZ).
  const applyLegendFocus = useCallback(
    (
      row: {
        symbol: string;
        source: string;
        prevCPR?: CPRResult["prevCPR"];
        todayCPR?: CPRResult["todayCPR"];
        PD15MConsolidateAPass?: boolean;
        PD15MBelowTCPass?: boolean;
        PD15MAboveBCPass?: boolean;
        PD15MMomentumBPass?: boolean;
        PD15MInsideR1S1Pass?: boolean;
        PD15MVolAPass?: boolean;
        PD15MVolBPass?: boolean;
        PD15MPPVolAPass?: boolean;
        PD15MPPVolBPass?: boolean;
        touchCategory?: boolean;
        ppTouchCategory?: boolean;
        pppTouchCategory?: boolean;
        ppCPR?: CPRResult["ppCPR"];
        // Session data for the R4/S4 session-extreme badge (full scan rows carry these).
        currentPrice?: number;
        todayHigh?: number;
        todayLow?: number;
      },
      preferredPatternId?: string,
    ) => {
      let pDayText = "—";
      let matchText = "—";
      const patternId = preferredPatternId || activeSignal || "";
      const viewDef = patternId ? getView(patternId) : undefined;
      const signalCode = patternId || "—";
      const direction = viewDef?.direction;

      if (hasInsideR1S1(row)) {
        const prevMicroOrTiny = isMicroOrTinyCPRSize(
          row.prevCPR?.widthPct,
        );
        pDayText =
          row.ppTouchCategory || prevMicroOrTiny
            ? "P-VOL-C"
            : "P-VOL-C ✗";
      } else if (hasConsolidateB(row)) pDayText = "P-CON-B";
      else if (hasMomentumB(row)) pDayText = "P-MOM-B";
      else if (hasConsolidateA(row)) pDayText = "P-CON-A";
      else if (hasMomentumA(row)) pDayText = "P-MOM-A";
      else if (hasVolA(row)) {
        const prevMicro =
          row.prevCPR &&
          Number.isFinite(row.prevCPR.widthPct) &&
          getWidthCategory(row.prevCPR.widthPct).key === "micro";
        pDayText =
          row.touchCategory || prevMicro ? "P-VOL-A" : "P-VOL-A ✗";
      } else if (hasVolB(row)) {
        const prevMicro =
          row.prevCPR &&
          Number.isFinite(row.prevCPR.widthPct) &&
          getWidthCategory(row.prevCPR.widthPct).key === "micro";
        pDayText =
          row.touchCategory || prevMicro ? "P-VOL-B" : "P-VOL-B ✗";
      } else {
        const conA = row.PD15MConsolidateAPass === true;
        const conB = row.PD15MBelowTCPass === true;
        const momA = row.PD15MAboveBCPass === true;
        const momB = row.PD15MMomentumBPass === true;
        if (conA && conB) {
          const prevMicroOrTiny = isMicroOrTinyCPRSize(
            row.prevCPR?.widthPct,
          );
          pDayText =
            row.ppTouchCategory || prevMicroOrTiny
              ? "P-VOL-C"
              : "P-VOL-C ✗";
        } else if (conB) pDayText = "P-CON-B";
        else if (momB) pDayText = "P-MOM-B";
        else if (conA) pDayText = "P-CON-A";
        else if (momA) pDayText = "P-MOM-A";
        else if (row.PD15MInsideR1S1Pass === true) {
          const prevMicroOrTiny = isMicroOrTinyCPRSize(
            row.prevCPR?.widthPct,
          );
          pDayText =
            row.ppTouchCategory || prevMicroOrTiny
              ? "P-VOL-C"
              : "P-VOL-C ✗";
        } else if (row.PD15MVolAPass === true) {
          const prevMicro =
            row.prevCPR &&
            Number.isFinite(row.prevCPR.widthPct) &&
            getWidthCategory(row.prevCPR.widthPct).key === "micro";
          pDayText =
            row.touchCategory || prevMicro ? "P-VOL-A" : "P-VOL-A ✗";
        } else if (row.PD15MVolBPass === true) {
          const prevMicro =
            row.prevCPR &&
            Number.isFinite(row.prevCPR.widthPct) &&
            getWidthCategory(row.prevCPR.widthPct).key === "micro";
          pDayText =
            row.touchCategory || prevMicro ? "P-VOL-B" : "P-VOL-B ✗";
        }
      }
      // PP exclusive (B > A), independent of P-bucket — single label under PDay.
      // PP labels follow the category rules; the VOL checks partition into C, A, or B.
      const ppVolLime =
        row.ppTouchCategory === true ||
        (Number.isFinite(row.ppCPR?.widthPct) &&
          getWidthCategory(row.ppCPR!.widthPct).key === "micro");
      const ppVolCLime =
        row.pppTouchCategory === true ||
        isMicroOrTinyCPRSize(row.ppCPR?.widthPct);
      const ppDayText = hasPPConsolidateB(row)
        ? "PP-CON-B"
        : hasPPMomentumB(row)
          ? "PP-MOM-B"
          : hasPPConsolidateA(row)
            ? "PP-CON-A"
            : hasPPMomentumA(row)
              ? "PP-MOM-A"
              : hasPPVolatileR1S1(row)
                ? ppVolCLime
                  ? "PP-VOL-C"
                  : "PP-VOL-C ✗"
                : hasPPVolA(row)
                  ? ppVolLime
                    ? "PP-VOL-A"
                    : "PP-VOL-A ✗"
                  : hasPPVolB(row)
                    ? ppVolLime
                      ? "PP-VOL-B"
                      : "PP-VOL-B ✗"
                    : undefined;

      const defs = viewDef?.levelCheckDefs;
      if (row.prevCPR && row.todayCPR) {
        const ladder = getLadderMatchSummary(row.prevCPR, row.todayCPR, defs as any);
        if (ladder.hasConditions) {
          matchText = `${ladder.matchingCount}/${ladder.total}`;
        }
      }
      // Same as Screener symbol cell: R4/S4 session extreme wins over View status.
      const sessionExtreme =
        row.todayCPR || row.currentPrice !== undefined
          ? sessionR4OrS4Hit(row)
          : null;
      const viewStatus =
        patternId && row.prevCPR && row.todayCPR
          ? safeSignalStatus(row, patternId)
          : null;
      setLegendToastFocus({
        symbol: row.symbol,
        source: row.source,
        signalCode,
        direction,
        pDayText,
        ppDayText,
        matchText,
        status: sessionExtreme ? "pass" : viewStatus,
        sessionExtreme: sessionExtreme ?? null,
      });
      if (row.source && row.symbol) {
        setFocusedRowKey(`${row.source}-${row.symbol}-${utcTodayISO()}`);
      }
    },
    // has* and activeSignal are stable enough for legend; intentionally broad
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSignal, hasInsideR1S1, hasConsolidateA, hasConsolidateB, hasMomentumA, hasMomentumB, hasPPConsolidateA, hasPPConsolidateB, hasPPMomentumA, hasPPMomentumB, hasPPVolatileR1S1, hasPPVolA, hasPPVolB],
  );

  // Entry-cross toast → Legend Card 2
  useEffect(() => {
    if (!focusSymbol) return;
    const sym = focusSymbol.symbol.toUpperCase();
    const src = focusSymbol.source;
    const pool = [
      ...allResults.map((r) => ({ ...r, source: "binance" as const })),
      ...deltaAllResults.map((r) => ({ ...r, source: "delta" as const })),
      ...coindcxAllResults.map((r) => ({ ...r, source: "coindcx" as const })),
    ];
    const row = pool.find(
      (r) => r.source === src && r.symbol.toUpperCase() === sym,
    );
    if (row) {
      applyLegendFocus(row, focusSymbol.patternId || activeSignal || "");
    } else {
      const patternId = focusSymbol.patternId || activeSignal || "";
      const viewDef = patternId ? getView(patternId) : undefined;
      setLegendToastFocus({
        symbol: focusSymbol.symbol,
        source: focusSymbol.source,
        signalCode: patternId || "—",
        direction: viewDef?.direction,
        pDayText: "—",
        matchText: "—",
        status: null,
        sessionExtreme: null,
      });
    }
    // Do not depend on allResults*: live price ticks would re-run this every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSymbol, applyLegendFocus]);

  // Manual search box → Legend Card 2 when the query resolves to one symbol
  useEffect(() => {
    const q = search.trim().toUpperCase();
    if (q.length < 2) return;
    // Don't fight an active toast focus that just set the search to the same symbol
    if (focusSymbol && focusSymbol.symbol.toUpperCase() === q) return;

    const pool = [
      ...allResults.map((r) => ({ ...r, source: "binance" as const })),
      ...deltaAllResults.map((r) => ({ ...r, source: "delta" as const })),
      ...coindcxAllResults.map((r) => ({ ...r, source: "coindcx" as const })),
    ];
    const exact = pool.filter((r) => {
      const s = r.symbol.toUpperCase();
      return s === q || s === `${q}USDT` || s.replace(/USDT$/, "") === q;
    });
    // Prefer current tab source when multiple exchanges match
    const preferred =
      exact.find((r) => r.source === activeTab) ||
      (exact.length === 1 ? exact[0] : null);
    if (preferred) {
      // Legend-only focus: don't switch the left-nav View or leave Show All.
      const viewId = pickPrimaryMatchingViewId(preferred, activeSignal || "");
      applyLegendFocus(preferred, viewId || activeSignal || "");
    }
    // Do not depend on allResults*: live price ticks would re-run this every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeTab, activeSignal, applyLegendFocus, focusSymbol]);


  const hasInRangeR = hasInsideR1S1;
  const previousCandleClassificationReady =
    previousConsolidateAReady &&
    previousPPConsolidateAReady &&
    previousPPConsolidateBReady &&
    previousPPMomentumAReady &&
    previousPPMomentumBReady &&
    previousPPInsideR1S1Ready &&
    previousPPVolAReady &&
    previousPPVolBReady &&
    previousUpexReady &&
    previous15MTCReady &&
    previous15MMomentumReady &&
    previousInsideR1S1Ready &&
    previousVolAReady &&
    previousVolBReady;

  // ── RECLAIM-S / RECLAIM-R ─────────────────────────────────────────────
  const {
    reclaimSFilter,
    setReclaimSFilter,
    reclaimRFilter,
    setReclaimRFilter,
    reclaimDepths,
    reclaimProgress,
    reclaimReady,
    reclaimMessage,
    clearReclaimMessage,
    resetReclaimUi,
  } = useReclaimFilters({
    status,
    deltaStatus,
    allResults,
    deltaAllResults,
  });
  reclaimResetRef.current = resetReclaimUi;

  const {
    cprboFilter,
    setCprboFilter,
    cprboMatches,
    cprboProgress,
    cprboReady,
    cprboMessage,
    pdhboFilter,
    setPdhboFilter,
    pdhboMatches,
    pdlboFilter,
    setPdlboFilter,
    pdlboMatches,
    resetFilters: resetBoundaryFilters,
  } = useCPRBOFilter({ status, deltaStatus, allResults, deltaAllResults });
  cprboResetRef.current = resetBoundaryFilters;

  // Sync showAll with left-nav selection
  const isFirstPatternRef = useRef(true);
  useEffect(() => {
    if (isFirstPatternRef.current) {
      isFirstPatternRef.current = false;
      return;
    }
    if (activeSignal) setShowAll(false);
    else setShowAll(true);
  }, [activeSignal]);


  useEffect(() => {
    if (allResults.length > 0) setFiltered(allResults.filter((r) => passesPattern(r, activeSignal)));
    if (deltaAllResults.length > 0) setDeltaFiltered(deltaAllResults.filter((r) => passesPattern(r, activeSignal)));
    if (coindcxAllResults.length > 0) setCoinDCXFiltered(coindcxAllResults.filter((r) => passesPattern(r, activeSignal)));
  }, [activeSignal, allResults, deltaAllResults, coindcxAllResults]);

  // ─── Two-way sync between the left-nav Views and the Screener's own
  //     Views filter buttons ────────────────────────────────────────────────
  // VIEW_SETTERS maps a left-nav Views (sub-pattern) id to the Screener
  // state setter of the hand-written button that implements the same filter,
  // so selecting a View in the sidebar also switches its Screener button on
  // (and the effect below turns every other one off).
  const VIEW_SETTERS: Partial<Record<string, (v: boolean) => void>> = {};

  // Current on/off state of each of those buttons — used to detect when the
  // user closes (✕) the Screener button for the View that the left-nav has
  // selected, so we can deselect it in the sidebar too.
  const VIEW_STATES: Record<string, boolean> = {};

  // Is activeSignal a Views leaf (a sub-pattern) rather than a category?
  const isSignalLeaf = useMemo(
    () => Object.values(Views).some((subs) => subs.some((s) => s.id === activeSignal)),
    [activeSignal],
  );

  // Display name of the currently selected signal (the highlighted "SIGNALS:"
  // pill) for the "Levels VIEW" badge in each row's expanded S/R ladder.
  // activeGenericSignal already covers both ways a specific View gets
  // selected — clicking its pill directly, and navigating straight to it
  // as a leaf via the left-nav (see the sync effect below, which calls
  // setActiveGenericSignal(activeSignal) for the leaf case) — so there's
  // no separate leaf/category branch needed here. null (no signal selected,
  // e.g. a plain category like "Levels Above" with nothing pinned) means
  // no badge is shown for that row.
  const activeSignalId = activeGenericSignal;
  const activeSignalName = activeSignalId
    ? VIEW_LABEL_BY_ID[activeSignalId] ?? activeSignalId
    : undefined;

  // The selected signal's own 13 Level Check conditions (its levelCheckDefs
  // from views.ts/BACKTEST_TARGETS — see passesPattern's v.levelCheckDefs
  // usage above and SRLadderDiff.tsx's compareSRLadders). Only defined
  // when a specific View is active AND that View actually has
  // levelCheckDefs — a category like "Levels Above" with nothing pinned,
  // or a View authored without them, has no Level Check to show, and
  // SRLadderDiffPanel already renders "No levelCheckDefs" plainly for
  // that case rather than needing a guessed fallback here.
  const activeSignalLevelCheckDefs = activeSignalId
    ? getView(activeSignalId)?.levelCheckDefs
    : undefined;

  // Sidebar → Screener: whenever the left-nav selects a View leaf, switch the
  // matching Screener filter button on. Runs after the reset effect above
  // (which clears every button on each activeSignal / results change), so the
  // selected one survives while the rest stay off.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!isSignalLeaf) return;
    const setter = VIEW_SETTERS[activeSignal];
    if (setter !== undefined) {
      Object.entries(VIEW_SETTERS).forEach(([id, set]) => set?.(id === activeSignal));
      setActiveGenericSignal(null);
    } else {
      // generic (data-driven) Views button
      setActiveGenericSignal(activeSignal);
    }
  }, [activeSignal, isSignalLeaf, allResults, deltaAllResults]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Sidebar → Screener (deselect): clicking the "✕" on a signal chip in
  // the left nav falls back to its parent category, so activeSignal goes from
  // a leaf to a non-leaf. The category-level reset above only clears buttons
  // when leaving the category entirely, so clear every View filter button here
  // too — both surfaces show the same filter and must switch off together.
  const prevPatternRef = useRef(activeSignal);
  useEffect(() => {
    const prev = prevPatternRef.current;
    prevPatternRef.current = activeSignal;
    if (prev === activeSignal) return;
    const prevWasLeaf = Object.values(Views).some((subs) => subs.some((s) => s.id === prev));
    if (prevWasLeaf && !isSignalLeaf) {
      Object.values(VIEW_SETTERS).forEach((set) => set?.(false));
      setActiveGenericSignal(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSignal, isSignalLeaf]);

  // activeSectionKey resolves either a category id or one of its leaves back to
  // the owning category, so the Views button row and the per-row direction dot
  // stay populated whether the category or a leaf triggered the selection.
  const activeSectionKey = useMemo(() => {
    if (Views[activeSignal]) return activeSignal; // already a category id
    for (const [section, subs] of Object.entries(Views)) {
      if (subs.some((s) => s.id === activeSignal)) return section;
    }
    return activeSignal; // not a known category or leaf — leave as-is
  }, [activeSignal]);
  const handleRowFocus = useCallback(
    (row: CPRResultWithSource) => {
      // Legend-only focus: don't switch the left-nav View or leave Show All.
      // Prefer a matching View; otherwise still focus the symbol with category context
      // so Card 1 (category) + Card 3 (symbol + status) fill even with no View match.
      const viewId = pickPrimaryMatchingViewId(
        row,
        activeSectionKey || activeSignal || "",
      );
      applyLegendFocus(
        row,
        viewId || activeSectionKey || activeSignal || "",
      );
    },
    [activeSectionKey, activeSignal, applyLegendFocus],
  );



  // NEW: reset the generic Views toggle whenever it no longer belongs to
  // the current activeSignal — either because we've left every generic
  // category entirely, or because we've switched from one generic category
  // to another (e.g. "levelsabove" -> "compressed") and the previously
  // selected sub-pattern id doesn't exist under the new one.
  useEffect(() => {
    if (!activeGenericSignal) return;
    const stillValid =
      GENERIC_VIEW_CATEGORIES.has(activeSectionKey) &&
      (Views[activeSectionKey] ?? []).some((s) => s.id === activeGenericSignal);
    if (!stillValid) setActiveGenericSignal(null);
  }, [activeSignal, activeSectionKey]);
  // NEW: report per-pattern (top-level nav) matching counts up to App so
  // the left sidebar can show "Little ABOVE (41)" etc. Computed off the
  // currently active tab's full unfiltered result set, so the counts
  // track whichever of Binance/Delta/Combined is selected, and recompute
  // whenever scan results or the active tab change.
  useEffect(() => {
    if (!onCounts) return;
    const rawPool: CPRResult[] =
      activeTab === "delta" ? deltaAllResults
      : activeTab === "coindcx" ? coindcxAllResults
      : activeTab === "combined" ? [...allResults, ...deltaAllResults, ...coindcxAllResults]
      : allResults;
    const pool = rawPool.filter(
      (r) => !shouldHideTradfiCommodRow(r.assetClass, hideTradfiWeekend),
    );
    if (pool.length === 0) {
      onCounts({});
      return;
    }
    const counts: Record<string, number> = {};
    for (const p of pivotcategories) {
      counts[p.id] = pool.filter((r) => passesPattern(r, p.id)).length;
    }
    // Also compute counts for each sub-pattern so the left-nav can show
    // "LA-BothTiny (2)" style badges next to each subfilter chip.
    for (const subs of Object.values(Views)) {
      for (const s of subs) {
        counts[s.id] = pool.filter((r) => passesPattern(r, s.id)).length;
      }
    }
    onCounts(counts);
  }, [allResults, deltaAllResults, coindcxAllResults, activeTab, onCounts, hideTradfiWeekend]);

  // NEW: per-view matching counts for the Views filter buttons rendered in
  // this screen ("(41)" suffix), computed off the same unfiltered pool used
  // for the left-nav counts so both always agree.
  const touchCounts = useMemo(() => {
    const rawPool: CPRResult[] =
      activeTab === "delta" ? deltaAllResults
      : activeTab === "coindcx" ? coindcxAllResults
      : activeTab === "combined" ? [...allResults, ...deltaAllResults, ...coindcxAllResults]
      : allResults;
    const pool = rawPool.filter(
      (r) => !shouldHideTradfiCommodRow(r.assetClass, hideTradfiWeekend),
    );
    return {
      insidecpr: pool.filter((r) => r.touchCategory && !!(r.InsideCPR || (r as any).insideCPR)).length,
      outcpr: pool.filter((r) => r.touchCategory && !!r.outCPR).length,
      OVA: pool.filter((r) => r.touchCategory && !!r.overlapHigher).length,
      overlapLower: pool.filter((r) => r.touchCategory && !!r.overlapLower).length,
      equalCPR: pool.filter((r) => r.touchCategory && !!r.equalCPR).length,
      // Narrow/Wide × CPR Above/Below — same rules as Narow-A / Wide-A row badges
      // (narrowCPR/strWideCPR + cprRising/cprFalling; exclude Inside/Outside where badges do).
      narrowA: pool.filter((r) => !!r.narrowCPR && !r.InsideCPR && !!r.cprRising).length,
      wideA: pool.filter((r) => !!r.strWideCPR && !r.outCPR && !!r.cprRising).length,
      narrowB: pool.filter((r) => !!r.narrowCPR && !r.InsideCPR && !!r.cprFalling).length,
      wideB: pool.filter((r) => !!r.strWideCPR && !r.outCPR && !!r.cprFalling).length,
      // Counts for the three extra filters that live in the TOUCH row. They
      // use the same predicates as the filters themselves, over the full pool.
      s1r1in: pool.filter(matchesS1R1In).length,
      pdhgtu1: pool.filter((r) => r.todayCPR.prevHigh > r.todayCPR.r1).length,
      pdlltl1: pool.filter((r) => r.todayCPR.prevLow < r.todayCPR.s1).length,
    };
  }, [allResults, deltaAllResults, coindcxAllResults, activeTab, hideTradfiWeekend]);

  const viewCounts = useMemo(() => {
    const rawPool: CPRResult[] =
      activeTab === "delta" ? deltaAllResults
      : activeTab === "coindcx" ? coindcxAllResults
      : activeTab === "combined" ? [...allResults, ...deltaAllResults, ...coindcxAllResults]
      : allResults;
    const pool = rawPool.filter(
      (r) => !shouldHideTradfiCommodRow(r.assetClass, hideTradfiWeekend),
    );
    const map: Record<string, number> = {};
    if (pool.length === 0) return map;
    const ids = new Set<string>();
    for (const p of pivotcategories) ids.add(p.id);
    for (const subs of Object.values(Views)) for (const s of subs) ids.add(s.id);
    for (const extra of EXTRA_VIEW_COUNT_IDS) ids.add(extra);
    for (const id of ids) map[id] = pool.filter((r) => passesPattern(r, id)).length;
    return map;
  }, [allResults, deltaAllResults, coindcxAllResults, activeTab, hideTradfiWeekend]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // MATCH, MOVE and Price open highest-first (desc) on the first click.
      setSortDir(key === "ladderCheck" || key === "priceVsCpr" || key === "change24h" ? "desc" : "asc");
    }
  };

  // Which source's progress the scanning status bar should reflect: the one
  // actually mid-scan right now, not whichever tab happens to be selected.
  // A hard refresh kicks off Binance/Delta/CoinDCX scans together without
  // switching tabs away from "binance", so once Binance (the fastest) is
  // done but CoinDCX (or Delta) is still running, the bar used to keep
  // showing stale Binance text/progress because it only ever looked at
  // activeTab. Falls back to activeTab once nothing is actively scanning
  // (the block isn't rendered at that point anyway).
  const scanningSource: "binance" | "delta" | "coindcx" =
    status === "scanning" ? "binance"
    : deltaStatus === "scanning" ? "delta"
    : coindcxStatus === "scanning" ? "coindcx"
    : activeTab === "delta" ? "delta"
    : activeTab === "coindcx" ? "coindcx"
    : "binance";
  const activeProgress =
    scanningSource === "delta" ? deltaProgress
    : scanningSource === "coindcx" ? coindcxProgress
    : progress;
  const progressPct = activeProgress.total > 0 ? Math.round((activeProgress.done / activeProgress.total) * 100) : 0;

  const combinedResults: CPRResultWithSource[] = useMemo(() => [
    ...filtered.map((r) => ({ ...r, source: "binance" as const })),
    ...deltaFiltered.map((r) => ({ ...r, source: "delta" as const })),
    ...coindcxFiltered.map((r) => ({ ...r, source: "coindcx" as const })),
  ], [filtered, deltaFiltered, coindcxFiltered]);
  const combinedAllResults: CPRResultWithSource[] = useMemo(() => [
    ...allResults.map((r) => ({ ...r, source: "binance" as const })),
    ...deltaAllResults.map((r) => ({ ...r, source: "delta" as const })),
    ...coindcxAllResults.map((r) => ({ ...r, source: "coindcx" as const })),
  ], [allResults, deltaAllResults, coindcxAllResults]);

  // Keep the source-tagged row objects stable across unrelated UI updates.
  // Besides avoiding repeated pool construction below, this lets memoized
  // table rows skip their expensive badge/level rendering while search updates.
  const activePool: CPRResultWithSource[] = useMemo(() => {
    // NEW: generic Views (sub-pattern) pool — covers every category in
    // GENERIC_VIEW_CATEGORIES. passesPattern(r, id) already resolves any
    // sub-pattern id generically (same lookup used for the left-nav counts
    // above), so this one branch replaces what would otherwise be a
    // separate hand-written pool block per sub-pattern.
    if (activeGenericSignal && GENERIC_VIEW_CATEGORIES.has(activeSectionKey)) {
      const pick = (rows: CPRResult[], source: SourceId): CPRResultWithSource[] =>
        rows.filter((r) => passesPattern(r, activeGenericSignal)).map((r) => ({ ...r, source }));
      const b = pick(allResults, "binance");
      const d = pick(deltaAllResults, "delta");
      const c = pick(coindcxAllResults, "coindcx");
      if (activeTab === "combined") return [...b, ...d, ...c];
      if (activeTab === "delta") return d;
      if (activeTab === "coindcx") return c;
      return b;
    }
    if (activeTab === "combined") return showAll ? combinedAllResults : combinedResults;
    if (activeTab === "delta") return (showAll ? deltaAllResults : deltaFiltered).map((r) => ({ ...r, source: "delta" as const }));
    if (activeTab === "coindcx") return (showAll ? coindcxAllResults : coindcxFiltered).map((r) => ({ ...r, source: "coindcx" as const }));
    if (activeTab === "nifty") return []; // live CPR rows after Shoonya API is wired
    return (showAll ? allResults : filtered).map((r) => ({ ...r, source: "binance" as const }));
  }, [
    activeGenericSignal,
    activeSectionKey,
    activeTab,
    allResults,
    coindcxAllResults,
    coindcxFiltered,
    combinedAllResults,
    combinedResults,
    deltaAllResults,
    deltaFiltered,
    filtered,
    showAll,
  ]);

  // Five mutually exclusive previous-session buckets. Assignment order:
  //   1. Both CON-A AND CON-B raw pass → INSIDE-R1S1  (intersection only)
  //   2. CON-B alone → P-CON-B
  //   3. MOM-B (and not CON-B) → P-MOM-B
  //   4. CON-A alone → P-CON-A
  //   5. MOM-A (and not CON-A) → P-MOM-A
  // INSIDE-R1S1 is ONLY the intersection of CON-A ∩ CON-B — no separate
  // range scan and no leftover / pure-inside assignment.
  const poolCounts = useMemo(() => {
    const reclaimByRow = new Map<string, ReturnType<typeof getReclaimStates>>();
    const counts = {
      previousConsolidateAIncludedCount: 0,
      previousPPMomentumAIncludedCount: 0,
      previousPPMomentumBIncludedCount: 0,
      previousPPVolatileR1S1IncludedCount: 0,
      previousPPVolAIncludedCount: 0,
      previousPPVolBIncludedCount: 0,
      previousPPConsolidateAIncludedCount: 0,
      previousPPConsolidateBIncludedCount: 0,
      previousUpexIncludedCount: 0,
      previous15MTCIncludedCount: 0,
      previous15MMomentumIncludedCount: 0,
      previousInsideR1S1IncludedCount: 0,
      previousVolAIncludedCount: 0,
      previousVolBIncludedCount: 0,
      reclaimSCount: 0,
      reclaimRCount: 0,
      cprboCount: 0,
      pdhboCount: 0,
      pdlboCount: 0,
      strongBarUpCount: 0,
      strongBarDownCount: 0,
    };

    for (const row of activePool) {
      if (row.source !== "coindcx") {
        counts.cprboCount += Number(cprboMatches.has(`${row.source}:${row.symbol}`));
        counts.pdhboCount += Number(pdhboMatches.has(`${row.source}:${row.symbol}`));
        counts.pdlboCount += Number(pdlboMatches.has(`${row.source}:${row.symbol}`));
      }
      if (row.source !== "coindcx") {
        const key = `${row.source}:${row.symbol}`;
        const reclaim = getReclaimStates(row, reclaimDepths.get(key));
        reclaimByRow.set(key, reclaim);
        counts.reclaimSCount += Number(!!reclaim.s?.qualifies);
        counts.reclaimRCount += Number(!!reclaim.r?.qualifies);
        counts.previousConsolidateAIncludedCount += Number(hasConsolidateA(row));
        counts.previousPPMomentumAIncludedCount += Number(hasPPMomentumA(row));
        counts.previousPPMomentumBIncludedCount += Number(hasPPMomentumB(row));
        counts.previousPPVolatileR1S1IncludedCount += Number(hasPPVolatileR1S1(row));
        counts.previousPPVolAIncludedCount += Number(hasPPVolA(row));
        counts.previousPPVolBIncludedCount += Number(hasPPVolB(row));
        counts.previousPPConsolidateAIncludedCount += Number(hasPPConsolidateA(row));
        counts.previousPPConsolidateBIncludedCount += Number(hasPPConsolidateB(row));
        counts.previousUpexIncludedCount += Number(hasMomentumA(row));
        counts.previous15MTCIncludedCount += Number(hasConsolidateB(row));
        counts.previous15MMomentumIncludedCount += Number(hasMomentumB(row));
        counts.previousInsideR1S1IncludedCount += Number(hasInsideR1S1(row));
        counts.previousVolAIncludedCount += Number(hasVolA(row));
        counts.previousVolBIncludedCount += Number(hasVolB(row));
      }
      counts.strongBarUpCount += Number(!!(row.strongBar?.signal && row.strongBar.side === "up"));
      counts.strongBarDownCount += Number(!!(row.strongBar?.signal && row.strongBar.side === "down"));
    }

    return { ...counts, reclaimByRow };
  }, [
    activePool,
    reclaimDepths,
    cprboMatches,
    pdhboMatches,
    pdlboMatches,
    hasConsolidateA,
    hasPPMomentumA,
    hasPPMomentumB,
    hasPPVolatileR1S1,
    hasPPVolA,
    hasPPVolB,
    hasPPConsolidateA,
    hasPPConsolidateB,
    hasMomentumA,
    hasConsolidateB,
    hasMomentumB,
    hasInsideR1S1,
    hasVolA,
    hasVolB,
  ]);
  const {
    previousConsolidateAIncludedCount,
    previousPPMomentumAIncludedCount,
    previousPPMomentumBIncludedCount,
    previousPPVolatileR1S1IncludedCount,
    previousPPVolAIncludedCount,
    previousPPVolBIncludedCount,
    previousPPConsolidateAIncludedCount,
    previousPPConsolidateBIncludedCount,
    previousUpexIncludedCount,
    previous15MTCIncludedCount,
    previous15MMomentumIncludedCount,
    previousInsideR1S1IncludedCount,
    previousVolAIncludedCount,
    previousVolBIncludedCount,
    reclaimSCount,
    reclaimRCount,
    cprboCount,
    pdhboCount,
    pdlboCount,
    strongBarUpCount,
    strongBarDownCount,
    reclaimByRow,
  } = poolCounts;
  const previousInRangeRIncludedCount = previousInsideR1S1IncludedCount;

  const reclaimStatesFor = useCallback((row: CPRResultWithSource) =>
    row.source === "coindcx"
      ? { s: null, r: null }
      : reclaimByRow.get(`${row.source}:${row.symbol}`) ??
        getReclaimStates(row, reclaimDepths.get(`${row.source}:${row.symbol}`)),
    [reclaimByRow, reclaimDepths],
  );


  // Search box matches EITHER the symbol OR the name of any View the row
  // currently satisfies (the same names shown in the table's VIEW column,
  // via getMatchingSignals). Typing part of a View name — e.g. "EU3L4" —
  // keeps only the rows that match a View whose label/id contains it.
  const displayed = useMemo(() => {
    const searchQuery = deferredSearch.trim().toLowerCase();
    const matchesSearch = (r: CPRResultWithSource): boolean => {
      if (!searchQuery) return true;
      if (r.symbol.toLowerCase().includes(searchQuery)) return true;
      return getMatchingSignals(r).some(
        (v) =>
          v.label.toLowerCase().includes(searchQuery) ||
          v.id.toLowerCase().includes(searchQuery),
      );
    };

    return activePool
    .filter(
      (r) => !shouldHideTradfiCommodRow(r.assetClass, hideTradfiWeekend),
    )
    .filter((r) => {
      if (!classFilter) return true;
      const ac = r.assetClass;
      if (classFilter === "COMMOD") return ac === "COMMOD";
      if (classFilter === "TRADFI") return ac === "TRADFI";
      // CRYPTO = everything that is not stamped COMMOD/TRADFI
      return ac !== "COMMOD" && ac !== "TRADFI";
    })
    .filter(matchesSearch)
    .filter((r) => {
      if (breakoutMode === "off") return true;
      return !!r.breakout?.signal || !!r.breakdown?.signal;
    })
    // NEW: CL2U1 / CL4U3 are independent booleans in cpr.ts (not
    // actually gated behind srLower), so a row can satisfy one of them
    // AND a higher-priority bucket (e.g. srHigher) at the same time.
    // getOuterLevelPatternInfo() only ever returns ONE label per row and checks the
    // other buckets first, so matching on getOuterLevelPatternInfo(r)?.label would
    // silently miss rows where CL2U1/CL4U3 is true but shadowed by
    // an earlier bucket. Check the raw flags directly for these two so
    // the filter buttons actually work independent of the primary badge.
    .filter((r) => {
      if (!touchFilter) return true;
      // Classic TOUCH chips only apply inside the TOUCH category.
      if (
        touchFilter === "insidecpr" ||
        touchFilter === "outcpr" ||
        touchFilter === "OVA" ||
        touchFilter === "overlapLower" ||
        touchFilter === "equal-cpr"
      ) {
        if (!r.touchCategory) return false;
        if (touchFilter === "insidecpr") return !!(r.InsideCPR || (r as any).insideCPR);
        if (touchFilter === "outcpr") return !!r.outCPR;
        if (touchFilter === "OVA") return !!r.overlapHigher;
        if (touchFilter === "overlapLower") return !!r.overlapLower;
        if (touchFilter === "equal-cpr") return !!r.equalCPR;
        return true;
      }
      // Narrow/Wide chips match row badges (not limited to TOUCH category).
      if (touchFilter === "narrow-a") return !!r.narrowCPR && !r.InsideCPR && !!r.cprRising;
      if (touchFilter === "wide-a") return !!r.strWideCPR && !r.outCPR && !!r.cprRising;
      if (touchFilter === "narrow-b") return !!r.narrowCPR && !r.InsideCPR && !!r.cprFalling;
      if (touchFilter === "wide-b") return !!r.strWideCPR && !r.outCPR && !!r.cprFalling;
      return true;
    })
    .filter((r) => {
      if (!PatternFilter) return true;
      if (PatternFilter === "INCPR" || PatternFilter === "Inside") return !!(r.InsideCPR || (r as any).insideCPR);
      if (PatternFilter === "OutCPR") return !!r.outCPR;
      if (PatternFilter === "CL4U3") return r.CL4U3;
      if (PatternFilter === "L4U4") return r.L4U4;
      // NEW: EU4L4 — independent, section-agnostic Pattern flag (see
      // doc-comment on PatternInfo/getOuterLevelPatternInfo in ScreenerUtils.tsx).
      if (PatternFilter === "EU4L4") return r.EU4L4;
      // NEW: EL4U4 — independent, section-agnostic Pattern flag, mirror
      // of EU4L4 gated on srExpandedLower instead of srExpandedHigher
      // (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (PatternFilter === "EL4U4") return r.EL4U4;
      // NEW: QU4L4 — today R4 == prev R4 AND today S4 == prev S4 (cpr.ts).
      if (PatternFilter === "QU4L4") return r.QU4L4;
      if (PatternFilter === "EU3L3") return r.EU3L3;
      if (PatternFilter === "EL3U3") return r.EL3U3;
      // NEW: U4L4 — independent, section-agnostic Pattern flag,
      // mirror of EU4L4 (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (PatternFilter === "U4L2") return r.U4L2;
      if (PatternFilter === "U3L2") return r.U3L2;
      if (PatternFilter === "U4L3") return r.U4L3;
      if (PatternFilter === "U4L4") return r.U4L4;
      // NEW: EU3L4 — unconditional Pattern flag.
      if (PatternFilter === "EU3L4") return r.EU3L4;
      // NEW: U3L4 / CU3L2 — same treatment: independent,
      // section-agnostic Pattern flags, always shown regardless of
      // activeSignal/left-nav.
      if (PatternFilter === "U3L4") return r.U3L4;
      // NEW: U2L4 — same treatment as U3L4: independent,
      // section-agnostic Pattern flag, always shown regardless of
      // activeSignal/left-nav.
      if (PatternFilter === "U2L4") return r.U2L4;
      if (PatternFilter === "U1L4") return r.U1L4;
      // NEW: L3TC — same treatment as U3L4/U2L4: independent,
      // section-agnostic Pattern flag, always shown regardless of
      // activeSignal/left-nav.
      if (PatternFilter === "L3TC") return r.L3TC;
      if (PatternFilter === "EL1L2") return r.EL1L2;
      if (PatternFilter === "EL2L1") return r.EL2L1;
      if (PatternFilter === "CU3L2") return r.CU3L2;
      if (PatternFilter === "CU3L3") return r.CU3L3;
      // NEW: EL2U4 — independent, section-agnostic Pattern flag
      // (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (PatternFilter === "EL2U4") return r.EL2U4;
      // NEW: EL3U4 — independent, section-agnostic Pattern flag
      // (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (PatternFilter === "EL3U4") return r.EL3U4;
      if (PatternFilter === "CU4L2") return r.CU4L2;
      if (PatternFilter === "CU4L4") return r.CU4L4;
      if (PatternFilter === "CU4L3") return r.CU4L3;
      if (PatternFilter === "CL3U3") return r.CL3U3;
      if (PatternFilter === "L4U3") return r.L4U3;
      if (PatternFilter === "L3U3") return r.L3U3;
      if (PatternFilter === "L4U2") return r.L4U2;
      if (PatternFilter === "L3U2") return r.L3U2;
      if (PatternFilter === "L3U4") return r.L3U4;
      if (PatternFilter === "L2U4") return r.L2U4;
      if (PatternFilter === "CL3U2") return r.CL3U2;
      if (PatternFilter === "L1U4") return r.L1U4;
      if (PatternFilter === "CL4U2") return r.CL4U2;
      // NEW: eXL*U1 / eXL*CPR sub-type badges
      if (PatternFilter === "EU1L2") return r.EU1L2;
      if (PatternFilter === "EU1L3") return r.EU1L3;
      if (PatternFilter === "EU1L4") return r.EU1L4;
      if (PatternFilter === "EUBL1") return r.EUBL1;
      if (PatternFilter === "EUPL1") return r.EUPL1;
      if (PatternFilter === "EUTL1") return r.EUTL1;
      if (PatternFilter === "EUBL2") return r.EUBL2;
      if (PatternFilter === "EUBL3") return r.EUBL3;
      if (PatternFilter === "EUPL3") return r.EUPL3;
      // NEW: CL1U1 / CU1L1 / CL2U2 / CU2L2 — independent,
      // section-agnostic Pattern flags (see cpr.ts).
      if (PatternFilter === "CL1U1") return r.CL1U1;
      if (PatternFilter === "CU1L1") return r.CU1L1;
      if (PatternFilter === "CL2U2") return r.CL2U2;
      if (PatternFilter === "CU2L2") return r.CU2L2;
      // NEW: CL2U1 — independent, section-agnostic Pattern flag (see cpr.ts).
      if (PatternFilter === "CL2U1") return r.CL2U1;
      if (PatternFilter === "CL4U4") return r.CL4U4;
      if (PatternFilter === "EU2L3") return r.EU2L3;
      // NEW: expanded family — EUTL3 / EU2L4 / EU2L2 / EUTL2 / EU1L1
      if (PatternFilter === "EUTL3") return r.EUTL3;
      if (PatternFilter === "EU2L4") return r.EU2L4;
      if (PatternFilter === "EU2L2") return r.EU2L2;
      if (PatternFilter === "EUTL2") return r.EUTL2;
      if (PatternFilter === "EU1L1") return r.EU1L1;
      // NEW: EL1U1 — same band shape as EU1L1, split by which gap (R1-R4 vs S1-S4) is larger
      if (PatternFilter === "EL1U1") return r.EL1U1;
      if (PatternFilter === "EL1U2") return r.EL1U2;
      // NEW: EL1U3 (prev R4 in today R2/R3, prev S4 in today BC/S1) /
      // ELTU2 (prev R4 in today R1/R2, prev S4 in today TC/R1)
      if (PatternFilter === "EL1U3") return r.EL1U3;
      if (PatternFilter === "EL2U3") return r.EL2U3;
      if (PatternFilter === "ELTU2") return r.ELTU2;
      // NEW: ELBU2 (prev R4 in today R1/R2, prev S4 in today BC/Pivot) /
      // ELTU3 (prev R4 in today R2/R3, prev S4 in today TC/R1) /
      // ELPU2 (prev R4 in today R1/R2, prev S4 in today Pivot/TC)
      if (PatternFilter === "ELBU2") return r.ELBU2;
      if (PatternFilter === "ELTU3") return r.ELTU3;
      if (PatternFilter === "ELPU2") return r.ELPU2;
      // NEW: ELPU3 (prev R4 in today R2/R3, prev S4 in today Pivot/TC)
      if (PatternFilter === "ELPU3") return r.ELPU3;
      // NEW: ELBU3 (prev R4 in today R2/R3, prev S4 in today BC/Pivot)
      if (PatternFilter === "ELBU3") return r.ELBU3;
      // NEW: EUPL2 (prev S4 in today S2/S1, prev R4 in today BC/Pivot)
      if (PatternFilter === "EUPL2") return r.EUPL2;
      // NEW: EUTL4 (prev S4 in today S4/S3, prev R4 in today Pivot/TC)
      if (PatternFilter === "EUTL4") return r.EUTL4;
      // NEW: L2U3 (today R4 in prev R2/R3, prev S4 in today S2/S1)
      if (PatternFilter === "L2U3") return r.L2U3;
      // NEW: CU2L1 (today S4 in prev S1/BC, today R4 in prev R1/R2)
      if (PatternFilter === "CU2L1") return r.CU2L1;
      // NEW: CU2BC (today S4 in prev BC/Pivot, today R4 in prev R1/R2)
      if (PatternFilter === "CU2BC") return r.CU2BC;
      // NEW: CU3L1 (today S4 in prev S1/BC, today R4 in prev R2/R3)
      if (PatternFilter === "CU3L1") return r.CU3L1;
      // NEW: U2L3 (today S4 in prev S3/S2, prev R4 in prev R1/R2)
      if (PatternFilter === "U2L3") return r.U2L3;
      return getOuterLevelPatternInfo(r)?.label === PatternFilter;
    })
    .filter((r) => matchesWidthFilter(r, prevWidthFilter, todayWidthFilter))
    // NEW: Price Level filter — price above PDH, below PDL, above prev day's
    // R4 (PU4), or below prev day's S4 (PL4)
    .filter((r) => {
      if (pdhPdlFilter === "s1r1in") return matchesS1R1In(r);
      if (pdhPdlFilter === "pdhgtu1") return r.todayCPR.prevHigh > r.todayCPR.r1;
      if (pdhPdlFilter === "pdlltl1") return r.todayCPR.prevLow < r.todayCPR.s1;
      if (pdhPdlFilter === "above") return r.currentPrice > r.todayCPR.prevHigh;
      if (pdhPdlFilter === "below") return r.currentPrice < r.todayCPR.prevLow;
      if (pdhPdlFilter === "abovepu4") return r.currentPrice > r.prevCPR.r4;
      if (pdhPdlFilter === "belowpl4") return r.currentPrice < r.prevCPR.s4;
      return true;
    })
    .filter(
      (r) =>
        previousCandleFilter !== "consolidate-a" ||
        hasConsolidateA(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "pp-consolidate-a" ||
        hasPPConsolidateA(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "pp-consolidate-b" ||
        hasPPConsolidateB(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "pp-momentum-a" ||
        hasPPMomentumA(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "pp-momentum-b" ||
        hasPPMomentumB(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "pp-volatile-r1s1" ||
        hasPPVolatileR1S1(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "pp-vol-a" ||
        hasPPVolA(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "pp-vol-b" ||
        hasPPVolB(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "momentum-a" ||
        hasMomentumA(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "consolidate-b" ||
        hasConsolidateB(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "momentum-b" ||
        hasMomentumB(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "inside-r1s1" ||
        hasInRangeR(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "vol-a" ||
        hasVolA(r)
    )
    .filter(
      (r) =>
        previousCandleFilter !== "vol-b" ||
        hasVolB(r)
    )
    // RECLAIM-S / RECLAIM-R — live failed breakdown / breakout (independent of
    // the previous-session Consolidate/Momentum filters, so they combine).
    .filter((r) => !reclaimSFilter || !!reclaimStatesFor(r).s?.qualifies)
    .filter((r) => !reclaimRFilter || !!reclaimStatesFor(r).r?.qualifies)
    .filter((r) => !cprboFilter || cprboMatches.has(`${r.source}:${r.symbol}`))
    .filter((r) => !pdhboFilter || pdhboMatches.has(`${r.source}:${r.symbol}`))
    .filter((r) => !pdlboFilter || pdlboMatches.has(`${r.source}:${r.symbol}`))
    .filter((r) => {
      if (strongBarFilter === "off") return true;
      if (!r.strongBar?.signal) return false;
      return r.strongBar.side === strongBarFilter;
    })
    // Active / Ready status filter (see getRowStatus).
    .filter((r) => {
      if (statusFilter === "all") return true;
      const st = getRowStatus(r);
      if (statusFilter === "active") return st.active;
      if (statusFilter === "ready") return st.ready;
      if (statusFilter === "pass") return st.pass;
      if (statusFilter === "fail") return st.fail;
      return true;
    })
    // Hide Pass — works with All/Active/Ready/Fail so completed targets drop out
    // of the working list without forcing the Pass-only tab.
    .filter((r) => !hidePass || !getRowStatus(r).pass)
    // NEW: ENTRY filter — keep rows where at least one currently-active View
    // (condition passes) has the selected rung as its entry. Entry is the
    // View's own getEntry(r); Views without one never match.
    .filter((r) => {
      if (!entryLevelFilter) return true;
      const rung = ENTRY_DEFS[entryLevelFilter]?.key;
      if (!rung) return true;
      const target = r.todayCPR[rung];
      return entrySignalViews.some((v) => {
        if (!v.getEntry || !passesPattern(r, v.key)) return false;
        const entry = v.getEntry(r);
        return Math.abs(entry - target) <= Math.abs(target) * 1e-9;
      });
    })
    .slice()
    .sort((a, b) => {
      const av = getVal(a, sortKey);
      const bv = getVal(b, sortKey);
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [
    activePool,
    breakoutMode,
    classFilter,
    deferredSearch,
    entryLevelFilter,
    entrySignalViews,
    hasConsolidateA,
    hasConsolidateB,
    hasInsideR1S1,
    hasMomentumA,
    hasMomentumB,
    hasPPConsolidateA,
    hasPPConsolidateB,
    hasPPMomentumA,
    hasPPMomentumB,
    hasPPVolA,
    hasPPVolB,
    hasPPVolatileR1S1,
    hasVolA,
    hasVolB,
    hidePass,
    hideTradfiWeekend,
    matchesS1R1In,
    pdhPdlFilter,
    PatternFilter,
    prevWidthFilter,
    previousCandleFilter,
    reclaimByRow,
    reclaimDepths,
    reclaimRFilter,
    cprboFilter,
    cprboMatches,
    reclaimSFilter,
    sortDir,
    sortKey,
    statusFilter,
    strongBarFilter,
    todayWidthFilter,
    touchFilter,
  ]);

  // Signal Desk consumes this pool directly, NOT `displayed`. `displayed`
  // is scoped to whichever tab (Binance/Delta/Combined) happens to be
  // active on the Live Screener right now, via activePool's
  // activeTab checks — that's the right pool for the Screener table, but
  // Signal Desk has its own independent Binance/Delta/All source toggle,
  // and needs the FULL combined universe available at all times so that
  // toggle actually has data to filter into. Using `displayed` here meant
  // the Delta tab in Signal Desk showed nothing whenever the Live
  // Screener's own tab happened to be sitting on "binance".
  // change24h is passed straight through so SignalDeskSymbol's optional
  // 24h-change badge has data to render. direction drives SignalDesk's
  // long/short header icon — see getRowDirection in ScreenerUtils.tsx.
  const signalSymbols = useMemo(
    () =>
      combinedAllResults
        .filter((r) => !shouldHideTradfiCommodRow(r.assetClass, hideTradfiWeekend))
        .map((r) => ({
          key: `${r.source}-${r.symbol}`,
          symbol: r.symbol,
          source: r.source,
          currentPrice: r.currentPrice,
          change24h: r.change24h,
          direction: getRowDirection(r, activeSignal),
          s4: r.todayCPR.s4,
          s3: r.todayCPR.s3,
          s2: r.todayCPR.s2,
          s1: r.todayCPR.s1,
          pivot: r.todayCPR.pivot,
          r1: r.todayCPR.r1,
          r2: r.todayCPR.r2,
          r3: r.todayCPR.r3,
          r4: r.todayCPR.r4,
        })),
    [activeSignal, combinedAllResults, hideTradfiWeekend],
  );
  const signalSymbolsKey = useMemo(
    () =>
      signalSymbols
        .map((r) => `${r.key}:${r.currentPrice}:${r.change24h}:${r.direction}`)
        .join("|"),
    [signalSymbols],
  );

  useEffect(() => {
    onSignalSymbols?.(signalSymbols);
    // signalSymbolsKey is a stable primitive representation of the displayed
    // result pool; it prevents a new array instance from retriggering this
    // effect on every Screener render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSignalSymbols, signalSymbolsKey]);

  useEffect(() => {
    onResults?.(combinedAllResults);
    // Depend on allResults/deltaAllResults themselves (not combinedAllResults,
    // which is memoized from those source arrays) — those state values
    // only get a new identity when a scan actually completes (setAllResults /
    // setDeltaAllResults), so this only fires on real new data, not on every
    // tab switch or filter click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onResults, allResults, deltaAllResults, coindcxAllResults]);

  const currentStatus =
    activeTab === "binance" ? status
    : activeTab === "delta" ? deltaStatus
    : activeTab === "coindcx" ? coindcxStatus
    : activeTab === "nifty" ? "done"
    : status === "done" || deltaStatus === "done" || coindcxStatus === "done" ? "done"
    : status === "scanning" || deltaStatus === "scanning" || coindcxStatus === "scanning" ? "scanning"
    : "idle";

  // "Scanned at" badge time for the active tab — Combined shows whichever
  // of the two sources scanned most recently, so the badge always reflects
  // the freshest data actually feeding the table.
  const activeScannedAt =
    activeTab === "binance" ? binanceScannedAt
    : activeTab === "delta" ? deltaScannedAt
    : activeTab === "coindcx" ? coindcxScannedAt
    : (() => {
        const times = [binanceScannedAt, deltaScannedAt, coindcxScannedAt].filter(
          (t): t is number => t !== null,
        );
        return times.length > 0 ? Math.max(...times) : null;
      })();

  const currentFilteredCount =
    activeTab === "combined" ? combinedResults.length
    : activeTab === "delta" ? deltaFiltered.length
    : activeTab === "coindcx" ? coindcxFiltered.length
    : activeTab === "nifty" ? 0
    : filtered.length;

  const currentAllCount = (() => {
    const pool =
      activeTab === "combined" ? combinedAllResults
      : activeTab === "delta" ? deltaAllResults
      : activeTab === "coindcx" ? coindcxAllResults
      : activeTab === "nifty" ? []
      : allResults;
    if (activeTab === "nifty") return NIFTY_MOCK_CONTRACTS.length;
    return pool.filter((r) => !shouldHideTradfiCommodRow(r.assetClass, hideTradfiWeekend)).length;
  })();

  const currentError =
    activeTab === "delta" ? deltaError
    : activeTab === "coindcx" ? coindcxError
    : error;
  const canShowCombined = status === "done" || deltaStatus === "done" || coindcxStatus === "done";

  // Helper: is any sub-filter active (to decide the result count label)
  const anySubFilter =
    !!activeGenericSignal ||
    !!PatternFilter || !!touchFilter || !!classFilter || !!prevWidthFilter || !!todayWidthFilter || !!pdhPdlFilter || previousCandleFilter !== "all" || reclaimSFilter || reclaimRFilter || cprboFilter || pdhboFilter || pdlboFilter || strongBarFilter !== "off" || statusFilter !== "all" || hidePass || !!entryLevelFilter;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl px-4 pt-3 pb-8 min-h-screen flex flex-col">
        {/* Header — description paragraph removed, spacing tightened so the
            title row and the Legend grid below both sit higher on the page.
            Title stacks tightly over the byline (no gap between them), the
            title is sized to use the extra width now available, and the
            stat cards fill the empty space between the title block and the
            live clock. */}
        <div className="flex items-stretch justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div className="flex flex-col gap-0">
              <h1 className="text-2xl font-extrabold tracking-wide leading-none whitespace-nowrap flex items-center gap-1.5">
                <span className="bg-gradient-to-r from-primary to-sky-400 bg-clip-text text-transparent">
                  PIVOT LEVEL
                </span>
                {/* Views */}
                <span
                  className="relative inline-flex items-center italic font-semibold"
                  style={{
                    background: "linear-gradient(90deg, #22c55e, #14b8a6, #06b6d4)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  V
                  <span className="relative inline-block">
                    ı
                    <span
                      className="absolute -top-1 left-[60%] h-1 w-1 rounded-full bg-cyan-300 animate-pulse"
                      style={{
                        WebkitTextFillColor: "initial",
                        boxShadow: "0 0 6px #22d3ee",
                      }}
                    />
                  </span>
                  ews
                </span>
                {/* Live */}
                <span
                  className="relative inline-flex items-center italic font-semibold"
                  style={{
                    background: "linear-gradient(90deg, #22c55e, #14b8a6, #06b6d4)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  L
                  <span className="relative inline-block">
                    ı
                    <span
                      className="absolute -top-1 left-[60%] h-1 w-1 rounded-full bg-cyan-300 animate-pulse"
                      style={{
                        WebkitTextFillColor: "initial",
                        boxShadow: "0 0 6px #22d3ee",
                      }}
                    />
                  </span>
                  ve
                </span>
              </h1>
              <span className="text-xs font-mono text-primary">
                by Kriven Gokul - PivotBull
              </span>
            </div>
          </div>

          {currentStatus === "done" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-[220px] max-w-xl">
              <div className="rounded-lg border border-border bg-card px-3 py-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Symbols
                </p>
                <p className="mt-0.5 text-lg font-semibold">{combinedAllResults.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Binance
                </p>
                <p className="mt-0.5 text-lg font-semibold text-blue-300">{allResults.length}</p>
              </div>
              <div className={`rounded-lg border border-border bg-card px-3 py-1 ${DELTA_ENABLED ? "" : "opacity-40"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Delta{DELTA_ENABLED ? "" : " (paused)"}
                </p>
                <p className="mt-0.5 text-lg font-semibold text-violet-300">{deltaAllResults.length}</p>
              </div>
              <div className={`rounded-lg border border-border bg-card px-3 py-1 ${COINDCX_ENABLED ? "" : "opacity-40"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  CoinDCX{COINDCX_ENABLED ? "" : " (paused)"}
                </p>
                <p className="mt-0.5 text-lg font-semibold text-emerald-300">{coindcxAllResults.length}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col items-end justify-center gap-1.5 shrink-0 min-w-[200px]">
            <LiveClock />
            {currentStatus === "done" && activeScannedAt && (
              <div
                className="flex items-center gap-2 shrink-0 select-none px-2.5 py-1 rounded-md"
                style={{
                  borderTop: "1px solid #1e2d3d",
                  background: "rgba(13, 20, 34, 0.6)",
                }}
                title="Time of the last completed scan feeding this view"
              >
                <span style={{ color: "#3fb950", fontSize: 10, lineHeight: 1 }}>●</span>
                <span
                  className="font-sans text-[11px] tracking-wide whitespace-nowrap"
                  style={{ color: "#8ba3bc" }}
                >
                  Scanned{" "}
                  {activeTab === "binance"
                    ? "Binance"
                    : activeTab === "delta"
                    ? "Delta"
                    : activeTab === "coindcx"
                    ? "CoinDCX"
                    : activeTab === "nifty"
                    ? "NIFTY"
                    : ""}{" "}
                  @ {formatScanTime(activeScannedAt)} ({formatScanDate(activeScannedAt)})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Legend — hidden while idle/scanning, and when nothing is selected
            and Card 2 has no focus (Show All with no toast/row/search).
            Card 2 still self-hides when focusToast is empty placeholders. */}
        {currentStatus === "done" &&
          (!!activeSignal || !!legendToastFocus) && (
        <ScreenerLegend
          activeSignal={activeSignal}
          focusToast={legendToastFocus}
        />
        )}

        {/* Controls — Scan Binance + Journal-style Refresh / Export CSV */}
          <ScreenerToolbar
            status={status}
            onScanBinance={() => { void doScan(); }}
            priceRefreshing={priceRefreshing}
            onRefresh={() => {
              if (priceRefreshing) return;
              setPriceRefreshing(true);
              window.dispatchEvent(new Event(CPR_LIVE_PRICE_REFRESH_EVENT));
              // Live hooks run async; clear spinner after a short window.
              window.setTimeout(() => setPriceRefreshing(false), 2500);
            }}
            exportDisabled={displayed.length === 0}
            onExportCSV={() => {
              if (displayed.length === 0) return;
              const esc = (v: unknown) => {
                const s = v == null ? "" : String(v);
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              };
              const headers = [
                "Symbol",
                "Source",
                "Price",
                "Change24h%",
                "OpenPrice",
                "QuoteVolume",
                "CompressionRatio",
                "CPR_Rising",
                "CPR_Falling",
                "InsideCPR",
                "OutCPR",
                "OverlapHigher",
                "OverlapLower",
                "TouchCategory",
                "LevelsAbove",
                "LevelsBelow",
                "AssetClass",
                "TodayHigh",
                "TodayLow",
              ];
              const rows = displayed.map((r) => [
                r.symbol,
                r.source,
                r.currentPrice,
                r.change24h,
                r.openPrice,
                r.quoteVolume,
                r.compressionRatio,
                r.cprRising ? "1" : "0",
                r.cprFalling ? "1" : "0",
                r.InsideCPR || (r as { insideCPR?: boolean }).insideCPR ? "1" : "0",
                r.outCPR ? "1" : "0",
                r.overlapHigher ? "1" : "0",
                r.overlapLower ? "1" : "0",
                r.touchCategory ? "1" : "0",
                r.LevelsAbove ? "1" : "0",
                r.LevelsBelow ? "1" : "0",
                r.assetClass ?? "",
                r.todayHigh ?? "",
                r.todayLow ?? "",
              ].map(esc));
              const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `cpr_screener_${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          />

          {/* Results count / Show All / panel toggles (scan buttons live in ScreenerToolbar) */}
          <div
          className={`flex flex-wrap items-center gap-2 ${
            currentStatus === "done" &&
            showAll &&
            (showTouchList || showClassList || showPatternList || showSizeList || showPriceList || showCandleList || showEntryLevelList)
              ? "mb-2"
              : "mb-4"
          }`}
        >


          {currentStatus === "done" && (
            <div className="flex items-center gap-1.5 text-xs shrink-0">
              <span className="text-foreground font-medium">
                {anySubFilter
                  ? displayed.length
                  : showAll
                  ? currentAllCount
                  : currentFilteredCount}{" "}
                results
                {!showAll && !anySubFilter && ` (${currentAllCount} total)`}
              </span>
              <button
                onClick={() => {
                  setShowAll(true);
                  setClassFilter(null);
                  setStrongBarFilter("off");
                  // NEW: also clear the generic Views (sub-pattern) selection —
                  // covers inside-cpr and every other GENERIC_VIEW_CATEGORIES
                  // category, so "Show All" fully resets state everywhere.
                  setActiveGenericSignal(null);
                  setTouchFilter(null);
                  // NEW: clear whatever category/View is highlighted in the
                  // left nav too — without this, App.tsx's activeSignal state
                  // (and therefore ViewsSidebar's highlighting) was untouched
                  // by Show All, so the previously-selected item stayed
                  // highlighted even though the table was now unfiltered.
                  onActiveSignalChange?.("");
                }}
                className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded border border-border transition-colors shrink-0 ${showAll ? "bg-foreground/15 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span className="leading-none">{showAll ? "−" : "+"}</span>
                Show All
              </button>
              <button
                type="button"
                onClick={() => setShowClassList((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border border-border transition-colors shrink-0 ${
                  showClassList || classFilter
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={showClassList ? "Hide asset class filters" : "Show asset class filters (CRYPTO / COMMODITY / TRADFI)"}
              >
                <span className="leading-none">{showClassList ? "−" : "+"}</span>
                CLASS
                {classFilter ? (
                  <span className="font-mono normal-case text-[10px] text-muted-foreground ml-0.5">
                    · {classFilter === "COMMOD" ? "COMMODITY" : classFilter}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() =>
                  setBreakoutMode((m) => (m === "off" ? "brk" : "off"))
                }
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border transition-colors shrink-0 ${
                  breakoutMode === "off"
                    ? "border-border text-muted-foreground hover:text-foreground"
                    : "border-amber-500/60 bg-amber-500/15 text-amber-300"
                }`}
                title="15m BRK / BRKDN filter: bullish volume close through PDH/TC/R1–R4 (or range high), or bearish volume close through PDL/BC/S1–S4 (or range low); refreshed every minute"
              >
                {breakoutMode === "off" ? "Breakout" : "BRK/DN"}
                {breakoutMode !== "off" && (
                  <span className="font-mono">
                    {" "}
                    {
                      activePool.filter((r) => !!r.breakout?.signal || !!r.breakdown?.signal).length
                    }
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowPatternList((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border border-border transition-colors shrink-0 ${
                  showPatternList
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={showPatternList ? "Hide patterns" : "Show patterns"}
              >
                <span className="leading-none">{showPatternList ? "−" : "+"}</span>
                Patterns
              </button>
              <button
                type="button"
                onClick={() => setShowTouchList((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border border-border transition-colors shrink-0 ${
                  showTouchList
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={showTouchList ? "Hide CPR filters" : "Show CPR filters"}
              >
                <span className="leading-none">{showTouchList ? "−" : "+"}</span>
                CPR
              </button>
              <button
                type="button"
                onClick={() => setShowSizeList((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border border-border transition-colors shrink-0 ${
                  showSizeList
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={showSizeList ? "Hide CPR size filters" : "Show CPR size filters"}
              >
                <span className="leading-none">{showSizeList ? "−" : "+"}</span>
                Size
              </button>
              <button
                type="button"
                onClick={() => setShowEntryLevelList((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border border-border transition-colors shrink-0 ${
                  showEntryLevelList
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={showEntryLevelList ? "Hide entry level filters" : "Show entry level filters"}
              >
                <span className="leading-none">{showEntryLevelList ? "−" : "+"}</span>
                Entry
              </button>
              <button
                type="button"
                onClick={() => setShowPriceList((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border border-border transition-colors shrink-0 ${
                  showPriceList
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={showPriceList ? "Hide price filters" : "Show price filters"}
              >
                <span className="leading-none">{showPriceList ? "−" : "+"}</span>
                Price
              </button>
              <button
                type="button"
                onClick={() => setShowCandleList((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border border-border transition-colors shrink-0 ${
                  showCandleList
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={showCandleList ? "Hide previous session candle filters" : "Show previous session candle filters"}
              >
                <span className="leading-none">{showCandleList ? "−" : "+"}</span>
                Candle
              </button>
            </div>
          )}
        </div>

        {/* Status bar */}
        {(status === "scanning" || deltaStatus === "scanning" || coindcxStatus === "scanning") && (
          <div className="mb-4 rounded-lg border border-border bg-card p-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>
                {scanningSource === "delta"
                  ? `Scanning Delta Exchange… ${deltaProgress.symbol}`
                  : scanningSource === "coindcx"
                  ? `Scanning CoinDCX Futures… ${coindcxProgress.symbol}`
                  : `Scanning Binance… ${progress.symbol}`}
              </span>
              <span>{progressPct}%</span>
            </div>
            {/* Thin emerald-green progress bar, matching the CoinDCX tab/button color (was purple #8b5cf6) */}
            <div className="w-full bg-muted rounded-full h-1">
              <div
                className="h-1 rounded-full transition-all"
                style={{ width: `${progressPct}%`, backgroundColor: "#10b981" }}
              />
            </div>
          </div>
        )}

        {currentStatus === "scanning" && displayed.length === 0 && (
          <NoSignalsPanel
            title="Scanning for signals…"
            subtitle="Results will appear here as soon as the scan completes"
          />
        )}

        {alreadyScannedToday && status === "idle" && (
          <div className="mb-4 rounded-lg border border-border bg-card/50 p-3 text-xs text-muted-foreground">
            Last scan: {lastScanDate} · Next auto-scan: {formatISTTime(nextScanUtc)} IST · Countdown: {countdown}
          </div>
        )}

        {currentError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            Error: {currentError}
          </div>
        )}

        {currentStatus === "idle" && activeTab === "coindcx" && (
          <NoSignalsPanel
            title="CoinDCX has not been scanned today"
            subtitle="Click Scan CoinDCX to load today’s futures symbols"
          />
        )}

        {/* Show-all toggle + sub-filter buttons — only rendered when there's
            actually something inside to show (a Views sub-pattern row, or
            one of the Patterns/Touch/Size/Entry/Price/Candle panels toggled open).
            Previously this wrapped div (with its mb-3 margin) always
            rendered once a scan was done, leaving an empty gap above the
            search bar whenever Show All was on and no panel was expanded. */}
        {currentStatus === "done" &&
          (!showAll || showTouchList || showClassList || showPatternList || showSizeList || showEntryLevelList || showPriceList || showCandleList) && (
          <div className="flex flex-col gap-2 mb-3">
          {/* Signals row is empty while Show All is on — don't render it, or
              its zero-height box still adds a flex gap above the panels. */}
          {!showAll && (
          <div className="flex items-center gap-2 flex-wrap">
            {!showAll && (
            <span className="text-[10px] text-sky-400/90 uppercase tracking-wider mr-0.5 font-semibold">SIGNALS:</span>
            )}

            {/* Generic View buttons are derived from the registry-backed
                navigation map, so new registered Views work automatically. */}
            {GENERIC_VIEW_CATEGORIES.has(activeSectionKey) &&
              !showAll &&
              (Views[activeSectionKey] ?? [])
                // Only chips that currently match ≥1 row in the scan pool.
                // Zero-count Views clutter SIGNALS and are not useful here.
                .filter((sub) => (viewCounts[sub.id] ?? 0) > 0)
                .map((sub) => {
                const isActive = activeGenericSignal
                  ? activeGenericSignal === sub.id
                  : activeSignal === sub.id; // left-nav navigated straight to this leaf
                const textColor = sub.activeText ?? "var(--foreground)";
                const bg = sub.activeBg ?? "rgba(255,255,255,0.08)";
                return (
                  <button
                    key={sub.id}
                    onClick={() => {
                      if (isActive) {
                        setActiveGenericSignal(null);
                        onActiveSignalChange?.(activeSectionKey);
                      } else {
                        setActiveGenericSignal(sub.id);
                        onActiveSignalChange?.(sub.id);
                      }
                    }}
                    className="text-xs px-2.5 py-1 rounded transition-colors"
                    style={{
                      border: "none",
                      fontWeight: isActive ? 600 : 400,
                      background: isActive ? bg : "transparent",
                      color: isActive ? textColor : "#5a7a96",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                    title={isActive ? `Selected — click again to clear` : `Show only rows matching ${sub.label}`}
                  >
                    {sub.label}
                    <ViewCount id={sub.id} counts={viewCounts} />
                  </button>
                );
              })}
          </div>
          )}

          {/* Pattern filter buttons — own line, independent of activeSignal
              AND independent of showAll. These always render, regardless of Show All state, and
              are mutually exclusive within their own group. */}
          {showClassList && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-sky-400/90 uppercase tracking-wider mr-0.5 font-semibold w-14 shrink-0">CLASS:</span>
              {(
                [
                  { id: "CRYPTO" as const, label: "CRYPTO", title: "Show only crypto (exclude TRADFI & COMMODITY)" },
                  { id: "COMMOD" as const, label: "COMMODITY", title: "Show only commodity perps (XAU, XAG, oil, …)" },
                  { id: "TRADFI" as const, label: "TRADFI", title: "Show only TradFi stock/index perps" },
                ]
              ).map(({ id, label, title }) => {
                const isActive = classFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setClassFilter((v) => (v === id ? null : id))}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      isActive
                        ? "bg-foreground/15 text-foreground border-foreground/30"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    title={title}
                  >
                    {isActive ? `✕ ${label}` : label}
                  </button>
                );
              })}
            </div>
          )}
          {showTouchList && (
            <div className="flex flex-col gap-1.5">
              {/* Row 1 — CPR width × Above/Below */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-sky-400/90 uppercase tracking-wider mr-0.5 font-semibold w-14 shrink-0">CPR:</span>
                {(
                  [
                    { id: "narrow-a", label: "Narrow-A", count: touchCounts.narrowA, title: "Today CPR narrower than prev + CPR Above (Narow-A badge)" },
                    { id: "wide-a", label: "Wide-A", count: touchCounts.wideA, title: "Today CPR wider than prev + CPR Above (Wide-A badge)" },
                    { id: "narrow-b", label: "Narrow-B", count: touchCounts.narrowB, title: "Today CPR narrower than prev + CPR Below (Narow-B badge)" },
                    { id: "wide-b", label: "Wide-B", count: touchCounts.wideB, title: "Today CPR wider than prev + CPR Below (Wide-B badge)" },
                  ] as const
                ).map(({ id, label, count, title }) => {
                  const isActive = touchFilter === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setTouchFilter((v) => (v === id ? null : id))}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                        isActive
                          ? "bg-foreground/15 text-foreground border-foreground/30"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                      title={title}
                    >
                      {isActive ? `✕ ${label}` : label}
                      <span className="text-[11px] font-mono text-muted-foreground ml-1">({count})</span>
                    </button>
                  );
                })}
              </div>
              {/* Row 2 — classic TOUCH category */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-sky-400/90 uppercase tracking-wider mr-0.5 font-semibold w-14 shrink-0">TOUCH:</span>
                {(
                  [
                    { id: "insidecpr", label: "INCPR", count: touchCounts.insidecpr },
                    { id: "outcpr", label: "OutCPR", count: touchCounts.outcpr },
                    { id: "OVA", label: "Overlap Above", count: touchCounts.OVA },
                    { id: "overlapLower", label: "Overlap Below", count: touchCounts.overlapLower },
                    { id: "equal-cpr", label: "Equal CPR", count: touchCounts.equalCPR },
                  ]
                ).map(({ id, label, count }) => {
                  const isActive = touchFilter === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setTouchFilter((v) => (v === id ? null : id))}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                        isActive
                          ? "bg-foreground/15 text-foreground border-foreground/30"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                      title={`Show only TOUCH rows matching ${label}`}
                    >
                      {isActive ? `✕ ${label}` : label}
                      <span className="text-[11px] font-mono text-muted-foreground ml-1">({count})</span>
                    </button>
                  );
                })}
              </div>
              {/* Row 3 — PDH / PDL */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-sky-400/90 uppercase tracking-wider mr-0.5 font-semibold w-14 shrink-0">PDH/PDL:</span>
                {(
                  [
                    { id: "s1r1in", label: "S1-R1 IN", count: touchCounts.s1r1in, title: "TOUCH category only: today's S1/R1 inside previous day's CPR, or previous day's S1/R1 inside today's CPR" },
                    { id: "pdhgtu1", label: "PDHL-A", count: touchCounts.pdhgtu1, title: "Show only rows where today's Previous Day High (PDH) is above today's R1 (U1)" },
                    { id: "pdlltl1", label: "PDHL-B", count: touchCounts.pdlltl1, title: "Show only rows where today's Previous Day Low (PDL) is below today's S1 (L1)" },
                  ] as const
                ).map(({ id, label, count, title }) => {
                  const isActive = pdhPdlFilter === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setPdhPdlFilter((v) => (v === id ? null : id))}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                        isActive
                          ? "bg-foreground/15 text-foreground border-foreground/30"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                      title={title}
                    >
                      {isActive ? `✕ ${label}` : label}
                      <span className="text-[11px] font-mono text-muted-foreground ml-1">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
              {showPatternList && (
              <span className="text-[10px] text-sky-400/90 uppercase tracking-wider mr-0.5 font-semibold">PATTERNS:</span>
              )}
              {showPatternList && (
              (
                [
                  { label: "eX-Higher", active: "border-purple-400 text-purple-400" },
                  { label: "eX-Lower", active: "border-fuchsia-400 text-fuchsia-400" },
                  { label: "cO-Higher", active: "border-cyan-400 text-cyan-400" },
                  { label: "cO-Lower", active: "border-teal-400 text-teal-400" },
                  { label: "Higher", active: "border-green-400 text-green-400" },
                  { label: "Lower", active: "border-destructive text-destructive" },
                  { label: "INCPR", active: "border-orange-400 text-orange-400" },
                  { label: "OutCPR", active: "border-purple-400 text-purple-400" },
                  { label: "CL4U3", active: getBadgeClasses("CL4U3") },
                  { label: "L4U4", active: getBadgeClasses("L4U4") },
                  { label: "EU4L4", active: getBadgeClasses("EU4L4") },
                  { label: "EL4U4", active: getBadgeClasses("EL4U4") },
                  { label: "QU4L4", active: getBadgeClasses("QU4L4") },
                  { label: "U4L2", active: getBadgeClasses("U4L2") },
                  { label: "U3L2", active: getBadgeClasses("U3L2") },
                  { label: "U4L3", active: getBadgeClasses("U4L3") },
                  { label: "U4L4", active: getBadgeClasses("U4L4") },
                  { label: "U3L4", active: getBadgeClasses("U3L4") },
                  { label: "U2L4", active: getBadgeClasses("U2L4") },
                  { label: "U1L4", active: getBadgeClasses("U1L4") },
                  { label: "EU3L4", active: getBadgeClasses("EU3L4") },
                  { label: "L3TC", active: getBadgeClasses("L3TC") },
                  { label: "EL1L2", active: getBadgeClasses("EL1L2") },
                  { label: "EL2L1", active: getBadgeClasses("EL2L1") },
                  { label: "CU3L2", active: getBadgeClasses("CU3L2") },
                  { label: "CU3L3", active: getBadgeClasses("CU3L3") },
                  { label: "EL2U4", active: getBadgeClasses("EL2U4") },
                  { label: "EL3U4", active: getBadgeClasses("EL3U4") },
                  { label: "CU4L2", active: getBadgeClasses("CU4L2") },
                  { label: "EU3L3", active: getBadgeClasses("EU3L3") },
                  { label: "EL3U3", active: getBadgeClasses("EL3U3") },
                  { label: "CU4L4", active: getBadgeClasses("CU4L4") },
                  { label: "CU4L3", active: getBadgeClasses("CU4L3") },
                  { label: "CL3U3", active: getBadgeClasses("CL3U3") },
                  { label: "L4U3", active: getBadgeClasses("L4U3") },
                  { label: "L3U3", active: getBadgeClasses("L3U3") },
                  { label: "L4U2", active: getBadgeClasses("L4U2") },
                  { label: "L3U2", active: getBadgeClasses("L3U2") },
                  { label: "L3U4", active: getBadgeClasses("L3U4") },
                  { label: "L2U4", active: getBadgeClasses("L2U4") },
                  { label: "CL3U2", active: getBadgeClasses("CL3U2") },
                  { label: "L1U4", active: getBadgeClasses("L1U4") },
                  { label: "CL4U2", active: getBadgeClasses("CL4U2") },
                  // NEW: eXL*U1 / eXL*CPR sub-type badges (unconditional, all sections)
                  { label: "EU1L2", active: getBadgeClasses("EU1L2") },
                  { label: "EU1L3", active: getBadgeClasses("EU1L3") },
                  { label: "EU1L4", active: getBadgeClasses("EU1L4") },
                  { label: "EUBL1", active: getBadgeClasses("EUBL1") },
                  { label: "EUPL1", active: getBadgeClasses("EUPL1") },
                  { label: "EUTL1", active: getBadgeClasses("EUTL1") },
                  { label: "EUBL2", active: getBadgeClasses("EUBL2") },
                  { label: "EUBL3", active: getBadgeClasses("EUBL3") },
                  { label: "EUPL3", active: getBadgeClasses("EUPL3") },
                  // NEW: CL1U1 / CU1L1 / CL2U2 / CU2L2 badges (unconditional, all sections)
                  { label: "CL1U1", active: getBadgeClasses("CL1U1") },
                  { label: "CU1L1", active: getBadgeClasses("CU1L1") },
                  { label: "CL2U2", active: getBadgeClasses("CL2U2") },
                  { label: "CU2L2", active: getBadgeClasses("CU2L2") },
                  // NEW: CL2U1 — independent, section-agnostic Pattern flag (see cpr.ts).
                  { label: "CL2U1", active: getBadgeClasses("CL2U1") },
                  // NEW: CL4U4 — independent, section-agnostic Pattern flag (see cpr.ts).
                  { label: "CL4U4", active: getBadgeClasses("CL4U4") },
                  // NEW: EU2L3 — prev S4 inside today S2/S3 AND prev R4 inside today R1/R2
                  { label: "EU2L3", active: getBadgeClasses("EU2L3") },
                  // NEW: expanded family — today's outer S-level broke below prev S4
                  // AND today's outer R-level/TC broke above prev R4 (see cpr.ts).
                  { label: "EU2L4", active: getBadgeClasses("EU2L4") },
                  { label: "EU2L2", active: getBadgeClasses("EU2L2") },
                  { label: "EUTL2", active: getBadgeClasses("EUTL2") },
                  { label: "EUTL3", active: getBadgeClasses("EUTL3") },
                  { label: "EU1L1", active: getBadgeClasses("EU1L1") },
                  // NEW: EL1U1 — same band shape as EU1L1, fires when the R1/R4 gap is larger.
                  { label: "EL1U1", active: getBadgeClasses("EL1U1") },
                  // NEW: EL1U2 — prev R4 inside today R1/R2 (U2) AND prev S4 inside today BC/S1 (L1).
                  { label: "EL1U2", active: getBadgeClasses("EL1U2") },
                  // NEW: EL1U3 — prev R4 inside today R2/R3 (U3) AND prev S4 inside today BC/S1 (L1).
                  { label: "EL1U3", active: getBadgeClasses("EL1U3") },
                  { label: "EL2U3", active: getBadgeClasses("EL2U3") },
                  // NEW: ELTU2 — prev R4 inside today R1/R2 (U2) AND prev S4 inside today TC/R1.
                  { label: "ELTU2", active: getBadgeClasses("ELTU2") },
                  // NEW: ELBU2 — prev R4 inside today R1/R2 (U2) AND prev S4 inside today BC/Pivot.
                  { label: "ELBU2", active: getBadgeClasses("ELBU2") },
                  // NEW: ELTU3 — prev R4 inside today R2/R3 (U3) AND prev S4 inside today TC/R1.
                  { label: "ELTU3", active: getBadgeClasses("ELTU3") },
                  // NEW: ELPU2 — prev R4 inside today R1/R2 (U2) AND prev S4 inside today Pivot/TC.
                  { label: "ELPU2", active: getBadgeClasses("ELPU2") },
                  // NEW: ELPU3 — prev R4 inside today R2/R3 (U3) AND prev S4 inside today Pivot/TC.
                  { label: "ELPU3", active: getBadgeClasses("ELPU3") },
                  // NEW: ELBU3 — prev R4 inside today R2/R3 (U3) AND prev S4 inside today BC/Pivot.
                  { label: "ELBU3", active: getBadgeClasses("ELBU3") },
                  // NEW: EUPL2 — prev S4 inside today S2/S1 (L2) AND prev R4 inside today BC/Pivot.
                  { label: "EUPL2", active: getBadgeClasses("EUPL2") },
                  // NEW: EUTL4 — prev S4 inside today S4/S3 (L4) AND prev R4 inside today Pivot/TC.
                  { label: "EUTL4", active: getBadgeClasses("EUTL4") },
                  // NEW: L2U3 — today R4 inside prev R2/R3 (U3) AND prev S4 inside today S2/S1 (L2).
                  { label: "L2U3", active: getBadgeClasses("L2U3") },
                  // NEW: CU2L1 — today S4 inside prev S1/BC (L1) AND today R4 inside prev R1/R2 (U2).
                  { label: "CU2L1", active: getBadgeClasses("CU2L1") },
                   // NEW: CU2BC — today S4 inside prev BC/Pivot AND today R4 inside prev R1/R2 (U2).
                   { label: "CU2BC", active: getBadgeClasses("CU2BC") },
                  // NEW: CU3L1 — today S4 inside prev S1/BC (L1) AND today R4 inside prev R2/R3 (U3).
                  { label: "CU3L1", active: getBadgeClasses("CU3L1") },
                  // NEW: U2L3 — today S4 inside prev S3/S2 (L3) AND prev R4 inside prev's own R1/R2 (U2).
                  { label: "U2L3", active: getBadgeClasses("U2L3") },
                  // NEW: EL1U4 — prev R4 inside today R3/R4 (U4) AND prev S4 inside today BC/S1 (L1).
                  { label: "EL1U4", active: getBadgeClasses("EL1U4") },
                  // NEW: ELBU4 — prev R4 inside today R3/R4 (U4) AND prev S4 inside today BC/Pivot.
                  { label: "ELBU4", active: getBadgeClasses("ELBU4") },
                ] as { label: PatternInfo["label"]; active: string }[]
              ).map(({ label, active }) => (
                <button
                  key={label}
                  onClick={() => setPatternFilter((v) => (v === label ? null : label))}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    PatternFilter === label
                      ? active
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={`Show only rows where Pattern = ${label}`}
                >
                  {PatternFilter === label ? `✕ ${label}` : label}
                </button>
              ))
              )}
          </div>

          {/* CPR Size filter buttons — 8-tier Micro→Giant ladder (today's CPR)
              followed by the p-prefixed previous-day variants. Order per spec:
              pMicro-pTiny-pMini-pSmall-pMedium-pLarge-pMega-pGiant, then
              Micro-Tiny-Mini-Small-Medium-Large-Mega-Giant. Mutually exclusive
              within the whole row (single widthFilter state), independent of
              activeSignal and showAll. */}
          {/* CPR Size — prev day's width (pMicro..pGiant). Own row, own state
              (prevWidthFilter) — independent of the today's-width row below. */}
          {showSizeList && (
          <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-fuchsia-400/90 uppercase tracking-wider mr-0.5 font-semibold">CPR Size (Prev):</span>
              {(
                [
                  { key: "micro",  label: "pMicro",  range: "≤0.10%",         active: "border-lime-400 text-lime-400" },
                  { key: "tiny",   label: "pTiny",   range: "0.10–0.22%",     active: "border-green-400 text-green-400" },
                  { key: "mini",   label: "pMini",   range: "0.22–0.60%",     active: "border-teal-400 text-teal-400" },
                  { key: "small",  label: "pSmall",  range: "0.60–1.10%",     active: "border-indigo-400 text-indigo-400" },
                  { key: "medium", label: "pMedium", range: "1.10–2.00%",     active: "border-blue-400 text-blue-400" },
                  { key: "large",  label: "pLarge",  range: "2.00–5.00%",     active: "border-purple-400 text-purple-400" },
                  { key: "mega",   label: "pMega",   range: "5.00–10.00%",    active: "border-pink-400 bg-pink-500/20 text-pink-300", idle: "border-pink-500/40 text-pink-300/80 hover:bg-pink-500/10" },
                  { key: "giant",  label: "pGiant", range: ">10.00%",        active: "border-orange-400 bg-orange-500/20 text-orange-300", idle: "border-orange-500/40 text-orange-300/80 hover:bg-orange-500/10" },
                ] as { key: WidthCategoryKey; label: string; range: string; active: string; idle?: string }[]
              ).map(({ key, label, range, active, ...styles }) => (
                <button
                  key={key}
                  onClick={() => setPrevWidthFilter((v) => (v === key ? null : key))}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    prevWidthFilter === key
                      ? active
                      : styles.idle ?? "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={`Show only rows where prev day's CPR width is ${range}`}
                >
                  {prevWidthFilter === key ? `✕ ${label}` : label}
                </button>
              ))}
          </div>
          )}

          {showSizeList && (
          <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-cyan-400/90 uppercase tracking-wider mr-0.5 font-semibold">CPR Size (Today):</span>
              {(
                [
                  { key: "micro",   label: "Micro",   range: "≤0.10%",         active: "border-lime-400 text-lime-400" },
                  { key: "tiny",    label: "Tiny",    range: "0.10–0.22%",     active: "border-green-400 text-green-400" },
                  { key: "mini",    label: "Mini",    range: "0.22–0.60%",     active: "border-teal-400 text-teal-400" },
                  { key: "small",   label: "Small",   range: "0.60–1.10%",     active: "border-indigo-400 text-indigo-400" },
                  { key: "medium",  label: "Medium",  range: "1.10–2.00%",     active: "border-blue-400 text-blue-400" },
                  { key: "large",   label: "Large",   range: "2.00–5.00%",     active: "border-purple-400 text-purple-400" },
                  { key: "mega",    label: "Mega",    range: "5.00–10.00%",    active: "border-pink-400 bg-pink-500/20 text-pink-300", idle: "border-pink-500/40 text-pink-300/80 hover:bg-pink-500/10" },
                  { key: "giant",   label: "Giant",   range: ">10.00%",        active: "border-orange-400 bg-orange-500/20 text-orange-300", idle: "border-orange-500/40 text-orange-300/80 hover:bg-orange-500/10" },
                ] as { key: WidthCategoryKey; label: string; range: string; active: string; idle?: string }[]
              ).map(({ key, label, range, active, ...styles }) => (
                <button
                  key={key}
                  onClick={() => setTodayWidthFilter((v) => (v === key ? null : key))}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    todayWidthFilter === key
                      ? active
                      : styles.idle ?? "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={`Show only rows where today's CPR width is ${range}`}
                >
                  {todayWidthFilter === key ? `✕ ${label}` : label}
                </button>
              ))}
          </div>
          )}

          {/* Price filters moved out of the search/source bar into this
              panel; their existing single-select behavior is unchanged.
              (The previous-session candle filters now live in the Candle panel.) */}
          {showPriceList && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-sky-400/90 uppercase tracking-wider mr-0.5 font-semibold">PRICE:</span>
            <button
              onClick={() => setPdhPdlFilter((v) => (v === "above" ? null : "above"))}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                pdhPdlFilter === "above"
                  ? "border-green-400 text-green-400"
                  : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
              title="Show only rows where price is currently above yesterday's High (PDH)"
            >
              {pdhPdlFilter === "above" ? "✕ >PDH" : ">PDH"}
            </button>
            <button
              onClick={() => setPdhPdlFilter((v) => (v === "below" ? null : "below"))}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                pdhPdlFilter === "below"
                  ? "border-destructive text-destructive"
                  : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
              title="Show only rows where price is currently below yesterday's Low (PDL)"
            >
              {pdhPdlFilter === "below" ? "✕ <PDL" : "<PDL"}
            </button>
            <button
              onClick={() => setPdhPdlFilter((v) => (v === "abovepu4" ? null : "abovepu4"))}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                pdhPdlFilter === "abovepu4"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
              title="Show only rows where price is currently above previous day's R4 (PU4)"
            >
              {pdhPdlFilter === "abovepu4" ? "✕ >PU4" : ">PU4"}
            </button>
            <button
              onClick={() => setPdhPdlFilter((v) => (v === "belowpl4" ? null : "belowpl4"))}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                pdhPdlFilter === "belowpl4"
                  ? "border-red-400 text-red-400"
                  : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
              title="Show only rows where price is currently below previous day's S4 (PL4)"
            >
              {pdhPdlFilter === "belowpl4" ? "✕ <PL4" : "<PL4"}
            </button>
          </div>
          )}

          {/* Previous-session 15m candle filters, moved out of the Price panel.
              Same buttons, state and behavior; only the container changed. */}
          {showCandleList && (
          <div className="flex flex-col gap-1.5 w-full">
            {/* ── Previous day (PDay) session 15m candles ───────────────── */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-cyan-400/90 uppercase tracking-wider mr-1 font-semibold shrink-0 whitespace-nowrap">
                Previous day session candles:
              </span>
              <div className="inline-flex items-stretch flex-wrap" role="group" aria-label="Previous day session candle filters">
              <button
                onClick={() => {
                  if (!previousConsolidateAReady) return;
                  setPreviousCandleFilter((v) => v === "consolidate-a" ? "all" : "consolidate-a");
                  resetConsolidateAMessage();
                }}
                disabled={!previousConsolidateAReady || currentAllCount === 0 || activeTab === "coindcx"}
                aria-pressed={previousCandleFilter === "consolidate-a"}
                className={`text-xs px-2.5 py-1 rounded-l border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "consolidate-a"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="CONSOLIDATE-A: previous-session 15m candles (wick range) relative to Pivot floor / max(R1,PH), with an Extreme Low (higher of PL/S1) and R2 wick fail. Binance and Delta only; CoinDCX excluded while active."
              >
                {previousConsolidateAProgress
                  ? `P-CON-A ${previousConsolidateAProgress.done}/${previousConsolidateAProgress.total}`
                  : previousConsolidateAReady
                    ? `P-CON-A (${previousConsolidateAIncludedCount})`
                    : "P-CON-A…"}
              </button>
              <button
                onClick={() => {
                  if (!previousUpexReady) return;
                  setPreviousCandleFilter((v) => v === "momentum-a" ? "all" : "momentum-a");
                  resetMomentumAMessage();
                }}
                disabled={!previousUpexReady || currentAllCount === 0 || activeTab === "coindcx"}
                aria-pressed={previousCandleFilter === "momentum-a"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "momentum-a"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="For Binance and Delta, exclude a symbol only when a previous-session 15-minute candle body is below previous day's BC and its lower body edge breaks below earlier session wick lows. The first fresh-low break is forgiven if the immediate next candle makes a lower wick, which becomes the reference. Prepared once after exchange scan data loads; toggling reuses the cached result."
              >
                {previousUpexProgress
                  ? `P-MOM-A ${previousUpexProgress.done}/${previousUpexProgress.total}`
                  : previousUpexReady
                    ? `P-MOM-A (${previousUpexIncludedCount})`
                    : "P-MOM-A…"}
              </button>
              <button
                onClick={() => {
                  if (!previous15MTCReady) return;
                  setPreviousCandleFilter((v) => v === "consolidate-b" ? "all" : "consolidate-b");
                }}
                disabled={!previous15MTCReady || currentAllCount === 0 || activeTab === "coindcx"}
                aria-pressed={previousCandleFilter === "consolidate-b"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "consolidate-b"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="CONSOLIDATE-B: previous-session 15m candle wicks are checked against the Pivot-Ceiling reference, min(S1,PL), R2, and S2. Reaching R2 or S2 fails. Binance and Delta only; CoinDCX excluded while active."
              >
                {previous15MTCProgress
                  ? `P-CON-B ${previous15MTCProgress.done}/${previous15MTCProgress.total}`
                  : previous15MTCReady
                    ? `P-CON-B (${previous15MTCIncludedCount})`
                    : "P-CON-B…"}
              </button>
              <button
                onClick={() => {
                  if (!previous15MMomentumReady) return;
                  setPreviousCandleFilter((v) => v === "momentum-b" ? "all" : "momentum-b");
                }}
                disabled={!previous15MMomentumReady || currentAllCount === 0 || activeTab === "coindcx"}
                aria-pressed={previousCandleFilter === "momentum-b"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "momentum-b"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="Same Pivot-Ceiling reference-candle and R2 wick checks as CON-B, without the PL/S1 floor or S2 check. A completed 15-minute candle wick at/above R2 fails. Unevaluated sources such as CoinDCX are excluded while active."
              >
                {previous15MMomentumProgress
                  ? `P-MOM-B ${previous15MMomentumProgress.done}/${previous15MMomentumProgress.total}`
                  : previous15MMomentumReady
                    ? `P-MOM-B (${previous15MMomentumIncludedCount})`
                    : "P-MOM-B…"}
              </button>
              <button
                onClick={() => {
                  if (!previousInsideR1S1Ready) return;
                  setPreviousCandleFilter((v) => v === "inside-r1s1" ? "all" : "inside-r1s1");
                }}
                disabled={!previousInsideR1S1Ready || currentAllCount === 0 || activeTab === "coindcx"}
                aria-pressed={previousCandleFilter === "inside-r1s1"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "inside-r1s1"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="P-VOL-C: previous-session 15m bodies stay inside max(R1, PH) … min(S1, PL) (wicks ignored). Lime for TOUCH between pCPR and ppCPR or previous CPR Micro/Tiny; otherwise red ✗. Only shown when not CON-A, CON-B, MOM-A or MOM-B."
              >
                {previousInsideR1S1Progress
                  ? `P-VOL-C ${previousInsideR1S1Progress.done}/${previousInsideR1S1Progress.total}`
                  : previousInsideR1S1Ready
                    ? `P-VOL-C (${previousInsideR1S1IncludedCount})`
                    : "P-VOL-C…"}
              </button>
              <button
                onClick={() => {
                  if (!previousVolAReady) return;
                  setPreviousCandleFilter((v) => v === "vol-a" ? "all" : "vol-a");
                }}
                disabled={!previousVolAReady || currentAllCount === 0 || activeTab === "coindcx"}
                aria-pressed={previousCandleFilter === "vol-a"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "vol-a"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="P-VOL-A: previous-session 15m passes the floor min(S1, PL) check and fails the VOL-C ceiling max(R1, PH) check."
              >
                {previousVolAProgress
                  ? `P-VOL-A ${previousVolAProgress.done}/${previousVolAProgress.total}`
                  : previousVolAReady
                    ? `P-VOL-A (${previousVolAIncludedCount})`
                    : "P-VOL-A…"}
              </button>
              <button
                onClick={() => {
                  if (!previousVolBReady) return;
                  setPreviousCandleFilter((v) => v === "vol-b" ? "all" : "vol-b");
                }}
                disabled={!previousVolBReady || currentAllCount === 0 || activeTab === "coindcx"}
                aria-pressed={previousCandleFilter === "vol-b"}
                className={`text-xs px-2.5 py-1 rounded-r -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "vol-b"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="P-VOL-B: previous-session 15m passes the ceiling max(R1, PH) check and fails the VOL-C floor min(S1, PL) check."
              >
                {previousVolBProgress
                  ? `P-VOL-B ${previousVolBProgress.done}/${previousVolBProgress.total}`
                  : previousVolBReady
                    ? `P-VOL-B (${previousVolBIncludedCount})`
                    : "P-VOL-B…"}
              </button>
              </div>
            </div>

            {/* ── Previous-of-previous day (PPDay) session 15m candles ─── */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-cyan-400/90 uppercase tracking-wider mr-1 font-semibold shrink-0 whitespace-nowrap">
                Prevprev day session candles:
              </span>
              <div className="inline-flex items-stretch shrink-0" role="group" aria-label="Previous-of-previous day session candle filters">
              <button
                onClick={() => {
                  if (!previousPPConsolidateAReady) return;
                  setPreviousCandleFilter((v) =>
                    v === "pp-consolidate-a" ? "all" : "pp-consolidate-a",
                  );
                  resetPPConsolidateAMessage();
                }}
                disabled={
                  !previousPPConsolidateAReady ||
                  currentAllCount === 0 ||
                  activeTab === "coindcx"
                }
                aria-pressed={previousCandleFilter === "pp-consolidate-a"}
                className={`text-xs px-2.5 py-1 rounded-l border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "pp-consolidate-a"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="Same CON-A rules on the day-before-previous session (PPDay), using ppCPR levels. Independent of P-CON-A — a row can pass both. Binance/Delta only; CoinDCX excluded while active."
              >
                {previousPPConsolidateAProgress
                  ? `PP-CON-A ${previousPPConsolidateAProgress.done}/${previousPPConsolidateAProgress.total}`
                  : previousPPConsolidateAReady
                    ? `PP-CON-A (${previousPPConsolidateAIncludedCount})`
                    : "PP-CON-A…"}
              </button>
              <button
                onClick={() => {
                  if (!previousPPConsolidateBReady) return;
                  setPreviousCandleFilter((v) =>
                    v === "pp-consolidate-b" ? "all" : "pp-consolidate-b",
                  );
                  resetPPConsolidateBMessage();
                }}
                disabled={
                  !previousPPConsolidateBReady ||
                  currentAllCount === 0 ||
                  activeTab === "coindcx"
                }
                aria-pressed={previousCandleFilter === "pp-consolidate-b"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "pp-consolidate-b"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="Same CON-B checks (Pivot-Ceiling reference, floor, R2 and S2 wicks) on the day-before-previous session (PPDay), using ppCPR levels. Independent of P-CON-B — a row can pass both. Binance/Delta only; CoinDCX excluded while active."
              >
                {previousPPConsolidateBProgress
                  ? `PP-CON-B ${previousPPConsolidateBProgress.done}/${previousPPConsolidateBProgress.total}`
                  : previousPPConsolidateBReady
                    ? `PP-CON-B (${previousPPConsolidateBIncludedCount})`
                    : "PP-CON-B…"}
              </button>
              <button
                onClick={() => {
                  if (!previousPPMomentumAReady) return;
                  setPreviousCandleFilter((v) =>
                    v === "pp-momentum-a" ? "all" : "pp-momentum-a",
                  );
                  resetPPMomentumAMessage();
                }}
                disabled={
                  !previousPPMomentumAReady ||
                  currentAllCount === 0 ||
                  activeTab === "coindcx"
                }
                aria-pressed={previousCandleFilter === "pp-momentum-a"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "pp-momentum-a"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="Same MOMENTUM-A rules (Pivot floor + Extreme Low [higher of PL/S1], no R2) on the day-before-previous session (PPDay). Exclusive of PP-CON-A. Binance/Delta only."
              >
                {previousPPMomentumAProgress
                  ? `PP-MOM-A ${previousPPMomentumAProgress.done}/${previousPPMomentumAProgress.total}`
                  : previousPPMomentumAReady
                    ? `PP-MOM-A (${previousPPMomentumAIncludedCount})`
                    : "PP-MOM-A…"}
              </button>
              <button
                onClick={() => {
                  if (!previousPPMomentumBReady) return;
                  setPreviousCandleFilter((v) =>
                    v === "pp-momentum-b" ? "all" : "pp-momentum-b",
                  );
                  resetPPMomentumBMessage();
                }}
                disabled={
                  !previousPPMomentumBReady ||
                  currentAllCount === 0 ||
                  activeTab === "coindcx"
                }
                aria-pressed={previousCandleFilter === "pp-momentum-b"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "pp-momentum-b"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="Same MOMENTUM-B rules (Pivot-Ceiling reference and R2 wick checks; no S2) on the day-before-previous session (PPDay). Exclusive of PP-CON-B. Binance/Delta only."
              >
                {previousPPMomentumBProgress
                  ? `PP-MOM-B ${previousPPMomentumBProgress.done}/${previousPPMomentumBProgress.total}`
                  : previousPPMomentumBReady
                    ? `PP-MOM-B (${previousPPMomentumBIncludedCount})`
                    : "PP-MOM-B…"}
              </button>
              <button
                onClick={() => {
                  if (!previousPPInsideR1S1Ready) return;
                  setPreviousCandleFilter((v) =>
                    v === "pp-volatile-r1s1" ? "all" : "pp-volatile-r1s1",
                  );
                  resetPPInsideR1S1Message();
                }}
                disabled={
                  !previousPPInsideR1S1Ready ||
                  currentAllCount === 0 ||
                  activeTab === "coindcx"
                }
                aria-pressed={previousCandleFilter === "pp-volatile-r1s1"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "pp-volatile-r1s1"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="PP-VOL-C: INSIDE R1/PH–S1/PL on PPDay (ppCPR). Lime for TOUCH between ppCPR and pppCPR or PP CPR Micro/Tiny; otherwise red ✗. Exclusive of PP-CON/MOM. Binance/Delta only."
              >
                {previousPPInsideR1S1Progress
                  ? `PP-VOL-C ${previousPPInsideR1S1Progress.done}/${previousPPInsideR1S1Progress.total}`
                  : previousPPInsideR1S1Ready
                    ? `PP-VOL-C (${previousPPVolatileR1S1IncludedCount})`
                    : "PP-VOL-C…"}
              </button>
              <button
                onClick={() => {
                  if (!previousPPVolAReady) return;
                  setPreviousCandleFilter((v) =>
                    v === "pp-vol-a" ? "all" : "pp-vol-a",
                  );
                  resetPPVolAMessage();
                }}
                disabled={
                  !previousPPVolAReady ||
                  currentAllCount === 0 ||
                  activeTab === "coindcx"
                }
                aria-pressed={previousCandleFilter === "pp-vol-a"}
                className={`text-xs px-2.5 py-1 -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "pp-vol-a"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="PP-VOL-A: PPDay 15m passes the floor min(S1, PL) check and fails the VOL-C ceiling max(R1, PH) check. Binance/Delta only."
              >
                {previousPPVolAProgress
                  ? `PP-VOL-A ${previousPPVolAProgress.done}/${previousPPVolAProgress.total}`
                  : previousPPVolAReady
                    ? `PP-VOL-A (${previousPPVolAIncludedCount})`
                    : "PP-VOL-A…"}
              </button>
              <button
                onClick={() => {
                  if (!previousPPVolBReady) return;
                  setPreviousCandleFilter((v) =>
                    v === "pp-vol-b" ? "all" : "pp-vol-b",
                  );
                  resetPPVolBMessage();
                }}
                disabled={
                  !previousPPVolBReady ||
                  currentAllCount === 0 ||
                  activeTab === "coindcx"
                }
                aria-pressed={previousCandleFilter === "pp-vol-b"}
                className={`text-xs px-2.5 py-1 rounded-r -ml-px border transition-colors disabled:opacity-50 ${
                  previousCandleFilter === "pp-vol-b"
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="PP-VOL-B: PPDay 15m passes the ceiling max(R1, PH) check and fails the VOL-C floor min(S1, PL) check. Binance/Delta only."
              >
                {previousPPVolBProgress
                  ? `PP-VOL-B ${previousPPVolBProgress.done}/${previousPPVolBProgress.total}`
                  : previousPPVolBReady
                    ? `PP-VOL-B (${previousPPVolBIncludedCount})`
                    : "PP-VOL-B…"}
              </button>
              </div>
            </div>

            {/* Live current-session failed-break flags. Independent of the
                previous-session groups above (they combine with them), but
                S and R exclude each other. Badge text "RECLAIM-S 2/3" =
                3 support levels pierced, price back above 2 of them. */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-cyan-400/90 uppercase tracking-wider mr-1 font-semibold shrink-0">
                Live session:
              </span>
              <div className="inline-flex items-stretch" role="group" aria-label="Reclaim filters">
              <button
                onClick={() => {
                  if (!reclaimReady) return;
                  const next = !reclaimSFilter;
                  setReclaimSFilter(next);
                  if (next) setReclaimRFilter(false);
                }}
                disabled={!reclaimReady || currentAllCount === 0 || activeTab === "coindcx"}
                className={`text-xs px-2.5 py-1 rounded-l rounded-r-none border transition-colors disabled:opacity-50 ${
                  reclaimSFilter
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="Failed breakdown: this session a completed 15m candle body broke below S1 (and possibly S2–S4), and price is now back above at least 2 of those pierced levels. Live — recalculated on every price tick; the pierced depth refreshes after each 15m candle closes. Binance and Delta only."
              >
                {reclaimProgress && !reclaimReady
                  ? `RECLAIM-S ${reclaimProgress.done}/${reclaimProgress.total}`
                  : reclaimReady
                    ? `RECLAIM-S (${reclaimSCount})`
                    : "RECLAIM-S…"}
              </button>
              <button
                onClick={() => {
                  if (!reclaimReady) return;
                  const next = !reclaimRFilter;
                  setReclaimRFilter(next);
                  if (next) setReclaimSFilter(false);
                }}
                disabled={!reclaimReady || currentAllCount === 0 || activeTab === "coindcx"}
                className={`text-xs px-2.5 py-1 rounded-r rounded-l-none -ml-px border transition-colors disabled:opacity-50 ${
                  reclaimRFilter
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="Failed breakout: this session a completed 15m candle body broke above R1 (and possibly R2–R4), and price is now back below at least 2 of those pierced levels. Live — recalculated on every price tick; the pierced depth refreshes after each 15m candle closes. Binance and Delta only."
              >
                {reclaimProgress && !reclaimReady
                  ? `RECLAIM-R ${reclaimProgress.done}/${reclaimProgress.total}`
                  : reclaimReady
                    ? `RECLAIM-R (${reclaimRCount})`
                    : "RECLAIM-R…"}
              </button>
              </div>
              <button
                type="button"
                onClick={() => setCprboFilter((value) => !value)}
                disabled={!cprboReady || currentAllCount === 0 || activeTab === "coindcx" || activeTab === "nifty"}
                className={`ml-1 text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                  cprboFilter
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title={cprboMessage || "Qualifies when any of the previous session's last two or today's first two completed 15m candle bodies touches or crosses today's CPR TC or BC. Binance and Delta only."}
              >
                {cprboProgress
                  ? `CPRBO ${cprboProgress.done}/${cprboProgress.total}`
                  : cprboReady
                    ? `CPRBO (${cprboCount})`
                    : "CPRBO…"}
              </button>
              <button
                type="button"
                onClick={() => setPdhboFilter((value) => !value)}
                disabled={!cprboReady || currentAllCount === 0 || activeTab === "coindcx" || activeTab === "nifty"}
                aria-pressed={pdhboFilter}
                className={`ml-1 text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                  pdhboFilter
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title={cprboMessage || "PDHBO: either of the previous session's last two or today's first two completed 15m candle bodies overlaps today's PrevHigh. Binance and Delta only."}
              >
                {cprboProgress
                  ? `PDHBO ${cprboProgress.done}/${cprboProgress.total}`
                  : cprboReady
                    ? `PDHBO (${pdhboCount})`
                    : "PDHBO…"}
              </button>
              <button
                type="button"
                onClick={() => setPdlboFilter((value) => !value)}
                disabled={!cprboReady || currentAllCount === 0 || activeTab === "coindcx" || activeTab === "nifty"}
                aria-pressed={pdlboFilter}
                className={`ml-1 text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                  pdlboFilter
                    ? "relative z-10 bg-foreground/15 text-foreground border-[#22354a] font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title={cprboMessage || "PDLBO: either of the previous session's last two or today's first two completed 15m candle bodies overlaps today's PrevLow. Binance and Delta only."}
              >
                {cprboProgress
                  ? `PDLBO ${cprboProgress.done}/${cprboProgress.total}`
                  : cprboReady
                    ? `PDLBO (${pdlboCount})`
                    : "PDLBO…"}
              </button>
              <div className="inline-flex items-stretch ml-1" role="group" aria-label="Strong bar filters">
              <button
                type="button"
                onClick={() =>
                  setStrongBarFilter((v) => (v === "up" ? "off" : "up"))
                }
                disabled={currentAllCount === 0}
                className={`text-xs px-2.5 py-1 rounded-l border transition-colors disabled:opacity-50 ${
                  strongBarFilter === "up"
                    ? "relative z-10 bg-lime-500/20 text-lime-300 border-lime-500/40 font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="15m strong bar up (BIG↑): body ≥ 2.5× recent average and ≥ 55% of bar range, last few closed candles"
              >
                BIG↑ ({strongBarUpCount})
              </button>
              <button
                type="button"
                onClick={() =>
                  setStrongBarFilter((v) => (v === "down" ? "off" : "down"))
                }
                disabled={currentAllCount === 0}
                className={`text-xs px-2.5 py-1 rounded-r -ml-px border transition-colors disabled:opacity-50 ${
                  strongBarFilter === "down"
                    ? "relative z-10 bg-pink-500/20 text-[#ff6bb5] border-pink-500/40 font-bold"
                    : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                }`}
                title="15m strong bar down (BIG↓): body ≥ 2.5× recent average and ≥ 55% of bar range, last few closed candles"
              >
                BIG↓ ({strongBarDownCount})
              </button>
              </div>
            </div>
          </div>
          )}

          {/* NEW: ENTRY level filter — one button per Entry rung (R4..S4).
              Clicking e.g. "R1" shows every row with an active View whose
              entry is R1. Single-select, independent of the other filters.
              Hidden until "Entry +" is toggled on. */}
          {showEntryLevelList && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-green-400/90 uppercase tracking-wider mr-0.5 font-semibold">
              Entry:
            </span>
            {Object.keys(ENTRY_DEFS).slice().reverse().map((lvl) => (
              <button
                key={lvl}
                onClick={() => setEntryLevelFilter((v) => (v === lvl ? null : lvl))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  entryLevelFilter === lvl
                    ? "bg-foreground/15 text-foreground border-border"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title={`Active signals with entry at ${lvl}`}
              >
                {entryLevelFilter === lvl ? `✕ ${lvl}` : lvl}
              </button>
            ))}
          </div>
          )}

          </div>

        )}

        {(() => {
          const activeCandleMessage =
            previousCandleFilter === "consolidate-a"
              ? { text: previousConsolidateAMessage, dismiss: resetConsolidateAMessage }
              : previousCandleFilter === "pp-consolidate-a"
              ? { text: previousPPConsolidateAMessage, dismiss: resetPPConsolidateAMessage }
              : previousCandleFilter === "pp-consolidate-b"
              ? { text: previousPPConsolidateBMessage, dismiss: resetPPConsolidateBMessage }
              : previousCandleFilter === "momentum-a"
              ? { text: upexMessageFromPrep, dismiss: resetMomentumAMessage }
              : previousCandleFilter === "consolidate-b"
              ? { text: previous15MTCMessage, dismiss: resetConsolidateBMessage }
              : previousCandleFilter === "momentum-b"
              ? { text: previous15MMomentumMessage, dismiss: resetMomentumBMessage }
              : previousCandleFilter === "inside-r1s1"
              ? { text: previousInsideR1S1Message, dismiss: resetInsideR1S1Message }
              : previousCandleFilter === "vol-a"
              ? { text: previousVolAMessage, dismiss: resetVolAMessage }
              : previousCandleFilter === "vol-b"
              ? { text: previousVolBMessage, dismiss: resetVolBMessage }
              : previousCandleFilter === "pp-vol-a"
              ? { text: previousPPVolAMessage, dismiss: resetPPVolAMessage }
              : previousCandleFilter === "pp-vol-b"
              ? { text: previousPPVolBMessage, dismiss: resetPPVolBMessage }
              : null;

          const activeStatusMessages: { text: string; dismiss: () => void }[] = [];
          if (activeCandleMessage?.text) activeStatusMessages.push(activeCandleMessage);
          if ((reclaimSFilter || reclaimRFilter) && reclaimMessage) activeStatusMessages.push({ text: reclaimMessage, dismiss: () => clearReclaimMessage() });

          if (activeStatusMessages.length === 0 || currentStatus !== "done") return null;

          return (
            <div className="flex flex-col gap-1 px-1 -mt-1 mb-2 text-[10px] text-amber-300" role="status">
              {activeStatusMessages.map((m, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span>{m.text}</span>
                  <button
                    type="button"
                    onClick={m.dismiss}
                    className="hover:text-amber-100 text-amber-400/80 px-1 py-0.5 rounded transition-colors"
                    title="Dismiss message"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Single filter row, left → right: Search · All/Active/Ready/Pass/Fail · Binance | NIFTY (right). */}
        {canShowCombined && (
          <div className="px-4 py-2 border-b border-[#1b263b] bg-[#0d1422] flex flex-nowrap items-center gap-3 overflow-x-auto shrink-0 mb-3 rounded-lg border">
              <div className="relative shrink-0 w-48 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  placeholder="Search symbol or view…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#151e2c] border border-[#22354a] rounded-md pl-8 pr-8 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500/50 [&::-webkit-search-cancel-button]:hidden"
                />
                {search.trim() !== "" && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    title="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-white hover:bg-[#22354a] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Status Filter + Source switch — pinned right */}
              <div className="ml-auto flex items-center gap-2 shrink-0">
              {/* Hide completed targets while browsing All / Active / Ready */}
              <label
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold cursor-pointer select-none transition-colors ${
                  hidePass
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                    : "bg-[#151e2c] text-slate-400 border-[#22354a] hover:text-slate-200"
                }`}
                title="Hide rows that already hit target (Pass) this session"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={hidePass}
                  onChange={(e) => setHidePass(e.target.checked)}
                />
                <span
                  className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${
                    hidePass
                      ? "border-emerald-400/80 bg-emerald-500/30 text-emerald-200"
                      : "border-slate-500 bg-transparent"
                  }`}
                  aria-hidden
                >
                  {hidePass ? "✓" : ""}
                </span>
                Hide Pass
              </label>
              {/* Status Filter — Active (price has reached a View's entry line) /
                  Ready (matches a View, still waiting for entry). Same grouped
                  tab control as Signal Desk; clicking the selected button
                  clears it back to "all". */}
              <div className="flex gap-0.5 p-0.5 rounded-md border border-[#22354a] bg-[#151e2c]">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    statusFilter === "all"
                      ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40"
                      : "text-slate-400 hover:text-white border border-transparent"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    statusFilter === "active"
                      ? "bg-lime-500/20 text-lime-400 border border-lime-500/40"
                      : "text-lime-400/70 hover:text-lime-300 border border-transparent"
                  }`}
                  title="Rows with a View whose entry line price has already reached"
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === "ready" ? "all" : "ready")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    statusFilter === "ready"
                      ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                      : "text-sky-300/70 hover:text-sky-200 border border-transparent"
                  }`}
                  title="Rows matching a View, still waiting for entry"
                >
                  Ready
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === "pass" ? "all" : "pass")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    statusFilter === "pass"
                      ? "bg-green-500/20 text-green-400 border border-green-500/40"
                      : "text-green-400/70 hover:text-green-300 border border-transparent"
                  }`}
                  title="Rows where a matching View has already hit target this session"
                >
                  Pass
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === "fail" ? "all" : "fail")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    statusFilter === "fail"
                      ? "bg-red-500/20 text-red-400 border border-red-500/40"
                      : "text-red-400/70 hover:text-red-300 border border-transparent"
                  }`}
                  title="Rows where a matching View has already hit stoploss this session"
                >
                  Fail
                </button>
              </div>
              {/* Source switch — Binance | NIFTY only */}
              <div className="flex gap-0.5 p-0.5 rounded-md border border-[#22354a] bg-[#151e2c] shrink-0">
                {(["binance", "nifty"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition border cursor-pointer ${
                      activeTab === tab
                        ? tab === "binance"
                          ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50"
                          : "bg-amber-500/20 text-amber-300 border-amber-500/50"
                        : "text-slate-400 hover:text-slate-200 border-transparent"
                    }`}
                  >
                    {tab === "binance" ? "Binance" : "NIFTY"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* NIFTY mode — chain workspace (Underlying → Expiry → ATM± → CE/PE) */}
        {activeTab === "nifty" && <NiftyWorkspace />}

        {/* Table */}
        {currentStatus !== "idle" && displayed.length > 0 && (
          <ScreenerResultsTable
            canShowCombined={canShowCombined}
            activeTab={activeTab}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
          >
                  {(() => { const screenerTodayISO = utcTodayISO(); return displayed.map((r) => {
                    const rowKey = `${r.source}-${r.symbol}-${screenerTodayISO}`;
                    const reclaim = reclaimStatesFor(r);
                    return (
                      <ScreenerTableRow
                        key={rowKey}
                        r={r}
                        rowKey={rowKey}
                        isExpanded={expandedSymbols.has(rowKey)}
                        toggleExpand={toggleExpand}
                        canShowCombined={canShowCombined}
                        activeTab={activeTab}
                        activeSignal={activeSectionKey}
                        viewName={activeSignalName}
                        levelCheckConditions={activeSignalLevelCheckDefs}
                        isConsolidateA={hasConsolidateA(r)}
                        isPPConsolidateA={hasPPConsolidateA(r)}
                        isPPConsolidateB={hasPPConsolidateB(r)}
                        isPPMomentumA={hasPPMomentumA(r)}
                        isPPMomentumB={hasPPMomentumB(r)}
                        isPPVolatileR1S1={hasPPVolatileR1S1(r)}
                        isMomentumA={hasMomentumA(r)}
                        isConsolidateB={hasConsolidateB(r)}
                        isMomentumB={hasMomentumB(r)}
                        isInsideR1S1={hasInsideR1S1(r)}
                        isVolA={hasVolA(r)}
                        isVolB={hasVolB(r)}
                        isPPVolA={hasPPVolA(r)}
                        isPPVolB={hasPPVolB(r)}
                        isCPRBO={cprboMatches.has(`${r.source}:${r.symbol}`)}
                        isPDHBO={pdhboMatches.has(`${r.source}:${r.symbol}`)}
                        isPDLBO={pdlboMatches.has(`${r.source}:${r.symbol}`)}
                        reclaimS={reclaim.s?.qualifies ? reclaim.s : null}
                        reclaimR={reclaim.r?.qualifies ? reclaim.r : null}
                        onRowFocus={handleRowFocus}
                        isFocused={focusedRowKey === rowKey}
                      />
                    );
                  }); })()}
          </ScreenerResultsTable>
        )}

        {currentStatus === "done" && displayed.length === 0 && (
          <NoSignalsPanel
            title="No active signals found matching current filters"
            subtitle="Try clearing filters or switching source exchanges"
          />
        )}

      </div>
    </div>
  );
}
