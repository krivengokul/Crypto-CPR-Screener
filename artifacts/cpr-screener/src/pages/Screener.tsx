import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { patterns } from "@/components/ui/PatternSidebar";
import {
  TrendingUp,
  RefreshCw,
  Search,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
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
  getPivotLevel,
  type PivotLevelInfo,
  SRLadder,
  getSubFilterDirection,
} from "./ScreenerUtils";
import LiveClock from "./LiveClock";

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
  const [showAll, setShowAll] = useState(false);
  const [showLABothTiny, setShowLABothTiny] = useState(false);
  const [showLAAllUp, setShowLAAllUp] = useState(false);
  const [showLAPL12CL23, setShowLAPL12CL23] = useState(false);
  const [showLACompressed, setShowLACompressed] = useState(false);
  // NEW: 1LHr-L4U3-U4 filter state — Little Above, placed next to LA-AllUp
  const [showLA1LHr, setShowLA1LHr] = useState(false);
  const [showOutsideCPRCompressed, setShowOutsideCPRCompressed] = useState(false);
  // NEW: eXHrL3U3-AU4 filter state — Outside CPR, placed next to Compressed
  const [showOutsideCPReXHrL3U3AU4, setShowOutsideCPReXHrL3U3AU4] = useState(false);
  const [showInsideCPRExpanded, setShowInsideCPRExpanded] = useState(false);
  // NEW: inside-cpr-narrow — sibling of showInsideCPRExpanded, coiled-spring
  // setup: CPR inside prev day's CPR AND today's CPR width < 0.5% (Narrow)
  const [showInsideCPRNarrow, setShowInsideCPRNarrow] = useState(false);
  const [showHA55HrL4U34FAU4, setShowHA55HrL4U34FAU4] = useState(false);
  // NEW: cO-U4L3 — Compressed inside prev R4/prev S3, 3rd sub-filter under inside-cpr
  const [showInsideCPRCoU4L3, setShowInsideCPRCoU4L3] = useState(false);
  const [showBigBelowPMiniPL3, setShowBigBelowPMiniPL3] = useState(false);
  // NEW: live sub-toggle on top of pMini — restrict to rows currently trading above today's TC
  const [showBigBelowPMiniRising, setShowBigBelowPMiniRising] = useState(false);
  // NEW: sound alert — fires only for pMini-L34C4/U3>4 when a coin newly crosses above today's TC
  const [pMiniAlertsEnabled, setPMiniAlertsEnabled] = useState(false);
  const pMiniRisingAlertedRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  // NEW: eX-U4L34 filter state (Big Below)
  const [showExpU3LtPU4, setShowExpU3LtPU4] = useState(false);
  // NEW: eXLoL3U4-AU4 filter state (Big Below), moved here from LittleCPR
  // Below — placed next to eX-U4L34
  const [showBigBeloweXLoL3U4AU4, setShowBigBeloweXLoL3U4AU4] = useState(false);
  // NEW: L1<pL4 filter state (Big Below), next to eX-U4L34
  const [showBigBelowL1LtPL4, setShowBigBelowL1LtPL4] = useState(false);
  // NEW: CPR<pL4 sub-toggle on top of L1<pL4 — restrict to rows where today's BC is below prev day's S4
  const [showL1LtPL4CprLtPL4, setShowL1LtPL4CprLtPL4] = useState(false);
  // NEW: eXU4L234-AU4 filter state (Big Below), placed next to L1<pL4
  const [showBigBeloweXU4L234AU4, setShowBigBeloweXU4L234AU4] = useState(false);
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
  const [showExpU4PU4, setShowExpU4PU4] = useState(false);
  // NEW: Exp-U3>U3 filter state (Overlapping Lower)
  const [showExpU3PU3, setShowExpU3PU3] = useState(false);
  // NEW: OBN-LoL4U4-U4 / OBW-LoL4U4-L4 filter state (Overlapping Lower), placed next to Exp-U3>pU4
  const [showOBNLoL4U4, setShowOBNLoL4U4] = useState(false);
  const [showOBWLoL4U4, setShowOBWLoL4U4] = useState(false);
  // NEW: eXHi-L4U4-U4 filter state (Overlapping Higher) — counterpart of
  // eXLo-L4U4-U4 (Overlapping Lower), same r.eXL4U4 boolean, gated on
  // r.overlapHigher instead of r.overlapLower.
  const [showOBHiExL4U4, setShowOBHiExL4U4] = useState(false);
  // NEW: eXHi-L4U234-U4 filter state (BigCPR Above)
  const [showeXHiL4U234, setShoweXHiL4U234] = useState(false);
  const [pivotLevelFilter, setPivotLevelFilter] = useState<PivotLevelInfo["label"] | null>(null);
  const [widthFilter, setWidthFilter] = useState<WidthFilter>(null);
  // NEW: PDH/PDL filter — independent of activePattern, mutually exclusive (like pivot/width filters).
  // Replaces the removed "Price Above PDH" / "Price Below PDL" left-nav patterns.
  const [pdhPdlFilter, setPdhPdlFilter] = useState<"above" | "below" | null>(null);
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

  // Binance live price refresh every 30s
  useEffect(() => {
    if (status !== "done") return;
    const refresh = async () => {
      const results = allResultsRef.current;
      if (!results.length) return;
      try {
        const symbols = results.map((r) => r.symbol);
        const chunks: string[][] = [];
        for (let i = 0; i < symbols.length; i += 100) chunks.push(symbols.slice(i, i + 100));
        const priceMap = new Map<string, { price: number; change: number }>();
        await Promise.all(
          chunks.map(async (chunk) => {
            const res = await fetch(
              `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(chunk))}&type=MINI`
            );
            if (!res.ok) return;
            const tickers: Array<{ symbol: string; lastPrice: string; openPrice: string }> = await res.json();
            tickers.forEach((t) => {
              const price = parseFloat(t.lastPrice);
              const open  = parseFloat(t.openPrice);
              priceMap.set(t.symbol, { price, change: open > 0 ? ((price - open) / open) * 100 : 0 });
            });
          })
        );
        // AFTER — use r.openPrice (your 5:30 AM IST baseline) for % calc
      const apply = (prev: CPRResult[]): CPRResult[] =>
        prev.map((r) => {
          const live = priceMap.get(r.symbol);
          if (!live) return r;
          const change24h = r.openPrice > 0
            ? ((live.price - r.openPrice) / r.openPrice) * 100
            : live.change; // fallback
          return { ...r, currentPrice: live.price, change24h };
        });
        setAllResults((p) => apply(p));
        setFiltered((p) => apply(p));
      } catch { /* silent */ }
    };
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [status]);

  // Delta live price refresh every 30s
  useEffect(() => {
    if (deltaStatus !== "done") return;
    const refresh = async () => {
      const results = deltaAllResultsRef.current;
      if (!results.length) return;
      try {
        const res = await fetch(
          "https://api.india.delta.exchange/v2/tickers?contract_types=perpetual_futures&page_size=500",
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        const tickers: Array<{ symbol: string; mark_price: string; ltp_change_24h: string }> =
          (data.result ?? []) as Array<{ symbol: string; mark_price: string; ltp_change_24h: string }>;
        const priceMap = new Map(tickers.map((t) => [t.symbol, t]));
                // AFTER for Delta
        const apply = (prev: CPRResult[]): CPRResult[] =>
          prev.map((r) => {
            const t = priceMap.get(r.symbol);
            if (!t) return r;
            const price = parseFloat(t.mark_price);
            if (price <= 0) return r;
            const change24h = r.openPrice > 0
              ? ((price - r.openPrice) / r.openPrice) * 100
              : parseFloat(t.ltp_change_24h); // fallback
            return { ...r, currentPrice: price, change24h };
          });
        setDeltaAllResults((p) => apply(p));
        setDeltaFiltered((p) => apply(p));
      } catch { /* silent */ }
    };
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [deltaStatus]);

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
    if (activePattern !== "littleabove") { setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); }
    if (activePattern !== "outside-cpr") { setShowOutsideCPRCompressed(false); setShowOutsideCPReXHrL3U3AU4(false); }
    if (activePattern !== "inside-cpr") { setShowInsideCPRExpanded(false); setShowInsideCPRNarrow(false); setShowInsideCPRCoU4L3(false); }
    if (activePattern !== "overlapping-lower") { setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBNLoL4U4(false); setShowOBWLoL4U4(false); }
    // NEW: reset eXHi-L4U4-U4 toggle when leaving Overlapping Higher
    if (activePattern !== "overlapping-higher") { setShowOBHiExL4U4(false); }
    if (activePattern !== "structure-bigbelow") { setShowBigBelowPMiniPL3(false); setShowBigBelowPMiniRising(false); pMiniRisingAlertedRef.current.clear(); setShowExpU3LtPU4(false); setShowBigBeloweXLoL3U4AU4(false); setShowBigBelowL1LtPL4(false); setShowL1LtPL4CprLtPL4(false); setShowBigBeloweXU4L234AU4(false); }
    if (activePattern !== "structure-bigabove") { setShowBigAbovePL34CL4(false); setShowBAComp(false); setShowHAU1(false); setShowHAU1CprAbovePU4(false); setShowHAU1L1AbovePU4(false); setShowHAU1PWideAbove(false); setShowHRHAL(false); setShowHA55HrL4U34FAU4(false); setShoweXHiL4U234(false); setShowHiL4U4FAU4(false); }
    // Reset LB Compressed / LB-C34 / lbE11-cOLoL3U2-PU4 / LB-cO2-L2U2 / LB-BothTiny / LB-AllUp when leaving littlebelow
    if (activePattern !== "littlebelow") { setShowLBCmprss(false); setShowLBC34(false); setShowLBE11(false); setShowLBC2L2U2(false); setShowLBBothTiny(false); setShowLBAllUp(false); }
  }, [activePattern, allResults, deltaAllResults]);
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
    for (const p of patterns) {
      counts[p.id] = pool.filter((r) => passesPattern(r, p.id)).length;
    }
    onCounts(counts);
  }, [allResults, deltaAllResults, activeTab, onCounts]);

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
    if (showInsideCPRExpanded && activePattern === "inside-cpr") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "inside-cpr-expanded"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "inside-cpr-expanded"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: inside-cpr-narrow pool — Inside CPR, today's CPR Narrow (<0.5% width)
    if (showInsideCPRNarrow && activePattern === "inside-cpr") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "inside-cpr-narrow"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "inside-cpr-narrow"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: cO-U4L3 pool — Compressed inside prev R4/prev S3 (today's R4 < prev R4, today's S4 > prev S3)
    if (showInsideCPRCoU4L3 && activePattern === "inside-cpr") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "cO-U4L3"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "cO-U4L3"))
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
    // NEW: eXLoL3U4-AU4 pool — Big Below (moved from LittleCPR Below): prev
    // R4 between today's R3/R4, prev S4 above today's S3, today's CPR width
    // 0.5%-2%, prev CPR width < 0.5%. Placed next to eX-U4L34.
    if (showBigBeloweXLoL3U4AU4 && activePattern === "structure-bigbelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eXLoL3U4-AU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eXLoL3U4-AU4"))
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
    // NEW: eXU4L234-AU4 pool — Big Below, placed next to L1<pL4. Pivot
    // Level eXU4L234 + prev R3 above today's R3 + today R1/prev S1 between
    // the two pivots + prev CPR pSmall + today CPR 1%-2% wide.
    if (showBigBeloweXU4L234AU4 && activePattern === "structure-bigbelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eXU4L234-AU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eXU4L234-AU4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showBigAbovePL34CL4 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "bigabove-pl34cl4-u3>pu4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "bigabove-pl34cl4-u3>pu4"))
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
    // NEW: eXHi-L4U234-U4 pool — BigCPR Above, independent toggle next to
    // Show All. FIXED: this used to be nested inside the "U1>PU4" block
    // below (missing its own closing brace), which both broke this pool's
    // filtering and silently rewired the pWideAbove / CPR>PU4 / L1>PU4
    // sub-toggles to apply to THIS pool's binance/deltaIntersect variables
    // instead of the U1>PU4 pool's. Split into its own standalone block.
    if (showeXHiL4U234 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "eXHi-L4U234-U4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "eXHi-L4U234-U4"))
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
    // NEW: LB-BothTiny pool (formerly "TinyBelow - Both Tiny" left-nav item)
    if (showLBBothTiny && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lb-2tiny"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lb-2tiny"))
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
    // NEW: Exp-U3>U3 pool
    if (showExpU3PU3 && activePattern === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "Exp-U3>U3"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "Exp-U3>U3"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: OBN-LoL4U4-U4 pool — Overlapping Lower, Narrow variant
    if (showOBNLoL4U4 && activePattern === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "OBN-LoL4U4-U4"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "OBN-LoL4U4-U4"))
        .map((r) => ({ ...r, source: "delta" as const }));

      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: OBW-LoL4U4-L4 pool — Overlapping Lower, Wide variant
    if (showOBWLoL4U4 && activePattern === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "OBW-LoL4U4-L4"))
        .map((r) => ({ ...r, source: "binance" as const }));

      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "OBW-LoL4U4-L4"))
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
    if (activeTab === "combined") return showAll ? combinedAllResults : combinedResults;
    if (activeTab === "delta") return (showAll ? deltaAllResults : deltaFiltered).map((r) => ({ ...r, source: "delta" as const }));
    return (showAll ? allResults : filtered).map((r) => ({ ...r, source: "binance" as const }));
  };

  const displayed = getActivePool()
    .filter((r) => r.symbol.toLowerCase().includes(search.toLowerCase()))
    // NEW: cOLoL2U1 / cOLoL4U3 are independent booleans in cpr.ts (not
    // actually gated behind srLower), so a row can satisfy one of them
    // AND a higher-priority bucket (e.g. srHigher) at the same time.
    // getPivotLevel() only ever returns ONE label per row and checks the
    // other buckets first, so matching on getPivotLevel(r)?.label would
    // silently miss rows where cOLoL2U1/cOLoL4U3 is true but shadowed by
    // an earlier bucket. Check the raw flags directly for these two so
    // the filter buttons actually work independent of the primary badge.
    .filter((r) => {
      if (!pivotLevelFilter) return true;
      if (pivotLevelFilter === "cOLoL2U1") return r.cOLoL2U1;
      if (pivotLevelFilter === "cOLoL4U3") return r.cOLoL4U3;
      if (pivotLevelFilter === "LoL4U4") return r.LoL4U4;
      if (pivotLevelFilter === "eXHiL4U234") return r.eXHiL4U234;
      // NEW: eXL4U4 — independent, section-agnostic Pivot Level flag (see
      // doc-comment on PivotLevelInfo/getPivotLevel in ScreenerUtils.tsx).
      if (pivotLevelFilter === "eXL4U4") return r.eXL4U4;
      // NEW: HiL4U4 — independent, section-agnostic Pivot Level flag,
      // mirror of eXL4U4 (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (pivotLevelFilter === "HiL2U4") return r.HiL2U4;
      if (pivotLevelFilter === "HiL3U4") return r.HiL3U4;
      if (pivotLevelFilter === "HiL4U4") return r.HiL4U4;
      // NEW: HiL4U34 / cOHiL2U3 — same treatment: independent,
      // section-agnostic Pivot Level flags, always shown regardless of
      // activePattern/left-nav.
      if (pivotLevelFilter === "HiL4U34") return r.HiL4U34;
      if (pivotLevelFilter === "cOHiL2U3") return r.cOHiL2U3;
      if (pivotLevelFilter === "cOHiL3U3") return r.cOHiL3U3;
      // NEW: eXU4L234 — independent, section-agnostic Pivot Level flag
      // (see doc-comments in cpr.ts / ScreenerUtils.tsx).
      if (pivotLevelFilter === "eXU4L234") return r.eXU4L234;
      if (pivotLevelFilter === "cOHiL2U4") return r.cOHiL2U4;
      if (pivotLevelFilter === "cOL4U4") return r.cOL4U4;
      if (pivotLevelFilter === "cOL3U4") return r.cOL3U4;
      if (pivotLevelFilter === "cOU3L3") return r.cOU3L3;
      if (pivotLevelFilter === "LoU3L4") return r.LoU3L4;
      if (pivotLevelFilter === "LoU3L34") return r.LoU3L34;
      if (pivotLevelFilter === "LoU2L4") return r.LoU2L4;
      if (pivotLevelFilter === "LoU2L3") return r.LoU2L3;
      if (pivotLevelFilter === "LoU4L34") return r.LoU4L34;
      if (pivotLevelFilter === "LoU4L234") return r.LoU4L234;
      if (pivotLevelFilter === "cOHiL2U2") return r.cOHiL2U2;
      if (pivotLevelFilter === "cOLoU2L3") return r.cOLoU2L3;
      if (pivotLevelFilter === "LoU4L1234") return r.LoU4L1234;
      if (pivotLevelFilter === "cOLoU1L2") return r.cOLoU1L2;
      if (pivotLevelFilter === "cOLoU2L4") return r.cOLoU2L4;
      return getPivotLevel(r)?.label === pivotLevelFilter;
    })
    .filter((r) => matchesWidthFilter(r, widthFilter))
    // NEW: PDH/PDL filter — price above PDH or below PDL
    .filter((r) => {
      if (pdhPdlFilter === "above") return passesPattern(r, "Price-AbovePDH");
      if (pdhPdlFilter === "below") return passesPattern(r, "Price-BelowPDL");
      return true;
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

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === "asc"
        ? <ChevronUp className="w-3 h-3 inline ml-1 text-primary" />
        : <ChevronDown className="w-3 h-3 inline ml-1 text-primary" />
      : <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />;

  // Helper: is any sub-filter active (to decide the result count label)
  const anySubFilter =
    showLABothTiny || showLAAllUp || showLA1LHr || showLAPL12CL23 || showLACompressed ||
    showOutsideCPRCompressed || showOutsideCPReXHrL3U3AU4 || showInsideCPRExpanded || showInsideCPRNarrow || showInsideCPRCoU4L3 ||
    showBigBelowPMiniPL3 || showBigBelowPMiniRising || showExpU3LtPU4 || showBigBeloweXLoL3U4AU4 || showBigBelowL1LtPL4 || showL1LtPL4CprLtPL4 || showBigBeloweXU4L234AU4 ||
    showBigAbovePL34CL4 || showBAComp || showHAU1 || showHAU1CprAbovePU4 || showHAU1L1AbovePU4 || showHAU1PWideAbove || showHRHAL || showHA55HrL4U34FAU4 || showHiL4U4FAU4 || showLBCmprss || showLBC34 || showLBE11 || showLBC2L2U2 ||
    showLBBothTiny || showLBAllUp || showExpU4PU4 || showExpU3PU3 || showOBNLoL4U4 || showOBWLoL4U4 || showOBHiExL4U4 || showeXHiL4U234 ||
    !!pivotLevelFilter || !!widthFilter || !!pdhPdlFilter;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">CPR Screener</h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                by Kriven Gokul
              </span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
              {activePattern === "falling" ? (
                <>Filters where <span className="text-foreground font-medium">today&apos;s TC is below yesterday&apos;s BC</span> and <span className="text-foreground font-medium">CPR is narrower than 50% of yesterday&apos;s</span>.</>
              ) : activePattern === "inside-value" ? (
                <>Filters where <span className="text-foreground font-medium">today&apos;s CPR is fully inside yesterday&apos;s CPR</span> — compression with breakout potential.</>
              ) : activePattern === "littlebelow" ? (
                <>Screens where today&apos;s CPR is below yesterday&apos;s and width is smaller than yesterday&apos;s CPR.</>
              ) : (
                <>Screens where <span className="text-foreground font-medium">today&apos;s CPR is above yesterday&apos;s</span> and <span className="text-foreground font-medium">width is smaller than yesterday&apos;s CPR</span>.</>
              )}
            </p>
          </div>

          <LiveClock />
        </div>

        {/* Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg border border-border bg-card p-3">
            {activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-primary mb-1">BigCPR Above</div>
                <div className="text-xs text-muted-foreground">Wide CPR Above PCPR — today&apos;s CPR is wider than yesterday&apos;s and present above it</div>
              </>
            ) : activePattern === "structure-bigbelow" ? (
              <>
                <div className="text-xs font-semibold text-primary mb-1">Big Below</div>
                <div className="text-xs text-muted-foreground">Wide CPR Below PCPR — today&apos;s CPR is wider than yesterday&apos;s and present below it</div>
              </>
            ) : activePattern === "littleabove" ? (
              <>
                <div className="text-xs font-semibold text-primary mb-1">LittleCPR Above</div>
                <div className="text-xs text-muted-foreground">Narrow CPR Above PCPR — today&apos;s CPR is narrower than yesterday&apos;s and present above it</div>
              </>
            ) : activePattern === "littlebelow" ? (
              <>
                <div className="text-xs font-semibold text-primary mb-1">LittleCPR Below</div>
                <div className="text-xs text-muted-foreground mb-2">Narrow CPR Below PCPR — today&apos;s CPR is narrower than yesterday&apos;s and present below it</div>
                <div className="flex gap-1.5">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-orange-500 text-white">Below</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-500 text-white">Narrow</span>
                </div>
              </>
            ) : activePattern === "overlapping-lower" ? (
              <>
                <div className="text-xs font-semibold text-primary mb-1">Overlapping Lower</div>
                <div className="text-xs text-muted-foreground mb-2">Today&apos;s CPR overlaps below yesterday&apos;s CPR</div>
                <div className="flex gap-1.5">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-orange-500 text-white">Overlap</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-500 text-white">Lower</span>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold text-primary mb-1">ADK CPR Formula</div>
                <div className="text-xs text-muted-foreground">Pivot=(H+L+C)/3 · BC=(H+L)/2 · TC=2P−BC</div>
              </>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            {showBAComp && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-sky-400 mb-1">Compressed Inside Prev UL2</div>
                <div className="text-xs text-muted-foreground">U3/U4 inside PU2/PU1 and L4 inside PL1/PL2</div>
              </>
            ) : showLACompressed && activePattern === "littleabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Compressed Inside Previous L2 and Previous U3</div>
                <div className="text-xs text-muted-foreground">Compressed Todays L4/U4 Inside Previous L2/U3</div>
              </>
            ) : showLBE11 && activePattern === "littlebelow" ? (
              <>
                <div className="text-xs font-semibold text-amber-400 mb-1">Compressed Inside Previous R1/R2 and Previous S2/S3</div>
                <div className="text-xs text-muted-foreground">Today&apos;s R4 inside Prev R1/R2, Today&apos;s S4 inside Prev S2/S3, both CPRs 1%–1.5% wide</div>
              </>
            ) : showLBC2L2U2 && activePattern === "littlebelow" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Compressed Inside Previous L2 and Previous U2</div>
                <div className="text-xs text-muted-foreground">Compressed Todays L4/U4 Inside Previous L2/U2</div>
              </>
            ) : showExpU4PU4 && activePattern === "overlapping-lower" ? (
              <>
                <div className="text-xs font-semibold text-sky-400 mb-1">Expanded</div>
                <div className="text-xs text-muted-foreground">Prev R4 between today&apos;s R3/R4 and Prev S4 between today&apos;s S3/S4 with today&apos;s CPR Mini</div>
              </>
            ) : showExpU3PU3 && activePattern === "overlapping-lower" ? (
              <>
                <div className="text-xs font-semibold text-sky-400 mb-1">Expanded</div>
                <div className="text-xs text-muted-foreground">Todays U3 &gt; Prev U4/Todays L3 &lt; Prev L4 , today&apos;s CPR is Narrow</div>
              </>
            ) : showOBNLoL4U4 && activePattern === "overlapping-lower" ? (
              <>
                <div className="text-xs font-semibold text-cyan-400 mb-1">Overlap Lower, Narrow</div>
                <div className="text-xs text-muted-foreground">Today&apos;s R4 inside Prev R3/R4, Prev S4 inside Today&apos;s S3/S4, today&apos;s CPR Narrow, Compression &gt; 50%</div>
              </>
            ) : showOBWLoL4U4 && activePattern === "overlapping-lower" ? (
              <>
                <div className="text-xs font-semibold text-rose-400 mb-1">Overlap Lower, Wide</div>
                <div className="text-xs text-muted-foreground">Today&apos;s R4 inside Prev R3/R4, Prev S4 inside Today&apos;s S3/S4, today&apos;s CPR Wide, Compression &gt; 50%</div>
              </>
            ) : showOBHiExL4U4 && activePattern === "overlapping-higher" ? (
              <>
                <div className="text-xs font-semibold text-pink-400 mb-1">eXHi-L4U4-U4</div>
                <div className="text-xs text-muted-foreground">Overlap Higher — Prev R4 between today&apos;s R3/R4, Prev S4 between today&apos;s S3/S4, Prev CPR pSmall, Today CPR Tiny</div>
              </>
            ) : showExpU3LtPU4 && activePattern === "structure-bigbelow" ? (
              <>
                <div className="text-xs font-semibold text-rose-400 mb-1">Expanded</div>
                <div className="text-xs text-muted-foreground">Todays U4 is above PU4 and Todays L3/L4 below PL4</div>
                <div className="text-xs text-muted-foreground">Prev CPR &lt;1% / Today CPR &lt;3%, PDL &lt;L1</div>
              </>
            ) : showBigBeloweXLoL3U4AU4 && activePattern === "structure-bigbelow" ? (
              <>
                <div className="text-xs font-semibold text-green-400 mb-1">eXLoL3U4-AU4</div>
                <div className="text-xs text-muted-foreground">Wide Below — Prev R4 between today&apos;s R3/R4, Prev S4 above today&apos;s S3</div>
              </>
            ) : showBigBeloweXU4L234AU4 && activePattern === "structure-bigbelow" ? (
              <>
                <div className="text-xs font-semibold text-amber-400 mb-1">eXU4L234-AU4</div>
                <div className="text-xs text-muted-foreground">Wide Below + eXU4L234 (Prev R4 inside today&apos;s R3/R4, Prev S4 inside today&apos;s S1/S2), Prev R3 &gt; Today R3, Today R1 or Prev S1 between the two Pivots</div>
              </>
            ) : showHRHAL && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-orange-400 mb-1">hR-HAL</div>
                <div className="text-xs text-muted-foreground">Pivot Level: Higher, Today&apos;s TC between Prev R1/R2, Today&apos;s R3 &gt; Prev R4</div>
              </>
            ) : showHiL4U4FAU4 && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-fuchsia-400 mb-1">1T-HiL4U4-FAU4</div>
                <div className="text-xs text-muted-foreground">Wide Above + HiL4U4 (Prev R4 inside Today&apos;s R3/R4, Today&apos;s S4 inside Prev S3/S4), Prev CPR pMicro, Today CPR Tiny</div>
              </>
            ) : showHAU1L1AbovePU4 && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-lime-400 mb-1">L1 &gt; Previous U4</div>
                <div className="text-xs text-muted-foreground">Today&apos;s L1 has broken above yesterday&apos;s R4 — strong bullish momentum</div>
              </>
            ) : showHAU1PWideAbove && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-fuchsia-400 mb-1">pWideAbove</div>
                <div className="text-xs text-muted-foreground">Prev day&apos;s CPR wider than pp-CPR and sits above pp-CPR — momentum carried over two days</div>
              </>
            ) : showHAU1 && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-sky-400 mb-1">U1 &gt; Previous U4</div>
                <div className="text-xs text-muted-foreground">Todays U1&gt; Previous U4</div>
              </>
            ) : showeXHiL4U234 && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-violet-400 mb-1">eXHi-L4U234-U4</div>
                <div className="text-xs text-muted-foreground">Prev S4 inside today&apos;s S3/S4, prev R4 inside today&apos;s R2/R3, today&apos;s CPR expanded above prev</div>
              </>
            ) : showOutsideCPReXHrL3U3AU4 && activePattern === "outside-cpr" ? (
              <>
                <div className="text-xs font-semibold text-rose-400 mb-1">eXHrL3U3-AU4</div>
                <div className="text-xs text-muted-foreground">Prev S4 between today&apos;s S3/S4, Prev R4 between today&apos;s R2/R3</div>
              </>
            ) : showInsideCPRNarrow && activePattern === "inside-cpr" ? (
              <>
                <div className="text-xs font-semibold text-cyan-400 mb-1">Narrow</div>
                <div className="text-xs text-muted-foreground">Inside CPR + today&apos;s CPR width &lt; 0.5% — coiled, low room to breathe</div>
              </>
            ) : showInsideCPRCoU4L3 && activePattern === "inside-cpr" ? (
              <>
                <div className="text-xs font-semibold text-indigo-400 mb-1">cO-U4L3</div>
                <div className="text-xs text-muted-foreground">Compressed inside prev R4 / prev S3 — today&apos;s R4 &lt; Prev R4, today&apos;s S4 &gt; Prev S3</div>
              </>
            ) : activePattern === "falling" ? (
              <>
                <div className="text-xs font-semibold mb-1 text-destructive">CPR Falling</div>
                <div className="text-xs text-muted-foreground">Bearish directional bias</div>
              </>
            ) : activePattern === "inside-value" ? (
              <>
                <div className="text-xs font-semibold mb-1 text-accent">Inside Value CPR</div>
                <div className="text-xs text-muted-foreground">Breakout potential</div>
              </>
            ) : null}
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            {showBAComp && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">These coins have the potential to go up to U4</div>
              </>
            ) : showLACompressed && activePattern === "littleabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Bullish Above PU4</div>
              </>
            ) : showLBE11 && activePattern === "littlebelow" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Bullish to PU4</div>
              </>
            ) : showLBC2L2U2 && activePattern === "littlebelow" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Bullish to U4</div>
              </>
            ) : showExpU4PU4 && activePattern === "overlapping-lower" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">These coins have the potential to go up to U4</div>
              </>
            ) : showExpU3PU3 && activePattern === "overlapping-lower" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">These coins have the potential to go farAbove U4</div>
              </>
            ) : showOBNLoL4U4 && activePattern === "overlapping-lower" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Compressed structure with today&apos;s CPR Narrow — bullish continuation to U4</div>
              </>
            ) : showOBWLoL4U4 && activePattern === "overlapping-lower" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Same structure but today&apos;s CPR Wide — bullish continuation to U4</div>
              </>
            ) : showOBHiExL4U4 && activePattern === "overlapping-higher" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Overlap Higher continuation — bullish bias toward U4</div>
              </>
            ) : showExpU3LtPU4 && activePattern === "structure-bigbelow" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">These coins have the potential to go far Below PL4</div>
              </>
            ) : showBigBeloweXLoL3U4AU4 && activePattern === "structure-bigbelow" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Bearish continuation — further downside below prev day&apos;s S3/S4</div>
              </>
            ) : showBigBeloweXU4L234AU4 && activePattern === "structure-bigbelow" ? (
              <>
                <div className="text-xs font-semibold text-destructive mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Bearish continuation — further downside below today&apos;s S4</div>
              </>
            ) : showHRHAL && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Higher pivot structure with room to run to U4</div>
              </>
            ) : showHiL4U4FAU4 && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Tight compression breaking wide above prior structure — potential to run far above U4</div>
              </>
            ) : showHAU1L1AbovePU4 && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Bullish potential target of U4</div>
              </>
            ) : showHAU1PWideAbove && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Confirms sustained bullish structure — bias toward continuation to U4</div>
              </>
            ) : showHAU1 && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Breakout</div>
                <div className="text-xs text-muted-foreground">Today&apos;s R1 has broken above yesterday&apos;s R4 — strong bullish momentum</div>
              </>
            ) : showeXHiL4U234 && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Expanded structure above prev day&apos;s range — continuation toward U4</div>
              </>
            ) : showOutsideCPReXHrL3U3AU4 && activePattern === "outside-cpr" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Tight prior-day CPR that expanded outside it — breakout continuation potential</div>
              </>
            ) : showInsideCPRNarrow && activePattern === "inside-cpr" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Coiled-spring — potential breakout beyond today&apos;s R4/S4</div>
              </>
            ) : showInsideCPRCoU4L3 && activePattern === "inside-cpr" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">Compressed range coiled within prev day&apos;s R4/S3 — breakout potential</div>
              </>
            ) : null}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            onClick={doScan}
            disabled={status === "scanning"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff" }}
          >
            <RefreshCw className={`w-4 h-4 ${status === "scanning" ? "animate-spin" : ""}`} />
            {status === "scanning" ? "Scanning Binance…" : "Scan Binance"}
          </button>

          <button
            onClick={doDeltaScan}
            disabled={deltaStatus === "scanning"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff" }}
          >
            <RefreshCw className={`w-4 h-4 ${deltaStatus === "scanning" ? "animate-spin" : ""}`} />
            {deltaStatus === "scanning" ? "Scanning Delta Exchange…" : "Scan Delta Exchange"}
          </button>

          {canShowCombined && (
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(["binance", "delta", "combined"] as ActiveTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-3 py-1.5 transition-colors capitalize"
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

          {/* NEW: results summary + Show All, moved here from the sub-filter
              section so it sits next to the exchange tab toggle. Same
              text-xs sizing/border styling as the tab toggle and other pill
              buttons in this row. Uses currentStatus/currentFilteredCount/
              currentAllCount/anySubFilter/displayed, all declared further
              down in the component body — fine since this reference only
              executes when the JSX returned below is evaluated. */}
          {currentStatus === "done" && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {anySubFilter
                  ? displayed.length
                  : showAll
                  ? currentAllCount
                  : currentFilteredCount}{" "}
                results
                {!showAll && !anySubFilter && ` (${currentFilteredCount} matching, ${currentAllCount} total)`}
              </span>
              <button
                onClick={() => {
                  setShowAll((v) => !v);
                  setShowLABothTiny(false);
                  setShowLAAllUp(false);
                  setShowLA1LHr(false);
                  setShowLAPL12CL23(false);
                  setShowLACompressed(false);
                  setShowOutsideCPRCompressed(false);
                  setShowOutsideCPReXHrL3U3AU4(false);
                  setShowInsideCPRExpanded(false);
                  setShowInsideCPRNarrow(false);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  setShowExpU3LtPU4(false);
                  setShowBigBeloweXLoL3U4AU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBeloweXU4L234AU4(false);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHRHAL(false);
                  setShowHA55HrL4U34FAU4(false);
                  setShowHiL4U4FAU4(false);
                  setShowLBCmprss(false);
                  setShowLBC34(false);
                  setShowLBE11(false);
                  setShowLBC2L2U2(false);
                  setShowLBBothTiny(false);
                  setShowLBAllUp(false);
                  setShowExpU4PU4(false);
                  setShowExpU3PU3(false);
                  setShowOBNLoL4U4(false);
                  setShowOBWLoL4U4(false);
                  setShowOBHiExL4U4(false);
                  setShoweXHiL4U234(false);
                }}
                className="px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAll ? "Show filtered only" : "Show all"}
              </button>
            </div>
          )}

          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search symbol…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-card text-foreground w-44 focus:outline-none focus:ring-1 focus:ring-primary"
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
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-0.5">Patterns:</span>

            {/* NEW: hR-HAL button — BigCPR Above, placed next to Show All */}
            {activePattern === "structure-bigabove" && !showAll && (
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
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHRHAL
                    ? "border-orange-400 text-orange-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="WideAbove, Pivot Level: Higher, Today's TC between Prev R1/R2, Today's R3 > Prev R4"
              >
                {showHRHAL ? "✕ hR-HAL" : "hR-HAL"}
              </button>
            )}

            {activePattern === "structure-bigabove" &&!showAll && (
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
            {activePattern === "structure-bigabove" && !showAll && (
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
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHiL4U4FAU4
                    ? "border-fuchsia-400 text-fuchsia-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Wide Above + HiL4U4 (Prev R4 inside today's R3/R4, Today's S4 inside Prev S3/S4) + Prev CPR pMicro (<=0.10%) + Today CPR Tiny (0.10%-0.25%)"
              >
                {showHiL4U4FAU4 ? "✕ 1T-HiL4U4-FAU4" : "1T-HiL4U4-FAU4"}
              </button>
            )}
            {/* NEW: LB-BothTiny button — replaces hidden "TinyBelow - Both Tiny" left-nav item */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBBothTiny((v) => !v); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBC34(false); setShowLBE11(false); setShowLBC2L2U2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBBothTiny
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleBelow AND TinyBelow-Both Tiny"
              >
                {showLBBothTiny ? "✕ LB-BothTiny" : "LB-BothTiny"}
              </button>
            )}

            {/* NEW: LB-AllUp button — replaces hidden "LittleBelow - Ladder" left-nav item */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBAllUp((v) => !v); setShowLBBothTiny(false); setShowLBCmprss(false); setShowLBC34(false); setShowLBE11(false); setShowLBC2L2U2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBAllUp
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleBelow AND LittleBelow-Ladder (all R/S levels stepped down)"
              >
                {showLBAllUp ? "✕ LB-AllUp" : "LB-AllUp"}
              </button>
            )}

            {/* NEW: lb-Cmprss-L4>3/U4<2 button — only shown on littlebelow, mirrors Show All style */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBCmprss((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBC34(false); setShowLBE11(false); setShowLBC2L2U2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBCmprss
                    ? "border-violet-400 text-violet-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="LB, Compressed: Todays L4 > PDay L3 / Todays U4 < PDays L2: Target:PU4"
              >
                {showLBCmprss ? "✕ lb-Cmprss-L4>3/U4<2" : "lb-Cmprss-L4>3/U4<2"}
              </button>
            )}

            {/* NEW: lb-c-l34c4/u23c4 button — only shown on littlebelow, mirrors lb-Cmprss style */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBC34((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBE11(false); setShowLBC2L2U2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBC34
                    ? "border-pink-400 text-pink-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="LB, PL34CL4 / Today R4 between Prev R2 and R3"
              >
                {showLBC34 ? "✕ lb-c-l34c4/u23c4" : "lb-c-l34c4/u23c4"}
              </button>
            )}

            {/* NEW: lbE11-cOLoL3U2-PU4 button — only shown on littlebelow, placed right after lb-c-l34c4/u23c4 */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBE11((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBC34(false); setShowLBC2L2U2(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBE11
                    ? "border-amber-400 text-amber-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Today's R4 inside Prev R1/R2 AND Today's S4 inside Prev S2/S3, both CPRs 1%-1.5% wide: Target:Bullish PU4"
              >
                {showLBE11 ? "✕ lbE11-cOLoL3U2-PU4" : "lbE11-cOLoL3U2-PU4"}
              </button>
            )}

            {/* NEW: cO2-L2U2 button — only shown on littlebelow, placed right after lbE11-cOLoL3U2-PU4 */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBC2L2U2((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBC34(false); setShowLBE11(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBC2L2U2
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Compressed Inside Previous L2 and Previous U2: Target: Bullish U4"
              >
                {showLBC2L2U2 ? "✕ cO2-L2U2" : "cO2-L2U2"}
              </button>
            )}

            {activePattern === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLABothTiny((v) => !v); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLABothTiny
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleAbove AND TinyAbove-Both Tiny"
              >
                {showLABothTiny ? "✕ LA-BothTiny" : "LA-BothTiny"}
              </button>
            )}
            {activePattern === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLAAllUp((v) => !v); setShowLABothTiny(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLAAllUp
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleAbove AND LittleAbove-Ladder (all R/S levels stepped up)"
              >
                {showLAAllUp ? "✕ LA-AllUp" : "LA-AllUp"}
              </button>
            )}
            {/* NEW: 1LHr-L4U3-U4 button — Little Above, placed next to LA-AllUp */}
            {activePattern === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLA1LHr((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLAPL12CL23(false); setShowLACompressed(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLA1LHr
                    ? "border-teal-400 text-teal-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Todays S4 > Prev S4 & < Prev S3, Todays R3 > Prev R4, Today CPR width < 0.1%, Prev CPR width 0.1%–1%"
              >
                {showLA1LHr ? "✕ 1LHr-L4U3-U4" : "1LHr-L4U3-U4"}
              </button>
            )}
            {activePattern === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLAPL12CL23((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLACompressed(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLAPL12CL23
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols matching LA-PL12CL23:2PL4 (Bearish Target: 2PL4)"
              >
                {showLAPL12CL23 ? "✕ PL12CL23" : "PL12CL23"}
              </button>
            )}
            {activePattern === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLACompressed((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLACompressed
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Compressed Inside Previous L2 and Previous U3: Target:Bullish APU4"
              >
                {showLACompressed ? "✕ cOL2U3-ApU4" : "cOL2U3-ApU4"}
              </button>
            )}
            {activePattern === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowExpU4PU4((v) => !v); setShowExpU3PU3(false); setShowOBNLoL4U4(false); setShowOBWLoL4U4(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showExpU4PU4
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Prev R4 between today's R3/R4 and Prev S4 between today's S3/S4 with today's CPR Mini"
              >
                {showExpU4PU4 ? "✕ eXLo-L4U4-U4" : "eXLo-L4U4-U4"}
              </button>
            )}
            {/* NEW: Exp-U3>pU4 button — Overlapping Lower, placed right after eXLo-L4U4-U4 */}
            {activePattern === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowExpU3PU3((v) => !v); setShowExpU4PU4(false); setShowOBNLoL4U4(false); setShowOBWLoL4U4(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showExpU3PU3
                    ? "border-sky-400 text-sky-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="U3 > pU4/L3 < pL4 ,CPR Narrow: Target:AU4"
              >
                {showExpU3PU3 ? "✕ Exp-U3>pU4" : "Exp-U3>pU4"}
              </button>
            )}
            {/* NEW: OBN-LoL4U4-U4 button — Overlapping Lower, placed next to Exp-U3>pU4 */}
            {activePattern === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBNLoL4U4((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBWLoL4U4(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBNLoL4U4
                    ? "border-cyan-400 text-cyan-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Lower + today's CPR Narrow + LoL4U4 structure, Compression > 50%: Target:U4"
              >
                {showOBNLoL4U4 ? "✕ OBN-LoL4U4-U4" : "OBN-LoL4U4-U4"}
              </button>
            )}
            {/* NEW: OBW-LoL4U4-L4 button — Overlapping Lower, placed next to OBN-LoL4U4-U4 */}
            {activePattern === "overlapping-lower" && !showAll && (
              <button
                onClick={() => { setShowOBWLoL4U4((v) => !v); setShowExpU4PU4(false); setShowExpU3PU3(false); setShowOBNLoL4U4(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBWLoL4U4
                    ? "border-rose-400 text-rose-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Lower + today's CPR Wide + LoL4U4 structure, Compression > 50%: Target:U4"
              >
                {showOBWLoL4U4 ? "✕ OBW-LoL4U4-L4" : "OBW-LoL4U4-L4"}
              </button>
            )}
            {/* NEW: eXHi-L4U4-U4 button — Overlapping Higher, counterpart of
                eXLo-L4U4-U4 under Overlapping Lower. Same r.eXL4U4 boolean
                from cpr.ts, gated on r.overlapHigher + pSmall(prev)/Tiny(today). */}
            {activePattern === "overlapping-higher" && !showAll && (
              <button
                onClick={() => { setShowOBHiExL4U4((v) => !v); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOBHiExL4U4
                    ? "border-pink-400 text-pink-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Overlap Higher: Prev R4 between today's R3/R4, Prev S4 between today's S3/S4, Prev CPR pSmall, Today CPR Tiny"
              >
                {showOBHiExL4U4 ? "✕ eXHi-L4U4-U4" : "eXHi-L4U4-U4"}
              </button>
            )}
            {activePattern === "outside-cpr" && !showAll && (
              <button
                onClick={() => { setShowOutsideCPRCompressed((v) => !v); setShowOutsideCPReXHrL3U3AU4(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOutsideCPRCompressed
                    ? "border-purple-400 text-purple-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show OutsideCPR symbols where today R4 < prev R4 AND today S4 > prev S4 (compressed range)"
              >
                {showOutsideCPRCompressed ? "✕ Compressed" : "Compressed"}
              </button>
            )}
            {/* NEW: eXHrL3U3-AU4 button — Outside CPR, placed next to Compressed */}
            {activePattern === "outside-cpr" && !showAll && (
              <button
                onClick={() => { setShowOutsideCPReXHrL3U3AU4((v) => !v); setShowOutsideCPRCompressed(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOutsideCPReXHrL3U3AU4
                    ? "border-rose-400 text-rose-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Prev S4 between today's S3/S4 AND Prev R4 between today's R2/R3, Today CPR width 0.5%-2%, Prev CPR width <0.5%"
              >
                {showOutsideCPReXHrL3U3AU4 ? "✕ eXHrL3U3-AU4" : "eXHrL3U3-AU4"}
              </button>
            )}
            {activePattern === "inside-cpr" && !showAll && (
              <button
                onClick={() => { setShowInsideCPRExpanded((v) => !v); setShowInsideCPRNarrow(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showInsideCPRExpanded
                    ? "border-orange-400 text-orange-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show InsideCPR symbols where today R4 > prev R4 AND today S4 < prev S4 (expanded range)"
              >
                {showInsideCPRExpanded ? "✕ Expanded" : "Expanded"}
              </button>
            )}
            {/* NEW: inside-cpr-narrow button — sibling of Expanded, mutually exclusive with it */}
            {activePattern === "inside-cpr" && !showAll && (
              <button
                onClick={() => { setShowInsideCPRNarrow((v) => !v); setShowInsideCPRExpanded(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showInsideCPRNarrow
                    ? "border-cyan-400 text-cyan-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show InsideCPR symbols where today's CPR width < 0.5% (Narrow) — coiled-spring setup"
              >
                {showInsideCPRNarrow ? "✕ Narrow" : "Narrow"}
              </button>
            )}
            {activePattern === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowBigBelowPMiniPL3((v) => !v);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowExpU3LtPU4(false);
                  setShowBigBeloweXLoL3U4AU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBeloweXU4L234AU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBelowPMiniPL3
                    ? "border-cyan-400 text-cyan-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Compressed, Mini PCPR, PL34CL4, Prev U3 above U4: Target-APU4"
              >
                {showBigBelowPMiniPL3 ? "✕ pMini-L34C4/U3>4" : "pMini-L34C4/U3>4"}
              </button>
            )}
            {/* NEW: eX-U4L34 button — Big Below, placed next to pMini-L34C4/U3>4 */}
            {activePattern === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowExpU3LtPU4((v) => !v);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowBigBeloweXLoL3U4AU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBeloweXU4L234AU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showExpU3LtPU4
                    ? "border-rose-400 text-rose-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Todays U4 is above PU4 and Todays L3/L4 below PL4: Target:Far Below PL4"
              >
                {showExpU3LtPU4 ? "✕ eX-U4L34" : "eX-U4L34"}
              </button>
            )}
            {/* NEW: eXLoL3U4-AU4 button — Big Below, placed next to eX-U4L34 (moved from LittleCPR Below) */}
            {activePattern === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowBigBeloweXLoL3U4AU4((v) => !v);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowExpU3LtPU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBeloweXU4L234AU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBeloweXLoL3U4AU4
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Wide Below: Prev R4 between today's R3/R4 AND Prev S4 above today's S3, Today CPR width 0.5%-2%, Prev CPR width <0.5%"
              >
                {showBigBeloweXLoL3U4AU4 ? "✕ eXLoL3U4-AU4" : "eXLoL3U4-AU4"}
              </button>
            )}
            {/* NEW: L1<pL4 button — Big Below, placed next to eX-U4L34 */}
            {activePattern === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowBigBelowL1LtPL4((v) => !v);
                  setShowL1LtPL4CprLtPL4(false);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowExpU3LtPU4(false);
                  setShowBigBeloweXLoL3U4AU4(false);
                  setShowBigBeloweXU4L234AU4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBelowL1LtPL4
                    ? "border-amber-400 text-amber-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Todays S1 below Prev S4 AND Todays R2 above Prev R4 (Wide CPR Below Prev CPR)"
              >
                {showBigBelowL1LtPL4 ? "✕ L1<pL4" : "L1<pL4"}
              </button>
            )}
            {/* NEW: CPR<pL4 sub-toggle — restrict L1<pL4 results to rows where today's TC is below prev day's S4 */}
            {activePattern === "structure-bigbelow" && !showAll && showBigBelowL1LtPL4 && (
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
            {/* NEW: eXU4L234-AU4 button — Big Below, placed next to L1<pL4.
                Pivot Level eXU4L234 + prev R3 above today's R3 + today R1/prev
                S1 between the two pivots + prev CPR pSmall + today CPR 1%-2%. */}
            {activePattern === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => {
                  setShowBigBeloweXU4L234AU4((v) => !v);
                  setShowBigBelowPMiniPL3(false);
                  setShowBigBelowPMiniRising(false);
                  pMiniRisingAlertedRef.current.clear();
                  setShowExpU3LtPU4(false);
                  setShowBigBeloweXLoL3U4AU4(false);
                  setShowBigBelowL1LtPL4(false);
                  setShowL1LtPL4CprLtPL4(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBeloweXU4L234AU4
                    ? "border-amber-400 text-amber-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Wide Below + eXU4L234 (Prev R4 inside today's R3/R4, Prev S4 inside today's S1/S2), Prev R3 > Today R3, Today R1 or Prev S1 between the two Pivots, Prev CPR pSmall (0.6%-1.1%), Today CPR 1%-2%"
              >
                {showBigBeloweXU4L234AU4 ? "✕ eXU4L234-AU4" : "eXU4L234-AU4"}
              </button>
            )}
            {/* NEW: live sub-toggle — restrict pMini results to rows currently trading above today's TC */}
            {activePattern === "structure-bigbelow" && !showAll && showBigBelowPMiniPL3 && (
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
            {activePattern === "structure-bigbelow" && !showAll && showBigBelowPMiniPL3 && (
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
            {activePattern === "structure-bigabove" && !showAll && (
              <button
                onClick={() => { setShowBigAbovePL34CL4((v) => !v); setShowBAComp(false); setShowHAU1(false); setShowHAU1CprAbovePU4(false); setShowHAU1L1AbovePU4(false); setShowHAU1PWideAbove(false); setShowHRHAL(false); setShoweXHiL4U234(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigAbovePL34CL4
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="BigAbove: PL34CL4 AND today R3 above prev R4"
              >
                {showBigAbovePL34CL4 ? "✕ PL34CL4/U3>PU4" : "PL34CL4/U3>PU4"}
              </button>
            )}
            {/* NEW: BAComp-l3>pl1/u3>pu1 button — inside BigCPR Above, next to Show All */}
            {activePattern === "structure-bigabove" && !showAll && (
              <button
                onClick={() => { setShowBAComp((v) => !v); setShowBigAbovePL34CL4(false); setShowHAU1(false); setShowHAU1CprAbovePU4(false); setShowHAU1L1AbovePU4(false); setShowHAU1PWideAbove(false); setShowHRHAL(false); setShoweXHiL4U234(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBAComp
                    ? "border-sky-400 text-sky-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="BigAbove: Compressed inside PU2: Target:U4"
              >
                {showBAComp ? "✕ Inside PUL2" : "Inside PUL2"}
              </button>
            )}
            {/* NEW: eXHi-L4U234-U4 button — inside BigCPR Above, next to Show All */}
            {activePattern === "structure-bigabove" && !showAll && (
              <button
                onClick={() => { setShoweXHiL4U234((v) => !v); setShowBAComp(false); setShowBigAbovePL34CL4(false); setShowHAU1(false); setShowHAU1CprAbovePU4(false); setShowHAU1L1AbovePU4(false); setShowHAU1PWideAbove(false); setShowHRHAL(false);}}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showeXHiL4U234
                    ? "border-violet-400 text-violet-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="BigAbove: eXHi-L4U234: Target:U4"
              >
                {showeXHiL4U234 ? "✕ eXHi-L4U234-U4" : "eXHi-L4U234-U4"}
              </button>
            )}
            {/* NEW: U1>PU4 button — inside BigCPR Above, next to Inside PUL2 (moved from left-nav) */}
            {activePattern === "structure-bigabove" && !showAll && (
              <button
                onClick={() => {
                  setShowHAU1((v) => !v);
                  setShowBigAbovePL34CL4(false);
                  setShowBAComp(false);
                  setShowHAU1CprAbovePU4(false);
                  setShowHAU1L1AbovePU4(false);
                  setShowHAU1PWideAbove(false);
                  setShowHRHAL(false);
                  setShoweXHiL4U234(false);
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHAU1
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Todays U1> Previous U4"
              >
                {showHAU1 ? "✕ U1>PU4" : "U1>PU4"}
              </button>
            )}
            {/* NEW: pWideAbove button — nested under U1>PU4, independent of the
                CPR>PU4/L1>PU4 chain. Prev CPR wider than pp-CPR AND Prev CPR above pp-CPR. */}
            {activePattern === "structure-bigabove" && !showAll && showHAU1 && (
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
            {activePattern === "structure-bigabove" && !showAll && showHAU1 && (
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
            {activePattern === "structure-bigabove" && !showAll && showHAU1 && showHAU1CprAbovePU4 && (
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

          {/* Pivot Level filter buttons — own line, independent of activePattern
              AND independent of showAll. These always render, regardless of Show All state, and
              are mutually exclusive within their own group. */}
          <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-0.5">Pivot Level:</span>
              {(
                [
                  { label: "eX-Higher", active: "border-purple-400 text-purple-400" },
                  { label: "eX-Lower", active: "border-fuchsia-400 text-fuchsia-400" },
                  { label: "cO-Higher", active: "border-cyan-400 text-cyan-400" },
                  { label: "cO-Lower", active: "border-teal-400 text-teal-400" },
                  { label: "Higher", active: "border-green-400 text-green-400" },
                  { label: "Lower", active: "border-destructive text-destructive" },
                  { label: "cOLoL2U1", active: "border-rose-400 text-rose-400" },
                  { label: "cOLoL4U3", active: "border-amber-400 text-amber-400" },
                  { label: "LoL4U4", active: "border-lime-400 text-lime-400" },
                  { label: "eXHiL4U234", active: "border-violet-400 text-violet-400" },
                  { label: "eXL4U4", active: "border-pink-400 text-pink-400" },
                  { label: "HiL2U4", active: "border-cyan-400 text-cyan-400" },
                  { label: "HiL3U4", active: "border-lime-400 text-lime-400" },
                  { label: "HiL4U4", active: "border-fuchsia-400 text-fuchsia-400" },
                  { label: "HiL4U34", active: "border-indigo-400 text-indigo-400" },
                  { label: "cOHiL2U3", active: "border-sky-400 text-sky-400" },
                  { label: "cOHiL3U3", active: "border-sky-400 text-sky-400" },
                  { label: "eXU4L234", active: "border-amber-400 text-amber-400" },
                  { label: "cOHiL2U4", active: "border-emerald-400 text-emerald-400" },
                  { label: "eXL3U3", active: "border-orange-400 text-orange-400" },
                  { label: "cOL4U4",   active: "border-orange-400 text-orange-400" },
                  { label: "cOL3U4",   active: "border-yellow-400 text-yellow-400" },
                  { label: "cOU3L3",   active: "border-teal-400 text-teal-400" },
                  { label: "LoU3L4",   active: "border-indigo-400 text-indigo-400" },
                  { label: "LoU3L34",  active: "border-purple-400 text-purple-400" },
                  { label: "LoU2L4",   active: "border-pink-400 text-pink-400" },
                  { label: "LoU2L3",   active: "border-rose-400 text-rose-400" },
                  { label: "LoU4L34",  active: "border-amber-400 text-amber-400" },
                  { label: "LoU4L234",  active: "border-violet-400 text-violet-400" },
                  { label: "cOHiL2U2",  active: "border-sky-400 text-sky-400" },
                  { label: "cOLoU2L3",  active: "border-emerald-400 text-emerald-400" },
                  { label: "LoU4L1234", active: "border-orange-400 text-orange-400" },
                  { label: "cOLoU1L2",  active: "border-cyan-400 text-cyan-400" },
                  { label: "cOLoU2L4",  active: "border-lime-400 text-lime-400" },
                ] as { label: PivotLevelInfo["label"]; active: string }[]
              ).map(({ label, active }) => (
                <button
                  key={label}
                  onClick={() => setPivotLevelFilter((v) => (v === label ? null : label))}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    pivotLevelFilter === label
                      ? active
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={`Show only rows where Pivot Level = ${label}`}
                >
                  {pivotLevelFilter === label ? `✕ ${label}` : label}
                </button>
              ))}
          </div>

          {/* CPR Width filter buttons — 8-tier Micro→Ultra ladder (today's CPR)
              followed by the p-prefixed previous-day variants, then PDH/PDL.
              Order per spec: pMicro-pTiny-pMini-pSmall-pMedium-pLarge-pMega-
              pUltra, Micro-Tiny-Mini-Small-Medium-Large-Mega-Ultra, PDH-PDL.
              Mutually exclusive within the whole row (single widthFilter
              state), independent of activePattern and showAll. */}
          <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-0.5">CPR Width:</span>
              {(
                [
                  { key: "pmicro",  label: "pMicro",  range: "≤0.10%",         active: "border-violet-400 text-violet-400" },
                  { key: "ptiny",   label: "pTiny",   range: "0.10–0.22%",     active: "border-purple-400 text-purple-400" },
                  { key: "pmini",   label: "pMini",   range: "0.22–0.60%",     active: "border-teal-400 text-teal-400" },
                  { key: "psmall",  label: "pSmall",  range: "0.60–1.10%",     active: "border-indigo-400 text-indigo-400" },
                  { key: "pmedium", label: "pMedium", range: "1.10–2.00%",     active: "border-blue-400 text-blue-400" },
                  { key: "plarge",  label: "pLarge",  range: "2.00–5.00%",     active: "border-amber-400 text-amber-400" },
                  { key: "pmega",   label: "pMega",   range: "5.00–10.00%",    active: "border-orange-400 text-orange-400" },
                  { key: "pultra",  label: "pUltra",  range: ">10.00%",        active: "border-rose-400 text-rose-400" },
                  { key: "micro",   label: "Micro",   range: "≤0.10%",         active: "border-violet-400 text-violet-400" },
                  { key: "tiny",    label: "Tiny",    range: "0.10–0.22%",     active: "border-purple-400 text-purple-400" },
                  { key: "mini",    label: "Mini",    range: "0.22–0.60%",     active: "border-teal-400 text-teal-400" },
                  { key: "small",   label: "Small",   range: "0.60–1.10%",     active: "border-indigo-400 text-indigo-400" },
                  { key: "medium",  label: "Medium",  range: "1.10–2.00%",     active: "border-blue-400 text-blue-400" },
                  { key: "large",   label: "Large",   range: "2.00–5.00%",     active: "border-amber-400 text-amber-400" },
                  { key: "mega",    label: "Mega",    range: "5.00–10.00%",    active: "border-orange-400 text-orange-400" },
                  { key: "ultra",   label: "Ultra",   range: ">10.00%",        active: "border-rose-400 text-rose-400" },
                ] as { key: NonNullable<WidthFilter>; label: string; range: string; active: string }[]
              ).map(({ key, label, range, active }) => (
                <button
                  key={key}
                  onClick={() => setWidthFilter((v) => (v === key ? null : key))}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    widthFilter === key
                      ? active
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={`Show only rows where ${key.startsWith("p") ? "prev day's" : "today's"} CPR width is ${range}`}
                >
                  {widthFilter === key ? `✕ ${label}` : label}
                </button>
              ))}
              {/* PDH / PDL buttons — mutually exclusive with each other, placed after Ultra */}
              <button
                onClick={() => setPdhPdlFilter((v) => (v === "above" ? null : "above"))}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  pdhPdlFilter === "above"
                    ? "border-green-400 text-green-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show only rows where price is currently above yesterday's High (PDH)"
              >
                {pdhPdlFilter === "above" ? "✕ PDH" : "PDH"}
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
                {pdhPdlFilter === "below" ? "✕ PDL" : "PDL"}
              </button>
          </div>
          </div>
        )}

        {/* Table */}
        {currentStatus === "done" && displayed.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
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
                      Pivot<br />Level
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      CPR
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("compressionRatio")}
                    >
                      SIZE RATIO <SortIcon k="compressionRatio" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
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
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("cprDistance")}
                    >
                      GAP <SortIcon k="cprDistance" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Chart
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayed.map((r) => {
                    const sym = splitSymbol(r.symbol, r.source);
                    const rowKey = `${r.source}-${r.symbol}`;
                    const isExpanded = expandedSymbols.has(rowKey);
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
                          {/* NEW: Symbol column narrowed (w-20 on the header) and the
                              quote (e.g. "USDT"/"USD") moved onto its own row directly
                              under the base symbol, in the SAME cell, using the SAME
                              font-size/color (text-muted-foreground text-xs font-normal)
                              it always had — just stacked instead of inline. This lets
                              the column itself shrink since it no longer needs to fit
                              "BASE/QUOTE" side-by-side on one line. */}
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
                                <span className="truncate">{sym.base}</span>
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
                          {/* Pivot Level column — now contains ONLY the directional
                              eX-Higher/eX-Lower/cO-Higher/cO-Lower/Higher/Lower badge.
                              All pattern/width badges moved to the new CPR column below. */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {(() => {
                                const pl = getPivotLevel(r);
                                return pl ? (
                                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${pl.classes}`}>
                                    {pl.label}
                                  </span>
                                ) : (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">—</span>
                                );
                              })()}
                            </div>
                            {/* NEW: cOLoL2U1 / cOLoL4U3 / LoL4U4 / eXHiL4U234 / eXL4U4 / HiL4U4 /
                                HiL4U34 / cOHiL2U3 / eXU4L234 badges — second row, Pivot Level
                                column. These are all independent, section-agnostic booleans —
                                they render whenever true, regardless of activePattern or any
                                left-nav / Show All state. */}
                            {(r.cOLoL2U1 || r.cOLoL4U3 || r.LoL4U4 || r.eXHiL4U234 || r.eXL4U4 || r.HiL4U4 || r.HiL4U34 || r.cOHiL2U3 || r.cOHiL3U3 || r.eXU4L234 || r.cOHiL2U4 || r.eXL3U3 || r.cOL4U4 || r.cOL3U4 || r.cOU3L3 || r.LoU3L4 || r.LoU3L34 || r.LoU2L4 || r.LoU2L3 || r.LoU4L34 || r.LoU4L234 || r.HiL2U4 || r.HiL3U4 || r.cOHiL2U2 || r.cOLoU2L3 || r.LoU4L1234 || r.cOLoU1L2 || r.cOLoU2L4) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {r.cOLoL2U1 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">cOLoL2U1</span>
                                )}
                                {r.cOLoL4U3 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">cOLoL4U3</span>
                                )}
                                {r.LoL4U4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">LoL4U4</span>
                                )}
                                {r.eXHiL4U234 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">eXHiL4U234</span>
                                )}
                                {r.eXL4U4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">eXL4U4</span>
                                )}
                                {r.HiL2U4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">HiL2U4</span>
                                )}
                                {r.HiL3U4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">HiL3U4</span>
                                )}
                                {r.HiL4U4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">HiL4U4</span>
                                )}
                                {/* NEW */}
                                {r.HiL4U34 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">HiL4U34</span>
                                )}
                                {r.cOHiL2U3 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">cOHiL2U3</span>
                                )}
                                {r.cOHiL3U3 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">cOHiL3U3</span>
                                )}
                                {/* NEW: eXU4L234 — independent, section-agnostic Pivot Level flag */}
                                {r.eXU4L234 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">eXU4L234</span>
                                )}
                                {r.cOHiL2U4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">cOHiL2U4</span>
                                )}
                                {/* NEW: eXL3U3 — independent Pivot Level flag.
                                    srExpanded + both L3 (s3/s4 adjacency) and U3 (r3/r4 adjacency)
                                    gaps non-zero — double-boundary expansion signal. */}
                                {r.eXL3U3 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">eXL3U3</span>
                                )}
                                {/* NEW: cOL4U4 / cOL3U4 / cOU3L3 — independent Pivot Level flags */}
                                {r.cOL4U4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">cOL4U4</span>
                                )}
                                {r.cOL3U4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">cOL3U4</span>
                                )}
                                {r.cOU3L3 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">cOU3L3</span>
                                )}
                                {r.LoU3L4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">LoU3L4</span>
                                )}
                                {r.LoU3L34 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">LoU3L34</span>
                                )}
                                {r.LoU2L4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">LoU2L4</span>
                                )}
                                {r.LoU2L3 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">LoU2L3</span>
                                )}
                                {r.LoU4L34 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">LoU4L34</span>
                                )}
                                {r.LoU4L234 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">LoU4L234</span>
                                )}
                                {r.cOHiL2U2 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">cOHiL2U2</span>
                                )}
                                {r.cOLoU2L3 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">cOLoU2L3</span>
                                )}
                                {r.LoU4L1234 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">LoU4L1234</span>
                                )}
                                {r.cOLoU1L2 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">cOLoU1L2</span>
                                )}
                                {r.cOLoU2L4 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20 font-medium">cOLoU2L4</span>
                                )}
                              </div>
                            )}
                          </td>
                          {/* NEW: CPR column — holds Above/Below/Inside/Outside/Overlap/Narrow/Skip
                              plus the width-category badges (2nd row): pCategory + Category, e.g.
                              "pMini Mini", using the 8-tier Micro→Ultra ladder. Always shown,
                              irrespective of which category the widths fall into.
                              FIX: Overlap-Lo / Overlap-Hi badges were previously gated behind
                              `activePattern === "overlapping-lower" || activePattern === "overlapping-higher"`,
                              which meant they silently vanished whenever "Show All" was clicked on
                              any OTHER left-nav tab (or, on the overlapping tabs themselves, added
                              an unnecessary extra condition since r.overlapLower/r.overlapHigher
                              already imply the row belongs in this bucket). Now unconditional, same
                              treatment as the other structural badges above — shown for any row
                              where the underlying boolean is true, irrespective of left-nav/Show All. */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {r.cprRising && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">Above</span>
                              )}
                              {r.cprFalling && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">Below</span>
                              )}
                              {passesPattern(r, "inside-cpr") && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">Inside</span>
                              )}
                              {passesPattern(r, "outside-cpr") && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">Outside</span>
                              )}
                              {r.overlapLower && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">oV-Below</span>
                              )}
                              {r.strWideCPR && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">Wide</span>
                              )}
                              {r.overlapHigher && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">oV-Above</span>
                              )}
                              {r.narrowCPR && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-chart-3/10 text-chart-3 border border-chart-3/20 font-medium">Narrow</span>
                              )}
                              {r.equalCPR && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Equal</span>
                              )}
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
                            {/* NEW: Width-category badges — always shown, "pCategory Category" format
                                (e.g. "pMini Mini"), using the 8-tier Micro/Tiny/Mini/Small/Medium/
                                Large/Mega/Ultra ladder, irrespective of which tier either width falls into. */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(() => {
                                const prevCat = getWidthCategory(r.prevCPR.widthPct);
                                const todayCat = getWidthCategory(r.todayCPR.widthPct);
                                return (
                                  <>
                                    <span
                                      className={`text-xs px-1.5 py-0.5 rounded border font-medium ${prevCat.pClasses}`}
                                      title={`Prev day CPR width: ${r.prevCPR.widthPct.toFixed(4)}%`}
                                    >
                                      p{prevCat.label}
                                    </span>
                                    <span
                                      className={`text-xs px-1.5 py-0.5 rounded border font-medium ${todayCat.classes}`}
                                      title={`Today's CPR width: ${r.todayCPR.widthPct.toFixed(4)}%`}
                                    >
                                      {todayCat.label}
                                    </span>
                                  </>
                                );
                              })()}
                           </div>
                          </td>
                          <td className="px-4 py-3 font-mono whitespace-nowrap">
                            <div className="text-xs text-chart-3">
                              <span className="text-muted-foreground">TDay: </span>{r.todayCPR.widthPct.toFixed(4)}%
                            </div>
                            <div className={`text-xs font-semibold py-0.5 ${
                              r.compressionRatio < 25 ? "text-green-400"
                              : r.compressionRatio < 50 ? "text-accent"
                              : r.compressionRatio < 75 ? "text-yellow-500"
                              : "text-destructive"
                            }`}>
                              {r.compressionRatio.toFixed(1)}%
                              <div className="w-full bg-muted rounded-full h-1 mt-0.5 max-w-[64px]">
                                <div
                                  className={`h-1 rounded-full transition-all ${
                                    r.compressionRatio < 25 ? "bg-green-400"
                                    : r.compressionRatio < 50 ? "bg-accent"
                                    : r.compressionRatio < 75 ? "bg-yellow-500"
                                    : "bg-destructive"
                                  }`}
                                  style={{ width: `${Math.min(r.compressionRatio, 100)}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-xs text-chart-3/70">
                              <span className="text-muted-foreground">PDay: </span>{r.prevCPR.widthPct.toFixed(4)}%
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono whitespace-nowrap">
                            <div className="text-xs font-semibold text-foreground">Price: {fmt(r.currentPrice)}</div>
                            <div className={`text-xs font-semibold py-0.5 ${r.change24h >= 0 ? "text-green-400" : "text-destructive"}`}>
                              {fmtPct(r.change24h)}
                              <div className="w-full bg-muted rounded-full h-1 mt-0.5 max-w-[64px]">
                                <div
                                  className={`h-1 rounded-full transition-all ${r.change24h >= 0 ? "bg-green-400" : "bg-destructive"}`}
                                  style={{ width: `${Math.min(Math.abs(r.change24h) * 5, 100)}%` }}
                                />
                              </div>
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
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {hasKnownChartMapping(r.symbol, r.source) ? (
                              <a
                                href={getChartUrl(r.symbol, r.source)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="Open on TradingView"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span
                                className="text-muted-foreground/30 cursor-not-allowed inline-flex"
                                title="Not available on TradingView — Delta's /BUSD tokenized-stock instruments aren't listed under DELTAIN yet"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* ADK S/R Ladder + CPR boxes */}
                        {isExpanded && (
                          <tr key={`${rowKey}-sr`} className="bg-muted/20 border-b border-border">
                            <td colSpan={20} className="px-6 py-4">
                              <div className="flex flex-wrap gap-10 items-start">
                                {/* Prev Day CPR box */}
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
                                {/* Today CPR box */}
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
                                {/* Divider */}
                                <div className="hidden sm:block w-px self-stretch bg-border/50 mx-2" />
                                {/* S/R Ladders */}
                                <SRLadder cpr={r.prevCPR} currentPrice={r.currentPrice} label="Prev Day S/R" />
                                <SRLadder cpr={r.todayCPR} currentPrice={r.currentPrice} label="Today S/R" />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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

        <div className="mt-8 text-xs text-muted-foreground text-center">
          Binance: top 500 USDT pairs · Delta Exchange: 195 perpetual futures · CPR from completed UTC daily candles (ADK logic)
          <br />
          Auto-scans once daily at 5:31 AM IST · PH/PL = Previous Day High/Low · Not financial advice · by Kriven Gokul
        </div>
      </div>
    </div>
  );
}
