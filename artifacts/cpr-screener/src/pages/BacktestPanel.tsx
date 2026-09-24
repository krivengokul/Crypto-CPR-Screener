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
  Camera,
  FlaskConical,
} from "lucide-react";
import {
  runBacktest,
  runCategoryScan,
  runPivotLevelBacktest,
  copyBacktestView,
  createBacktestView,
  editBacktestView,
  deriveLevelCheckDefs,
  levelCheckFullyMatches,
  findTightestAdjacentBand,
  getAttachPointOptions,
  findContainingNodeKey,
  selectTopByChange,
  type BacktestRow,
  type CategoryScanRow,
  type BacktestSource,
  type AttachPointOption,
} from "@/lib/backtest";
import {
  buildViewTree,
  childrenOf,
  getView,
  passesView,
  topLevelCategoryOf,
  VIEWS,
  ALL_GAP_BADGES,
  computeGapBadge,
  type ViewTreeNode,
  type ViewDef,
} from "@/lib/views";
import {
  passesPattern,
  matchesPatternFlag,
  fmt,
  getChartUrl,
  hasKnownChartMapping,
  getWidthCategory,
  renderGapColumnBadges,
  renderPivotSizeCell,
  renderSSLLCategoryBadge,
  renderHHLLCategoryBadge,
  renderSSRRCategoryBadge,
  renderRRHHCategoryBadge,
  normalizeViewDirection,
} from "./ScreenerUtils";
import {
  renderTodayPatternBadges,
  renderPrevPatternBadge,
  renderPatternColumnBadges,
  renderPivotPatternBadge,
  renderLevelColumnRestBadges,
} from "./ScreenerTableRow";
import { SRLadderRow, toSRLadderData, type ViewDirection } from "./SRLadderPanel";
import { getLadderMatchSummary, LEVEL_KEYS, type LevelCheckCondition, type LevelKey } from "./SRLadderDiff";
import { useChartLinks, findChartLink, preloadChartLinks, type StoredChartLink } from "@/lib/chartLinks";
import { isExpandedPatternPair, type CPRLevels, type CPRResult } from "@/lib/cpr";

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

// NOTE: the "TOP 15 GAINERS" / "TOP 15 LOSERS" ranking helper
// (selectTopByChange) now lives in lib/backtest.ts so Pattern Stats' census
// ranks them with the exact same rule. See its doc comment there.
function formatDisplay(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Return true when viewKey is nested under ancestorKey in the View tree. */
function isViewDescendant(viewKey: string, ancestorKey: string): boolean {
  const seen = new Set<string>();
  let current = getView(viewKey);
  while (current?.parentKey && !seen.has(current.key)) {
    if (current.parentKey === ancestorKey) return true;
    seen.add(current.key);
    current = getView(current.parentKey);
  }
  return false;
}

/**
 * Match the first concrete View under the currently selected Backtest node.
 * Scoping to the selected category/pattern avoids showing unrelated raw flag
 * names when a row happens to satisfy more than one View globally. Direction
 * is normalized via ScreenerUtils.tsx's own normalizeViewDirection — same
 * Up/Down source the Screener's VIEW column already colors by
 * (getActiveViewLabels/renderActiveViewLabels in ScreenerUtils.tsx /
 * ScreenerTableRow.tsx) — rather than re-deriving Up/Down here.
 */
function matchingViewDef(raw: CPRResult, selectedKey: string): ViewDef | null {
  const selected = getView(selectedKey);
  if (!selected) return null;

  return VIEWS
    .filter((view) =>
      view.kind === "view" &&
      (view.key === selectedKey || isViewDescendant(view.key, selectedKey))
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .find((view) => {
      // Backtest rows have already passed the selected category/subpattern.
      // Evaluate the child View's own predicate directly so a legacy View
      // whose parent metadata is incomplete cannot disappear from this column.
      const ownConditionMatches = view.condition ? view.condition(raw) : false;
      const patternMatches = ownConditionMatches || passesView(raw, view.key);
      if (!patternMatches) return false;
      // Same two-step grading as runBacktest: after the base pattern
      // condition, a View with levelCheckDefs also requires its full
      // 13/13 Level Check signature. Without this, a Copy View (whose
      // conditionKey just redirects to its parent pattern) matched every
      // row under that pattern and its name showed on all of them.
      return levelCheckFullyMatches(raw, view.levelCheckDefs);
    }) ?? null;
}

/**
 * Walk the View tree DOWN from `rootKey` (the Category/Pattern/Subpattern
 * currently selected in the picker) to the deepest Pattern/Subpattern that
 * still matches this specific row — e.g. rootKey "insidecpr" (INCPR) with a
 * row that's also B-A-C-C / U4L4 resolves to "INCPR-B-A-C-C-U4L4", not
 * "insidecpr" itself. Without this, "Create View" opened from a row always
 * attached to whatever coarse node happened to be selected, producing a
 * View key like "TC-insidecpr-...-R4" instead of
 * "TC-INCPR-B-A-C-C-U4L4-...-R4", and left the attach-point dropdown
 * pointing at that same coarse node instead of the row's real subpattern.
 * Assumes rootKey itself already matches raw (true for any row visible
 * under a Pattern-scoped selection) — only descends into finer matches,
 * never validates rootKey itself, and stops at the first level with no
 * matching child (kind: "view" leaves are never descended into here).
 */
function deepestMatchingPattern(raw: CPRResult, rootKey: string): ViewDef {
  let current = getView(rootKey);
  if (!current) throw new Error(`deepestMatchingPattern: unknown key "${rootKey}"`);
  for (;;) {
    const child = childrenOf(current.key).find(
      (c) => c.kind !== "view" && passesView(raw, c.key)
    );
    if (!child) return current;
    current = child;
  }
}

function matchingView(raw: CPRResult, selectedKey: string): { label: string; key: string; direction: ViewDirection | null } | null {
  const match = matchingViewDef(raw, selectedKey);
  if (!match) return null;
  return {
    label: match.label,
    key: match.key,
    direction: normalizeViewDirection(match.direction as string | undefined),
  };
}

/**
 * "View" column cell — matched View name colored by direction: green for
 * Up, rose for Down, plain text when the matched View has no direction set
 * (or no View matches at all, rendered as the usual muted em dash). Directly
 * under the View name, its Viewcode (match.key) is shown as a second,
 * quieter line — same font-mono text-xs text-muted-foreground styling as
 * the Viewcode line under the Screener's own VIEW column
 * (renderActiveViewLabels in ScreenerTableRow.tsx) and under the expanded
 * row's "Levels VIEW" ladder (SRLadderPanel.tsx), so the same identifier
 * reads the same way everywhere it appears.
 */
function renderMatchingViewName(raw: CPRResult, selectedKey: string) {
  const match = matchingView(raw, selectedKey);
  if (!match) return <span className="text-muted-foreground">—</span>;
  const colorClass =
    match.direction === "Up" ? "text-green-400" : match.direction === "Down" ? "text-rose-400" : undefined;
  return (
    <div className="flex flex-col gap-0">
      <span className={colorClass}>{match.label}</span>
      <span className="truncate font-mono text-xs text-muted-foreground" title={match.key}>
        {match.key}
      </span>
    </div>
  );
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
 * NEW: "Copy View" — clones the current View's BacktestTargetDef
 * (including its levelCheckDefs) under a new key/label via
 * lib/backtest.ts's copyBacktestView, and drops it into the same spot in
 * the Backtest dropdown as the source. Collapsed to a single small
 * button by default; clicking it reveals the key/label fields inline
 * (no modal — matches this panel's existing inline-popover conventions,
 * e.g. DateField/PivotSizeInfo above) rather than opening automatically,
 * since it's an occasional action, not something to surface unprompted
 * on every expanded row.
 */
/**
 * Derives a fresh set of Level Check conditions for a specific symbol,
 * from a source View's existing levelCheckDefs (see LevelCheckCondition
 * in SRLadderDiff.tsx — {key, subject, bandKeys}).
 *
 * The source View's `key`/`subject` per condition are kept as-is — they
 * encode the View's actual intent (e.g. "today's TC checked against a
 * band drawn from yesterday's structure"), not something derived from
 * any one symbol's numbers. What gets recomputed is `bandKeys`: for this
 * symbol's real prevCPR/todayCPR, find which two levels (on the day
 * `subject` is NOT) genuinely bracket the subject's value, using the
 * same equality-aware lookup as Backtest, so the
 * new condition evaluates true for the symbol the copy was made from —
 * the same "13/13 matching" signature this symbol showed when you
 * expanded its row, just re-expressed as portable {key, subject,
 * bandKeys} data instead of pinned to this one day's literal numbers.
 *
 * There's no generic/fallback bracket: a symbol only reaches this flow
 * by already having passed the View's underlying pattern condition, and
 * `subject` was chosen by the View's author specifically so a valid
 * bracket always exists for a symbol satisfying that condition. If one
 * genuinely can't be found, that's a real inconsistency worth surfacing
 * loudly rather than papering over with a wrong condition — so this
 * throws instead of guessing.
 */
/**
 * Derives a fresh set of Level Check conditions for a specific symbol.
 *
 * With sourceConditions (the source View already has levelCheckDefs):
 * `key`/`subject` per condition are kept as-is — they encode the View's
 * actual intent (e.g. "today's TC checked against a band drawn from
 * yesterday's structure"), not something derived from any one symbol's
 * numbers. Only `bandKeys` gets recomputed, via the shared bracket lookup, so the new
 * condition evaluates true for the symbol the copy was made from.
 *
 * Without sourceConditions (the source View has none yet): there's no
 * existing `subject` to preserve, so one is chosen per key — try
 * "today" first (the more common convention: does today's level sit in
 * a band drawn from yesterday), falling back to "previous" if "today"
 * has no valid bracket for this symbol. Only if neither direction finds
 * one does this throw — genuinely unusual for a real market day, since
 * across the 13 candidate levels at least one bracket in one direction is
 * almost always findable.
 */
function deriveLevelCheckDefsForSymbol(
  sourceConditions: LevelCheckCondition[] | undefined,
  prevCPR: CPRLevels,
  todayCPR: CPRLevels
): LevelCheckCondition[] {
  if (sourceConditions && sourceConditions.length > 0) {
    return sourceConditions.map((cond) => {
      const subjectIsToday = cond.subject === "today";
      const subjectVal = (subjectIsToday ? todayCPR : prevCPR)[cond.key] as number;
      // The band always comes from the day `subject` is NOT — same
      // convention as compareSRLadders in SRLadderDiff.tsx.
      const bandCPR = subjectIsToday ? prevCPR : todayCPR;
      // The band is on the opposite day. Its same-named level is therefore
      // a distinct, valid candidate (for example today's S4 in EU2L4).
      const bandKeys = findTightestAdjacentBand(bandCPR, subjectVal);

      if (!bandKeys) {
        throw new Error(
          `Couldn't find a bracketing pair for "${cond.key}" (subject: ${cond.subject}) on this symbol — ` +
            `it may not actually satisfy this View's underlying pattern condition.`
        );
      }

      return { key: cond.key, subject: cond.subject, bandKeys };
    });
  }

  // Expanded pairs (EU2L4/EU3L4/EUTL3/EL2U4/...): today's structure expands on
  // prev's rather than sitting inside it. Grade all 13 ladder rungs uniformly
  // as 'did YESTERDAY's rung get absorbed into TODAY's new structure'
  // (subject: 'previous') instead of the mixed per-rung forward/reversed check.
  //
  // This branch intentionally comes after sourceConditions: an established
  // View's subject choices are part of that View's authored signature and
  // must be preserved when copying it. A View without levelCheckDefs gets
  // the expanded-pair signature here.
  if (isExpandedPatternPair(todayCPR, prevCPR)) {
    const derived: LevelCheckCondition[] = [];
    const skipped: LevelKey[] = [];

    for (const key of LEVEL_KEYS) {
      const prevVal = prevCPR[key] as number;
      const previousBracket = findTightestAdjacentBand(todayCPR, prevVal);
      if (previousBracket) {
        derived.push({ key, subject: "previous", bandKeys: previousBracket });
      } else {
        skipped.push(key);
      }
    }

    if (skipped.length > 0) {
      console.warn(
        `Level Check (expanded): no valid bracket for ${skipped.join(", ")} on this symbol with subject "previous" — ` +
          `derived ${derived.length}/${LEVEL_KEYS.length} conditions.`
      );
    }

    return derived;
  }

  // No source levelCheckDefs — build a from-scratch set over all 13
  // LEVEL_KEYS, picking whichever subject direction actually works.
  // Unlike the sourceConditions branch above, there's no prior
  // guarantee a bracket exists here (that guarantee comes from the
  // symbol already satisfying an established View's pattern condition —
  // there's no such View here yet). Extreme levels (r4, s4) are the most
  // likely to have no valid bracket in either direction on a given real
  // symbol/day. Rather than failing the whole copy over one such key,
  // skip it — the copy proceeds with whichever conditions could
  // genuinely be derived, same "report plainly, don't guess" spirit as
  // SRLadderDiffPanel's own "LevelCheck UnDefined" fallback.
  const derived: LevelCheckCondition[] = [];
  const skipped: LevelKey[] = [];

  for (const key of LEVEL_KEYS) {
    const todayBracket = findTightestAdjacentBand(prevCPR, todayCPR[key] as number);
    if (todayBracket) {
      derived.push({ key, subject: "today", bandKeys: todayBracket });
      continue;
    }

    const previousBracket = findTightestAdjacentBand(todayCPR, prevCPR[key] as number);
    if (previousBracket) {
      derived.push({ key, subject: "previous", bandKeys: previousBracket });
      continue;
    }

    skipped.push(key);
  }

  if (skipped.length > 0) {
    console.warn(
      `Level Check: no valid bracket for ${skipped.join(", ")} on this symbol in either direction — ` +
        `derived ${derived.length}/${LEVEL_KEYS.length} conditions.`
    );
  }

  return derived;
}

// Shared "attach under" dropdown for the Create/Copy View popovers.
// Renders every Category/Pattern/Subpattern node in BACKTEST_CATEGORIES
// (getAttachPointOptions — Views excluded, they're leaves) grouped by
// category via <optgroup>, with nested Patterns/Subpatterns indented
// beneath their category using the same "\u21B3" arrow treatment as the
// "Category / Pattern / Subpattern / View" picker above, so a person can
// file the new/copied View under any node in that same tree instead of
// the flat, unrelated Screener-sidebar bucket list this replaced.
function AttachPointSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const options = useMemo(() => getAttachPointOptions(), []);
  const byCategory = useMemo(() => {
    const map = new Map<string, AttachPointOption[]>();
    for (const opt of options) {
      const list = map.get(opt.categoryLabel) ?? [];
      list.push(opt);
      map.set(opt.categoryLabel, list);
    }
    return map;
  }, [options]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      title="Which Category, Pattern, or Subpattern this View should be nested under in the dropdown tree above — defaults to where it was created from."
      className="w-full bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
    >
      {[...byCategory.entries()].map(([categoryLabel, nodes]) => (
        <optgroup key={categoryLabel} label={categoryLabel}>
          {nodes.map((n) => (
            <option key={n.key} value={n.key}>
              {n.depth === 0 ? n.label : `${"\u2007\u2007".repeat(n.depth - 1)}\u21B3 ${n.label}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function CopyViewControl({
  sourceKey,
  sourceLabel,
  prevCPR,
  todayCPR,
  sourceConditions,
  initialOpen = false,
  onClose,
  onCopied,
}: {
  sourceKey: string;
  sourceLabel: string;
  prevCPR: CPRLevels;
  todayCPR: CPRLevels;
  sourceConditions?: LevelCheckCondition[];
  initialOpen?: boolean;
  onClose?: () => void;
  onCopied: (newKey: string) => void;
}) {
  const sourceView = getView(sourceKey);
  const initialDirection: "Up" | "Down" = sourceView?.direction === "Down" ? "Down" : "Up";
  const initialEntry = (() => {
    const raw = sourceView?.entryLabel?.split(" ")[0];
    return ENTRY_OPTIONS.includes(raw ?? "") ? raw! : initialDirection === "Down" ? "BC" : "TC";
  })();
  const initialTarget = (() => {
    const m = sourceView?.targetLabel?.match(/[RLS]\d/)?.[0];
    if (m) return m.startsWith("L") ? m.replace("L", "S") : m;
    return initialDirection === "Down" ? "S4" : "R4";
  })();
  const initialGapBadge = parseComposedViewKey(sourceKey).gapBadge ?? "";

  const [open, setOpen] = useState(initialOpen);
  const [direction, setDirection] = useState<"Up" | "Down">(initialDirection);
  const [entry, setEntry] = useState(initialEntry);
  const [target, setTarget] = useState(initialTarget);
  const [label, setLabel] = useState(sourceLabel);
  const [attachKey, setAttachKey] = useState(
    () => sourceView?.parentKey ?? findContainingNodeKey(sourceKey) ?? sourceKey
  );
  const [gapBadge, setGapBadge] = useState(initialGapBadge);
  const [error, setError] = useState("");
  const [command, setCommand] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [levelCheckNote, setLevelCheckNote] = useState<string | null>(null);

  // Copy uses the same composed, readonly View code as Create/Edit. The
  // source View's condition remains the grading condition; these controls
  // choose the copied View's recipe and where it is attached.
  const viewKey = useMemo(() => {
    const trimmedGapBadge = gapBadge.trim();
    return [entry, attachKey, trimmedGapBadge || undefined, target].filter(Boolean).join("-");
  }, [entry, attachKey, gapBadge, target]);

  function openForm() {
    setDirection(initialDirection);
    setEntry(initialEntry);
    setTarget(initialTarget);
    setLabel(sourceLabel);
    setAttachKey(sourceView?.parentKey ?? findContainingNodeKey(sourceKey) ?? sourceKey);
    setGapBadge(initialGapBadge);
    setError("");
    setCommand(null);
    setCreatedKey(null);
    setCopied(false);
    setLevelCheckNote(null);
    setOpen(true);
  }

  function confirm() {
    const trimmedLabel = label.trim() || viewKey;
    const trimmedGapBadge = gapBadge.trim();
    const q = (s: string) => '"' + s.replace(/"/g, "") + '"';

    let derived: LevelCheckCondition[];
    try {
      derived = deriveLevelCheckDefsForSymbol(sourceConditions, prevCPR, todayCPR);
      const expectedCount =
        sourceConditions && sourceConditions.length > 0 ? sourceConditions.length : LEVEL_KEYS.length;
      if (derived.length < expectedCount) {
        setLevelCheckNote(
          "Derived " + derived.length + "/" + expectedCount + " Level Check conditions — the rest had no valid bracket for this symbol."
        );
      } else {
        setLevelCheckNote(null);
      }

      // Clone first so the source View's condition is retained, then apply
      // the same direction/entry/target/gap recipe used by Edit View.
      const result = copyBacktestView(sourceKey, viewKey, trimmedLabel, attachKey, derived);
      if (!result.ok) {
        setError(
          result.reason === "duplicate-key"
            ? '"' + viewKey + '" already exists — change the Entry, Pattern, Gap Badge, or Target.'
            : result.reason === "source-not-found"
            ? "Couldn't find the source View."
            : "Couldn't copy this View."
        );
        return;
      }

      const adjusted = editBacktestView(
        viewKey,
        viewKey,
        trimmedLabel,
        direction,
        target,
        entry,
        attachKey,
        trimmedGapBadge,
        derived
      );
      if (!adjusted.ok) {
        setError("Couldn't apply the selected Copy View settings.");
        return;
      }

      setError("");
      const commandParts = [
        "gh workflow run copy-view.yml",
        "--repo krivengokul/Crypto-CPR-Screener",
        "-f sourceKey=" + q(sourceKey),
        "-f newKey=" + q(viewKey),
        "-f newLabel=" + q(trimmedLabel),
        "-f direction=" + q(direction),
        "-f entry=" + q(entry),
        "-f target=" + q(target),
        "-f attachKey=" + q(attachKey),
        ...(trimmedGapBadge ? ["-f gapBadge=" + q(trimmedGapBadge)] : []),
        "-f levelCheckDefs=" + btoa(
          Array.from(new TextEncoder().encode(JSON.stringify(derived)), (b) => String.fromCharCode(b)).join("")
        ),
      ];
      setCommand(commandParts.join(" "));
      setCreatedKey(viewKey);
    } catch (err) {
      setError(
        err instanceof Error
          ? "Couldn't derive Level Check conditions for this symbol: " + err.message
          : "Couldn't derive Level Check conditions for this symbol."
      );
    }
  }

  async function copyCommand() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The command remains visible and selectable if clipboard access fails.
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="w-fit rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        title={'Duplicate "' + sourceLabel + '" with editable View settings'}
      >
        + Copy View
      </button>
    );
  }

  return (
    <div className="flex w-fit min-w-[300px] flex-col gap-1.5 rounded-md border border-border bg-popover p-2 text-left">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        COPY VIEW FROM &quot;{sourceLabel}&quot;
      </span>
      <span className="text-[10px] text-muted-foreground">
        Entry {entry} · Stoploss {direction === "Up" ? "S1" : "R1"} — Level Check for this View
      </span>
      <div className="flex gap-1.5">
        <select
          value={direction}
          onChange={(e) => {
            const next = e.target.value as "Up" | "Down";
            setDirection(next);
            setEntry(next === "Up" ? "TC" : "BC");
            setTarget(next === "Up" ? "R4" : "S4");
          }}
          disabled={!!command}
          className="flex-1 min-w-0 bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        >
          <option value="Up">Up</option>
          <option value="Down">Down</option>
        </select>
        <select
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          disabled={!!command}
          title="Which rung this copied View's entry reads off today's CPR."
          className="flex-1 min-w-0 bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        >
          {ENTRY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>Entry {opt}</option>
          ))}
        </select>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={!!command}
          className="flex-1 min-w-0 bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        >
          {(direction === "Up" ? ["R1", "R2", "R3", "R4"] : ["S1", "S2", "S3", "S4"]).map((t) => (
            <option key={t} value={t}>Target {t}</option>
          ))}
        </select>
      </div>
      <input
        value={viewKey}
        readOnly
        title="View code — generated from Entry, Pattern/Subpattern, Gap Badge, and Target. Change the dropdowns to make a unique code."
        className="w-full cursor-default bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] font-mono text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
      />
      {viewKey === sourceKey && (
        <span className="text-[10px] text-amber-400">
          This View code already exists. Change the Entry, Pattern/Subpattern, Gap Badge, or Target before copying.
        </span>
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="View name"
        disabled={!!command}
        title="User-friendly display name for this copied View."
        className="w-full bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
      />
      <AttachPointSelect value={attachKey} onChange={setAttachKey} disabled={!!command} />
      <select
        value={gapBadge}
        onChange={(e) => setGapBadge(e.target.value)}
        disabled={!!command}
        title="Optionally require this exact composite Gap Badge in the copied View."
        className="w-full bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
      >
        <option value="">Any Gap Badge</option>
        {ALL_GAP_BADGES.map((badge) => <option key={badge} value={badge}>{badge}</option>)}
      </select>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
      {levelCheckNote && <span className="text-[10px] text-amber-400">{levelCheckNote}</span>}
      {command && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">
            Copied in memory. Run this in a terminal with <code>gh</code> installed to save it for real:
          </span>
          <code className="w-full whitespace-pre-wrap break-all rounded-md bg-muted/40 px-2 py-1 text-[10px] text-foreground">{command}</code>
          <button
            type="button"
            onClick={copyCommand}
            className="self-end rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            {copied ? "Copied!" : "Copy command"}
          </button>
        </div>
      )}
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onClose?.();
            if (createdKey) onCopied(createdKey);
          }}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          {command ? "Done" : "Cancel"}
        </button>
        {!command && (
          <button
            type="button"
            onClick={confirm}
            className="rounded-md bg-cyan-500/20 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/30"
          >
            Copy View
          </button>
        )}
      </div>
    </div>
  );
}

function EditViewControl({
  activeTarget,
  prevCPR,
  todayCPR,
  initialOpen = false,
  onClose,
  onUpdated,
  onSaved,
}: {
  activeTarget: ViewDef;
  prevCPR: CPRLevels;
  todayCPR: CPRLevels;
  initialOpen?: boolean;
  onClose?: () => void;
  onUpdated?: (newKey: string) => void;
  onSaved?: (oldKey: string, updated: ViewDef) => void;
}) {
  // parseComposedViewKey is still used below, but only for a best-effort
  // guess at an already-applied Gap Badge (see gapBadge's useState) — see
  // its doc comment for why that one field stays a guess.
  const parsedKey = useMemo(() => parseComposedViewKey(activeTarget.key), [activeTarget.key]);
  // (patternKey removed — viewKey now derives from the attach-point
  // dropdown's value (attachKey) instead of conditionKey, so the key is
  // always a fresh composition of the selected dropdowns.)

  const [open, setOpen] = useState(initialOpen);
  const [direction, setDirection] = useState<"Up" | "Down">(activeTarget.direction ?? "Up");
  const [entry, setEntry] = useState(() => {
    const raw = activeTarget.entryLabel?.split(" ")[0];
    return ENTRY_OPTIONS.includes(raw ?? "") ? raw! : (activeTarget.direction === "Down" ? "BC" : "TC");
  });
  const [target, setTarget] = useState(() => {
    // The regex can only ever match an R/S rung directly (bullish
    // labels read "U1 (today's R1)") or an L-prefixed one that stands
    // in for the matching S rung (bearish labels read "L1 (today's
    // S1)", and "L…" sorts before "S…" in the string so it's what the
    // regex finds first) — never a literal "U…" match, since U isn't
    // in the character class.
    const m = activeTarget.targetLabel?.match(/[RLS]\d/)?.[0];
    if (m) return m.startsWith("L") ? m.replace("L", "S") : m;
    return activeTarget.direction === "Down" ? "S4" : "R4";
  });
  const [label, setLabel] = useState(activeTarget.label);
  const [attachKey, setAttachKey] = useState(() => activeTarget.parentKey ?? findContainingNodeKey(activeTarget.key) ?? activeTarget.key);
  // Preselected to whatever Gap Badge this View's own key already
  // encodes (via parsedKey) — previously this always started at "Any
  // Gap Badge" regardless of the View's actual filter, which both
  // misrepresented the current View and, combined with the key
  // previously never changing, meant a Gap-Badge View's badge could
  // never be edited at all. This is still a string-parsed guess — there's
  // no field on ViewDef that stores the badge directly, since a Gap-Badge
  // View's filter only lives baked into its `condition` closure — and can
  // miss on a key that doesn't follow the usual convention, same as
  // patternKey used to; unlike patternKey, there's no closure-free way to
  // recover it, so a miss here just starts the dropdown at "Any Gap
  // Badge" rather than corrupting anything.
  const [gapBadge, setGapBadge] = useState(() => parsedKey.gapBadge ?? "");
  const [error, setError] = useState("");
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Set once handleSave succeeds, holding the (possibly renamed) key so
  // the "Done" button can pass it to onUpdated — see handleSave's note
  // on why onUpdated isn't called from there directly.
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Fully derived from the CURRENT dropdown selections — never pulled
  // from stored keys or conditionKey. Composes as
  // "{Entry}-{Pattern}[-{Gap Badge}]-{Target}" where "Pattern" is the
  // attach-point dropdown's value (attachKey), so the View Key always
  // reflects what's selected on-screen and old keys get renamed to
  // the new format on save.
  const viewKey = useMemo(() => {
    const trimmedGapBadge = gapBadge.trim();
    return [entry, attachKey, trimmedGapBadge || undefined, target].filter(Boolean).join("-");
  }, [entry, attachKey, gapBadge, target]);

  function openForm() {
    setDirection(activeTarget.direction ?? "Up");
    setEntry(() => {
      const raw = activeTarget.entryLabel?.split(" ")[0];
      return ENTRY_OPTIONS.includes(raw ?? "") ? raw! : (activeTarget.direction === "Down" ? "BC" : "TC");
    });
    setTarget(() => {
      const m = activeTarget.targetLabel?.match(/[RLS]\d/)?.[0];
      if (m) return m.startsWith("L") ? m.replace("L", "S") : m;
      return activeTarget.direction === "Down" ? "S4" : "R4";
    });
    setLabel(activeTarget.label);
    setAttachKey(activeTarget.parentKey ?? findContainingNodeKey(activeTarget.key) ?? activeTarget.key);
    setGapBadge(parsedKey.gapBadge ?? "");
    setError("");
    setCommand(null);
    setCopied(false);
    setSavedKey(null);
    setOpen(true);
  }

  function handleSave() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("View label cannot be empty.");
      return;
    }

    // Same derivation as CopyViewControl's confirm(): re-derive this
    // symbol's Level Check conditions from the View's existing defs —
    // falling back to a from-scratch set over all 13 LEVEL_KEYS when it
    // has none — so editBacktestView's levelCheckDefs parameter actually
    // receives a fresh value for this symbol instead of silently keeping
    // the old (possibly empty) ones. prevCPR/todayCPR are already in
    // scope via this control's own props.
    let derived: LevelCheckCondition[];
    try {
      derived = deriveLevelCheckDefsForSymbol(activeTarget.levelCheckDefs, prevCPR, todayCPR);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't derive Level Check conditions for this symbol: ${err.message}`
          : "Couldn't derive Level Check conditions for this symbol."
      );
      return;
    }

    const res = editBacktestView(
      activeTarget.key,
      viewKey,
      trimmedLabel,
      direction,
      target,
      entry,
      attachKey,
      gapBadge,
      derived
    );

    if (!res.ok) {
      setError(
        res.reason === "duplicate-key"
          ? `"${viewKey}" already exists — change the Entry, Gap Badge, or Target to make it unique.`
          : res.reason === "invalid-target"
          ? `"${target}" isn't a valid target for ${direction === "Up" ? "an Up" : "a Down"} View.`
          : res.reason === "invalid-gap-badge"
          ? `"${gapBadge.trim()}" isn't a known Gap Badge.`
          : res.reason === "invalid-entry"
          ? `"${entry}" isn't a valid Entry.`
          : "Couldn't find this View anymore — it may have been renamed or removed elsewhere."
      );
      return;
    }

    // Base64, not double-quoted JSON — same reasoning as CopyViewControl's
    // confirm(): the derived defs are JSON full of literal " characters,
    // which would collide with the double-quote wrapping used for the other
    // arguments. The workflow's patcher base64-decodes and JSON.parses it
    // back, so the persisted View keeps the same derived conditions the
    // in-memory editBacktestView call above just applied.
    const json = JSON.stringify(derived);
    const jsonBytes = new TextEncoder().encode(json);
    let binary = "";
    jsonBytes.forEach((b) => (binary += String.fromCharCode(b)));
    const b64 = btoa(binary);

    const q = (s: string) => `"${s.replace(/"/g, "")}"`;
    const cmd = `gh workflow run copy-view.yml --repo krivengokul/Crypto-CPR-Screener -f sourceKey=${q(activeTarget.key)} -f newKey=${q(viewKey)} -f newLabel=${q(trimmedLabel)} -f isEdit=true -f direction=${q(direction)} -f entry=${q(entry)} -f target=${q(target)} -f attachKey=${q(attachKey)}${gapBadge ? ` -f gapBadge=${q(gapBadge)}` : ""} -f levelCheckDefs=${b64}`;
    setCommand(cmd);
    // Deliberately NOT calling onUpdated here, same reasoning as
    // CreateViewControl/CopyViewControl's confirm(): onUpdated moves the
    // dropdown's selection to the (possibly renamed) new key, and this
    // control is only ever rendered because a condition matched the
    // CURRENTLY selected key — isViewOnly / activeTarget for the
    // ViewActionsRow case, isPatternOnly for the "Already in View" case.
    // editBacktestView above has already renamed the View in the live
    // VIEWS array, so switching selectedKey to it right now would flip
    // that condition on this same render pass — e.g. isPatternOnly goes
    // false the instant selectedKey stops matching the old breadcrumb —
    // unmounting this popover and losing the command before "Done" is
    // even clickable. Stash the key instead; onUpdated fires from Done.
    setSavedKey(viewKey);
    if (res.updated) onSaved?.(activeTarget.key, res.updated);
  }

  async function copyCommand() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // command remains visible
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="w-fit rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        title={`Edit View "${activeTarget.label}"`}
      >
        Edit View
      </button>
    );
  }

  return (
    <div className="flex w-fit min-w-[300px] flex-col gap-1.5 rounded-md border border-border bg-popover p-2 text-left">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        EDIT VIEW FOR &quot;{activeTarget.label}&quot;
      </span>
      <span className="text-[10px] text-muted-foreground">
        Entry {entry} · Stoploss {direction === "Up" ? "S1" : "R1"} — Level Check for this View
      </span>
      <div className="flex gap-1.5">
        <select
          value={direction}
          onChange={(e) => {
            const next = e.target.value as "Up" | "Down";
            setDirection(next);
            setEntry(next === "Up" ? "TC" : "BC");
            setTarget(next === "Up" ? "R4" : "S4");
          }}
          disabled={!!command}
          className="flex-1 min-w-0 bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        >
          <option value="Up">Up</option>
          <option value="Down">Down</option>
        </select>
        <select
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          disabled={!!command}
          title="Which rung this View's entry reads off today's CPR."
          className="flex-1 min-w-0 bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        >
          {ENTRY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              Entry {opt}
            </option>
          ))}
        </select>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={!!command}
          className="flex-1 min-w-0 bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        >
          {(direction === "Up" ? ["R1", "R2", "R3", "R4"] : ["S1", "S2", "S3", "S4"]).map((t) => (
            <option key={t} value={t}>
              Target {t}
            </option>
          ))}
        </select>
      </div>
      <input
        value={viewKey}
        readOnly
        title="View key — auto-generated from Entry, Pattern/Subpattern (this View's own grading key), Gap Badge (if any), and Target, same as Create View. Not editable directly; changing any of those above will rename/move this View to the new key when saved."
        className="w-full cursor-default bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] font-mono text-muted-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
      />
      {viewKey !== activeTarget.key && (
        <span className="text-[10px] text-amber-400">
          Renaming &quot;{activeTarget.key}&quot; → &quot;{viewKey}&quot; on save.
        </span>
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="View name"
        disabled={!!command}
        title="User-friendly display name for this View — shown in the dropdown tree, editable."
        className="w-full bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
      />
      <AttachPointSelect value={attachKey} onChange={setAttachKey} disabled={!!command} />
      <select
        value={gapBadge}
        onChange={(e) => setGapBadge(e.target.value)}
        disabled={!!command}
        title="Optionally also require this exact composite Gap Badge."
        className="w-full bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
      >
        <option value="">Any Gap Badge</option>
        {ALL_GAP_BADGES.map((badge) => (
          <option key={badge} value={badge}>
            {badge}
          </option>
        ))}
      </select>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
      {command && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">
            Updated in memory. Run this in a terminal with <code>gh</code> installed to save it:
          </span>
          <code className="w-full whitespace-pre-wrap break-all rounded-md bg-muted/40 px-2 py-1 text-[10px] text-foreground">
            {command}
          </code>
          <button
            type="button"
            onClick={copyCommand}
            className="self-end rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            {copied ? "Copied!" : "Copy command"}
          </button>
        </div>
      )}
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            // Switch the dropdown to the (possibly renamed) key now that
            // the person has had a chance to see/copy the command — not
            // before. See handleSave's note above.
            if (savedKey) onUpdated?.(savedKey);
            onClose?.();
          }}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          {command ? "Done" : "Cancel"}
        </button>
        {!command && (
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-cyan-500/20 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/30"
          >
            Save View
          </button>
        )}
      </div>
    </div>
  );
}

function ViewActionsRow({
  activeTarget,
  prevCPR,
  todayCPR,
  activeLevelCheckDefs,
  isFullMatch,
  onCopied,
  onUpdated,
  onSaved,
}: {
  activeTarget: ViewDef;
  prevCPR: CPRLevels;
  todayCPR: CPRLevels;
  activeLevelCheckDefs?: LevelCheckCondition[];
  isFullMatch?: boolean;
  onCopied: (newKey: string) => void;
  onUpdated?: (newKey: string) => void;
  onSaved?: (oldKey: string, updated: ViewDef) => void;
}) {
  const [mode, setMode] = useState<"none" | "edit" | "copy">("none");

  if (mode === "edit") {
    return (
      <EditViewControl
        activeTarget={activeTarget}
        prevCPR={prevCPR}
        todayCPR={todayCPR}
        initialOpen={true}
        onClose={() => setMode("none")}
        onUpdated={onUpdated}
        onSaved={onSaved}
      />
    );
  }

  if (mode === "copy") {
    return (
      <CopyViewControl
        sourceKey={activeTarget.key}
        sourceLabel={activeTarget.label}
        prevCPR={prevCPR}
        todayCPR={todayCPR}
        sourceConditions={activeLevelCheckDefs}
        initialOpen={true}
        onClose={() => setMode("none")}
        onCopied={(newKey) => {
          setMode("none");
          onCopied(newKey);
        }}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setMode("edit")}
        className="w-fit rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        title={`Edit View "${activeTarget.label}"`}
      >
        Edit View
      </button>
      <button
          type="button"
          onClick={() => setMode("copy")}
          className="w-fit rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          title={`Duplicate "${activeTarget.label}" (with its Level Check rules) as a new View`}
        >
          + Copy View
        </button>
      )}
    </div>
  );
}

function CreateViewControl({
  patternKey,
  patternLabel,
  prevCPR,
  todayCPR,
  existingGapBadge,
  onCreated,
  onCommandGenerated,
}: {
  patternKey: string;
  patternLabel: string;
  prevCPR: CPRLevels;
  todayCPR: CPRLevels;
  // The composite Gap Badge (views.ts's computeGapBadge) already computed
  // for the row "Create View" was opened from — same source as the badge
  // shown in that row's own Gap Badge column via renderGapColumnBadges.
  // Used to preselect the Gap Badge dropdown below, the same way attachKey
  // preselects to patternKey.
  existingGapBadge?: string;
  onCreated: (newKey: string) => void;
  // Fired the instant confirm() pushes the new ViewDef into the live
  // VIEWS array — i.e. as soon as the command below becomes visible —
  // NOT when "Done" is clicked. createBacktestView mutates VIEWS
  // synchronously (see its call in confirm() below), so any unrelated
  // re-render between now and "Done" would otherwise recompute
  // rowViewDefByRow (it depends on VIEWS.length), match this row against
  // the View that was just created FROM this row, and flip the parent's
  // ternary to "Already in View" — unmounting this popover and losing
  // the command before it's been copied. The parent uses this callback
  // to hold this row's slot open regardless of that match until Done.
  onCommandGenerated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState("");
  const [command, setCommand] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Which Category/Pattern/Subpattern node (from the same tree as the
  // "Category / Pattern / Subpattern / View" picker above) the new View
  // is nested under. Defaults to patternKey — the node "Create View" was
  // opened from — so leaving it untouched reproduces the original
  // behavior; picking a different node files the View there instead
  // while it still grades against patternKey's own condition.
  const [attachKey, setAttachKey] = useState(patternKey);
  // Stoploss always follows direction alone (Up: S1, Down: R1) — see
  // e.g. "7PM:MoMi-<L4:2AM" for a real Down TC/BC/R1 example. Entry is
  // independently selectable via the Entry dropdown below (defaults to
  // TC/BC for Up/Down, same as the original hardcoded behavior, but any
  // rung on the ladder can be picked).
  const [direction, setDirection] = useState<"Up" | "Down">("Up");
  const [entry, setEntry] = useState("TC");
  const [target, setTarget] = useState("R4");
  // Optional composite Gap Badge label (e.g. "RH-GapAB", "SL-GapBB" —
  // views.ts's ALL_GAP_BADGES) to additionally require on top of
  // patternKey's own condition. "" means no Gap Badge filter — the
  // original conditionKey-redirect behavior. Preselected to the row's own
  // existingGapBadge (same idea as attachKey defaulting to patternKey);
  // falls back to "" (Any Gap Badge) if that's somehow not a known badge.
  const [gapBadge, setGapBadge] = useState(
    existingGapBadge && ALL_GAP_BADGES.includes(existingGapBadge) ? existingGapBadge : ""
  );
  // Whether the person has typed into the View name box yet — until they
  // do, it tracks effectivePattern below so switching the attach point
  // off a TOP 15 bucket doesn't leave "top15gainers" sitting in the name
  // field. The View key is no longer a free-text field at all — see
  // viewKey below — so there's nothing to track "edited" for there.
  const [labelEdited, setLabelEdited] = useState(false);

  // The node this View is actually created FOR — normally the one
  // "Create View" was opened from, but for the TOP 15 buckets it follows
  // the attach dropdown's top-level Category instead (see the note
  // above). Everything downstream — the header, the default View name,
  // createBacktestView's conditionKey, the composed View key, and the
  // workflow command's patternKey — reads this, not patternKey.
  const effectivePattern = useMemo(() => {
    if (!SYMBOL_LIST_ONLY_CATEGORY_KEYS.has(patternKey)) {
      return { key: patternKey, label: patternLabel };
    }
    const cat = topLevelCategoryOf(attachKey);
    if (!cat || SYMBOL_LIST_ONLY_CATEGORY_KEYS.has(cat.key)) {
      return { key: patternKey, label: patternLabel };
    }
    return { key: cat.key, label: cat.label };
  }, [patternKey, patternLabel, attachKey]);

  // The View key is fully derived, not typed — "{Entry}-{Pattern key}
  // [-{Gap Badge}]-{Target}" (e.g. "R1-B-B-BB-BB-EL3U4-SL-GapBA-R4"),
  // omitting the Gap Badge segment entirely when none is selected. No
  // "edited" tracking needed since there's no free-text box to diverge
  // from it — it just recomputes whenever any of its ingredients change.
  const viewKey = useMemo(() => {
    const trimmedGapBadge = gapBadge.trim();
    return [entry, effectivePattern.key, trimmedGapBadge || undefined, target].filter(Boolean).join("-");
  }, [entry, effectivePattern.key, gapBadge, target]);

  useEffect(() => {
    if (!open || command) return;
    if (!labelEdited) setNewLabel(effectivePattern.label);
  }, [open, command, labelEdited, effectivePattern.label]);

  function openForm() {
    setAttachKey(patternKey);
    setDirection("Up");
    setEntry("TC");
    setTarget("R4");
    setGapBadge(existingGapBadge && ALL_GAP_BADGES.includes(existingGapBadge) ? existingGapBadge : "");
    setNewLabel(patternLabel);
    setLabelEdited(false);
    setError("");
    setCommand(null);
    setCreatedKey(null);
    setCopied(false);
    setOpen(true);
  }

  function confirm() {
    const trimmedLabel = newLabel.trim() || viewKey;

    // deriveLevelCheckDefs only reads r.todayCPR/r.prevCPR — the cast
    // below is safe even though this isn't a full CPRResult.
    const derived = deriveLevelCheckDefs({ prevCPR, todayCPR } as unknown as CPRResult);

    const trimmedGapBadge = gapBadge.trim();

    const result = createBacktestView(
      effectivePattern.key,
      viewKey,
      trimmedLabel,
      direction,
      target,
      derived,
      attachKey,
      trimmedGapBadge || undefined,
      entry
    );
    if (!result.ok) {
      setError(
        result.reason === "duplicate-key"
          ? `"${viewKey}" already exists — change the Entry, Gap Badge, or Target to make it unique.`
          : result.reason === "invalid-target"
          ? `"${target}" isn't a valid target for ${direction === "Up" ? "an Up" : "a Down"} View.`
          : result.reason === "invalid-gap-badge"
          ? `"${trimmedGapBadge}" isn't a known Gap Badge.`
          : result.reason === "invalid-entry"
          ? `"${entry}" isn't a valid Entry.`
          : "Couldn't find this Pattern/Subpattern in the dropdown tree."
      );
      return;
    }
    setError("");
    // Deliberately NOT calling onCreated here — same reason as
    // CopyViewControl.confirm(): switching the dropdown's selected View
    // changes activeTarget/activePatternTarget, which would unmount this
    // popover before the command below is even visible. onCreated fires
    // from the "Done" button instead.
    //
    // onCommandGenerated, however, fires right now — createBacktestView
    // above already pushed this View into the live VIEWS array, so the
    // "Already in View" check one render away is looking at a fait
    // accompli. This tells the parent to keep this row's CreateViewControl
    // mounted (instead of swapping in "Already in View") until Done.
    onCommandGenerated?.();

    // Same double-quote / base64 approach as CopyViewControl — see its
    // confirm() for why (cmd.exe doesn't treat single quotes as
    // delimiters; JSON's own " characters collide with double-quote
    // wrapping, so the payload goes through as base64 instead).
    const q = (s: string) => `"${s.replace(/"/g, "")}"`;
    const json = JSON.stringify(derived);
    const jsonBytes = new TextEncoder().encode(json);
    let binary = "";
    jsonBytes.forEach((b) => (binary += String.fromCharCode(b)));
    const b64 = btoa(binary);

    setCommand(
      `gh workflow run create-view.yml --repo krivengokul/Crypto-CPR-Screener -f patternKey=${q(effectivePattern.key)} -f newKey=${q(viewKey)} -f newLabel=${q(trimmedLabel)} -f direction=${q(direction)} -f entry=${q(entry)} -f target=${q(target)} -f attachKey=${q(attachKey)}${trimmedGapBadge ? ` -f gapBadge=${q(trimmedGapBadge)}` : ""} -f levelCheckDefs=${b64}`
    );
    setCreatedKey(viewKey);
  }

  async function copyCommand() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Command is still visible/selectable by hand if this fails.
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="w-fit rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        title={`Create a graded View for "${effectivePattern.label}" using this symbol`}
      >
        + Create View
      </button>
    );
  }

  return (
    <div className="flex w-fit min-w-[300px] flex-col gap-1.5 rounded-md border border-border bg-popover p-2">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        Create View for &quot;{effectivePattern.label}&quot;
      </span>
      <span className="text-[10px] text-muted-foreground">
        Entry {entry} · Stoploss {direction === "Up" ? "S1" : "R1"} — Level Check derived from this symbol
      </span>
      <div className="flex gap-1.5">
        <select
          value={direction}
          onChange={(e) => {
            const next = e.target.value as "Up" | "Down";
            setDirection(next);
            setEntry(next === "Up" ? "TC" : "BC");
            setTarget(next === "Up" ? "R4" : "S4");
          }}
          disabled={!!command}
          className="flex-1 min-w-0 bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        >
          <option value="Up">Up</option>
          <option value="Down">Down</option>
        </select>
        <select
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          disabled={!!command}
          title="Which rung this View's entry reads off today's CPR — sets the created View's getEntry."
          className="flex-1 min-w-0 bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        >
          {ENTRY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              Entry {opt}
            </option>
          ))}
        </select>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={!!command}
          className="flex-1 min-w-0 bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        >
          {(direction === "Up" ? ["R1", "R2", "R3", "R4"] : ["S1", "S2", "S3", "S4"]).map((t) => (
            <option key={t} value={t}>
              Target {t}
            </option>
          ))}
        </select>
      </div>
      <input
        value={viewKey}
        readOnly
        title="View key — auto-generated from Entry, Pattern/Subpattern, Gap Badge (if any), and Target. Not editable."
        className="w-full cursor-default bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] font-mono text-muted-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
      />
      <input
        value={newLabel}
        onChange={(e) => {
          setLabelEdited(true);
          setNewLabel(e.target.value);
        }}
        placeholder="View name"
        disabled={!!command}
        title="User-friendly display name for this View — shown in the dropdown tree, editable."
        className="w-full bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
      />
      <AttachPointSelect value={attachKey} onChange={setAttachKey} disabled={!!command} />
      <select
        value={gapBadge}
        onChange={(e) => setGapBadge(e.target.value)}
        disabled={!!command}
        title="Optionally also require this exact composite Gap Badge (RRSSGapCategory + PDHPDLGapCategory + HL-switch), on top of the Pattern's own condition — same label shown in the Pattern column's Gap Badge (e.g. RH-GapAB, SL-GapBB)."
        className="w-full bg-background border border-cyan-500/40 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
      >
        <option value="">Any Gap Badge</option>
        {ALL_GAP_BADGES.map((badge) => (
          <option key={badge} value={badge}>
            {badge}
          </option>
        ))}
      </select>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
      {command && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">
            Showing in the dropdown now. Run this in a terminal with <code>gh</code> installed to save it for real:
          </span>
          <code className="w-full whitespace-pre-wrap break-all rounded-md bg-muted/40 px-2 py-1 text-[10px] text-foreground">
            {command}
          </code>
          <button
            type="button"
            onClick={copyCommand}
            className="self-end rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            {copied ? "Copied!" : "Copy command"}
          </button>
        </div>
      )}
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            if (createdKey) onCreated(createdKey);
          }}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          {command ? "Done" : "Cancel"}
        </button>
        {!command && (
          <button
            type="button"
            onClick={confirm}
            className="rounded-md bg-cyan-500/20 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/30"
          >
            Create View
          </button>
        )}
      </div>
    </div>
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
                    value === q.iso ? "bg-cyan-500/20 text-cyan-300" : "bg-muted/40 text-muted-foreground hover:text-foreground"
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
                      ? "bg-cyan-500 text-white font-medium"
                      : disabled
                      ? "text-muted-foreground/30 cursor-not-allowed"
                      : isToday
                      ? "text-cyan-300 border border-cyan-500/40 hover:bg-muted/40"
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
  const defaultKey = VIEWS.find((v) => v.kind === "category")?.key ?? "levelsabove";
  const [selectedKey, setSelectedKey] = useState<string>(defaultKey);
  const [entryDate, setEntryDate] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [source, setSource] = useState<BacktestSource>("binance");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  // Symbol-click → ADK S/R ladder, same behaviour as the Screener table.
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());
  // Rows (by the same `${source}-${symbol}-${entryDate}` key used for
  // expandedSymbols/chart links) whose CreateViewControl has generated a
  // command that hasn't been dismissed with "Done" yet. createBacktestView
  // pushes the new ViewDef into the live VIEWS array the instant "Create
  // View" is clicked — before anything is actually persisted — so the very
  // next unrelated re-render (a price poll, any state change) recomputes
  // rowViewDefByRow (it depends on VIEWS.length) and can match this row
  // against the View it was just used to derive, flipping the render below
  // to "Already in View" and unmounting the popover mid-copy. Holding a
  // row's key here keeps its CreateViewControl rendered regardless of that
  // match until Done actually closes it.
  const [pendingCreateViewRows, setPendingCreateViewRows] = useState<Set<string>>(new Set());
  function toggleExpand(key: string) {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  const [progress, setProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [rows, setRows] = useState<BacktestRow[]>([]);
  // Results-table pagination (50 rows/page) — keeps large result sets from
  // locking the DOM on a big multi-date run.
  const [resultPage, setResultPage] = useState(0);
  const [categoryRows, setCategoryRows] = useState<(CategoryScanRow & { entryDate: string })[]>([]);
  const [changeSortDir, setChangeSortDir] = useState<"asc" | "desc" | null>(null);
  const [resultChangeSortDir, setResultChangeSortDir] = useState<"asc" | "desc" | null>(null);
  // Ladder Check column sort — mutually exclusive with resultChangeSortDir
  // (clicking one clears the other) so there's always exactly one active
  // sort on the pattern/View results table.
  const [ladderSortDir, setLadderSortDir] = useState<"asc" | "desc" | null>(null);
  const [error, setError] = useState("");
  // Live map of chart snapshots attached to symbol-date rows
  const chartLinks = useChartLinks();
  // Search box for the results tables (category scan + graded backtest) —
  // mirrors the SignalsJournal search bar. Filters by symbol or entry date
  // (the two fields present on both CategoryScanRow and BacktestRow).
  const [resultSearch, setResultSearch] = useState("");

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
    setResultSearch("");
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

  const [treeRevision, setTreeRevision] = useState(0);
  // A renamed View is replaced in VIEWS immediately so the live Level Check
  // panel can use its newly derived conditions. Keep that updated definition
  // as the selected row's temporary target until the user clicks Done;
  // otherwise getView(selectedKey) returns undefined and React unmounts the
  // edit form before its command can be copied.
  const [pendingEditedView, setPendingEditedView] = useState<{
    oldKey: string;
    view: ViewDef;
  } | null>(null);
  const viewTree = useMemo(() => buildViewTree(), [treeRevision, VIEWS.length]);

  const isCategory = viewTree.some((c) => c.key === selectedKey);

  let activePatternInfo: {
    category: ViewTreeNode;
    sub: ViewTreeNode;
    path: ViewTreeNode[];
  } | undefined;
  for (const cat of viewTree) {
    const findPattern = (
      patterns: ViewTreeNode[] | undefined,
      ancestors: ViewTreeNode[] = []
    ): typeof activePatternInfo => {
      for (const sub of patterns ?? []) {
        if (sub.kind !== "pattern") continue;
        const path = [...ancestors, sub];
        if ([cat.key, ...path.map((p) => p.key)].join(SUBCATEGORY_SEP) === selectedKey) {
          return { category: cat, sub, path };
        }
        const nested = findPattern(sub.children, path);
        if (nested) return nested;
      }
      return undefined;
    };
    activePatternInfo = findPattern(cat.children);
    if (activePatternInfo) break;
  }
  const isPatternOnly = !!activePatternInfo;
  // Pattern selections use a breadcrumb path as selectedKey (for example,
  // "LEVEL ABOVE → A-A-AA-AA → A-A-AA-AA-EU2L4"). View matching must use
  // the actual registry key of the selected pattern, not that display path.
  const viewMatchScopeKey = isPatternOnly && activePatternInfo
    ? activePatternInfo.sub.key
    : selectedKey;

  const isViewOnly = !isCategory && !isPatternOnly;

  const activeTarget = isViewOnly
    ? pendingEditedView?.oldKey === selectedKey
      ? pendingEditedView.view
      : getView(selectedKey)
    : undefined;
  const activePatternTarget = isPatternOnly && activePatternInfo
    ? getView(activePatternInfo.sub.key)
    : undefined;
  const activeCategory = isCategory ? getView(selectedKey) : undefined;
  const activeLevelCheckDefs = (activeTarget ?? activePatternTarget)?.levelCheckDefs;

  const activeViewName = isViewOnly
    ? activeTarget?.label ?? selectedKey
    : undefined;
  const isTargetUp = activeTarget?.direction === "Up" || (activeTarget?.direction as string) === "bullish";
  const isTargetDown = activeTarget?.direction === "Down" || (activeTarget?.direction as string) === "bearish";
  const activeViewDirection: ViewDirection | undefined =
    isTargetUp
      ? "Up"
      : isTargetDown
      ? "Down"
      : undefined;

  const symbolListLabel = isCategory
    ? activeCategory?.label
    : isPatternOnly && activePatternInfo
    ? `${activePatternInfo.category.label} → ${activePatternInfo.path.map((p) => `Pattern ${p.label}`).join(" → ")}`
    : undefined;

  type ResolvedSub = {
    sub: ViewTreeNode;
    path: ViewTreeNode[];
    Views: ViewTreeNode[];
    children: ResolvedSub[];
  };
  type ResolvedCat = { cat: ViewTreeNode; directPatterns: ViewTreeNode[]; subCats: ResolvedSub[] };
  const categoryTree: ResolvedCat[] = useMemo(
    () => {
      const resolvePattern = (
        sub: ViewTreeNode,
        ancestors: ViewTreeNode[] = []
      ): ResolvedSub => {
        const path = [...ancestors, sub];
        return {
          sub,
          path,
          Views: sub.children.filter((c) => c.kind === "view"),
          children: sub.children
            .filter((c) => c.kind === "pattern")
            .map((child) => resolvePattern(child, path)),
        };
      };

      return viewTree.map((cat) => ({
        cat,
        directPatterns: cat.children.filter((c) => c.kind === "view"),
        subCats: cat.children
          .filter((c) => c.kind === "pattern")
          .map((sub) => resolvePattern(sub)),
      }));
    },
    [viewTree]
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
      setLadderSortDir(null);
      setResultSearch("");
      setResultPage(0);
    setProgress({ done: 0, total: 0, symbol: "" });
    setDateProgress({ current: 0, total: 0, date: "" });
    try {
      if (isCategory) {
        // NEW: "TOP 15 GAINERS" / "TOP 15 LOSERS" rank the whole scanned
        // pool by entry-day % change instead of showing every match — see
        // selectTopByChange (lib/backtest). Applied per entry date, so a date-range
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
          (done, total, symbol) => setProgress({ done, total, symbol }),
          // Stream matched rows into the table as each batch resolves.
          (streamed) => setRows((prev) => [...prev, ...streamed])
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
            (done, total, symbol) => setProgress({ done, total, symbol }),
            // Stream matched rows into the table as each batch resolves.
            (streamed) => setRows((prev) => [...prev, ...streamed])
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

  // Search-filtered views of the two result sets. Kept separate from
  // categoryRows/rows (rather than filtering in place) so the summary
  // counts above the table (symbols matched / pass / fail / hit rate)
  // keep reporting the full run, not just what's currently visible.
  const filteredCategoryRows = useMemo(() => {
    const q = resultSearch.trim().toLowerCase();
    if (!q) return categoryRows;
    return categoryRows.filter(
      (r) => r.symbol.toLowerCase().includes(q) || r.entryDate.toLowerCase().includes(q)
    );
  }, [categoryRows, resultSearch]);

  const filteredRows = useMemo(() => {
    const q = resultSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.symbol.toLowerCase().includes(q) || r.entryDate.toLowerCase().includes(q)
    );
  }, [rows, resultSearch]);

  const passCount = rows.filter((r) => r.result === "pass").length;
  const failCount = rows.filter((r) => r.result === "fail").length;
  const insufficientCount = rows.filter((r) => r.result === "insufficient-data").length;
  // NEW: rows where the pattern matched but its target level came back
  // non-finite (see backtest.ts's "invalid-target" fix) — excluded from
  // gradedCount same as insufficient-data, since neither is a real pass/fail.
  const invalidTargetCount = rows.filter((r) => r.result === "invalid-target").length;
  const gradedCount = rows.length - insufficientCount - invalidTargetCount;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  // Ladder Check: one summary per row, scoped to `rows` — which only ever
  // holds the currently selected View/Pattern's results (reset on every
  // selectedKey change and every run()). This is what keeps the
  // full-match-vs-mismatch comparison below from ever mixing symbols
  // across different Views, whose "pass" conditions aren't comparable.
  // activeLevelCheckDefs is that same View's 13 Level Check conditions
  // (undefined means no Level Check — no generic fallback).
  //
  // On a Pattern/Subpattern selection there is no single active View, so
  // each row is matched against the Views nested under it (pattern +
  // full 13/13 signature) and graded with THAT View's levelCheckDefs.
  // Rows that match no View keep the selection's own defs (undefined at
  // Pattern level -> "LevelCheck UnDefined").
  const rowViewDefByRow = useMemo(() => {
    const map = new Map<BacktestRow, ViewDef | null>();
    if (isPatternOnly) {
      rows.forEach((r) => map.set(r, matchingViewDef(r.raw, viewMatchScopeKey)));
    }
    return map;
  }, [rows, isPatternOnly, viewMatchScopeKey, treeRevision, VIEWS.length]);
  const levelCheckDefsFor = (r: BacktestRow) =>
    rowViewDefByRow.get(r)?.levelCheckDefs ?? activeLevelCheckDefs;

  const ladderByRow = useMemo(() => {
    const map = new Map<BacktestRow, ReturnType<typeof getLadderMatchSummary>>();
    rows.forEach((r) =>
      map.set(r, getLadderMatchSummary(r.prevCPR, r.todayCPR, rowViewDefByRow.get(r)?.levelCheckDefs ?? activeLevelCheckDefs))
    );
    return map;
  }, [rows, rowViewDefByRow, activeLevelCheckDefs]);

  // Pagination: sorting runs over the full filtered set, then only the
  // current page (50 rows) is rendered so the DOM stays small.
  const RESULTS_PAGE_SIZE = 50;
  const sortedRows = useMemo(() => {
    if (ladderSortDir !== null) {
      return [...filteredRows].sort((a, b) => {
        const av = ladderByRow.get(a)?.matchingCount ?? 0;
        const bv = ladderByRow.get(b)?.matchingCount ?? 0;
        return ladderSortDir === "asc" ? av - bv : bv - av;
      });
    }
    if (resultChangeSortDir === null) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const av = a.changePct;
      const bv = b.changePct;
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return resultChangeSortDir === "asc" ? av - bv : bv - av;
    });
  }, [filteredRows, ladderSortDir, resultChangeSortDir, ladderByRow]);

  useEffect(() => {
    setResultPage(0);
  }, [resultSearch, ladderSortDir, resultChangeSortDir]);

  const resultPageCount = Math.max(1, Math.ceil(sortedRows.length / RESULTS_PAGE_SIZE));
  const currentPage = Math.min(resultPage, resultPageCount - 1);
  const paginatedRows = useMemo(
    () => sortedRows.slice(currentPage * RESULTS_PAGE_SIZE, (currentPage + 1) * RESULTS_PAGE_SIZE),
    [sortedRows, currentPage]
  );

  const gradedRows = rows.filter((r) => r.result === "pass" || r.result === "fail");
  // Rows with no Level Check defined are excluded from both groups —
  // "undefined" is not a "mismatch".
  const fullMatchGraded = gradedRows.filter((r) => ladderByRow.get(r)?.fullMatch);
  const mismatchGraded = gradedRows.filter((r) => {
    const l = ladderByRow.get(r);
    return !!l && l.hasConditions && !l.fullMatch;
  });
  const fullMatchHitRate = fullMatchGraded.length
    ? Math.round((fullMatchGraded.filter((r) => r.result === "pass").length / fullMatchGraded.length) * 100)
    : null;
  const mismatchHitRate = mismatchGraded.length
    ? Math.round((mismatchGraded.filter((r) => r.result === "pass").length / mismatchGraded.length) * 100)
    : null;

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

  const ChartAttachmentBadge = ({ link }: { link: StoredChartLink }) => {
    const formattedDate = link.savedAt ? new Date(link.savedAt).toLocaleDateString() : "";
    return (
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center w-4 h-4 rounded bg-sky-500/20 text-sky-400 hover:bg-sky-500/35 hover:text-sky-200 border border-sky-500/40 hover:border-sky-300 transition-all shrink-0 cursor-pointer shadow-sm shadow-sky-950/40"
        title={`TradingView Snapshot Attached\n${link.url}${formattedDate ? `\nSaved: ${formattedDate}` : ""}\nClick to open in new tab`}
      >
        <Camera className="w-2.5 h-2.5" />
      </a>
    );
  };

  useEffect(() => {
    const keys: string[] = [];
    if (isCategory) {
      filteredCategoryRows.forEach((r) => keys.push(`${r.source}-${r.symbol}-${r.entryDate}`));
    } else {
      paginatedRows.forEach((r) => keys.push(`${r.source}-${r.symbol}-${r.entryDate}`));
    }
    if (keys.length > 0) {
      preloadChartLinks(keys);
    }
  }, [isCategory, filteredCategoryRows, paginatedRows]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/20">
          <FlaskConical className="h-4 w-4 text-cyan-400" />
        </div>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          Pattern Backtest
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-cyan-300">
            v1 — a few patterns only
          </span>
        </h2>
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
                      const patternSelectionKey = (path: ViewTreeNode[]) =>
                        [cat.key, ...path.map((p) => p.key)].join(SUBCATEGORY_SEP);
                      const patternIsVisible = (node: ResolvedSub): boolean =>
                        !q ||
                        catLabelHit ||
                        hit(node.sub.label) ||
                        node.Views.some((t) => hit(t.label)) ||
                        node.children.some(patternIsVisible);

                      const viewButton = (t: ViewTreeNode | ViewDef) => {
                        // Derive direction from ViewDef (direct) or ViewTreeNode.viewDef
                        const dir = "direction" in t
                          ? (t as ViewDef).direction
                          : (t as ViewTreeNode).viewDef?.direction;
                        const dotColor = dir === "Up"
                          ? "bg-green-500"
                          : dir === "Down"
                          ? "bg-rose-500"
                          : "bg-teal-500";
                        return (
                        <button
                          key={t.key}
                          type="button"
                          role="option"
                          aria-selected={selectedKey === t.key}
                          onClick={() => selectAndClose(t.key, cat.key)}
                          className={`w-full flex items-center gap-2 text-left px-2 py-1 rounded-md text-xs font-mono truncate ${
                            selectedKey === t.key ? "bg-cyan-500/20 text-cyan-300" : "text-foreground/80 hover:bg-muted/40"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
                          <span className="truncate">{t.label}</span>
                        </button>
                        );
                      };

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
                                selectedKey === value ? "bg-cyan-500/20 text-cyan-300" : "text-foreground/90 hover:bg-muted/40"
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
                                  ? "bg-cyan-500/20 text-cyan-300"
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
          <div className="flex rounded-md overflow-hidden border border-[#22354a] bg-[#151e2c]">
            {(["single", "range"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setDateMode(m)}
                className={`px-3 py-1 text-xs font-semibold capitalize transition cursor-pointer ${
                  dateMode === m
                    ? "bg-cyan-500/20 text-cyan-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
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
          <div className="flex rounded-md overflow-hidden border border-[#22354a] bg-[#151e2c]">
            {(["binance", "delta", "coindcx"] as BacktestSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-3 py-1 text-xs font-semibold capitalize transition cursor-pointer ${
                  source === s
                    ? "bg-cyan-500/20 text-cyan-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {s === "coindcx" ? "CoinDCX" : s}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={run}
          disabled={status === "running"}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white shadow-md shadow-cyan-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-b from-teal-300 via-cyan-500 to-cyan-700 border border-cyan-400/50 hover:from-teal-200 hover:via-cyan-400 hover:to-cyan-600"
        >
          <RefreshCw className={`w-4 h-4 ${status === "running" ? "animate-spin" : ""}`} />
          {status === "running" ? "Running…" : "Run Backtest"}
        </button>
      </div>

      {isViewOnly && activeTarget && (
        <div className="text-xs text-muted-foreground mb-3">
          Target: <span className="text-foreground font-medium">{activeTarget.targetLabel}</span>{" "}
          ({activeTarget.direction === "Up" || (activeTarget.direction as string) === "bullish" ? "price must reach or exceed it" : "price must reach or fall below it"})
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
          (price must {activePatternTarget?.direction === "Down" || (activePatternTarget?.direction as string) === "bearish" ? "reach or fall below it" : "reach or exceed it"}) — every symbol matching{" "}
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
          <div className="w-full bg-muted rounded-full h-1">
            <div className="h-1 rounded-full bg-cyan-500 transition-all" style={{ width: `${progressPct}%` }} />
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

          {categoryRows.length > 0 && (
            <div className="relative max-w-xs mb-3">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search symbol or entry date…"
                value={resultSearch}
                onChange={(e) => setResultSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          {categoryRows.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              {dateMode === "range"
                ? `No symbols matched ${symbolListLabel} between ${fromDate} and ${toDate}.`
                : `No symbols matched ${symbolListLabel} on ${entryDate}.`}
            </div>
          ) : filteredCategoryRows.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              No results match &quot;{resultSearch}&quot;.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-2 py-2 w-28 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-2 py-3 w-40 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Pattern
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[180px]">
                      View
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[190px]">
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
                    ? filteredCategoryRows
                    : [...filteredCategoryRows].sort((a, b) => {
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
                          className="px-2 py-2 w-28 font-mono font-semibold cursor-pointer select-none"
                          onClick={() => toggleExpand(`${r.source}-${r.symbol}-${r.entryDate}`)}
                          title="Click to expand ADK S/R ladder"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground text-xs shrink-0">
                              {expandedSymbols.has(`${r.source}-${r.symbol}-${r.entryDate}`) ? "▼" : "▶"}
                            </span>
                            {(() => {
                              const rowKey = `${r.source}-${r.symbol}-${r.entryDate}`;
                              const attached = findChartLink(chartLinks, rowKey, selectedKey);
                              return attached ? <ChartAttachmentBadge link={attached} /> : null;
                            })()}
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
                        <td className="px-2 py-3 w-40">
                          {renderPatternColumnBadges(r.raw) ?? (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {renderMatchingViewName(r.raw, viewMatchScopeKey)}
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
                          r={toSRLadderData(r.raw, r.closePrice ?? undefined, r.prevClose ?? undefined, r.ppClose ?? undefined)}
                          rowKey={`${r.source}-${r.symbol}-${r.entryDate}`}
                          viewKey={isViewOnly ? selectedKey : undefined}
                          colSpan={7}
                          todayPatternBadge={renderTodayPatternBadges(r.raw)}
                          prevPatternBadge={renderPrevPatternBadge(r.raw)}
                          pivotPatternBadge={renderPivotPatternBadge(r.raw)}
                          innerLevelBadges={renderLevelColumnRestBadges(r.raw)}
                          gapBadges={renderGapColumnBadges(r.raw)}
                          ssllBadge={renderSSLLCategoryBadge(r.raw)}
                          hhllBadge={renderHHLLCategoryBadge(r.raw)}
                          rrssBadge={renderSSRRCategoryBadge(r.raw)}
                          rrhhBadge={renderRRHHCategoryBadge(r.raw)}
                          viewName={activeViewName}
                          viewDirection={activeViewDirection}
                          showLevelCheck
                          levelCheckConditions={activeLevelCheckDefs}
                          copyViewControl={
                            isViewOnly && activeTarget ? (
                              <ViewActionsRow
                                activeTarget={activeTarget}
                                prevCPR={r.prevCPR}
                                todayCPR={r.todayCPR}
                                activeLevelCheckDefs={activeLevelCheckDefs}
                                onCopied={(newKey) => {
                                  setTreeRevision((r) => r + 1);
                                  setSelectedKey(newKey);
                                }}
                                onSaved={(_, updated) => {
                                  setPendingEditedView({ oldKey: selectedKey, view: updated });
                                }}
                                onUpdated={(key) => {
                                  setPendingEditedView(null);
                                  setTreeRevision((r) => r + 1);
                                  setSelectedKey(key);
                                }}
                              />
                            ) : isPatternOnly && activePatternInfo ? (
                              (() => {
                                const rowPattern = deepestMatchingPattern(r.raw, activePatternInfo.sub.key);
                                return (
                                  <CreateViewControl
                                    patternKey={rowPattern.key}
                                    patternLabel={rowPattern.label}
                                    prevCPR={r.prevCPR}
                                    todayCPR={r.todayCPR}
                                    existingGapBadge={computeGapBadge(r.raw)}
                                    onCreated={(newKey) => {
                                      setTreeRevision((r) => r + 1);
                                      setSelectedKey(newKey);
                                    }}
                                  />
                                );
                              })()
                            ) : undefined
                          }
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
          (Symbol/Pattern/View/Ladder Check/Pivot Size/Entry Date/Result/Hit
          Date/Change). GAP now lives under the expanded row's "PDay S/R"
          ladder instead of its own column. */}
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
                {(fullMatchHitRate !== null || mismatchHitRate !== null) && (
                  <span className="text-muted-foreground border-l border-border pl-4">
                    Ladder check —{" "}
                    {fullMatchHitRate !== null && (
                      <>Full match (13/13): <span className="text-foreground font-medium">{fullMatchHitRate}%</span> (n={fullMatchGraded.length})</>
                    )}
                    {fullMatchHitRate !== null && mismatchHitRate !== null && "  ·  "}
                    {mismatchHitRate !== null && (
                      <>Any mismatch: <span className="text-foreground font-medium">{mismatchHitRate}%</span> (n={mismatchGraded.length})</>
                    )}
                  </span>
                )}
              </>
            )}
          </div>

          {rows.length > 0 && (
            <div className="relative max-w-xs mb-3">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search symbol or entry date…"
                value={resultSearch}
                onChange={(e) => setResultSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          {rows.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              {dateMode === "range"
                ? `No symbols matched this pattern between ${fromDate} and ${toDate}.`
                : `No symbols matched this pattern on ${entryDate}.`}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              No results match &quot;{resultSearch}&quot;.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-2 py-3 w-40 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Pattern
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[180px]">
                      View
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() =>
                          setLadderSortDir((d) => {
                            setResultChangeSortDir(null);
                            return d === null ? "asc" : d === "asc" ? "desc" : null;
                          })
                        }
                        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors"
                        title="Sort by Ladder Check (levels still matching prev day)"
                      >
                        Ladder Check
                        <span className="text-[10px]">
                          {ladderSortDir === "asc" ? "▲" : ladderSortDir === "desc" ? "▼" : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[190px]">
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
                          setResultChangeSortDir((d) => {
                            setLadderSortDir(null);
                            return d === null ? "desc" : d === "desc" ? "asc" : null;
                          })
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
                  {paginatedRows.map((r) => (
                    <Fragment key={`${r.source}-${r.symbol}-${r.entryDate}`}>
                    <tr className="hover:bg-muted/20">
                      <td
                        className="px-3 py-2 font-mono font-semibold cursor-pointer select-none"
                        onClick={() => toggleExpand(`${r.source}-${r.symbol}-${r.entryDate}`)}
                        title="Click to expand ADK S/R ladder"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground text-xs shrink-0">
                            {expandedSymbols.has(`${r.source}-${r.symbol}-${r.entryDate}`) ? "▼" : "▶"}
                          </span>
                          {(() => {
                            const rowKey = `${r.source}-${r.symbol}-${r.entryDate}`;
                            const attached = findChartLink(chartLinks, rowKey, selectedKey);
                            return attached ? <ChartAttachmentBadge link={attached} /> : null;
                          })()}
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
                      <td className="px-2 py-3 w-40">
                        {renderPatternColumnBadges(r.raw) ?? (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {renderMatchingViewName(r.raw, viewMatchScopeKey)}
                      </td>
                      <td className="px-3 py-2">
                        {(() => {
                          const ladder = ladderByRow.get(r);
                          if (!ladder) return <span className="text-xs text-muted-foreground">—</span>;
                          if (!ladder.hasConditions) {
                            return <span className="text-xs text-muted-foreground">LevelCheck UnDefined</span>;
                          }
                          const color = ladder.fullMatch
                            ? "text-green-400"
                            : ladder.matchingCount >= ladder.total - 2
                            ? "text-amber-400"
                            : "text-destructive";
                          return (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-mono font-medium ${color}`}
                              title={
                                ladder.fullMatch
                                  ? "All 13 levels matched their previous-day zone"
                                  : `Broke through: ${ladder.mismatchLabels.join(", ")}`
                              }
                            >
                              {ladder.fullMatch ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                              {ladder.matchingCount}/{ladder.total}
                            </span>
                          );
                        })()}
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
                        r={toSRLadderData(r.raw, r.closePrice ?? undefined, r.prevClose ?? undefined, r.ppClose ?? undefined)}
                        rowKey={`${r.source}-${r.symbol}-${r.entryDate}`}
                        viewKey={isViewOnly ? selectedKey : undefined}
                        colSpan={10}
                        todayPatternBadge={renderTodayPatternBadges(r.raw)}
                        prevPatternBadge={renderPrevPatternBadge(r.raw)}
                        pivotPatternBadge={renderPivotPatternBadge(r.raw)}
                        innerLevelBadges={renderLevelColumnRestBadges(r.raw)}
                        gapBadges={renderGapColumnBadges(r.raw)}
                        ssllBadge={renderSSLLCategoryBadge(r.raw)}
                        hhllBadge={renderHHLLCategoryBadge(r.raw)}
                        rrssBadge={renderSSRRCategoryBadge(r.raw)}
                        rrhhBadge={renderRRHHCategoryBadge(r.raw)}
                        viewName={activeViewName}
                        viewDirection={activeViewDirection}
                        showLevelCheck
                        levelCheckConditions={levelCheckDefsFor(r)}
                        // Simplified rule: "Copy View" only when the
                        // selected dropdown item IS a leaf View
                        // (isViewOnly / activeTarget). Anything else —
                        // Category, Pattern, or Subpattern, even one that
                        // happens to already have its own View via
                        // activePatternTarget — gets "Create View"
                        // instead, attaching under whatever's currently
                        // selected. This also resolves the earlier "a
                        // Pattern's own key equals an existing View's
                        // key" ambiguity: it's no longer routed through
                        // Copy's sibling-array-search logic at all — it's
                        // just another Create View attach point, adding
                        // a sibling under the same subPatternKeys.
                        copyViewControl={
                          isViewOnly && activeTarget ? (
                            <ViewActionsRow
                              activeTarget={activeTarget}
                              prevCPR={r.prevCPR}
                              todayCPR={r.todayCPR}
                              activeLevelCheckDefs={activeLevelCheckDefs}
                              isFullMatch={ladderByRow.get(r)?.fullMatch}
                              onCopied={(newKey) => {
                                setTreeRevision((r) => r + 1);
                                setSelectedKey(newKey);
                              }}
                              onSaved={(_, updated) => {
                                setPendingEditedView({ oldKey: selectedKey, view: updated });
                              }}
                              onUpdated={(key) => {
                                setPendingEditedView(null);
                                setTreeRevision((r) => r + 1);
                                setSelectedKey(key);
                              }}
                            />
                          ) : isPatternOnly && rowViewDefByRow.get(r) && !pendingCreateViewRows.has(`${r.source}-${r.symbol}-${r.entryDate}`) ? (
                            <EditViewControl
                              activeTarget={rowViewDefByRow.get(r)!}
                              prevCPR={r.prevCPR}
                              todayCPR={r.todayCPR}
                              onUpdated={(key) => {
                                setTreeRevision((r) => r + 1);
                                setSelectedKey(key);
                              }}
                            />
                          ) : isPatternOnly && activePatternInfo ? (
                            (() => {
                              const rowPattern = deepestMatchingPattern(r.raw, activePatternInfo.sub.key);
                              const rowKey = `${r.source}-${r.symbol}-${r.entryDate}`;
                              return (
                                <CreateViewControl
                                  patternKey={rowPattern.key}
                                  patternLabel={rowPattern.label}
                                  prevCPR={r.prevCPR}
                                  todayCPR={r.todayCPR}
                                  existingGapBadge={computeGapBadge(r.raw)}
                                  onCommandGenerated={() => {
                                    setPendingCreateViewRows((prev) => {
                                      if (prev.has(rowKey)) return prev;
                                      const next = new Set(prev);
                                      next.add(rowKey);
                                      return next;
                                    });
                                  }}
                                  onCreated={(newKey) => {
                                    setPendingCreateViewRows((prev) => {
                                      if (!prev.has(rowKey)) return prev;
                                      const next = new Set(prev);
                                      next.delete(rowKey);
                                      return next;
                                    });
                                    setTreeRevision((r) => r + 1);
                                    setSelectedKey(newKey);
                                  }}
                                />
                              );
                            })()
                          ) : undefined
                        }
                      />
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredRows.length > 0 && resultPageCount > 1 && (
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>
                Page {currentPage + 1} of {resultPageCount} · {sortedRows.length} results
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setResultPage((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= resultPageCount - 1}
                  onClick={() => setResultPage((p) => Math.min(resultPageCount - 1, p + 1))}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
