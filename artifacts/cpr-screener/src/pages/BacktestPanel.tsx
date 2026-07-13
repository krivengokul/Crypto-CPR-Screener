"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import {
  BACKTEST_TARGETS,
  BACKTEST_CATEGORIES,
  runBacktest,
  runCategoryScan,
  type BacktestRow,
  type CategoryScanRow,
  type BacktestSource,
} from "@/lib/backtest";
import { passesPattern, fmt } from "./ScreenerUtils";

/**
 * v1 backtest UI — proves out the engine on a handful of patterns (see
 * lib/backtest.ts's BACKTEST_TARGETS / BACKTEST_CATEGORIES). Pick a past
 * date + exchange, then either:
 *   - select a CATEGORY (e.g. "LittleCPR Above") to see the full symbol
 *     list matching that category's base condition on that date, with
 *     their CPR data — no Target/Result/Hit Date, since a category has no
 *     single well-defined target to grade against; or
 *   - select a specific PATTERN nested under a category (or a standalone
 *     pattern like "U1 > Previous U4") to run the full backtest: matched
 *     symbols PLUS whether each one hit its target by end of the
 *     following day.
 *
 * Not yet wired into Screener.tsx's tab/nav structure — render this
 * wherever you want the backtest page to live (e.g. its own route, or as
 * an additional tab alongside the live scanner).
 */
export default function BacktestPanel() {
  // NEW: selection can be either a category key (e.g. "littleabove") or a
  // pattern key (e.g. "1LHr-L4U3-U4", "HA-U1>PU4"). Default to the first
  // category so the dropdown opens on a sensible, low-noise view.
  const [selectedKey, setSelectedKey] = useState<string>(BACKTEST_CATEGORIES[0].key);
  const [entryDate, setEntryDate] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [source, setSource] = useState<BacktestSource>("binance");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [rows, setRows] = useState<BacktestRow[]>([]);
  // NEW: separate state for category-scan rows — kept apart from `rows`
  // since the two have different shapes (no target/result/hitDate here).
  const [categoryRows, setCategoryRows] = useState<CategoryScanRow[]>([]);
  const [error, setError] = useState("");

  // NEW: is the current selection a category (symbol-list-only) or a
  // specific pattern (full target/result/hitDate backtest)?
  const isCategory = BACKTEST_CATEGORIES.some((c) => c.key === selectedKey);
  const activeTarget = !isCategory ? BACKTEST_TARGETS.find((t) => t.key === selectedKey) : undefined;
  const activeCategory = isCategory ? BACKTEST_CATEGORIES.find((c) => c.key === selectedKey) : undefined;

  // Patterns not nested under any category — rendered in their own
  // "Other Patterns" optgroup below (currently just "HA-U1>PU4").
  const ungroupedPatterns = BACKTEST_TARGETS.filter(
    (t) => !BACKTEST_CATEGORIES.some((c) => c.subPatternKeys.includes(t.key))
  );

  const run = async () => {
    setStatus("running");
    setError("");
    setRows([]);
    setCategoryRows([]);
    setProgress({ done: 0, total: 0, symbol: "" });
    try {
      if (isCategory) {
        // NEW: category scan — symbol list + CPR data only
        const result = await runCategoryScan(
          selectedKey,
          entryDate,
          source,
          passesPattern,
          (done, total, symbol) => setProgress({ done, total, symbol })
        );
        setCategoryRows(result);
      } else {
        const result = await runBacktest(
          selectedKey,
          entryDate,
          source,
          passesPattern,
          (done, total, symbol) => setProgress({ done, total, symbol })
        );
        setRows(result);
      }
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  };

  const passCount = rows.filter((r) => r.result === "pass").length;
  const failCount = rows.filter((r) => r.result === "fail").length;
  const insufficientCount = rows.filter((r) => r.result === "insufficient-data").length;
  const gradedCount = rows.length - insufficientCount;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-bold">Pattern Backtest</h2>
        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
          v1 — a few patterns only
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Pick a past date and either a category (symbol list only) or a
        specific pattern (symbol list + Target/Result/Hit Date). This
        reconstructs the CPR that would have been active on that date (same
        candle logic as the live scanner).
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Category / Pattern
          </label>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground"
          >
            {BACKTEST_CATEGORIES.map((cat) => (
              <optgroup key={cat.key} label={cat.label}>
                <option value={cat.key}>{cat.label} — all (symbol list only)</option>
                {cat.subPatternKeys.map((pk) => {
                  const t = BACKTEST_TARGETS.find((t) => t.key === pk);
                  if (!t) return null;
                  return (
                    <option key={pk} value={pk}>
                      {t.label}
                    </option>
                  );
                })}
              </optgroup>
            ))}
            {ungroupedPatterns.length > 0 && (
              <optgroup label="Other Patterns">
                {ungroupedPatterns.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entry Date (UTC)</label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Exchange</label>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {(["binance", "delta"] as BacktestSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className="px-3 py-1.5 transition-colors capitalize"
                style={{
                  background: source === s ? "#3b82f6" : "transparent",
                  color: source === s ? "#fff" : "#8ba3bc",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={run}
          disabled={status === "running"}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff" }}
        >
          <RefreshCw className={`w-4 h-4 ${status === "running" ? "animate-spin" : ""}`} />
          {status === "running" ? "Running…" : "Run Backtest"}
        </button>
      </div>

      {/* NEW: only show the Target line for actual patterns — a category
          has no single target to describe here. */}
      {!isCategory && activeTarget && (
        <div className="text-xs text-muted-foreground mb-3">
          Target: <span className="text-foreground font-medium">{activeTarget.targetLabel}</span>{" "}
          ({activeTarget.direction === "bullish" ? "price must reach or exceed it" : "price must reach or fall below it"})
        </div>
      )}
      {isCategory && activeCategory && (
        <div className="text-xs text-muted-foreground mb-3">
          Category scan — lists every symbol matching{" "}
          <span className="text-foreground font-medium">{activeCategory.label}</span>&apos;s base
          condition on the entry date. No Target/Result/Hit Date (select one of its sub-patterns
          above for those).
        </div>
      )}

      {status === "running" && (
        <div className="mb-4 rounded-lg border border-border bg-background/50 p-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Scanning… {progress.symbol}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          Error: {error}
        </div>
      )}

      {/* NEW: category-scan results — symbol list + CPR data only */}
      {status === "done" && isCategory && (
        <>
          <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
            <span className="text-muted-foreground">
              {categoryRows.length} symbols matched {activeCategory?.label} on {entryDate}
            </span>
          </div>

          {categoryRows.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              No symbols matched this category on {entryDate}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Today TC / BC
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Prev TC / BC
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Compression
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {categoryRows.map((r) => (
                    <tr key={`${r.source}-${r.symbol}`} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono font-semibold">{r.symbol}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {fmt(r.todayCPR.tc)} / {fmt(r.todayCPR.bc)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {fmt(r.prevCPR.tc)} / {fmt(r.prevCPR.bc)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {r.compressionRatio.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Pattern backtest results — symbol list + Target/Result/Hit Date */}
      {status === "done" && !isCategory && (
        <>
          <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
            <span className="text-muted-foreground">
              {rows.length} symbols matched the pattern on {entryDate}
            </span>
            {rows.length > 0 && (
              <>
                <span className="text-green-400 font-medium">{passCount} pass</span>
                <span className="text-destructive font-medium">{failCount} fail</span>
                {insufficientCount > 0 && (
                  <span className="text-muted-foreground">{insufficientCount} insufficient data</span>
                )}
                {gradedCount > 0 && (
                  <span className="text-foreground font-medium">
                    {Math.round((passCount / gradedCount) * 100)}% hit rate
                  </span>
                )}
              </>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              No symbols matched this pattern on {entryDate}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Target
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Result
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Hit Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={`${r.source}-${r.symbol}`} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono font-semibold">{r.symbol}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{fmt(r.targetLevel)}</td>
                      <td className="px-3 py-2">
                        {r.result === "pass" && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Pass
                          </span>
                        )}
                        {r.result === "fail" && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <XCircle className="w-3.5 h-3.5" /> Fail
                          </span>
                        )}
                        {r.result === "insufficient-data" && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <AlertCircle className="w-3.5 h-3.5" /> No data
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.hitDate ? `${r.hitDate}${r.daysToHit === 0 ? " (entry day)" : " (next day)"}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
