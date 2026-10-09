import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { pivotcategories, Views, VIEW_LABEL_BY_ID, requestSignalDeselect } from "@/lib/ViewsSidebar";
import { getView, VIEWS } from "@/lib/views";
import { hasTouchedEntry } from "@/lib/signalTracker";
import { sessionReachedTarget } from "@/lib/signalOutcome";
import {
  TrendingUp,
  RefreshCw,
  Search,
  ExternalLink,
  Bell,
  BellOff,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { runScreener } from "@/lib/binance";
import { runDeltaScreener } from "@/lib/delta";
import { runCoinDCXScreener } from "@/lib/coinDCX";
import { COINDCX_ENABLED } from "@/lib/featureFlags";
import {
  findPD15MBelowTCSymbols,
  findPD15MMomentumBelowSymbols,
  findPreviousConsolidateASymbols,
  findPreviousUpexSymbols,
  findUpexSymbols,
  getUpexBc,
  getConsolidateABc,
  getConsolidateBTc,
  pruneLegacy15MResultCaches,
  loadPD15MMomentumBelowResults,
  loadPD15MTCBelowResults,
  loadPreviousConsolidateAResults,
  loadPreviousUpexResults,
  getPrevious15MACeiling,
  getPrevious15MBFloor,
  previous15MMomentumCandidateCacheKey,
  previous15MTCCandidateCacheKey,
  previousConsolidateACandidateCacheKey,
  previousUpexCandidateCacheKey,
  previousUpexSessionStartUtcMs,
  savePD15MBelowTCResults,
  savePD15MMomentumBelowResults,
  savePreviousConsolidateAResults,
  savePreviousUpexResults,
} from "@/lib/15MCandleCheck";
import type { CPRResult } from "@/lib/cpr";
import { utcTodayISO, ENTRY_DEFS } from "@/lib/backtest";
import {
  shouldAutoScanForCache,
  markScannedToday,
  hasScannedToday,
  getLastScanDate,
  getNextScanIST,
  formatCountdown,
  formatISTTime,
  loadCachedResults,
  saveCachedResults,
  formatScanTime,
  formatScanDate,
  isCacheFresh,
  isScanFreshForSource,
  markScannedForSource,
  purgeCoinDCXStorage,
  STORAGE_KEY_BINANCE,
  STORAGE_KEY_DELTA,
  STORAGE_KEY_COINDCX,
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
import ScreenerLegend from "./ScreenerLegend";
import ScreenerTableRow, { ScreenerTableHeader, getBadgeClasses } from "./ScreenerTableRow";
import { useBinanceLiveRefresh, useDeltaLiveRefresh, useCoinDCXLiveRefresh } from "@/hooks/useLivePriceRefresh";

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
 * matching fallback in getActivePool), instead of each View
 * getting its own hand-written useState + button + pool block like the
 * older hardcoded categories above it used to.
 *
 * Why: every new View under those older categories needs a new
 * useState, a cleanup-effect entry, a getActivePool() branch, an
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
function getRowStatus(r: CPRResult): { active: boolean; ready: boolean } {
  let active = false;
  let ready = false;
  for (const v of getMatchingSignals(r)) {
    const entryFn = getView(v.id)?.getEntry;
    if (!entryFn) continue;
    // A target already reached today (even if price has since retraced) means
    // the entry was necessarily touched, so it counts as Active - never Ready.
    const targetFn = getView(v.id)?.getTarget;
    const passed =
      !!targetFn &&
      sessionReachedTarget(v.direction ?? "", targetFn(r), r.todayHigh, r.todayLow, r.currentPrice);
    if (passed || hasTouchedEntry(v.direction ?? "", entryFn(r), r.currentPrice)) active = true;
    else ready = true;
    if (active && ready) break;
  }
  return { active, ready };
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
}) {
  const cachedBinance = useMemo(() => loadCachedResults<CPRResult>(STORAGE_KEY_BINANCE), []);
  const cachedDelta = useMemo(() => loadCachedResults<CPRResult>(STORAGE_KEY_DELTA), []);
  // CoinDCX paused (COINDCX_ENABLED=false): don't even read its cache, and
  // delete whatever it left in localStorage so the quota is freed.
  const cachedCoinDCX = useMemo(() => {
    if (!COINDCX_ENABLED) {
      purgeCoinDCXStorage();
      return null;
    }
    return loadCachedResults<CPRResult>(STORAGE_KEY_COINDCX);
  }, []);

  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">(() => {
    return isScanFreshForSource("binance", cachedBinance) ? "done" : "idle";
  });
  const [progress, setProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [allResults, setAllResults] = useState<CPRResult[]>(() => {
    return isCacheFresh(cachedBinance) ? cachedBinance?.data ?? [] : [];
  });
  const [filtered, setFiltered] = useState<CPRResult[]>(() => {
    return isCacheFresh(cachedBinance) ? cachedBinance?.data ?? [] : [];
  });
  // "Scanned at" badge — wall-clock time of the last completed scan for
  // each source, seeded from the cached entry's savedAt (undefined for
  // legacy cache entries saved before that field existed, or when nothing
  // has been scanned yet today) and refreshed the moment a fresh scan
  // completes, right alongside saveCachedResults below.
  const [binanceScannedAt, setBinanceScannedAt] = useState<number | null>(
    () => (isCacheFresh(cachedBinance) ? cachedBinance?.savedAt ?? null : null)
  );
  const [sortKey, setSortKey] = useState<SortKey>("compressionRatio");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  // Default to true: on first load / refresh, before the user picks a
  // left-nav pattern, the screener should show ALL scanned results
  // (unfiltered) rather than being pre-filtered to a specific pattern.
  const [showAll, setShowAll] = useState(true);
  // Generic Views toggle — covers every non-empty category derived from
  // the registry-backed navigation map. Holds the selected View id, or null.
  const [activeGenericSignal, setActiveGenericSignal] = useState<string | null>(null);
  const [PatternFilter, setPatternFilter] = useState<string | null>(null);
  // Independent of the left-nav Views: cycles off -> BRK (fresh 15m squeeze breakouts) -> SQZ (coiling now).
  const [breakoutMode, setBreakoutMode] = useState<"off" | "brk" | "sqz">("off");
  const [showPatternList, setShowPatternList] = useState(false);
  const [showTouchList, setShowTouchList] = useState(false);
  const [touchFilter, setTouchFilter] = useState<string | null>(null);
  const [showSizeList, setShowSizeList] = useState(false);
  const [showPriceList, setShowPriceList] = useState(false);
  // Previous-session 15m candle filters (MOMENTUM-A, CONSOLIDATE-B,
  // MOMENTUM-B) live in their own "Candle" panel, split out of the Price panel.
  const [showCandleList, setShowCandleList] = useState(false);
  // NEW: ENTRY level filter — 13 buttons (R4..S4, same rungs as Create View's
  // Entry dropdown, minus the "Entry " prefix). Selecting one keeps only rows
  // that currently satisfy at least one View whose ENTRY is that rung.
  const [showEntryLevelList, setShowEntryLevelList] = useState(false);
  const [entryLevelFilter, setEntryLevelFilter] = useState<string | null>(null);

  // NEW: every View that defines a target (i.e. a tradable signal), flattened
  // once — the ENTRY filter below reads each one's entry rung per row.
  const entrySignalViews = useMemo(
    () => VIEWS.filter((v) => v.kind === "view" && !!v.getTarget),
    []
  );
  // CHANGED: split into two independent states so one pMicro..pUltra
  // selection (prev day's CPR width) and one Micro..Ultra selection
  // (today's CPR width) can be active at the same time.
  const [prevWidthFilter, setPrevWidthFilter] = useState<WidthCategoryKey | null>(null);
  const [todayWidthFilter, setTodayWidthFilter] = useState<WidthCategoryKey | null>(null);
  // NEW: PDH/PDL filter — independent of activeSignal, mutually exclusive (like pivot/width filters).
  const [pdhPdlFilter, setPdhPdlFilter] = useState<"above" | "below" | "abovepu4" | "belowpl4" | "pdhgtu1" | "pdlltl1" | "s1r1in" | null>(null);
  const [upexFilter, setUpexFilter] = useState(false);
  const [upexIncludedSymbols, setUpexIncludedSymbols] = useState<Set<string>>(() => new Set());
  const [previousConsolidateAFilter, setPreviousConsolidateAFilter] = useState(false);
  const [previousConsolidateAIncludedSymbols, setPreviousConsolidateAIncludedSymbols] = useState<Set<string>>(() => new Set());
  const [previousConsolidateAProgress, setPreviousConsolidateAProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [previousConsolidateAReady, setPreviousConsolidateAReady] = useState(false);
  const [previousConsolidateAMessage, setPreviousConsolidateAMessage] = useState("");
  const previousConsolidateAResultsRef = useRef<Map<string, boolean | null>>(
    loadPreviousConsolidateAResults(previousUpexSessionStartUtcMs()),
  );
  const previousConsolidateACacheSessionRef = useRef(previousUpexSessionStartUtcMs());
  const previousConsolidateARunRef = useRef(0);

  const [previousUpexFilter, setPreviousUpexFilter] = useState(false);
  const [previousUpexIncludedSymbols, setPreviousUpexIncludedSymbols] = useState<Set<string>>(() => new Set());
  const [previousUpexProgress, setPreviousUpexProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [previousUpexReady, setPreviousUpexReady] = useState(false);
  const [previous15MTCFilter, setPrevious15MTCFilter] = useState(false);
  const [previous15MTCIncludedSymbols, setPrevious15MTCIncludedSymbols] = useState<Set<string>>(() => new Set());
  const [previous15MTCProgress, setPrevious15MTCProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [previous15MTCReady, setPrevious15MTCReady] = useState(false);
  const [previous15MTCMessage, setPrevious15MTCMessage] = useState("");
  const [previous15MMomentumFilter, setPrevious15MMomentumFilter] = useState(false);
  const [previous15MMomentumIncludedSymbols, setPrevious15MMomentumIncludedSymbols] = useState<Set<string>>(() => new Set());
  const [previous15MMomentumProgress, setPrevious15MMomentumProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [previous15MMomentumReady, setPrevious15MMomentumReady] = useState(false);
  const [previous15MMomentumMessage, setPrevious15MMomentumMessage] = useState("");
  const previousUpexSessionStart = previousUpexSessionStartUtcMs();
  const previousUpexResultsRef = useRef<Map<string, boolean | null>>(
    loadPreviousUpexResults(previousUpexSessionStart),
  );
  const previousUpexCacheSessionRef = useRef(previousUpexSessionStart);
  const previousUpexRunRef = useRef(0);
  const previous15MTCResultsRef = useRef<Map<string, boolean | null>>(
    loadPD15MTCBelowResults(previousUpexSessionStart),
  );
  const previous15MTCCacheSessionRef = useRef(previousUpexSessionStart);
  const previous15MTCRunRef = useRef(0);
  const previous15MMomentumResultsRef = useRef<Map<string, boolean | null>>(
    loadPD15MMomentumBelowResults(previousUpexSessionStart),
  );
  const previous15MMomentumCacheSessionRef = useRef(previousUpexSessionStart);
  const previous15MMomentumRunRef = useRef(0);
  const [upexProgress, setUpexProgress] = useState<{
    done: number;
    total: number;
    filter: "15M-A";
  } | null>(null);
  const [upexMessage, setUpexMessage] = useState("");
  const upexRunRef = useRef(0);
  // Active / Ready status filter (grouped tab control in the search bar).
  // Clicking the already-selected button clears it back to "all".
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ready">("all");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const [nextScanUtc, setNextScanUtc] = useState<Date>(getNextScanIST());
  const [alreadyScannedToday] = useState(() => hasScannedToday());
  const [lastScanDate] = useState(() => getLastScanDate());
  const scanRef = useRef(false);

  const [deltaStatus, setDeltaStatus] = useState<"idle" | "scanning" | "done" | "error">(() => {
    return isScanFreshForSource("delta", cachedDelta) ? "done" : "idle";
  });
  const [deltaProgress, setDeltaProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [deltaAllResults, setDeltaAllResults] = useState<CPRResult[]>(() => {
    return isCacheFresh(cachedDelta) ? cachedDelta?.data ?? [] : [];
  });
  const [deltaScannedAt, setDeltaScannedAt] = useState<number | null>(
    () => (isCacheFresh(cachedDelta) ? cachedDelta?.savedAt ?? null : null)
  );
  const [deltaFiltered, setDeltaFiltered] = useState<CPRResult[]>(() => {
    return isCacheFresh(cachedDelta) ? cachedDelta?.data ?? [] : [];
  });
  const [deltaError, setDeltaError] = useState("");

  const [coindcxStatus, setCoinDCXStatus] = useState<"idle" | "scanning" | "done" | "error">(() => {
    return isScanFreshForSource("coindcx", cachedCoinDCX) ? "done" : "idle";
  });
  const [coindcxProgress, setCoinDCXProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [coindcxAllResults, setCoinDCXAllResults] = useState<CPRResult[]>(() => {
    return isCacheFresh(cachedCoinDCX) ? cachedCoinDCX?.data ?? [] : [];
  });
  const [coindcxScannedAt, setCoinDCXScannedAt] = useState<number | null>(
    () => (isCacheFresh(cachedCoinDCX) ? cachedCoinDCX?.savedAt ?? null : null)
  );
  const [coindcxFiltered, setCoinDCXFiltered] = useState<CPRResult[]>(() => {
    return isCacheFresh(cachedCoinDCX) ? cachedCoinDCX?.data ?? [] : [];
  });
  const [coindcxError, setCoinDCXError] = useState("");
  const [activeTabState, setActiveTabState] = useState<ActiveTab>("binance");
  // Controlled when App.tsx passes activeTab/onActiveTabChange (the normal
  // case now); falls back to local state otherwise. setActiveTab below is
  // used everywhere else in this file exactly as before — only its source
  // changed.
  const activeTab = activeTabProp ?? activeTabState;
  const setActiveTab = onActiveTabChange ?? setActiveTabState;
  useEffect(() => {
    upexRunRef.current += 1;
    setUpexFilter(false);
    setUpexIncludedSymbols(new Set());
    setPreviousConsolidateAFilter(false);
    setPreviousConsolidateAMessage("");
    setPreviousUpexFilter(false);
    setPrevious15MTCFilter(false);
    setPrevious15MMomentumFilter(false);
    setUpexProgress(null);
    setUpexMessage("");
    setPrevious15MTCMessage("");
    setPrevious15MMomentumMessage("");
  }, [activeTab]);
  const deltaScanRef = useRef(false);
  const coindcxScanRef = useRef(false);

  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());

  function toggleExpand(key: string) {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const allResultsRef = useRef<CPRResult[]>([]);
  const deltaAllResultsRef = useRef<CPRResult[]>([]);
  const coindcxAllResultsRef = useRef<CPRResult[]>([]);
  const activeSignalRef = useRef(activeSignal);
  // One-time cleanup of superseded 15m result-cache keys (old _vN versions).
  useEffect(() => { pruneLegacy15MResultCaches(); }, []);
  useEffect(() => { allResultsRef.current = allResults; }, [allResults]);
  useEffect(() => { deltaAllResultsRef.current = deltaAllResults; }, [deltaAllResults]);
  useEffect(() => { coindcxAllResultsRef.current = coindcxAllResults; }, [coindcxAllResults]);
  useEffect(() => { activeSignalRef.current = activeSignal; }, [activeSignal]);

  useEffect(() => {
    if (previousConsolidateACacheSessionRef.current !== previousUpexSessionStart) {
      previousConsolidateAResultsRef.current = loadPreviousConsolidateAResults(previousUpexSessionStart);
      previousConsolidateACacheSessionRef.current = previousUpexSessionStart;
    }
    if (
      status === "scanning" ||
      deltaStatus === "scanning" ||
      (status !== "done" && deltaStatus !== "done")
    ) return;

    const candidates = new Map<string, {
      symbol: string;
      source: "binance" | "delta";
      bc: number;
      ceiling: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol,
          source: "binance",
          bc: getConsolidateABc(row.prevCPR, row.ppCPR),
          ceiling: getPrevious15MACeiling(row.prevCPR),
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol,
          source: "delta",
          bc: getConsolidateABc(row.prevCPR, row.ppCPR),
          ceiling: getPrevious15MACeiling(row.prevCPR),
        });
      }
    }
    const currentCandidates = Array.from(candidates.values());
    if (currentCandidates.length === 0) {
      setPreviousConsolidateAReady(false);
      setPreviousConsolidateAProgress(null);
      return;
    }

    const cacheKey = (candidate: (typeof currentCandidates)[number]) =>
      previousConsolidateACandidateCacheKey(previousUpexSessionStart, candidate);
    const missing = currentCandidates.filter(
      (candidate) => !previousConsolidateAResultsRef.current.has(cacheKey(candidate)),
    );
    const updateIncluded = () => {
      setPreviousConsolidateAIncludedSymbols(
        new Set(
          currentCandidates
            .filter((candidate) => previousConsolidateAResultsRef.current.get(cacheKey(candidate)) === true)
            .map((candidate) => `${candidate.source}:${candidate.symbol}`),
        ),
      );
    };
    updateIncluded();

    if (missing.length === 0) {
      setPreviousConsolidateAReady(true);
      setPreviousConsolidateAProgress(null);
      const unavailable = currentCandidates.filter(
        (candidate) => previousConsolidateAResultsRef.current.get(cacheKey(candidate)) === null,
      ).length;
      setPreviousConsolidateAMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from CONSOLIDATE-A because no usable completed 15m candles were returned for the previous IST session.`
          : "",
      );
      return;
    }

    const runId = ++previousConsolidateARunRef.current;
    setPreviousConsolidateAFilter(false);
    setPreviousConsolidateAReady(false);
    setPreviousConsolidateAProgress({ done: 0, total: missing.length });
    void findPreviousConsolidateASymbols(
      missing,
      (done, total) => {
        if (runId === previousConsolidateARunRef.current) {
          setPreviousConsolidateAProgress({ done, total });
        }
      },
      previousUpexSessionStart + 24 * 60 * 60 * 1000,
    ).then(({ outcomes, unavailable }) => {
      if (runId !== previousConsolidateARunRef.current) return;
      for (const candidate of missing) {
        const symbolKey = `${candidate.source}:${candidate.symbol}`;
        const outcome = outcomes.get(symbolKey);
        if (typeof outcome === "boolean") {
          previousConsolidateAResultsRef.current.set(cacheKey(candidate), outcome);
        } else {
          previousConsolidateAResultsRef.current.delete(cacheKey(candidate));
        }
      }
      savePreviousConsolidateAResults(previousUpexSessionStart, previousConsolidateAResultsRef.current);
      updateIncluded();
      setPreviousConsolidateAReady(true);
      setPreviousConsolidateAProgress(null);
      setPreviousConsolidateAMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from CONSOLIDATE-A because no usable completed 15m candles were returned for the previous IST session.`
          : "",
      );
    }).catch((cause: unknown) => {
      if (runId !== previousConsolidateARunRef.current) return;
      setPreviousConsolidateAProgress(null);
      setPreviousConsolidateAReady(false);
      setPreviousConsolidateAMessage(
        cause instanceof Error
          ? `CONSOLIDATE-A preparation failed: ${cause.message}`
          : "CONSOLIDATE-A preparation failed.",
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deltaStatus, previousUpexSessionStart]);

  useEffect(() => {
    if (previousUpexCacheSessionRef.current !== previousUpexSessionStart) {
      previousUpexResultsRef.current = loadPreviousUpexResults(previousUpexSessionStart);
      previousUpexCacheSessionRef.current = previousUpexSessionStart;
    }
    if (
      status === "scanning" ||
      deltaStatus === "scanning" ||
      (status !== "done" && deltaStatus !== "done")
    ) return;
    const candidates = new Map<string, {
      symbol: string;
      source: "binance" | "delta";
      bc: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol,
          source: "binance",
          bc: row.prevCPR.bc,
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol,
          source: "delta",
          bc: row.prevCPR.bc,
        });
      }
    }
    const currentCandidates = Array.from(candidates.values());
    if (currentCandidates.length === 0) {
      setPreviousUpexReady(false);
      setPreviousUpexProgress(null);
      return;
    }

    const cacheKey = (candidate: (typeof currentCandidates)[number]) =>
      previousUpexCandidateCacheKey(previousUpexSessionStart, candidate);
    const missing = currentCandidates.filter(
      (candidate) => !previousUpexResultsRef.current.has(cacheKey(candidate)),
    );
    const syncPreparedFlags = () => {
      setAllResults((rows) =>
        rows.map((row) => ({
          ...row,
          PD15MAboveBCPass:
            previousUpexResultsRef.current.get(
              `${previousUpexSessionStart}|binance:${row.symbol}:${row.prevCPR.bc}`,
            ) === true,
        })),
      );
      setDeltaAllResults((rows) =>
        rows.map((row) => ({
          ...row,
          PD15MAboveBCPass:
            previousUpexResultsRef.current.get(
              `${previousUpexSessionStart}|delta:${row.symbol}:${row.prevCPR.bc}`,
            ) === true,
        })),
      );
    };
    const updateIncluded = () => {
      setPreviousUpexIncludedSymbols(
        new Set(
          currentCandidates
            .filter((candidate) => previousUpexResultsRef.current.get(cacheKey(candidate)) === true)
            .map((candidate) => `${candidate.source}:${candidate.symbol}`),
        ),
      );
    };
    updateIncluded();
    syncPreparedFlags();

    if (missing.length === 0) {
      setPreviousUpexReady(true);
      setPreviousUpexProgress(null);
      const unavailable = currentCandidates.filter(
        (candidate) => previousUpexResultsRef.current.get(cacheKey(candidate)) === null,
      ).length;
      setUpexMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from MOMENTUM-A because no usable completed 15m candles were returned for the previous IST session.`
          : "",
      );
      return;
    }

    const runId = ++previousUpexRunRef.current;
    setPreviousUpexFilter(false);
    setPreviousUpexReady(false);
    setPreviousUpexProgress({ done: 0, total: missing.length });
    void findPreviousUpexSymbols(
      missing,
      (done, total) => {
        if (runId === previousUpexRunRef.current) {
          setPreviousUpexProgress({ done, total });
        }
      },
      previousUpexSessionStart + 24 * 60 * 60 * 1000,
    ).then(({ outcomes, unavailable }) => {
      if (runId !== previousUpexRunRef.current) return;
      for (const candidate of missing) {
        const symbolKey = `${candidate.source}:${candidate.symbol}`;
        const outcome = outcomes.get(symbolKey);
        if (typeof outcome === "boolean") {
          previousUpexResultsRef.current.set(cacheKey(candidate), outcome);
        } else {
          previousUpexResultsRef.current.delete(cacheKey(candidate));
        }
      }
      savePreviousUpexResults(previousUpexSessionStart, previousUpexResultsRef.current);
      updateIncluded();
      syncPreparedFlags();
      setPreviousUpexReady(true);
      setPreviousUpexProgress(null);
      setUpexMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from MOMENTUM-A because no usable completed 15m candles were returned for the previous IST session.`
          : "",
      );
    }).catch((cause: unknown) => {
      if (runId !== previousUpexRunRef.current) return;
      setPreviousUpexProgress(null);
      setPreviousUpexReady(false);
      setUpexMessage(
        cause instanceof Error
          ? `MOMENTUM-A preparation failed: ${cause.message}`
          : "MOMENTUM-A preparation failed.",
      );
    });
    // This runs on scan completion/session rollover, not live-price ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deltaStatus, previousUpexSessionStart]);


  useEffect(() => {
    if (previous15MTCCacheSessionRef.current !== previousUpexSessionStart) {
      previous15MTCResultsRef.current = loadPD15MTCBelowResults(previousUpexSessionStart);
      previous15MTCCacheSessionRef.current = previousUpexSessionStart;
    }
    if (
      status === "scanning" ||
      deltaStatus === "scanning" ||
      (status !== "done" && deltaStatus !== "done")
    ) return;

    const candidates = new Map<string, {
      symbol: string;
      source: "binance" | "delta";
      bc: number;
      floor: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol,
          source: "binance",
          bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
          floor: getPrevious15MBFloor(row.prevCPR),
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol,
          source: "delta",
          bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
          floor: getPrevious15MBFloor(row.prevCPR),
        });
      }
    }
    const currentCandidates = Array.from(candidates.values());
    if (currentCandidates.length === 0) {
      setPrevious15MTCReady(false);
      setPrevious15MTCProgress(null);
      return;
    }

    const cacheKey = (candidate: (typeof currentCandidates)[number]) =>
      previous15MTCCandidateCacheKey(previousUpexSessionStart, candidate);
    const missing = currentCandidates.filter(
      (candidate) => !previous15MTCResultsRef.current.has(cacheKey(candidate)),
    );
    const syncPreparedFlags = () => {
      setAllResults((rows) =>
        rows.map((row) => ({
          ...row,
          PD15MBelowTCPass:
            previous15MTCResultsRef.current.get(
              previous15MTCCandidateCacheKey(previousUpexSessionStart, {
                symbol: row.symbol,
                source: "binance",
                bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
                floor: getPrevious15MBFloor(row.prevCPR),
              }),
            ) === true,
        })),
      );
      setDeltaAllResults((rows) =>
        rows.map((row) => ({
          ...row,
          PD15MBelowTCPass:
            previous15MTCResultsRef.current.get(
              previous15MTCCandidateCacheKey(previousUpexSessionStart, {
                symbol: row.symbol,
                source: "delta",
                bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
                floor: getPrevious15MBFloor(row.prevCPR),
              }),
            ) === true,
        })),
      );
    };
    const updateIncluded = () => {
      setPrevious15MTCIncludedSymbols(
        new Set(
          currentCandidates
            .filter((candidate) => previous15MTCResultsRef.current.get(cacheKey(candidate)) === true)
            .map((candidate) => `${candidate.source}:${candidate.symbol}`),
        ),
      );
    };
    updateIncluded();
    syncPreparedFlags();

    if (missing.length === 0) {
      setPrevious15MTCReady(true);
      setPrevious15MTCProgress(null);
      const unavailable = currentCandidates.filter(
        (candidate) => previous15MTCResultsRef.current.get(cacheKey(candidate)) === null,
      ).length;
      setPrevious15MTCMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from CONSOLIDATE-B because no usable completed 15m candles were returned for the previous IST session.`
          : "",
      );
      return;
    }

    const runId = ++previous15MTCRunRef.current;
    setPrevious15MTCFilter(false);
    setPrevious15MTCReady(false);
    setPrevious15MTCProgress({ done: 0, total: missing.length });
    void findPD15MBelowTCSymbols(
      missing,
      (done, total) => {
        if (runId === previous15MTCRunRef.current) {
          setPrevious15MTCProgress({ done, total });
        }
      },
      previousUpexSessionStart + 24 * 60 * 60 * 1000,
    ).then(({ outcomes, unavailable }) => {
      if (runId !== previous15MTCRunRef.current) return;
      for (const candidate of missing) {
        const symbolKey = `${candidate.source}:${candidate.symbol}`;
        const outcome = outcomes.get(symbolKey);
        if (typeof outcome === "boolean") {
          previous15MTCResultsRef.current.set(cacheKey(candidate), outcome);
        } else {
          previous15MTCResultsRef.current.delete(cacheKey(candidate));
        }
      }
      savePD15MBelowTCResults(previousUpexSessionStart, previous15MTCResultsRef.current);
      updateIncluded();
      syncPreparedFlags();
      setPrevious15MTCReady(true);
      setPrevious15MTCProgress(null);
      setPrevious15MTCMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from CONSOLIDATE-B because no usable completed 15m candles were returned for the previous IST session.`
          : "",
      );
    }).catch((cause: unknown) => {
      if (runId !== previous15MTCRunRef.current) return;
      setPrevious15MTCProgress(null);
      setPrevious15MTCReady(false);
      setPrevious15MTCMessage(
        cause instanceof Error
          ? `CONSOLIDATE-B preparation failed: ${cause.message}`
          : "CONSOLIDATE-B preparation failed.",
      );
    });
    // This runs on scan completion/session rollover, not live-price ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deltaStatus, previousUpexSessionStart]);

  useEffect(() => {
    if (previous15MMomentumCacheSessionRef.current !== previousUpexSessionStart) {
      previous15MMomentumResultsRef.current = loadPD15MMomentumBelowResults(previousUpexSessionStart);
      previous15MMomentumCacheSessionRef.current = previousUpexSessionStart;
    }
    if (
      status === "scanning" ||
      deltaStatus === "scanning" ||
      (status !== "done" && deltaStatus !== "done")
    ) return;

    const candidates = new Map<string, {
      symbol: string;
      source: "binance" | "delta";
      bc: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol,
          source: "binance",
          bc: row.prevCPR.tc,
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol,
          source: "delta",
          bc: row.prevCPR.tc,
        });
      }
    }
    const currentCandidates = Array.from(candidates.values());
    if (currentCandidates.length === 0) {
      setPrevious15MMomentumReady(false);
      setPrevious15MMomentumProgress(null);
      return;
    }

    const cacheKey = (candidate: (typeof currentCandidates)[number]) =>
      previous15MMomentumCandidateCacheKey(previousUpexSessionStart, candidate);
    const missing = currentCandidates.filter(
      (candidate) => !previous15MMomentumResultsRef.current.has(cacheKey(candidate)),
    );
    const updateIncluded = () => {
      setPrevious15MMomentumIncludedSymbols(
        new Set(
          currentCandidates
            .filter((candidate) => previous15MMomentumResultsRef.current.get(cacheKey(candidate)) === true)
            .map((candidate) => `${candidate.source}:${candidate.symbol}`),
        ),
      );
    };
    updateIncluded();

    if (missing.length === 0) {
      setPrevious15MMomentumReady(true);
      setPrevious15MMomentumProgress(null);
      const unavailable = currentCandidates.filter(
        (candidate) => previous15MMomentumResultsRef.current.get(cacheKey(candidate)) === null,
      ).length;
      setPrevious15MMomentumMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from MOMENTUM-B because no usable completed 15m candles were returned for the previous IST session.`
          : "",
      );
      return;
    }

    const runId = ++previous15MMomentumRunRef.current;
    setPrevious15MMomentumFilter(false);
    setPrevious15MMomentumReady(false);
    setPrevious15MMomentumProgress({ done: 0, total: missing.length });
    void findPD15MMomentumBelowSymbols(
      missing,
      (done, total) => {
        if (runId === previous15MMomentumRunRef.current) {
          setPrevious15MMomentumProgress({ done, total });
        }
      },
      previousUpexSessionStart + 24 * 60 * 60 * 1000,
    ).then(({ outcomes, unavailable }) => {
      if (runId !== previous15MMomentumRunRef.current) return;
      for (const candidate of missing) {
        const symbolKey = `${candidate.source}:${candidate.symbol}`;
        const outcome = outcomes.get(symbolKey);
        if (typeof outcome === "boolean") {
          previous15MMomentumResultsRef.current.set(cacheKey(candidate), outcome);
        } else {
          previous15MMomentumResultsRef.current.delete(cacheKey(candidate));
        }
      }
      savePD15MMomentumBelowResults(previousUpexSessionStart, previous15MMomentumResultsRef.current);
      updateIncluded();
        setPrevious15MMomentumReady(true);
      setPrevious15MMomentumProgress(null);
      setPrevious15MMomentumMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from MOMENTUM-B because no usable completed 15m candles were returned for the previous IST session.`
          : "",
      );
    }).catch((cause: unknown) => {
      if (runId !== previous15MMomentumRunRef.current) return;
      setPrevious15MMomentumProgress(null);
      setPrevious15MMomentumReady(false);
      setPrevious15MMomentumMessage(
        cause instanceof Error
          ? `MOMENTUM-B preparation failed: ${cause.message}`
          : "MOMENTUM-B preparation failed.",
      );
    });
    // This runs on scan completion/session rollover, not live-price ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deltaStatus, previousUpexSessionStart]);

  // NEW: auto-hide "Show All" whenever a left-nav view/category is clicked.
  // ViewsSidebar's onSelect (both handlePatternClick for top-level categories
  // and handleSubClick for their Views/sub-patterns) updates activeSignal,
  // so any change to activeSignal after the initial mount means the user
  // just picked something in the left nav — at that point showAll should be
  // turned off so the screener actually reflects the selected filter instead
  // of continuing to show every scanned result. The isFirstPatternRef guard
  // skips the mount-time run so the intentional "start in Show All" default
  // (see showAll's useState above) is left alone on first load.
  const isFirstPatternRef = useRef(true);
  useEffect(() => {
    if (isFirstPatternRef.current) {
      isFirstPatternRef.current = false;
      return;
    }
    // Only turn off showAll when a real category/view was selected in the left nav.
    // When activeSignal is cleared back to "" (e.g. via Show All), ensure showAll is true.
    if (activeSignal) {
      setShowAll(false);
    } else {
      setShowAll(true);
    }
  }, [activeSignal]);

  // NEW: resolve activeSignal to its parent left-nav category ("section").
  // Clicking a top-level category in the left-nav sets activeSignal to the
  // category id directly (e.g. "compressed"), but clicking one of its
  // Views/sub-patterns instead sets
  // activeSignal to that LEAF id — ViewsSidebar's handleSubClick calls
  // onSelect(subId), not onSelect(parentId). Row filtering already handles
  // both cases fine (passesPattern resolves leaf ids directly), but
  // anything keyed off the *category* — the Views button row and the
  // per-row green/red direction dot (getViewDirection) — was comparing
  // against the raw activeSignal and so went blank whenever a leaf was
  // selected via the left-nav. activeSectionKey resolves either case back
  // to the owning category so those two stay populated regardless of
  // whether the category or one of its leaves triggered the selection.
  const activeSectionKey = useMemo(() => {
    if (Views[activeSignal]) return activeSignal; // already a category id
    for (const [section, subs] of Object.entries(Views)) {
      if (subs.some((s) => s.id === activeSignal)) return section;
    }
    return activeSignal; // not a known category or leaf — leave as-is
  }, [activeSignal]);

  const doScan = useCallback(async (switchTab: boolean = true) => {
    if (scanRef.current) return;
    scanRef.current = true;
    upexRunRef.current += 1;
    previousConsolidateARunRef.current += 1;
    previousUpexRunRef.current += 1;
    previous15MTCRunRef.current += 1;
    previous15MMomentumRunRef.current += 1;
    setUpexFilter(false);
    setUpexIncludedSymbols(new Set());
    setPreviousConsolidateAFilter(false);
    setPreviousConsolidateAMessage("");
    setPreviousUpexFilter(false);
    setPrevious15MTCFilter(false);
    setPrevious15MMomentumFilter(false);
    setPreviousUpexProgress(null);
    setPreviousUpexReady(false);
    setPrevious15MTCProgress(null);
    setPrevious15MMomentumProgress(null);
    setPrevious15MTCReady(false);
    setPrevious15MMomentumReady(false);
    setPrevious15MTCIncludedSymbols(new Set());
    setPrevious15MMomentumIncludedSymbols(new Set());
    setUpexProgress(null);
    setUpexMessage("");
    setPrevious15MTCMessage("");
    setPrevious15MMomentumMessage("");
    setStatus("scanning");
    if (switchTab) setActiveTab("binance");
    setAllResults([]);
    setFiltered([]);
    setError("");
    setProgress({ done: 0, total: 0, symbol: "" });
    try {
      const results = await runScreener((done, total, symbol) => {
        setProgress({ done, total, symbol });
      });
      if (results.length === 0) {
        throw new Error("Binance scan returned no results — will retry on the next scan/refresh.");
      }
      setAllResults(results);
      setFiltered(results.filter((r) => passesPattern(r, activeSignalRef.current)));
      setStatus("done");
      markScannedToday();
      // FIX (CoinDCX/Delta/Binance stuck at 0 after a quota-exceeded write):
      // saveCachedResults() swallows a failed localStorage write and returns
      // false instead of throwing. markScannedForSource() must only record
      // "today's scan is done" when the result cache actually persisted —
      // otherwise a source whose write silently failed (most likely CoinDCX,
      // being the largest/last payload) looks "already scanned today" on the
      // next reload even though its results were never saved, permanently
      // blocking the auto-rescan that would otherwise fix it.
      const binanceSaved = saveCachedResults(STORAGE_KEY_BINANCE, results);
      if (binanceSaved) markScannedForSource("binance");
      setBinanceScannedAt(Date.now());
      setNextScanUtc(getNextScanIST());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    } finally {
      scanRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doDeltaScan = useCallback(async (switchTab: boolean = true) => {
    if (deltaScanRef.current) return;
    deltaScanRef.current = true;
    upexRunRef.current += 1;
    previousConsolidateARunRef.current += 1;
    previousUpexRunRef.current += 1;
    previous15MTCRunRef.current += 1;
    previous15MMomentumRunRef.current += 1;
    setUpexFilter(false);
    setUpexIncludedSymbols(new Set());
    setPreviousConsolidateAFilter(false);
    setPreviousConsolidateAMessage("");
    setPreviousUpexFilter(false);
    setPrevious15MTCFilter(false);
    setPrevious15MMomentumFilter(false);
    setPreviousUpexProgress(null);
    setPreviousUpexReady(false);
    setPrevious15MTCProgress(null);
    setPrevious15MMomentumProgress(null);
    setPrevious15MTCReady(false);
    setPrevious15MMomentumReady(false);
    setPrevious15MTCIncludedSymbols(new Set());
    setPrevious15MMomentumIncludedSymbols(new Set());
    setUpexProgress(null);
    setUpexMessage("");
    setPrevious15MTCMessage("");
    setPrevious15MMomentumMessage("");
    setDeltaStatus("scanning");
    if (switchTab) setActiveTab("delta");
    setDeltaAllResults([]);
    setDeltaFiltered([]);
    setDeltaError("");
    setDeltaProgress({ done: 0, total: 0, symbol: "" });
    try {
      const results = await runDeltaScreener((done, total, symbol) => {
        setDeltaProgress({ done, total, symbol });
      });
      if (results.length === 0) {
        throw new Error("Delta scan returned no results — will retry on the next scan/refresh.");
      }
      setDeltaAllResults(results);
      setDeltaFiltered(results.filter((r) => passesPattern(r, activeSignalRef.current)));
      setDeltaStatus("done");
      // See the matching comment in doScan above — only mark "scanned today"
      // when the cache write actually succeeded.
      const deltaSaved = saveCachedResults(STORAGE_KEY_DELTA, results);
      if (deltaSaved) markScannedForSource("delta");
      setDeltaScannedAt(Date.now());
    } catch (e) {
      setDeltaError(e instanceof Error ? e.message : "Unknown error");
      setDeltaStatus("error");
    } finally {
      deltaScanRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doCoinDCXScan = useCallback(async (switchTab: boolean = true) => {
    // Paused: this single guard stops every entry point (auto-scan, hard
    // refresh, "Scan Now", and the Scan CoinDCX button).
    if (!COINDCX_ENABLED) return;
    if (coindcxScanRef.current) return;
    coindcxScanRef.current = true;
    upexRunRef.current += 1;
    setUpexFilter(false);
    setUpexIncludedSymbols(new Set());
    setPreviousConsolidateAFilter(false);
    setPreviousConsolidateAMessage("");
    setPreviousUpexFilter(false);
    setPrevious15MTCFilter(false);
    setPrevious15MMomentumFilter(false);
    setUpexProgress(null);
    setUpexMessage("");
    setPrevious15MTCMessage("");
    setPrevious15MMomentumMessage("");
    setCoinDCXStatus("scanning");
    if (switchTab) setActiveTab("coindcx");
    // Keep the last successful CoinDCX result visible while the next scan
    // runs, so a slow or partially rate-limited refresh never looks empty.
    const previousCoinDCXResults = coindcxAllResultsRef.current;
    setCoinDCXAllResults(previousCoinDCXResults);
    setCoinDCXFiltered(previousCoinDCXResults.filter((r) => passesPattern(r, activeSignalRef.current)));
    setCoinDCXError("");
    setCoinDCXProgress({ done: 0, total: 0, symbol: "" });
    try {
      const results = await runCoinDCXScreener((done, total, symbol) => {
        setCoinDCXProgress({ done, total, symbol });
      });
      if (results.length === 0) {
        throw new Error("CoinDCX scan returned no results — will retry on the next scan/refresh.");
      }
      setCoinDCXAllResults(results);
      setCoinDCXFiltered(results.filter((r) => passesPattern(r, activeSignalRef.current)));
      setCoinDCXStatus("done");
      // See the matching comment in doScan above. CoinDCX is the exchange
      // most likely to hit this: its cache write runs last of the three and
      // is often the one that overflows localStorage's per-origin quota
      // after Binance/Delta have already written theirs — without this
      // guard, that failed write got treated as "scanned today" anyway,
      // leaving CoinDCX stuck at 0 results until the marker expired the
      // next IST day, even though the scan itself succeeded.
      const coindcxSaved = saveCachedResults(STORAGE_KEY_COINDCX, results);
      if (coindcxSaved) markScannedForSource("coindcx");
      setCoinDCXScannedAt(Date.now());
    } catch (e) {
      setCoinDCXError(e instanceof Error ? e.message : "Unknown error");
      setCoinDCXStatus("error");
    } finally {
      coindcxScanRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const autoScanRanRef = useRef(false);
  useEffect(() => {
    if (autoScanRanRef.current) return;
    autoScanRanRef.current = true;
    if (shouldAutoScanForCache(cachedBinance, "binance")) void doScan();
    if (shouldAutoScanForCache(cachedDelta, "delta")) void doDeltaScan(false);
    if (shouldAutoScanForCache(cachedCoinDCX, "coindcx")) void doCoinDCXScan(false);
  }, [cachedBinance, cachedDelta, cachedCoinDCX, doScan, doDeltaScan, doCoinDCXScan]);

  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (scanKey > 0) {
      if (isFirstMountRef.current) {
        isFirstMountRef.current = false;
        // Each exchange decides independently from its own cache date.
        // Binance having scanned must not suppress CoinDCX or Delta.
        // isScanFreshForSource falls back to the lightweight per-source
        // "scanned today" marker when the full result cache didn't
        // persist (e.g. CoinDCX's larger payload hitting localStorage's
        // quota after Binance/Delta already wrote theirs) — so a source
        // that genuinely already scanned today doesn't rescan on every
        // hard refresh just because its bulky cache write failed.
        if (!isScanFreshForSource("binance", cachedBinance)) void doScan();
        if (!isScanFreshForSource("delta", cachedDelta)) void doDeltaScan(false);
        if (!isScanFreshForSource("coindcx", cachedCoinDCX)) void doCoinDCXScan(false);
        return;
      }
      // Explicit click from Header "Scan Now" button
      doScan();
      doDeltaScan(false);
      doCoinDCXScan(false);
    }
  }, [scanKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = () => setCountdown(formatCountdown(nextScanUtc));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextScanUtc]);

  useBinanceLiveRefresh(status, allResultsRef, setAllResults, setFiltered);
  useDeltaLiveRefresh(deltaStatus, deltaAllResultsRef, setDeltaAllResults, setDeltaFiltered);
  useCoinDCXLiveRefresh(coindcxStatus, coindcxAllResultsRef, setCoinDCXAllResults, setCoinDCXFiltered);

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

  // Screener → Sidebar: when the currently-selected View's Screener button is
  // closed with its ✕, tell the left-nav to deselect the same View (falls back
  // to its parent category). Only fires on a true → false transition so the
  // sync effect above never triggers it.
  const activeSignalOn = VIEW_SETTERS[activeSignal]
    ? !!VIEW_STATES[activeSignal]
    : activeGenericSignal === activeSignal;
  const prevActiveSignalOnRef = useRef(false);
  useEffect(() => {
    const wasOn = prevActiveSignalOnRef.current;
    prevActiveSignalOnRef.current = activeSignalOn;
    if (isSignalLeaf && wasOn && !activeSignalOn) requestSignalDeselect(activeSignal);
  }, [activeSignalOn, isSignalLeaf, activeSignal]);
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
    const pool: CPRResult[] =
      activeTab === "delta" ? deltaAllResults
      : activeTab === "coindcx" ? coindcxAllResults
      : activeTab === "combined" ? [...allResults, ...deltaAllResults, ...coindcxAllResults]
      : allResults;
    if (pool.length === 0) return;
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
  }, [allResults, deltaAllResults, coindcxAllResults, activeTab, onCounts]);

  // NEW: per-view matching counts for the Views filter buttons rendered in
  // this screen ("(41)" suffix), computed off the same unfiltered pool used
  // for the left-nav counts so both always agree.
  const touchCounts = useMemo(() => {
    const pool: CPRResult[] =
      activeTab === "delta" ? deltaAllResults
      : activeTab === "coindcx" ? coindcxAllResults
      : activeTab === "combined" ? [...allResults, ...deltaAllResults, ...coindcxAllResults]
      : allResults;
    return {
      insidecpr: pool.filter((r) => r.touchCategory && !!(r.InsideCPR || (r as any).insideCPR)).length,
      outcpr: pool.filter((r) => r.touchCategory && !!r.outCPR).length,
      OVA: pool.filter((r) => r.touchCategory && !!r.overlapHigher).length,
      overlapLower: pool.filter((r) => r.touchCategory && !!r.overlapLower).length,
      equalCPR: pool.filter((r) => r.touchCategory && !!r.equalCPR).length,
      // Counts for the three extra filters that live in the TOUCH row. They
      // use the same predicates as the filters themselves, over the full pool.
      s1r1in: pool.filter(matchesS1R1In).length,
      pdhgtu1: pool.filter((r) => r.todayCPR.prevHigh > r.todayCPR.r1).length,
      pdlltl1: pool.filter((r) => r.todayCPR.prevLow < r.todayCPR.s1).length,
    };
  }, [allResults, deltaAllResults, coindcxAllResults, activeTab]);

  const viewCounts = useMemo(() => {
    const pool: CPRResult[] =
      activeTab === "delta" ? deltaAllResults
      : activeTab === "coindcx" ? coindcxAllResults
      : activeTab === "combined" ? [...allResults, ...deltaAllResults, ...coindcxAllResults]
      : allResults;
    const map: Record<string, number> = {};
    if (pool.length === 0) return map;
    const ids = new Set<string>();
    for (const p of pivotcategories) ids.add(p.id);
    for (const subs of Object.values(Views)) for (const s of subs) ids.add(s.id);
    for (const extra of EXTRA_VIEW_COUNT_IDS) ids.add(extra);
    for (const id of ids) map[id] = pool.filter((r) => passesPattern(r, id)).length;
    return map;
  }, [allResults, deltaAllResults, coindcxAllResults, activeTab]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
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

  const combinedResults: CPRResultWithSource[] = [
    ...filtered.map((r) => ({ ...r, source: "binance" as const })),
    ...deltaFiltered.map((r) => ({ ...r, source: "delta" as const })),
    ...coindcxFiltered.map((r) => ({ ...r, source: "coindcx" as const })),
  ];
  const combinedAllResults: CPRResultWithSource[] = [
    ...allResults.map((r) => ({ ...r, source: "binance" as const })),
    ...deltaAllResults.map((r) => ({ ...r, source: "delta" as const })),
    ...coindcxAllResults.map((r) => ({ ...r, source: "coindcx" as const })),
  ];

  // Shared "pattern ∩ source" pool used by every sub-filter branch in
  // getActivePool below (previously copy-pasted per branch for Binance/Delta).
  const intersectPool = (patternId: string): CPRResultWithSource[] => {
    const pick = (rows: CPRResult[], source: SourceId): CPRResultWithSource[] =>
      rows.filter((r) => passesPattern(r, patternId)).map((r) => ({ ...r, source }));
    const b = pick(allResults, "binance");
    const d = pick(deltaAllResults, "delta");
    const c = pick(coindcxAllResults, "coindcx");
    if (activeTab === "combined") return [...b, ...d, ...c];
    if (activeTab === "delta") return d;
    if (activeTab === "coindcx") return c;
    return b;
  };

  const getActivePool = (): CPRResultWithSource[] => {
    // NEW: generic Views (sub-pattern) pool — covers every category in
    // GENERIC_VIEW_CATEGORIES. passesPattern(r, id) already resolves any
    // sub-pattern id generically (same lookup used for the left-nav counts
    // above), so this one branch replaces what would otherwise be a
    // separate hand-written pool block per sub-pattern.
    if (activeGenericSignal && GENERIC_VIEW_CATEGORIES.has(activeSectionKey)) {
      return intersectPool(activeGenericSignal);
    }
    if (activeTab === "combined") return showAll ? combinedAllResults : combinedResults;
    if (activeTab === "delta") return (showAll ? deltaAllResults : deltaFiltered).map((r) => ({ ...r, source: "delta" as const }));
    if (activeTab === "coindcx") return (showAll ? coindcxAllResults : coindcxFiltered).map((r) => ({ ...r, source: "coindcx" as const }));
    return (showAll ? allResults : filtered).map((r) => ({ ...r, source: "binance" as const }));
  };

  const previousConsolidateAIncludedCount = getActivePool().filter(
    (row) =>
      row.source !== "coindcx" &&
      previousConsolidateAIncludedSymbols.has(`${row.source}:${row.symbol}`),
  ).length;

  const previousUpexIncludedCount = getActivePool().filter(
    (row) =>
      row.source !== "coindcx" &&
      previousUpexIncludedSymbols.has(`${row.source}:${row.symbol}`) &&
      // MOMENTUM-A never includes symbols that are CONSOLIDATE-A.
      !previousConsolidateAIncludedSymbols.has(`${row.source}:${row.symbol}`),
  ).length;
  const previous15MTCIncludedCount = getActivePool().filter(
    (row) =>
      row.source !== "coindcx" &&
      previous15MTCIncludedSymbols.has(`${row.source}:${row.symbol}`),
  ).length;
  const previous15MMomentumIncludedCount = getActivePool().filter(
    (row) =>
      row.source !== "coindcx" &&
      previous15MMomentumIncludedSymbols.has(`${row.source}:${row.symbol}`) &&
      // MOMENTUM-B never includes symbols that are CONSOLIDATE-B.
      !previous15MTCIncludedSymbols.has(`${row.source}:${row.symbol}`),
  ).length;

  const handleUpexFilter = async () => {
    if (upexProgress) return;
    if (upexFilter) {
      setUpexFilter(false);
      setUpexIncludedSymbols(new Set());
      setUpexMessage("");
      return;
    }

    const candidates = Array.from(
      new Map(
        getActivePool()
          .filter(
            (row): row is CPRResultWithSource & { source: "binance" | "delta" } =>
              row.source !== "coindcx"
          )
          .map((row) => [
            `${row.source}:${row.symbol}`,
            {
              symbol: row.symbol,
              source: row.source,
              bc: getUpexBc(row.todayCPR.bc, row.prevCPR.bc, row.overlapHigher),
            },
          ])
      ).values()
    );
    if (candidates.length === 0) {
      setUpexMessage(
        activeTab === "coindcx"
          ? "15M-A checks Binance and Delta only; CoinDCX results are not filtered."
          : "Run a Binance or Delta Screener scan before applying 15M-A."
      );
      return;
    }

    const runId = ++upexRunRef.current;
    setUpexMessage("");
    setUpexProgress({ done: 0, total: candidates.length, filter: "15M-A" });
    try {
      const { included, unavailable } = await findUpexSymbols(
        candidates,
        (done, total) => {
          if (runId === upexRunRef.current) setUpexProgress({ done, total, filter: "15M-A" });
        }
      );
      if (runId !== upexRunRef.current) return;
      setUpexIncludedSymbols(included);
      setUpexFilter(true);
      setUpexMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from 15M-A because completed 15m candle data was unavailable.`
          : ""
      );
    } catch (cause) {
      if (runId === upexRunRef.current) {
        setUpexMessage(
          cause instanceof Error ? `15M-A scan failed: ${cause.message}` : "15M-A scan failed."
        );
      }
    } finally {
      if (runId === upexRunRef.current) setUpexProgress(null);
    }
  };

  // Search box matches EITHER the symbol OR the name of any View the row
  // currently satisfies (the same names shown in the table's VIEW column,
  // via getMatchingSignals). Typing part of a View name — e.g. "EU3L4" —
  // keeps only the rows that match a View whose label/id contains it.
  const searchQuery = search.trim().toLowerCase();
  const matchesSearch = (r: CPRResultWithSource): boolean => {
    if (!searchQuery) return true;
    if (r.symbol.toLowerCase().includes(searchQuery)) return true;
    return getMatchingSignals(r).some(
      (v) =>
        v.label.toLowerCase().includes(searchQuery) ||
        v.id.toLowerCase().includes(searchQuery),
    );
  };

  const displayed = getActivePool()
    .filter(matchesSearch)
    .filter((r) => {
      if (breakoutMode === "off") return true;
      if (breakoutMode === "brk") return !!r.breakout?.signal;
      return !!r.breakout?.squeezeNow && !r.breakout?.signal;
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
      if (!r.touchCategory) return false;
      if (touchFilter === "insidecpr") return !!(r.InsideCPR || (r as any).insideCPR);
      if (touchFilter === "outcpr") return !!r.outCPR;
      if (touchFilter === "OVA") return !!r.overlapHigher;
      if (touchFilter === "overlapLower") return !!r.overlapLower;
      if (touchFilter === "equal-cpr") return !!r.equalCPR;
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
      if (pdhPdlFilter === "above") return passesPattern(r, "Price-AbovePDH");
      if (pdhPdlFilter === "below") return passesPattern(r, "Price-BelowPDL");
      if (pdhPdlFilter === "abovepu4") return r.currentPrice > r.prevCPR.r4;
      if (pdhPdlFilter === "belowpl4") return r.currentPrice < r.prevCPR.s4;
      return true;
    })
    .filter(
      (r) =>
        !upexFilter ||
        r.source === "coindcx" ||
        upexIncludedSymbols.has(`${r.source}:${r.symbol}`)
    )
    .filter(
      (r) =>
        !previousConsolidateAFilter ||
        r.source === "coindcx" ||
        previousConsolidateAIncludedSymbols.has(`${r.source}:${r.symbol}`)
    )
    .filter(
      (r) =>
        !previousUpexFilter ||
        r.source === "coindcx" ||
        // MOMENTUM-A excludes CONSOLIDATE-A symbols.
        (previousUpexIncludedSymbols.has(`${r.source}:${r.symbol}`) &&
          !previousConsolidateAIncludedSymbols.has(`${r.source}:${r.symbol}`))
    )
    .filter(
      (r) =>
        !previous15MTCFilter ||
        previous15MTCIncludedSymbols.has(`${r.source}:${r.symbol}`)
    )
    .filter(
      (r) =>
        !previous15MMomentumFilter ||
        // MOMENTUM-B excludes CONSOLIDATE-B symbols.
        (previous15MMomentumIncludedSymbols.has(`${r.source}:${r.symbol}`) &&
          !previous15MTCIncludedSymbols.has(`${r.source}:${r.symbol}`))
    )
    // Active / Ready status filter (see getRowStatus).
    .filter((r) => {
      if (statusFilter === "all") return true;
      const st = getRowStatus(r);
      return statusFilter === "active" ? st.active : st.ready;
    })
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

  // Signal Desk consumes this pool directly, NOT `displayed`. `displayed`
  // is scoped to whichever tab (Binance/Delta/Combined) happens to be
  // active on the Live Screener right now, via getActivePool()'s
  // activeTab checks — that's the right pool for the Screener table, but
  // Signal Desk has its own independent Binance/Delta/All source toggle,
  // and needs the FULL combined universe available at all times so that
  // toggle actually has data to filter into. Using `displayed` here meant
  // the Delta tab in Signal Desk showed nothing whenever the Live
  // Screener's own tab happened to be sitting on "binance".
  // change24h is passed straight through so SignalDeskSymbol's optional
  // 24h-change badge has data to render. direction drives SignalDesk's
  // long/short header icon — see getRowDirection in ScreenerUtils.tsx.
  const signalSymbols = combinedAllResults.map((r) => ({
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
  }));
  const signalSymbolsKey = signalSymbols
    .map((r) => `${r.key}:${r.currentPrice}:${r.change24h}:${r.direction}`)
    .join("|");

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
    // which is a brand-new array literal every render) — those state values
    // only get a new identity when a scan actually completes (setAllResults /
    // setDeltaAllResults), so this only fires on real new data, not on every
    // tab switch or filter click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onResults, allResults, deltaAllResults, coindcxAllResults]);

  const currentStatus =
    activeTab === "binance" ? status
    : activeTab === "delta" ? deltaStatus
    : activeTab === "coindcx" ? coindcxStatus
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
    : filtered.length;

  const currentAllCount =
    activeTab === "combined" ? combinedAllResults.length
    : activeTab === "delta" ? deltaAllResults.length
    : activeTab === "coindcx" ? coindcxAllResults.length
    : allResults.length;

  const currentError =
    activeTab === "delta" ? deltaError
    : activeTab === "coindcx" ? coindcxError
    : error;
  const canShowCombined = status === "done" || deltaStatus === "done" || coindcxStatus === "done";

  // Helper: is any sub-filter active (to decide the result count label)
  const anySubFilter =
    !!activeGenericSignal ||
    !!PatternFilter || !!touchFilter || !!prevWidthFilter || !!todayWidthFilter || !!pdhPdlFilter || upexFilter || previousConsolidateAFilter || previousUpexFilter || previous15MTCFilter || previous15MMomentumFilter || statusFilter !== "all" || !!entryLevelFilter;

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
              <div className="rounded-lg border border-border bg-card px-3 py-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Delta
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

          <div className="flex flex-col items-end gap-1.5">
            <LiveClock />
            {currentStatus === "done" && activeScannedAt && (
              <div
                className="flex flex-col items-end gap-0.5 shrink-0 text-[11px] leading-tight text-emerald-300/90 whitespace-nowrap"
                title="Time of the last completed scan feeding this view"
              >
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>
                    Scanned{" "}
                    {(activeTab === "binance"
                      ? "Binance"
                      : activeTab === "delta"
                      ? "Delta"
                      : activeTab === "coindcx"
                      ? "CoinDCX"
                      : "")}
                  </span>
                </span>
                <span>
                  @ {formatScanTime(activeScannedAt)} ({formatScanDate(activeScannedAt)})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Legend — hidden while idle (initial load/refresh, before the
            first scan resolves), while a scan is in progress, AND whenever
            no left-nav category is selected (showAll true, i.e. "All
            scanned"/no filter), so the three empty legend cards don't
            render with nothing to show. */}
        {currentStatus === "done" && !showAll && (
        <ScreenerLegend
          activeSignal={activeSignal}
        />
        )}

        {/* Controls */}
        <div
          className={`flex flex-wrap items-center gap-2 ${
            currentStatus === "done" &&
            showAll &&
            (showTouchList || showPatternList || showSizeList || showPriceList || showCandleList || showEntryLevelList)
              ? "mb-2"
              : "mb-4"
          }`}
        >
          <button
            onClick={() => { void doScan(); }}
            disabled={status === "scanning"}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50 shrink-0"
            style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff" }}
          >
            <RefreshCw className={`w-3 h-3 ${status === "scanning" ? "animate-spin" : ""}`} />
            {status === "scanning" ? "Scanning Binance…" : "Scan Binance"}
          </button>

          <button
            onClick={() => { void doDeltaScan(); }}
            disabled={deltaStatus === "scanning"}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50 shrink-0"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", color: "#fff" }}
          >
            <RefreshCw className={`w-3 h-3 ${deltaStatus === "scanning" ? "animate-spin" : ""}`} />
            {deltaStatus === "scanning" ? "Scanning Delta…" : "Scan Delta"}
          </button>

          <button
            onClick={() => { void doCoinDCXScan(); }}
            disabled={!COINDCX_ENABLED || coindcxStatus === "scanning"}
            title={COINDCX_ENABLED ? undefined : "CoinDCX scanning is paused"}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
              COINDCX_ENABLED ? "disabled:opacity-50" : "opacity-40 cursor-not-allowed"
            }`}
            style={
              COINDCX_ENABLED
                ? { background: "linear-gradient(135deg,#10b981,#047857)", color: "#fff" }
                : { background: "#334155", color: "#94a3b8" }
            }
          >
            <RefreshCw className={`w-3 h-3 ${coindcxStatus === "scanning" ? "animate-spin" : ""}`} />
            {coindcxStatus === "scanning" ? "Scanning CoinDCX…" : "Scan CoinDCX"}
          </button>

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
                onClick={() =>
                  setBreakoutMode((m) => (m === "off" ? "brk" : m === "brk" ? "sqz" : "off"))
                }
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border transition-colors shrink-0 ${
                  breakoutMode === "off"
                    ? "border-border text-muted-foreground hover:text-foreground"
                    : "border-amber-500/60 bg-amber-500/15 text-amber-300"
                }`}
                title="15m breakout filter: click to cycle Off → BRK (fresh squeeze breakouts, high rel. volume) → SQZ (coiling now)"
              >
                {breakoutMode === "off" ? "Breakout" : breakoutMode === "brk" ? "BRK" : "SQZ"}
                {breakoutMode !== "off" && (
                  <span className="font-mono">
                    {" "}
                    {
                      getActivePool().filter((r) =>
                        breakoutMode === "brk"
                          ? !!r.breakout?.signal
                          : !!r.breakout?.squeezeNow && !r.breakout?.signal
                      ).length
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
                title={showTouchList ? "Hide touch patterns" : "Show touch patterns"}
              >
                <span className="leading-none">{showTouchList ? "−" : "+"}</span>
                Touch
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
          (!showAll || showTouchList || showPatternList || showSizeList || showEntryLevelList || showPriceList || showCandleList) && (
          <div className="flex flex-col gap-2 mb-3">
          {/* Signals row is empty while Show All is on — don't render it, or
              its zero-height box still adds a flex gap above the panels. */}
          {!showAll && (
          <div className="flex items-center gap-2 flex-wrap">
            {!showAll && (
            <span className="text-[10px] text-pink-400/90 uppercase tracking-wider mr-0.5 font-semibold">SIGNALS:</span>
            )}

            {/* Generic View buttons are derived from the registry-backed
                navigation map, so new registered Views work automatically. */}
            {GENERIC_VIEW_CATEGORIES.has(activeSectionKey) &&
              !showAll &&
              (Views[activeSectionKey] ?? []).map((sub) => {
                const isActive = activeGenericSignal
                  ? activeGenericSignal === sub.id
                  : activeSignal === sub.id; // left-nav navigated straight to this leaf
                const borderColor = sub.activeColor ?? "var(--foreground)";
                const textColor = sub.activeText ?? "var(--foreground)";
                const bg = sub.activeBg;
                return (
                  <button
                    key={sub.id}
                    onClick={() => setActiveGenericSignal((v) => (v === sub.id ? null : sub.id))}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      isActive ? "" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    style={isActive ? { borderColor, color: textColor, backgroundColor: bg } : undefined}
                    title={`Show only rows matching ${sub.label}`}
                  >
                    {isActive ? `✕ ${sub.label}` : sub.label}
                    <ViewCount id={sub.id} counts={viewCounts} />
                  </button>
                );
              })}
          </div>
          )}

          {/* Pattern filter buttons — own line, independent of activeSignal
              AND independent of showAll. These always render, regardless of Show All state, and
              are mutually exclusive within their own group. */}
          {showTouchList && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-pink-400/90 uppercase tracking-wider mr-0.5 font-semibold">TOUCH:</span>
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
                    title={`Show only rows matching ${label}`}
                  >
                    {isActive ? `✕ ${label}` : label}
                    <span className="text-[11px] font-mono text-muted-foreground ml-1">({count})</span>
                  </button>
                );
              })}
              {/* Moved here from the search/source bar: S1-R1 IN, PDHL-A and
                  PDHL-B. Still driven by pdhPdlFilter (same state, same
                  mutual-exclusivity with >PDH/<PDL/>PU4/<PL4), only the
                  location and pill styling changed to match the Touch row. */}
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

          {/* CPR Size filter buttons — 8-tier Micro→Ultra ladder (today's CPR)
              followed by the p-prefixed previous-day variants. Order per spec:
              pMicro-pTiny-pMini-pSmall-pMedium-pLarge-pMega-pUltra, then
              Micro-Tiny-Mini-Small-Medium-Large-Mega-Ultra. Mutually exclusive
              within the whole row (single widthFilter state), independent of
              activeSignal and showAll. */}
          {/* CPR Size — prev day's width (pMicro..pUltra). Own row, own state
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
                  { key: "mega",   label: "pMega",   range: "5.00–10.00%",    active: "border-fuchsia-400 text-fuchsia-400" },
                  { key: "ultra",  label: "pUltra",  range: ">10.00%",        active: "border-rose-400 text-rose-400" },
                ] as { key: WidthCategoryKey; label: string; range: string; active: string }[]
              ).map(({ key, label, range, active }) => (
                <button
                  key={key}
                  onClick={() => setPrevWidthFilter((v) => (v === key ? null : key))}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    prevWidthFilter === key
                      ? active
                      : "border-border text-muted-foreground hover:text-foreground"
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
                  { key: "mega",    label: "Mega",    range: "5.00–10.00%",    active: "border-fuchsia-400 text-fuchsia-400" },
                  { key: "ultra",   label: "Ultra",   range: ">10.00%",        active: "border-rose-400 text-rose-400" },
                ] as { key: WidthCategoryKey; label: string; range: string; active: string }[]
              ).map(({ key, label, range, active }) => (
                <button
                  key={key}
                  onClick={() => setTodayWidthFilter((v) => (v === key ? null : key))}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    todayWidthFilter === key
                      ? active
                      : "border-border text-muted-foreground hover:text-foreground"
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
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-cyan-400/90 uppercase tracking-wider mr-1 font-semibold">
              Previous session candle:
            </span>
            <button
              onClick={() => {
                if (!previousConsolidateAReady) return;
                const next = !previousConsolidateAFilter;
                setPreviousConsolidateAFilter(next);
                setPreviousConsolidateAMessage("");
                if (next) {
                  setPreviousUpexFilter(false);
                  setPrevious15MTCFilter(false);
                  setPrevious15MMomentumFilter(false);
                }
              }}
              disabled={!previousConsolidateAReady || currentAllCount === 0 || activeTab === "coindcx"}
              className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                previousConsolidateAFilter
                  ? "bg-foreground/15 text-foreground border-[#22354a] font-bold"
                  : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
              title="Include Binance and Delta symbols unless a completed previous-session 15-minute candle (a) has its whole body below previous day's BC while making a new low versus earlier candles, or (b) has its whole body above the higher of previous day's PH and R1. Unevaluated sources such as CoinDCX are excluded while active."
            >
              {previousConsolidateAProgress
                ? `P-CONSOLIDATE-A ${previousConsolidateAProgress.done}/${previousConsolidateAProgress.total}`
                : previousConsolidateAReady
                  ? `P-CONSOLIDATE-A (${previousConsolidateAIncludedCount})`
                  : "P-CONSOLIDATE-A…"}
            </button>
            <button
              onClick={() => {
                if (!previousUpexReady) return;
                const next = !previousUpexFilter;
                setPreviousUpexFilter(next);
                setUpexMessage("");
                if (next) {
                  setPreviousConsolidateAFilter(false);
                  setPrevious15MTCFilter(false);
                  setPrevious15MMomentumFilter(false);
                }
              }}
              disabled={!previousUpexReady || currentAllCount === 0 || activeTab === "coindcx"}
              className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                previousUpexFilter
                  ? "bg-foreground/15 text-foreground border-[#22354a] font-bold"
                  : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
              title="For Binance and Delta, exclude a symbol only when a previous-session 15-minute candle body is below previous day's BC and its lower body edge breaks below earlier session wick lows. Prepared once after exchange scan data loads; toggling reuses the cached result."
            >
              {previousUpexProgress
                ? `P-MOMENTUM-A ${previousUpexProgress.done}/${previousUpexProgress.total}`
                : previousUpexReady
                  ? `P-MOMENTUM-A (${previousUpexIncludedCount})`
                  : "P-MOMENTUM-A…"}
            </button>
            <button
              onClick={() => {
                if (!previous15MTCReady) return;
                const next = !previous15MTCFilter;
                setPrevious15MTCFilter(next);
                setPrevious15MTCMessage("");
                if (next) {
                  setPreviousConsolidateAFilter(false);
                  setPreviousUpexFilter(false);
                  setPrevious15MMomentumFilter(false);
                }
              }}
              disabled={!previous15MTCReady || currentAllCount === 0 || activeTab === "coindcx"}
              className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                previous15MTCFilter
                  ? "bg-foreground/15 text-foreground border-[#22354a] font-bold"
                  : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
              title="Include Binance and Delta symbols unless a completed previous-session 15-minute candle (a) has its whole body above previous day's TC while making a new high versus earlier candles, or (b) has its whole body below the lower of previous day's PL and S1. Unevaluated sources such as CoinDCX are excluded while active."
            >
              {previous15MTCProgress
                ? `P-CONSOLIDATE-B ${previous15MTCProgress.done}/${previous15MTCProgress.total}`
                : previous15MTCReady
                  ? `P-CONSOLIDATE-B (${previous15MTCIncludedCount})`
                  : "P-CONSOLIDATE-B…"}
            </button>
            <button
              onClick={() => {
                if (!previous15MMomentumReady) return;
                const next = !previous15MMomentumFilter;
                setPrevious15MMomentumFilter(next);
                setPrevious15MMomentumMessage("");
                if (next) {
                  setPreviousConsolidateAFilter(false);
                  setPreviousUpexFilter(false);
                  setPrevious15MTCFilter(false);
                }
              }}
              disabled={!previous15MMomentumReady || currentAllCount === 0 || activeTab === "coindcx"}
              className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                previous15MMomentumFilter
                  ? "bg-foreground/15 text-foreground border-[#22354a] font-bold"
                  : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
              title="Same as CONSOLIDATE-B but without the PL/S1 check: include Binance and Delta symbols unless a completed previous-session 15-minute candle has its whole body above previous day's TC while making a new high versus earlier candles. Unevaluated sources such as CoinDCX are excluded while active."
            >
              {previous15MMomentumProgress
                ? `P-MOMENTUM-B ${previous15MMomentumProgress.done}/${previous15MMomentumProgress.total}`
                : previous15MMomentumReady
                  ? `P-MOMENTUM-B (${previous15MMomentumIncludedCount})`
                  : "P-MOMENTUM-B…"}
            </button>
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

        {(previousConsolidateAMessage || upexMessage || previous15MTCMessage || previous15MMomentumMessage) && currentStatus === "done" && (
          <div className="flex flex-col gap-1 px-1 -mt-1 mb-2 text-[10px] text-amber-300" role="status">
            {previousConsolidateAMessage && <span>{previousConsolidateAMessage}</span>}
            {upexMessage && <span>{upexMessage}</span>}
            {previous15MTCMessage && <span>{previous15MTCMessage}</span>}
            {previous15MMomentumMessage && <span>{previous15MMomentumMessage}</span>}
          </div>
        )}

        {/* Search + Source Filter bar — same look and feel as Signal
            Desk's filter bar (search left, source toggle right, same
            colors/borders/pill shapes). Sits directly above the grid.
            "Combined" is relabeled "All" here to match Signal Desk's own
            wording, though the underlying activeTab value is unchanged
            ("combined") — see ActiveTab in ScreenerUtils.tsx. */}
        {currentStatus === "done" && (
          <div className="px-4 py-2 border-b border-[#1b263b] bg-[#0d1422] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 mb-3 rounded-lg border">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                placeholder="Search symbol or view…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#151e2c] border border-[#22354a] rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500/50"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
              {/* 15M-A filter */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => void handleUpexFilter()}
                  disabled={!!upexProgress || currentAllCount === 0 || activeTab === "coindcx"}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                    upexFilter
                      ? "border-cyan-400 text-cyan-300"
                      : "border-[#22354a] text-slate-400 hover:text-white bg-[#151e2c]"
                  }`}
                  title="For Binance and Delta, exclude a symbol only when a completed 15-minute candle body is below the reference BC and its lower body edge breaks below earlier session wick lows since 05:30 IST. Overlap Above today uses previous day's BC; all other rows use today's BC. CoinDCX results are not checked or filtered."
                >
                  {upexProgress?.filter === "15M-A"
                    ? `15M-A ${upexProgress.done}/${upexProgress.total}`
                    : upexFilter
                      ? `✕ 15M-A (${upexIncludedSymbols.size})`
                      : "15M-A"}
                </button>
              </div>
              {/* Status Filter — Active (price has reached a View's entry line) /
                  Ready (matches a View, still waiting for entry). Same grouped
                  tab control as Signal Desk; clicking the selected button
                  clears it back to "all". */}
              <div className="flex gap-0.5 p-0.5 rounded-md border border-[#22354a] bg-[#151e2c] mr-3">
                <button
                  onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    statusFilter === "active"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : "text-emerald-400/70 hover:text-emerald-300 border border-transparent"
                  }`}
                  title="Rows with a View whose entry line price has already reached"
                >
                  Active
                </button>
                <button
                  onClick={() => setStatusFilter(statusFilter === "ready" ? "all" : "ready")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    statusFilter === "ready"
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      : "text-amber-400/70 hover:text-amber-300 border border-transparent"
                  }`}
                  title="Rows with a View that matches but price hasn't reached its entry line yet"
                >
                  Ready
                </button>
              </div>

              {/* Exchange / Source Filter — grouped tab control (same as Signal
                  Desk). All fuchsia, Binance indigo, Delta cyan, CoinDCX green.
                  "All" is the existing "combined" activeTab value. */}
              {canShowCombined && (
                <div className="flex gap-0.5 p-0.5 rounded-md border border-[#22354a] bg-[#151e2c]">
                  {(["combined", "binance", "delta", "coindcx"] as ActiveTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      disabled={tab === "coindcx" && !COINDCX_ENABLED}
                      title={tab === "coindcx" && !COINDCX_ENABLED ? "CoinDCX scanning is paused" : undefined}
                      className={`px-3 py-1 rounded text-xs font-semibold transition border ${
                        tab === "coindcx" && !COINDCX_ENABLED
                          ? "opacity-30 cursor-not-allowed text-slate-500 border-transparent"
                          : "cursor-pointer"
                      } ${
                        activeTab === tab
                          ? tab === "delta"
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50"
                            : tab === "binance"
                            ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50"
                            : tab === "coindcx"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                            : "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/50"
                          : "text-slate-400 hover:text-slate-200 border-transparent"
                      }`}
                    >
                      {tab === "combined" ? "All" : tab === "binance" ? "Binance" : tab === "coindcx" ? "CoinDCX" : "Delta"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        {currentStatus !== "idle" && displayed.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <ScreenerTableHeader
                  canShowCombined={canShowCombined}
                  activeTab={activeTab}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  toggleSort={toggleSort}
                />
                <tbody className="divide-y divide-border">
                  {displayed.map((r) => {
                    const sym = splitSymbol(r.symbol, r.source);
                    // Include today's date so this rowKey lines up exactly
                    // with BacktestPanel's `${r.source}-${r.symbol}-${r.entryDate}`
                    // for today's row — otherwise a chart link attached
                    // here (Screener has no date dimension of its own, it's
                    // always "today") gets stored under a different
                    // Firestore doc than the one Backtest/SR Ladder looks
                    // up for that same symbol+date, and shows up as
                    // missing over there.
                    const rowKey = `${r.source}-${r.symbol}-${utcTodayISO()}`;
                    const isExpanded = expandedSymbols.has(rowKey);
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
                        isConsolidateA={previousConsolidateAIncludedSymbols.has(`${r.source}:${r.symbol}`)}
                        isConsolidateB={previous15MTCIncludedSymbols.has(`${r.source}:${r.symbol}`)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {currentStatus === "done" && displayed.length === 0 && (
          <NoSignalsPanel
            title="No active signals found matching current filters"
            subtitle="Try clearing filters or switching source exchanges"
          />
        )}

        {/* Footer legend — same idle/scanning hide as the Legend cards above,
            so it doesn't flash before the first scan resolves. */}
        {currentStatus === "done" && (
        <div className="mt-auto pt-8 text-xs text-muted-foreground text-center">
          Binance: top 500 USDT pairs · Delta Exchange: 195 perpetual futures · CoinDCX: USDT perpetual futures · CPR from completed UTC daily candles
          <br />
          Auto-scans once daily at 5:30 AM IST · PH/PL = Previous Day High/Low · Not financial advice · by Kriven Gokul
        </div>
        )}
      </div>
    </div>
  );
}
