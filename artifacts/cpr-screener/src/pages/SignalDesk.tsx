import { useState, useMemo, useEffect } from "react";
import { fmt, fmtPct } from "./ScreenerUtils";
import { autoSaveQualifiedSignals } from "@/lib/signalTracker";
import { Views } from "@/lib/ViewsSidebar";
import SignalProgressBar from "@/lib/SignalProgressBar";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Search,
  Copy,
  Check,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Target,
  Sparkles,
  Cloud,
  X,
} from "lucide-react";

// Lightweight projection of a matching row that Screener hands up via
// onSignalSymbols — this is the post-filter `displayed` pool (already
// scoped to whatever left-nav pattern/Views is active), not the full
// CPRResultWithSource. It intentionally does NOT carry tc/bc or the
// SSRR/HHLL pattern-category flags, so SignalDesk no longer re-derives
// "which pattern matched" itself — it trusts Screener's activeView/
// activeLabel for that and just projects each symbol into a card.
export interface SignalDeskSymbol {
  key: string;
  symbol: string;
  source: "binance" | "delta";
  currentPrice: number;
  change24h?: number;
  direction: "up" | "down";
  s4: number;
  s3?: number;
  s2: number;
  s1: number;
  pivot: number;
  r1: number;
  r2: number;
  r3?: number;
  r4: number;
}

interface SignalDeskProps {
  symbols: SignalDeskSymbol[];
  activeView?: string;
  activeLabel?: string;
  counts?: Record<string, number>;
  onSelectPattern?: (patternId: string) => void;
}

export interface SignalItem {
  id: string;
  symbol: string;
  source: "binance" | "delta";
  timeframe: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  type: string;
  patternName: string;
  triggerPrice: number;
  currentPrice: number;
  targetPrice: number;
  stopPrice: number;
  targetLevel: string;
  riskReward: string;
  confidence: "HIGH" | "MEDIUM" | "WATCH";
  cprStatus: string;
  pivot: number;
  r1: number;
  s1: number;
  r2: number;
  s2: number;
  r3?: number;
  s3?: number;
  r4: number;
  s4: number;
  change24h?: number;
  timestamp: string;
}

export default function SignalDesk({
  symbols,
  activeView,
  activeLabel,
  counts = {},
  onSelectPattern,
}: SignalDeskProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "binance" | "delta">("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "LONG" | "SHORT">("all");
  const [selectedViewPattern, setSelectedViewPattern] = useState<string>(activeView || "");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync if activeView changes externally
  useEffect(() => {
    if (activeView !== undefined) {
      setSelectedViewPattern(activeView);
    }
  }, [activeView]);

  // Compute all sidebar views (subpatterns) with counts > 0, sorted
  // descending. Counts now come straight from Screener's `counts` prop
  // (computed there off the full unfiltered pool) instead of being
  // recomputed here via passesPattern — SignalDesk no longer has access
  // to the full CPRResultWithSource rows needed for that.
  const viewPills = useMemo(() => {
    const pillMap = new Map<string, { id: string; label: string }>();

    for (const subList of Object.values(Views)) {
      for (const sub of subList) {
        if (!pillMap.has(sub.id)) {
          pillMap.set(sub.id, { id: sub.id, label: sub.label || sub.id });
        }
      }
    }

    const list: { id: string; label: string; count: number }[] = [];

    for (const [id, item] of pillMap.entries()) {
      const count = counts[id] ?? 0;
      if (count > 0) {
        list.push({ id, label: item.label, count });
      }
    }

    return list.sort((a, b) => b.count - a.count);
  }, [counts]);

  // Resolve a human label for whatever pattern context is currently active:
  // the locally-selected pill if one is picked, otherwise whatever
  // Screener says is active (activeLabel), falling back to "All Patterns".
  const activePatternLabel = useMemo(() => {
    if (selectedViewPattern) {
      return viewPills.find((p) => p.id === selectedViewPattern)?.label ?? selectedViewPattern;
    }
    return activeLabel || "All Patterns";
  }, [selectedViewPattern, viewPills, activeLabel]);

  // Generate live signal cards directly from the symbols Screener hands up.
  // `symbols` is already scoped to whichever left-nav pattern/Views filter
  // is active (that filtering happens in Screener, off the full CPR data),
  // so SignalDesk's job here is just to pick a sensible target/stop for
  // each row based on its direction and current price relative to its own
  // pivot levels — it no longer re-derives *which* pattern matched.
  const signals = useMemo<SignalItem[]>(() => {
    const list: SignalItem[] = [];

    for (const sym of symbols) {
      // Local pill filter (if the user picked a Views chip inside Signal
      // Desk itself) is informational only for the label here — the
      // symbol pool itself is already pattern-scoped by Screener.
      const direction: "LONG" | "SHORT" = sym.direction === "up" ? "LONG" : "SHORT";
      const price = sym.currentPrice;
      const { pivot, r1, r2, s1, s2, r3, s3, r4, s4 } = sym;

      let targetPrice: number;
      let stopPrice: number;
      let targetLevel: string;
      let confidence: SignalItem["confidence"];
      let cprStatus: string;

      if (direction === "LONG") {
        if (price >= r1) {
          targetPrice = r2;
          targetLevel = "R2";
        } else {
          targetPrice = r1;
          targetLevel = "R1";
        }
        stopPrice = s1;
        confidence = price > r2 ? "HIGH" : price >= pivot ? "MEDIUM" : "WATCH";
        cprStatus = price >= pivot ? "Above CPR Pivot" : "Below Pivot, Watching for Reversal";
      } else {
        if (price <= s1) {
          targetPrice = s2;
          targetLevel = "S2";
        } else {
          targetPrice = s1;
          targetLevel = "S1";
        }
        stopPrice = r1;
        confidence = price < s2 ? "HIGH" : price <= pivot ? "MEDIUM" : "WATCH";
        cprStatus = price <= pivot ? "Below CPR Pivot" : "Above Pivot, Watching for Reversal";
      }

      const risk = Math.max(0.0000001, Math.abs(price - stopPrice));
      const reward = Math.abs(targetPrice - price);
      const rrRatio = (reward / risk).toFixed(1);

      list.push({
        id: sym.key,
        symbol: sym.symbol,
        source: sym.source,
        timeframe: "Daily / 1D",
        direction,
        type: `${activePatternLabel} Setup`,
        patternName: activePatternLabel,
        triggerPrice: price,
        currentPrice: price,
        change24h: sym.change24h,
        targetPrice,
        stopPrice,
        targetLevel,
        riskReward: `1 : ${rrRatio}`,
        confidence,
        cprStatus,
        pivot, r1, s1, r2, s2, r3, s3, r4, s4,
        timestamp: "Active",
      });
    }

    return list;
  }, [symbols, activePatternLabel]);

  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
      if (directionFilter !== "all" && s.direction !== directionFilter) return false;
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        return (
          s.symbol.toLowerCase().includes(query) ||
          s.patternName.toLowerCase().includes(query) ||
          s.type.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [signals, sourceFilter, directionFilter, searchTerm]);

  const stats = useMemo(() => {
    const total = filteredSignals.length;
    const longs = filteredSignals.filter((s) => s.direction === "LONG").length;
    const shorts = filteredSignals.filter((s) => s.direction === "SHORT").length;
    const watch = filteredSignals.filter((s) => s.direction === "NEUTRAL").length;
    const highConf = filteredSignals.filter((s) => s.confidence === "HIGH").length;
    return { total, longs, shorts, watch, highConf };
  }, [filteredSignals]);

  // Automatically save ALL generated signals directly to Firestore & Journal
  useEffect(() => {
    if (signals.length === 0) return;

    const candidateSignals = signals.map((item) => ({
      symbol: item.symbol,
      source: item.source,
      timeframe: item.timeframe,
      direction: item.direction,
      type: item.type,
      patternName: item.patternName,
      entry: item.triggerPrice,
      currentPrice: item.currentPrice,
      target: item.targetPrice,
      sl: item.stopPrice,
      rr: item.riskReward,
      confidence: item.confidence,
      cprStatus: item.cprStatus,
      timestamp: Date.now(),
      dateStr: new Date().toLocaleString(),
      status: "ACTIVE" as const,
    }));

    if (candidateSignals.length > 0) {
      autoSaveQualifiedSignals(candidateSignals);
    }
  }, [signals]);

  const handleCopy = (item: SignalItem) => {
    const text = `[PIVOT SIGNAL: ${item.symbol}] (${item.direction})
Pattern: ${item.patternName} (${item.type})
Source: ${item.source.toUpperCase()}
Entry / Trigger: ${fmt(item.triggerPrice)}
Target Level: ${fmt(item.targetPrice)}
Stop Level: ${fmt(item.stopPrice)}
R:R: ${item.riskReward} | Confidence: ${item.confidence}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePillClick = (pillId: string) => {
    if (selectedViewPattern === pillId) {
      setSelectedViewPattern("");
    } else {
      setSelectedViewPattern(pillId);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080d15] text-slate-100 overflow-hidden">
      {/* Top Banner Header */}
      <div className="p-4 border-b border-[#1e2d3d] bg-[#0c131f] flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                SIGNAL DESK
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live Scanner Feeds
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Actionable pivot breakout triggers, CPR trend directions, and automated risk/reward setups
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Counter Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-[#131b26] border border-[#1e2d3d] rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-emerald-400">
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium text-slate-300">Auto-Saved to Journal & Cloud</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="bg-[#131b26] border border-[#1e2d3d] rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">Signals:</span>
            <span className="text-sm font-bold text-white font-mono">{stats.total}</span>
          </div>
          <div className="bg-[#131b26] border border-emerald-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-emerald-400 font-medium">Long:</span>
            <span className="text-sm font-bold text-emerald-400 font-mono">{stats.longs}</span>
          </div>
          <div className="bg-[#131b26] border border-rose-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[11px] text-rose-400 font-medium">Short:</span>
            <span className="text-sm font-bold text-rose-400 font-mono">{stats.shorts}</span>
          </div>
          <div className="bg-[#131b26] border border-amber-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] text-amber-400 font-medium">High Conviction:</span>
            <span className="text-sm font-bold text-amber-400 font-mono">{stats.highConf}</span>
          </div>
        </div>
      </div>

      {/* Available Views with Counts Strip (Wrapping chips from sidebar with count > 0) */}
      {viewPills.length > 0 && (
        <div className="px-4 py-2.5 border-b border-[#1a2736] bg-[#09101a] shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Active Views ({viewPills.length})
              </span>
              {selectedViewPattern && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Filtered: {selectedViewPattern}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 italic hidden sm:block">
              Select a different filter in the sidebar to refresh this list.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center max-h-36 overflow-y-auto">
            {viewPills.map((pill) => {
              const isSelected = selectedViewPattern === pill.id;

              return (
                <button
                  key={pill.id}
                  onClick={() => handlePillClick(pill.id)}
                  title={`Filter by ${pill.label} (${pill.count} pairs)`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all select-none cursor-pointer ${
                    isSelected
                      ? "bg-[#062c2c] border border-teal-500/80 text-teal-200 shadow-sm shadow-teal-900/60 ring-1 ring-teal-500/40"
                      : "bg-[#111927] hover:bg-[#182335] border border-[#1e2d3f] text-slate-300 hover:text-white"
                  }`}
                >
                  <span className="truncate max-w-[260px] sm:max-w-none">{pill.label}</span>
                  <span
                    className={`px-1.5 py-0.2 font-mono text-[10px] rounded-full font-bold ${
                      isSelected
                        ? "bg-teal-500/30 text-teal-200 border border-teal-500/40"
                        : "bg-[#182333] text-slate-400 border border-[#223347]"
                    }`}
                  >
                    {pill.count}
                  </span>
                </button>
              );
            })}

            {selectedViewPattern && (
              <button
                onClick={() => setSelectedViewPattern("")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 transition cursor-pointer"
                title="Clear selected pattern filter"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar (Left aligned like Journal) */}
      <div className="px-4 py-2 border-b border-[#1b263b] bg-[#0d1422] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search symbol, setup..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#151e2c] border border-[#22354a] rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {/* Direction Filter */}
          <div className="flex rounded-md overflow-hidden border border-[#22354a] bg-[#151e2c]">
            <button
              onClick={() => setDirectionFilter("all")}
              className={`px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                directionFilter === "all" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setDirectionFilter("LONG")}
              className={`px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                directionFilter === "LONG" ? "bg-emerald-600 text-white" : "text-emerald-400 hover:text-emerald-300"
              }`}
            >
              Long
            </button>
            <button
              onClick={() => setDirectionFilter("SHORT")}
              className={`px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                directionFilter === "SHORT" ? "bg-rose-600 text-white" : "text-rose-400 hover:text-rose-300"
              }`}
            >
              Short
            </button>
          </div>

          {/* Source Filter */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSourceFilter("all")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                sourceFilter === "all"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSourceFilter("binance")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                sourceFilter === "binance"
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                  : "text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
            >
              Binance
            </button>
            <button
              onClick={() => setSourceFilter("delta")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                sourceFilter === "delta"
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
            >
              Delta
            </button>
          </div>
        </div>
      </div>

      {/* Signals Grid / Table List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredSignals.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 border border-dashed border-[#1e2d3d] rounded-xl">
            <ShieldAlert className="w-10 h-10 text-slate-600 mb-2" />
            <p className="text-sm font-medium">No active signals found matching current filters</p>
            <p className="text-xs text-slate-500 mt-1">Try clearing filters or switching source exchanges</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredSignals.map((item) => {
              const isLong = item.direction === "LONG";
              const isShort = item.direction === "SHORT";

              return (
                <div
                  key={item.id}
                  className="bg-[#0f1724] border border-[#1e2d3d] hover:border-slate-600 rounded-xl p-4 transition-all flex flex-col justify-between shadow-lg"
                >
                  {/* Card Top */}
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      {/* Left: Symbol & Exchange + Live Price & 24h % change (Matching Image 1) */}
                      <div className="flex items-start gap-4 sm:gap-6">
                        <div>
                          <div className="text-base sm:text-lg font-extrabold text-white font-mono tracking-tight leading-tight">
                            {item.symbol}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-400 font-mono uppercase tracking-wider mt-0.5">
                            {item.source}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm sm:text-base font-bold text-white font-mono leading-tight">
                            {fmt(item.currentPrice)}
                          </div>
                          <div
                            className={`text-xs font-mono font-bold leading-tight mt-0.5 ${
                              (item.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {fmtPct(item.change24h ?? 0)}
                          </div>
                        </div>
                      </div>

                      {/* Direction Badge on the right */}
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1 font-mono shrink-0 ${
                          isLong
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : isShort
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                            : "bg-slate-500/20 text-slate-300 border border-slate-500/40"
                        }`}
                      >
                        {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : isShort ? <ArrowDownRight className="w-3.5 h-3.5" /> : null}
                        {item.direction}
                      </span>
                    </div>

                    {/* S4-PIVOT (Red family) & PIVOT-R4 (Green family) Live Price Progress Bar */}
                    <SignalProgressBar
                      price={item.currentPrice}
                      pivot={item.pivot}
                      s1={item.s1}
                      s2={item.s2}
                      s3={item.s3}
                      s4={item.s4}
                      r1={item.r1}
                      r2={item.r2}
                      r3={item.r3}
                      r4={item.r4}
                    />

                    {/* Pricing Level Metrics */}
                    <div className="grid grid-cols-3 gap-2 bg-[#090f19] border border-[#1b2636] rounded-lg p-2.5 mb-3 font-mono">
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">Trigger / Entry</div>
                        <div className="text-xs font-bold text-white mt-0.5">{fmt(item.triggerPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-emerald-400 font-sans flex items-center gap-0.5">
                          <Target className="w-2.5 h-2.5" /> Target
                        </div>
                        <div className="text-xs font-bold text-emerald-400 mt-0.5">{fmt(item.targetPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-rose-400 font-sans">Stop Loss</div>
                        <div className="text-xs font-bold text-rose-400 mt-0.5">{fmt(item.stopPrice)}</div>
                      </div>
                    </div>

                    {/* View and Target Details */}
                    <div className="text-[11px] text-slate-400 mb-3 px-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span>View:</span>
                          <strong className="text-slate-200 font-semibold">{selectedViewPattern || item.patternName}</strong>
                        </div>
                        <span className="font-mono text-slate-300">
                          R:R <strong className="text-amber-400">{item.riskReward}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Target:</span>
                        <strong className="text-slate-200 font-semibold font-mono">{item.targetLevel || "S2"}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="pt-2 border-t border-[#1e2d3d] flex items-center justify-between gap-2">
                    <button
                      onClick={() => onSelectPattern?.(item.patternName)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition flex items-center gap-1"
                    >
                      View in Screener &rarr;
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                        <Cloud className="w-3 h-3 text-emerald-400" />
                        <span>Saved</span>
                      </div>

                      <button
                        onClick={() => handleCopy(item)}
                        className="px-2 py-1 rounded bg-[#162130] hover:bg-[#1f2e42] border border-[#22354a] text-slate-300 text-xs font-medium flex items-center gap-1 transition"
                        title="Copy signal details"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 text-[11px]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-400" />
                            <span className="text-[11px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}