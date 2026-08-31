import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Layers, Calendar as CalendarIcon } from "lucide-react";
import { passesPattern, matchesPatternFlag } from "./ScreenerUtils";
import {
  runPatternCensus,
  BacktestSource,
  PatternCensusRow,
  CategoryComboRow,
} from "@/lib/backtest";

// --- Small UTC date helpers (all dates here are UTC ISO strings) ---
// Same helpers/behaviour as BacktestPanel's DateField, so both panels'
// calendars look and behave identically.
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fromISO(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}
function addDaysUTC(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function daysInMonthUTC(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
function formatDisplay(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Calendar-based replacement for the native <input type="date">, ported
 * from BacktestPanel's "Entry Date (UTC)" DateField so Pattern Stats'
 * Start/End date pickers look and behave identically (Yesterday / 7d ago /
 * 30d ago quick-picks, clamped to min/max, above a month grid).
 */
function DateField({
  label,
  value,
  onChange,
  max,
  min,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  max?: string;
  min?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonthUTC(fromISO(value)));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (open) setViewMonth(startOfMonthUTC(fromISO(value)));
  }, [open, value]);

  const today = new Date();
  const todayISO = toISO(today);
  const quickPicks = [
    { label: "Yesterday", iso: toISO(addDaysUTC(today, -1)) },
    { label: "7d ago", iso: toISO(addDaysUTC(today, -7)) },
    { label: "30d ago", iso: toISO(addDaysUTC(today, -30)) },
  ].filter((q) => (!max || q.iso <= max) && (!min || q.iso >= min));

  const firstWeekday = startOfMonthUTC(viewMonth).getUTCDay();
  const totalDays = daysInMonthUTC(viewMonth);
  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => toISO(new Date(Date.UTC(viewMonth.getUTCFullYear(), viewMonth.getUTCMonth(), i + 1)))),
  ];

  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground flex items-center gap-2"
      >
        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{formatDisplay(value)}</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-[260px] rounded-lg border border-border bg-popover shadow-lg p-2">
          {quickPicks.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2 pb-2 border-b border-border">
              {quickPicks.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    onChange(q.iso);
                    setOpen(false);
                  }}
                  className={`text-[11px] px-2 py-1 rounded-full ${
                    value === q.iso ? "bg-blue-500/20 text-blue-300" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mb-1.5 px-1">
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1)))}
              className="text-muted-foreground hover:text-foreground p-1"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-foreground">
              {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)))}
              className="text-muted-foreground hover:text-foreground p-1"
              aria-label="Next month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="text-[9px] text-muted-foreground py-1">
                {d}
              </span>
            ))}
            {cells.map((iso, i) => {
              if (!iso) return <span key={i} />;
              const disabled = (!!max && iso > max) || (!!min && iso < min);
              const isSelected = iso === value;
              const isToday = iso === todayISO;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={`text-[11px] rounded-full w-6 h-6 flex items-center justify-center mx-auto ${
                    isSelected
                      ? "bg-blue-500 text-white font-medium"
                      : disabled
                      ? "text-muted-foreground/30 cursor-not-allowed"
                      : isToday
                      ? "text-blue-300 border border-blue-500/40 hover:bg-muted/40"
                      : "text-foreground/80 hover:bg-muted/40"
                  }`}
                >
                  {Number(iso.slice(-2))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** One category's patterns grouped together, with the category's own total (sum of its patterns' counts). */
interface CategoryGroup {
  categoryKey: string;
  categoryLabel: string;
  total: number;
  patterns: PatternCensusRow[];
  // TEMPORARY DEBUG ADDITION — every distinct raw HHLL/RRHH/SSLL combo
  // observed among rows that passed this category's base condition,
  // highest-count-first. See CategoryComboRow in backtest.ts.
  combos: CategoryComboRow[];
}

/**
 * CategoryBox — one category's card, styled to match SignalDesk's signal
 * boxes: rounded-xl bordered card, icon + title header with the count at
 * the end, hover lift, and a colored border (emerald once something has
 * matched, dashed/muted while every pattern in the category is still at
 * zero — the same "candidate for CONFIRMED EMPTY" signal PatternStats was
 * built to surface). The body lists every pattern in the category with its
 * own live count, highest-first.
 */
function CategoryBox({ group }: { group: CategoryGroup }) {
  const isEmpty = group.total === 0;

  return (
    <article
      className={[
        "rounded-xl border bg-card p-5 transition hover:-translate-y-0.5",
        isEmpty
          ? "border-dashed border-border/70 hover:border-border"
          : "border-emerald-400/50 hover:border-emerald-400/70",
      ].join(" ")}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={[
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              isEmpty ? "bg-muted/40 text-muted-foreground" : "bg-emerald-500/10 text-emerald-400",
            ].join(" ")}
          >
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{group.categoryLabel}</h3>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {group.patterns.length} pattern{group.patterns.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <p className={["font-mono text-xl font-semibold", isEmpty ? "text-muted-foreground" : "text-foreground"].join(" ")}>
            {group.total}
          </p>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">matched</span>
        </div>
      </div>

      <div className="space-y-0.5 border-t border-border pt-2">
        {group.patterns.map((p) => (
          <div
            key={p.patternKey}
            className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1 text-sm hover:bg-muted/30"
          >
            <span className={["truncate font-mono text-xs", p.count === 0 ? "text-muted-foreground" : "text-foreground"].join(" ")}>
              {p.patternLabel}
            </span>
            <span
              className={[
                "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                p.count > 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-background/60 text-muted-foreground",
              ].join(" ")}
            >
              {p.count}
            </span>
          </div>
        ))}
      </div>

      {/* TEMPORARY DEBUG ADDITION — every raw HHLL/RRHH/SSLL combo actually
          observed under this category's base condition, so the "of the NxN
          naive combinations only these are reachable" claims scattered
          through ScreenerUtils.tsx's BACKTEST_PATTERN_MATCHERS comments can
          be checked directly against live data. Remove this block (and
          CategoryGroup.combos / runPatternCensus's combos output) once no
          longer needed. */}
      {group.combos.length > 0 && (
        <div className="mt-3 space-y-0.5 border-t border-dashed border-border/70 pt-2">
          <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            RRSS / HHLL / RRHH / SSLL combos ({group.combos.length})
          </p>
          {group.combos.map((c) => (
            <div key={c.combo} className="flex items-center justify-between gap-3 rounded-md px-1.5 py-0.5 text-xs">
              <span className="truncate font-mono text-[11px] text-muted-foreground">{c.combo}</span>
              <span className="shrink-0 rounded-full bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                {c.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * Pattern Stats — a standalone page (not nested inside BacktestPanel) that
 * answers one question: "of every pattern in the Backtest dropdown, how
 * many real historical rows actually match it?" Runs runPatternCensus
 * (backtest.ts) once over the chosen date range/source and groups every
 * (category, pattern) result into one box per category — SignalDesk-style
 * cards, category name + total in the header, every pattern's live count
 * in the body — so empty or near-empty patterns (candidates for the same
 * "CONFIRMED EMPTY" treatment as RRSSA-COA, RRSSB-EBB, etc.) are obvious
 * at a glance, grouped by the category they actually live under.
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
  // TEMPORARY DEBUG ADDITION — see CategoryComboRow in backtest.ts.
  const [combos, setCombos] = useState<CategoryComboRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Total across every pattern, regardless of category — the single
  // bottom-of-page number. Per-category totals live in each box's own
  // header instead of being repeated down here.
  const totalMatches = useMemo(() => rows?.reduce((sum, r) => sum + r.count, 0) ?? 0, [rows]);
  const emptyCount = useMemo(() => rows?.filter((r) => r.count === 0).length ?? 0, [rows]);

  const categories = useMemo<CategoryGroup[]>(() => {
    if (!rows) return [];
    const byKey = new Map<string, CategoryGroup>();
    for (const r of rows) {
      const existing = byKey.get(r.categoryKey);
      if (existing) {
        existing.total += r.count;
        existing.patterns.push(r);
      } else {
        byKey.set(r.categoryKey, {
          categoryKey: r.categoryKey,
          categoryLabel: r.categoryLabel,
          total: r.count,
          patterns: [r],
          combos: [],
        });
      }
    }
    // TEMPORARY DEBUG ADDITION — attach each category's HHLL/RRHH/SSLL
    // combo breakdown. A category can have combos even with zero matched
    // patterns (or no `patterns` list at all), so this may add new groups
    // that the `rows` loop above never created.
    if (combos) {
      for (const c of combos) {
        const existing = byKey.get(c.categoryKey);
        if (existing) {
          existing.combos.push(c);
        } else {
          byKey.set(c.categoryKey, {
            categoryKey: c.categoryKey,
            categoryLabel: c.categoryLabel,
            total: 0,
            patterns: [],
            combos: [c],
          });
        }
      }
    }
    const groups = Array.from(byKey.values());
    for (const g of groups) {
      g.patterns.sort((a, b) => b.count - a.count);
      g.combos.sort((a, b) => b.count - a.count);
    }
    groups.sort((a, b) => b.total - a.total);
    return groups;
  }, [rows, combos]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setRows(null);
    setCombos(null);
    setProgress(null);
    try {
      const { rows: result, combos: comboResult } = await runPatternCensus(
        startDate,
        endDate,
        source,
        passesPattern,
        matchesPatternFlag,
        (done, total) => setProgress({ done, total })
      );
      setRows(result);
      setCombos(comboResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 text-foreground">
      <div>
        <h1 className="text-xl font-semibold">Pattern Stats</h1>
        <p className="text-sm text-muted-foreground">
          Live match count for every pattern in the Backtest dropdown, over a date range.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="block text-[10px] text-muted-foreground uppercase tracking-wider">Source</span>
          <select
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
            value={source}
            onChange={(e) => setSource(e.target.value as BacktestSource)}
            disabled={running}
          >
            <option value="binance">Binance</option>
            <option value="delta">Delta</option>
          </select>
        </label>

        <DateField label="Start Date (UTC)" value={startDate} onChange={setStartDate} max={endDate} />
        <DateField
          label="End Date (UTC)"
          value={endDate}
          onChange={setEndDate}
          min={startDate}
          max={new Date().toISOString().slice(0, 10)}
        />

        <button
          className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
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
          <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
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

          {categories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <p className="font-medium">No patterns found</p>
              <p className="mt-2 text-sm text-muted-foreground">Try a different date range or source.</p>
            </div>
          ) : (
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map((group) => (
                <CategoryBox key={group.categoryKey} group={group} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
