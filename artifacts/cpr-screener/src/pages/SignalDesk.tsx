import { useState, useMemo, useEffect, useRef } from "react";
import {
  CPRResultWithSource,
  SourceId,
  fmt,
  fmtPct,
  passesPattern,
  getChartUrl,
  hasKnownChartMapping,
} from "./ScreenerUtils";
import { autoSaveQualifiedSignals, hasTouchedEntry } from "@/lib/signalTracker";
import { Views } from "@/lib/ViewsSidebar";
import { getView } from "@/lib/views";
import SignalProgressBar from "@/lib/SignalProgressBar";
import {
  Radio,
  TrendingUp,
  TrendingDown,
  Search,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldAlert,
  Target,
  Cloud,
  Clock,
  X,
  ExternalLink,
} from "lucide-react";

// Lightweight projection of a matching row that Screener hands up via
// onSignalSymbols — this is the post-filter `displayed` pool (already
// scoped to whatever left-nav pattern/Views is active), not the full
// CPRResultWithSource. It intentionally does NOT carry tc/bc or the
// SSRR/HHLL pattern-category flags, so SignalDesk no longer re-derives
// "which pattern matched" itself — it trusts Screener's activeSignal/
// activeSignalLabel for that and just projects each symbol into a card.
export interface SignalDeskSymbol {
  key: string;
  symbol: string;
  source: SourceId;
  currentPrice: number;
  change24h?: number;
  direction: "Up" | "Down";
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
  symbols?: SignalDeskSymbol[];
  results?: CPRResultWithSource[];
  activeSignal?: string;
  activeSignalLabel?: string;
  counts?: Record<string, number>;
  onSelectSignal?: (signalId: string) => void;
  onNavigateToScreener?: (signalId: string) => void;
  // NEW: lift sourceFilter (Binance/Delta/All) to be controllable from
  // outside — App.tsx now owns this as shared app-level state so this
  // toggle drives the SAME source Screener uses for its onCounts effect
  // (and therefore the left-nav sidebar's per-pattern counts), instead of
  // the two staying independently out of sync. Falls back to SignalDesk's
  // own local state when unset, so this component still works standalone.
  sourceFilter?: "all" | SourceId;
  onSourceFilterChange?: (next: "all" | SourceId) => void;
}

export interface SignalItem {
  id: string;
  symbol: string;
  source: SourceId;
  timeframe: string;
  direction: "Up" | "Down" | "NEUTRAL";
  type: string;
  patternName: string;
  // NEW: the canonical View id (matches ViewsSidebar's sub.id / a
  // BACKTEST_TARGETS key) — distinct from patternName, which is the
  // human-readable display label and can differ from the id (e.g.
  // "A-A-AA-AA-S1pPDH-U3" displays as "A-A-AA-AA · S1>pPDH(U3)"). Anything
  // that needs to re-select this View in the left nav / filter pool must
  // use patternId, never patternName — passing the label instead of the id
  // is exactly what broke the left-nav highlight and card filtering before.
  patternId: string;
  // Which top-level Views bucket (e.g. "compressed", "levelsabove",
  // "R1AbovePR4") the matched View lives under — see getCategoryForViewId.
  // Empty string when the card has no real signal (isSaved is false).
  category: string;
  triggerPrice: number;
  currentPrice: number;
  targetPrice: number;
  stopPrice: number;
  targetLevel: string;
  stoplossLevel: string;
  riskReward: string;
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
  // Matches an Active Signal / has a backtest-defined target — the setup is
  // "ready" and being watched, but this alone does NOT mean it's in the
  // Journal yet. Kept as its own flag (rather than folded into isTriggered)
  // since other parts of this file already read isSaved to mean "has a real
  // signal to show" independent of entry-touch status.
  isSaved: boolean;
  // NEW: price has actually reached/crossed the entry line (BC for Up, TC
  // for Down — see hasTouchedEntry in signalTracker.ts), i.e. this is the
  // subset of isSaved signals that are actually sitting in the Journal
  // right now, not just ready and being watched.
  isTriggered: boolean;
}

// Which top-level Views bucket a View id lives under — e.g. "compressed",
// "expanded", "levelsabove", "levelsbelow", "R1AbovePR4", "S1BelowPS4",
// "touch", "copyViews". The map is generated from the view registry, so this
// stays in sync as registered Views or their navigation parents change.
function getCategoryForViewId(id: string): string {
  for (const [category, subList] of Object.entries(Views)) {
    if (subList.some((sub) => sub.id === id)) return category;
  }
  return "";
}

// Friendly SignalDesk-specific display names for registry navigation keys.
const CATEGORY_LABELS: Record<string, string> = {
  levelsabove: "Level Above",
  levelsbelow: "Level Below",
  compressed: "Compressed",
  expanded: "Expanded",
  R1AbovePR4: "Above Level4",
  S1BelowPS4: "Below Level4",
  touch: "Touch",
  copyViews: "Created Views",
};

// Prettify a raw category key for display — falls back to the raw key
// itself for any bucket not yet in CATEGORY_LABELS (e.g. a brand-new
// category added to Views before this map is updated), so nothing ever
// silently disappears.
function getCategoryLabel(rawCategory: string): string {
  if (!rawCategory) return "";
  return CATEGORY_LABELS[rawCategory] ?? rawCategory;
}

// Which View (if any) a row matches, testing preferredViewId first if
// given, else every declared View's own passesPattern condition. Used by
// computeSignalLevels to find the specific curated View/signal a row
// qualifies for (distinct from getRowCategory below, which reads the row's
// own broad top-level classification flags directly and works whether or
// not any specific View matches).
function findPrimaryView(
  r: CPRResultWithSource,
  viewPills: { id: string; label: string }[],
  preferredViewId?: string
) {
  return preferredViewId
    ? viewPills.find((v) => v.id === preferredViewId)
    : viewPills.find((v) => passesPattern(r, v.id));
}

// Which top-level category a row itself belongs to, read directly off its
// own classification flags — the SAME flags views.ts's top-level "category"
// kind nodes gate on (r.LevelsAbove, r.LevelsBelow, r.compressed,
// r.expanded, r.R1AbovePR4, r.S1BelowPS4, r.touchCategory). These are
// mutually-exclusive partitions computed upstream in cpr.ts (confirmed by
// views.ts's own doc comment: R1AbovePR4/S1BelowPS4 are "true complements
// of levelsabove/levelsbelow", and touchCategory "already applies the
// shared precedence rule ... Level4 crossings ... do not also appear under
// TOUCH") — so this works for EVERY row, whether or not it happens to also
// qualify for any specific curated View/signal.
function getRowCategory(r: CPRResultWithSource): string {
  if (r.LevelsAbove) return "levelsabove";
  if (r.R1AbovePR4) return "R1AbovePR4";
  if (r.LevelsBelow) return "levelsbelow";
  if (r.compressed) return "compressed";
  if (r.expanded) return "expanded";
  if (r.S1BelowPS4) return "S1BelowPS4";
  if (r.touchCategory) return "touch";
  return "";
}

// Resolves a card's Category independent of whether it has a full computed
// signal (levels/isSaved) — this is what makes Category display for every
// symbol, not just ones belonging to an Active Signal. Prefers the row's own
// classification flags (getRowCategory) whenever a full CPRResultWithSource
// is available; falls back to whatever patternId the card already resolved
// to (e.g. the currently selected/active signal) only when no row at all is
// available to read flags from (the lightweight `symbols`-only path with no
// `results` supplied).
function resolveCategory(row: CPRResultWithSource | undefined, fallbackPatternId: string): string {
  if (row) {
    const category = getRowCategory(row);
    if (category) return category;
  }
  return fallbackPatternId ? getCategoryForViewId(fallbackPatternId) : "";
}

// Entry/target/stop for a single CPR result row — sourced ENTIRELY from
// Entry/target/stop for a single CPR result row — sourced ENTIRELY from
// backtest.ts's own BACKTEST_TARGETS (the exact same lookup runBacktest /
// pivotLevelBacktestSymbolOnDate use: `BACKTEST_TARGETS.find(t => t.key ===
// <View id>)`), never invented here. Returns null when the row's matched
// View has no BACKTEST_TARGETS entry — such a symbol has no defined target
// to trade or save against, full stop, rather than falling back to guessed
// R/S thresholds.
//   • entry uses the matched View's OWN getEntry(r) when it defines one —
//     each View can pin its entry to whichever CPR level actually fits its
//     setup (TC, BC, R1, S1, ...), not just "Up→BC / Down→TC". Only Views
//     that don't define getEntry fall back to that direction-based BC/TC
//     default.
//   • stop is still fixed by direction alone (Up: today's S1, Down: today's R1)
export function computeSignalLevels(
  r: CPRResultWithSource,
  viewPills: { id: string; label: string }[],
  preferredViewId?: string
) {
  const primaryView = findPrimaryView(r, viewPills, preferredViewId);
  if (!primaryView) return null;

  const targetDef = getView(primaryView.id);
  if (!targetDef || !targetDef.getTarget) return null;

  const isUp = targetDef.direction === "Up" || (targetDef.direction as string) === "bullish";
  const direction: "Up" | "Down" = isUp ? "Up" : "Down";
  const price = targetDef.getEntry ? targetDef.getEntry(r) : (isUp ? r.todayCPR.bc : r.todayCPR.tc); // entry
  const stopPrice = isUp ? r.todayCPR.s1 : r.todayCPR.r1;
  const targetPrice = targetDef.getTarget(r);
  const targetLevel = targetDef.targetLabel ?? "";
  const stoplossLevel = targetDef.stoplossLabel ?? (isUp ? "S1" : "R1");
  const patternLabel = primaryView.label;
  const patternId = primaryView.id;
  const category = getCategoryForViewId(patternId);

  const risk = Math.max(0.0000001, Math.abs(price - stopPrice));
  const reward = Math.abs(targetPrice - price);
  const rrRatio = (reward / risk).toFixed(1);

  return { patternLabel, patternId, category, price, direction, targetPrice, stopPrice, targetLevel, stoplossLevel, rrRatio };
}

// Single source of truth for turning a pool of CPRResultWithSource rows
// into `{id, label, count}` pills — every id/label in the tree, counted
// against whichever pool is passed in, zero-count ids dropped, sorted
// descending.
export function buildPills(pool: CPRResultWithSource[]) {
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
    const count = pool.filter((r) => passesPattern(r, id)).length;
    if (count > 0) list.push({ id, label: item.label, count });
  }
  return list.sort((a, b) => b.count - a.count);
}

export default function SignalDesk({
  symbols,
  results,
  activeSignal,
  activeSignalLabel,
  counts,
  onSelectSignal,
  onNavigateToScreener,
  sourceFilter: sourceFilterProp,
  onSourceFilterChange,
}: SignalDeskProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilterState, setSourceFilterState] = useState<"all" | SourceId>("binance");
  const sourceFilter = sourceFilterProp ?? sourceFilterState;
  const setSourceFilter = onSourceFilterChange ?? setSourceFilterState;
  const [directionFilter, setDirectionFilter] = useState<"all" | "Up" | "Down">("all");
  // Status filter — "saved" = already touched entry and sitting in the
  // Journal (item.isTriggered); "ready" = matched an Active Signal but
  // hasn't touched entry yet, still being watched (item.isSaved &&
  // !item.isTriggered) — same split the header's Auto-Saved/Ready
  // (Watching) badges use. "all" applies no status filtering.
  const [statusFilter, setStatusFilter] = useState<"all" | "saved" | "ready">("all");
  const [selectedSignalId, setSelectedSignalId] = useState<string>(activeSignal || "");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (activeSignal !== undefined) {
      setSelectedSignalId(activeSignal);
    }
  }, [activeSignal]);

  const viewPills = useMemo(() => buildPills(results ?? []), [results]);

  // Source-scoped pill set — same function, filtered pool. Display only:
  // this is what the "Active Signals" strip actually renders, so it's the
  // one that responds to the Binance/Delta/All toggle.
  const displayViewPills = useMemo(() => {
    if (sourceFilter === "all") return viewPills;
    return buildPills((results ?? []).filter((r) => r.source === sourceFilter));
  }, [results, sourceFilter, viewPills]);

  // ─────────────────────────────────────────────────────────────────────
  // SOURCE OF TRUTH for "does this symbol belong to an Active Signal" — the
  // Journal save-list must be built from THIS, not from SignalDesk's own
  // card-rendering branches below. It mirrors effectiveCounts exactly:
  // for each sidebar pill (a View with count > 0), the same passesPattern()
  // check ScreenerUtils/ViewsSidebar use to produce that pill's count.
  // Deliberately independent of selectedSignalId/activeSignal — a symbol
  // is eligible whenever it belongs to ANY Active Signal, regardless of
  // which single View SignalDesk happens to be displaying right now.
  const activeSignalSymbols = useMemo(() => {
    const map = new Map<string, CPRResultWithSource>();
    if (!results || results.length === 0 || viewPills.length === 0) return map;
    for (const v of viewPills) {
      for (const r of results) {
        if (map.has(r.symbol)) continue;
        if (passesPattern(r, v.id)) {
          map.set(r.symbol, r);
        }
      }
    }
    return map;
  }, [results, viewPills]);

  // symbol -> its full CPRResultWithSource row, for filtering the
  // lightweight `symbols` prop against a specific selected View. Kept
  // separate from activeSignalSymbols (which only tells you a symbol
  // belongs to SOME Active Signal, not which one).
  const resultsBySymbol = useMemo(() => {
    const map = new Map<string, CPRResultWithSource>();
    if (!results) return map;
    for (const r of results) {
      if (!map.has(r.symbol)) map.set(r.symbol, r);
    }
    return map;
  }, [results]);

  // Generate live signal cards
  const signals = useMemo<SignalItem[]>(() => {
    // If external symbols were passed explicitly, map them
    if (symbols && symbols.length > 0) {
      // Prefer the canonical activeSignalSymbols set (built straight from
      // ScreenerUtils' passesPattern — see above) whenever `results` is
      // available. It's only when this component gets JUST the lightweight
      // `symbols` projection (no CPRResult tc/bc/pattern-category fields to
      // run passesPattern against) that we fall back to trusting the
      // currently-selected View is itself a qualifying Active Signal.
      const currentSignalId = selectedSignalId || activeSignal || "";
      const isCurrentSignalActive = viewPills.some((p) => p.id === currentSignalId);
      const label = selectedSignalId
        ? viewPills.find((p) => p.id === selectedSignalId)?.label ?? selectedSignalId
        : activeSignalLabel || "Active Signal";

      // Filter down to symbols whose full CPR row (from `results`, when the
      // parent also provides it) actually passes the selected View's own
      // passesPattern() condition — same check the sidebar pill counts and
      // activeSignalSymbols use. IMPORTANT: only apply this when we actually
      // have CPR rows to check against (`results` populated). When the
      // parent supplies ONLY the lightweight `symbols` projection (no
      // `results`), there's nothing to test locally — per this file's own
      // doc comment, `symbols` is already the parent's pre-filtered,
      // active-View-scoped pool (see handlePillClick's onSelectSignal call
      // above, which is what actually re-scopes it), so trust it as-is
      // instead of filtering everything down to zero.
      const filteredSymbols =
        selectedSignalId && resultsBySymbol.size > 0
          ? symbols.filter((sym) => {
              const row = resultsBySymbol.get(sym.symbol);
              return row ? passesPattern(row, selectedSignalId) : false;
            })
          : symbols;

      return filteredSymbols.map((sym) => {
        const matchedRow = activeSignalSymbols.get(sym.symbol);
        const levels = matchedRow ? computeSignalLevels(matchedRow, viewPills) : null;
        const isEligible = activeSignalSymbols.size > 0 ? levels !== null : isCurrentSignalActive;

        // When this symbol has a real backtest-defined target (levels !==
        // null), entry/target/stop come straight from BACKTEST_TARGETS —
        // same rule as everywhere else in this file. Otherwise (no
        // `results` to match against, or its View has no BACKTEST_TARGETS
        // entry) fall back to a simple display-only approximation; this
        // fallback is NEVER what gets saved to the Journal.
        const isUp = levels
          ? levels.direction === "Up" || (levels.direction as string) === "LONG"
          : sym.direction === "Up" || (sym.direction as string) === "up";
        const direction: "Up" | "Down" = isUp ? "Up" : "Down";
        const price = levels ? levels.price : sym.currentPrice;
        const { pivot, r1, r2, s1, s2, r3, s3, r4, s4 } = sym;

        let targetPrice: number;
        let stopPrice: number;
        let targetLevel: string;
        let stoplossLevel: string;

        if (levels) {
          targetPrice = levels.targetPrice;
          stopPrice = levels.stopPrice;
          targetLevel = levels.targetLevel;
          stoplossLevel = levels.stoplossLevel;
        } else if (direction === "Up") {
          if (sym.currentPrice >= r1) {
            targetPrice = r2;
            targetLevel = "R2";
          } else {
            targetPrice = r1;
            targetLevel = "R1";
          }
          stopPrice = s1;
          stoplossLevel = "S1";
        } else {
          if (sym.currentPrice <= s1) {
            targetPrice = s2;
            targetLevel = "S2";
          } else {
            targetPrice = s1;
            targetLevel = "S1";
          }
          stopPrice = r1;
          stoplossLevel = "R1";
        }

        const rrRatio = levels
          ? levels.rrRatio
          : (Math.abs(targetPrice - price) / Math.max(0.0000001, Math.abs(price - stopPrice))).toFixed(1);

        const patternLabel = levels ? levels.patternLabel : label;
        // Fall back to the actual selected/active signal id (never a label)
        // so "Signal in Screener" always re-selects something ViewsSidebar
        // can match against sub.id.
        const patternId = levels ? levels.patternId : (selectedSignalId || activeSignal || "");

        // Same trigger check the Journal auto-save effect uses — this is
        // display-only here, so a card can show "Ready" vs "Running" without
        // waiting for the next auto-save tick to resolve.
        const isTriggered = levels
          ? hasTouchedEntry(levels.direction, levels.price, sym.currentPrice)
          : false;

        return {
          id: sym.key,
          symbol: sym.symbol,
          source: sym.source,
          timeframe: "Daily / 1D",
          direction,
          type: `${patternLabel} Setup`,
          patternName: patternLabel,
          patternId,
          category: resolveCategory(resultsBySymbol.get(sym.symbol), patternId),
          triggerPrice: price,
          // Always the live-refreshed price, never the static BC/TC entry
          // level `price` resolves to when `levels` is set — see
          // computeSignalLevels' doc comment. Using `price` here froze the
          // header price and SignalProgressBar needle for any symbol whose
          // View has a BACKTEST_TARGETS entry, since todayCPR.bc/tc never
          // change between live-refresh ticks.
          currentPrice: sym.currentPrice,
          change24h: sym.change24h,
          targetPrice,
          stopPrice,
          targetLevel,
          stoplossLevel,
          riskReward: `1 : ${rrRatio}`,
          cprStatus: isEligible
            ? `${patternLabel} (Target ${targetLevel})`
            : direction === "Up" ? "Above CPR Pivot" : "Below CPR Pivot",
          pivot,
          r1,
          s1,
          r2,
          s2,
          r3,
          s3,
          r4,
          s4,
          timestamp: "Active",
          isSaved: isEligible,
          isTriggered,
        };
      });
    }

    if (!results || results.length === 0) return [];

    let pool = results;
    if (selectedSignalId) {
      pool = results.filter((r) => passesPattern(r, selectedSignalId));
    }

    // Eligibility now comes purely from activeSignalSymbols (the canonical
    // passesPattern-against-every-Active-View set computed above) — not
    // from whichever single View this branch's `pool` happens to be scoped
    // to display right now. A symbol belonging to Active Signal #7 must still
    // show the Saved badge and reach the Journal even while the user is
    // browsing Active Signal #3.
    const list: SignalItem[] = [];

    for (const r of pool) {
      const levels = computeSignalLevels(r, viewPills, selectedSignalId || undefined);
      const isActiveSignalSymbol = activeSignalSymbols.has(r.symbol) && levels !== null;

      const pivot = r.todayCPR.pivot;
      const { r1, r2, r3, r4, s1, s2, s3, s4 } = r.todayCPR;

      // When this row has a real backtest-defined target (levels !== null),
      // entry/target/stop come straight from BACKTEST_TARGETS. Otherwise
      // (not in an Active Signal, or its View has no BACKTEST_TARGETS entry)
      // fall back to a simple display-only approximation so the card still
      // has something to show; this fallback is NEVER what gets saved.
      const fallbackPrice = r.currentPrice || pivot;
      const fallbackDirection: "Up" | "Down" = fallbackPrice < pivot ? "Down" : "Up";

      const patternLabel = levels?.patternLabel ?? "Standard CPR";
      // Same rule as branch A above: never fall back to a display label
      // for the id that "Signal in Screener" hands back to the left nav.
      const patternId = levels?.patternId ?? (selectedSignalId || "");
      const direction: "Up" | "Down" = levels ? levels.direction : fallbackDirection;
      const price = levels ? levels.price : fallbackPrice;
      const targetPrice = levels ? levels.targetPrice : (direction === "Up" ? r1 : s1);
      const stopPrice = levels ? levels.stopPrice : (direction === "Up" ? s1 : r1);
      const targetLevel = levels ? levels.targetLevel : (direction === "Up" ? "R1" : "S1");
      const stoplossLevel = levels ? levels.stoplossLevel : (direction === "Up" ? "S1" : "R1");
      const rrRatio = levels
        ? levels.rrRatio
        : (Math.abs(targetPrice - price) / Math.max(0.0000001, Math.abs(price - stopPrice))).toFixed(1);

      // Same trigger check the Journal auto-save effect uses — display-only
      // here so a card can show "Ready" vs "Running" without waiting for the
      // next auto-save tick to resolve.
      const isTriggered = levels
        ? hasTouchedEntry(levels.direction, levels.price, r.currentPrice)
        : false;

      list.push({
        id: `${r.source}-${r.symbol}-${selectedSignalId || patternLabel}`,
        symbol: r.symbol,
        source: r.source,
        timeframe: "Daily / 1D",
        direction,
        type: `${patternLabel} Setup`,
        patternName: patternLabel,
        patternId,
        category: resolveCategory(r, patternId),
        triggerPrice: price,
        // Same fix as the `symbols` branch above: keep the live-refreshed
        // r.currentPrice for display, don't collapse it into the static
        // BC/TC entry level that `price` resolves to when `levels` is set.
        currentPrice: r.currentPrice,
        change24h: r.change24h,
        targetPrice,
        stopPrice,
        targetLevel,
        stoplossLevel,
        riskReward: `1 : ${rrRatio}`,
        cprStatus: isActiveSignalSymbol ? `${patternLabel} (Target ${targetLevel})` : "General CPR Setup",
        pivot,
        r1,
        s1,
        r2,
        s2,
        r3,
        s3,
        r4,
        s4,
        timestamp: "Active",
        isSaved: isActiveSignalSymbol,
        isTriggered,
      });
    }

    return list;
  }, [symbols, results, viewPills, activeSignalSymbols, resultsBySymbol, selectedSignalId, activeSignal, activeSignalLabel]);

  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
      if (directionFilter !== "all") {
        const isMatch =
          s.direction === directionFilter ||
          (directionFilter === "Up" && (s.direction as string) === "LONG") ||
          (directionFilter === "Down" && (s.direction as string) === "SHORT");
        if (!isMatch) return false;
      }
      if (statusFilter === "saved" && !s.isTriggered) return false;
      if (statusFilter === "ready" && !(s.isSaved && !s.isTriggered)) return false;
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
  }, [signals, sourceFilter, directionFilter, statusFilter, searchTerm]);

  // Header stats are scoped to symbols that actually belong to an Active
  // View (item.isSaved — despite the name, this flags Active Signal
  // membership, the same eligibility check the auto-save effect uses) —
  // NOT the full scanned/displayed symbol universe. Previously this counted
  // every card in filteredSignals regardless of whether it matched any
  // Active Signal, which is why "Signals" showed the full scan size (e.g.
  // 516) instead of the actual Active Signal total (e.g. ~114).
  const stats = useMemo(() => {
    const activeSignalOnly = filteredSignals.filter((s) => s.isSaved);
    const total = activeSignalOnly.length;
    // "saved" = actually touched entry and sitting in the Journal.
    // "ready" = matched an Active Signal but hasn't touched entry yet — still
    // being watched, not yet written to the Journal. These used to be the
    // same number (any Active Signal match got auto-saved immediately); now
    // that auto-save gates on hasTouchedEntry, they're split so the header
    // doesn't overclaim how many signals are actually in the Journal.
    const saved = activeSignalOnly.filter((s) => s.isTriggered).length;
    const ready = total - saved;
    const upCount = activeSignalOnly.filter((s) => s.direction === "Up" || (s.direction as string) === "LONG").length;
    const downCount = activeSignalOnly.filter((s) => s.direction === "Down" || (s.direction as string) === "SHORT").length;
    const watch = activeSignalOnly.filter((s) => s.direction === "NEUTRAL").length;
    return { total, saved, ready, upCount, downCount, watch, longs: upCount, shorts: downCount };
  }, [filteredSignals]);

  // Automatically save ONLY qualified signals from Active Signals directly to the Journal.
  // Candidates now come straight from activeSignalSymbols — the same
  // passesPattern()-against-every-pill computation buildPills() above uses
  // to produce the sidebar's View counts — NOT from
  // SignalDesk's own rendered `signals` card list. That keeps Journal
  // membership tied exactly to "which symbols select into Active Signals",
  // regardless of which single View happens to be on screen, which pool
  // branch rendered the cards, or how the cards' own labels are derived. Tracks which symbols were already submitted TODAY so re-renders
  // triggered by price ticks or switching between Active Signals don't keep
  // re-submitting the same symbols over and over — the Journal enforces one
  // row per symbol/day, but there's no reason to spam it with redundant
  // writes on every tick either.
  const submittedTodayRef = useRef<{ day: string; symbols: Set<string> }>({
    day: "",
    symbols: new Set(),
  });

  useEffect(() => {
    if (activeSignalSymbols.size === 0) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    if (submittedTodayRef.current.day !== todayKey) {
      // New day — reset the in-memory "already submitted" tracker.
      submittedTodayRef.current = { day: todayKey, symbols: new Set() };
    }

    const alreadySubmitted = submittedTodayRef.current.symbols;
    const newlySubmitted: string[] = [];
    const candidateSignals: Array<{
      symbol: string;
      source: SourceId;
      timeframe: string;
      direction: "Up" | "Down" | "NEUTRAL" | "LONG" | "SHORT";
      type: string;
      patternName: string;
      patternId: string;
      entry: number;
      currentPrice: number;
      target: number;
      sl: number;
      rr: string;
      cprStatus: string;
      timestamp: number;
      dateStr: string;
      status: "ACTIVE";
    }> = [];

    for (const [symbol, r] of activeSignalSymbols.entries()) {
      const key = symbol.toUpperCase();
      if (alreadySubmitted.has(key)) continue;

      const levels = computeSignalLevels(r, viewPills);
      if (!levels) continue; // no backtest-defined target for this symbol's View — nothing to save

      // Setup matched, but don't mark this symbol "submitted today" (and
      // don't send it to the Journal) until price has actually touched
      // its entry line — see hasTouchedEntry's doc comment. Leaving it
      // OUT of alreadySubmitted means the next tick re-checks it fresh.
      if (!hasTouchedEntry(levels.direction, levels.price, r.currentPrice)) continue;

      newlySubmitted.push(key);
      candidateSignals.push({
        symbol: r.symbol,
        source: r.source,
        timeframe: "Daily / 1D",
        direction: levels.direction,
        type: `${levels.patternLabel} Setup`,
        patternName: levels.patternLabel,
        patternId: levels.patternId,
        entry: levels.price,
        // Live price, NOT levels.price (the static BC/TC entry line) —
        // performAutoSave needs the real current price to know whether
        // this candidate has actually touched its entry line yet.
        currentPrice: r.currentPrice,
        target: levels.targetPrice,
        sl: levels.stopPrice,
        rr: `1 : ${levels.rrRatio}`,
        cprStatus: `${levels.patternLabel} (Target ${levels.targetLevel})`,
        timestamp: Date.now(),
        dateStr: new Date().toLocaleString(),
        status: "ACTIVE",
      });
    }

    if (candidateSignals.length === 0) return;

    autoSaveQualifiedSignals(candidateSignals).then(() => {
      for (const key of newlySubmitted) {
        alreadySubmitted.add(key);
      }
    });
  }, [activeSignalSymbols, viewPills]);

  const handleCopy = (item: SignalItem) => {
    const text = `[PIVOT SIGNAL: ${item.symbol}] (${item.direction})
Pattern: ${item.patternName} (${item.type})
Source: ${item.source.toUpperCase()}
Entry / Trigger: ${fmt(item.triggerPrice)}
Target Level: ${fmt(item.targetPrice)}
Stop Level: ${fmt(item.stopPrice)}
R:R: ${item.riskReward}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePillClick = (pillId: string) => {
    const next = selectedSignalId === pillId ? "" : pillId;
    setSelectedSignalId(next);
    // Tell the parent (same callback ViewsSidebar's onSelect wires up to) so
    // it can re-scope/re-fetch its own filtered pool and hand a freshly
    // pre-filtered `symbols` array back down — this is the actual filtering
    // step per this file's own "already scoped to whatever left-nav
    // pattern/Views is active" contract at the top of the file. Without this
    // call, the parent never learns the View changed and keeps sending the
    // exact same `symbols` it always was.
    onSelectSignal?.(next);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080d15] text-slate-100 overflow-hidden">
      {/* Top Banner Header */}
      <div className="p-4 border-b border-[#1e2d3d] bg-[#0c131f] flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                SIGNAL DESK
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live Scanner Feeds
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Actionable pivot breakout triggers, CPR trend directions,
                <br />
                and automated risk/reward setups
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Counter Badges — kept to a single non-wrapping row;
            scrolls horizontally on very narrow viewports rather than
            dropping badges to a second line. */}
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
          <div className="shrink-0 bg-[#131b26] border border-[#1e2d3d] rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-emerald-400">
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium text-slate-300">
              Active (In Journal): <strong className="text-emerald-400 font-mono font-bold">{stats.saved}</strong>
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="shrink-0 bg-[#131b26] border border-[#1e2d3d] rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-amber-400">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-medium text-slate-300">
              Ready: <strong className="text-amber-400 font-mono font-bold">{stats.ready}</strong>
            </span>
          </div>

          <div className="shrink-0 bg-[#131b26] border border-[#1e2d3d] rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">Signals:</span>
            <span className="text-sm font-bold text-white font-mono">{stats.total}</span>
          </div>
          <div className="shrink-0 bg-[#131b26] border border-emerald-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-emerald-400 font-medium">Up:</span>
            <span className="text-sm font-bold text-emerald-400 font-mono">{stats.upCount}</span>
          </div>
          <div className="shrink-0 bg-[#131b26] border border-rose-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[11px] text-rose-400 font-medium">Down:</span>
            <span className="text-sm font-bold text-rose-400 font-mono">{stats.downCount}</span>
          </div>
        </div>
      </div>

      {/* Available Views with Counts Strip (Wrapping chips from sidebar with count > 0) */}
      {displayViewPills.length > 0 && (
        <div className="px-4 py-2.5 border-b border-[#1a2736] bg-[#09101a] shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Active Signals ({displayViewPills.length})
              </span>
              {selectedSignalId && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  {selectedSignalId}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 italic hidden sm:block">
              Select a different filter in the sidebar to refresh this list.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center max-h-36 overflow-y-auto">
            {displayViewPills.map((pill) => {
              const isSelected = selectedSignalId === pill.id;

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

            {selectedSignalId && (
              <button
                onClick={() => {
                  setSelectedSignalId("");
                  onSelectSignal?.("");
                }}
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
          {/* Direction Filter — small individual pill tabs, matching the
              Source filter's look: muted when inactive, a translucent
              color tint (not a big solid fill) when active. */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDirectionFilter("all")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                directionFilter === "all"
                  ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40"
                  : "text-slate-400 hover:text-white bg-[#151e2c] border border-transparent"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setDirectionFilter("Up")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                directionFilter === "Up"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-emerald-400/70 hover:text-emerald-300 bg-[#151e2c] border border-transparent"
              }`}
            >
              Up
            </button>
            <button
              onClick={() => setDirectionFilter("Down")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                directionFilter === "Down"
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  : "text-rose-400/70 hover:text-rose-300 bg-[#151e2c] border border-transparent"
              }`}
            >
              Down
            </button>
          </div>

          {/* Status Filter — Running (triggered, in the Journal) / Ready
              (matched an Active Signal, still watching for entry). Toggle
              behavior: clicking the already-active button clears it back
              to "all", matching the Direction/Source filters' feel. */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setStatusFilter(statusFilter === "saved" ? "all" : "saved")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                statusFilter === "saved"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-emerald-400/70 hover:text-emerald-300 bg-[#151e2c] border border-transparent"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter(statusFilter === "ready" ? "all" : "ready")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                statusFilter === "ready"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "text-amber-400/70 hover:text-amber-300 bg-[#151e2c] border border-transparent"
              }`}
            >
              Ready
            </button>
          </div>

          {/* Source Filter */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSourceFilter("all")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                sourceFilter === "all"
                  ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40"
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
            <button
              onClick={() => setSourceFilter("coindcx")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                sourceFilter === "coindcx"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
            >
              CoinDCX
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
              const isUp = item.direction === "Up" || (item.direction as string) === "LONG";
              const isDown = item.direction === "Down" || (item.direction as string) === "SHORT";

              // Direction badge — only for symbols with a real signal
              // (Active Signal match, item.isSaved). Placed top-right for Up,
              // top-left for Down (see the two render spots below).
              const directionBadge = item.isSaved && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1 font-mono shrink-0 ${
                    isUp
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : isDown
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                      : "bg-slate-500/20 text-slate-300 border border-slate-500/40"
                  }`}
                >
                  {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : isDown ? <ArrowDownLeft className="w-3.5 h-3.5" /> : null}
                  {isUp ? "Up" : isDown ? "Down" : item.direction}
                </span>
              );

              // Running/Ready status — sits right beside the direction badge,
              // on the side closer to the card's center (after Down, before
              // Up), so the two read together as one status cluster.
              const statusBadge = item.isSaved && (
                item.isTriggered ? (
                  <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono shrink-0">
                    <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Active</span>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-1 text-[11px] text-amber-400 font-mono shrink-0"
                    title="Matches an active signal but price hasn't reached the entry line yet"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Ready</span>
                  </div>
                )
              );

              return (
                <div
                  key={item.id}
                  className="bg-[#0f1724] border border-[#1e2d3d] hover:border-slate-600 rounded-xl p-4 transition-all flex flex-col justify-between shadow-lg"
                >
                  {/* Card Top */}
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      {/* Down signals get the badge on the top-left, ahead
                          of the symbol block; Up (and no-signal) keep the
                          symbol block alone on the left. */}
                      {isDown && directionBadge}
                      {isDown && statusBadge}

                      {/* Left: Symbol & Exchange + Live Price & 24h % change */}
                      <div className="flex items-start gap-4 sm:gap-6">
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-base sm:text-lg font-extrabold text-white font-mono tracking-tight leading-tight">
                              {item.symbol}
                            </span>
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
                          <div className="text-[11px] font-semibold text-slate-400 font-mono uppercase tracking-wider mt-0.5">
                            {item.source}
                          </div>
                        </div>

                        <div className="flex flex-col items-end">
                          <div className="text-sm sm:text-base font-bold text-white font-mono leading-tight">
                            {fmt(item.currentPrice).replace(/,/g, "")}
                          </div>
                          <div
                            className={`text-xs font-mono font-bold leading-tight mt-0.5 text-right ${
                              (item.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {fmtPct(item.change24h ?? 0)}
                          </div>
                        </div>
                      </div>

                      {/* Up (and no-signal) signals keep the badge on the
                          top-right, as before. */}
                      {!isDown && statusBadge}
                      {!isDown && directionBadge}
                    </div>

                    {/* Live Price Progress Bar — red-left/green-right for Up,
                        flipped to green-left/red-right for Down (via isDown) */}
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
                      isDown={isDown}
                    />

                    {/* Pricing Level Metrics — order flips with direction:
                        Up: Stop Loss (left) · Trigger/Entry (middle) · Target (right)
                        Down: Target (left) · Trigger/Entry (middle) · Stop Loss (right) */}
                    <div className="grid grid-cols-3 gap-2 bg-[#090f19] border border-[#1b2636] rounded-lg p-2.5 mb-3 font-mono">
                      {isDown && (
                        <div>
                          <div className="text-[10px] text-rose-400 font-sans flex items-center gap-0.5">
                            <Target className="w-2.5 h-2.5" /> Target
                          </div>
                          <div className="text-xs font-bold text-rose-400 mt-0.5">{fmt(item.targetPrice)}</div>
                        </div>
                      )}
                      {!isDown && (
                        <div>
                          <div className="text-[10px] text-rose-400 font-sans">Stop Loss</div>
                          <div className="text-xs font-bold text-rose-400 mt-0.5">{fmt(item.stopPrice)}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">Trigger / Entry</div>
                        <div className="text-xs font-bold text-white mt-0.5">{fmt(item.triggerPrice)}</div>
                      </div>
                      {isDown ? (
                        <div>
                          <div className="text-[10px] text-emerald-400 font-sans">Stop Loss</div>
                          <div className="text-xs font-bold text-emerald-400 mt-0.5">{fmt(item.stopPrice)}</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[10px] text-emerald-400 font-sans flex items-center gap-0.5">
                            <Target className="w-2.5 h-2.5" /> Target
                          </div>
                          <div className="text-xs font-bold text-emerald-400 mt-0.5">{fmt(item.targetPrice)}</div>
                        </div>
                      )}
                    </div>

                    {/* View and Target Details */}
                    <div className="text-[11px] text-slate-400 mb-3 px-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span>Signal:</span>
                          <strong className="text-slate-200 font-semibold">
                            {item.isSaved ? item.patternName : ""}
                          </strong>
                        </div>
                        <span className="font-mono text-slate-300">
                          R:R <strong className="text-white">{item.riskReward}</strong>
                        </span>
                      </div>
                      {item.isSaved && item.patternId && (
                        <div className="flex items-center gap-1">
                          <span>Code:</span>
                          <strong className="text-slate-500 font-mono text-[11px]">{item.patternId}</strong>
                        </div>
                      )}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <span>Target:</span>
                          <strong className="text-slate-200 font-semibold font-mono">{item.targetLevel || "S2"}</strong>
                        </div>
                        <div className="flex items-center gap-1">
                          <span>Stoploss:</span>
                          <strong className="text-rose-400 font-semibold font-mono">{item.stoplossLevel || "S1"}</strong>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Category:</span>
                        <strong className="text-slate-200 font-semibold">{getCategoryLabel(item.category)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="pt-2 border-t border-[#1e2d3d] flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        const targetSignalId = item.patternId || item.patternName;
                        if (onNavigateToScreener) {
                          onNavigateToScreener(targetSignalId);
                        } else {
                          onSelectSignal?.(targetSignalId);
                        }
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition flex items-center gap-1 cursor-pointer"
                    >
                      Open Signal in Screener &rarr;
                    </button>

                    <div className="flex items-center gap-2">
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
