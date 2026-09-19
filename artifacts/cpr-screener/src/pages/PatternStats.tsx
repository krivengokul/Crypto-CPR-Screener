import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Layers, Calendar as CalendarIcon, Search } from "lucide-react";
import { passesPattern } from "./ScreenerUtils";
import { pivotcategories } from "@/lib/ViewsSidebar";
import {
  runPatternCensus,
  BacktestSource,
  PatternCensusRow,
  CategoryComboRow,
  CategoryMatchRow,
} from "@/lib/backtest";

// The Category filter's options come straight from ViewsSidebar's own
// `pivotcategories` — the same list/labels the left-nav sidebar renders —
// so this dropdown can never drift out of sync with what the sidebar shows.
// Two of its entries aren't real top-level categories in views.ts's tree,
// so they're excluded here (selecting either would just show "No patterns
// found", since no PatternCensusRow's categoryKey ever equals them):
//   - "equal-cpr": nested under the "touch" category in views.ts, not a
//     top-level category of its own (ViewsSidebar surfaces it in the nav
//     as if it were, as a UI-only convenience).
//   - "copyViews": ViewsSidebar's own flat nav bucket for auto-generated
//     Copy View / Create View entries — never existed in views.ts at all.
const NON_CENSUS_CATEGORY_IDS = new Set(["equal-cpr", "copyViews"]);

// TOP 15 GAINERS / LOSERS are top-level categories in views.ts (order 0 and 1,
// i.e. ahead of LEVEL ABOVE) but aren't in ViewsSidebar's `pivotcategories`,
// so they're added here by hand and placed first, matching views.ts.
const TOP_MOVER_OPTIONS = [
  { id: "top15gainers", label: "TOP 15 GAINERS" },
  { id: "top15losers", label: "TOP 15 LOSERS" },
];
const TOP_MOVER_IDS = new Set(TOP_MOVER_OPTIONS.map((o) => o.id));

const CATEGORY_FILTER_OPTIONS: { id: string; label: string }[] = [
  ...TOP_MOVER_OPTIONS,
  ...pivotcategories.filter((c) => !NON_CENSUS_CATEGORY_IDS.has(c.id)),
];

// Panel order = dropdown order = sidebar order. Any category key the census
// returns that isn't listed above sorts after these.
const CATEGORY_ORDER = new Map(CATEGORY_FILTER_OPTIONS.map((c, i) => [c.id, i] as const));

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
  // Distinct (symbol, date) rows that passed only this category's own base
  // condition — comparable directly to the left-nav sidebar's per-category
  // count. See CategoryMatchRow in backtest.ts for why this differs from
  // `total` above (which sums every nested pattern/subpattern's count and
  // so double-counts any symbol matching more than one of them).
  distinctCount: number;
  // TEMPORARY DEBUG ADDITION — every distinct raw HHLL/RRHH/SSLL combo
  // observed among rows that passed this category's base condition,
  // highest-count-first. See CategoryComboRow in backtest.ts.
  combos: CategoryComboRow[];
}

/**
 * CategoryBox — one category's card, styled to match SignalDesk's signal
 * boxes: rounded-xl bordered card, icon + title header with the count at
 * the end, hover lift, and a colored border (emerald once the category has
 * matched anything, dashed/muted only when the category itself matched
 * nothing — the same "candidate for CONFIRMED EMPTY" signal PatternStats
 * was built to surface). The body lists every pattern in the category with its
 * own live count, highest-first.
 */
function CategoryBox({ group }: { group: CategoryGroup }) {
  // "Empty" means the category itself matched nothing. It used to key off
  // `group.total` (the sum of nested pattern counts), so a category like
  // BELOW LEVEL4 — which does have matching symbols, but none that land in
  // one of its listed patterns — got the dashed grey "empty" styling.
  const isEmpty = group.distinctCount === 0 && group.total === 0;

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
          {/* Headline = distinct (symbol, date) rows that pass the category's
              own base condition — the same number the left-nav sidebar shows
              (e.g. "LEVEL ABOVE (169)"). */}
          <p className={["font-mono text-xl font-semibold", isEmpty ? "text-muted-foreground" : "text-foreground"].join(" ")}>
            {group.distinctCount}
          </p>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">matched</span>
          {/* Sum of every nested pattern's count. A symbol that fits several
              patterns is counted once per pattern here, so this can exceed
              the headline; kept as a secondary number for reference. */}
          {group.total > 0 && (
            <p
              className="mt-1 font-mono text-xs text-muted-foreground"
              title="Sum of the pattern counts below. A symbol matching several patterns is counted once per pattern."
            >
              {group.total} pattern hits
            </p>
          )}
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
  // Per-category distinct-symbol counts — see CategoryMatchRow in backtest.ts.
  const [categoryMatches, setCategoryMatches] = useState<CategoryMatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "" = All categories. Options come from ViewsSidebar's own `pivotcategories`
  // (see CATEGORY_FILTER_OPTIONS below) so this dropdown always matches the
  // left-nav sidebar's category list/labels exactly, rather than maintaining
  // a second copy of it here.
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // rows/emptyCount/etc. below narrow to just the selected category when one
  // is chosen, so the summary bar and boxes reflect the same scope as the
  // dropdown — "All categories" (categoryFilter === "") keeps everything.
  const scopedRows = useMemo(
    () => (categoryFilter ? rows?.filter((r) => r.categoryKey === categoryFilter) ?? null : rows),
    [rows, categoryFilter]
  );

  const emptyCount = useMemo(() => scopedRows?.filter((r) => r.count === 0).length ?? 0, [scopedRows]);

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
          distinctCount: 0,
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
            distinctCount: 0,
            combos: [c],
          });
        }
      }
    }
    // Attach each category's distinct-symbol count. A category can have a
    // distinct count even with zero matched patterns (or no `patterns`
    // list at all), same reasoning as the combos loop above.
    if (categoryMatches) {
      for (const m of categoryMatches) {
        const existing = byKey.get(m.categoryKey);
        if (existing) {
          existing.distinctCount = m.count;
        } else {
          byKey.set(m.categoryKey, {
            categoryKey: m.categoryKey,
            categoryLabel: m.categoryLabel,
            total: 0,
            patterns: [],
            distinctCount: m.count,
            combos: [],
          });
        }
      }
    }
    const groups = Array.from(byKey.values());
    for (const g of groups) {
      g.patterns.sort((a, b) => b.count - a.count);
      g.combos.sort((a, b) => b.count - a.count);
    }
    // Same order as the left-nav sidebar (LEVEL ABOVE, ABOVE LEVEL4, LEVEL
    // BELOW, COMPRESSED, EXPANDED, BELOW LEVEL4, TOUCH). Unknown keys go last.
    groups.sort(
      (a, b) =>
        (CATEGORY_ORDER.get(a.categoryKey) ?? Number.MAX_SAFE_INTEGER) -
          (CATEGORY_ORDER.get(b.categoryKey) ?? Number.MAX_SAFE_INTEGER) || b.distinctCount - a.distinctCount
    );
    return groups;
  }, [rows, combos, categoryMatches]);

  // Boxes actually rendered — narrowed to the selected category, same
  // scoping as scopedRows above.
  const visibleCategories = useMemo(
    () => (categoryFilter ? categories.filter((g) => g.categoryKey === categoryFilter) : categories),
    [categories, categoryFilter]
  );

  // Sum of each visible category's distinct count — the same total you get
  // by adding up the sidebar's category numbers. (The old figure summed
  // every pattern row, so a symbol matching several patterns was counted
  // several times.)
  const totalMatches = useMemo(
    () => visibleCategories.reduce((sum, g) => sum + g.distinctCount, 0),
    [visibleCategories]
  );

  async function handleRun() {
    setRunning(true);
    setError(null);
    setRows(null);
    setCombos(null);
    setCategoryMatches(null);
    setProgress(null);
    try {
      const { rows: result, combos: comboResult, categoryMatches: categoryMatchResult } = await runPatternCensus(
        startDate,
        endDate,
        source,
        passesPattern,
        (done, total) => setProgress({ done, total })
      );
      setRows(result);
      setCombos(comboResult);
      setCategoryMatches(categoryMatchResult);
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

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex shrink-0 items-center gap-2 pb-1.5 text-sm font-medium text-cyan-400">
            <Search className="h-4 w-4" />
            Filter scan
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

            <label className="flex flex-col gap-1 text-sm">
              <span className="block text-[10px] text-muted-foreground uppercase tracking-wider">Category</span>
              <select
                className="min-w-[160px] rounded-lg border border-cyan-400/70 bg-background px-2.5 py-1.5 text-sm text-foreground shadow-[0_0_0_1px_rgba(34,211,238,0.25)] focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All categories</option>
                {CATEGORY_FILTER_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="rounded-lg bg-cyan-400 px-4 py-1.5 font-semibold text-black transition hover:bg-cyan-300 disabled:opacity-50"
              onClick={handleRun}
              disabled={running}
            >
              {running ? "Running…" : "Run scan"}
            </button>
          </div>
        </div>
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
              <span className="font-semibold text-foreground">{scopedRows?.length ?? 0}</span> patterns
            </span>
            <span>
              <span className="font-semibold text-foreground">{totalMatches}</span> distinct matches
            </span>
            <span>
              <span className="font-semibold text-foreground">{emptyCount}</span> came back empty
            </span>
          </div>

          {visibleCategories.length === 0 && TOP_MOVER_IDS.has(categoryFilter) ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <p className="font-medium">
                {CATEGORY_FILTER_OPTIONS.find((o) => o.id === categoryFilter)?.label} isn&apos;t in the scan results yet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                runPatternCensus doesn&apos;t rank top movers, so there is nothing to show for this category.
              </p>
            </div>
          ) : visibleCategories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <p className="font-medium">No patterns found</p>
              <p className="mt-2 text-sm text-muted-foreground">Try a different date range, source, or category.</p>
            </div>
          ) : (
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCategories.map((group) => (
                <CategoryBox key={group.categoryKey} group={group} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}