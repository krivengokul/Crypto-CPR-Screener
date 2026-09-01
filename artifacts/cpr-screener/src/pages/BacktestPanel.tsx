"use client";

import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Search,
  Info,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  BACKTEST_TARGETS,
  BACKTEST_CATEGORIES,
  runBacktest,
  runCategoryScan,
  runPivotLevelBacktest,
  type BacktestRow,
  type CategoryScanRow,
  type BacktestSource,
  type BacktestCategoryDef,
  type BacktestSubCategoryDef,
  type BacktestTargetDef,
} from "@/lib/backtest";
import { passesPattern, matchesPatternFlag, fmt, getChartUrl, hasKnownChartMapping, getWidthCategory, renderGapColumnBadges, renderPivotSizeCell } from "./ScreenerUtils";
import {
  renderTodayPatternBadges,
  renderPrevPatternBadge,
  renderPatternColumnBadges,
  renderLevelColumnRestBadges,
} from "./ScreenerTableRow";
import { SRLadderRow, toSRLadderData } from "./SRLadderPanel";

// --- Small UTC date helpers (all dates in this panel are UTC ISO strings) ---
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

// NEW: ranking helper for the "TOP 15 GAINERS" / "TOP 15 LOSERS"
// categories (lib/backtest.ts's BACKTEST_CATEGORIES). Those categories let
// every symbol through the base-condition check (see passesPattern's
// "top15gainers"/"top15losers" cases in ScreenerUtils.tsx), so
// runCategoryScan returns the full universe for that entry date; this
// sorts by CategoryScanRow.changePct (entry-day % change) and keeps only
// the top 15 in the requested direction. Rows with a null changePct (no
// entry-day candle yet) are excluded — there's nothing to rank them by.
function selectTopByChange<T extends { changePct: number | null }>(
  rows: T[],
  direction: "gainers" | "losers",
  limit = 15
): T[] {
  return rows
    .filter((r): r is T & { changePct: number } => r.changePct !== null && r.changePct !== undefined)
    .sort((a, b) => (direction === "gainers" ? b.changePct - a.changePct : a.changePct - b.changePct))
    .slice(0, limit);
}
function formatDisplay(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const CPR_WIDTH_TIERS = [
  { label: "Micro", range: "≤0.10%", sample: 0.1 },
  { label: "Tiny", range: "0.10–0.22%", sample: 0.15 },
  { label: "Mini", range: "0.22–0.50%", sample: 0.3 },
  { label: "Small", range: "0.60–1.10%", sample: 0.8 },
  { label: "Medium", range: "1.10–2.00%", sample: 1.5 },
  { label: "Large", range: "2.00–5.00%", sample: 3 },
  { label: "Mega", range: "5.00–10.00%", sample: 7 },
  { label: "Ultra", range: ">10.00%", sample: 11 },
] as const;

function PivotSizeInfo() {
  return (
    <span className="group relative inline-flex align-middle normal-case tracking-normal">
      <button
        type="button"
        aria-label="CPR width category guide"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden w-[282px] -translate-x-1/2 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg group-hover:block group-focus-within:block"
      >
        <span className="mb-1.5 flex items-center justify-between border-b border-border pb-1.5">
          <span className="text-[11px] font-semibold">CPR width</span>
          <span className="text-[9px] text-muted-foreground">tight → volatile</span>
        </span>
        <span className="grid grid-cols-4 gap-1">
          {CPR_WIDTH_TIERS.map((tier) => {
            const category = getWidthCategory(tier.sample);
            return (
              <span
                key={tier.label}
                className={`flex min-w-0 flex-col items-center rounded border px-1 py-1 leading-tight ${category.classes}`}
              >
                <span className="text-[10px] font-semibold">{tier.label}</span>
                <span className="mt-0.5 whitespace-nowrap font-mono text-[8px]">{tier.range}</span>
              </span>
            );
          })}
        </span>
        <span className="mt-1.5 block text-[9px] leading-tight text-muted-foreground">
          <span className="font-semibold text-foreground">p</span> prefix = previous day (muted badge)
        </span>
      </span>
    </span>
  );
}

/**
 * Calendar-based replacement for the old native <input type="date">.
 * Shows Yesterday / 7d ago / 30d ago quick-picks (clamped to min/max)
 * above a month grid. All dates are UTC ISO strings ("YYYY-MM-DD").
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


/**
 * v1 backtest UI — proves out the engine on a handful of patterns (see
 * lib/backtest.ts's BACKTEST_TARGETS / BACKTEST_CATEGORIES). Pick a past
 * date and one of three selection levels:
 *   - a CATEGORY (e.g. "LittleCPR Above", "Overlap Above") — symbol list
 *     matching the category's base condition only, no Target/Result/Hit
 *     Date, since a category has no single well-defined target;
 *   - a Pattern nested under a category (e.g. "Overlap Above" → "HiL4U34"),
 *     or a Subpattern nested under another Pattern — both run the
 *     target-graded backtest for that node; or
 *   - a specific View nested under a Pattern — the full backtest using the
 *     View's target definition.
 *
 * Dropdown layout: the category/pattern label is no longer rendered
 * as a separate bold <optgroup> header (that duplicated the "— all
 * (symbol list only)" option below it). Instead the category is a single
 * selectable row "<Category>", with its patterns
 * and recursively nested Patterns/Views indented beneath them. Native
 * <option> elements can't render partial bold, so the category name is shown
 * in plain text; the visual grouping comes from indentation and arrows.
 */
export default function BacktestPanel() {
  const [selectedKey, setSelectedKey] = useState<string>(BACKTEST_CATEGORIES[0].key);
  const [entryDate, setEntryDate] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [source, setSource] = useState<BacktestSource>("binance");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  // Symbol-click → ADK S/R ladder, same behaviour as the Screener table.
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());
  function toggleExpand(key: string) {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  const [progress, setProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [rows, setRows] = useState<BacktestRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<(CategoryScanRow & { entryDate: string })[]>([]);
  const [changeSortDir, setChangeSortDir] = useState<"asc" | "desc" | null>(null);
  const [resultChangeSortDir, setResultChangeSortDir] = useState<"asc" | "desc" | null>(null);
  const [error, setError] = useState("");

  // FIX (stale-results bug): the "Target: ... Pattern <label>" header and
  // the dropdown's trigger label are derived live from `selectedKey`, but
  // `rows`/`categoryRows` only get refreshed when `run()` is clicked. Without
  // this, changing the selection after a run finished (without re-running)
  // left the OLD pattern's results on screen underneath the NEW pattern's
  // label/description — e.g. run "A-A-OA-AA", then merely select
  // "C-A-OA-AA" in the picker: the header/trigger instantly say
  // "C-A-OA-AA" while the table still shows the correct "A-A-OA-AA" rows,
  // which looks exactly like "correct records, wrong badge". Reset results
  // back to idle whenever the selection changes so stale rows can never be
  // displayed under a mismatched label.
  useEffect(() => {
    setStatus("idle");
    setRows([]);
    setCategoryRows([]);
    setError("");
  }, [selectedKey]);

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
  const [dateProgress, setDateProgress] = useState({ current: 0, total: 0, date: "" });

  // Pattern picker (replaces the old native <select>) — supports search
  // and collapsible top-level groups, which a native <select>/<option>
  // list can't do.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const pickerRef = useRef<HTMLDivElement>(null);

  const SUBCATEGORY_SEP = "::";

  const isCategory = BACKTEST_CATEGORIES.some((c) => c.key === selectedKey);

  let activePatternInfo: {
    category: BacktestCategoryDef;
    sub: BacktestSubCategoryDef;
    path: BacktestSubCategoryDef[];
  } | undefined;
  for (const cat of BACKTEST_CATEGORIES) {
    const findPattern = (
      patterns: BacktestSubCategoryDef[] | undefined,
      ancestors: BacktestSubCategoryDef[] = []
    ): typeof activePatternInfo => {
      for (const sub of patterns ?? []) {
        const path = [...ancestors, sub];
        if ([cat.key, ...path.map((p) => p.key)].join(SUBCATEGORY_SEP) === selectedKey) {
          return { category: cat, sub, path };
        }
        const nested = findPattern(sub.patterns, path);
        if (nested) return nested;
      }
      return undefined;
    };
    activePatternInfo = findPattern(cat.patterns);
    if (activePatternInfo) break;
  }
  const isPatternOnly = !!activePatternInfo;

  const isViewOnly = !isCategory && !isPatternOnly;

  const activeTarget = isViewOnly ? BACKTEST_TARGETS.find((t) => t.key === selectedKey) : undefined;
  const activePatternTarget = isPatternOnly && activePatternInfo
    ? BACKTEST_TARGETS.find((t) => t.key === activePatternInfo.sub.key)
    : undefined;
  const activeCategory = isCategory ? BACKTEST_CATEGORIES.find((c) => c.key === selectedKey) : undefined;

  const symbolListLabel = isCategory
    ? activeCategory?.label
    : isPatternOnly && activePatternInfo
    ? `${activePatternInfo.category.label} → ${activePatternInfo.path.map((p) => `Pattern ${p.label}`).join(" → ")}`
    : undefined;

  // Ungrouped patterns intentionally omitted from the dropdown: the ones
  // that were showing up at the bottom ("LittleCPR Above", "U1 > Previous U4
  // (BigCPR Above)") duplicated options already rendered inside their
  // categories above, so we no longer render this trailing list.

  // Display order for the dropdown: place "Overlap Above" immediately after
  // "CPR Outside" (per request), keeping every other category in its
  // original position. Falls back to the original order if either key is
  // missing.
  const orderedCategories = (() => {
    const list = [...BACKTEST_CATEGORIES];
    const overlapIdx = list.findIndex((c) => /overlap\s*above/i.test(c.label));
    const cprOutsideIdx = list.findIndex((c) => /cpr\s*outside/i.test(c.label));
    if (overlapIdx === -1 || cprOutsideIdx === -1) return list;
    const [overlap] = list.splice(overlapIdx, 1);
    const insertAt = list.findIndex((c) => /cpr\s*outside/i.test(c.label)) + 1;
    list.splice(insertAt, 0, overlap);
    return list;
  })();

  // Resolve the recursive category → Pattern → Subpattern → View tree once,
  // so the picker can render every level without re-searching
  // BACKTEST_TARGETS on every keystroke.
  type ResolvedSub = {
    sub: BacktestSubCategoryDef;
    path: BacktestSubCategoryDef[];
    Views: BacktestTargetDef[];
    children: ResolvedSub[];
  };
  type ResolvedCat = { cat: BacktestCategoryDef; directPatterns: BacktestTargetDef[]; subCats: ResolvedSub[] };
  const categoryTree: ResolvedCat[] = useMemo(
    () => {
      const resolvePattern = (
        sub: BacktestSubCategoryDef,
        ancestors: BacktestSubCategoryDef[] = []
      ): ResolvedSub => {
        const path = [...ancestors, sub];
        return {
          sub,
          path,
          Views: sub.subPatternKeys
            .map((pk) => BACKTEST_TARGETS.find((t) => t.key === pk))
            .filter((t): t is BacktestTargetDef => !!t),
          children: (sub.patterns ?? []).map((child) => resolvePattern(child, path)),
        };
      };

      return orderedCategories.map((cat) => ({
        cat,
        directPatterns: (cat.subPatternKeys ?? [])
          .map((pk) => BACKTEST_TARGETS.find((t) => t.key === pk))
          .filter((t): t is BacktestTargetDef => !!t),
        subCats: (cat.patterns ?? []).map((sub) => resolvePattern(sub)),
      }));
    },
    [orderedCategories]
  );

  const triggerLabel = isCategory
    ? activeCategory?.label
    : isPatternOnly && activePatternInfo
    ? activePatternInfo.sub.label
    : activeTarget?.label ?? selectedKey;

  // Close on outside click / Escape.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // On open, expand whichever group contains the current selection and
  // clear any leftover search text.
  useEffect(() => {
    const containsSelection = (node: ResolvedSub, catKey: string): boolean =>
      [catKey, ...node.path.map((p) => p.key)].join(SUBCATEGORY_SEP) === selectedKey ||
      node.Views.some((t) => t.key === selectedKey) ||
      node.children.some((child) => containsSelection(child, catKey));

    if (!pickerOpen) return;
    const cat = categoryTree.find(
      ({ cat, directPatterns, subCats }) =>
        cat.key === selectedKey ||
        directPatterns.some((t) => t.key === selectedKey) ||
        subCats.some((s) => containsSelection(s, cat.key))
    );
    setExpandedCats(cat ? new Set([cat.cat.key]) : new Set());
    setPickerQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen]);

  function toggleCat(key: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAndClose(key: string, expandCat?: string) {
    setSelectedKey(key);
    if (expandCat) setExpandedCats(new Set([expandCat]));
    setPickerOpen(false);
  }

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
    if (dateMode === "range") {
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
      setChangeSortDir(null);
      setResultChangeSortDir(null);
    setProgress({ done: 0, total: 0, symbol: "" });
    setDateProgress({ current: 0, total: 0, date: "" });
    try {
      if (isCategory) {
        // NEW: "TOP 15 GAINERS" / "TOP 15 LOSERS" rank the whole scanned
        // pool by entry-day % change instead of showing every match — see
        // selectTopByChange above. Applied per entry date, so a date-range
        // scan shows each day's own top 15, not a cross-day aggregate.
        const topByChangeDirection =
          selectedKey === "top15gainers" ? "gainers" :
          selectedKey === "top15losers" ? "losers" :
          undefined;
        if (dateMode === "single") {
          const result = await runCategoryScan(
            selectedKey,
            entryDate,
            source,
            passesPattern,
            (done, total, symbol) => setProgress({ done, total, symbol })
          );
          const withDate = result.map((r) => ({ ...r, entryDate }));
          setCategoryRows(
            topByChangeDirection ? selectTopByChange(withDate, topByChangeDirection) : withDate
          );
        } else {
          const dates = enumerateDatesUTC(fromDate, toDate);
          const allRows: (CategoryScanRow & { entryDate: string })[] = [];
          for (let i = 0; i < dates.length; i++) {
            const d = dates[i];
            setDateProgress({ current: i + 1, total: dates.length, date: d });
            const dayResult = await runCategoryScan(
              selectedKey,
              d,
              source,
              passesPattern,
              (done, total, symbol) => setProgress({ done, total, symbol })
            );
            const withDate = dayResult.map((r) => ({ ...r, entryDate: d }));
            allRows.push(
              ...(topByChangeDirection ? selectTopByChange(withDate, topByChangeDirection) : withDate)
            );
          }
          setCategoryRows(allRows);
        }
      } else if (isPatternOnly && activePatternInfo) {
        // CHANGED: Pattern selections now grade against today's R4 / U4
        // (bullish) — see runPivotLevelBacktest — so results land in
        // `rows` (BacktestRow[]) and render via the same Result/Hit
        // Date/Change table as a View backtest, not `categoryRows`.
        if (dateMode === "single") {
          const result = await runPivotLevelBacktest(
            activePatternInfo.category.key,
            activePatternInfo.sub.key,
            entryDate,
            source,
            passesPattern,
            matchesPatternFlag,
            (done, total, symbol) => setProgress({ done, total, symbol })
          );
          setRows(result);
        } else {
          const dates = enumerateDatesUTC(fromDate, toDate);
          const allRows: BacktestRow[] = [];
          for (let i = 0; i < dates.length; i++) {
            const d = dates[i];
            setDateProgress({ current: i + 1, total: dates.length, date: d });
            const dayResult = await runPivotLevelBacktest(
              activePatternInfo.category.key,
              activePatternInfo.sub.key,
              d,
              source,
              passesPattern,
              matchesPatternFlag,
              (done, total, symbol) => setProgress({ done, total, symbol })
            );
            allRows.push(...dayResult);
          }
          setRows(allRows);
        }
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
  // NEW: rows where the pattern matched but its target level came back
  // non-finite (see backtest.ts's "invalid-target" fix) — excluded from
  // gradedCount same as insufficient-data, since neither is a real pass/fail.
  const invalidTargetCount = rows.filter((r) => r.result === "invalid-target").length;
  const gradedCount = rows.length - insufficientCount - invalidTargetCount;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

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
        Pick a date (or a date range) and either a category, a Pattern
         nested under a category, a Subpattern nested under a Pattern, or a
         specific View.
        Category and Pattern/Subpattern selections give a symbol list only,
        with an optional date-range sweep; a View gives the full
        Target/Result/Hit Date backtest, also with an optional date-range
        sweep. This reconstructs the CPR that would have been active on
        that date (same candle logic as the live scanner).
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div ref={pickerRef} className="relative">
          <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
             Category / Pattern / Subpattern / View
          </label>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground flex items-center gap-2 min-w-[240px] justify-between"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
          </button>

          {pickerOpen && (
            <div
              role="listbox"
              className="absolute z-20 mt-1 w-[340px] max-h-[380px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
            >
              <div className="sticky top-0 z-10 bg-popover border-b border-border p-2">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/40">
                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input
                    autoFocus
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                     placeholder="Search categories, patterns, subpatterns, Views…"
                    className="bg-transparent text-xs outline-none w-full text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div className="py-1 px-1">
                {(() => {
                  const q = pickerQuery.trim().toLowerCase();
                  const hit = (s: string) => s.toLowerCase().includes(q);
                  const blocks = categoryTree
                    .map(({ cat, directPatterns, subCats }) => {
                      const catLabelHit = hit(cat.label);
                      const directHits = directPatterns.filter((t) => !q || catLabelHit || hit(t.label));
                      const patternSelectionKey = (path: BacktestSubCategoryDef[]) =>
                        [cat.key, ...path.map((p) => p.key)].join(SUBCATEGORY_SEP);
                      const patternIsVisible = (node: ResolvedSub): boolean =>
                        !q ||
                        catLabelHit ||
                        hit(node.sub.label) ||
                        node.Views.some((t) => hit(t.label)) ||
                        node.children.some(patternIsVisible);

                      const viewButton = (t: BacktestTargetDef) => (
                        <button
                          key={t.key}
                          type="button"
                          role="option"
                          aria-selected={selectedKey === t.key}
                          onClick={() => selectAndClose(t.key, cat.key)}
                          className={`w-full flex items-center gap-2 text-left px-2 py-1 rounded-md text-xs font-mono truncate ${
                            selectedKey === t.key ? "bg-blue-500/20 text-blue-300" : "text-foreground/80 hover:bg-muted/40"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                          <span className="truncate">{t.label}</span>
                        </button>
                      );

                      const renderPattern = (node: ResolvedSub) => {
                        if (!patternIsVisible(node)) return null;
                        const nodeLabelHit = hit(node.sub.label);
                        const visibleViews = node.Views.filter(
                          (t) => !q || catLabelHit || nodeLabelHit || hit(t.label)
                        );
                        const visibleChildren = node.children.filter(patternIsVisible);
                        const value = patternSelectionKey(node.path);
                        return (
                          <div key={value}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={selectedKey === value}
                              onClick={() => selectAndClose(value, cat.key)}
                              className={`w-full flex items-center gap-1.5 text-left px-2 py-1 rounded-md text-xs truncate ${
                                selectedKey === value ? "bg-blue-500/20 text-blue-300" : "text-foreground/90 hover:bg-muted/40"
                              }`}
                            >
                              <span className="text-muted-foreground shrink-0">{"\u21B3"}</span>
                              <span className="truncate">{node.sub.label}</span>
                            </button>
                            {(visibleChildren.length > 0 || visibleViews.length > 0) && (
                              <div className="ml-3 pl-2 border-l border-border/60 mt-0.5 space-y-0.5">
                                {visibleChildren.map((child) => renderPattern(child))}
                                {visibleViews.map(viewButton)}
                              </div>
                            )}
                          </div>
                        );
                      };

                      const visiblePatterns = subCats.filter(patternIsVisible);
                      const visible = !q || catLabelHit || directHits.length > 0 || visiblePatterns.length > 0;
                      if (!visible) return null;
                      const isExpanded = !!q || expandedCats.has(cat.key);

                      return (
                        <div key={cat.key} className="mb-0.5">
                          <div className="flex items-center">
                            {!q && (
                              <button
                                type="button"
                                onClick={() => toggleCat(cat.key)}
                                aria-label={isExpanded ? "Collapse group" : "Expand group"}
                                className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                              >
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                              </button>
                            )}
                            <button
                              type="button"
                              role="option"
                              aria-selected={selectedKey === cat.key}
                              onClick={() => selectAndClose(cat.key, cat.key)}
                              className={`flex-1 text-left px-2 py-1.5 rounded-md text-xs font-medium tracking-wide truncate ${
                                selectedKey === cat.key
                                  ? "bg-blue-500/20 text-blue-300"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                              } ${q ? "ml-1" : ""}`}
                            >
                              {cat.label}
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="ml-3 pl-2 border-l border-border/60 mt-0.5 space-y-0.5">
                              {directHits.map(viewButton)}
                              {visiblePatterns.map((pattern) => renderPattern(pattern))}
                            </div>
                          )}
                        </div>
                      );
                    })
                    .filter((b): b is NonNullable<typeof b> => b !== null);

                  if (q && blocks.length === 0) {
                    return <div className="px-3 py-6 text-xs text-center text-muted-foreground">No matches for &quot;{pickerQuery}&quot;</div>;
                  }
                  return blocks;
                })()}
              </div>
            </div>
          )}
        </div>
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

        {dateMode === "single" ? (
          <DateField
            label="Entry Date (UTC)"
            value={entryDate}
            onChange={setEntryDate}
            max={new Date().toISOString().slice(0, 10)}
          />
        ) : (
          <>
            <DateField label="From Date (UTC)" value={fromDate} onChange={setFromDate} max={toDate} />
            <DateField
              label="To Date (UTC)"
              value={toDate}
              onChange={setToDate}
              min={fromDate}
              max={new Date().toISOString().slice(0, 10)}
            />
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

      {isViewOnly && activeTarget && (
        <div className="text-xs text-muted-foreground mb-3">
          Target: <span className="text-foreground font-medium">{activeTarget.targetLabel}</span>{" "}
          ({activeTarget.direction === "bullish" ? "price must reach or exceed it" : "price must reach or fall below it"})
        </div>
      )}
      {isCategory && activeCategory && (
        <div className="text-xs text-muted-foreground mb-3">
          Category scan — lists every symbol matching{" "}
          <span className="text-foreground font-medium">{activeCategory.label}</span>&apos;s base
          condition on {dateMode === "range" ? "each date in the range" : "the entry date"}. No
          Target/Result/Hit Date (select one of its sub-patterns or Pattern sub-categories above
          for those).
        </div>
      )}
      {isPatternOnly && activePatternInfo && (
        <div className="text-xs text-muted-foreground mb-3">
          Target: <span className="text-foreground font-medium">
            {activePatternTarget?.targetLabel ?? "U4 (today's R4)"}
          </span>{" "}
          (price must {activePatternTarget?.direction === "bearish" ? "reach or fall below it" : "reach or exceed it"}) — every symbol matching{" "}
          <span className="text-foreground font-medium">{activePatternInfo.category.label}</span>&apos;s
          base condition AND Pattern{" "}
          <span className="text-foreground font-medium">
            {activePatternInfo.path.map((p) => p.label).join(" → ")}
          </span>{" "}
          on{" "}
          {dateMode === "range" ? "each date in the range" : "the entry date"} is graded against it.
        </div>
      )}

      {status === "running" && (
        <div className="mb-4 rounded-lg border border-border bg-background/50 p-3">
          {dateMode === "range" && dateProgress.total > 0 && (
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

      {/* Category scan results — symbol list + CPR data + entry-day
          Close price and % Change (green when >= 0, red when < 0). Shown
          whenever a category's "— all (symbol list only)" selection is
          run. CHANGED: Pattern selections no longer render here — they're
          graded backtests now (see the Pattern backtest results block
          below), same as a View. */}
      {status === "done" && isCategory && (
        <>
          <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
            <span className="text-muted-foreground">
              {dateMode === "range"
                ? `${categoryRows.length} symbols matched ${symbolListLabel} across ${enumerateDatesUTC(fromDate, toDate).length} days (${fromDate} to ${toDate})`
                : `${categoryRows.length} symbols matched ${symbolListLabel} on ${entryDate}`}
            </span>
          </div>

          {categoryRows.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              {dateMode === "range"
                ? `No symbols matched ${symbolListLabel} between ${fromDate} and ${toDate}.`
                : `No symbols matched ${symbolListLabel} on ${entryDate}.`}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-2 py-2 w-20 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-2 py-3 w-32 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      LEVEL
                    </th>
                    <th className="pl-8 pr-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      GAP
                    </th>
                    <th className="px-2 py-3 w-32 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Pattern
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[220px]">
                      <span className="inline-flex items-center gap-1">
                        Pivot Size <PivotSizeInfo />
                      </span>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Entry Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() =>
                          setChangeSortDir((d) =>
                            d === null ? "desc" : d === "desc" ? "asc" : null
                          )
                        }
                        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors"
                        title="Sort by Change"
                      >
                        Change
                        <span className="text-[10px]">
                          {changeSortDir === "asc" ? "▲" : changeSortDir === "desc" ? "▼" : "↕"}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(changeSortDir === null
                    ? categoryRows
                    : [...categoryRows].sort((a, b) => {
                        const av = a.changePct;
                        const bv = b.changePct;
                        const aNull = av === null || av === undefined;
                        const bNull = bv === null || bv === undefined;
                        if (aNull && bNull) return 0;
                        if (aNull) return 1;
                        if (bNull) return -1;
                        return changeSortDir === "asc" ? av - bv : bv - av;
                      })
                  ).map((r) => {
                    const chg = r.changePct;
                    const chgColor =
                      chg === null || chg === undefined
                        ? "text-muted-foreground"
                        : chg >= 0
                        ? "text-green-400"
                        : "text-destructive";
                    // Close price colored by the same day-over-day sign as % change.
                    const closeColor = chgColor;
                    return (
                      <Fragment key={`${r.source}-${r.symbol}-${r.entryDate}`}>
                      <tr className="hover:bg-muted/20">
                        <td
                          className="px-2 py-2 w-20 font-mono font-semibold cursor-pointer select-none"
                          onClick={() => toggleExpand(`${r.source}-${r.symbol}-${r.entryDate}`)}
                          title="Click to expand ADK S/R ladder"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground text-xs">
                              {expandedSymbols.has(`${r.source}-${r.symbol}-${r.entryDate}`) ? "▼" : "▶"}
                            </span>
                            <div className="min-w-0 flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate">{r.symbol}</span>
                                <span onClick={(e) => e.stopPropagation()}>
                                  <ChartLink symbol={r.symbol} source={r.source} />
                                </span>
                              </div>
                              <span className={`font-mono text-[11px] font-medium ${closeColor}`}>
                                {r.closePrice !== null && r.closePrice !== undefined ? fmt(r.closePrice) : "—"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 w-32">
                          {renderLevelColumnRestBadges(r.raw)}
                        </td>
                        <td className="pl-8 pr-4 py-3 whitespace-nowrap text-xs font-medium">
                          {renderGapColumnBadges(r.raw)}
                        </td>
                        <td className="px-2 py-3 w-32">
                          {renderPatternColumnBadges(r.raw) ?? (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          {renderPivotSizeCell(r.prevCPR, r.todayCPR, r.compressionRatio)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {formatDisplay(r.entryDate)}
                        </td>
                        <td className={`px-3 py-2 font-mono text-sm font-medium ${chgColor}`}>
                          {chg !== null && chg !== undefined
                            ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`
                            : "—"}
                        </td>
                      </tr>
                      {expandedSymbols.has(`${r.source}-${r.symbol}-${r.entryDate}`) && (
                        <SRLadderRow
                          r={toSRLadderData(r.raw, r.closePrice ?? undefined)}
                          rowKey={`${r.source}-${r.symbol}-${r.entryDate}`}
                          colSpan={7}
                          todayPatternBadge={renderTodayPatternBadges(r.raw)}
                          prevPatternBadge={renderPrevPatternBadge(r.raw)}
                        />
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Pattern backtest results — symbol list + Target/Result/Hit Date.
          CHANGED: also shown for isPatternOnly ("-R4" Pattern selections),
          which now grade identically to a View backtest — same columns
          (Symbol/LEVEL/GAP/Pattern/Pivot Size/Entry Date/Result/Hit
          Date/Change). */}
      {status === "done" && (isViewOnly || isPatternOnly) && (
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
                {invalidTargetCount > 0 && (
                  <span className="text-amber-400">{invalidTargetCount} no target</span>
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
                    <th className="px-2 py-3 w-32 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      LEVEL
                    </th>
                    <th className="pl-8 pr-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      GAP
                    </th>
                    <th className="px-2 py-3 w-32 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Pattern
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[220px]">
                      <span className="inline-flex items-center gap-1">
                        Pivot Size <PivotSizeInfo />
                      </span>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Entry Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Result
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Hit Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() =>
                          setResultChangeSortDir((d) =>
                            d === null ? "desc" : d === "desc" ? "asc" : null
                          )
                        }
                        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors"
                        title="Sort by Change"
                      >
                        Change
                        <span className="text-[10px]">
                          {resultChangeSortDir === "asc" ? "▲" : resultChangeSortDir === "desc" ? "▼" : "↕"}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(resultChangeSortDir === null
                    ? rows
                    : [...rows].sort((a, b) => {
                        const av = a.changePct;
                        const bv = b.changePct;
                        const aNull = av === null || av === undefined;
                        const bNull = bv === null || bv === undefined;
                        if (aNull && bNull) return 0;
                        if (aNull) return 1;
                        if (bNull) return -1;
                        return resultChangeSortDir === "asc" ? av - bv : bv - av;
                      })
                  ).map((r) => (
                    <Fragment key={`${r.source}-${r.symbol}-${r.entryDate}`}>
                    <tr className="hover:bg-muted/20">
                      <td
                        className="px-3 py-2 font-mono font-semibold cursor-pointer select-none"
                        onClick={() => toggleExpand(`${r.source}-${r.symbol}-${r.entryDate}`)}
                        title="Click to expand ADK S/R ladder"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground text-xs">
                            {expandedSymbols.has(`${r.source}-${r.symbol}-${r.entryDate}`) ? "▼" : "▶"}
                          </span>
                          <div className="min-w-0 flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{r.symbol}</span>
                              <span onClick={(e) => e.stopPropagation()}>
                                <ChartLink symbol={r.symbol} source={r.source} />
                              </span>
                            </div>
                            {(() => {
                              const chg = r.changePct;
                              const closeColor =
                                chg === null || chg === undefined
                                  ? "text-muted-foreground"
                                  : chg >= 0
                                  ? "text-green-400"
                                  : "text-destructive";
                              return (
                                <span className={`font-mono text-[11px] font-medium ${closeColor}`}>
                                  {r.closePrice !== null && r.closePrice !== undefined ? fmt(r.closePrice) : "—"}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 w-32">
                        {renderLevelColumnRestBadges(r.raw)}
                      </td>
                      <td className="pl-8 pr-4 py-3 whitespace-nowrap text-xs font-medium">
                        {renderGapColumnBadges(r.raw)}
                      </td>
                      <td className="px-2 py-3 w-32">
                        {renderPatternColumnBadges(r.raw) ?? (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                        {renderPivotSizeCell(r.prevCPR, r.todayCPR, r.compressionRatio)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{formatDisplay(r.entryDate)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-start gap-0.5">
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
                          {r.result === "invalid-target" && (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-400"
                              title="Pattern matched, but its target level couldn't be computed for this date — not a real pass or fail."
                            >
                              <AlertCircle className="w-3.5 h-3.5" /> No target
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-muted-foreground">
                            Target: {fmt(r.targetLevel)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {r.hitDate ? (
                          <div className="flex flex-col leading-tight">
                            <span>{formatDisplay(r.hitDate)}</span>
                            <span className="text-[11px] text-muted-foreground/70">
                              {r.daysToHit === 0 ? "(entry day)" : "(next day)"}
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-medium">
                        {(() => {
                          const chg = r.changePct;
                          const chgColor =
                            chg === null || chg === undefined
                              ? "text-muted-foreground"
                              : chg >= 0
                              ? "text-green-400"
                              : "text-destructive";
                          return (
                            <span className={chgColor}>
                              {chg === null || chg === undefined ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                    {expandedSymbols.has(`${r.source}-${r.symbol}-${r.entryDate}`) && (
                      <SRLadderRow
                        r={toSRLadderData(r.raw, r.closePrice ?? undefined)}
                        rowKey={`${r.source}-${r.symbol}-${r.entryDate}`}
                        colSpan={9}
                        todayPatternBadge={renderTodayPatternBadges(r.raw)}
                        prevPatternBadge={renderPrevPatternBadge(r.raw)}
                      />
                    )}
                    </Fragment>
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
