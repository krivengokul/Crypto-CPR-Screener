import React, { useMemo, useState } from "react";
import { passesPattern, matchesPatternFlag } from "./ScreenerUtils";
import {
  runPatternCensus,
  BacktestSource,
  PatternCensusRow,
} from "@/lib/backtest";

/**
 * Pattern Stats — a standalone page (not nested inside BacktestPanel) that
 * answers one question: "of every pattern in the Backtest dropdown, how
 * many real historical rows actually match it?" Runs runPatternCensus
 * (backtest.ts) once over the chosen date range/source and lists every
 * (category, pattern) pair with its live count, sorted highest-first, so
 * empty or near-empty patterns (candidates for the same "CONFIRMED EMPTY"
 * treatment as RRSSA-COA, RRSSB-EBB, etc.) are obvious at a glance.
 *
 * Deliberately minimal: no charts, no filters beyond date range + source —
 * just the numbers, since that's what was asked for.
 */
export default function PatternStats() {
  const [source, setSource] = useState<BacktestSource>("binance");
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rows, setRows] = useState<PatternCensusRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalMatches = useMemo(() => rows?.reduce((sum, r) => sum + r.count, 0) ?? 0, [rows]);
  const emptyCount = useMemo(() => rows?.filter((r) => r.count === 0).length ?? 0, [rows]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setRows(null);
    setProgress(null);
    try {
      const result = await runPatternCensus(
        startDate,
        endDate,
        source,
        passesPattern,
        matchesPatternFlag,
        (done, total) => setProgress({ done, total })
      );
      setRows(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 text-foreground">
      <div>
        <h1 className="text-xl font-semibold">Pattern Stats</h1>
        <p className="text-sm text-muted-foreground">
          Live match count for every pattern in the Backtest dropdown, over a date range.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Source
          <select
            className="border rounded px-2 py-1.5 bg-background"
            value={source}
            onChange={(e) => setSource(e.target.value as BacktestSource)}
            disabled={running}
          >
            <option value="binance">Binance</option>
            <option value="delta">Delta</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Start date
          <input
            type="date"
            className="border rounded px-2 py-1.5 bg-background"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={running}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          End date
          <input
            type="date"
            className="border rounded px-2 py-1.5 bg-background"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={running}
          />
        </label>

        <button
          className="px-4 py-1.5 rounded bg-primary text-primary-foreground font-medium disabled:opacity-50"
          onClick={handleRun}
          disabled={running}
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>

      {running && progress && (
        <div className="text-sm text-muted-foreground">
          Scanning symbols… {progress.done}/{progress.total}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 border border-red-500/20 bg-red-500/10 rounded px-3 py-2">
          {error}
        </div>
      )}

      {rows && (
        <>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{rows.length}</span> patterns
            </span>
            <span>
              <span className="font-semibold text-foreground">{totalMatches}</span> total matched rows
            </span>
            <span>
              <span className="font-semibold text-foreground">{emptyCount}</span> came back empty
            </span>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Pattern</th>
                <th className="py-2 pr-4 font-medium text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.categoryKey}::${r.patternKey}`}
                  className={`border-b last:border-0 ${r.count === 0 ? "text-muted-foreground" : ""}`}
                >
                  <td className="py-1.5 pr-4">{r.categoryLabel}</td>
                  <td className="py-1.5 pr-4 font-mono">{r.patternLabel}</td>
                  <td className="py-1.5 pr-4 text-right font-mono">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
