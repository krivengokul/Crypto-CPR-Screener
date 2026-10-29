import { memo, useState, useMemo, useEffect, useCallback, useRef, type CSSProperties } from "react";
import {
  CPRResultWithSource,
  SourceId,
  fmt,
  fmtPct,
  passesPattern,
  getChartUrl,
  openChartInNewTab,
  hasKnownChartMapping,
  renderPivotSizeCell,
} from "./ScreenerUtils";
import type { CPRResult } from "@/lib/cpr";
import {
  hasTouchedEntry,
  fetchSavedSignalsFromCloud,
  SIGNALS_JOURNAL_UPDATED_EVENT,
  persistLiveJournalOutcome,
  type LoggedSignal,
} from "@/lib/signalTracker";
import {
  resolveSignalStatus,
  type SignalLifecycleStatus,
} from "@/lib/signalStatus";
import { Views } from "@/lib/ViewsSidebar";
import { formatTradFiSubtitle } from "@/lib/tradfiDisplay";
import { getView, shortLevelLabel } from "@/lib/views";
import { getRowCategory, getCategoryLabel } from "@/lib/rowCategory";
import SignalProgressBar from "@/lib/SignalProgressBar";
import { isDeskSource } from "@/lib/deskSources";
import { getLadderMatchSummary } from "./SRLadderDiff";
import {
  Radio,
  TrendingUp,
  TrendingDown,
  Search,
  Copy,
  Check,
  ArrowUp,
  ArrowDown,
  ShieldAlert,
  Target,
  Cloud,
  Clock,
  X,
  ExternalLink,
  CheckCircle2,
  XCircle,
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

/** Set by App when the user clicks "Open SignalDesk" on an entry-cross toast. */
export interface FocusSymbol {
  symbol: string;
  source: SourceId;
  patternId?: string;
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
  // Scroll to + highlight this symbol's card (entry-cross toast action).
  focusSymbol?: FocusSymbol | null;
  onFocusSymbolConsumed?: () => void;
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
  entryLevel: string;
  stoplossLevel: string;
  /** Exclusive previous-day 15m class (Screener P-* label). */
  pDayText?: string;
  pDayClassName?: string;
  pDayStyle?: CSSProperties;
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
  /** Journal entry time for the most recent matching triggered signal. */
  triggeredAt?: string;
  /** Today's journal outcome for this card's setup, when one exists. */
  journalStatus?: "ACTIVE" | "PASS" | "FAIL" | "EXPIRED";
  /** Level-check MATCH score for the card's View (same as Screener MATCH column). */
  matchCount?: number;
  matchTotal?: number;
  matchFull?: boolean;
  matchMismatches?: string;
  /** Whether this View requires full 13/13 (from create/edit checkbox). */
  requireFullMatch?: boolean;
  /** Pivot Size column (same as Screener): prev/today width% + compression ratio. */
  prevWidthPct?: number;
  todayWidthPct?: number;
  compressionRatio?: number;
}

type StatusFilter = "all" | "saved" | "ready" | "pass" | "fail";

// Journal day key (UTC). CPR session rolls at 00:00 UTC (~5:30 AM IST), so
// after the morning scan, only rows from this UTC date are "today".
function journalDayKey(ts?: number): string | null {
  if (!Number.isFinite(ts) || !ts) return null;
  return new Date(ts as number).toISOString().slice(0, 10);
}

function utcTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// The journal keeps ONE record per symbol/direction/pattern per UTC day, so a
// journal outcome only describes the card's setup if it is from today.
// Without this, yesterday's PASS would show on today's fresh "Ready" card.
function currentJournalStatus(match: LoggedSignal | undefined): SignalItem["journalStatus"] {
  if (!match) return undefined;
  const day = journalDayKey(match.timestamp);
  return day && day === utcTodayKey() ? match.status : undefined;
}

function isJournalMatchToday(match: LoggedSignal | undefined): boolean {
  if (!match) return false;
  const day = journalDayKey(match.timestamp);
  return !!day && day === utcTodayKey();
}

/** Map shared lifecycle status → SignalDesk journalStatus field. */
function lifecycleToCardJournalStatus(
  life: SignalLifecycleStatus,
  prior?: SignalItem["journalStatus"],
): SignalItem["journalStatus"] {
  if (life === "pass") return "PASS";
  if (life === "fail") return prior === "EXPIRED" ? "EXPIRED" : "FAIL";
  if (life === "active") return prior === "ACTIVE" ? "ACTIVE" : prior ?? "ACTIVE";
  return undefined;
}

function resolveCardStatus(
  journalStatus: SignalItem["journalStatus"],
  direction: "Up" | "Down" | string,
  entry: number,
  target: number,
  stop: number,
  livePrice: number,
  sessionHigh?: number,
  sessionLow?: number,
): SignalItem["journalStatus"] {
  const life = resolveSignalStatus({
    direction,
    entry,
    target,
    stop,
    livePrice,
    sessionHigh,
    sessionLow,
    journalStatus: journalStatus ?? null,
  });
  return lifecycleToCardJournalStatus(life, journalStatus);
}

// Which top-level Views bucket a View id lives under — e.g. "compressed",
// "expanded", "levelsabove", "levelsbelow", "R1AbovePR4", "BPS4",
// "touch", "copyViews". The map is generated from the view registry, so this
// stays in sync as registered Views or their navigation parents change.

/** Exclusive P-filter badge — same priority/colors as Screener View column. */
function exclusivePDayBadge(r: CPRResult | undefined | null): {
  text: string;
  className: string;
  style?: CSSProperties;
} | null {
  if (!r) return null;
  const conA = r.PD15MConsolidateAPass === true;
  const conB = r.PD15MBelowTCPass === true;
  const momA = r.PD15MAboveBCPass === true;
  const momB = r.PD15MMomentumBPass === true;
  const inside = r.PD15MInsideR1S1Pass === true;
  if (conB) {
    return {
      text: "P-CONSOLIDATE-B",
      className: "font-mono text-xs font-bold uppercase tracking-widest text-[#ff6bb5]",
      style: { color: "#ff6bb5" },
    };
  }
  if (momB) {
    return {
      text: "P-MOMENTUM-B",
      className: "font-mono text-xs font-bold uppercase tracking-widest text-violet-400",
    };
  }
  if (conA) {
    return {
      text: "P-CONSOLIDATE-A",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#03b07c" },
    };
  }
  if (momA) {
    return {
      text: "P-MOMENTUM-A",
      className: "font-mono text-xs font-bold uppercase tracking-widest text-cyan-400",
    };
  }
  if (inside) {
    return {
      text: "P-VOLATILE-R1S1",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#a3e635" },
    };
  }
  return null;
}

function getCategoryForViewId(id: string): string {
  for (const [category, subList] of Object.entries(Views)) {
    if (subList.some((sub) => sub.id === id)) return category;
  }
  return "";
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
  // Views without their own getEntry never produce a signal, so skip them
  // when auto-picking a matching View.
  return preferredViewId
    ? viewPills.find((v) => v.id === preferredViewId)
    : viewPills.find((v) => !!getView(v.id)?.getEntry && passesPattern(r, v.id));
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
//   • entry is the matched View's OWN getEntry(r) — each View pins its entry
//     to whichever CPR level fits its setup (TC, BC, R1, S1, ...). A View
//     that doesn't define getEntry has NO signal (returns null) — there is
//     no direction-based BC/TC fallback.
//   • stop is still fixed by direction alone (Up: today's S1, Down: today's R1)
export function computeSignalLevels(
  r: CPRResultWithSource,
  viewPills: { id: string; label: string }[],
  preferredViewId?: string
) {
  const primaryView = findPrimaryView(r, viewPills, preferredViewId);
  if (!primaryView) return null;

  const targetDef = getView(primaryView.id);
  if (!targetDef || !targetDef.getTarget || !targetDef.getEntry) return null;

  const isUp = targetDef.direction === "Up" || (targetDef.direction as string) === "bullish";
  const direction: "Up" | "Down" = isUp ? "Up" : "Down";
  const price = targetDef.getEntry(r); // entry
  const stopPrice = isUp ? r.todayCPR.s1 : r.todayCPR.r1;
  const targetPrice = targetDef.getTarget(r);
  const targetLevel = shortLevelLabel(targetDef.targetLabel);
  const entryLevel = shortLevelLabel(targetDef.entryLabel) || "";
  const stoplossLevel = shortLevelLabel(targetDef.stoplossLabel) || (isUp ? "S1" : "R1");
  const patternLabel = primaryView.label;
  const patternId = primaryView.id;
  const category = getCategoryForViewId(patternId);

  const risk = Math.max(0.0000001, Math.abs(price - stopPrice));
  const reward = Math.abs(targetPrice - price);
  const rrRatio = (reward / risk).toFixed(1);

  return {
    patternLabel,
    patternId,
    category,
    price,
    direction,
    targetPrice,
    stopPrice,
    targetLevel,
    entryLevel,
    stoplossLevel,
    rrRatio,
  };
}

// Single source of truth for turning a pool of CPRResultWithSource rows
// into `{id, label, count}` pills — every id/label in the tree, counted
// against whichever pool is passed in, zero-count ids dropped, sorted
// descending.
export function buildPills(pool: CPRResultWithSource[]) {
  const pillMap = new Map<
    string,
    {
      id: string;
      label: string;
      direction?: "Up" | "Down";
      activeColor?: string;
      activeText?: string;
      activeBg?: string;
    }
  >();
  for (const subList of Object.values(Views)) {
    for (const sub of subList) {
      if (!pillMap.has(sub.id)) {
        const v = getView(sub.id);
        const direction = v?.direction;
        const isBullish = direction === "Up";
        const isBearish = direction === "Down";
        pillMap.set(sub.id, {
          id: sub.id,
          label: sub.label || sub.id,
          direction,
          activeColor: sub.activeColor ?? (isBullish ? "#22c55e" : isBearish ? "#ff6bb5" : undefined),
          activeText: sub.activeText ?? (isBullish ? "#4ade80" : isBearish ? "#ff6bb5" : undefined),
          activeBg: sub.activeBg ?? (isBullish ? "rgba(34, 197, 94, 0.14)" : isBearish ? "rgba(251, 100, 182, 0.14)" : undefined),
        });
      }
    }
  }
  const list: {
    id: string;
    label: string;
    count: number;
    direction?: "Up" | "Down";
    activeColor?: string;
    activeText?: string;
    activeBg?: string;
  }[] = [];
  for (const [id, item] of pillMap.entries()) {
    const count = pool.filter((r) => passesPattern(r, id)).length;
    if (count > 0) {
      list.push({
        id,
        label: item.label,
        count,
        direction: item.direction,
        activeColor: item.activeColor,
        activeText: item.activeText,
        activeBg: item.activeBg,
      });
    }
  }
  return list.sort((a, b) => b.count - a.count);
}

function shallowEqualItem(a: SignalItem, b: SignalItem): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof SignalItem)[];
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

// One card. Memoised: every SignalItem field is a primitive, so a full field
// comparison lets a card skip re-rendering when a live tick rebuilt its item
// object but nothing it displays actually changed.
const SignalDeskCard = memo(
  function SignalDeskCard({
    item,
    copied,
    onCopy,
    onOpenInScreener,
  }: {
    item: SignalItem;
    copied: boolean;
    onCopy: (item: SignalItem) => void;
    onOpenInScreener: (signalId: string) => void;
  }) {
    const isUp = item.direction === "Up" || (item.direction as string) === "LONG";
    const isDown = item.direction === "Down" || (item.direction as string) === "SHORT";

    // Same STATUS as Screener under symbol. Journal PASS/FAIL win over Active/Ready.
    const tradeStatus: "pass" | "fail" | "active" | "ready" | null = !item.isSaved
      ? null
      : item.journalStatus === "PASS"
        ? "pass"
        : item.journalStatus === "FAIL"
          ? "fail"
          : item.isTriggered
            ? "active"
            : "ready";

    // Direction arrow left of symbol+status. Animate + bordered tile only when Active
    // (same style family as SIGNAL DESK header Radio tile).
    const isActiveStatus = tradeStatus === "active";
    const directionArrow =
      item.isSaved && (isUp || isDown) ? (
        <span
          className={
            isActiveStatus
              ? `shrink-0 flex items-center justify-center self-start w-7 h-7 rounded-lg border ${
                  isUp
                    ? "bg-emerald-500/20 border-emerald-500/40"
                    : "bg-[#ff6bb5]/15 border-[#ff6bb5]/45"
                }`
              : "shrink-0 flex items-center justify-center self-start w-5"
          }
          title={isUp ? "Up" : "Down"}
          aria-label={isUp ? "Up" : "Down"}
          style={{
            color: isUp ? "#34d399" : "#ff6bb5",
            animation: isActiveStatus
              ? isUp
                ? "sd-dir-up 1.15s ease-in-out infinite"
                : "sd-dir-down 1.15s ease-in-out infinite"
              : undefined,
          }}
        >
          {isUp ? (
            <ArrowUp className={isActiveStatus ? "w-4 h-4" : "w-3.5 h-3.5"} strokeWidth={2.75} />
          ) : (
            <ArrowDown className={isActiveStatus ? "w-4 h-4" : "w-3.5 h-3.5"} strokeWidth={2.75} />
          )}
        </span>
      ) : null;

    const statusUnderSymbol =
      tradeStatus === "pass" ? (
        <span
          className={`inline-flex w-fit shrink-0 items-center rounded-md border px-2 py-1 text-[11px] font-mono font-semibold leading-tight ${
            isDown
              ? "border-[#ff6bb5]/40 bg-[#ff6bb5]/10 text-[#ff6bb5]"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          }`}
          title="Target hit — outcome recorded in the Journal"
        >
          Pass
        </span>
      ) : tradeStatus === "fail" ? (
        <span
          className="inline-flex w-fit shrink-0 items-center rounded-md border px-2 py-1 text-[11px] font-mono font-semibold leading-tight text-red-400 border-red-400/40 bg-red-500/10"
          title="Stop hit — outcome recorded in the Journal"
        >
          Fail
        </span>
      ) : tradeStatus === "active" ? (
        <span
          className="inline-flex w-fit shrink-0 items-center rounded-md border border-lime-500/40 bg-lime-500/10 px-2 py-1 text-[11px] font-mono font-semibold leading-tight text-lime-400"
          title="Price has reached the entry line"
        >
          Active
        </span>
      ) : tradeStatus === "ready" ? (
        <span
          className="inline-flex w-fit shrink-0 items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-mono font-semibold leading-tight text-sky-300"
          title="Entry not yet touched"
        >
          Ready
        </span>
      ) : null;

    return (
      <div
        id={`sd-card-${item.source}-${item.symbol.toUpperCase()}`}
        className="bg-[#0f1724] border border-[#1e2d3d] hover:border-slate-600 rounded-xl p-4 transition-all flex flex-col justify-between shadow-lg"
      >
        {/* Card Top — clean 2-column layout:
            Left:  symbol+link + price
                   source + 24h change (left-aligned)
            Right: direction/status badges → timestamp → MATCH (right-aligned) */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-1.5 min-w-0 flex-1">
            {directionArrow}
            {/* 2x2 grid: symbol+status | price+change — direction arrow sits to the left */}
            <div className="grid grid-cols-[auto_auto] items-start justify-start gap-x-2 gap-y-0.5 min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-base sm:text-lg font-extrabold text-white font-mono tracking-tight leading-none truncate">
                  {item.symbol}
                </span>
                {hasKnownChartMapping(item.symbol, item.source) ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openChartInNewTab(getChartUrl(item.symbol, item.source));
                    }}
                    className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                    title="Open on TradingView"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                ) : (
                  <span
                    className="text-muted-foreground/30 cursor-not-allowed inline-flex shrink-0"
                    title="Not available on TradingView"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </span>
                )}
              </div>
              <div className="flex flex-col items-start justify-start leading-none gap-0">
                <span className="text-xs sm:text-sm font-bold text-white font-mono tabular-nums leading-none">
                  {fmt(item.currentPrice).replace(/,/g, "")}
                </span>
                <span
                  className={`text-[11px] font-mono font-bold leading-none mt-0 ${
                    (item.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmtPct(item.change24h ?? 0)}
                </span>
              </div>
              <div className="flex flex-col items-start gap-0.5 min-w-0">
                {statusUnderSymbol}
                {item.isSaved && item.isTriggered && item.triggeredAt && (
                  <span
                    className="text-[10px] font-mono text-slate-400 leading-none"
                    title="Time entry was crossed"
                  >
                    @ {item.triggeredAt}
                  </span>
                )}
                {(() => {
                  const tradfi = formatTradFiSubtitle(item.symbol);
                  if (!tradfi) return null;
                  return (
                    <span
                      className="text-[10px] leading-none text-sky-300/90 font-sans font-medium truncate max-w-[9rem]"
                      title={tradfi}
                    >
                      {tradfi}
                    </span>
                  );
                })()}
              </div>
            </div>
            </div>

            <div className="flex flex-col items-end text-right gap-1 shrink-0 min-w-0">
              {item.isSaved && typeof item.matchCount === "number" && typeof item.matchTotal === "number" && (
                <span
                  className={`inline-flex items-center gap-1 font-mono text-[11px] leading-none ${
                    item.matchFull
                      ? "text-green-400"
                      : item.matchCount >= item.matchTotal - 2
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
                  title={
                    item.matchFull
                      ? item.requireFullMatch
                        ? `MATCH: all ${item.matchTotal} levels matched (13/13 MATCH ON)`
                        : `MATCH: all ${item.matchTotal} levels matched`
                      : `MATCH: ${item.matchCount}/${item.matchTotal}${item.matchMismatches ? ` — broke: ${item.matchMismatches}` : ""}`
                  }
                >
                  MATCH {item.matchCount}/{item.matchTotal}
                  {item.matchFull && item.requireFullMatch ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : !item.matchFull ? (
                    <XCircle className="w-3.5 h-3.5" />
                  ) : null}
                </span>
              )}
            </div>
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
                <div className="text-[10px] text-emerald-400 font-sans flex items-center gap-0.5">
                  <Target className="w-2.5 h-2.5" /> Target
                </div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5">{fmt(item.targetPrice)}</div>
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
                <div className="text-[10px] text-rose-400 font-sans">Stop Loss</div>
                <div className="text-xs font-bold text-rose-400 mt-0.5">{fmt(item.stopPrice)}</div>
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
                <strong
                  className={`font-semibold ${
                    isUp ? "text-emerald-400" : isDown ? "text-[#ff6bb5]" : "text-slate-200"
                  }`}
                >
                  {item.isSaved ? item.patternName : ""}
                </strong>
              </div>
              <span className="font-mono text-slate-300">
                R/R: <strong className="text-white">{item.riskReward}</strong>
              </span>
            </div>
            {item.isSaved && item.patternId && (
              <div className="flex items-center gap-1">
                <span>Code:</span>
                <strong className="text-slate-400 font-mono text-[11px]">{item.patternId}</strong>
              </div>
            )}
            {item.isSaved && item.patternId && (
              <div className="flex items-center gap-1">
                <span>13/13 MATCH:</span>
                <strong
                  className={`font-semibold font-mono text-[11px] ${
                    item.requireFullMatch ? "text-emerald-400" : "text-slate-500"
                  }`}
                  title={
                    item.requireFullMatch
                      ? "This View requires full 13/13 level match (create/edit checkbox ON)"
                      : "This View does not require full 13/13 (create/edit checkbox OFF)"
                  }
                >
                  {item.requireFullMatch ? "ON" : "OFF"}
                </strong>
              </div>
            )}
            {item.isSaved &&
              (item.journalStatus === "PASS" ||
                item.journalStatus === "FAIL" ||
                item.isTriggered) && (
              <div className="flex items-center gap-1">
                <span>Status:</span>
                <strong
                  className={`font-semibold ${
                    item.journalStatus === "PASS"
                      ? "text-emerald-400"
                      : item.journalStatus === "FAIL"
                      ? "text-red-400"
                      : "text-lime-400"
                  }`}
                >
                  {item.journalStatus === "PASS"
                    ? "PASS"
                    : item.journalStatus === "FAIL"
                    ? "FAIL"
                    : `Active${item.triggeredAt ? ` @ ${item.triggeredAt}` : ""}`}
                </strong>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Up: Stoploss left · Entry (white) · Target right; Down: Target left · Entry · Stoploss */}
              {isDown ? (
                <>
                  <div className="flex items-center gap-1">
                    <span>Target:</span>
                    <Target className="w-3 h-3 text-emerald-400" />
                    <strong className="text-emerald-400 font-semibold font-mono">{item.targetLevel || "S2"}</strong>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>Entry:</span>
                    <strong className="text-white font-semibold font-mono">{item.entryLevel || "—"}</strong>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>Stoploss:</span>
                    <strong className="text-rose-400 font-semibold font-mono">{item.stoplossLevel || "S1"}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <span>Stoploss:</span>
                    <strong className="text-rose-400 font-semibold font-mono">{item.stoplossLevel || "S1"}</strong>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>Entry:</span>
                    <strong className="text-white font-semibold font-mono">{item.entryLevel || "—"}</strong>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>Target:</span>
                    <Target className="w-3 h-3 text-emerald-400" />
                    <strong className="text-emerald-400 font-semibold font-mono">{item.targetLevel || "R4"}</strong>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <span>PDay:</span>
              {item.pDayText ? (
                <strong className={item.pDayClassName || "text-slate-200"} style={item.pDayStyle}>
                  {item.pDayText}
                </strong>
              ) : (
                <strong className="text-slate-500 font-semibold">—</strong>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span>Category:</span>
              <strong className="text-slate-200 font-semibold">{getCategoryLabel(item.category)}</strong>
            </div>
          </div>
        </div>

        {/* Card Action Footer — Pivot Size (Screener column) + Copy */}
        <div className="pt-2 border-t border-[#1e2d3d] flex items-center justify-between gap-2">
          <div className="min-w-0 overflow-x-auto">
            {item.prevWidthPct != null &&
            item.todayWidthPct != null &&
            item.compressionRatio != null ? (
              renderPivotSizeCell(
                { widthPct: item.prevWidthPct },
                { widthPct: item.todayWidthPct },
                item.compressionRatio,
              )
            ) : (
              <span className="text-[10px] text-slate-500">Pivot size unavailable</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onCopy(item)}
              className="px-2 py-1 rounded bg-[#162130] hover:bg-[#1f2e42] border border-[#22354a] text-slate-300 text-xs font-medium flex items-center gap-1 transition"
              title="Copy signal details"
            >
              {copied ? (
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

  },
  (prev, next) =>
    prev.copied === next.copied &&
    prev.onCopy === next.onCopy &&
    prev.onOpenInScreener === next.onOpenInScreener &&
    shallowEqualItem(prev.item, next.item)
);

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
  focusSymbol,
  onFocusSymbolConsumed,
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedSignalId, setSelectedSignalId] = useState<string>(activeSignal || "");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [journalSignals, setJournalSignals] = useState<LoggedSignal[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchSavedSignalsFromCloud().then((saved) => {
      if (!cancelled) {
        setJournalSignals((previous) => {
          const byId = new Map(saved.map((signal) => [signal.id, signal]));
          previous.forEach((signal) => byId.set(signal.id, { ...byId.get(signal.id), ...signal }));
          return Array.from(byId.values());
        });
      }
    });
    const updateJournalSignals = (event: Event) => {
      const rows = (event as CustomEvent<{ signals?: LoggedSignal[] }>).detail?.signals;
      if (!rows?.length) return;
      setJournalSignals((previous) => {
        const byId = new Map(previous.map((signal) => [signal.id, signal]));
        rows.forEach((signal) => byId.set(signal.id, { ...byId.get(signal.id), ...signal }));
        return Array.from(byId.values());
      });
    };
    window.addEventListener(SIGNALS_JOURNAL_UPDATED_EVENT, updateJournalSignals);
    return () => {
      cancelled = true;
      window.removeEventListener(SIGNALS_JOURNAL_UPDATED_EVENT, updateJournalSignals);
    };
  }, []);

  // source:SYMBOL:patternId|patternName -> newest **today** journal row.
  // Yesterday's PASS/FAIL/ACTIVE must not paint today's cards after the
  // UTC day rolls (~5:30 AM IST) and Screener has rescanned.
  const journalByKey = useMemo(() => {
    const today = utcTodayKey();
    const map = new Map<string, LoggedSignal>();
    for (const saved of journalSignals) {
      const day = journalDayKey(saved.timestamp);
      if (day !== today) continue;
      const key = `${saved.source}:${saved.symbol.toUpperCase()}:${saved.patternId || saved.patternName || ""}`;
      const prev = map.get(key);
      if (!prev || (saved.timestamp || 0) > (prev.timestamp || 0)) map.set(key, saved);
    }
    return map;
  }, [journalSignals]);

  // useCallback so the big `signals` memo below only recomputes when the
  // journal actually changes, not on every render.
  const getJournalMatch = useCallback(
    (source: SourceId, symbol: string, patternId: string, patternName: string) => {
      const sym = symbol.toUpperCase();
      return (
        journalByKey.get(`${source}:${sym}:${patternId}`) ||
        journalByKey.get(`${source}:${sym}:${patternName}`) ||
        undefined
      );
    },
    [journalByKey]
  );

  const getTriggeredAt = useCallback(
    (source: SourceId, symbol: string, patternId: string, patternName: string) => {
      const match = getJournalMatch(source, symbol, patternId, patternName);
      if (!match) return undefined;
      return match.entryTimeSource === "exchange_trade" ? match.dateStr : "Entry time unverified";
    },
    [getJournalMatch]
  );

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

  const totalActiveSymbols = useMemo(() => {
    return displayViewPills.reduce((sum, p) => sum + p.count, 0);
  }, [displayViewPills]);

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

      // SignalDesk only shows Active-View symbols with a real signal
      // (entry/target levels). Plain scan rows must not become cards.
      const activeOnlySymbols = filteredSymbols.filter((sym) => {
        const matchedRow = activeSignalSymbols.get(sym.symbol);
        if (matchedRow) {
          return computeSignalLevels(matchedRow, viewPills, selectedSignalId || undefined) !== null;
        }
        // Lightweight symbols-only mode: trust parent scope when a View is selected.
        return activeSignalSymbols.size === 0 && isCurrentSignalActive;
      });

      return activeOnlySymbols.map((sym) => {
        const matchedRow = activeSignalSymbols.get(sym.symbol);
        const levels = matchedRow
          ? computeSignalLevels(matchedRow, viewPills, selectedSignalId || undefined)
          : null;
        const isEligible = true;

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
        let entryLevel: string;
        let stoplossLevel: string;

        if (levels) {
          targetPrice = levels.targetPrice;
          stopPrice = levels.stopPrice;
          targetLevel = levels.targetLevel;
          entryLevel = levels.entryLevel || "";
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
          entryLevel = "";
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
          entryLevel = "";
        }

        const rrRatio = levels
          ? levels.rrRatio
          : (Math.abs(targetPrice - price) / Math.max(0.0000001, Math.abs(price - stopPrice))).toFixed(1);

        const patternLabel = levels ? levels.patternLabel : label;
        // Fall back to the actual selected/active signal id (never a label)
        // so "Signal in Screener" always re-selects something ViewsSidebar
        // can match against sub.id.
        const patternId = levels ? levels.patternId : (selectedSignalId || activeSignal || "");

        // Triggered = today's journal row exists, OR live price has crossed
        // entry (provisional Active before auto-save). Yesterday's journal is
        // already excluded from journalByKey after the UTC day roll.
        const journalMatch = levels
          ? getJournalMatch(sym.source, sym.symbol, patternId, patternLabel)
          : undefined;
        const rawJournalStatus = currentJournalStatus(journalMatch);
        const priceTouched = levels
          ? hasTouchedEntry(levels.direction, levels.price, sym.currentPrice)
          : false;
        const rowForSession = resultsBySymbol.get(sym.symbol) ?? matchedRow;
        const journalStatus = levels
          ? resolveCardStatus(
              rawJournalStatus,
              levels.direction,
              levels.price,
              levels.targetPrice,
              levels.stopPrice,
              sym.currentPrice,
              rowForSession?.todayHigh,
              rowForSession?.todayLow,
            )
          : rawJournalStatus;
        // Active/Pass/Fail = not pure Ready
        const isTriggered =
          priceTouched ||
          journalStatus === "ACTIVE" ||
          journalStatus === "PASS" ||
          journalStatus === "FAIL" ||
          journalStatus === "EXPIRED";

        const triggeredAt = isJournalMatchToday(journalMatch)
          ? getTriggeredAt(sym.source, sym.symbol, patternId, patternLabel)
          : undefined;

        // MATCH (level-check) for this card's View — same score as Screener MATCH column
        const matchRow = resultsBySymbol.get(sym.symbol) ?? matchedRow;
        const matchDefs = patternId ? getView(patternId)?.levelCheckDefs : undefined;
        const matchLadder = matchRow
          ? getLadderMatchSummary(matchRow.prevCPR, matchRow.todayCPR, matchDefs)
          : null;
        const pDayBadge = exclusivePDayBadge(matchRow);

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
          entryLevel,
          stoplossLevel,
          pDayText: pDayBadge?.text,
          pDayClassName: pDayBadge?.className,
          pDayStyle: pDayBadge?.style,
          riskReward: `1:${rrRatio}`,
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
          triggeredAt,
          journalStatus,
          matchCount: matchLadder?.hasConditions ? matchLadder.matchingCount : undefined,
          matchTotal: matchLadder?.hasConditions ? matchLadder.total : undefined,
          matchFull: matchLadder?.hasConditions ? matchLadder.fullMatch : undefined,
          matchMismatches: matchLadder?.hasConditions ? matchLadder.mismatchLabels.join(", ") : undefined,
          requireFullMatch: patternId ? getView(patternId)?.requireFullMatch === true : undefined,
          prevWidthPct: matchRow?.prevCPR?.widthPct,
          todayWidthPct: matchRow?.todayCPR?.widthPct,
          compressionRatio: matchRow?.compressionRatio,
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
      // Only Active-View symbols — skip general scan rows with no signal.
      const isActiveSignalSymbol =
        activeSignalSymbols.has(r.symbol) && levels !== null;
      if (!isActiveSignalSymbol) continue;

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
      const entryLevel = levels ? levels.entryLevel || "" : "";
      const stoplossLevel = levels ? levels.stoplossLevel : (direction === "Up" ? "S1" : "R1");
      const pDay = exclusivePDayBadge(r);
      const rrRatio = levels
        ? levels.rrRatio
        : (Math.abs(targetPrice - price) / Math.max(0.0000001, Math.abs(price - stopPrice))).toFixed(1);

      // Triggered = today's journal row exists, OR live price has crossed
      // entry (provisional Active before auto-save). Yesterday's journal is
      // already excluded from journalByKey after the UTC day roll.
      const journalMatch = levels
        ? getJournalMatch(r.source, r.symbol, patternId, patternLabel)
        : undefined;
      const rawJournalStatus = currentJournalStatus(journalMatch);
      const priceTouched = levels
        ? hasTouchedEntry(levels.direction, levels.price, r.currentPrice)
        : false;
      const journalStatus = levels
        ? resolveCardStatus(
            rawJournalStatus,
            levels.direction,
            levels.price,
            levels.targetPrice,
            levels.stopPrice,
            r.currentPrice,
            r.todayHigh,
            r.todayLow,
          )
        : rawJournalStatus;
      const isTriggered =
        priceTouched ||
        journalStatus === "ACTIVE" ||
        journalStatus === "PASS" ||
        journalStatus === "FAIL" ||
        journalStatus === "EXPIRED";

      const triggeredAt = isJournalMatchToday(journalMatch)
        ? getTriggeredAt(r.source, r.symbol, patternId, patternLabel)
        : undefined;

      // MATCH (level-check) for this card's View — same score as Screener MATCH column
      const matchDefsB = patternId ? getView(patternId)?.levelCheckDefs : undefined;
      const matchLadderB = getLadderMatchSummary(r.prevCPR, r.todayCPR, matchDefsB);

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
        entryLevel,
        stoplossLevel,
        pDayText: pDay?.text,
        pDayClassName: pDay?.className,
        pDayStyle: pDay?.style,
        riskReward: `1:${rrRatio}`,
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
        triggeredAt,
        journalStatus,
        matchCount: matchLadderB.hasConditions ? matchLadderB.matchingCount : undefined,
        matchTotal: matchLadderB.hasConditions ? matchLadderB.total : undefined,
        matchFull: matchLadderB.hasConditions ? matchLadderB.fullMatch : undefined,
        matchMismatches: matchLadderB.hasConditions ? matchLadderB.mismatchLabels.join(", ") : undefined,
        requireFullMatch: patternId ? getView(patternId)?.requireFullMatch === true : undefined,
        prevWidthPct: r.prevCPR?.widthPct,
        todayWidthPct: r.todayCPR?.widthPct,
        compressionRatio: r.compressionRatio,
      });
    }

    // Signal Desk is Binance / NIFTY only: Delta / CoinDCX never become cards,
    // so they can't be shown, counted, or have their Journal rows synced.
    return list.filter((item) => isDeskSource(item.source));
  }, [symbols, results, viewPills, activeSignalSymbols, resultsBySymbol, selectedSignalId, activeSignal, activeSignalLabel, getTriggeredAt, getJournalMatch]);

  // Persist live Pass/Fail onto Journal so Desk / Journal stay aligned without
  // waiting for the Journal page's evaluate pass.
  const persistedOutcomesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const item of signals) {
        if (!item.isSaved || !item.patternName) continue;
        if (item.journalStatus !== "PASS" && item.journalStatus !== "FAIL") continue;
        const key = `${item.source}:${item.symbol}:${item.patternName}:${item.journalStatus}`;
        if (persistedOutcomesRef.current.has(key)) continue;
        persistedOutcomesRef.current.add(key);
        try {
          await persistLiveJournalOutcome({
            symbol: item.symbol,
            direction: item.direction,
            patternName: item.patternName,
            source: item.source,
            status: item.journalStatus,
            exitPrice: item.journalStatus === "PASS" ? item.targetPrice : item.stopPrice,
            notes:
              item.journalStatus === "PASS"
                ? `Target achieved (SignalDesk live sync @ ${item.currentPrice}).`
                : `Stop hit (SignalDesk live sync @ ${item.currentPrice}).`,
          });
        } catch {
          persistedOutcomesRef.current.delete(key);
        }
        if (cancelled) return;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [signals]);

  // Shared base filters (source / direction / search) — status is applied
  // separately so header counts stay stable when toggling Active/Ready/Pass/Fail.
  const baseFilteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
      if (directionFilter !== "all") {
        const isMatch =
          s.direction === directionFilter ||
          (directionFilter === "Up" && (s.direction as string) === "LONG") ||
          (directionFilter === "Down" && (s.direction as string) === "SHORT");
        if (!isMatch) return false;
      }
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
  }, [signals, sourceFilter, directionFilter, searchTerm]);

  const filteredSignals = useMemo(() => {
    return baseFilteredSignals.filter((s) => {
      // Active = entry touched and still open (not PASS/FAIL/EXPIRED).
      // Ready  = setup matched, entry not touched yet.
      // Pass/Fail = terminal journal outcomes only.
      const terminal =
        s.journalStatus === "PASS" ||
        s.journalStatus === "FAIL" ||
        s.journalStatus === "EXPIRED";
      if (statusFilter === "saved" && !(s.isTriggered && !terminal)) return false;
      if (statusFilter === "ready" && !(s.isSaved && !s.isTriggered && !terminal)) return false;
      if (statusFilter === "pass" && s.journalStatus !== "PASS") return false;
      if (statusFilter === "fail" && s.journalStatus !== "FAIL") return false;
      return true;
    });
  }, [baseFilteredSignals, statusFilter]);

  // Header stats scoped to Active-Signal membership (isSaved), using base
  // filters only so counts don't collapse when a status tab is selected.
  const stats = useMemo(() => {
    const activeSignalOnly = baseFilteredSignals.filter((s) => s.isSaved);
    const total = activeSignalOnly.length;
    const isTerminal = (s: SignalItem) =>
      s.journalStatus === "PASS" ||
      s.journalStatus === "FAIL" ||
      s.journalStatus === "EXPIRED";
    const saved = activeSignalOnly.filter((s) => s.isTriggered && !isTerminal(s)).length;
    const ready = activeSignalOnly.filter((s) => !s.isTriggered && !isTerminal(s)).length;
    const pass = activeSignalOnly.filter((s) => s.journalStatus === "PASS").length;
    const fail = activeSignalOnly.filter((s) => s.journalStatus === "FAIL").length;
    const upCount = activeSignalOnly.filter((s) => s.direction === "Up" || (s.direction as string) === "LONG").length;
    const downCount = activeSignalOnly.filter((s) => s.direction === "Down" || (s.direction as string) === "SHORT").length;
    const watch = activeSignalOnly.filter((s) => s.direction === "NEUTRAL").length;
    return { total, saved, ready, pass, fail, upCount, downCount, watch, longs: upCount, shorts: downCount };
  }, [baseFilteredSignals]);

  const handleCopy = useCallback((item: SignalItem) => {
    const text = `[PIVOT SIGNAL: ${item.symbol}] (${item.direction})
Pattern: ${item.patternName} (${item.type})
Source: ${item.source.toUpperCase()}
Entry / Trigger: ${fmt(item.triggerPrice)}
Target Level: ${fmt(item.targetPrice)}
Stop Level: ${fmt(item.stopPrice)}
R/R: ${item.riskReward}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // The parent passes inline arrow callbacks (new identity every render). Read
  // them through a ref so the memoised cards get a stable handler.
  const navRef = useRef({ onNavigateToScreener, onSelectSignal });
  navRef.current = { onNavigateToScreener, onSelectSignal };
  const handleOpenInScreener = useCallback((targetSignalId: string) => {
    const { onNavigateToScreener: navigate, onSelectSignal: select } = navRef.current;
    if (navigate) navigate(targetSignalId);
    else select?.(targetSignalId);
  }, []);

  // Entry-cross toast -> scroll to + highlight the symbol's card. Filters that
  // could hide it are cleared first. Retries briefly because the card may only
  // render after the mode / pattern / source switch settles.
  // When focusSymbol arrives (including automatically on toast, not only on
  // click), this effect runs without any user interaction.
  const focusConsumedRef = useRef(onFocusSymbolConsumed);
  focusConsumedRef.current = onFocusSymbolConsumed;
  useEffect(() => {
    if (!focusSymbol) return;
    // A Delta / CoinDCX toast has no card here; don't flip the shared source.
    if (!isDeskSource(focusSymbol.source)) {
      focusConsumedRef.current?.();
      return;
    }
    setSearchTerm("");
    setDirectionFilter("all");
    setStatusFilter("all");
    // Align local pattern filter + parent active signal with the toast's View
    // so the card is in the visible pool (not filtered out by a different pill).
    if (focusSymbol.patternId) {
      setSelectedSignalId(focusSymbol.patternId);
      onSelectSignal?.(focusSymbol.patternId);
    }
    if (sourceFilter !== "all" && sourceFilter !== focusSymbol.source) {
      setSourceFilter(focusSymbol.source);
    }
    const id = `sd-card-${focusSymbol.source}-${focusSymbol.symbol.toUpperCase()}`;
    let attempts = 0;
    let retryTimer: number | undefined;
    const tryFocus = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-cyan-400/70");
        // Deliberately NOT cleared in the effect cleanup: consuming the focus
        // below re-runs this effect's cleanup, which must not leave the ring on.
        window.setTimeout(() => el.classList.remove("ring-2", "ring-cyan-400/70"), 4000);
        focusConsumedRef.current?.();
        return;
      }
      if (++attempts < 12) {
        retryTimer = window.setTimeout(tryFocus, 150);
      } else {
        focusConsumedRef.current?.(); // give up quietly
      }
    };
    retryTimer = window.setTimeout(tryFocus, 80);
    return () => window.clearTimeout(retryTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSymbol]);

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

          <div className="shrink-0 bg-[#131b26] border border-emerald-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs">
            <span className="font-medium text-slate-300">
              Pass: <strong className="text-emerald-400 font-mono font-bold">{stats.pass}</strong>
            </span>
          </div>
          <div className="shrink-0 bg-[#131b26] border border-red-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs">
            <span className="font-medium text-slate-300">
              Fail: <strong className="text-red-400 font-mono font-bold">{stats.fail}</strong>
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
                ACTIVE VIEWS({displayViewPills.length}) / SIGNALS({totalActiveSymbols})
              </span>
            </div>
            <p className="text-[11px] text-slate-500 italic hidden sm:block">
              Select a different filter in the sidebar to refresh this list.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center max-h-36 overflow-y-auto">
            {displayViewPills.map((pill) => {
              const isSelected = selectedSignalId === pill.id;
              const isBullish = pill.direction === "Up" || pill.activeColor === "#22c55e";
              const isBearish = pill.direction === "Down" || pill.activeColor === "#ff6bb5";

              // Colors matching Screener / ViewsSidebar without border when highlighted:
              const activeBg =
                pill.activeBg ||
                (isBullish
                  ? "rgba(34, 197, 94, 0.14)"
                  : isBearish
                    ? "rgba(255, 107, 181, 0.18)"
                    : "rgba(255, 255, 255, 0.08)");
              const activeText =
                pill.activeText ||
                (isBullish ? "#4ade80" : isBearish ? "#ff9dce" : "#e2e8f0");
              const activeCountBg = isBullish
                ? "rgba(34, 197, 94, 0.25)"
                : isBearish
                  ? "rgba(255, 107, 181, 0.28)"
                  : "rgba(255, 255, 255, 0.15)";
              const activeCountText = isBullish
                ? "#86efac"
                : isBearish
                  ? "#ffc2e2"
                  : "#ffffff";

              return (
                <button
                  key={pill.id}
                  onClick={() => handlePillClick(pill.id)}
                  title={`Filter by ${pill.label} (${pill.count} pairs)`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all select-none cursor-pointer ${
                    isSelected
                      ? "shadow-sm"
                      : "bg-[#111927] hover:bg-[#182335] border border-[#1e2d3f] text-slate-300 hover:text-white"
                  }`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: activeBg,
                          color: activeText,
                          border: "none",
                        }
                      : undefined
                  }
                >
                  <span className="truncate max-w-[260px] sm:max-w-none">{pill.label}</span>
                  <span
                    className={`px-1.5 py-0.2 font-mono text-[10px] rounded-full font-bold ${
                      isSelected
                        ? ""
                        : "bg-[#182333] text-slate-400 border border-[#223347]"
                    }`}
                    style={
                      isSelected
                        ? {
                            backgroundColor: activeCountBg,
                            color: activeCountText,
                            border: "none",
                          }
                        : undefined
                    }
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
          {/* Direction Filter — grouped tab control (bordered container, like the
              Source filter), spaced apart from the Status and Source groups. */}
          <div className="flex gap-0.5 p-0.5 rounded-md border border-[#22354a] bg-[#151e2c] mr-5">
            <button
              onClick={() => setDirectionFilter("all")}
              className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                directionFilter === "all"
                  ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40"
                  : "text-slate-400 hover:text-white border border-transparent"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setDirectionFilter("Up")}
              className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                directionFilter === "Up"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-emerald-400/70 hover:text-emerald-300 border border-transparent"
              }`}
            >
              Up
            </button>
            <button
              onClick={() => setDirectionFilter("Down")}
              className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                directionFilter === "Down"
                  ? "bg-pink-400/20 text-[#ff6bb5] border border-pink-400/50"
                  : "text-rose-400/70 hover:text-rose-300 border border-transparent"
              }`}
            >
              Down
            </button>
          </div>

          {/* Status Filter — All / Active (open, in Journal) / Ready
              (watching for entry) / Pass / Fail. Active excludes terminal
              PASS/FAIL/EXPIRED outcomes so they only appear under Pass/Fail. */}
          <div className="flex gap-0.5 p-0.5 rounded-md border border-[#22354a] bg-[#151e2c] mr-3">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                statusFilter === "all"
                  ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter("saved")}
              className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                statusFilter === "saved"
                  ? "bg-lime-500/20 text-lime-400 border border-lime-500/40"
                  : "text-lime-400/70 hover:text-lime-300 border border-transparent"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter("ready")}
              className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                statusFilter === "ready"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : "text-sky-300/70 hover:text-sky-200 border border-transparent"
              }`}
            >
              Ready
            </button>
            <button
              onClick={() => setStatusFilter("pass")}
              className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                statusFilter === "pass"
                  ? "bg-green-500/20 text-green-400 border border-green-500/40"
                  : "text-green-400/70 hover:text-green-300 border border-transparent"
              }`}
            >
              Pass
            </button>
            <button
              onClick={() => setStatusFilter("fail")}
              className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                statusFilter === "fail"
                  ? "bg-red-500/20 text-red-400 border border-red-500/40"
                  : "text-red-400/70 hover:text-red-300 border border-transparent"
              }`}
            >
              Fail
            </button>
          </div>

          {/* Source Filter — Binance / NIFTY only (Delta & CoinDCX removed from switch). */}
          <div className="flex gap-0.5 p-0.5 rounded-md border border-[#22354a] bg-[#151e2c]">
            {(["binance", "nifty"] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setSourceFilter(src)}
                className={`px-3 py-1 rounded text-xs font-semibold transition border cursor-pointer ${
                  sourceFilter === src
                    ? src === "binance"
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/50"
                    : "text-slate-400 hover:text-slate-200 border-transparent"
                }`}
              >
                {src === "binance" ? "Binance" : "NIFTY"}
              </button>
            ))}
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
            {filteredSignals.map((item) => (
              <SignalDeskCard
                key={item.id}
                item={item}
                copied={copiedId === item.id}
                onCopy={handleCopy}
                onOpenInScreener={handleOpenInScreener}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
