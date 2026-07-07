import { useState, useEffect, useRef, useCallback } from "react";
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
  passesPattern,
  matchesWidthFilter,
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
} from "./ScreenerUtils";
import LiveClock from "./LiveClock";

export default function Screener({ activePattern = "littleabove", scanKey = 0 }: { activePattern?: string; scanKey?: number }) {
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
  // NEW: cOHrL3U32-AU4 filter state — Outside CPR inside pattern variant
  const [showOutsideCPRcOHrL3U32AU4, setShowOutsideCPRcOHrL3U32AU4] = useState(false);
  const [showInsideCPRExpanded, setShowInsideCPRExpanded] = useState(false);
  // NEW: inside-cpr-narrow — sibling of showInsideCPRExpanded, coiled-spring
  // setup: CPR inside prev day's CPR AND today's CPR width < 0.5% (Narrow)
  const [showInsideCPRNarrow, setShowInsideCPRNarrow] = useState(false);
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
  // NEW: L1<pL4 filter state (Big Below), next to eX-U4L34
  const [showBigBelowL1LtPL4, setShowBigBelowL1LtPL4] = useState(false);
  // NEW: CPR<pL4 sub-toggle on top of L1<pL4 — restrict to rows where today's BC is below prev day's S4
  const [showL1LtPL4CprLtPL4, setShowL1LtPL4CprLtPL4] = useState(false);
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
  // NEW: LB Compressed filter state
  const [showLBCmprss, setShowLBCmprss] = useState(false);
  const [showLBC34, setShowLBC34] = useState(false);
  // NEW: LB cO2-L2U2 filter state (Compressed inside Previous L2/U2)
  const [showLBC2L2U2, setShowLBC2L2U2] = useState(false);
  // NEW: LB-BothTiny / LB-AllUp filter state (replaces hidden left-nav items)
  const [showLBBothTiny, setShowLBBothTiny] = useState(false);
  const [showLBAllUp, setShowLBAllUp] = useState(false);
  const [showExpU4PU4, setShowExpU4PU4] = useState(false);
  // NEW: Exp-U3>U3 filter state (Overlapping Lower)
  const [showExpU3PU3, setShowExpU3PU3] = useState(false);
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

  const doScan = useCallback(async () => {
    if (scanRef.current) return;
    scanRef.current = true;
    setStatus("scanning");
    setActiveTab("binance");
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

  const doDeltaScan = useCallback(async () => {
    if (deltaScanRef.current) return;
    deltaScanRef.current = true;
    setDeltaStatus("scanning");
    setActiveTab("delta");
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
      doDeltaScan();
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
    pMiniRisingAlertedRef.current.forEach((key) => {
      if (!currentRisingKeys.has(key)) pMiniRisingAlertedRef.current.delete(key);
    });

    if (newlyRising) playPMiniAlertSound();
  }, [allResults, deltaAllResults, activePattern, showBigBelowPMiniPL3, pMiniAlertsEnabled]);

  useEffect(() => {
    if (allResults.length > 0) setFiltered(allResults.filter((r) => passesPattern(r, activePattern)));
    if (deltaAllResults.length > 0) setDeltaFiltered(deltaAllResults.filter((r) => passesPattern(r, activePattern)));
    if (activePattern !== "littleabove") { setShowLABothTiny(false); setShowLAAllUp(false); setShowLA1LHr(false); setShowLAPL12CL23(false); setShowLACompressed(false); }
    if (activePattern !== "outside-cpr") { setShowOutsideCPRCompressed(false); setShowOutsideCPReXHrL3U3AU4(false); setShowOutsideCPRcOHrL3U32AU4(false); }
    if (activePattern !== "inside-cpr") { setShowInsideCPRExpanded(false); setShowInsideCPRNarrow(false); setShowInsideCPRCoU4L3(false); }
    if (activePattern !== "overlapping-lower") { setShowExpU4PU4(false); setShowExpU3PU3(false); }
    if (activePattern !== "structure-bigbelow") { setShowBigBelowPMiniPL3(false); setShowBigBelowPMiniRising(false); pMiniRisingAlertedRef.current.clear(); setShowExpU3LtPU4(false); setShowBigBelowL1LtPL4(false); setShowL1LtPL4CprLtPL4(false); }
    if (activePattern !== "structure-bigabove") { setShowBigAbovePL34CL4(false); setShowBAComp(false); setShowHAU1(false); setShowHAU1CprAbovePU4(false); setShowHAU1L1AbovePU4(false); setShowHAU1PWideAbove(false); setShowHRHAL(false); }
    if (activePattern !== "littlebelow") { setShowLBCmprss(false); setShowLBC34(false); setShowLBC2L2U2(false); setShowLBBothTiny(false); setShowLBAllUp(false); }
  }, [activePattern, allResults, deltaAllResults]);

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
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "mP-U34>pU2")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "mP-U34>pU2")).map((r) => ({ ...r, source: "delta" as const }));
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
    // NEW: cOHrL3U32-AU4 pool handler
    if (showOutsideCPRcOHrL3U32AU4 && activePattern === "outside-cpr") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "cOHrL3U32-AU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "cOHrL3U32-AU4"))
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
    if (showBigBelowL1LtPL4 && activePattern === "structure-bigbelow") {
      let binanceIntersect = allResults
        .filter((r) => passesPattern(r, "L1<pL4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      let deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "L1<pL4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (showL1LtPL4CprLtPL4) {
        binanceIntersect = binanceIntersect.filter((r) => r.todayCPR.tc < r.prevCPR.s4);
        deltaIntersect = deltaIntersect.filter((r) => r.todayCPR.tc < r.prevCPR.s4);
      }
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
    if (showHAU1 && activePattern === "structure-bigabove") {
      let binanceIntersect = allResults
        .filter((r) => passesPattern(r, "HA-U1>PU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      let deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "HA-U1>PU4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (showHAU1PWideAbove) {
        binanceIntersect = binanceIntersect.filter((r) => isPWideAbove(r));
        deltaIntersect = deltaIntersect.filter((r) => isPWideAbove(r));
      }
      if (showHAU1CprAbovePU4) {
        binanceIntersect = binanceIntersect.filter((r) => isCprAbovePU4(r));
        deltaIntersect = deltaIntersect.filter((r) => isCprAbovePU4(r));
        if (showHAU1L1AbovePU4) {
          binanceIntersect = binanceIntersect.filter((r) => isL1AbovePU4(r));
          deltaIntersect = deltaIntersect.filter((r) => isL1AbovePU4(r));
        }
      }
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
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
        .filter((r) => passesPattern(r, "Exp-U4>pU4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "Exp-U4>pU4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showExpU3PU3 && activePattern === "overlapping-lower") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "Exp-U3>pU3"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "Exp-U3>pU3"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }

    if (activeTab === "combined") return showAll ? combinedAllResults : combinedResults;
    if (activeTab === "delta") return showAll ? deltaAllResults.map((r) => ({ ...r, source: "delta" as const })) : deltaFiltered.map((r) => ({ ...r, source: "delta" as const }));
    return showAll ? allResults.map((r) => ({ ...r, source: "binance" as const })) : filtered.map((r) => ({ ...r, source: "binance" as const }));
  };

  const pool = getActivePool();

  const searchFiltered = pool.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return r.symbol.toLowerCase().includes(q);
  });

  const widthFiltered = searchFiltered.filter((r) => matchesWidthFilter(r, widthFilter));

  const pivotFiltered = widthFiltered.filter((r) => {
    if (!pivotLevelFilter) return true;
    const info = getPivotLevel(r);
    return info.label === pivotLevelFilter;
  });

  const pdhPdlFiltered = pivotFiltered.filter((r) => {
    if (!pdhPdlFilter) return true;
    const status = pdhPdlStatus(r);
    if (pdhPdlFilter === "above") return status.isAbovePDH;
    if (pdhPdlFilter === "below") return status.isBelowPDL;
    return true;
  });

  const sorted = [...pdhPdlFiltered].sort((a, b) => {
    const valA = getVal(a, sortKey);
    const valB = getVal(b, sortKey);
    if (typeof valA === "string" && typeof valB === "string") {
      return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    const numA = Number(valA) || 0;
    const numB = Number(valB) || 0;
    return sortDir === "asc" ? numA - numB : numB - numA;
  });

  return (
    <div className="space-y-6">
      {/* UI implementation continues... */}
    </div>
  );
}
