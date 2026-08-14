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
  isRisingAboveTC,
  isCprAbovePU4,
  isL1AbovePU4,
  isPWideAbove,
  cprDistancePct,
  levelsInDistanceRange,
  getPatternInfo,
  computePrevPattern,
  type PatternInfo,
  getSubFilterDirection,
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
 * getting its own hand-written useState + button + pool block like
 * "littleabove"/"littlebelow"/etc. do above it.
 *
 * Why: every new sub-pattern under those older categories needs a new
 * useState, a cleanup-effect entry, a getActivePool() branch, an
 * anySubFilter entry, AND a JSX button — five places to touch, and it's
 * easy to add a sub-pattern to ViewsSidebar's `Views` map and
 * forget one of them (exactly what happened here: CPR 1ABOVE's three
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
  "cpr-1-above",
  "pcpr-u1-cpr-pl1",
  "l1pu1-above",
  "u1-gt-pu4",
  "l1-lt-pl4",
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
const EXTRA_VIEW_COUNT_IDS = ["la-allstepup", "eXLo-L4U4-U4", "9AM:SSRRHHLLA-U4:11PM", "HA-U1>PU4"];

export default function Screener({
  activePattern = "littleabove",
  scanKey = 0,
  onCounts,
}: {
  activePattern?: string;
  scanKey?: number;
  onCounts?: (counts: Record<string, number>) => void;
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
  const [showLABothTiny, setShowLABothTiny] = useState(false);
  const [showLAAllUp, setShowLAAllUp] = useState(false);
  const [showLAPL12CL23, setShowLAPL12CL23] = useState(false);
  const [showLACompressed, setShowLACompressed] = useState(false);
  // NEW: 1LHr-L4U3-U4 filter state — Little Above, placed next to LA-AllUp
  const [showLA1LHr, setShowLA1LHr] = useState(false);
  // NEW: T1-U4:6AM filter state — Little Above
  const [showLAT1U46AM, setShowLAT1U46AM] = useState(false);
  // NEW: Ss-HiL4U4-FAU4:2AM filter state — Little Above
  const [showLASsHiL4U4FAU42AM, setShowLASsHiL4U4FAU42AM] = useState(false);
  // NEW: MeMi-eXL4U3-U4:6PM filter state — Little Above (green family)
  const [showLAMeMieXL4U3U46PM, setShowLAMeMieXL4U3U46PM] = useState(false);
  const [showOutsideCPRCompressed, setShowOutsideCPRCompressed] = useState(false);
  // NEW: eXHrL3U3-AU4 filter state — Outside CPR, placed next to Compressed
  const [showOutsideCPReXHrL3U3AU4, setShowOutsideCPReXHrL3U3AU4] = useState(false);
  const [showHA55HrL4U34FAU4, setShowHA55HrL4U34FAU4] = useState(false);
  const [showBigBelowPMiniPL3, setShowBigBelowPMiniPL3] = useState(false);
  // NEW: live sub-toggle on top of pMini — restrict to rows currently trading above today's TC
  const [showBigBelowPMiniRising, setShowBigBelowPMiniRising] = useState(false);
  // NEW: sound alert — fires only for pMini-L34C4/U3>4 when a coin newly crosses above today's TC
  const [pMiniAlertsEnabled, setPMiniAlertsEnabled] = useState(false);
  const pMiniRisingAlertedRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  // NEW: eX-U4L34 filter state (Big Below)
  const [showExpU3LtPU4, setShowExpU3LtPU4] = useState(false);
  // NEW: eXU4L3-AU4 filter state (Big Below), moved here from LittleCPR
  // Below — placed next to eX-U4L34
  const [showBigBeloweXU4L3AU4, setShowBigBeloweXU4L3AU4] = useState(false);
  // NEW: L1<pL4 filter state (Big Below), next to eX-U4L34
  const [showBigBelowL1LtPL4, setShowBigBelowL1LtPL4] = useState(false);
  // NEW: CPR<pL4 sub-toggle on top of L1<pL4 — restrict to rows where today's BC is below prev day's S4
  const [showL1LtPL4CprLtPL4, setShowL1LtPL4CprLtPL4] = useState(false);
  // NEW: eXU4L2-AU4 filter state (Big Below), placed next to L1<pL4
  const [showBigBeloweXU4L2AU4, setShowBigBeloweXU4L2AU4] = useState(false);
  // NEW: 1T-cOU4L4-ApU4:3PM filter state (Big Below), placed next to eXU4L2-AU4
  const [showBigBelow1TcOU4L43PM, setShowBigBelow1TcOU4L43PM] = useState(false);
  const [showBigAbovePL34CL4, setShowBigAbovePL34CL4] = useState(false);
  // NEW: BigCPR Above — BAComp-l3>pl1/u3>pu1 filter state
  const [showBAComp, setShowBAComp] = useState(false);
  // NEW: U1>PU4 filter state (formerly a left-nav pattern, now a toggle inside BigCPR Above)
  const [showHAU1, setShowHAU1] = useState(false);
  // NEW: CPR>PU4 sub-toggle on top of U1>PU4 — restrict to rows where today's BC is above prev day's R4
  const [showHAU1CprAbovePU4, setShowHAU1CprAbovePU4] = useState(false);
  // NEW: L1>PU4 sub-toggle, nested on top of CPR>PU4 — restrict to rows where
  // today's S1 is above prev day's R4
  const [showHAU1L1AbovePU4, setShowHAU1L1AbovePU4] = useState(false);
  // NEW: pWideAbove sub-toggle, nested on top of U1>PU4 (independent of the
  // CPR>PU4/L1>PU4 chain) — restrict to rows where prev day's CPR is wider
  // than pp-CPR AND prev day's CPR sits above pp-CPR.
  const [showHAU1PWideAbove, setShowHAU1PWideAbove] = useState(false);
  // NEW: hR-HAL — top-level toggle inside BigCPR Above, placed next to Show All
  const [showHRHAL, setShowHRHAL] = useState(false);
  // NEW: 1T-HiL4U4-FAU4 — BigCPR Above, placed next to hR-HAL/HA55-HrL4U34-FAU4
  const [showHiL4U4FAU4, setShowHiL4U4FAU4] = useState(false);
  // NEW: 1S-cOL3U4-FAU4:1AM filter state — BigCPR Above
  const [show1ScoHiFAU4, setShow1ScoHiFAU4] = useState(false);
  // NEW: TS-cOL3U4-AU4R:4PM filter state — BigCPR Above (same as 1S-cOHi-FAU4:1AM
  // but prev CPR width category Tiny instead of pMicro)
  const [show2ScoHiFAU4, setShow2ScoHiFAU4] = useState(false);
  // NEW: eXL4U2-U4:4AM / TiMi-cOL2U2-pL4:5AM filter state — BigCPR Above
  // Views entries that existed in ViewsSidebar's Views list but had
  // no matching Screener button (same class of bug as CPR Inside's missing
  // Views).
  const [showBAeXL4U2, setShowBAeXL4U2] = useState(false);
  const [showBATiMicOL2U2, setShowBATiMicOL2U2] = useState(false);
  // NEW: LB Compressed filter state
  const [showLBCmprss, setShowLBCmprss] = useState(false);
  const [showLBC34, setShowLBC34] = useState(false);
  // NEW: lbE11-cOLoL3U2-PU4 filter state — LittleCPR Below, placed next to lb-c-l34c4/u23c4
  const [showLBE11, setShowLBE11] = useState(false);
  // NEW: LB cO2-L2U2 filter state (Compressed inside Previous L2/U2)
  const [showLBC2L2U2, setShowLBC2L2U2] = useState(false);
  // NEW: LB-BothTiny / LB-AllUp filter state (replaces hidden left-nav items)
  const [showLBBothTiny, setShowLBBothTiny] = useState(false);
  const [showLBAllUp, setShowLBAllUp] = useState(false);
  // NEW: L1-cOU1L2-U4:1AM filter state — Little Below Views entry that had
  // no Screener button (see LB-BothTiny comment above for the same class of bug)
  const [showLBL1cOU1L2, setShowLBL1cOU1L2] = useState(false);
  const [showExpU4PU4, setShowExpU4PU4] = useState(false);
  // RENAMED from "Exp-U3>U3": 9AM:SSRRBHHLLA-U4:9PM filter state
  // (Overlapping Lower). Bullish/uptrend, green color family.
  const [showExpU3PU3, setShowExpU3PU3] = useState(false);
  // NEW: OBN-LoU4L4-U4 / OBW-LoU4L4-L4 filter state (Overlapping Lower), placed next to Exp-U3>pU4
  const [showOBNLoU4L4, setShowOBNLoU4L4] = useState(false);
  const [showOBWLoU4L4, setShowOBWLoU4L4] = useState(false);
  // NEW: 2PM:SSLLpRRHHA-ApU4:5PM filter state (Overlapping Lower) — placed
  // next to OBN-LoU4L4-U4 / OBW-LoU4L4-L4. Overlap Below + SSLLAbove +
  // RRHHBelow, bullish, targets ApU4 (prev day's R4) by ~5PM.
  const [showOBLoSSLLRRHH, setShowOBLoSSLLRRHH] = useState(false);
  // NEW: eXHi-L4U4-U4 filter state (Overlapping Higher) — counterpart of
  // eXLo-L4U4-U4 (Overlapping Lower), same r.eXL4U4 boolean, gated on
  // r.overlapHigher instead of r.overlapLower.
  const [showOBHiExL4U4, setShowOBHiExL4U4] = useState(false);
   const [showLMeXL2U2, setShowLMeXL2U2] = useState(false);
  // NEW: cOL3U3-pL4 / 7AM:MiMi-pU4:11PM / 6PM:LaLa->U4:2AM filter state —
  // Overlapping Higher Views entries that existed in ViewsSidebar's
  // Views list but had no matching Screener button (same class of
  // bug as CPR Inside's missing Views).
  const [showOBHicOL3U3pL4, setShowOBHicOL3U3pL4] = useState(false);
  const [showOBHi7AMMiMi, setShowOBHi7AMMiMi] = useState(false);
  const [showOBHi6PMLaLa, setShowOBHi6PMLaLa] = useState(false);
  // NEW: generic Views (sub-pattern) toggle — covers every category listed
  // in GENERIC_VIEW_CATEGORIES (CPR 1ABOVE, PREVCPR 1ABOVE, L1pU1 Above,
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
  // across ALL parent patterns — independent of activePattern.
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
  // NEW: PDH/PDL filter — independent of activePattern, mutually exclusive (like pivot/width filters).
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
  const activePatternRef = useRef(activePattern);
  useEffect(() => { allResultsRef.current = allResults; }, [allResults]);
  useEffect(() => { deltaAllResultsRef.current = deltaAllResults; }, [deltaAllResults]);
  useEffect(() => { activePatternRef.current = activePattern; }, [activePattern]);

  // NEW: auto-hide "Show All" whenever a left-nav view/category is clicked.
  // ViewsSidebar's onSelect (both handlePatternClick for top-level categories
  // and handleSubClick for their Views/sub-patterns) updates activePattern,
  // so any change to activePattern after the initial mount means the user
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
  }, [activePattern]);

  // NEW: resolve activePattern to its parent left-nav category ("section").
  // Clicking a top-level category in the left-nav sets activePattern to the
  // category id directly (e.g. "l1pu1-above"), but clicking one of its
  // Views/sub-patterns instead (e.g. "SMi-L1pU1>-APU4:11PM") sets
  // activePattern to that LEAF id — ViewsSidebar's handleSubClick calls
  // onSelect(subId), not onSelect(parentId). Row filtering already handles
  // both cases fine (passesPattern resolves leaf ids directly), but
  // anything keyed off the *category* — the Views button row and the
  // per-row green/red direction dot (getSubFilterDirection) — was comparing
  // against the raw activePattern and so went blank whenever a leaf was
  // selected via the left-nav. activeSectionKey resolves either case back
  // to the owning category so those two stay populated regardless of
  // whether the category or one of its leaves triggered the selection.
  const activeSectionKey = useMemo(() => {
    if (Views[activePattern]) return activePattern; // already a category id
    for (const [section, subs] of Object.entries(Views)) {
      if (subs.some((s) => s.id === activePattern)) return section;
    }
    return activePattern; // not a known category or leaf — leave as-is
  }, [activePattern]);

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
      setFiltered(results.filter((r) => passesPattern(r, activePattern)));
      setStatus("done");
      markScannedToday();
      setNextScanUtc(getNextScanIST());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    } finally {
      scanRef.current = false;
    }
  }, [activePattern]);

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
      setDeltaFiltered(results.filter((r) => passesPattern(r, activePattern)));
      setDeltaStatus("done");
    } catch (e) {
      setDeltaError(e instanceof Error ? e.message : "Unknown error");
      setDeltaStatus("error");
    } finally {
      deltaScanRef.current = false;
    }
  }, [activePattern]);

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

  // NEW: sound alert — only for pMini-L34C4/U3>4 (structure-bigbelow) when a coin newly goes Rising
  function playPMiniAlertSound() {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      [0, 0.18].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.16);
      });
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (!pMiniAlertsEnabled) return;
    if (activePattern !== "structure-bigbelow" || !showBigBelowPMiniPL3) return;

    const binancePMini = allResults
      .filter((r) => passesPattern(r, "bigbelow-pmini-pl3"))
      .map((r) => ({ ...r, source: "binance" as const }));
    const deltaPMini = deltaAllResults
      .filter((r) => passesPattern(r, "bigbelow-pmini-pl3"))
      .map((r) => ({ ...r, source: "delta" as const }));
    const pool = [...binancePMini, ...deltaPMini];

    const currentRisingKeys = new Set(
      pool.filter((r) => isRisingAboveTC(r)).map((r) => `${r.source}-${r.symbol}`)
    );

    let newlyRising = false;
    currentRisingKeys.forEach((key) => {
      if (!pMiniRisingAlertedRef.current.has(key)) {
        pMiniRisingAlertedRef.current.add(key);
        newlyRising = true;
      }
    });
    // Drop symbols that fell back out of Rising/pool so they can re-alert if they cross again later
    pMiniRisingAlertedRef.current.forEach((key) => {
      if (!currentRisingKeys.has(key)) pMiniRisingAlertedRef.current.delete(key);
    });

    if (newlyRising) playPMiniAlertSound();
  }, [allResults, deltaAllResults, activePattern, showBigBelowPMiniPL3, pMiniAlertsEnabled]);

  useEffect(() => {
    if (allResults.length > 0) setFiltered(allResults.filter((r) => passesPattern(r, activePattern)));
    if (deltaAllResults.length > 0) setDeltaFiltered(deltaAllResults.filter((r) => passesPattern(r, activePattern)));
    if (activePattern !== "littleabove") { setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); setShowLAT1U46AM(false); setShowLASsHiL4U4FAU42AM(false); setShowLAMeMieXL4U3U46PM(false); }
    if (activePattern !== "outside-cpr") { setShowOutsideCPRCompressed(false); setShowOutsideCPReXHrL3U3AU4(false); }
    if (activePattern !== "overlapping-lower") { setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); }
    // NEW: reset eXHi-L4U4-U4 toggle when leaving Overlapping Higher
    if (activePattern !== "overlapping-higher") { setShowOBHiExL4U4(false); setShowLMeXL2U2(false); setShowOBHicOL3U3pL4(false); setShowOBHi7AMMiMi(false); setShowOBHi6PMLaLa(false); }
    if (activePattern !== "structure-bigbelow") { setShowBigBelowPMiniPL3(false); setShowBigBelowPMiniRising(false); pMiniRisingAlertedRef.current.clear(); setShowExpU3LtPU4(false); setShowBigBeloweXU4L3AU4(false); setShowBigBelowL1LtPL4(false); setShowL1LtPL4CprLtPL4(false); setShowBigBeloweXU4L2AU4(false); setShowBigBelow1TcOU4L43PM(false); }
    if (activePattern !== "structure-bigabove") { setShowBigAbovePL34CL4(false); setShowBAComp(false); setShowHAU1(false); setShowHAU1CprAbovePU4(false); setShowHAU1L1AbovePU4(false); setShowHAU1PWideAbove(false); setShowHRHAL(false); setShowHA55HrL4U34FAU4(false); setShowHiL4U4FAU4(false); setShow1ScoHiFAU4(false); setShow2ScoHiFAU4(false); setShowBAeXL4U2(false); setShowBATiMicOL2U2(false); }
    // Reset LB Compressed / LB-C34 / lbE11-cOLoL3U2-PU4 / LB-cO2-L2U2 / LB-BothTiny / LB-AllUp when leaving littlebelow
    if (activePattern !== "littlebelow") { setShowLBCmprss(false); setShowLBC34(false); setShowLBE11(false); setShowLBC2L2U2(false); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBL1cOU1L2(false); }
  }, [activePattern, allResults, deltaAllResults]);

  // ─── Two-way sync between the left-nav Views and the Screener's own
  //     Views filter buttons ────────────────────────────────────────────────
  // VIEW_SETTERS maps a left-nav Views (sub-pattern) id to the Screener
  // state setter of the hand-written button that implements the same filter,
  // so selecting a View in the sidebar also switches its Screener button on
  // (and the effect below turns every other one off).
  const VIEW_SETTERS: Record<string, (v: boolean) => void> = {
    // littleabove
    "la-2tiny": setShowLABothTiny,
    "la-allstepup": setShowLAAllUp,
    "1LHr-L4U3-U4": setShowLA1LHr,
    "LA-PL12CL23": setShowLAPL12CL23,
    "sT-cOL2U3-APU4": setShowLACompressed,
    "T1-U4:6AM": setShowLAT1U46AM,
    "Ss-HiL4U4-FAU4:2AM": setShowLASsHiL4U4FAU42AM,
    "MeMi-eXL4U3-U4:6PM": setShowLAMeMieXL4U3U46PM,
    // littlebelow
    "lb-micro2-apu4": setShowLBBothTiny,
    "lb-allstepdown": setShowLBAllUp,
    "lb-cmprss-l4>3-u4<2": setShowLBCmprss,
    "lb-c-l34c4/u23c4": setShowLBC34,
    "lbE11-cOLoL3U2-PU4": setShowLBE11,
    "co2-l2u2": setShowLBC2L2U2,
    "L1-cOU1L2-U4:1AM": setShowLBL1cOU1L2,
    // overlapping-lower
    "eXLo-L4U4-U4": setShowExpU4PU4,
    // NEW: wire renamed "9AM:SSRRBHHLLA-U4:9PM" (was "Exp-U3>U3") into
    // VIEW_SETTERS — it existed in ViewsSidebar's Views list but had no
    // matching entry here, same class of bug as CPR Inside's missing Views.
    "9AM:SSRRBHHLLA-U4:9PM": setShowExpU3PU3,
    "OBN-LoU4L4-U4": setShowOBNLoU4L4,
    "OBW-LoU4L4-L4": setShowOBWLoU4L4,
    "2PM:SSLLpRRHHA-ApU4:5PM": setShowOBLoSSLLRRHH,
    // overlapping-higher
    "eXHi-L4U4-U4": setShowOBHiExL4U4,
    "LMe-eXL2U2-L4:10PM": setShowLMeXL2U2,
    "cOL3U3-pL4": setShowOBHicOL3U3pL4,
    "7AM:MiMi-pU4:11PM": setShowOBHi7AMMiMi,
    "6PM:LaLa->U4:2AM": setShowOBHi6PMLaLa,
    // outside-cpr
    "outside-cpr-compressed": setShowOutsideCPRCompressed,
    "eXHrL3U3-AU4": setShowOutsideCPReXHrL3U3AU4,
    // structure-bigabove
    "9AM:SSRRHHLLA-U4:11PM": setShowBigAbovePL34CL4,
    "bacomp-l3>pl1/u3>pu1": setShowBAComp,
    "HA-U1>PU4": setShowHAU1,
    "hR-HAL": setShowHRHAL,
    "HA55-HrL4U34-FAU4": setShowHA55HrL4U34FAU4,
    "1T-HiL4U4-FAU4": setShowHiL4U4FAU4,
    "1S-cOL3U4-FAU4:1AM": setShow1ScoHiFAU4,
    "TS-cOL3U4-AU4R:4PM": setShow2ScoHiFAU4,
    "eXL4U2-U4:4AM": setShowBAeXL4U2,
    "TiMi-cOL2U2-pL4:5AM": setShowBATiMicOL2U2,
    // structure-bigbelow
    "bigbelow-pmini-pl3": setShowBigBelowPMiniPL3,
    "eX-U4L34": setShowExpU3LtPU4,
    "eXU4L3-AU4": setShowBigBeloweXU4L3AU4,
    "eXU4L2-AU4": setShowBigBeloweXU4L2AU4,
    "1T-cOU4L4-ApU4:3PM": setShowBigBelow1TcOU4L43PM,
  };

  // Current on/off state of each of those buttons — used to detect when the
  // user closes (✕) the Screener button for the View that the left-nav has
  // selected, so we can deselect it in the sidebar too.
  const VIEW_STATES: Record<string, boolean> = {
    "la-2tiny": showLABothTiny,
    "la-allstepup": showLAAllUp,
    "1LHr-L4U3-U4": showLA1LHr,
    "LA-PL12CL23": showLAPL12CL23,
    "sT-cOL2U3-APU4": showLACompressed,
    "T1-U4:6AM": showLAT1U46AM,
    "Ss-HiL4U4-FAU4:2AM": showLASsHiL4U4FAU42AM,
    "MeMi-eXL4U3-U4:6PM": showLAMeMieXL4U3U46PM,
    "lb-micro2-apu4": showLBBothTiny,
    "lb-allstepdown": showLBAllUp,
    "lb-cmprss-l4>3-u4<2": showLBCmprss,
    "lb-c-l34c4/u23c4": showLBC34,
    "lbE11-cOLoL3U2-PU4": showLBE11,
    "co2-l2u2": showLBC2L2U2,
    "L1-cOU1L2-U4:1AM": showLBL1cOU1L2,
    "eXLo-L4U4-U4": showExpU4PU4,
    "OBN-LoU4L4-U4": showOBNLoU4L4,
    "OBW-LoU4L4-L4": showOBWLoU4L4,
    "2PM:SSLLpRRHHA-ApU4:5PM": showOBLoSSLLRRHH,
    "eXHi-L4U4-U4": showOBHiExL4U4,
    "LMe-eXL2U2-L4:10PM": showLMeXL2U2,
    "cOL3U3-pL4": showOBHicOL3U3pL4,
    "7AM:MiMi-pU4:11PM": showOBHi7AMMiMi,
    "6PM:LaLa->U4:2AM": showOBHi6PMLaLa,
    "outside-cpr-compressed": showOutsideCPRCompressed,
    "eXHrL3U3-AU4": showOutsideCPReXHrL3U3AU4,
    "9AM:SSRRHHLLA-U4:11PM": showBigAbovePL34CL4,
    "bacomp-l3>pl1/u3>pu1": showBAComp,
    "HA-U1>PU4": showHAU1,
    "hR-HAL": showHRHAL,
    "HA55-HrL4U34-FAU4": showHA55HrL4U34FAU4,
    "1T-HiL4U4-FAU4": showHiL4U4FAU4,
    "1S-cOL3U4-FAU4:1AM": show1ScoHiFAU4,
    "TS-cOL3U4-AU4R:4PM": show2ScoHiFAU4,
    "eXL4U2-U4:4AM": showBAeXL4U2,
    "TiMi-cOL2U2-pL4:5AM": showBATiMicOL2U2,
    "bigbelow-pmini-pl3": showBigBelowPMiniPL3,
    "eX-U4L34": showExpU3LtPU4,
    "eXU4L3-AU4": showBigBeloweXU4L3AU4,
    "eXU4L2-AU4": showBigBeloweXU4L2AU4,
    "1T-cOU4L4-ApU4:3PM": showBigBelow1TcOU4L43PM,
  };

  // Is activePattern a Views leaf (a sub-pattern) rather than a category?
  const isLeafView = useMemo(
    () => Object.values(Views).some((subs) => subs.some((s) => s.id === activePattern)),
    [activePattern],
  );

  // Sidebar → Screener: whenever the left-nav selects a View leaf, switch the
  // matching Screener filter button on. Runs after the reset effect above
  // (which clears every button on each activePattern / results change), so the
  // selected one survives while the rest stay off.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!isLeafView) return;
    const setter = VIEW_SETTERS[activePattern];
    if (setter) {
      Object.entries(VIEW_SETTERS).forEach(([id, set]) => set(id === activePattern));
      setActiveGenericSubView(null);
    } else {
      // generic (data-driven) Views button
      setActiveGenericSubView(activePattern);
    }
  }, [activePattern, isLeafView, allResults, deltaAllResults]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Sidebar → Screener (deselect): clicking the "✕" on an active View chip in
  // the left nav falls back to its parent category, so activePattern goes from
  // a leaf to a non-leaf. The category-level reset above only clears buttons
  // when leaving the category entirely, so clear every View filter button here
  // too — both surfaces show the same filter and must switch off together.
  const prevPatternRef = useRef(activePattern);
  useEffect(() => {
    const prev = prevPatternRef.current;
    prevPatternRef.current = activePattern;
    if (prev === activePattern) return;
    const prevWasLeaf = Object.values(Views).some((subs) => subs.some((s) => s.id === prev));
    if (prevWasLeaf && !isLeafView) {
      Object.values(VIEW_SETTERS).forEach((set) => set(false));
      setActiveGenericSubView(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePattern, isLeafView]);

  // Screener → Sidebar: when the currently-selected View's Screener button is
  // closed with its ✕, tell the left-nav to deselect the same View (falls back
  // to its parent category). Only fires on a true → false transition so the
  // sync effect above never triggers it.
  const activeViewOn = VIEW_SETTERS[activePattern]
    ? !!VIEW_STATES[activePattern]
    : activeGenericSubView === activePattern;
  const prevActiveViewOnRef = useRef(false);
  useEffect(() => {
    const wasOn = prevActiveViewOnRef.current;
    prevActiveViewOnRef.current = activeViewOn;
    if (isLeafView && wasOn && !activeViewOn) requestViewDeselect(activePattern);
  }, [activeViewOn, isLeafView, activePattern]);
  // NEW: reset the generic Views toggle whenever it no longer belongs to
  // the current activePattern — either because we've left every generic
  // category entirely, or because we've switched from one generic category
  // to another (e.g. "cpr-1-above" -> "l1pu1-above") and the previously
  // selected sub-pattern id doesn't exist under the new one.
  useEffect(() => {
    if (!activeGenericSubView) return;
    const stillValid =
      GENERIC_VIEW_CATEGORIES.has(activeSectionKey) &&
      (Views[activeSectionKey] ?? []).some((s) => s.id === activeGenericSubView);
    if (!stillValid) setActiveGenericSubView(null);
  }, [activePattern, activeSectionKey]);
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
    if (showLABothTiny && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "la-2tiny")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "la-2tiny")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showLAAllUp && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "la-allstepup")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "la-allstepup")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 1LHr-L4U3-U4 pool — Little Above: today's S4 above prev S4 and
    // below prev S3, today's R3 above prev R4, today's CPR width < 0.1%,
    // prev CPR width between 0.1% and 1%
    if (showLA1LHr && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "1LHr-L4U3-U4")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "1LHr-L4U3-U4")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showLAPL12CL23 && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "LA-PL12CL23")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "LA-PL12CL23")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showLACompressed && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "sT-cOL2U3-APU4")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "sT-cOL2U3-APU4")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: T1-U4:6AM pool — Little Above
    if (showLAT1U46AM && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "T1-U4:6AM")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "T1-U4:6AM")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: Ss-HiL4U4-FAU4:2AM pool — Little Above
    if (showLASsHiL4U4FAU42AM && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "Ss-HiL4U4-FAU4:2AM")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "Ss-HiL4U4-FAU4:2AM")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: MeMi-eXL4U3-U4:6PM pool — Little Above (green family)
    if (showLAMeMieXL4U3U46PM && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "MeMi-eXL4U3-U4:6PM")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "MeMi-eXL4U3-U4:6PM")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showOutsideCPRCompressed && activePattern === "outside-cpr") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "outside-cpr-compressed"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "outside-cpr-compressed"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: eXHrL3U3-AU4 pool — Outside CPR: prev S4 between today's S3/S4,
    // prev R4 between today's R2/R3, today's CPR width 0.5%–2%, prev CPR
    // width < 0.5%
    if (showOutsideCPReXHrL3U3AU4 && activePattern === "outside-cpr") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eXHrL3U3-AU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eXHrL3U3-AU4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showBigBelowPMiniPL3 && activePattern === "structure-bigbelow") {
      let binanceIntersect = allResults
        .filter((r) => passesPattern(r, "bigbelow-pmini-pl3"))
        .map((r) => ({ ...r, source: "binance" as const }));
      let deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "bigbelow-pmini-pl3"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (showBigBelowPMiniRising) {
        binanceIntersect = binanceIntersect.filter((r) => isRisingAboveTC(r));
        deltaIntersect = deltaIntersect.filter((r) => isRisingAboveTC(r));
      }
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: eX-U4L34 pool — Big Below, prev R4 inside today's R3/R4, prev S4 inside
    // today's S2/S3, prev day CPR tight (<1%), today's CPR tight (<3%)
    if (showExpU3LtPU4 && activePattern === "structure-bigbelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eX-U4L34"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eX-U4L34"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: eXU4L3-AU4 pool — Big Below (moved from LittleCPR Below): prev
    // R4 between today's R3/R4, prev S4 above today's S3, today's CPR width
    // 0.5%-2%, prev CPR width < 0.5%. Placed next to eX-U4L34.
    if (showBigBeloweXU4L3AU4 && activePattern === "structure-bigbelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eXU4L3-AU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eXU4L3-AU4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: L1<pL4 pool — Big Below, today's S1 < prev S4 AND today's R2 > prev R4
    if (showBigBelowL1LtPL4 && activePattern === "structure-bigbelow") {
      let binanceIntersect = allResults
        .filter((r) => passesPattern(r, "L1<pL4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      let deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "L1<pL4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      // NEW: CPR<pL4 sub-toggle — restrict to rows where today's TC is below prev day's S4
      if (showL1LtPL4CprLtPL4) {
        binanceIntersect = binanceIntersect.filter((r) => r.todayCPR.tc < r.prevCPR.s4);
        deltaIntersect = deltaIntersect.filter((r) => r.todayCPR.tc < r.prevCPR.s4);
      }
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: eXU4L2-AU4 pool — Big Below, placed next to L1<pL4. Pivot
    // Level eXU4L2 + prev R3 above today's R3 + today R1/prev S1 between
    // the two pivots + prev CPR pSmall + today CPR 1%-2% wide.
    if (showBigBeloweXU4L2AU4 && activePattern === "structure-bigbelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eXU4L2-AU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eXU4L2-AU4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 1T-cOU4L4-ApU4:3PM pool — Big Below, placed next to eXU4L2-AU4.
    // cOU4L4 pivot + prev R1 between today R1/R2 + today S1 between prev S1/S2
    // + prev PDH > prev R1 + prev CPR pMicro (<=0.10%) + today CPR Tiny (0.10%-0.22%).
    if (showBigBelow1TcOU4L43PM && activePattern === "structure-bigbelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "1T-cOU4L4-ApU4:3PM"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "1T-cOU4L4-ApU4:3PM"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showBigAbovePL34CL4 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "9AM:SSRRHHLLA-U4:11PM"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "9AM:SSRRHHLLA-U4:11PM"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: BigCPR Above — BAComp-l3>pl1/u3>pu1 pool
    if (showBAComp && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "bacomp-l3>pl1/u3>pu1"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "bacomp-l3>pl1/u3>pu1"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: hR-HAL pool — BigCPR Above, top-level toggle next to Show All
    if (showHRHAL && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "hR-HAL"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "hR-HAL"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: HA55-HrL4U34-FAU4 pool — BigCPR Above, placed next to hR-HAL
    if (showHA55HrL4U34FAU4 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
      .filter((r) => passesPattern(r, "HA55-HrL4U34-FAU4"))
      .map((r) => ({...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
      .filter((r) => passesPattern(r, "HA55-HrL4U34-FAU4"))
      .map((r) => ({...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect,...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 1T-HiL4U4-FAU4 pool — BigCPR Above, placed next to hR-HAL/HA55-HrL4U34-FAU4
    if (showHiL4U4FAU4 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "1T-HiL4U4-FAU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "1T-HiL4U4-FAU4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 1S-cOL3U4-FAU4:1AM pool — BigCPR Above
    if (show1ScoHiFAU4 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "1S-cOL3U4-FAU4:1AM"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "1S-cOL3U4-FAU4:1AM"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: TS-cOL3U4-AU4R:4PM pool — BigCPR Above
    if (show2ScoHiFAU4 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "TS-cOL3U4-AU4R:4PM"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "TS-cOL3U4-AU4R:4PM"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: U1>PU4 pool — BigCPR Above, today's R1 above prev day's R4
    if (showHAU1 && activePattern === "structure-bigabove") {
      let binanceIntersect = allResults
        .filter((r) => passesPattern(r, "HA-U1>PU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      let deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "HA-U1>PU4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      // NEW: pWideAbove sub-toggle — restrict to rows where prev day's CPR is
      // wider than pp-CPR AND prev day's CPR sits above pp-CPR. Independent
      // of the CPR>PU4 / L1>PU4 chain below — both can be active together.
      if (showHAU1PWideAbove) {
        binanceIntersect = binanceIntersect.filter((r) => isPWideAbove(r));
        deltaIntersect = deltaIntersect.filter((r) => isPWideAbove(r));
      }
      // NEW: CPR>PU4 sub-toggle — restrict to rows where today's BC is above prev day's R4
      if (showHAU1CprAbovePU4) {
        binanceIntersect = binanceIntersect.filter((r) => isCprAbovePU4(r));
        deltaIntersect = deltaIntersect.filter((r) => isCprAbovePU4(r));
        // NEW: L1>PU4 sub-toggle, nested on top of CPR>PU4 — restrict to rows
        // where today's S1 is above prev day's R4
        if (showHAU1L1AbovePU4) {
          binanceIntersect = binanceIntersect.filter((r) => isL1AbovePU4(r));
          deltaIntersect = deltaIntersect.filter((r) => isL1AbovePU4(r));
        }
      }
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: LB Compressed pool
    if (showLBCmprss && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lb-cmprss-l4>3-u4<2"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lb-cmprss-l4>3-u4<2"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: LB-C-L34C4/U23C4 pool
    if (showLBC34 && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lb-c-l34c4/u23c4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lb-c-l34c4/u23c4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: lbE11-cOLoL3U2-PU4 pool — LittleCPR Below, today's R4 inside prev
    // R1/R2 AND today's S4 inside prev S2/S3, both CPRs between 1% and 1.5% wide
    if (showLBE11 && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lbE11-cOLoL3U2-PU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lbE11-cOLoL3U2-PU4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: LB cO2-L2U2 pool — Compressed inside Previous L2/U2
    if (showLBC2L2U2 && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "co2-l2u2"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "co2-l2u2"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // Micro2-ApU4 pool — CHANGED: was wired to legacy id "lb-2tiny", which
    // dropped out of ViewsSidebar's littlebelow Views list (replaced
    // by "lb-micro2-apu4" / "Micro2-ApU4"), so the left-nav Views entry had
    // no matching Screener button and this button pointed at a Views entry
    // no longer in the left-nav. Repointed at "lb-micro2-apu4" so both
    // surfaces agree.
    if (showLBBothTiny && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lb-micro2-apu4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lb-micro2-apu4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: L1-cOU1L2-U4:1AM pool — Little Below Views entry that existed in
    // the left-nav (ViewsSidebar Views.littlebelow) but never got a
    // Screener button.
    if (showLBL1cOU1L2 && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "L1-cOU1L2-U4:1AM"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "L1-cOU1L2-U4:1AM"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showExpU4PU4 && activePattern === "overlapping-lower") {
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
    // NEW: eXHi-L4U4-U4 pool — Overlapping Higher counterpart of
    // eXLo-L4U4-U4 (Overlapping Lower). Same r.eXL4U4 boolean, gated on
    // r.overlapHigher and the pSmall(prev)/Tiny(today) width bands.
    if (showOBHiExL4U4 && activePattern === "overlapping-higher") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eXHi-L4U4-U4"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eXHi-L4U4-U4"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: LMe-eXL2U2-L4:10PM pool
    if (showLMeXL2U2 && activePattern === "overlapping-higher") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "LMe-eXL2U2-L4:10PM"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "LMe-eXL2U2-L4:10PM"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: cOL3U3-pL4 pool — Overlapping Higher Views entry with no
    // Screener button
    if (showOBHicOL3U3pL4 && activePattern === "overlapping-higher") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "cOL3U3-pL4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "cOL3U3-pL4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 7AM:MiMi-pU4:11PM pool — Overlapping Higher Views entry with no
    // Screener button
    if (showOBHi7AMMiMi && activePattern === "overlapping-higher") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "7AM:MiMi-pU4:11PM"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "7AM:MiMi-pU4:11PM"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 6PM:LaLa->U4:2AM pool — Overlapping Higher Views entry with no
    // Screener button
    if (showOBHi6PMLaLa && activePattern === "overlapping-higher") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "6PM:LaLa->U4:2AM"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "6PM:LaLa->U4:2AM"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: eXL4U2-U4:4AM pool — BigCPR Above Views entry with no Screener button
    if (showBAeXL4U2 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eXL4U2-U4:4AM"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eXL4U2-U4:4AM"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: TiMi-cOL2U2-pL4:5AM pool — BigCPR Above Views entry with no Screener button
    if (showBATiMicOL2U2 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "TiMi-cOL2U2-pL4:5AM"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "TiMi-cOL2U2-pL4:5AM"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // RENAMED from "Exp-U3>U3": 9AM:SSRRBHHLLA-U4:9PM pool
    if (showExpU3PU3 && activePattern === "overlapping-lower") {
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
    // NEW: OBN-LoU4L4-U4 pool — Overlapping Lower, Narrow variant
    if (showOBNLoU4L4 && activePattern === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "OBN-LoU4L4-U4"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "OBN-LoU4L4-U4"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: OBW-LoU4L4-L4 pool — Overlapping Lower, Wide variant
    if (showOBWLoU4L4 && activePattern === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "OBW-LoU4L4-L4"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "OBW-LoU4L4-L4"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: 2PM:SSLLpRRHHA-ApU4:5PM pool — Overlapping Lower, SSLLAbove +
    // RRHHBelow variant, placed next to OBW-LoU4L4-L4.
    if (showOBLoSSLLRRHH && activePattern === "overlapping-lower") {
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
    // NEW: LB-AllUp pool (formerly "LittleBelow - Ladder" left-nav item)
    if (showLBAllUp && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lb-allstepdown"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lb-allstepdown"))
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
    // NEW: cOU1L2 / cOU3L4 are independent booleans in cpr.ts (not
    // actually gated behind srLower), so a row can satisfy one of them
    // AND a higher-priority bucket (e.g. srHigher) at the same time.
    // getPatternInfo() only ever returns ONE label per row and checks the
    // other buckets first, so matching on getPatternInfo(r)?.label would
    // silently miss rows where cOU1L2/cOU3L4 is true but shadowed by
    // an earlier bucket. Check the raw flags directly for these two so
    // the filter buttons actually work independent of the primary badge.
    .filter((r) => {
      if (!PatternFilter) return true;
      if (PatternFilter === "cOU3L4") return r.cOU3L4;
      if (PatternFilter === "LoU4L4") return r.LoU4L4;
      // NEW: eXL4U4 — independent, section-agnostic Pattern flag (see
      // doc-comment on PatternInfo/getPatternInfo in ScreenerUtils.tsx).
      if (PatternFilter === "eXL4U4") return r.eXL4U4;
      // NEW: eXU4L4 — independent, section-agnostic Pattern flag, mirror
      // of eXL4U4 gated on srExpandedLower instead of srExpandedHigher
      // (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (PatternFilter === "eXU4L4") return r.eXU4L4;
      // NEW: EqL4U4 — today R4 == prev R4 AND today S4 == prev S4 (cpr.ts).
      if (PatternFilter === "EqL4U4") return r.EqL4U4;
      if (PatternFilter === "eXL3U3") return r.eXL3U3;
      if (PatternFilter === "eXU3L3") return r.eXU3L3;
      // NEW: HiL4U4 — independent, section-agnostic Pattern flag,
      // mirror of eXL4U4 (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (PatternFilter === "HiL2U4") return r.HiL2U4;
      if (PatternFilter === "HiL2U3") return r.HiL2U3;
      if (PatternFilter === "HiL3U4") return r.HiL3U4;
      if (PatternFilter === "HiL4U4") return r.HiL4U4;
      // NEW: eXL4U3 — unconditional Pattern flag.
      if (PatternFilter === "eXL4U3") return r.eXL4U3;
      // NEW: HiL4U3 / cOL2U3 — same treatment: independent,
      // section-agnostic Pattern flags, always shown regardless of
      // activePattern/left-nav.
      if (PatternFilter === "HiL4U3") return r.HiL4U3;
      // NEW: HiL4U2 — same treatment as HiL4U3: independent,
      // section-agnostic Pattern flag, always shown regardless of
      // activePattern/left-nav.
      if (PatternFilter === "HiL4U2") return r.HiL4U2;
      if (PatternFilter === "HiL4U1") return r.HiL4U1;
      // NEW: LoTCL3 — same treatment as HiL4U3/HiL4U2: independent,
      // section-agnostic Pattern flag, always shown regardless of
      // activePattern/left-nav.
      if (PatternFilter === "LoTCL3") return r.LoTCL3;
      if (PatternFilter === "eXHiL2L1") return r.eXHiL2L1;
      if (PatternFilter === "eXLoL2L1") return r.eXLoL2L1;
      if (PatternFilter === "cOL2U3") return r.cOL2U3;
      if (PatternFilter === "cOL3U3") return r.cOL3U3;
      // NEW: eXU4L2 — independent, section-agnostic Pattern flag
      // (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (PatternFilter === "eXU4L2") return r.eXU4L2;
      // NEW: eXU4L3 — independent, section-agnostic Pattern flag
      // (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (PatternFilter === "eXU4L3") return r.eXU4L3;
      if (PatternFilter === "cOL2U4") return r.cOL2U4;
      if (PatternFilter === "cOL4U4") return r.cOL4U4;
      if (PatternFilter === "cOL3U4") return r.cOL3U4;
      if (PatternFilter === "cOU3L3") return r.cOU3L3;
      if (PatternFilter === "LoU3L4") return r.LoU3L4;
      if (PatternFilter === "LoU3L3") return r.LoU3L3;
      if (PatternFilter === "LoU2L4") return r.LoU2L4;
      if (PatternFilter === "LoU2L3") return r.LoU2L3;
      if (PatternFilter === "LoU4L3") return r.LoU4L3;
      if (PatternFilter === "LoU4L2") return r.LoU4L2;
      if (PatternFilter === "cOU2L3") return r.cOU2L3;
      if (PatternFilter === "LoU4L1") return r.LoU4L1;
      if (PatternFilter === "cOU2L4") return r.cOU2L4;
      // NEW: eXL*U1 / eXL*CPR sub-type badges
      if (PatternFilter === "eXL2U1") return r.eXL2U1;
      if (PatternFilter === "eXL3U1") return r.eXL3U1;
      if (PatternFilter === "eXL4U1") return r.eXL4U1;
      if (PatternFilter === "eXL1BC") return r.eXL1BC;
      if (PatternFilter === "eXL1CP") return r.eXL1CP;
      if (PatternFilter === "eXL1TC") return r.eXL1TC;
      if (PatternFilter === "eXL2BC") return r.eXL2BC;
      if (PatternFilter === "eXL3BC") return r.eXL3BC;
      if (PatternFilter === "eXL3CP") return r.eXL3CP;
      // NEW: cOU1L1 / cOL1U1 / cOU2L2 / cOL2U2 — independent,
      // section-agnostic Pattern flags (see cpr.ts).
      if (PatternFilter === "cOU1L1") return r.cOU1L1;
      if (PatternFilter === "cOL1U1") return r.cOL1U1;
      if (PatternFilter === "cOU2L2") return r.cOU2L2;
      if (PatternFilter === "cOL2U2") return r.cOL2U2;
      // NEW: cOU1L2 — independent, section-agnostic Pattern flag (see cpr.ts).
      if (PatternFilter === "cOU1L2") return r.cOU1L2;
      if (PatternFilter === "cOU4L4") return r.cOU4L4;
      if (PatternFilter === "exL3U2") return r.exL3U2;
      // NEW: expanded family — eXL3TC / eXL4U2 / eXL2U2 / eXL2TC / eXL1U1
      if (PatternFilter === "eXL3TC") return r.eXL3TC;
      if (PatternFilter === "eXL4U2") return r.eXL4U2;
      if (PatternFilter === "eXL2U2") return r.eXL2U2;
      if (PatternFilter === "eXL2TC") return r.eXL2TC;
      if (PatternFilter === "eXL1U1") return r.eXL1U1;
      // NEW: eXU1L1 — same band shape as eXL1U1, split by which gap (R1-R4 vs S1-S4) is larger
      if (PatternFilter === "eXU1L1") return r.eXU1L1;
      if (PatternFilter === "eXU2L1") return r.eXU2L1;
      // NEW: eXU3L1 (prev R4 in today R2/R3, prev S4 in today BC/S1) /
      // eXU2TC (prev R4 in today R1/R2, prev S4 in today TC/R1)
      if (PatternFilter === "eXU3L1") return r.eXU3L1;
      if (PatternFilter === "eXU3L2") return r.eXU3L2;
      if (PatternFilter === "eXU2TC") return r.eXU2TC;
      // NEW: eXU2BC (prev R4 in today R1/R2, prev S4 in today BC/Pivot) /
      // eXU3TC (prev R4 in today R2/R3, prev S4 in today TC/R1) /
      // eXU2CP (prev R4 in today R1/R2, prev S4 in today Pivot/TC)
      if (PatternFilter === "eXU2BC") return r.eXU2BC;
      if (PatternFilter === "eXU3TC") return r.eXU3TC;
      if (PatternFilter === "eXU2CP") return r.eXU2CP;
      // NEW: eXU3CP (prev R4 in today R2/R3, prev S4 in today Pivot/TC)
      if (PatternFilter === "eXU3CP") return r.eXU3CP;
      // NEW: eXU3BC (prev R4 in today R2/R3, prev S4 in today BC/Pivot)
      if (PatternFilter === "eXU3BC") return r.eXU3BC;
      // NEW: eXL2CP (prev S4 in today S2/S1, prev R4 in today BC/Pivot)
      if (PatternFilter === "eXL2CP") return r.eXL2CP;
      // NEW: eXL4TC (prev S4 in today S4/S3, prev R4 in today Pivot/TC)
      if (PatternFilter === "eXL4TC") return r.eXL4TC;
      // NEW: LoU3L2 (today R4 in prev R2/R3, prev S4 in today S2/S1)
      if (PatternFilter === "LoU3L2") return r.LoU3L2;
      // NEW: cOL1U2 (today S4 in prev S1/BC, today R4 in prev R1/R2)
      if (PatternFilter === "cOL1U2") return r.cOL1U2;
      // NEW: cOL1U3 (today S4 in prev S1/BC, today R4 in prev R2/R3)
      if (PatternFilter === "cOL1U3") return r.cOL1U3;
      // NEW: HiL3U2 (today S4 in prev S3/S2, prev R4 in prev R1/R2)
      if (PatternFilter === "HiL3U2") return r.HiL3U2;
      return getPatternInfo(r)?.label === PatternFilter;
    })
    .filter((r) => matchesWidthFilter(r, prevWidthFilter, todayWidthFilter))
    // NEW: Price Level filter — price above PDH, below PDL, above prev day's
    // R4 (PU4), or below prev day's S4 (PL4)
    .filter((r) => {
      if (pdhPdlFilter === "s1r1in") {
        const eligible =
          passesPattern(r, "inside-cpr") ||
          passesPattern(r, "outside-cpr") ||
          passesPattern(r, "overlapping-higher") ||
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
    // every parent pattern (independent of activePattern/PatternFilter).
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
    showLABothTiny || showLAAllUp || showLA1LHr || showLAPL12CL23 || showLACompressed || showLAT1U46AM || showLASsHiL4U4FAU42AM || showLAMeMieXL4U3U46PM ||
    showOutsideCPRCompressed || showOutsideCPReXHrL3U3AU4 ||
    showBigBelowPMiniPL3 || showBigBelowPMiniRising || showExpU3LtPU4 || showBigBeloweXU4L3AU4 || showBigBelowL1LtPL4 || showL1LtPL4CprLtPL4 || showBigBeloweXU4L2AU4 || showBigBelow1TcOU4L43PM ||
    showBigAbovePL34CL4 || showBAComp || showHAU1 || showHAU1CprAbovePU4 || showHAU1L1AbovePU4 || showHAU1PWideAbove || showHRHAL || showHA55HrL4U34FAU4 || showHiL4U4FAU4 || show1ScoHiFAU4 || show2ScoHiFAU4 || showBAeXL4U2 || showBATiMicOL2U2 || showLBCmprss || showLBC34 || showLBE11 || showLBC2L2U2 ||
    showLBBothTiny || showLBAllUp || showLBL1cOU1L2 || showExpU4PU4 || showExpU3PU3 || showOBNLoU4L4 || showOBWLoU4L4 || showOBLoSSLLRRHH || showOBHiExL4U4 || showLMeXL2U2 || showOBHicOL3U3pL4 || showOBHi7AMMiMi || showOBHi6PMLaLa ||
    !!activeGenericSubView ||
    !!PatternFilter || !!prevWidthFilter || !!todayWidthFilter || !!pdhPdlFilter || !!exitTimeFilter;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl px-4 py-8 min-h-screen flex flex-col">
        {/* Header — description paragraph removed, spacing tightened so the
            title row and the Legend grid below both sit higher on the page. */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">PIVOT LEVEL Screener</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              by Kriven Gokul (PivotBull)
            </span>
          </div>

          <LiveClock />
        </div>

        {/* Legend */}
       <ScreenerLegend
          activePattern={activePattern}
          showBAComp={showBAComp}
          showLACompressed={showLACompressed}
          showLAT1U46AM={showLAT1U46AM}
          showLASsHiL4U4FAU42AM={showLASsHiL4U4FAU42AM}
          showLAMeMieXL4U3U46PM={showLAMeMieXL4U3U46PM}
          showLBE11={showLBE11}
          showLBC2L2U2={showLBC2L2U2}
          showExpU4PU4={showExpU4PU4}
          showExpU3PU3={showExpU3PU3}
          showOBNLoU4L4={showOBNLoU4L4}
          showOBWLoU4L4={showOBWLoU4L4}
          showOBHiExL4U4={showOBHiExL4U4}
          showExpU3LtPU4={showExpU3LtPU4}
          showBigBeloweXU4L3AU4={showBigBeloweXU4L3AU4}
          showBigBeloweXU4L2AU4={showBigBeloweXU4L2AU4}
          showBigBelow1TcOU4L43PM={showBigBelow1TcOU4L43PM}
          showHRHAL={showHRHAL}
          showHiL4U4FAU4={showHiL4U4FAU4}
          show1ScoHiFAU4={show1ScoHiFAU4}
          show2ScoHiFAU4={show2ScoHiFAU4}
          showHAU1L1AbovePU4={showHAU1L1AbovePU4}
          showHAU1PWideAbove={showHAU1PWideAbove}
          showHAU1={showHAU1}
          showOutsideCPReXHrL3U3AU4={showOutsideCPReXHrL3U3AU4}
          showLMeXL2U2={showLMeXL2U2}
        />

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
                  setShowLABothTiny(false);
                  setShowLAAllUp(false);
                  setShowLA1LHr(false);
                  setShowLAPL12CL23(false);
                  setShowLACompressed(false);
                  setShowLAT1U46AM(false);
                  setShowLASsHiL4U4FAU42AM(false);
                  setShowLAMeMieXL4U3U46PM(false);
                  setShowOutsideCPRCompressed(false);
                  setShowOutsideCPReXHrL3U3AU4(false);
                  // NEW: also clear the generic Views (sub-pattern) selection —
                  // covers inside-cpr and every other GENERIC_VIEW_CATEGORIES
                  // category, so "Show All" fully resets state everywhere.
                  setActiveGenericSubView(null);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  setShowExpU3LtPU4(false);
                  setShowBigBeloweXU4L3AU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBeloweXU4L2AU4(false);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHRHAL(false);
                  setShowHA55HrL4U34FAU4(false);
                  setShowHiL4U4FAU4(false);
                  setShow1ScoHiFAU4(false);
                  setShow2ScoHiFAU4(false);
                  setShowBAeXL4U2(false);
                  setShowBATiMicOL2U2(false);
                  setShowLBCmprss(false);
                  setShowLBC34(false);
                  setShowLBE11(false);
                  setShowLBC2L2U2(false);
                  setShowLBBothTiny(false);
                  setShowLBAllUp(false);
                  setShowLBL1cOU1L2(false);
                  setShowExpU4PU4(false);
                  setShowExpU3PU3(false);
                  setShowOBNLoU4L4(false);
                  setShowOBWLoU4L4(false);
                  setShowOBHiExL4U4(false);
                  setShowOBHicOL3U3pL4(false);
                  setShowOBHi7AMMiMi(false);
                  setShowOBHi6PMLaLa(false);
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

            {/* NEW: hR-HAL button — BigCPR Above, placed next to Show All */}
            {activeSectionKey === "structure-bigabove" && !showAll && (
              <button
                onClick={() => {
                  setShowHRHAL((v) => !v);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHiL4U4FAU4(false);
                  setShow1ScoHiFAU4(false);
                  setShow2ScoHiFAU4(false);
                  setShowBAeXL4U2(false);
                  setShowBATiMicOL2U2(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHRHAL
                    ? "border-orange-400 text-orange-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="WideAbove, Pivot Level: Higher, Today's TC between Prev R1/R2, Today's R3 > Prev R4"
              >
                {showHRHAL ? "✕ hR-HAL" : "hR-HAL"}<ViewCount id={"hR-HAL"} counts={viewCounts} />
              </button>
            )}

            {activeSectionKey === "structure-bigabove" &&!showAll && (
              <button
                onClick={() => { 
                  setShowHA55HrL4U34FAU4((v) =>!v); 
                  setShowBigAbovePL34CL4(false); 
                  setShowBAComp(false); 
                  setShowHAU1(false); 
                  setShowHAU1CprAbovePU4(false); 
                  setShowHAU1L1AbovePU4(false); 
                  setShowHAU1PWideAbove(false); 
                  setShowHRHAL(false); 
                  setShowHiL4U4FAU4(false);
                  setShow1ScoHiFAU4(false);
                  setShow2ScoHiFAU4(false);
                  setShowBAeXL4U2(false);
                  setShowBATiMicOL2U2(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHA55HrL4U34FAU4
                  ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Today S4 between Prev S3/S4, Prev R4 between Today R3/R2, Both CPRs Wide >=5%"
              >
                {showHA55HrL4U34FAU4? "✕ HA55-HrL4U34-FAU4" : "HA55-HrL4U34-FAU4"}
              </button>
            )}
            {/* NEW: 1T-HiL4U4-FAU4 button — BigCPR Above, placed next to
                HA55-HrL4U34-FAU4. Wide Above + HiL4U4 + prev CPR pMicro +
                today's CPR Tiny. */}
            {activeSectionKey === "structure-bigabove" && !showAll && (
              <button
                onClick={() => {
                  setShowHiL4U4FAU4((v) => !v);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHRHAL(false);
                  setShowHA55HrL4U34FAU4(false);
                  setShow1ScoHiFAU4(false);
                  setShow2ScoHiFAU4(false);
                  setShowBAeXL4U2(false);
                  setShowBATiMicOL2U2(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHiL4U4FAU4
                    ? "border-fuchsia-400 text-fuchsia-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Wide Above + HiL4U4 (Prev R4 inside today's R3/R4, Today's S4 inside Prev S3/S4) + Prev CPR pMicro (<=0.10%) + Today CPR Tiny (0.10%-0.25%)"
              >
                {showHiL4U4FAU4 ? "✕ 1T-HiL4U4-FAU4" : "1T-HiL4U4-FAU4"}<ViewCount id={"1T-HiL4U4-FAU4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: 1S-cOL3U4-FAU4:1AM button — BigCPR Above.
                Pivot cOL3U4 + today's S1 > prev pivot + prev CPR ≤0.10% +
                today CPR 0.60%–1.10%. */}
            {activeSectionKey === "structure-bigabove" && !showAll && (
              <button
                onClick={() => {
                  setShow1ScoHiFAU4((v) => !v);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHRHAL(false);
                  setShowHA55HrL4U34FAU4(false);
                  setShowHiL4U4FAU4(false);
                  setShow2ScoHiFAU4(false);
                  setShowBAeXL4U2(false);
                  setShowBATiMicOL2U2(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  show1ScoHiFAU4
                    ? "border-teal-400 text-teal-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Pivot cOL3U4 + Today's S1 > Prev Pivot + Prev CPR width ≤ 0.10% + Today CPR width 0.60%–1.10%"
              >
                {show1ScoHiFAU4 ? "✕ 1S-cOL3U4-FAU4:1AM" : "1S-cOL3U4-FAU4:1AM"}<ViewCount id={"1S-cOL3U4-FAU4:1AM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: TS-cOL3U4-AU4R:4PM button — BigCPR Above.
                Same as 1S-cOHi-FAU4:1AM but prev CPR width category Tiny
                (0.10%-0.22%) instead of pMicro (<=0.10%). */}
            {activeSectionKey === "structure-bigabove" && !showAll && (
              <button
                onClick={() => {
                  setShow2ScoHiFAU4((v) => !v);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHRHAL(false);
                  setShowHA55HrL4U34FAU4(false);
                  setShowHiL4U4FAU4(false);
                  setShow1ScoHiFAU4(false);
                  setShowBAeXL4U2(false);
                  setShowBATiMicOL2U2(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  show2ScoHiFAU4
                    ? "border-cyan-400 text-cyan-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Pivot cOL3U4 + Today's S1 > Prev Pivot + Prev CPR width 0.10%–0.22% (Tiny) + Today CPR width 0.60%–1.10% (Small)"
              >
                {show2ScoHiFAU4 ? "✕ TS-cOL3U4-AU4R:4PM" : "TS-cOL3U4-AU4R:4PM"}<ViewCount id={"TS-cOL3U4-AU4R:4PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: eXL4U2-U4:4AM button — BigCPR Above Views entry with no Screener button */}
            {activeSectionKey === "structure-bigabove" && !showAll && (
              <button
                onClick={() => {
                  setShowBAeXL4U2((v) => !v);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHRHAL(false);
                  setShowHA55HrL4U34FAU4(false);
                  setShowHiL4U4FAU4(false);
                  setShow1ScoHiFAU4(false);
                  setShow2ScoHiFAU4(false);
                  setShowBATiMicOL2U2(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBAeXL4U2
                    ? "border-lime-400 text-lime-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows matching eXL4U2-U4:4AM"
              >
                {showBAeXL4U2 ? "✕ eXL4U2-U4:4AM" : "eXL4U2-U4:4AM"}<ViewCount id={"eXL4U2-U4:4AM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: TiMi-cOL2U2-pL4:5AM button — BigCPR Above Views entry with no Screener button */}
            {activeSectionKey === "structure-bigabove" && !showAll && (
              <button
                onClick={() => {
                  setShowBATiMicOL2U2((v) => !v);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHRHAL(false);
                  setShowHA55HrL4U34FAU4(false);
                  setShowHiL4U4FAU4(false);
                  setShow1ScoHiFAU4(false);
                  setShow2ScoHiFAU4(false);
                  setShowBAeXL4U2(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBATiMicOL2U2
                    ? "border-rose-400 text-rose-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows matching TiMi-cOL2U2-pL4:5AM"
              >
                {showBATiMicOL2U2 ? "✕ TiMi-cOL2U2-pL4:5AM" : "TiMi-cOL2U2-pL4:5AM"}<ViewCount id={"TiMi-cOL2U2-pL4:5AM"} counts={viewCounts} />
              </button>
            )}
            {/* CHANGED: label/id now match ViewsSidebar's littlebelow
                Views entry "lb-micro2-apu4" / "Micro2-ApU4" (was
                stuck on the legacy "lb-2tiny" id + "LB-BothTiny" label,
                which no longer appears in the left-nav). */}
            {activeSectionKey === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBBothTiny((v) => !v); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBC34(false); setShowLBE11(false); setShowLBC2L2U2(false); setShowLBL1cOU1L2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBBothTiny
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Little Below, both CPRs micro-narrow (<=0.10%), all step-down / all up-below stacked, prev R4/S4 inside today's R3-R4/S3-S4"
              >
                {showLBBothTiny ? "✕ Micro2-ApU4" : "Micro2-ApU4"}<ViewCount id={"lb-micro2-apu4"} counts={viewCounts} />
              </button>
            )}

            {/* NEW: LB-AllUp button — replaces hidden "LittleBelow - Ladder" left-nav item */}
            {activeSectionKey === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBAllUp((v) => !v); setShowLBBothTiny(false); setShowLBCmprss(false); setShowLBC34(false); setShowLBE11(false); setShowLBC2L2U2(false); setShowLBL1cOU1L2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBAllUp
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleBelow AND LittleBelow-Ladder (all R/S levels stepped down)"
              >
                {showLBAllUp ? "✕ LB-AllUp" : "LB-AllUp"}<ViewCount id={"lb-allstepdown"} counts={viewCounts} />
              </button>
            )}

            {/* NEW: lb-Cmprss-L4>3/U4<2 button — only shown on littlebelow, mirrors Show All style */}
            {activeSectionKey === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBCmprss((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBC34(false); setShowLBE11(false); setShowLBC2L2U2(false); setShowLBL1cOU1L2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBCmprss
                    ? "border-violet-400 text-violet-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="LB, Compressed: Todays L4 > PDay L3 / Todays U4 < PDays L2: Target:PU4"
              >
                {showLBCmprss ? "✕ lb-Cmprss-L4>3/U4<2" : "lb-Cmprss-L4>3/U4<2"}<ViewCount id={"lb-cmprss-l4>3-u4<2"} counts={viewCounts} />
              </button>
            )}

            {/* NEW: lb-c-l34c4/u23c4 button — only shown on littlebelow, mirrors lb-Cmprss style */}
            {activeSectionKey === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBC34((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBE11(false); setShowLBC2L2U2(false); setShowLBL1cOU1L2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBC34
                    ? "border-pink-400 text-pink-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="LB, PL34CL4 / Today R4 between Prev R2 and R3"
              >
                {showLBC34 ? "✕ lb-c-l34c4/u23c4" : "lb-c-l34c4/u23c4"}<ViewCount id={"lb-c-l34c4/u23c4"} counts={viewCounts} />
              </button>
            )}

            {/* NEW: lbE11-cOLoL3U2-PU4 button — only shown on littlebelow, placed right after lb-c-l34c4/u23c4 */}
            {activeSectionKey === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBE11((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBC34(false); setShowLBC2L2U2(false); setShowLBL1cOU1L2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBE11
                    ? "border-amber-400 text-amber-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Today's R4 inside Prev R1/R2 AND Today's S4 inside Prev S2/S3, both CPRs 1%-1.5% wide: Target:Bullish PU4"
              >
                {showLBE11 ? "✕ lbE11-cOLoL3U2-PU4" : "lbE11-cOLoL3U2-PU4"}<ViewCount id={"lbE11-cOLoL3U2-PU4"} counts={viewCounts} />
              </button>
            )}

            {/* NEW: cO2-L2U2 button — only shown on littlebelow, placed right after lbE11-cOLoL3U2-PU4 */}
            {activeSectionKey === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBC2L2U2((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBC34(false); setShowLBE11(false); setShowLBL1cOU1L2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBC2L2U2
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Compressed Inside Previous L2 and Previous U2: Target: Bullish U4"
              >
                {showLBC2L2U2 ? "✕ cO2-L2U2" : "cO2-L2U2"}<ViewCount id={"co2-l2u2"} counts={viewCounts} />
              </button>
            )}

            {/* NEW: L1-cOU1L2-U4:1AM button — left-nav Views entry that had no Screener button */}
            {activeSectionKey === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBL1cOU1L2((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBC34(false); setShowLBE11(false); setShowLBC2L2U2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBL1cOU1L2
                    ? "border-sky-400 text-sky-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="cOU1L2 + today's R1 above prev BC and below today's PDH, prev CPR Large (2%-5%), today CPR Micro (<=0.10%): Target U4 ~1AM"
              >
                {showLBL1cOU1L2 ? "✕ L1-cOU1L2-U4:1AM" : "L1-cOU1L2-U4:1AM"}<ViewCount id={"L1-cOU1L2-U4:1AM"} counts={viewCounts} />
              </button>
            )}

            {activeSectionKey === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLABothTiny((v) => !v); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); setShowLAT1U46AM(false); setShowLASsHiL4U4FAU42AM(false); setShowLAMeMieXL4U3U46PM(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLABothTiny
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleAbove AND TinyAbove-Both Tiny"
              >
                {showLABothTiny ? "✕ LA-BothTiny" : "LA-BothTiny"}<ViewCount id={"la-2tiny"} counts={viewCounts} />
              </button>
            )}
            {activeSectionKey === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLAAllUp((v) => !v); setShowLABothTiny(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); setShowLAT1U46AM(false); setShowLASsHiL4U4FAU42AM(false); setShowLAMeMieXL4U3U46PM(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLAAllUp
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleAbove AND LittleAbove-Ladder (all R/S levels stepped up)"
              >
                {showLAAllUp ? "✕ LA-AllUp" : "LA-AllUp"}<ViewCount id={"la-allstepup"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: 1LHr-L4U3-U4 button — Little Above, placed next to LA-AllUp */}
            {activeSectionKey === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLA1LHr((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLAPL12CL23(false); setShowLACompressed(false); setShowLAT1U46AM(false); setShowLASsHiL4U4FAU42AM(false); setShowLAMeMieXL4U3U46PM(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLA1LHr
                    ? "border-teal-400 text-teal-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Todays S4 > Prev S4 & < Prev S3, Todays R3 > Prev R4, Today CPR width < 0.1%, Prev CPR width 0.1%–1%"
              >
                {showLA1LHr ? "✕ 1LHr-L4U3-U4" : "1LHr-L4U3-U4"}<ViewCount id={"1LHr-L4U3-U4"} counts={viewCounts} />
              </button>
            )}
            {activeSectionKey === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLAPL12CL23((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLACompressed(false); setShowLAT1U46AM(false); setShowLASsHiL4U4FAU42AM(false); setShowLAMeMieXL4U3U46PM(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLAPL12CL23
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols matching LA-PL12CL23:2PL4 (Bearish Target: 2PL4)"
              >
                {showLAPL12CL23 ? "✕ PL12CL23" : "PL12CL23"}<ViewCount id={"LA-PL12CL23"} counts={viewCounts} />
              </button>
            )}
            {activeSectionKey === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLACompressed((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLAT1U46AM(false); setShowLASsHiL4U4FAU42AM(false); setShowLAMeMieXL4U3U46PM(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLACompressed
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Compressed Inside Previous L2 and Previous U3: Target:Bullish APU4"
              >
                {showLACompressed ? "✕ cOL2U3-ApU4" : "cOL2U3-ApU4"}<ViewCount id={"sT-cOL2U3-APU4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: T1-U4:6AM — Little Above */}
            {activeSectionKey === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLAT1U46AM((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); setShowLASsHiL4U4FAU42AM(false); setShowLAMeMieXL4U3U46PM(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLAT1U46AM
                    ? "border-orange-400 text-orange-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Today's Pivot > Prev R1, Prev CPR pTiny (0.10–0.22%), Today CPR Micro (≤0.10%) — Target: U4 at 6AM"
              >
                {showLAT1U46AM ? "✕ T1-U4:6AM" : "T1-U4:6AM"}<ViewCount id={"T1-U4:6AM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: Ss-HiL4U4-FAU4:2AM — Little Above */}
            {activeSectionKey === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLASsHiL4U4FAU42AM((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); setShowLAT1U46AM(false); setShowLAMeMieXL4U3U46PM(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLASsHiL4U4FAU42AM
                    ? "border-fuchsia-400 text-fuchsia-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="cprRising + narrowCPR + AllStepUp above/below + Today S1>Prev PDL + Today R1>Prev PDH + Today PDH>Today R1, both CPRs 0.60%–1.10% (Small) — Target: Far Above U4 (T-5 U4) at 2AM"
              >
                {showLASsHiL4U4FAU42AM ? "✕ Ss-HiL4U4-FAU4:2AM" : "Ss-HiL4U4-FAU4:2AM"}<ViewCount id={"Ss-HiL4U4-FAU4:2AM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: MeMi-eXL4U3-U4:6PM — Little Above (green family) */}
            {activeSectionKey === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLAMeMieXL4U3U46PM((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); setShowLAT1U46AM(false); setShowLASsHiL4U4FAU42AM(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLAMeMieXL4U3U46PM
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="cprRising + narrowCPR + eXL4U3 + Today's TC >= Prev R1, Prev CPR 1.10%–2.00% (Medium), Today CPR 0.22%–0.60% (Mini) — Target: U4 (T-5 AU4) at 6PM"
              >
                {showLAMeMieXL4U3U46PM ? "✕ MeMi-eXL4U3-U4:6PM" : "MeMi-eXL4U3-U4:6PM"}<ViewCount id={"MeMi-eXL4U3-U4:6PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: generic Views (sub-pattern) buttons — covers CPR 1ABOVE,
                PREVCPR 1ABOVE, L1pU1 Above, U1>pU4, L1<pL4, Equal CPR (see
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
                  : activePattern === sub.id; // left-nav navigated straight to this leaf
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
                onClick={() => { setShowExpU4PU4((v) => !v); setShowExpU3PU3(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); }}
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
                onClick={() => { setShowExpU3PU3((v) => !v); setShowExpU4PU4(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); }}
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
            {/* NEW: OBN-LoU4L4-U4 button — Overlapping Lower, placed next to Exp-U3>pU4 */}
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBNLoU4L4((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBWLoU4L4(false); setShowOBLoSSLLRRHH(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBNLoU4L4
                    ? "border-cyan-400 text-cyan-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Lower + today's CPR Narrow + LoU4L4 structure, Compression > 50%: Target:U4"
              >
                {showOBNLoU4L4 ? "✕ OBN-LoU4L4-U4" : "OBN-LoU4L4-U4"}<ViewCount id={"OBN-LoU4L4-U4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: OBW-LoU4L4-L4 button — Overlapping Lower, placed next to OBN-LoU4L4-U4 */}
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBWLoU4L4((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBNLoU4L4(false); setShowOBLoSSLLRRHH(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBWLoU4L4
                    ? "border-rose-400 text-rose-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Lower + today's CPR Wide + LoU4L4 structure, Compression > 50%: Target:U4"
              >
                {showOBWLoU4L4 ? "✕ OBW-LoU4L4-L4" : "OBW-LoU4L4-L4"}<ViewCount id={"OBW-LoU4L4-L4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: 2PM:SSLLpRRHHA-ApU4:5PM button — Overlapping Lower, placed
                next to OBW-LoU4L4-L4. Overlap Below + SSLLAbove (today's S1
                AND today's PDL both above the higher of prev's S1/PDL) +
                RRHHBelow (today's R1 AND today's PDH both below the lower of
                prev's R1/PDH). Bullish, green color family, targets ApU4
                (prev day's R4) by ~5PM. */}
            {activeSectionKey === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBLoSSLLRRHH((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBNLoU4L4(false); setShowOBWLoU4L4(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBLoSSLLRRHH
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Lower + SSLLAbove (today's S1 & PDL above the higher of prev S1/PDL) + RRHHBelow (today's R1 & PDH below the lower of prev R1/PDH): Target ApU4 (prev day's R4) by ~5PM"
              >
                {showOBLoSSLLRRHH ? "✕ 2PM:SSLLpRRHHA-ApU4:5PM" : "2PM:SSLLpRRHHA-ApU4:5PM"}<ViewCount id={"2PM:SSLLpRRHHA-ApU4:5PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: eXHi-L4U4-U4 button — Overlapping Higher, counterpart of
                eXLo-L4U4-U4 under Overlapping Lower. Same r.eXL4U4 boolean
                from cpr.ts, gated on r.overlapHigher + pSmall(prev)/Tiny(today). */}
            {activeSectionKey === "overlapping-higher" && !showAll && (
              <button
                onClick={() => {
                  setShowOBHiExL4U4((v) => !v);
                  setShowLMeXL2U2(false);
                  setShowOBHicOL3U3pL4(false);
                  setShowOBHi7AMMiMi(false);
                  setShowOBHi6PMLaLa(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBHiExL4U4
                    ? "border-pink-400 text-pink-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Higher: Prev R4 between today's R3/R4, Prev S4 between today's S3/S4, Prev CPR pSmall, Today CPR Tiny"
              >
                {showOBHiExL4U4 ? "✕ eXHi-L4U4-U4" : "eXHi-L4U4-U4"}<ViewCount id={"eXHi-L4U4-U4"} counts={viewCounts} />
              </button>
            )}
            {activeSectionKey === "outside-cpr" && !showAll && (
              <button
                onClick={() => { setShowOutsideCPRCompressed((v) => !v); setShowOutsideCPReXHrL3U3AU4(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOutsideCPRCompressed
                    ? "border-purple-400 text-purple-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show OutsideCPR symbols where today R4 < prev R4 AND today S4 > prev S4 (compressed range)"
              >
                {showOutsideCPRCompressed ? "✕ Compressed" : "Compressed"}<ViewCount id={"outside-cpr-compressed"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: eXHrL3U3-AU4 button — Outside CPR, placed next to Compressed */}
            {activeSectionKey === "outside-cpr" && !showAll && (
              <button
                onClick={() => { setShowOutsideCPReXHrL3U3AU4((v) => !v); setShowOutsideCPRCompressed(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOutsideCPReXHrL3U3AU4
                    ? "border-rose-400 text-rose-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Prev S4 between today's S3/S4 AND Prev R4 between today's R2/R3, Today CPR width 0.5%-2%, Prev CPR width <0.5%"
              >
                {showOutsideCPReXHrL3U3AU4 ? "✕ eXHrL3U3-AU4" : "eXHrL3U3-AU4"}<ViewCount id={"eXHrL3U3-AU4"} counts={viewCounts} />
              </button>
            )}
             {/* NEW: LMe-eXL2U2-L4:10PM button — Overlap Above */}
            {activeSectionKey === "overlapping-higher" && !showAll && (
              <button
                onClick={() => {
                  setShowLMeXL2U2((v) => !v);
                  setShowOBHiExL4U4(false);
                  setShowOBHicOL3U3pL4(false);
                  setShowOBHi7AMMiMi(false);
                  setShowOBHi6PMLaLa(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLMeXL2U2
                    ? "border-red-400 text-red-400 bg-red-500/10"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Above + eXL2U2 pivot band + Compression Ratio 60%–90%. Target L4 by ~10PM."
              >
                {showLMeXL2U2 ? "✕ LMe-eXL2U2-L4:10PM" : "LMe-eXL2U2-L4:10PM"}<ViewCount id={"LMe-eXL2U2-L4:10PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: cOL3U3-pL4 button — Overlapping Higher Views entry with no Screener button */}
            {activeSectionKey === "overlapping-higher" && !showAll && (
              <button
                onClick={() => {
                  setShowOBHicOL3U3pL4((v) => !v);
                  setShowOBHiExL4U4(false);
                  setShowLMeXL2U2(false);
                  setShowOBHi7AMMiMi(false);
                  setShowOBHi6PMLaLa(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBHicOL3U3pL4
                    ? "border-blue-400 text-blue-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows matching cOL3U3-pL4"
              >
                {showOBHicOL3U3pL4 ? "✕ cOL3U3-pL4" : "cOL3U3-pL4"}<ViewCount id={"cOL3U3-pL4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: 7AM:MiMi-pU4:11PM button — Overlapping Higher Views entry with no Screener button */}
            {activeSectionKey === "overlapping-higher" && !showAll && (
              <button
                onClick={() => {
                  setShowOBHi7AMMiMi((v) => !v);
                  setShowOBHiExL4U4(false);
                  setShowLMeXL2U2(false);
                  setShowOBHicOL3U3pL4(false);
                  setShowOBHi6PMLaLa(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBHi7AMMiMi
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows matching 7AM:MiMi-pU4:11PM"
              >
                {showOBHi7AMMiMi ? "✕ 7AM:MiMi-pU4:11PM" : "7AM:MiMi-pU4:11PM"}<ViewCount id={"7AM:MiMi-pU4:11PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: 6PM:LaLa->U4:2AM button — Overlapping Higher Views entry with no Screener button */}
            {activeSectionKey === "overlapping-higher" && !showAll && (
              <button
                onClick={() => {
                  setShowOBHi6PMLaLa((v) => !v);
                  setShowOBHiExL4U4(false);
                  setShowLMeXL2U2(false);
                  setShowOBHicOL3U3pL4(false);
                  setShowOBHi7AMMiMi(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBHi6PMLaLa
                    ? "border-amber-400 text-amber-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows matching 6PM:LaLa->U4:2AM"
              >
                {showOBHi6PMLaLa ? "✕ 6PM:LaLa->U4:2AM" : "6PM:LaLa->U4:2AM"}<ViewCount id={"6PM:LaLa->U4:2AM"} counts={viewCounts} />
              </button>
            )}
            {activeSectionKey === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowBigBelowPMiniPL3((v) => !v);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowExpU3LtPU4(false);
                  setShowBigBeloweXU4L3AU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBeloweXU4L2AU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBelowPMiniPL3
                    ? "border-cyan-400 text-cyan-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Compressed, Mini PCPR, PL34CL4, Prev U3 above U4: Target-APU4"
              >
                {showBigBelowPMiniPL3 ? "✕ pMini-L34C4/U3>4" : "pMini-L34C4/U3>4"}<ViewCount id={"bigbelow-pmini-pl3"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: eX-U4L34 button — Big Below, placed next to pMini-L34C4/U3>4 */}
            {activeSectionKey === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowExpU3LtPU4((v) => !v);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowBigBeloweXU4L3AU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBeloweXU4L2AU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showExpU3LtPU4
                    ? "border-rose-400 text-rose-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Todays U4 is above PU4 and Todays L3/L4 below PL4: Target:Far Below PL4"
              >
                {showExpU3LtPU4 ? "✕ eX-U4L34" : "eX-U4L34"}<ViewCount id={"eX-U4L34"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: eXU4L3-AU4 button — Big Below, placed next to eX-U4L3 (moved from LittleCPR Below) */}
            {activeSectionKey === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowBigBeloweXU4L3AU4((v) => !v);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowExpU3LtPU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBeloweXU4L2AU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBeloweXU4L3AU4
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Wide Below: Prev R4 between today's R3/R4 AND Prev S4 above today's S3, Today CPR width 0.5%-2%, Prev CPR width <0.5%"
              >
                {showBigBeloweXU4L3AU4 ? "✕ eXU4L3-AU4" : "eXU4L3-AU4"}<ViewCount id={"eXU4L3-AU4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: L1<pL4 button — Big Below, placed next to eX-U4L34 */}
            {activeSectionKey === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowBigBelowL1LtPL4((v) => !v);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowExpU3LtPU4(false);
                  setShowBigBeloweXU4L3AU4(false);
                  setShowBigBeloweXU4L2AU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBelowL1LtPL4
                    ? "border-amber-400 text-amber-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Todays S1 below Prev S4 AND Todays R2 above Prev R4 (Wide CPR Below Prev CPR)"
              >
                {showBigBelowL1LtPL4 ? "✕ L1<pL4" : "L1<pL4"}<ViewCount id={"l1-lt-pl4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: CPR<pL4 sub-toggle — restrict L1<pL4 results to rows where today's TC is below prev day's S4 */}
            {activeSectionKey === "structure-bigbelow" && !showAll && showBigBelowL1LtPL4 && (
              <button
                onClick={() => setShowL1LtPL4CprLtPL4((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showL1LtPL4CprLtPL4
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Only show symbols where today's TC is below prev day's S4"
              >
                {showL1LtPL4CprLtPL4 ? "✕ CPR<pL4" : "CPR<pL4"}
              </button>
            )}
            {/* NEW: eXU4L2-AU4 button — Big Below, placed next to L1<pL4.
                Pattern eXU4L2 + prev R3 above today's R3 + today R1/prev
                S1 between the two pivots + prev CPR pSmall + today CPR 1%-2%. */}
            {activeSectionKey === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowBigBeloweXU4L2AU4((v) => !v);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowExpU3LtPU4(false);
                  setShowBigBeloweXU4L3AU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBeloweXU4L2AU4
                    ? "border-amber-400 text-amber-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Wide Below + eXU4L2 (Prev R4 inside today's R3/R4, Prev S4 inside today's S1/S2), Prev R3 > Today R3, Today R1 or Prev S1 between the two Pivots, Prev CPR pSmall (0.6%-1.1%), Today CPR 1%-2%"
              >
                {showBigBeloweXU4L2AU4 ? "✕ eXU4L2-AU4" : "eXU4L2-AU4"}<ViewCount id={"eXU4L2-AU4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: 1T-cOU4L4-ApU4:3PM button — Big Below, placed next to eXU4L2-AU4.
                cOU4L4 + prev R1 between today R1/R2 + today S1 between prev S1/S2 +
                prev PDH > prev R1 + prev CPR pMicro + today CPR Tiny. */}
            {activeSectionKey === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowBigBelow1TcOU4L43PM((v) => !v);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowExpU3LtPU4(false);
                  setShowBigBeloweXU4L3AU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBeloweXU4L2AU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBelow1TcOU4L43PM
                    ? "border-fuchsia-400 text-fuchsia-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Wide Below + cOU4L4 + Prev R1 between Today R1/R2 + Today S1 between Prev S1/S2 + Prev PDH > Prev R1 + Prev CPR pMicro (<=0.10%) + Today CPR Tiny (0.10%-0.22%)"
              >
                {showBigBelow1TcOU4L43PM ? "✕ 1T-cOU4L4-ApU4:3PM" : "1T-cOU4L4-ApU4:3PM"}<ViewCount id={"1T-cOU4L4-ApU4:3PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: live sub-toggle — restrict pMini results to rows currently trading above today's TC */}
            {activeSectionKey === "structure-bigbelow" && !showAll && showBigBelowPMiniPL3 && (
              <button
                onClick={() => setShowBigBelowPMiniRising((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBelowPMiniRising
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Only show symbols currently trading above today's TC"
              >
                {showBigBelowPMiniRising ? "✕ Rising" : "Rising"}
              </button>
            )}
            {/* NEW: sound alert toggle — scoped to pMini-L34C4/U3>4 only */}
            {activeSectionKey === "structure-bigbelow" && !showAll && showBigBelowPMiniPL3 && (
              <button
                onClick={() => {
                  setPMiniAlertsEnabled((v) => {
                    const next = !v;
                    if (next) {
                      try {
                        if (!audioCtxRef.current) {
                          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                          audioCtxRef.current = new Ctx();
                        }
                        audioCtxRef.current.resume();
                      } catch { /* silent */ }
                      playPMiniAlertSound();
                    }
                    return next;
                  });
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors flex items-center gap-1 ${
                  pMiniAlertsEnabled
                    ? "border-yellow-400 text-yellow-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Play a sound whenever a pMini coin newly crosses above today's TC"
              >
                {pMiniAlertsEnabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                {pMiniAlertsEnabled ? "Alerts On" : "Alerts Off"}
              </button>
            )}
            {activeSectionKey === "structure-bigabove" && !showAll && (
              <button
                onClick={() => { setShowBigAbovePL34CL4((v) => !v); setShowBAComp(false); setShowHAU1(false); setShowHAU1CprAbovePU4(false); setShowHAU1L1AbovePU4(false); setShowHAU1PWideAbove(false); setShowHRHAL(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigAbovePL34CL4
                    ? "border-emerald-400 text-emerald-300 bg-emerald-500/10"
                    : "border-emerald-500/40 text-emerald-500/80 hover:text-emerald-300 hover:border-emerald-400"
                }`}
                title="9AM:SSRRHHLLA-U4:11PM — BigCPR Above + SSRRAbove + HHLLAbove + PDHLAbove (entry ~9AM, target U4 by ~11PM)"
              >
                {showBigAbovePL34CL4 ? "✕ 9AM:SSRRHHLLA-U4:11PM" : "9AM:SSRRHHLLA-U4:11PM"}<ViewCount id={"9AM:SSRRHHLLA-U4:11PM"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: BAComp-l3>pl1/u3>pu1 button — inside BigCPR Above, next to Show All */}
            {activeSectionKey === "structure-bigabove" && !showAll && (
              <button
                onClick={() => { setShowBAComp((v) => !v); setShowBigAbovePL34CL4(false); setShowHAU1(false); setShowHAU1CprAbovePU4(false); setShowHAU1L1AbovePU4(false); setShowHAU1PWideAbove(false); setShowHRHAL(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBAComp
                    ? "border-sky-400 text-sky-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="BigAbove: Compressed inside PU2: Target:U4"
              >
                {showBAComp ? "✕ Inside PUL2" : "Inside PUL2"}<ViewCount id={"bacomp-l3>pl1/u3>pu1"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: U1>PU4 button — inside BigCPR Above, next to Inside PUL2 (moved from left-nav) */}
            {activeSectionKey === "structure-bigabove" && !showAll && (
              <button
                onClick={() => {
                  setShowHAU1((v) => !v);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHRHAL(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHAU1
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Todays U1> Previous U4"
              >
                {showHAU1 ? "✕ U1>PU4" : "U1>PU4"}<ViewCount id={"HA-U1>PU4"} counts={viewCounts} />
              </button>
            )}
            {/* NEW: pWideAbove button — nested under U1>PU4, independent of the
                CPR>PU4/L1>PU4 chain. Prev CPR wider than pp-CPR AND Prev CPR above pp-CPR. */}
            {activeSectionKey === "structure-bigabove" && !showAll && showHAU1 && (
              <button
                onClick={() => setShowHAU1PWideAbove((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHAU1PWideAbove
                    ? "border-fuchsia-400 text-fuchsia-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Prev day's CPR wider than pp-CPR AND Prev CPR sits above pp-CPR"
              >
                {showHAU1PWideAbove ? "✕ pWideAbove" : "pWideAbove"}
              </button>
            )}
            {/* NEW: CPR>PU4 sub-toggle — restrict U1>PU4 results to rows where today's BC is above prev day's R4 */}
            {activeSectionKey === "structure-bigabove" && !showAll && showHAU1 && (
              <button
                onClick={() => {
                  setShowHAU1CprAbovePU4((v) => !v);
                  setShowHAU1L1AbovePU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHAU1CprAbovePU4
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Only show symbols where today's BC is above prev day's R4"
              >
                {showHAU1CprAbovePU4 ? "✕ CPR>PU4" : "CPR>PU4"}
              </button>
            )}
            {/* NEW: L1>PU4 sub-toggle — nested on top of CPR>PU4, restrict further to rows where today's S1 is above prev day's R4 */}
            {activeSectionKey === "structure-bigabove" && !showAll && showHAU1 && showHAU1CprAbovePU4 && (
              <button
                onClick={() => setShowHAU1L1AbovePU4((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHAU1L1AbovePU4
                    ? "border-lime-400 text-lime-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Only show symbols where today's S1 is above prev day's R4"
              >
                {showHAU1L1AbovePU4 ? "✕ L1>PU4" : "L1>PU4"}
              </button>
            )}
          </div>

          {/* Pattern filter buttons — own line, independent of activePattern
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
                  { label: "cOU3L4", active: "border-amber-400 text-amber-400" },
                  { label: "LoU4L4", active: "border-lime-400 text-lime-400" },
                  { label: "eXL4U4", active: "border-pink-400 text-pink-400" },
                  { label: "eXU4L4", active: "border-red-400 text-red-400" },
                  { label: "EqL4U4", active: "border-slate-400 text-slate-300" },
                  { label: "HiL2U4", active: "border-cyan-400 text-cyan-400" },
                  { label: "HiL2U3", active: "border-blue-400 text-blue-400" },
                  { label: "HiL3U4", active: "border-lime-400 text-lime-400" },
                  { label: "HiL4U4", active: "border-fuchsia-400 text-fuchsia-400" },
                  { label: "HiL4U3", active: "border-indigo-400 text-indigo-400" },
                  { label: "HiL4U2", active: "border-violet-400 text-violet-400" },
                  { label: "HiL4U1", active: "border-fuchsia-400 text-fuchsia-400" },
                  { label: "eXL4U3", active: "border-green-400 text-green-400" },
                  { label: "LoTCL3", active: "border-sky-600 text-sky-300" },
                  { label: "eXHiL2L1", active: "border-teal-400 text-teal-400" },
                  { label: "eXLoL2L1", active: "border-rose-400 text-rose-400" },
                  { label: "cOL2U3", active: "border-sky-400 text-sky-400" },
                  { label: "cOL3U3", active: "border-sky-400 text-sky-400" },
                  { label: "eXU4L2", active: "border-amber-400 text-amber-400" },
                  { label: "eXU4L3", active: "border-blue-400 text-blue-400" },
                  { label: "cOL2U4", active: "border-emerald-400 text-emerald-400" },
                  { label: "eXL3U3", active: "border-orange-400 text-orange-400" },
                  { label: "eXU3L3", active: "border-red-400 text-red-400" },
                  { label: "cOL4U4",   active: "border-orange-400 text-orange-400" },
                  { label: "cOL3U4",   active: "border-yellow-400 text-yellow-400" },
                  { label: "cOU3L3",   active: "border-teal-400 text-teal-400" },
                  { label: "LoU3L4",   active: "border-indigo-400 text-indigo-400" },
                  { label: "LoU3L3",  active: "border-purple-400 text-purple-400" },
                  { label: "LoU2L4",   active: "border-pink-400 text-pink-400" },
                  { label: "LoU2L3",   active: "border-rose-400 text-rose-400" },
                  { label: "LoU4L3",  active: "border-amber-400 text-amber-400" },
                  { label: "LoU4L2",  active: "border-violet-400 text-violet-400" },
                  { label: "cOU2L3",  active: "border-emerald-400 text-emerald-400" },
                  { label: "LoU4L1", active: "border-orange-400 text-orange-400" },
                  { label: "cOU2L4",  active: "border-lime-400 text-lime-400" },
                  // NEW: eXL*U1 / eXL*CPR sub-type badges (unconditional, all sections)
                  { label: "eXL2U1",   active: "border-purple-400 text-purple-400" },
                  { label: "eXL3U1",   active: "border-violet-400 text-violet-400" },
                  { label: "eXL4U1",   active: "border-fuchsia-400 text-fuchsia-400" },
                  { label: "eXL1BC",  active: "border-sky-400 text-sky-400" },
                  { label: "eXL1CP",  active: "border-cyan-400 text-cyan-400" },
                  { label: "eXL1TC",  active: "border-teal-400 text-teal-400" },
                  { label: "eXL2BC",  active: "border-blue-400 text-blue-400" },
                  { label: "eXL3BC",  active: "border-indigo-400 text-indigo-400" },
                  { label: "eXL3CP",  active: "border-fuchsia-400 text-fuchsia-400" },
                  // NEW: cOU1L1 / cOL1U1 / cOU2L2 / cOL2U2 badges (unconditional, all sections)
                  { label: "cOU1L1",   active: "border-teal-400 text-teal-400" },
                  { label: "cOL1U1",   active: "border-cyan-400 text-cyan-400" },
                  { label: "cOU2L2",   active: "border-emerald-400 text-emerald-400" },
                  { label: "cOL2U2",   active: "border-lime-400 text-lime-400" },
                  // NEW: cOU1L2 — independent, section-agnostic Pattern flag (see cpr.ts).
                  { label: "cOU1L2",   active: "border-rose-400 text-rose-400" },
                  // NEW: cOU4L4 — independent, section-agnostic Pattern flag (see cpr.ts).
                  { label: "cOU4L4",   active: "border-orange-400 text-orange-400" },
                  // NEW: exL3U2 — prev S4 inside today S2/S3 AND prev R4 inside today R1/R2
                  { label: "exL3U2",   active: "border-amber-400 text-amber-400" },
                  // NEW: expanded family — today's outer S-level broke below prev S4
                  // AND today's outer R-level/TC broke above prev R4 (see cpr.ts).
                  { label: "eXL4U2",  active: "border-purple-400 text-purple-400" },
                  { label: "eXL2U2",   active: "border-blue-400 text-blue-400" },
                  { label: "eXL2TC",   active: "border-sky-400 text-sky-400" },
                  { label: "eXL3TC",   active: "border-indigo-400 text-indigo-400" },
                  { label: "eXL1U1",   active: "border-fuchsia-400 text-fuchsia-400" },
                  // NEW: eXU1L1 — same band shape as eXL1U1, fires when the R1/R4 gap is larger.
                  { label: "eXU1L1",   active: "border-cyan-400 text-cyan-400" },
                  // NEW: eXU2L1 — prev R4 inside today R1/R2 (U2) AND prev S4 inside today BC/S1 (L1).
                  { label: "eXU2L1",   active: "border-violet-400 text-violet-400" },
                  // NEW: eXU3L1 — prev R4 inside today R2/R3 (U3) AND prev S4 inside today BC/S1 (L1).
                  { label: "eXU3L1",   active: "border-red-400 text-red-400" },
                  { label: "eXU3L2",   active: "border-orange-400 text-orange-400" },
                  // NEW: eXU2TC — prev R4 inside today R1/R2 (U2) AND prev S4 inside today TC/R1.
                  { label: "eXU2TC",   active: "border-teal-400 text-teal-400" },
                  // NEW: eXU2BC — prev R4 inside today R1/R2 (U2) AND prev S4 inside today BC/Pivot.
                  { label: "eXU2BC",   active: "border-indigo-400 text-indigo-400" },
                  // NEW: eXU3TC — prev R4 inside today R2/R3 (U3) AND prev S4 inside today TC/R1.
                  { label: "eXU3TC",   active: "border-rose-400 text-rose-400" },
                  // NEW: eXU2CP — prev R4 inside today R1/R2 (U2) AND prev S4 inside today Pivot/TC.
                  { label: "eXU2CP",   active: "border-sky-400 text-sky-400" },
                  // NEW: eXU3CP — prev R4 inside today R2/R3 (U3) AND prev S4 inside today Pivot/TC.
                  { label: "eXU3CP",   active: "border-yellow-400 text-yellow-400" },
                  // NEW: eXU3BC — prev R4 inside today R2/R3 (U3) AND prev S4 inside today BC/Pivot.
                  { label: "eXU3BC",   active: "border-pink-400 text-pink-400" },
                  // NEW: eXL2CP — prev S4 inside today S2/S1 (L2) AND prev R4 inside today BC/Pivot.
                  { label: "eXL2CP",   active: "border-emerald-400 text-emerald-400" },
                  // NEW: eXL4TC — prev S4 inside today S4/S3 (L4) AND prev R4 inside today Pivot/TC.
                  { label: "eXL4TC",   active: "border-indigo-300 text-indigo-300" },
                  // NEW: LoU3L2 — today R4 inside prev R2/R3 (U3) AND prev S4 inside today S2/S1 (L2).
                  { label: "LoU3L2",   active: "border-amber-400 text-amber-400" },
                  // NEW: cOL1U2 — today S4 inside prev S1/BC (L1) AND today R4 inside prev R1/R2 (U2).
                  { label: "cOL1U2",   active: "border-teal-400 text-teal-400" },
                  // NEW: cOL1U3 — today S4 inside prev S1/BC (L1) AND today R4 inside prev R2/R3 (U3).
                  { label: "cOL1U3",   active: "border-cyan-300 text-cyan-300" },
                  // NEW: HiL3U2 — today S4 inside prev S3/S2 (L3) AND prev R4 inside prev's own R1/R2 (U2).
                  { label: "HiL3U2",   active: "border-fuchsia-400 text-fuchsia-400" },
                  // NEW: eXU4L1 — prev R4 inside today R3/R4 (U4) AND prev S4 inside today BC/S1 (L1).
                  { label: "eXU4L1",   active: "border-green-400 text-green-400" },
                  // NEW: eXU4BC — prev R4 inside today R3/R4 (U4) AND prev S4 inside today BC/Pivot.
                  { label: "eXU4BC",   active: "border-lime-400 text-lime-400" },
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
              activePattern and showAll. */}
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
              exitTimeFilter state), independent of activePattern,
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
              independent of activePattern and showAll. */}
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
                        activePattern={activeSectionKey}
                        showHAU1={showHAU1}
                        showBigBelowPMiniPL3={showBigBelowPMiniPL3}
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

        <div className="mt-auto pt-8 text-xs text-muted-foreground text-center">
          Binance: top 500 USDT pairs · Delta Exchange: 195 perpetual futures · CPR from completed UTC daily candles
          <br />
          Auto-scans once daily at 5:31 AM IST · PH/PL = Previous Day High/Low · Not financial advice · by Kriven Gokul
        </div>
      </div>
    </div>
  );
}
