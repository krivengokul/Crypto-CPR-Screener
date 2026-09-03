import { useState, useEffect, useMemo } from "react";
import {
  LoggedSignal,
  fetchSavedSignalsFromCloud,
  deleteSavedSignalFromCloud,
  evaluateSignalOutcome,
  updateSignalOutcomeInCloud,
  clearAllSignalsFromCloud,
} from "@/lib/signalTracker";
import { fmt, getChartUrl, hasKnownChartMapping } from "@/pages/ScreenerUtils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Trash2,
  TrendingUp,
  TrendingDown,
  Download,
  AlertCircle,
  Database,
  Search,
  ExternalLink,
} from "lucide-react";

export default function SignalsJournal() {
  const [signals, setSignals] = useState<LoggedSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evalProgress, setEvalProgress] = useState<{ done: number; total: number } | null>(null);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "PASS" | "FAIL">("ALL");
  // Default to Binance — mirrors the Live Screener, Backtest panel, and
  // Signals desk, which all default to Binance rather than showing every
  // exchange's rows at once.
  const [sourceFilter, setSourceFilter] = useState<"all" | "binance" | "delta">("binance");
  const [searchTerm, setSearchTerm] = useState("");

  const loadSignals = async () => {
    setLoading(true);
    try {
      const data = await fetchSavedSignalsFromCloud();
      setSignals(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignals();
  }, []);

  const handleClearAll = async () => {
    if (signals.length === 0) return;
    const confirm = window.confirm("Are you sure you want to clear all saved signals in your journal?");
    if (!confirm) return;
    setLoading(true);
    await clearAllSignalsFromCloud(signals.map((s) => s.id));
    await loadSignals();
  };

  // High-speed parallel evaluation with live progress and immediate state updates
  const handleEvaluateAll = async () => {
    const activeSignals = signals.filter((s) => s.status === "ACTIVE");
    if (activeSignals.length === 0) return;

    setEvaluating(true);
    setEvalProgress({ done: 0, total: activeSignals.length });

    try {
      const CONCURRENCY = 6;
      let completedCount = 0;

      for (let i = 0; i < activeSignals.length; i += CONCURRENCY) {
        const batch = activeSignals.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (sig) => {
            const update = await evaluateSignalOutcome(sig);
            if (update && update.status !== sig.status) {
              await updateSignalOutcomeInCloud(sig.id, update);
              return { id: sig.id, update };
            }
            return null;
          })
        );

        // Update local React state immediately for this batch
        setSignals((prev) =>
          prev.map((item) => {
            const match = batchResults.find((r) => r && r.id === item.id);
            if (match && match.update) {
              return { ...item, ...match.update };
            }
            return item;
          })
        );

        completedCount += batch.length;
        setEvalProgress({ done: Math.min(completedCount, activeSignals.length), total: activeSignals.length });
      }
    } finally {
      setEvaluating(false);
      setEvalProgress(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSavedSignalFromCloud(id);
    setSignals((prev) => prev.filter((s) => s.id !== id));
  };

  const handleExportCSV = () => {
    if (signals.length === 0) return;
    const headers = [
      "ID",
      "Date",
      "Symbol",
      "Source",
      "Direction",
      "Pattern",
      "Entry",
      "Target",
      "StopLoss",
      "R:R",
      "Status",
      "Outcome Notes",
    ];
    const rows = signals.map((s) => [
      s.id,
      s.dateStr,
      s.symbol,
      s.source,
      s.direction,
      s.patternName,
      s.entry,
      s.target,
      s.sl,
      s.rr,
      s.status,
      `"${s.outcomeNotes || ""}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pivot_signals_journal_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (filterStatus !== "ALL" && s.status !== filterStatus) return false;
      if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          s.symbol.toLowerCase().includes(q) ||
          s.patternName.toLowerCase().includes(q) ||
          s.dateStr.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [signals, filterStatus, sourceFilter, searchTerm]);

  const stats = useMemo(() => {
    // Scoped to sourceFilter (binance/delta/all) so the summary strip
    // matches whichever tab is selected — same pool the table below uses,
    // minus filterStatus/searchTerm since stats itself is a status
    // breakdown across all four buckets, not just the currently filtered one.
    const scoped =
      sourceFilter === "all" ? signals : signals.filter((s) => s.source === sourceFilter);
    const total = scoped.length;
    const pass = scoped.filter((s) => s.status === "PASS").length;
    const fail = scoped.filter((s) => s.status === "FAIL").length;
    const active = scoped.filter((s) => s.status === "ACTIVE").length;
    const resolved = pass + fail;
    const winRate = resolved > 0 ? ((pass / resolved) * 100).toFixed(1) : "100.0";
    return { total, pass, fail, active, winRate };
  }, [signals, sourceFilter]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080d15] text-slate-100 overflow-hidden select-none">
      {/* Header Banner */}
      <div className="p-4 border-b border-[#1e2d3d] bg-[#0c131f] flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shadow-md">
            <Database className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">
                SIGNAL JOURNAL &amp; STATUS EVALUATOR
              </h1>
              <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Auto-Synced Journal
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Permanently saved signals with automatic next-day Pass/Fail verification against Binance candles
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleEvaluateAll}
            disabled={evaluating || signals.length === 0}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? "animate-spin" : ""}`} />
            <span>
              {evalProgress
                ? `Checking (${evalProgress.done}/${evalProgress.total})...`
                : "Auto-Check Pass / Fail"}
            </span>
          </button>

          <button
            onClick={handleClearAll}
            disabled={loading || signals.length === 0}
            className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 disabled:opacity-50 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            title="Clear all saved signals"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear All</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={signals.length === 0}
            className="px-3 py-1.5 rounded-lg bg-[#162130] hover:bg-[#1e2f47] border border-[#22354a] disabled:opacity-50 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div className="px-4 py-3 bg-[#0a101b] border-b border-[#1b263b] grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
        <div className="bg-[#121a28] border border-[#1e2d3d] p-2.5 rounded-lg">
          <div className="text-[10px] uppercase font-mono text-slate-400">Total Saved</div>
          <div className="text-lg font-black text-white font-mono">{stats.total}</div>
        </div>

        <div className="bg-[#121a28] border border-emerald-500/30 p-2.5 rounded-lg">
          <div className="text-[10px] uppercase font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Target Hit (Pass)
          </div>
          <div className="text-lg font-black text-emerald-400 font-mono">{stats.pass}</div>
        </div>

        <div className="bg-[#121a28] border border-rose-500/30 p-2.5 rounded-lg">
          <div className="text-[10px] uppercase font-mono text-rose-400 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Stopped Out (Fail)
          </div>
          <div className="text-lg font-black text-rose-400 font-mono">{stats.fail}</div>
        </div>

        <div className="bg-[#121a28] border border-amber-500/30 p-2.5 rounded-lg">
          <div className="text-[10px] uppercase font-mono text-amber-400 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Active / Open
          </div>
          <div className="text-lg font-black text-amber-400 font-mono">{stats.active}</div>
        </div>

        <div className="bg-[#121a28] border border-cyan-500/30 p-2.5 rounded-lg">
          <div className="text-[10px] uppercase font-mono text-cyan-400">Win Rate</div>
          <div className="text-lg font-black text-cyan-300 font-mono">{stats.winRate}%</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-4 py-2 border-b border-[#1b263b] bg-[#0d1422] flex items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search saved signals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#151e2c] border border-[#22354a] rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-md overflow-hidden border border-[#22354a] bg-[#151e2c]">
            {(["all", "binance", "delta"] as const).map((src) => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`px-3 py-1 text-xs font-semibold capitalize transition cursor-pointer ${
                  sourceFilter === src
                    ? src === "delta"
                      ? "bg-cyan-500/20 text-cyan-400"
                      : src === "binance"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-amber-500/20 text-amber-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {src}
              </button>
            ))}
          </div>

          <div className="flex rounded-md overflow-hidden border border-[#22354a] bg-[#151e2c]">
            {(["ALL", "ACTIVE", "PASS", "FAIL"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                  filterStatus === status
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Signals Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs">Loading signals journal...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border border-dashed border-[#1e2d3d] rounded-xl text-slate-400 text-center p-6">
            <AlertCircle className="w-8 h-8 text-slate-500 mb-2" />
            <p className="text-sm font-semibold text-slate-300">No saved signals in journal</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              All live market signals generated from the <strong>Signals</strong> desk are automatically saved to this journal!
            </p>
          </div>
        ) : (
          <div className="border border-[#1e2d3d] rounded-xl overflow-hidden bg-[#0d1422]">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead className="bg-[#121b2b] text-slate-400 border-b border-[#1e2d3d] font-mono uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Date / Time</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Direction</th>
                  <th className="py-2.5 px-3">Pattern</th>
                  <th className="py-2.5 px-3">Entry</th>
                  <th className="py-2.5 px-3">Target (TP)</th>
                  <th className="py-2.5 px-3">Stop (SL)</th>
                  <th className="py-2.5 px-3">R:R</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Outcome / Notes</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1b263b]">
                {filtered.map((item) => {
                  const isLong = item.direction === "LONG";
                  const isShort = item.direction === "SHORT";
                  const isPass = item.status === "PASS";
                  const isFail = item.status === "FAIL";
                  const isActive = item.status === "ACTIVE";

                  return (
                    <tr key={item.id} className="hover:bg-[#121d2e] transition font-mono">
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {item.dateStr}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span>{item.symbol}</span>
                          {hasKnownChartMapping(item.symbol, item.source) ? (
                            <a
                              href={getChartUrl(item.symbol, item.source)}
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
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize w-fit ${
                            item.source === "delta"
                              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                              : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                          }`}
                        >
                          {item.source}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${
                            isLong
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                              : isShort
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                              : "bg-slate-500/20 text-slate-300 border border-slate-500/40"
                          }`}
                        >
                          {isLong ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : isShort ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : null}
                          {item.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-violet-300 font-medium whitespace-nowrap">
                        {item.patternName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-200">${fmt(item.entry)}</td>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold whitespace-nowrap">
                        <span className="text-xs mr-1 text-emerald-500">◎</span>${fmt(item.target)}
                      </td>
                      <td className="py-2.5 px-3 text-rose-400 font-bold whitespace-nowrap">
                        ${fmt(item.sl)}
                      </td>
                      <td className="py-2.5 px-3 text-cyan-300 font-bold whitespace-nowrap">{item.rr}</td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                            isPass
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                              : isFail
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/50"
                              : isActive
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                              : "bg-slate-700/40 text-slate-400 border border-slate-600"
                          }`}
                        >
                          {isPass ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : isFail ? (
                            <XCircle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-sans text-[11px] max-w-xs truncate">
                        {item.outcomeNotes || (isActive ? `Auto-captured setup. Awaiting TP ($${fmt(item.target)}) or SL ($${fmt(item.sl)}) hit.` : "—")}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded transition cursor-pointer"
                          title="Delete signal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}