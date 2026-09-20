import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import {
  AlertTriangle,
  BarChart3,
  Ban,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  Filter,
  Flame,
  Layers,
  Loader2,
  Play,
  Sigma,
  Snowflake,
  Target,
  Crosshair,
} from "lucide-react";
import { passesPattern, computeInnerLevelPattern, INNER_LEVEL_PATTERN_KEYS, normalizeViewDirection, type ViewDirection } from "./ScreenerUtils";
import { pivotcategories } from "@/lib/ViewsSidebar";
import { buildViewTree, type ViewTreeNode } from "@/lib/views";
import {
  runPatternCensus,
  OUTER_PATTERNS_CATEGORY_KEY,
  OUTER_PATTERNS_CATEGORY_LABEL,
  INNER_PATTERNS_CATEGORY_KEY,
  INNER_PATTERNS_CATEGORY_LABEL,
  VIEWS_CATEGORY_KEY,
  VIEWS_CATEGORY_LABEL,
  BacktestSource,
  PatternCensusRow,
  CategoryComboRow,
  CategoryMatchRow,
} from "@/lib/backtest";

// The Category filter's options come straight from ViewsSidebar's own
// `pivotcategories` — the same list/labels/icons the left-nav sidebar renders —
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

interface CategoryOption {
  id: string;
  label: string;
  subtitle?: string;
  icon?: ElementType;
}

// TOP 15 GAINERS / LOSERS are top-level categories in views.ts (order 0 and 1,
// i.e. ahead of LEVEL ABOVE) but aren't in ViewsSidebar's `pivotcategories`,
// so they're added here by hand and placed first, matching views.ts.
const TOP_MOVER_OPTIONS: CategoryOption[] = [
  { id: "top15gainers", label: "TOP 15 GAINERS", subtitle: "Highest day-over-day % change, top 15 per date", icon: Flame },
  { id: "top15losers", label: "TOP 15 LOSERS", subtitle: "Lowest day-over-day % change, bottom 15 per date", icon: Snowflake },
];
const TOP_MOVER_IDS = new Set(TOP_MOVER_OPTIONS.map((o) => o.id));

// OUTER PATTERNS — not a category in views.ts or the sidebar: a synthetic
// panel (see OUTER_PATTERNS_CATEGORY_KEY in backtest.ts) listing the band
// patterns the Screener's Pattern column shows as second-row badges
// (L2U4, EU2L4, CU3L3, ...), each counted straight from its CPRResult flag.
// Placed last, after the sidebar's own categories.
const OUTER_PATTERNS_OPTION: CategoryOption = {
  id: OUTER_PATTERNS_CATEGORY_KEY,
  label: OUTER_PATTERNS_CATEGORY_LABEL,
  subtitle:
    "Today-vs-prev band patterns shown as the 2nd badge in the Pattern column (L2U4, EU2L4, CU3L3, …). A row can match several.",
  icon: Target,
};

// INNER PATTERNS — the other synthetic panel: the PivotPattern badge in row 2
// of the Pattern column (C-A-C-AA, A-A-AA-AA, ...), i.e. today's
// RRSS-HHLL-RRHH-SSLL combo as a single key. Counted with ScreenerUtils'
// own computeInnerLevelPattern, so it always agrees with the badge.
const INNER_PATTERNS_OPTION: CategoryOption = {
  id: INNER_PATTERNS_CATEGORY_KEY,
  label: INNER_PATTERNS_CATEGORY_LABEL,
  subtitle:
    "RRSS-HHLL-RRHH-SSLL combos shown as the 2nd-row PivotPattern badge in the Pattern column (C-A-C-AA, A-A-AA-AA, …). A row matches at most one.",
  icon: Crosshair,
};

// VIEWS — a third synthetic panel: EVERY kind:"view" leaf in views.ts's
// tree, flattened into one flat list regardless of which real category
// it's nested under (see VIEWS_CATEGORY_KEY in backtest.ts). Each view's
// own count is the same one it contributes to its real category, so this
// panel is a different lens on the same data, not new matches — kept out
// of the summed total below via OVERLAPPING_CATEGORY_IDS, same reasoning
// as OUTER PATTERNS/TOP 15 GAINERS/LOSERS.
const VIEWS_OPTION: CategoryOption = {
  id: VIEWS_CATEGORY_KEY,
  label: VIEWS_CATEGORY_LABEL,
  subtitle:
    "Every named View across every category, in one flat list (8AM:APHS1A-FAU4:4AM, 9AM:pPALPApH-FAU4:2PM, …). Bullish views in green, bearish in rose.",
  icon: Eye,
};

// The three synthetic panels are flat lists with no nesting.
const FLAT_LIST_IDS = new Set([OUTER_PATTERNS_CATEGORY_KEY, INNER_PATTERNS_CATEGORY_KEY]);

// Handed to runPatternCensus so it can count INNER PATTERNS (backtest.ts
// can't import ScreenerUtils itself).
const INNER_PATTERNS_CONFIG = { keys: INNER_LEVEL_PATTERN_KEYS as readonly string[], compute: computeInnerLevelPattern };

const CATEGORY_FILTER_OPTIONS: CategoryOption[] = [
  ...TOP_MOVER_OPTIONS,
  ...pivotcategories.filter((c) => !NON_CENSUS_CATEGORY_IDS.has(c.id)),
  OUTER_PATTERNS_OPTION,
  INNER_PATTERNS_OPTION,
  VIEWS_OPTION,
];

// Categories whose matches OVERLAP the others (a TOP 15 mover, a row with
// an outer / inner pattern, or a view — also sits in LEVEL ABOVE / TOUCH /
// …), so they're left out of the summed "distinct matches" total unless
// one is selected on its own.
const OVERLAPPING_CATEGORY_IDS = new Set([...TOP_MOVER_IDS, ...FLAT_LIST_IDS, VIEWS_CATEGORY_KEY]);

// Panel order = dropdown order = sidebar order. Any category key the census
// returns that isn't listed above sorts after these.
const CATEGORY_ORDER = new Map(CATEGORY_FILTER_OPTIONS.map((c, i) => [c.id, i] as const));
const CATEGORY_META = new Map(CATEGORY_FILTER_OPTIONS.map((c) => [c.id, c] as const));

// ---------------------------------------------------------------------
// Tree shape. runPatternCensus returns a flat list of (category, pattern)
// rows; the nesting (pattern -> subpattern -> view) lives in views.ts's
// parentKey tree, the same tree the Backtest dropdown renders. This walks
// that tree once so each row can be shown in dropdown order, indented by
// how deep it sits (pattern = level 1, subpattern = level 2, view = 3+).
// ---------------------------------------------------------------------
interface TreeMeta {
  depth: number;
  kind: "pattern" | "view";
  index: number; // depth-first position, i.e. dropdown order
}

function buildTreeMeta(): { scoped: Map<string, TreeMeta>; byKey: Map<string, TreeMeta> } {
  const scoped = new Map<string, TreeMeta>();
  // Same info, keyed by the bare pattern key alone (ViewDef.key is unique
  // across the whole tree — see its doc comment in views.ts). Used as a
  // fallback for the VIEWS synthetic category's rows, which are re-parented
  // under VIEWS_CATEGORY_KEY rather than their real category, so `scoped`
  // (built from each real category's own walk) never has an entry keyed
  // under VIEWS_CATEGORY_KEY.
  const byKey = new Map<string, TreeMeta>();
  let index = 0;
  for (const cat of buildViewTree()) {
    const walk = (nodes: ViewTreeNode[], depth: number) => {
      for (const n of nodes) {
        if (n.kind === "pattern" || n.kind === "view") {
          const k = `${cat.key}::${n.key}`;
          if (!scoped.has(k)) {
            const m = { depth, kind: n.kind, index: index++ };
            scoped.set(k, m);
            if (!byKey.has(n.key)) byKey.set(n.key, m);
          }
        }
        if (n.children && n.children.length > 0) walk(n.children, depth + 1);
      }
    };
    walk(cat.children, 1);
  }
  return { scoped, byKey };
}

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

// Shared look for every control in the filter bar (matches SignalDesk's
// search / filter inputs).
const CONTROL_LABEL = "block text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-1";
const CONTROL_BOX =
  "rounded-lg border border-[#22354a] bg-[#151e2c] text-sm text-slate-100 transition hover:border-slate-500 focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/40";

/**
 * Calendar-based replacement for the native <input type="date">, ported
 * from BacktestPanel's "Entry Date (UTC)" DateField so Pattern Statistics'
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
      <label className={CONTROL_LABEL}>{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${CONTROL_BOX} flex items-center gap-2 px-2.5 py-1.5`}
      >
        <CalendarIcon className="h-3.5 w-3.5 text-teal-400" />
        <span>{formatDisplay(value)}</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-[260px] rounded-lg border border-[#22354a] bg-[#0f1724] p-2 shadow-xl shadow-black/50">
          {quickPicks.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 border-b border-[#1e2d3d] pb-2">
              {quickPicks.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    onChange(q.iso);
                    setOpen(false);
                  }}
                  className={`rounded-full px-2 py-1 text-[11px] ${
                    value === q.iso
                      ? "bg-teal-500/20 text-teal-300"
                      : "bg-[#151e2c] text-slate-400 hover:text-white"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}
          <div className="mb-1.5 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1)))}
              className="p-1 text-slate-400 hover:text-white"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs text-slate-100">
              {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)))}
              className="p-1 text-slate-400 hover:text-white"
              aria-label="Next month"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="py-1 text-[9px] text-slate-500">
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
                  className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                    isSelected
                      ? "bg-teal-500 font-medium text-black"
                      : disabled
                      ? "cursor-not-allowed text-slate-700"
                      : isToday
                      ? "border border-teal-500/50 text-teal-300 hover:bg-[#151e2c]"
                      : "text-slate-300 hover:bg-[#151e2c]"
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

/** One pattern / subpattern / view line in a category card. */
interface StatRow {
  patternKey: string;
  patternLabel: string;
  count: number;
  depth: number; // 1 = pattern, 2 = subpattern, 3+ = view (and deeper)
  kind: "pattern" | "view";
  order: number; // dropdown (depth-first) order
  // Only ever set for kind:"view" rows — see PatternCensusRow.direction in
  // backtest.ts. Passed through normalizeViewDirection (ScreenerUtils.tsx)
  // before use, same normalization the rest of the app applies.
  direction?: "Up" | "Down";
}

/** One category's patterns grouped together, with the category's own total (sum of its patterns' counts). */
interface CategoryGroup {
  categoryKey: string;
  categoryLabel: string;
  total: number;
  patterns: StatRow[];
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

// Left indent per nesting level, in px. Spacing only — no arrows or dots —
// so a subpattern reads as "inside" its pattern and a view as "inside" its
// subpattern at a glance.
const INDENT_PX = 18;

/**
 * CategoryBox — one category's card, styled to match SignalDesk's signal
 * boxes: dark rounded-xl card, icon tile + title header with the count at
 * the end, hover lift, and a colored border (emerald once the category has
 * matched anything, dashed/muted only when the category itself matched
 * nothing — the same "candidate for CONFIRMED EMPTY" signal this page was
 * built to surface). The body lists every pattern in the category in the
 * same order as the Backtest dropdown, indented by depth, each with its own
 * live count and a faint bar showing its share of the category's busiest row.
 */
/** Text color for a matched row with a direction set — light green for
    bullish Views, rose for bearish. Falls back to the depth-based styling
    below when the row has no direction (patterns/subpatterns never do). */
function directionTextClass(direction: ViewDirection | null): string | null {
  if (direction === "Up") return "text-green-300";
  if (direction === "Down") return "text-rose-300";
  return null;
}

function CategoryBox({ group }: { group: CategoryGroup }) {
  // "Empty" means the category itself matched nothing. It used to key off
  // `group.total` (the sum of nested pattern counts), so a category like
  // BELOW LEVEL4 — which does have matching symbols, but none that land in
  // one of its listed patterns — got the dashed grey "empty" styling.
  const isEmpty = group.distinctCount === 0 && group.total === 0;
  const meta = CATEGORY_META.get(group.categoryKey);
  const Icon = meta?.icon ?? Layers;
  const maxCount = group.patterns.reduce((m, p) => Math.max(m, p.count), 0);
  const matchedPatterns = group.patterns.filter((p) => p.count > 0).length;
  // OUTER / INNER PATTERNS are flat lists of short keys with no nesting, so
  // they're laid out as a grid of compact tiles (in a full-width card)
  // instead of one very tall column.
  const isFlat = FLAT_LIST_IDS.has(group.categoryKey);

  return (
    <article
      className={[
        "relative flex flex-col overflow-hidden rounded-xl border bg-[#0f1724] p-4 shadow-lg transition-all hover:-translate-y-0.5",
        isFlat ? "md:col-span-2 xl:col-span-3" : "",
        isEmpty
          ? "border-dashed border-[#2a3a4f] hover:border-slate-500"
          : "border-emerald-500/40 hover:border-emerald-400/70 hover:shadow-emerald-950/40",
      ].join(" ")}
    >
      {/* Accent line across the top edge */}
      {!isEmpty && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-400/70 via-teal-400/30 to-transparent" />
      )}

      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={[
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
              isEmpty
                ? "border-[#22354a] bg-[#151e2c] text-slate-500"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
            ].join(" ")}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold tracking-wide text-white">{group.categoryLabel}</h3>
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              {group.patterns.length} pattern{group.patterns.length === 1 ? "" : "s"}
              {group.patterns.length > 0 && (
                <span className="text-slate-500">
                  {" · "}
                  {matchedPatterns} matched
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          {/* Headline = distinct (symbol, date) rows that pass the category's
              own base condition — the same number the left-nav sidebar shows
              (e.g. "LEVEL ABOVE (169)"). */}
          <p className={["font-mono text-2xl font-bold leading-none", isEmpty ? "text-slate-500" : "text-white"].join(" ")}>
            {group.distinctCount}
          </p>
          <span className="mt-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-400">matched</span>
          {/* Sum of every nested pattern's count. A symbol that fits several
              patterns is counted once per pattern here, so this can exceed
              the headline; kept as a secondary number for reference. */}
          {group.total > 0 && group.total !== group.distinctCount && (
            <p
              className="mt-1 font-mono text-[11px] text-slate-500"
              title="Sum of the pattern counts below. A symbol matching several patterns is counted once per pattern."
            >
              {group.total} pattern hits
            </p>
          )}
        </div>
      </div>

      {meta?.subtitle && (
        <p className="mb-3 line-clamp-2 text-[11px] leading-snug text-slate-500" title={meta.subtitle}>
          {meta.subtitle}
        </p>
      )}

      {group.patterns.length > 0 && isFlat ? (
        <div className="grid grid-cols-3 gap-1.5 border-t border-[#1e2d3d] pt-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {group.patterns.map((p) => (
            <div
              key={p.patternKey}
              className={[
                "flex items-center justify-between gap-2 rounded-md border px-2 py-1",
                p.count > 0
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-[#1e2d3d] bg-[#0c131f]",
              ].join(" ")}
              title={`${p.patternLabel}: ${p.count}`}
            >
              <span
                className={[
                  "truncate font-mono text-xs",
                  p.count > 0 ? "font-semibold text-slate-100" : "text-slate-600",
                ].join(" ")}
              >
                {p.patternLabel}
              </span>
              <span
                className={[
                  "shrink-0 font-mono text-[10px] font-bold",
                  p.count > 0 ? "text-emerald-300" : "text-slate-600",
                ].join(" ")}
              >
                {p.count}
              </span>
            </div>
          ))}
        </div>
      ) : group.patterns.length > 0 ? (
        <div className="max-h-[30rem] space-y-px overflow-y-auto border-t border-[#1e2d3d] pt-2 [scrollbar-color:#2a3a4f_transparent] [scrollbar-width:thin]">
          {group.patterns.map((p, i) => {
            const pct = maxCount > 0 ? Math.max(p.count > 0 ? 4 : 0, Math.round((p.count / maxCount) * 100)) : 0;
            const isTop = p.depth === 1;
            const dirClass = p.count > 0 ? directionTextClass(normalizeViewDirection(p.direction)) : null;
            return (
              <div
                key={`${i}-${p.patternKey}`}
                className="group/row relative flex items-center justify-between gap-3 rounded-md py-1 pr-1.5 hover:bg-[#151e2c]"
                style={{ paddingLeft: 6 + (p.depth - 1) * INDENT_PX }}
                title={p.patternLabel}
              >
                {/* Share-of-busiest-row bar, drawn behind the text */}
                {pct > 0 && (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 rounded-md bg-emerald-500/[0.07]"
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span
                  className={[
                    "relative truncate font-mono text-xs",
                    p.count === 0
                      ? "text-slate-600"
                      : dirClass
                      ? [dirClass, isTop ? "font-semibold" : "font-medium"].join(" ")
                      : isTop
                      ? "font-semibold text-slate-100"
                      : p.kind === "view"
                      ? "text-slate-400"
                      : "font-medium text-slate-200",
                  ].join(" ")}
                >
                  {p.patternLabel}
                </span>
                <span
                  className={[
                    "relative shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-bold",
                    p.count > 0
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                      : "border-[#223347] bg-[#182333] text-slate-500",
                  ].join(" ")}
                >
                  {p.count}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border-t border-[#1e2d3d] pt-3 text-center text-[11px] text-slate-500">
          No nested patterns in this category
        </div>
      )}

      {/* TEMPORARY DEBUG ADDITION — every raw HHLL/RRHH/SSLL combo actually
          observed under this category's base condition, so the "of the NxN
          naive combinations only these are reachable" claims scattered
          through ScreenerUtils.tsx's BACKTEST_PATTERN_MATCHERS comments can
          be checked directly against live data. Collapsed by default so it
          doesn't crowd the card; remove this block (and
          CategoryGroup.combos / runPatternCensus's combos output) once no
          longer needed. */}
      {group.combos.length > 0 && (
        <details className="group mt-3 border-t border-dashed border-[#2a3a4f] pt-2">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200">
            <span>
              RRSS / HHLL / RRHH / SSLL combos ({group.combos.length})
            </span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto [scrollbar-color:#2a3a4f_transparent] [scrollbar-width:thin]">
            {group.combos.map((c) => (
              <div key={c.combo} className="flex items-center justify-between gap-3 rounded-md px-1.5 py-0.5 text-xs">
                <span className="truncate font-mono text-[11px] text-slate-400">{c.combo}</span>
                <span className="shrink-0 rounded-full border border-[#223347] bg-[#182333] px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-400">
                  {c.count}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

/** Small stat chip for the header, same look as SignalDesk's quick-stat badges. */
function StatChip({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ElementType;
  label: string;
  value: number;
  tone?: "neutral" | "emerald" | "amber";
}) {
  const tones = {
    neutral: { border: "border-[#1e2d3d]", text: "text-slate-400", value: "text-white", icon: "text-slate-400" },
    emerald: { border: "border-emerald-500/30", text: "text-emerald-400", value: "text-emerald-400", icon: "text-emerald-400" },
    amber: { border: "border-amber-500/30", text: "text-amber-400", value: "text-amber-400", icon: "text-amber-400" },
  }[tone];
  return (
    <div className={`flex items-center gap-2 rounded-lg border bg-[#131b26] px-3 py-1.5 ${tones.border}`}>
      <Icon className={`h-3.5 w-3.5 ${tones.icon}`} />
      <span className={`text-[11px] font-medium ${tones.text}`}>{label}:</span>
      <span className={`font-mono text-sm font-bold ${tones.value}`}>{value}</span>
    </div>
  );
}

/**
 * Pattern Statistics — a standalone page (not nested inside BacktestPanel)
 * that answers one question: "of every pattern in the Backtest dropdown, how
 * many real historical rows actually match it?" Runs runPatternCensus
 * (backtest.ts) once over the chosen date range/source and groups every
 * (category, pattern) result into one box per category — SignalDesk-style
 * cards, category name + total in the header, every pattern's live count
 * in the body, laid out as the same tree the Backtest dropdown shows — so
 * empty or near-empty patterns (candidates for the same "CONFIRMED EMPTY"
 * treatment as RRSSA-COA, RRSSB-EBB, etc.) are obvious at a glance, grouped
 * by the category they actually live under.
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
  // (see CATEGORY_FILTER_OPTIONS above) so this dropdown always matches the
  // left-nav sidebar's category list/labels exactly, rather than maintaining
  // a second copy of it here.
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Depth + dropdown order for every (category, pattern) pair. Built once —
  // views.ts's tree doesn't change while the page is open.
  const treeMeta = useMemo(() => buildTreeMeta(), []);
  // rows/emptyCount/etc. below narrow to just the selected category when one
  // is chosen, so the summary chips and boxes reflect the same scope as the
  // dropdown — "All categories" (categoryFilter === "") keeps everything.
  const scopedRows = useMemo(
    () => (categoryFilter ? rows?.filter((r) => r.categoryKey === categoryFilter) ?? null : rows),
    [rows, categoryFilter]
  );

  const emptyCount = useMemo(() => scopedRows?.filter((r) => r.count === 0).length ?? 0, [scopedRows]);

  const categories = useMemo<CategoryGroup[]>(() => {
    if (!rows) return [];
    // Rows with no entry in views.ts's tree (i.e. OUTER PATTERNS' flat list)
    // keep the census's own order — highest count first, ties in
    // OUTER_PATTERN_KEYS priority order — via a running sequence number.
    let seq = 0;
    const toStatRow = (categoryKey: string, r: PatternCensusRow): StatRow => {
      // VIEWS rows are re-parented under VIEWS_CATEGORY_KEY, which never
      // appears in the scoped map (see buildTreeMeta's doc comment) — fall
      // back to the bare-key map, which still finds the view's real kind/
      // order from wherever it actually lives in the tree. Depth is forced
      // to 1 for this one category only, so the flat cross-category list
      // doesn't inherit each view's real (and here meaningless) nesting
      // depth from its actual parent pattern/subpattern.
      const m = treeMeta.scoped.get(`${categoryKey}::${r.patternKey}`) ?? treeMeta.byKey.get(r.patternKey);
      return {
        patternKey: r.patternKey,
        patternLabel: r.patternLabel,
        count: r.count,
        depth: categoryKey === VIEWS_CATEGORY_KEY ? 1 : m?.depth ?? 1,
        kind: m?.kind ?? "pattern",
        order: m?.index ?? 1_000_000 + seq++,
        direction: r.direction,
      };
    };
    const byKey = new Map<string, CategoryGroup>();
    for (const r of rows) {
      const existing = byKey.get(r.categoryKey);
      if (existing) {
        existing.total += r.count;
        existing.patterns.push(toStatRow(r.categoryKey, r));
      } else {
        byKey.set(r.categoryKey, {
          categoryKey: r.categoryKey,
          categoryLabel: r.categoryLabel,
          total: r.count,
          patterns: [toStatRow(r.categoryKey, r)],
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
      // Dropdown (tree) order, NOT highest-count-first — the indentation only
      // makes sense when every subpattern sits right under its pattern.
      g.patterns.sort((a, b) => a.order - b.order);
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
  }, [rows, combos, categoryMatches, treeMeta]);

  // Boxes actually rendered — narrowed to the selected category, same
  // scoping as scopedRows above.
  const visibleCategories = useMemo(
    () => (categoryFilter ? categories.filter((g) => g.categoryKey === categoryFilter) : categories),
    [categories, categoryFilter]
  );

  // Sum of each visible category's distinct count — the same total you get
  // by adding up the sidebar's category numbers. (The old figure summed
  // every pattern row, so a symbol matching several patterns was counted
  // several times.) TOP 15 GAINERS / LOSERS and OUTER PATTERNS are left out:
  // their symbols also sit in the other categories, so adding them would
  // count the same symbol twice. (Selecting one of them on its own still
  // shows its own total.)
  const totalMatches = useMemo(
    () =>
      visibleCategories.reduce(
        (sum, g) =>
          sum + (OVERLAPPING_CATEGORY_IDS.has(g.categoryKey) && !OVERLAPPING_CATEGORY_IDS.has(categoryFilter) ? 0 : g.distinctCount),
        0
      ),
    [visibleCategories, categoryFilter]
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
        (done, total) => setProgress({ done, total }),
        INNER_PATTERNS_CONFIG
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

  const progressPct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[#080d15] text-slate-100">
      {/* Top banner header — same structure as SignalDesk's */}
      <div className="flex shrink-0 flex-col justify-between gap-4 border-b border-[#1e2d3d] bg-[#0c131f] p-4 md:flex-row md:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/20">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-base font-bold tracking-wide text-white">
              PATTERN STATISTICS
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] uppercase text-emerald-400">
                Live Match Counts
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              How many real historical rows match every category, pattern, subpattern and view in the Backtest dropdown
            </p>
          </div>
        </div>

        {rows && (
          <div className="flex flex-wrap items-center gap-2">
            <StatChip icon={Layers} label="Patterns" value={scopedRows?.length ?? 0} />
            <StatChip icon={Sigma} label="Distinct matches" value={totalMatches} tone="emerald" />
            <StatChip icon={Ban} label="Empty" value={emptyCount} tone="amber" />
          </div>
        )}
      </div>

      {/* Filter scan bar */}
      <div className="shrink-0 border-b border-[#1b263b] bg-[#0d1422] px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex shrink-0 items-center gap-2 pb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-teal-400">
            <Filter className="h-3.5 w-3.5" />
            Filter scan
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className={CONTROL_LABEL}>Source</span>
              <div className="relative">
                <Database className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-teal-400" />
                <select
                  className={`${CONTROL_BOX} min-w-[120px] appearance-none py-1.5 pl-8 pr-7 disabled:opacity-60`}
                  value={source}
                  onChange={(e) => setSource(e.target.value as BacktestSource)}
                  disabled={running}
                >
                  <option value="binance">Binance</option>
                  <option value="delta">Delta</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>
            </label>

            <DateField label="Start Date (UTC)" value={startDate} onChange={setStartDate} max={endDate} />
            <DateField
              label="End Date (UTC)"
              value={endDate}
              onChange={setEndDate}
              min={startDate}
              max={new Date().toISOString().slice(0, 10)}
            />

            <label className="block">
              <span className={CONTROL_LABEL}>Category</span>
              <div className="relative">
                <Layers className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-teal-400" />
                <select
                  className={`${CONTROL_BOX} min-w-[190px] appearance-none border-teal-500/50 py-1.5 pl-8 pr-7`}
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
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>
            </label>

            <button
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-1.5 text-sm font-bold text-[#04140f] shadow-md shadow-emerald-900/40 transition hover:from-emerald-300 hover:to-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleRun}
              disabled={running}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
              {running ? "Running…" : "Run scan"}
            </button>
          </div>
        </div>

        {running && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-slate-400">
              <span>{progress ? `Scanning symbols… ${progress.done}/${progress.total}` : "Preparing scan…"}</span>
              {progress && <span className="text-teal-300">{progressPct}%</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#151e2c]">
              <div
                className={[
                  "h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-300",
                  progress ? "" : "w-1/4 animate-pulse",
                ].join(" ")}
                style={progress ? { width: `${progressPct}%` } : undefined}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!rows && !running && !error && (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-[#1e2d3d] text-slate-400">
            <BarChart3 className="mb-2 h-10 w-10 text-slate-600" />
            <p className="text-sm font-medium">Ready to scan</p>
            <p className="mt-1 text-xs text-slate-500">Pick a source, date range and category, then press Run scan</p>
          </div>
        )}

        {rows && (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Categories ({visibleCategories.length})
              </span>
              <p className="hidden text-[11px] italic text-slate-500 sm:block">
                Same order as the sidebar; patterns are indented like the Backtest dropdown.
              </p>
            </div>

            {visibleCategories.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-[#1e2d3d] text-slate-400">
                <Ban className="mb-2 h-10 w-10 text-slate-600" />
                <p className="text-sm font-medium">No patterns found</p>
                <p className="mt-1 text-xs text-slate-500">Try a different date range, source, or category</p>
              </div>
            ) : (
              <section className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {visibleCategories.map((group) => (
                  <CategoryBox key={group.categoryKey} group={group} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}