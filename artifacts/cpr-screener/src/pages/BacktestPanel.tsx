"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import {
  BACKTEST_TARGETS,
  BACKTEST_CATEGORIES,
  runBacktest,
  runCategoryScan,
  runPivotLevelScan,
  type BacktestRow,
  type CategoryScanRow,
  type BacktestSource,
  type BacktestCategoryDef,
  type BacktestSubCategoryDef,
} from "@/lib/backtest";
import { passesPattern, matchesPivotLevelFlag, fmt, getChartUrl, hasKnownChartMapping } from "./ScreenerUtils";

/**
 * v1 backtest UI — proves out the engine on a handful of patterns (see
 * lib/backtest.ts's BACKTEST_TARGETS / BACKTEST_CATEGORIES). Pick a past
 * date and one of three selection levels:
 *   - a CATEGORY (e.g. "LittleCPR Above", "Overlap Above") — symbol list
 *     matching the category's base condition only, no Target/Result/Hit
 *     Date, since a category has no single well-defined target;
 *   - a Pivot Level SUB-CATEGORY nested under a category (e.g. "Overlap
 *     Above" → "HiL4U34") — same symbol-list-only treatment as a category,
 *     just additionally filtered by that Pivot Level's raw flag; or
 *   - a specific PATTERN nested under a category, under a sub-category, or
 *     standalone (e.g. "U1 > Previous U4") — the full backtest: matched
 *     symbols PLUS whether each one hit its target within the entry day,
 *     the next day, or the day after that (entry + 2 days), and (pattern
 *     only) a Single Date / Date Range toggle to sweep several days at once.
 *
 * Not yet wired into Screener.tsx's tab/nav structure — render this
 * wherever you want the backtest page to live (e.g. its own route, or as
 * an additional tab alongside the live scanner).
 */
export default function BacktestPanel() {
  // NEW: selection can be a category key (e.g. "littleabove"), a
  // composite "categoryKey::subCategoryKey" Pivot Level selection (e.g.
  // "overlapping-higher::HiL4U34"), or a pattern key (e.g. "1LHr-L4U3-U4",
  // "HA-U1>PU4", "eXHi-L4U4-U4"). Default to the first category so the
  // dropdown opens on a sensible, low-noise view.
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
  // NEW: separate state for category / Pivot Level scan rows — kept apart
  // from `rows` since the two have different shapes (no target/result/
  // hitDate here). Reused for BOTH category scans and Pivot Level
  // sub-category scans, since they're the same shape/reasoning.
  const [categoryRows, setCategoryRows] = useState<CategoryScanRow[]>([]);
  const [error, setError] = useState("");

  // NEW: date-range sweep — PATTERN-only (a category or Pivot Level
  // sub-category has no single target to grade, so sweeping either across
  // days wouldn't produce anything more useful than running each day
  // separately via the single-date picker). "single" keeps the existing
  // one-date behavior; "range" loops runBacktest once per UTC day in
  // [fromDate, toDate] and pools every day's matches into one results
  // table (each row already carries its own `entryDate`, so nothing else
  // needs to change downstream).
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  // NEW: tracks which day of the sweep is currently running (range mode only)
  const [dateProgress, setDateProgress] = useState({ current: 0, total: 0, date: "" });

  // NEW: composite key separator for Pivot Level sub-category selections —
  // "categoryKey::subCategoryKey" (e.g. "overlapping-higher::HiL4U34").
  const SUBCATEGORY_SEP = "::";

  // Is the current selection a top-level category (symbol-list-only)?
  const isCategory = BACKTEST_CATEGORIES.some((c) => c.key === selectedKey);

  // NEW: is the current selection a Pivot Level sub-category nested under
  // a category (e.g. "Overlap Above" → "HiL4U34")? Also symbol-list-only,
  // single-date — same treatment as a category, just additionally
  // filtered by the named Pivot Level's raw flag.
  let activeSubCategoryInfo: { category: BacktestCategoryDef; sub: BacktestSubCategoryDef } | undefined;
  for (const cat of BACKTEST_CATEGORIES) {
    const sub = cat.subCategories?.find((s) => `${cat.key}${SUBCATEGORY_SEP}${s.key}` === selectedKey);
    if (sub) {
      activeSubCategoryInfo = { category: cat, sub };
      break;
    }
  }
  const isSubCategory = !!activeSubCategoryInfo;

  // Only a leaf PATTERN gets the full Target/Result/Hit Date backtest
  // (and the Single Date / Date Range toggle below).
  const isPatternOnly = !isCategory && !isSubCategory;

  const activeTarget = isPatternOnly ? BACKTEST_TARGETS.find((t) => t.key === selectedKey) : undefined;
  const activeCategory = isCategory ? BACKTEST_CATEGORIES.find((c) => c.key === selectedKey) : undefined;

  // NEW: display label for the category/Pivot-Level symbol-list results —
  // combines category + sub-category label when a Pivot Level is selected.
  const symbolListLabel = isCategory
    ? activeCategory?.label
    : isSubCategory && activeSubCategoryInfo
    ? `${activeSubCategoryInfo.category.label} → Pivot Level ${activeSubCategoryInfo.sub.label}`
    : undefined;

  // Patterns not nested under any category or Pivot Level sub-category —
  // rendered in their own "Other Patterns" optgroup below (currently just
  // "HA-U1>PU4").
  const nestedPatternKeys = new Set<string>();
  BACKTEST_CATEGORIES.forEach((cat) => {
    cat.subPatternKeys?.forEach((k) => nestedPatternKeys.add(k));
    cat.subCategories?.forEach((sub) => sub.subPatternKeys.forEach((k) => nestedPatternKeys.add(k)));
  });
  const ungroupedPatterns = BACKTEST_TARGETS.filter((t) => !nestedPatternKeys.has(t.key));

  // NEW: category and Pivot Level sub-category selections have no
  // date-range mode — if the person switches to either while "range" is
  // selected, fall back to single-date so no stale range state leaks into
  // a category/Pivot-Level run.
  useEffect(() => {
    if (!isPatternOnly && dateMode === "range") setDateMode("single");
  }, [isPatternOnly, dateMode]);

  // NEW: inclusive list of UTC date strings between fromISO and toISO.
  function enumerateDatesUTC(fromISO: string, toISO: string): string[] {
    const dates: string[] = [];
    const cur = new Date(fromISO + "T00:00:00.000Z");
    const end = new Date(toISO + "T00:00:00.000Z");
    while (cur.getTime() <= end.getTime()) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return dates;
  }

  const run = async () => {
    // NEW: guard range inputs before kicking off a (potentially long) sweep
    if (isPatternOnly && dateMode === "range") {
      if (fromDate > toDate) {
        setError("From date must be on or before To date.");
        setStatus("error");
        return;
      }
    }

    setStatus("running");
    setError("");
    setRows([]);
    setCategoryRows([]);
    setProgress({ done: 0, total: 0, symbol: "" });
    setDateProgress({ current: 0, total: 0, date: "" });
    try {
      if (isCategory) {
        // Category scan — symbol list + CPR data only, single date only
        const result = await runCategoryScan(
          selectedKey,
          entryDate,
          source,
          passesPattern,
          (done, total, symbol) => setProgress({ done, total, symbol })
        );
        setCategoryRows(result);
      } else if (isSubCategory && activeSubCategoryInfo) {
        // NEW: Pivot Level sub-category scan — category's base condition
        // AND the named Pivot Level's raw flag, symbol list + CPR data
        // only, single date only.
        const result = await runPivotLevelScan(
          activeSubCategoryInfo.category.key,
          activeSubCategoryInfo.sub.key,
          entryDate,
          source,
          passesPattern,
          matchesPivotLevelFlag,
          (done, total, symbol) => setProgress({ done, total, symbol })
        );
        setCategoryRows(result);
      } else if (dateMode === "single") {
        const result = await runBacktest(
          selectedKey,
          entryDate,
          source,
          passesPattern,
          (done, total, symbol) => setProgress({ done, total, symbol })
        );
        setRows(result);
      } else {
        // NEW: range mode — run the full symbol-universe backtest once per
        // UTC day in [fromDate, toDate], pooling every day's matches into
        // one combined rows array. Each BacktestRow already carries its own
        // `entryDate`, so passes/fails/hit-rates and the results table just
        // work across the whole sweep with no further changes needed.
        const dates = enumerateDatesUTC(fromDate, toDate);
        const allRows: BacktestRow[] = [];
        for (let i = 0; i < dates.length; i++) {
          const d = dates[i];
          setDateProgress({ current: i + 1, total: dates.length, date: d });
          const dayResult = await runBacktest(
            selectedKey,
            d,
            source,
            passesPattern,
            (done, total, symbol) => setProgress({ done, total, symbol })
          );
          allRows.push(...dayResult);
        }
        setRows(allRows);
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

  // NEW: TradingView chart link, rendered inside the Symbol cell itself —
  // reuses the exact same getChartUrl/hasKnownChartMapping helpers Screener.tsx
  // uses for its own Chart column, so backtest links match the live scanner
  // (Binance plain/.P-for-perp-only, Delta DELTAIN:...p, BUSD-quote excluded).
  const ChartLink = ({ symbol, source }: { symbol: string; source: BacktestSource }) =>
    hasKnownChartMapping(symbol, source) ? (
      <a
        href={getChartUrl(symbol, source)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground hover:text-primary transition-colors inline-flex"
        title="Open on TradingView"
      >
        <ExternalLink className="w-3 h-3" />
      </a>
    ) : (
      <span
        className="text-muted-foreground/30 cursor-not-allowed inline-flex"
        title="Not available on TradingView — Delta's /BUSD tokenized-stock instruments aren't listed under DELTAIN yet"
      >
        <ExternalLink className="w-3 h-3" />
      </span>
    );

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-bold">Pattern Backtest</h2>
        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
          v1 — a few patterns only
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Pick a past date and either a category, a Pivot Level sub-category
        nested under a category, or a specific pattern. Category and Pivot
        Level selections give a symbol list only (single date); a pattern
        gives the full Target/Result/Hit Date backtest, with an optional
        date-range sweep. This reconstructs the CPR that would have been
        active on that date (same candle logic as the live scanner).
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Category / Pivot Level / Pattern
          </label>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground"
          >
            {BACKTEST_CATEGORIES.map((cat) => (
              <optgroup key={cat.key} label={cat.label}>
                <option value={cat.key}>{cat.label} — all (symbol list only)</option>
                {cat.subPatternKeys?.map((pk) => {
                  const t = BACKTEST_TARGETS.find((t) => t.key === pk);
                  if (!t) return null;
                  return (
                    <option key={pk} value={pk}>
                      {t.label}
                    </option>
                  );
                })}
                {/* NEW: Pivot Level sub-categories nested under this category
                    (e.g. "Overlap Above" → "HiL4U34"), each followed by its
                    own nested pattern(s) (e.g. "eXHi-L4U4-U4"). <select>
                    only supports one level of <optgroup>, so nesting is
                    simulated with indentation/arrow prefixes on plain
                    <option> entries within the same category optgroup. */}
                {cat.subCategories?.flatMap((sub) => [
                  <option key={`${cat.key}${SUBCATEGORY_SEP}${sub.key}`} value={`${cat.key}${SUBCATEGORY_SEP}${sub.key}`}>
                    {"\u21B3"} Pivot Level: {sub.label} — all (symbol list only)
                  </option>,
                  ...sub.subPatternKeys.map((pk) => {
                    const t = BACKTEST_TARGETS.find((t) => t.key === pk);
                    if (!t) return null;
                    return (
                      <option key={pk} value={pk}>
                        {"\u00A0\u00A0\u00A0\u00A0"}• {t.label}
                      </option>
                    );
                  }),
                ])}
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
        {/* Single Date / Date Range toggle — PATTERN-only. A category or
            Pivot Level sub-category has no single target to grade, so
            sweeping either across many days wouldn't add anything beyond
            running each day individually via the single-date picker, hence
            this toggle is hidden entirely for category/Pivot-Level
            selections. */}
        {isPatternOnly && (
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Date Mode</label>
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(["single", "range"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setDateMode(m)}
                  className="px-3 py-1.5 transition-colors capitalize"
                  style={{
                    background: dateMode === m ? "#3b82f6" : "transparent",
                    color: dateMode === m ? "#fff" : "#8ba3bc",
                  }}
                >
                  {m === "single" ? "Single Date" : "Date Range"}
                </button>
              ))}
            </div>
          </div>
        )}

        {(!isPatternOnly || dateMode === "single") ? (
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
        ) : (
          <>
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">From Date (UTC)</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">To Date (UTC)</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate}
                max={new Date().toISOString().slice(0, 10)}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground"
              />
            </div>
          </>
        )}
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

      {/* Only show the Target line for actual patterns — a category or
          Pivot Level sub-category has no single target to describe here. */}
      {isPatternOnly && activeTarget && (
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
          or Pivot Level sub-categories above for those).
        </div>
      )}
      {/* NEW: Pivot Level sub-category info line — mirrors the category
          info line above, but names both the parent category and the
          Pivot Level. */}
      {isSubCategory && activeSubCategoryInfo && (
        <div className="text-xs text-muted-foreground mb-3">
          Pivot Level scan — lists every symbol matching{" "}
          <span className="text-foreground font-medium">{activeSubCategoryInfo.category.label}</span>&apos;s
          base condition AND Pivot Level{" "}
          <span className="text-foreground font-medium">{activeSubCategoryInfo.sub.label}</span> on the
          entry date. No Target/Result/Hit Date (select one of its patterns above for those).
        </div>
      )}

      {status === "running" && (
        <div className="mb-4 rounded-lg border border-border bg-background/50 p-3">
          {/* Date-sweep progress — only meaningful in pattern range mode */}
          {isPatternOnly && dateMode === "range" && dateProgress.total > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground mb-2 pb-2 border-b border-border/50">
              <span>
                Date {dateProgress.current} of {dateProgress.total} — {dateProgress.date}
              </span>
              <span>{Math.round((dateProgress.current / dateProgress.total) * 100)}%</span>
            </div>
          )}
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

      {/* Category / Pivot Level scan results — symbol list + CPR data only.
          Shared rendering for both, since they're the same row shape and
          only differ in the label used above the table. */}
      {status === "done" && (isCategory || isSubCategory) && (
        <>
          <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
            <span className="text-muted-foreground">
              {categoryRows.length} symbols matched {symbolListLabel} on {entryDate}
            </span>
          </div>

          {categoryRows.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              No symbols matched {symbolListLabel} on {entryDate}.
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
                      <td className="px-3 py-2 font-mono font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span>{r.symbol}</span>
                          <ChartLink symbol={r.symbol} source={r.source} />
                        </div>
                      </td>
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
      {status === "done" && isPatternOnly && (
        <>
          <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
            <span className="text-muted-foreground">
              {dateMode === "range"
                ? `${rows.length} symbols matched the pattern across ${enumerateDatesUTC(fromDate, toDate).length} days (${fromDate} to ${toDate})`
                : `${rows.length} symbols matched the pattern on ${entryDate}`}
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
              {dateMode === "range"
                ? `No symbols matched this pattern between ${fromDate} and ${toDate}.`
                : `No symbols matched this pattern on ${entryDate}.`}
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
                      Entry Date
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
                    <tr key={`${r.source}-${r.symbol}-${r.entryDate}`} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span>{r.symbol}</span>
                          <ChartLink symbol={r.symbol} source={r.source} />
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.entryDate}</td>
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
                        {r.hitDate
                          ? `${r.hitDate}${
                              r.daysToHit === 0 ? " (entry day)" : r.daysToHit === 1 ? " (next day)" : " (2 days later)"
                            }`
                          : "—"}
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
