import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { pivotcategories, Views, requestViewDeselect } from "@/lib/ViewsSidebar";
import {
  TrendingUp,
  RefreshCw,
  Search,
  ExternalLink,
  Bell,
  BellOff,
} from "lucide-react";
import { runScreener } from "@/lib/binance";
import { runDeltaScreener } from "@/lib/delta";
import type { CPRResult } from "@/lib/cpr";
import {
  shouldAutoScan,
  markScannedToday,
  hasScannedToday,
  getLastScanDate,
  getNextScanIST,
  formatCountdown,
  formatISTTime,
} from "@/lib/scheduler";
import {
  type SortKey,
  type SortDir,
  type ActiveTab,
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
  getPatternInfo,
  computePrevPattern,
  type PatternInfo,
  getViewDirection,
  getRowDirection,
} from "./ScreenerUtils";
import LiveClock from "./LiveClock";
import ScreenerLegend from "./ScreenerLegend";
import ScreenerTableRow, { ScreenerTableHeader } from "./ScreenerTableRow";
import { useBinanceLiveRefresh, useDeltaLiveRefresh } from "@/hooks/useLivePriceRefresh";

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
 * GENERIC_VIEW_CATEGORIES — left-nav categories whose Views (sub-patterns)
 * are rendered generically (see the "Generic Views" block in the JSX below
 * and the matching fallback in getActivePool), instead of each sub-pattern
 * getting its own hand-written useState + button + pool block like the
 * older hardcoded categories above it used to.
 *
 * Why: every new sub-pattern under those older categories needs a new
 * useState, a cleanup-effect entry, a getActivePool() branch, an
 * anySubFilter entry, AND a JSX button — five places to touch, and it's
 * easy to add a sub-pattern to ViewsSidebar's `Views` map and
 * forget one of them (exactly what happened here: LEVELS ABOVE's three
 * Views existed in the left-nav but never got a Screener button, so the
 * Views list showed empty). The generic path here only needs the
 * Views entry — passesPattern(r, sub.id) already resolves any
 * sub-pattern id generically (see the per-sub-pattern count loop above),
 * so no per-view code is needed on this side at all.
 *
 * Add a category key here any time a NEW top-level left-nav pattern is
 * introduced (or move one of the older hardcoded categories in here later
 * if it stops needing its bespoke behaviour).
 */
const GENERIC_VIEW_CATEGORIES = new Set([
  "levelsabove",
  "levelsbelow",
  "compressed",
  "expanded",
  "R1AbovePR4",
  "S1BelowPS4",
  "equal-cpr",
  // NEW: inside-cpr — was hand-wired to a single legacy button
  // ("Ti-cOLo-APU4-9PM") that no longer matches the left-nav's Views
  // list (8AM:SRBHHLLA-pU4+1:8AM, 2PM:pPDHLA-SRA-U4:7PM), so the left-nav
  // Views were invisible in the Screener and the Screener's button pointed
  // at a Views entry no longer in the left-nav. Moving it to the generic
  // path makes ViewsSidebar's Views the single source of truth for
  // both surfaces.
  "inside-cpr",
]);

/** View ids used by hand-written Views filter buttons that aren't listed in
 *  ViewsSidebar's `Views` map, but still need a "(n)" count. */
const EXTRA_VIEW_COUNT_IDS = ["eXLo-L4U4-U4"];

/**
 * Flat id → label lookup covering every view in the tree — both the
 * top-level `pivotcategories` entries and every nested `Views` sub-item.
 * Used by the header's "Active view" stat card so it can show a readable
 * label instead of the raw activeView id (mirrors SignalDesk's
 * VIEW_LABEL_BY_ID).
 */
const VIEW_LABEL_BY_ID: Record<string, string> = {
  ...Object.fromEntries(pivotcategories.map((p) => [p.id, p.label])),
  ...Object.fromEntries(
    Object.values(Views).flatMap((subs) => subs.map((s) => [s.id, s.label] as const)),
  ),
};

export default function Screener({
  activeView = "levelsabove",
  scanKey = 0,
  onCounts,
  onSignalSymbols,
}: {
  activeView?: string;
  scanKey?: number;
  onCounts?: (counts: Record<string, number>) => void;
  onSignalSymbols?: (
    symbols: Array<{
      key: string;
      symbol: string;
      source: "binance" | "delta";
      currentPrice: number;
      change24h: number;
      direction: "up" | "down";
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
}) {
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [allResults, setAllResults] = useState<CPRResult[]>([]);
  const [filtered, setFiltered] = useState<CPRResult[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("compressionRatio");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  // Default to true: on first load / refresh, before the user picks a
  // left-nav pattern, the screener should show ALL scanned results
  // (unfiltered) rather than being pre-filtered to a specific pattern.
  const [showAll, setShowAll] = useState(true);
  const [showExpU4PU4, setShowExpU4PU4] = useState(false);
  // RENAMED from "Exp-U3>U3": 9AM:SSRRBHHLLA-U4:9PM filter state
  // (Overlapping Lower). Bullish/uptrend, green color family.
  const [showExpU3PU3, setShowExpU3PU3] = useState(false);
  // NEW: 9AM:pRRHHLLA-U4:9PM filter state (Overlapping Lower) — sibling of
  // 9AM:SSRRBHHLLA-U4:9PM. Overlap Below + HHRRBelow + HHLLAbove. Bullish,
  // green color family.
  const [showOBLoRRHHLLA, setShowOBLoRRHHLLA] = useState(false);
  // NEW: OBN-L4U4-U4 / OBW-L4U4-L4 filter state (Overlapping Lower), placed next to Exp-U3>pU4
  const [showOBNLoU4L4, setShowOBNLoU4L4] = useState(false);
  const [showOBWLoU4L4, setShowOBWLoU4L4] = useState(false);
  // NEW: 2PM:SSLLpRRHHA-ApU4:5PM filter state (Overlapping Lower) — placed
  // next to OBN-L4U4-U4 / OBW-L4U4-L4. Overlap Below + SSLLAbove +
  // HHRRBelow, bullish, targets ApU4 (prev day's R4) by ~5PM.
  const [showOBLoSSLLRRHH, setShowOBLoSSLLRRHH] = useState(false);
  // NEW: 8AM:SSLLpRRHHA-L4:1PM filter state (Overlapping Lower) — bearish
  // sibling of 2PM:SSLLpRRHHA-ApU4:5PM, same Overlap Below + SSLLAbove +
  // HHRRBelow base, split the opposite way, targets today's own L4 by ~1PM.
  const [showOBLoSSLLRRHHDown, setShowOBLoSSLLRRHHDown] = useState(false);
  // NEW: generic Views (sub-pattern) toggle — covers every category listed
  // in GENERIC_VIEW_CATEGORIES (LEVELS ABOVE, LEVELs BELOW, COMPRESSED,
  // U1>pU4, L1<pL4, Equal CPR, and any future category added there) instead
  // of a bespoke useState per sub-pattern. Holds the currently-selected
  // sub-pattern id (e.g. "7PM:MoMi->U4:2AM"), or null when none selected.
  const [activeGenericSubView, setActiveGenericSubView] = useState<string | null>(null);
  const [PatternFilter, setPatternFilter] = useState<PatternInfo["label"] | null>(null);
  const [showPatternList, setShowPatternList] = useState(false);
  const [showSizeList, setShowSizeList] = useState(false);
  const [showExitTimeList, setShowExitTimeList] = useState(false);
  // NEW: ENTRY TIME — mirrors Exit Time's UI (label, 2-row hour grid,
  // toggle button) but is not yet wired into the display filter chain.
  // Functionality to filter by entry time will be added in a future update.
  const [showEntryTimeList, setShowEntryTimeList] = useState(false);
  const [entryTimeFilter, setEntryTimeFilter] = useState<string | null>(null);
  // NEW: TIME filter — 24 hourly toggles (6AM..5AM next day). Selecting an
  // hour shows only rows that satisfy at least one Views (sub-pattern)
  // whose id/label ends with that hour, e.g. clicking "6PM" matches every
  // sub-pattern id ending in ":6PM" (T1-U4:6AM, MeMi-eXHiL4U3-U4:6PM, etc.)
  // across ALL parent patterns — independent of activeView.
  const [exitTimeFilter, setExitTimeFilter] = useState<string | null>(null);

  // NEW: full 24hr cycle starting at 5AM through 4AM the next day, split
  // into two 12-item rows: 5AM..4PM on the first line, 5PM..4AM on the
  // second — matching the requested layout.
  const TIME_SLOTS: string[] = [
    "5AM", "6AM", "7AM", "8AM", "9AM", "10AM", "11AM",
    "12PM", "1PM", "2PM", "3PM", "4PM",
    "5PM", "6PM", "7PM", "8PM", "9PM", "10PM", "11PM",
    "12AM", "1AM", "2AM", "3AM", "4AM",
  ];
  const TIME_SLOTS_ROW1 = TIME_SLOTS.slice(0, 12); // 5AM..4PM
  const TIME_SLOTS_ROW2 = TIME_SLOTS.slice(12);    // 5PM..4AM

  // NEW: every sub-pattern (Views) id across every parent pattern whose
  // id ends with ":<selected time>" — flattened once per exitTimeFilter change
  // so the display filter below stays a cheap .some() lookup per row.
  const exitTimeMatchedSubIds = useMemo(() => {
    if (!exitTimeFilter) return [] as string[];
    const suffix = `:${exitTimeFilter}`;
    return Object.values(Views)
      .flat()
      .filter((s) => s.id.endsWith(suffix))
      .map((s) => s.id);
  }, [exitTimeFilter]);
  // CHANGED: split into two independent states so one pMicro..pUltra
  // selection (prev day's CPR width) and one Micro..Ultra selection
  // (today's CPR width) can be active at the same time.
  const [prevWidthFilter, setPrevWidthFilter] = useState<WidthCategoryKey | null>(null);
  const [todayWidthFilter, setTodayWidthFilter] = useState<WidthCategoryKey | null>(null);
  // NEW: PDH/PDL filter — independent of activeView, mutually exclusive (like pivot/width filters).
  const [pdhPdlFilter, setPdhPdlFilter] = useState<"above" | "below" | "abovepu4" | "belowpl4" | "pdhgtu1" | "pdlltl1" | "s1r1in" | null>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const [nextScanUtc, setNextScanUtc] = useState<Date>(getNextScanIST());
  const [alreadyScannedToday] = useState(() => hasScannedToday());
  const [lastScanDate] = useState(() => getLastScanDate());
  const scanRef = useRef(false);

  const [deltaStatus, setDeltaStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [deltaProgress, setDeltaProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [deltaAllResults, setDeltaAllResults] = useState<CPRResult[]>([]);
  const [deltaFiltered, setDeltaFiltered] = useState<CPRResult[]>([]);
  const [deltaError, setDeltaError] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("binance");
  const deltaScanRef = useRef(false);

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
  const activePatternRef = useRef(activeView);
  useEffect(() => { allResultsRef.current = allResults; }, [allResults]);
  useEffect(() => { deltaAllResultsRef.current = deltaAllResults; }, [deltaAllResults]);
  useEffect(() => { activePatternRef.current = activeView; }, [activeView]);

  // NEW: auto-hide "Show All" whenever a left-nav view/category is clicked.
  // ViewsSidebar's onSelect (both handlePatternClick for top-level categories
  // and handleSubClick for their Views/sub-patterns) updates activeView,
  // so any change to activeView after the initial mount means the user
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
    setShowAll(false);
  }, [activeView]);

  // NEW: resolve activeView to its parent left-nav category ("section").
  // Clicking a top-level category in the left-nav sets activeView to the
  // category id directly (e.g. "compressed"), but clicking one of its
  // Views/sub-patterns instead (e.g. "6A:HLC-SSLL:R4-6P") sets
  // activeView to that LEAF id — ViewsSidebar's handleSubClick calls
  // onSelect(subId), not onSelect(parentId). Row filtering already handles
  // both cases fine (passesPattern resolves leaf ids directly), but
  // anything keyed off the *category* — the Views button row and the
  // per-row green/red direction dot (getViewDirection) — was comparing
  // against the raw activeView and so went blank whenever a leaf was
  // selected via the left-nav. activeSectionKey resolves either case back
  // to the owning category so those two stay populated regardless of
  // whether the category or one of its leaves triggered the selection.
  const activeSectionKey = useMemo(() => {
    if (Views[activeView]) return activeView; // already a category id
    for (const [section, subs] of Object.entries(Views)) {
      if (subs.some((s) => s.id === activeView)) return section;
    }
    return activeView; // not a known category or leaf — leave as-is
  }, [activeView]);

  const doScan = useCallback(async (switchTab: boolean = true) => {
    if (scanRef.current) return;
    scanRef.current = true;
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
      setAllResults(results);
      setFiltered(results.filter((r) => passesPattern(r, activeView)));
      setStatus("done");
      markScannedToday();
      setNextScanUtc(getNextScanIST());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    } finally {
      scanRef.current = false;
    }
  }, [activeView]);

  const doDeltaScan = useCallback(async (switchTab: boolean = true) => {
    if (deltaScanRef.current) return;
    deltaScanRef.current = true;
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
      setDeltaAllResults(results);
      setDeltaFiltered(results.filter((r) => passesPattern(r, activeView)));
      setDeltaStatus("done");
    } catch (e) {
      setDeltaError(e instanceof Error ? e.message : "Unknown error");
      setDeltaStatus("error");
    } finally {
      deltaScanRef.current = false;
    }
  }, [activeView]);

  useEffect(() => {
    if (shouldAutoScan()) doScan();
  }, [doScan]);

  useEffect(() => {
  if (scanKey > 0) {
    doScan();
    doDeltaScan(false); // don't let the auto Delta scan steal the active tab away from Binance
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

  useEffect(() => {
    if (allResults.length > 0) setFiltered(allResults.filter((r) => passesPattern(r, activeView)));
    if (deltaAllResults.length > 0) setDeltaFiltered(deltaAllResults.filter((r) => passesPattern(r, activeView)));
    if (activeView !== "overlapping-lower") { setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBLoRRHHLLA(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); setShowOBLoSSLLRRHHDown(false); }
  }, [activeView, allResults, deltaAllResults]);

  // ─── Two-way sync between the left-nav Views and the Screener's own
  //     Views filter buttons ────────────────────────────────────────────────
  // VIEW_SETTERS maps a left-nav Views (sub-pattern) id to the Screener
  // state setter of the hand-written button that implements the same filter,
  // so selecting a View in the sidebar also switches its Screener button on
  // (and the effect below turns every other one off).
  const VIEW_SETTERS: Record<string, (v: boolean) => void> = {
    // overlapping-lower
    "eXLo-L4U4-U4": setShowExpU4PU4,
    // NEW: wire renamed "9AM:SSRRBHHLLA-U4:9PM" (was "Exp-U3>U3") into
    // VIEW_SETTERS — it existed in ViewsSidebar's Views list but had no
    // matching entry here, same class of bug as CPR Inside's missing Views.
    "9AM:SSRRBHHLLA-U4:9PM": setShowExpU3PU3,
    "9AM:pRRHHLLA-U4:9PM": setShowOBLoRRHHLLA,
    "OBN-L4U4-U4": setShowOBNLoU4L4,
    "OBW-L4U4-L4": setShowOBWLoU4L4,
    "2PM:SSLLpRRHHA-ApU4:5PM": setShowOBLoSSLLRRHH,
    "8AM:SSLLpRRHHA-L4:1PM": setShowOBLoSSLLRRHHDown,
  };

  // Current on/off state of each of those buttons — used to detect when the
  // user closes (✕) the Screener button for the View that the left-nav has
  // selected, so we can deselect it in the sidebar too.
  const VIEW_STATES: Record<string, boolean> = {
    "eXLo-L4U4-U4": showExpU4PU4,
    "OBN-L4U4-U4": showOBNLoU4L4,
    "OBW-L4U4-L4": showOBWLoU4L4,
    "2PM:SSLLpRRHHA-ApU4:5PM": showOBLoSSLLRRHH,
    "8AM:SSLLpRRHHA-L4:1PM": showOBLoSSLLRRHHDown,
  };

  // Is activeView a Views leaf (a sub-pattern) rather than a category?
  const isLeafView = useMemo(
    () => Object.values(Views).some((subs) => subs.some((s) => s.id === activeView)),
    [activeView],
  );

  // Sidebar → Screener: whenever the left-nav selects a View leaf, switch the
  // matching Screener filter button on. Runs after the reset effect above
  // (which clears every button on each activeView / results change), so the
  // selected one survives while the rest stay off.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!isLeafView) return;
    const setter = VIEW_SETTERS[activeView];
    if (setter) {
      Object.entries(VIEW_SETTERS).forEach(([id, set]) => set(id === activeView));
      setActiveGenericSubView(null);
    } else {
      // generic (data-driven) Views button
      setActiveGenericSubView(activeView);
    }
  }, [activeView, isLeafView, allResults, deltaAllResults]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Sidebar → Screener (deselect): clicking the "✕" on an active View chip in
  // the left nav falls back to its parent category, so activeView goes from
  // a leaf to a non-leaf. The category-level reset above only clears buttons
  // when leaving the category entirely, so clear every View filter button here
  // too — both surfaces show the same filter and must switch off together.
  const prevPatternRef = useRef(activeView);
  useEffect(() => {
    const prev = prevPatternRef.current;
    prevPatternRef.current = activeView;
    if (prev === activeView) return;
    const prevWasLeaf = Object.values(Views).some((subs) => subs.some((s) => s.id === prev));
    if (prevWasLeaf && !isLeafView) {
      Object.values(VIEW_SETTERS).forEach((set) => set(false));
      setActiveGenericSubView(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, isLeafView]);

  // Screener → Sidebar: when the currently-selected View's Screener button is
  // closed with its ✕, tell the left-nav to deselect the same View (falls back
  // to its parent category). Only fires on a true → false transition so the
  // sync effect above never triggers it.
  const activeViewOn = VIEW_SETTERS[activeView]
    ? !!VIEW_STATES[activeView]
    : activeGenericSubView === activeView;
  const prevActiveViewOnRef = useRef(false);
  useEffect(() => {
    const wasOn = prevActiveViewOnRef.current;
    prevActiveViewOnRef.current = activeViewOn;
    if (isLeafView && wasOn && !activeViewOn) requestViewDeselect(activeView);
  }, [activeViewOn, isLeafView, activeView]);
  // NEW: reset the generic Views toggle whenever it no longer belongs to
  // the current activeView — either because we've left every generic
  // category entirely, or because we've switched from one generic category
  // to another (e.g. "levelsabove" -> "compressed") and the previously
  // selected sub-pattern id doesn't exist under the new one.
  useEffect(() => {
    if (!activeGenericSubView) return;
    const stillValid =
      GENERIC_VIEW_CATEGORIES.has(activeSectionKey) &&
      (Views[activeSectionKey] ?? []).some((s) => s.id === activeGenericSubView);
    if (!stillValid) setActiveGenericSubView(null);
  }, [activeView, activeSectionKey]);
  // NEW: report per-pattern (top-level nav) matching counts up to App so
  // the left sidebar can show "Little ABOVE (41)" etc. Computed off the
  // currently active tab's full unfiltered result set, so the counts
  // track whichever of Binance/Delta/Combined is selected, and recompute
  // whenever scan results or the active tab change.
  useEffect(() => {
    if (!onCounts) return;
    const pool: CPRResult[] =
      activeTab === "delta" ? deltaAllResults
      : activeTab === "combined" ? [...allResults, ...deltaAllResults]
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
  }, [allResults, deltaAllResults, activeTab, onCounts]);

  // NEW: per-view matching counts for the Views filter buttons rendered in
  // this screen ("(41)" suffix), computed off the same unfiltered pool used
  // for the left-nav counts so both always agree.
  const viewCounts = useMemo(() => {
    const pool: CPRResult[] =
      activeTab === "delta" ? deltaAllResults
      : activeTab === "combined" ? [...allResults, ...deltaAllResults]
      : allResults;
    const map: Record<string, number> = {};
    if (pool.length === 0) return map;
    const ids = new Set<string>();
    for (const p of pivotcategories) ids.add(p.id);
    for (const subs of Object.values(Views)) for (const s of subs) ids.add(s.id);
    for (const extra of EXTRA_VIEW_COUNT_IDS) ids.add(extra);
    for (const id of ids) map[id] = pool.filter((r) => passesPattern(r, id)).length;
    return map;
  }, [allResults, deltaAllResults, activeTab]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const activeProgress = activeTab === "delta" ? deltaProgress : progress;
  const progressPct = activeProgress.total > 0 ? Math.round((activeProgress.done / activeProgress.total) * 100) : 0;

  const combinedResults: CPRResultWithSource[] = [
    ...filtered.map((r) => ({ ...r, source: "binance" as const })),
    ...deltaFiltered.map((r) => ({ ...r, source: "delta" as const })),
  ];
  const combinedAllResults: CPRResultWithSource[] = [
    ...allResults.map((r) => ({ ...r, source: "binance" as const })),
    ...deltaAllResults.map((r) => ({ ...r, source: "delta" as const })),
  ];

  const getActivePool = (): CPRResultWithSource[] => {
    if (showExpU4PU4 && activeView === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eXLo-L4U4-U4"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eXLo-L4U4-U4"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // RENAMED from "Exp-U3>U3": 9AM:SSRRBHHLLA-U4:9PM pool
    if (showExpU3PU3 && activeView === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "9AM:SSRRBHHLLA-U4:9PM"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "9AM:SSRRBHHLLA-U4:9PM"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 9AM:pRRHHLLA-U4:9PM pool — Overlapping Lower, HHRRBelow +
    // HHLLAbove variant, placed next to 9AM:SSRRBHHLLA-U4:9PM.
    if (showOBLoRRHHLLA && activeView === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "9AM:pRRHHLLA-U4:9PM"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "9AM:pRRHHLLA-U4:9PM"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: OBN-L4U4-U4 pool — Overlapping Lower, Narrow variant
    if (showOBNLoU4L4 && activeView === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "OBN-L4U4-U4"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "OBN-L4U4-U4"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: OBW-L4U4-L4 pool — Overlapping Lower, Wide variant
    if (showOBWLoU4L4 && activeView === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "OBW-L4U4-L4"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "OBW-L4U4-L4"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 2PM:SSLLpRRHHA-ApU4:5PM pool — Overlapping Lower, SSLLAbove +
    // HHRRBelow variant, placed next to OBW-L4U4-L4.
    if (showOBLoSSLLRRHH && activeView === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "2PM:SSLLpRRHHA-ApU4:5PM"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "2PM:SSLLpRRHHA-ApU4:5PM"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 8AM:SSLLpRRHHA-L4:1PM pool — bearish sibling of
    // 2PM:SSLLpRRHHA-ApU4:5PM, placed next to it.
    if (showOBLoSSLLRRHHDown && activeView === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "8AM:SSLLpRRHHA-L4:1PM"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "8AM:SSLLpRRHHA-L4:1PM"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: generic Views (sub-pattern) pool — covers every category in
    // GENERIC_VIEW_CATEGORIES. passesPattern(r, id) already resolves any
    // sub-pattern id generically (same lookup used for the left-nav counts
    // above), so this one branch replaces what would otherwise be a
    // separate hand-written pool block per sub-pattern.
    if (activeGenericSubView && GENERIC_VIEW_CATEGORIES.has(activeSectionKey)) {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, activeGenericSubView))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, activeGenericSubView))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (activeTab === "combined") return showAll ? combinedAllResults : combinedResults;
    if (activeTab === "delta") return (showAll ? deltaAllResults : deltaFiltered).map((r) => ({ ...r, source: "delta" as const }));
    return (showAll ? allResults : filtered).map((r) => ({ ...r, source: "binance" as const }));
  };

  const displayed = getActivePool()
    .filter((r) => r.symbol.toLowerCase().includes(search.toLowerCase()))
    // NEW: CL2U1 / CL4U3 are independent booleans in cpr.ts (not
    // actually gated behind srLower), so a row can satisfy one of them
    // AND a higher-priority bucket (e.g. srHigher) at the same time.
    // getPatternInfo() only ever returns ONE label per row and checks the
    // other buckets first, so matching on getPatternInfo(r)?.label would
    // silently miss rows where CL2U1/CL4U3 is true but shadowed by
    // an earlier bucket. Check the raw flags directly for these two so
    // the filter buttons actually work independent of the primary badge.
    .filter((r) => {
      if (!PatternFilter) return true;
      if (PatternFilter === "CL4U3") return r.CL4U3;
      if (PatternFilter === "L4U4") return r.L4U4;
      // NEW: EU4L4 — independent, section-agnostic Pattern flag (see
      // doc-comment on PatternInfo/getPatternInfo in ScreenerUtils.tsx).
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
      // activeView/left-nav.
      if (PatternFilter === "U3L4") return r.U3L4;
      // NEW: U2L4 — same treatment as U3L4: independent,
      // section-agnostic Pattern flag, always shown regardless of
      // activeView/left-nav.
      if (PatternFilter === "U2L4") return r.U2L4;
      if (PatternFilter === "U1L4") return r.U1L4;
      // NEW: L3TC — same treatment as U3L4/U2L4: independent,
      // section-agnostic Pattern flag, always shown regardless of
      // activeView/left-nav.
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
      // NEW: CU3L1 (today S4 in prev S1/BC, today R4 in prev R2/R3)
      if (PatternFilter === "CU3L1") return r.CU3L1;
      // NEW: U2L3 (today S4 in prev S3/S2, prev R4 in prev R1/R2)
      if (PatternFilter === "U2L3") return r.U2L3;
      return getPatternInfo(r)?.label === PatternFilter;
    })
    .filter((r) => matchesWidthFilter(r, prevWidthFilter, todayWidthFilter))
    // NEW: Price Level filter — price above PDH, below PDL, above prev day's
    // R4 (PU4), or below prev day's S4 (PL4)
    .filter((r) => {
      if (pdhPdlFilter === "s1r1in") {
        const eligible =
          passesPattern(r, "inside-cpr") ||
          passesPattern(r, "overlapping-lower");
        if (!eligible) return false;
        const inBand = (lvl: number, b: { bc: number; tc: number }) => {
          const lo = Math.min(b.bc, b.tc), hi = Math.max(b.bc, b.tc);
          return lvl >= lo && lvl <= hi;
        };
        const levels = [
          r.todayCPR.s1, r.todayCPR.r1, 
          r.prevCPR.s1,  r.prevCPR.r1,
        ];
        return levels.some((l) => inBand(l, r.todayCPR) || inBand(l, r.prevCPR));
      }
      if (pdhPdlFilter === "pdhgtu1") return r.todayCPR.prevHigh > r.todayCPR.r1;
      if (pdhPdlFilter === "pdlltl1") return r.todayCPR.prevLow < r.todayCPR.s1;
      if (pdhPdlFilter === "above") return passesPattern(r, "Price-AbovePDH");
      if (pdhPdlFilter === "below") return passesPattern(r, "Price-BelowPDL");
      if (pdhPdlFilter === "abovepu4") return r.currentPrice > r.prevCPR.r4;
      if (pdhPdlFilter === "belowpl4") return r.currentPrice < r.prevCPR.s4;
      return true;
    })
    // NEW: TIME filter — when an hour is selected, keep only rows that
    // satisfy at least one Views (sub-pattern) targeting that hour, across
    // every parent pattern (independent of activeView/PatternFilter).
    .filter((r) => {
      if (!exitTimeFilter) return true;
      return exitTimeMatchedSubIds.some((id) => passesPattern(r, id));
    })
    .slice()
    .sort((a, b) => {
      const av = getVal(a, sortKey);
      const bv = getVal(b, sortKey);
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

  // Signal Desk consumes this exact post-filter pool. Keeping the projection
  // here means it automatically follows all existing sidebar Views and
  // hand-written Screener filters without duplicating their logic.
  // change24h is passed straight through so SignalDeskSymbol's optional
  // 24h-change badge has data to render. direction drives SignalDesk's
  // long/short header icon — see getRowDirection in ScreenerUtils.tsx.
  const signalSymbols = displayed.map((r) => ({
    key: `${r.source}-${r.symbol}`,
    symbol: r.symbol,
    source: r.source,
    currentPrice: r.currentPrice,
    change24h: r.change24h,
    direction: getRowDirection(r, activeView),
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

  const currentStatus =
    activeTab === "binance" ? status
    : activeTab === "delta" ? deltaStatus
    : status === "done" || deltaStatus === "done" ? "done"
    : status === "scanning" || deltaStatus === "scanning" ? "scanning"
    : "idle";

  const currentFilteredCount =
    activeTab === "combined" ? combinedResults.length
    : activeTab === "delta" ? deltaFiltered.length
    : filtered.length;

  const currentAllCount =
    activeTab === "combined" ? combinedAllResults.length
    : activeTab === "delta" ? deltaAllResults.length
    : allResults.length;

  const currentError = activeTab === "delta" ? deltaError : error;
  const canShowCombined = status === "done" || deltaStatus === "done";

  // Helper: is any sub-filter active (to decide the result count label)
  const anySubFilter =
    showExpU4PU4 || showExpU3PU3 || showOBLoRRHHLLA || showOBNLoU4L4 || showOBWLoU4L4 || showOBLoSSLLRRHH ||
    !!activeGenericSubView ||
    !!PatternFilter || !!prevWidthFilter || !!todayWidthFilter || !!pdhPdlFilter || !!exitTimeFilter;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl px-4 py-8 min-h-screen flex flex-col">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-[220px] max-w-md">
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
              <div className="rounded-lg border border-border bg-card px-3 py-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Active view
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold">
                  {!showAll ? (VIEW_LABEL_BY_ID[activeView] || activeView) : "All scanned"}
                </p>
              </div>
            </div>
          )}

          <LiveClock />
        </div>

        {/* Legend — hidden while idle (initial load/refresh, before the
            first scan resolves), while a scan is in progress, AND whenever
            no left-nav category is selected (showAll true, i.e. "All
            scanned"/no filter), so the three empty legend cards don't
            render with nothing to show. */}
        {currentStatus === "done" && !showAll && (
        <ScreenerLegend
          activeView={activeView}
          showExpU4PU4={showExpU4PU4}
          showExpU3PU3={showExpU3PU3}
          showOBLoRRHHLLA={showOBLoRRHHLLA}
          showOBNLoU4L4={showOBNLoU4L4}
          showOBWLoU4L4={showOBWLoU4L4}
        />
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={doScan}
            disabled={status === "scanning"}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50 shrink-0"
            style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff" }}
          >
            <RefreshCw className={`w-3 h-3 ${status === "scanning" ? "animate-spin" : ""}`} />
            {status === "scanning" ? "Scanning Binance…" : "Scan Binance"}
          </button>

          <button
            onClick={doDeltaScan}
            disabled={deltaStatus === "scanning"}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50 shrink-0"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", color: "#fff" }}
          >
            <RefreshCw className={`w-3 h-3 ${deltaStatus === "scanning" ? "animate-spin" : ""}`} />
            {deltaStatus === "scanning" ? "Scanning Delta…" : "Scan Delta"}
          </button>

          {canShowCombined && (
            <div className="flex rounded-lg border border-border overflow-hidden text-xs shrink-0">
              {(["binance", "delta", "combined"] as ActiveTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-2.5 py-1 transition-colors capitalize"
                  style={{
                    background: activeTab === tab ? "#3b82f6" : "transparent",
                    color: activeTab === tab ? "#fff" : "#8ba3bc",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

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
                  setShowAll((v) => !v);
                  // NEW: also clear the generic Views (sub-pattern) selection —
                  // covers inside-cpr and every other GENERIC_VIEW_CATEGORIES
                  // category, so "Show All" fully resets state everywhere.
                  setActiveGenericSubView(null);
                  setShowExpU4PU4(false);
                  setShowExpU3PU3(false);
                  setShowOBLoRRHHLLA(false);
                  setShowOBNLoU4L4(false);
                  setShowOBWLoU4L4(false);
                  setShowOBLoSSLLRRHHDown(false);
                }}
                className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded border border-border transition-colors shrink-0 ${showAll ? "bg-foreground/15 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span className="leading-none">{showAll ? "−" : "+"}</span>
                Show All
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
                onClick={() => setShowEntryTimeList((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border border-border transition-colors shrink-0 ${
                  showEntryTimeList
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={showEntryTimeList ? "Hide entry time filters" : "Show entry time filters"}
              >
                <span className="leading-none">{showEntryTimeList ? "−" : "+"}</span>
                NTime
              </button>
              <button
                type="button"
                onClick={() => setShowExitTimeList((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border border-border transition-colors shrink-0 ${
                  showExitTimeList
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={showExitTimeList ? "Hide exit time filters" : "Show exit time filters"}
              >
                <span className="leading-none">{showExitTimeList ? "−" : "+"}</span>
                XTime
              </button>
            </div>
          )}

          <div className="relative ml-auto shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search symbol…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-2 py-1 text-xs rounded-lg border border-border bg-card text-foreground w-36 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Status bar */}
        {(status === "scanning" || deltaStatus === "scanning") && (
          <div className="mb-4 rounded-lg border border-border bg-card p-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>
                {activeTab === "delta"
                  ? `Scanning Delta Exchange… ${deltaProgress.symbol}`
                  : `Scanning Binance… ${progress.symbol}`}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
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

        {/* Show-all toggle + sub-filter buttons */}
        {currentStatus === "done" && (
          <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {!showAll && (
            <span className="text-[10px] text-pink-400/90 uppercase tracking-wider mr-0.5 font-semibold">VIEWS:</span>
            )}

            {/* NEW: generic Views (sub-pattern) buttons — covers LEVELS ABOVE,
                LEVELs BELOW, COMPRESSED, U1>pU4, L1<pL4, Equal CPR (see
                GENERIC_VIEW_CATEGORIES above), and any future category added
                there. Colours come straight from each sub-pattern's own
                activeColor/activeText/activeBg in ViewsSidebar's
                Views map, same as the left-nav itself, so a newly
                added Views entry is styled automatically without touching
                this file. */}
            {GENERIC_VIEW_CATEGORIES.has(activeSectionKey) &&
              !showAll &&
              (Views[activeSectionKey] ?? []).map((sub) => {
                const isActive = activeGenericSubView
                  ? activeGenericSubView === sub.id
                  : activeView === sub.id; // left-nav navigated straight to this leaf
                const borderColor = sub.activeColor ?? "var(--foreground)";
                const textColor = sub.activeText ?? "var(--foreground)";
                const bg = sub.activeBg;
                return (
                  <button
                    key={sub.id}
                    onClick={() => setActiveGenericSubView((v) => (v === sub.id ? null : sub.id))}
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
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowExpU4PU4((v) => !v); setShowExpU3PU3(false); setShowOBLoRRHHLLA(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); setShowOBLoSSLLRRHHDown(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showExpU4PU4
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Prev R4 between today's R3/R4 and Prev S4 between today's S3/S4 with today's CPR Mini"
              >
                {showExpU4PU4 ? "✕ eXLo-L4U4-U4" : "eXLo-L4U4-U4"}<ViewCount id={"eXLo-L4U4-U4"} counts={viewCounts} />
              </button>
            )}
            {/* RENAMED from "Exp-U3>U3" -> "9AM:SSRRBHHLLA-U4:9PM" button —
                Overlapping Lower, placed right after eXLo-L4U4-U4.
                Bullish/uptrend, green color family (was sky-400). */}
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowExpU3PU3((v) => !v); setShowExpU4PU4(false); setShowOBLoRRHHLLA(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); setShowOBLoSSLLRRHHDown(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showExpU3PU3
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="U3 > pU4/L3 < pL4 ,CPR Narrow: Target:AU4"
              >
                {showExpU3PU3 ? "✕ 9AM:SSRRBHHLLA-U4:9PM" : "9AM:SSRRBHHLLA-U4:9PM"}<ViewCount id={"9AM:SSRRBHHLLA-U4:9PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: 9AM:pRRHHLLA-U4:9PM button — Overlapping Lower, placed
                right after 9AM:SSRRBHHLLA-U4:9PM. Overlap Below +
                HHRRBelow (today's R1 AND today's PDH both below the lower
                of prev's R1/PDH) + HHLLAbove (today's PDH above prev's
                PDH AND today's PDL >= prev's PDL). Bullish, green color
                family, targets today's own U4 by ~9PM. */}
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBLoRRHHLLA((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); setShowOBLoSSLLRRHHDown(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBLoRRHHLLA
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Below + HHRRBelow (today's R1 & PDH below the lower of prev R1/PDH) + HHLLAbove (today's PDH above prev PDH & PDL >= prev PDL): Target today's own U4 by ~9PM"
              >
                {showOBLoRRHHLLA ? "✕ 9AM:pRRHHLLA-U4:9PM" : "9AM:pRRHHLLA-U4:9PM"}<ViewCount id={"9AM:pRRHHLLA-U4:9PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: OBN-L4U4-U4 button — Overlapping Lower, placed next to Exp-U3>pU4 */}
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBNLoU4L4((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBLoRRHHLLA(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); setShowOBLoSSLLRRHHDown(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBNLoU4L4
                    ? "border-cyan-400 text-cyan-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Lower + today's CPR Narrow + L4U4 structure, Compression > 50%: Target:U4"
              >
                {showOBNLoU4L4 ? "✕ OBN-L4U4-U4" : "OBN-L4U4-U4"}<ViewCount id={"OBN-L4U4-U4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: OBW-L4U4-L4 button — Overlapping Lower, placed next to OBN-L4U4-U4 */}
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBWLoU4L4((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBLoRRHHLLA(false); setShowOBNLoU4L4(false); setShowOBLoSSLLRRHH(false); setShowOBLoSSLLRRHHDown(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBWLoU4L4
                    ? "border-rose-400 text-rose-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Lower + today's CPR Wide + L4U4 structure, Compression > 50%: Target:U4"
              >
                {showOBWLoU4L4 ? "✕ OBW-L4U4-L4" : "OBW-L4U4-L4"}<ViewCount id={"OBW-L4U4-L4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: 2PM:SSLLpRRHHA-ApU4:5PM button — Overlapping Lower, placed
                next to OBW-L4U4-L4. Overlap Below + SSLLAbove (today's S1
                AND today's PDL both above the higher of prev's S1/PDL) +
                HHRRBelow (today's R1 AND today's PDH both below the lower of
                prev's R1/PDH) + (prev R1 above today's R2 OR today's S3
                above prev's S2). Bullish, green color family, targets ApU4
                (prev day's R4) by ~5PM. */}
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBLoSSLLRRHH((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBLoRRHHLLA(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHHDown(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBLoSSLLRRHH
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Lower + SSLLAbove (today's S1 & PDL above the higher of prev S1/PDL) + HHRRBelow (today's R1 & PDH below the lower of prev R1/PDH) + (prev R1 above today's R2 OR today's S3 above prev S2): Target ApU4 (prev day's R4) by ~5PM"
              >
                {showOBLoSSLLRRHH ? "✕ 2PM:SSLLpRRHHA-ApU4:5PM" : "2PM:SSLLpRRHHA-ApU4:5PM"}<ViewCount id={"2PM:SSLLpRRHHA-ApU4:5PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: 8AM:SSLLpRRHHA-L4:1PM button — Overlapping Lower, placed
                next to 2PM:SSLLpRRHHA-ApU4:5PM. Bearish sibling: same
                Overlap Below + SSLLAbove + HHRRBelow base, but split the
                opposite way (prev R1 below today's R2 OR today's S3 below
                prev S2). Red color family, targets today's own L4 by ~1PM. */}
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBLoSSLLRRHHDown((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBLoRRHHLLA(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBLoSSLLRRHHDown
                    ? "border-red-400 text-red-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Lower + SSLLAbove (today's S1 & PDL above the higher of prev S1/PDL) + HHRRBelow (today's R1 & PDH below the lower of prev R1/PDH) + (prev R1 below today's R2 OR today's S3 below prev S2): Target today's own L4 by ~1PM"
              >
                {showOBLoSSLLRRHHDown ? "✕ 8AM:SSLLpRRHHA-L4:1PM" : "8AM:SSLLpRRHHA-L4:1PM"}<ViewCount id={"8AM:SSLLpRRHHA-L4:1PM"} counts={viewCounts} />
              </button>
            )}
          </div>

          {/* Pattern filter buttons — own line, independent of activeView
              AND independent of showAll. These always render, regardless of Show All state, and
              are mutually exclusive within their own group. */}
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
                  { label: "CL4U3", active: "border-indigo-500 text-indigo-500" },
                  { label: "L4U4", active: "border-lime-400 text-lime-400" },
                  { label: "EU4L4", active: "border-orange-400 text-orange-400" },
                  { label: "EL4U4", active: "border-yellow-400 text-yellow-400" },
                  { label: "QU4L4", active: "border-slate-400 text-slate-300" },
                  { label: "U4L2", active: "border-green-500 text-green-500" },
                  { label: "U3L2", active: "border-emerald-500 text-emerald-500" },
                  { label: "U4L3", active: "border-lime-500 text-lime-500" },
                  { label: "U4L4", active: "border-green-600 text-green-600" },
                  { label: "U3L4", active: "border-lime-600 text-lime-600" },
                  { label: "U2L4", active: "border-green-400 text-green-400" },
                  { label: "U1L4", active: "border-emerald-600 text-emerald-600" },
                  { label: "EU3L4", active: "border-amber-400 text-amber-400" },
                  { label: "L3TC", active: "border-sky-600 text-sky-300" },
                  { label: "EL1L2", active: "border-amber-400 text-amber-400" },
                  { label: "EL2L1", active: "border-orange-400 text-orange-400" },
                  { label: "CU3L2", active: "border-blue-500 text-blue-500" },
                  { label: "CU3L3", active: "border-blue-600 text-blue-600" },
                  { label: "EL2U4", active: "border-amber-400 text-amber-400" },
                  { label: "EL3U4", active: "border-orange-400 text-orange-400" },
                  { label: "CU4L2", active: "border-purple-500 text-purple-500" },
                  { label: "EU3L3", active: "border-yellow-400 text-yellow-400" },
                  { label: "EL3U3", active: "border-amber-400 text-amber-400" },
                  { label: "CU4L4",   active: "border-blue-400 text-blue-400" },
                  { label: "CU4L3",   active: "border-indigo-600 text-indigo-600" },
                  { label: "CL3U3",   active: "border-blue-700 text-blue-700" },
                  { label: "L4U3",   active: "border-indigo-400 text-indigo-400" },
                  { label: "L3U3",  active: "border-purple-400 text-purple-400" },
                  { label: "L4U2",   active: "border-pink-400 text-pink-400" },
                  { label: "L3U2",   active: "border-rose-400 text-rose-400" },
                  { label: "L3U4",  active: "border-amber-400 text-amber-400" },
                  { label: "L2U4",  active: "border-violet-400 text-violet-400" },
                  { label: "CL3U2",  active: "border-violet-600 text-violet-600" },
                  { label: "L1U4", active: "border-orange-400 text-orange-400" },
                  { label: "CL4U2",  active: "border-indigo-700 text-indigo-700" },
                  // NEW: eXL*U1 / eXL*CPR sub-type badges (unconditional, all sections)
                  { label: "EU1L2",   active: "border-amber-400 text-amber-400" },
                  { label: "EU1L3",   active: "border-orange-400 text-orange-400" },
                  { label: "EU1L4",   active: "border-yellow-400 text-yellow-400" },
                  { label: "EUBL1",  active: "border-amber-400 text-amber-400" },
                  { label: "EUPL1",  active: "border-orange-400 text-orange-400" },
                  { label: "EUTL1",  active: "border-yellow-400 text-yellow-400" },
                  { label: "EUBL2",  active: "border-amber-400 text-amber-400" },
                  { label: "EUBL3",  active: "border-orange-400 text-orange-400" },
                  { label: "EUPL3",  active: "border-yellow-400 text-yellow-400" },
                  // NEW: CL1U1 / CU1L1 / CL2U2 / CU2L2 badges (unconditional, all sections)
                  { label: "CL1U1",   active: "border-blue-800 text-blue-800" },
                  { label: "CU1L1",   active: "border-violet-700 text-violet-700" },
                  { label: "CL2U2",   active: "border-purple-700 text-purple-700" },
                  { label: "CU2L2",   active: "border-indigo-400 text-indigo-400" },
                  // NEW: CL2U1 — independent, section-agnostic Pattern flag (see cpr.ts).
                  { label: "CL2U1",   active: "border-purple-600 text-purple-600" },
                  // NEW: CL4U4 — independent, section-agnostic Pattern flag (see cpr.ts).
                  { label: "CL4U4",   active: "border-violet-400 text-violet-400" },
                  // NEW: EU2L3 — prev S4 inside today S2/S3 AND prev R4 inside today R1/R2
                  { label: "EU2L3",   active: "border-orange-400 text-orange-400" },
                  // NEW: expanded family — today's outer S-level broke below prev S4
                  // AND today's outer R-level/TC broke above prev R4 (see cpr.ts).
                  { label: "EU2L4",  active: "border-yellow-400 text-yellow-400" },
                  { label: "EU2L2",   active: "border-amber-400 text-amber-400" },
                  { label: "EUTL2",   active: "border-orange-400 text-orange-400" },
                  { label: "EUTL3",   active: "border-yellow-400 text-yellow-400" },
                  { label: "EU1L1",   active: "border-amber-400 text-amber-400" },
                  // NEW: EL1U1 — same band shape as EU1L1, fires when the R1/R4 gap is larger.
                  { label: "EL1U1",   active: "border-orange-400 text-orange-400" },
                  // NEW: EL1U2 — prev R4 inside today R1/R2 (U2) AND prev S4 inside today BC/S1 (L1).
                  { label: "EL1U2",   active: "border-yellow-400 text-yellow-400" },
                  // NEW: EL1U3 — prev R4 inside today R2/R3 (U3) AND prev S4 inside today BC/S1 (L1).
                  { label: "EL1U3",   active: "border-amber-400 text-amber-400" },
                  { label: "EL2U3",   active: "border-orange-400 text-orange-400" },
                  // NEW: ELTU2 — prev R4 inside today R1/R2 (U2) AND prev S4 inside today TC/R1.
                  { label: "ELTU2",   active: "border-yellow-400 text-yellow-400" },
                  // NEW: ELBU2 — prev R4 inside today R1/R2 (U2) AND prev S4 inside today BC/Pivot.
                  { label: "ELBU2",   active: "border-amber-400 text-amber-400" },
                  // NEW: ELTU3 — prev R4 inside today R2/R3 (U3) AND prev S4 inside today TC/R1.
                  { label: "ELTU3",   active: "border-orange-400 text-orange-400" },
                  // NEW: ELPU2 — prev R4 inside today R1/R2 (U2) AND prev S4 inside today Pivot/TC.
                  { label: "ELPU2",   active: "border-yellow-400 text-yellow-400" },
                  // NEW: ELPU3 — prev R4 inside today R2/R3 (U3) AND prev S4 inside today Pivot/TC.
                  { label: "ELPU3",   active: "border-amber-400 text-amber-400" },
                  // NEW: ELBU3 — prev R4 inside today R2/R3 (U3) AND prev S4 inside today BC/Pivot.
                  { label: "ELBU3",   active: "border-orange-400 text-orange-400" },
                  // NEW: EUPL2 — prev S4 inside today S2/S1 (L2) AND prev R4 inside today BC/Pivot.
                  { label: "EUPL2",   active: "border-yellow-400 text-yellow-400" },
                  // NEW: EUTL4 — prev S4 inside today S4/S3 (L4) AND prev R4 inside today Pivot/TC.
                  { label: "EUTL4",   active: "border-amber-400 text-amber-400" },
                  // NEW: L2U3 — today R4 inside prev R2/R3 (U3) AND prev S4 inside today S2/S1 (L2).
                  { label: "L2U3",   active: "border-amber-400 text-amber-400" },
                  // NEW: CU2L1 — today S4 inside prev S1/BC (L1) AND today R4 inside prev R1/R2 (U2).
                  { label: "CU2L1",   active: "border-indigo-800 text-indigo-800" },
                  // NEW: CU3L1 — today S4 inside prev S1/BC (L1) AND today R4 inside prev R2/R3 (U3).
                  { label: "CU3L1",   active: "border-blue-300 text-blue-300" },
                  // NEW: U2L3 — today S4 inside prev S3/S2 (L3) AND prev R4 inside prev's own R1/R2 (U2).
                  { label: "U2L3",   active: "border-lime-400 text-lime-400" },
                  // NEW: EL1U4 — prev R4 inside today R3/R4 (U4) AND prev S4 inside today BC/S1 (L1).
                  { label: "EL1U4",   active: "border-orange-400 text-orange-400" },
                  // NEW: ELBU4 — prev R4 inside today R3/R4 (U4) AND prev S4 inside today BC/Pivot.
                  { label: "ELBU4",   active: "border-yellow-400 text-yellow-400" },
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
              activeView and showAll. */}
          {/* CPR Size — prev day's width (pMicro..pUltra). Own row, own state
              (prevWidthFilter) — independent of the today's-width row below. */}
          {showSizeList && (
          <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-fuchsia-400/90 uppercase tracking-wider mr-0.5 font-semibold">CPR Size (Prev):</span>
              {(
                [
                  { key: "micro",  label: "pMicro",  range: "≤0.10%",         active: "border-violet-400 text-violet-400" },
                  { key: "tiny",   label: "pTiny",   range: "0.10–0.22%",     active: "border-purple-400 text-purple-400" },
                  { key: "mini",   label: "pMini",   range: "0.22–0.60%",     active: "border-teal-400 text-teal-400" },
                  { key: "small",  label: "pSmall",  range: "0.60–1.10%",     active: "border-indigo-400 text-indigo-400" },
                  { key: "medium", label: "pMedium", range: "1.10–2.00%",     active: "border-blue-400 text-blue-400" },
                  { key: "large",  label: "pLarge",  range: "2.00–5.00%",     active: "border-amber-400 text-amber-400" },
                  { key: "mega",   label: "pMega",   range: "5.00–10.00%",    active: "border-orange-400 text-orange-400" },
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
                  { key: "micro",   label: "Micro",   range: "≤0.10%",         active: "border-violet-400 text-violet-400" },
                  { key: "tiny",    label: "Tiny",    range: "0.10–0.22%",     active: "border-purple-400 text-purple-400" },
                  { key: "mini",    label: "Mini",    range: "0.22–0.60%",     active: "border-teal-400 text-teal-400" },
                  { key: "small",   label: "Small",   range: "0.60–1.10%",     active: "border-indigo-400 text-indigo-400" },
                  { key: "medium",  label: "Medium",  range: "1.10–2.00%",     active: "border-blue-400 text-blue-400" },
                  { key: "large",   label: "Large",   range: "2.00–5.00%",     active: "border-amber-400 text-amber-400" },
                  { key: "mega",    label: "Mega",    range: "5.00–10.00%",    active: "border-orange-400 text-orange-400" },
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

          {/* NEW: ENTRY TIME filter — mirrors Exit Time's UI (24 hourly
              toggles, 5AM..4AM next day, 2-row grid aligned so row 2 sits
              directly under row 1). Selection state only for now — not yet
              wired into the display filter chain; functionality to filter
              by entry time will be added in a future update. Whole section
              hidden until "NTime +" is toggled on. */}
          {showEntryTimeList && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `max-content repeat(${TIME_SLOTS_ROW1.length}, max-content)`,
              columnGap: "6px",
              rowGap: "6px",
              alignItems: "center",
            }}
          >
            <span
              style={{ gridColumn: 1, gridRow: 1 }}
              className="text-[10px] text-teal-400/90 uppercase tracking-wider mr-0.5 font-semibold"
            >
              Entry Time:
            </span>
            {TIME_SLOTS_ROW1.map((slot, i) => (
              <button
                key={slot}
                style={{ gridColumn: i + 2, gridRow: 1 }}
                onClick={() => setEntryTimeFilter((v) => (v === slot ? null : slot))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  entryTimeFilter === slot
                    ? "bg-foreground/15 text-foreground border-border"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title={`Entry time ~${slot} (filtering coming soon)`}
              >
                {entryTimeFilter === slot ? `✕ ${slot}` : slot}
              </button>
            ))}
            {TIME_SLOTS_ROW2.map((slot, i) => (
              <button
                key={slot}
                style={{ gridColumn: i + 2, gridRow: 2 }}
                onClick={() => setEntryTimeFilter((v) => (v === slot ? null : slot))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  entryTimeFilter === slot
                    ? "bg-foreground/15 text-foreground border-border"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title={`Entry time ~${slot} (filtering coming soon)`}
              >
                {entryTimeFilter === slot ? `✕ ${slot}` : slot}
              </button>
            ))}
          </div>
          )}

          {/* NEW: EXIT TIME filter — 24 hourly toggles (5AM..4AM next day),
              2-row grid aligned so row 2 (5PM..4AM) sits directly under row 1
              (5AM..4PM). Clicking an hour (e.g. "6PM") shows only rows that
              satisfy at least one Views/sub-pattern targeting that hour,
              across every parent pattern. Mutually exclusive (single
              exitTimeFilter state), independent of activeView,
              PatternFilter, and showAll. Whole section hidden until
              "XTime +" is toggled on. */}
          {showExitTimeList && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `max-content repeat(${TIME_SLOTS_ROW1.length}, max-content)`,
              columnGap: "6px",
              rowGap: "6px",
              alignItems: "center",
            }}
          >
            <span
              style={{ gridColumn: 1, gridRow: 1 }}
              className="text-[10px] text-indigo-400/90 uppercase tracking-wider mr-0.5 font-semibold"
            >
              Exit Time:
            </span>
            {TIME_SLOTS_ROW1.map((slot, i) => (
              <button
                key={slot}
                style={{ gridColumn: i + 2, gridRow: 1 }}
                onClick={() => setExitTimeFilter((v) => (v === slot ? null : slot))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  exitTimeFilter === slot
                    ? "bg-foreground/15 text-foreground border-border"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title={`Show only rows with a Views (sub-pattern) target of ~${slot}`}
              >
                {exitTimeFilter === slot ? `✕ ${slot}` : slot}
              </button>
            ))}
            {TIME_SLOTS_ROW2.map((slot, i) => (
              <button
                key={slot}
                style={{ gridColumn: i + 2, gridRow: 2 }}
                onClick={() => setExitTimeFilter((v) => (v === slot ? null : slot))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  exitTimeFilter === slot
                    ? "bg-foreground/15 text-foreground border-border"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title={`Show only rows with a Views (sub-pattern) target of ~${slot}`}
              >
                {exitTimeFilter === slot ? `✕ ${slot}` : slot}
              </button>
            ))}
          </div>
          )}

          {/* Price Level filter buttons — own row, below CPR Size. Mutually
              exclusive with each other via the single pdhPdlFilter state,
              independent of activeView and showAll. */}
          <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-emerald-400/90 uppercase tracking-wider mr-0.5 font-semibold">Price Level:</span>

              <button
                onClick={() => setPdhPdlFilter((v) => (v === "above" ? null : "above"))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  pdhPdlFilter === "above"
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
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
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows where price is currently below yesterday's Low (PDL)"
              >
                {pdhPdlFilter === "below" ? "✕ <PDL" : "<PDL"}
              </button>
              {/* NEW: >PU4 — price currently above previous day's R4 (Pivot U4) */}
              <button
                onClick={() => setPdhPdlFilter((v) => (v === "abovepu4" ? null : "abovepu4"))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  pdhPdlFilter === "abovepu4"
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows where price is currently above previous day's R4 (PU4)"
              >
                {pdhPdlFilter === "abovepu4" ? "✕ >PU4" : ">PU4"}
              </button>
              {/* NEW: <PL4 — price currently below previous day's S4 (Pivot L4) */}
              <button
                onClick={() => setPdhPdlFilter((v) => (v === "belowpl4" ? null : "belowpl4"))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  pdhPdlFilter === "belowpl4"
                    ? "border-red-400 text-red-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows where price is currently below previous day's S4 (PL4)"
              >
                {pdhPdlFilter === "belowpl4" ? "✕ <PL4" : "<PL4"}
              </button>
              {/* PDH/PDL: subgroup — S1-R1 IN, PDH>U1, PDL<L1 (same row, separator label) */}
              <span className="text-[10px] text-rose-400/90 uppercase tracking-wider ml-2 mr-0.5 font-semibold">PDH/PDL:</span>
              {/* S1R1 IN — S1/R1 (today or prev) sits inside/touching today's or prev's CPR band. */}
              <button
                onClick={() => setPdhPdlFilter((v) => (v === "s1r1in" ? null : "s1r1in"))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  pdhPdlFilter === "s1r1in"
                    ? "border-amber-400 text-amber-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Inside/Outside/Overlap rows where S1, R1, prev S1, or prev R1 sits inside or touches today's or previous CPR band"
              >
                {pdhPdlFilter === "s1r1in" ? "✕ S1-R1 IN" : "S1-R1 IN"}
              </button>
              {/* PDH>U1 — today's Previous Day High is above today's R1 (U1) */}
              <button
                onClick={() => setPdhPdlFilter((v) => (v === "pdhgtu1" ? null : "pdhgtu1"))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  pdhPdlFilter === "pdhgtu1"
                    ? "border-cyan-400 text-cyan-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows where today's Previous Day High (PDH) is above today's R1 (U1)"
              >
                {pdhPdlFilter === "pdhgtu1" ? "✕ PDHL-A" : "PDHL-A"}
              </button>
              {/* NEW: PDL<L1 — today's Previous Day Low is below today's S1 (L1) */}
              <button
                onClick={() => setPdhPdlFilter((v) => (v === "pdlltl1" ? null : "pdlltl1"))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  pdhPdlFilter === "pdlltl1"
                    ? "border-rose-400 text-rose-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows where today's Previous Day Low (PDL) is below today's S1 (L1)"
              >
                {pdhPdlFilter === "pdlltl1" ? "✕ PDHL-B" : "PDHL-B"}
              </button>
          </div>
          </div>

        )}

        {/* Table */}
        {currentStatus === "done" && displayed.length > 0 && (
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
                    const rowKey = `${r.source}-${r.symbol}`;
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
                        activeView={activeSectionKey}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {currentStatus === "done" && displayed.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
            <div className="text-muted-foreground text-sm">No coins match the CPR filter criteria today.</div>
          </div>
        )}

        {/* Footer legend — same idle/scanning hide as the Legend cards above,
            so it doesn't flash before the first scan resolves. */}
        {currentStatus === "done" && (
        <div className="mt-auto pt-8 text-xs text-muted-foreground text-center">
          Binance: top 500 USDT pairs · Delta Exchange: 195 perpetual futures · CPR from completed UTC daily candles
          <br />
          Auto-scans once daily at 5:31 AM IST · PH/PL = Previous Day High/Low · Not financial advice · by Kriven Gokul
        </div>
        )}
      </div>
    </div>
  );
}
