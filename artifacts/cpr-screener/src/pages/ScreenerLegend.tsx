import { Views } from "@/lib/ViewsSidebar";
import { getView, shortLevelLabel } from "@/lib/views";
import {
  ArrowDown,
  ArrowUp,
  Crosshair,
  Flag,
  Hash,
  Shield,
  Tag,
  Target,
} from "lucide-react";

export interface ScreenerLegendFocusToast {
  /** Crossed coin symbol, e.g. "BTCUSDT" (shown in white above the View code). */
  symbol?: string;
  /** View / pattern id (toast View code). */
  signalCode: string;
  /** View direction — colors SignalCode green (Up) or rose (Down). */
  direction?: "Up" | "Down" | string;
  /** Exclusive previous-day class, e.g. "P-CONSOLIDATE-B" or "—". */
  pDayText: string;
  /** Level-check score, e.g. "11/13" or "—". */
  matchText: string;
}

export interface ScreenerLegendProps {
  activeSignal: string;
  /** @deprecated CPR Inside sub-filters removed; kept optional for callers. */
  showInsideCPRTiCOLo?: boolean;
  /**
   * When an entry-cross toast focuses a row, Card 2 shows SignalCode +
   * PDay + MATCH. All prior Card 2 pattern copy is removed.
   */
  focusToast?: ScreenerLegendFocusToast | null;
}

/**
 * Card 3 — when a View (or any left-nav leaf) is selected, replace the old
 * hardcoded bias/time copy with a compact trade sheet: name, code, direction,
 * entry / target / stoploss level labels from the View registry.
 */
function SelectedViewTradeCard({ activeSignal }: { activeSignal: string }) {
  const view = activeSignal ? getView(activeSignal) : undefined;
  if (!activeSignal) {
    return (
      <div className="text-[11px] text-muted-foreground">
        Select a View in the left nav to see entry, target, and stoploss.
      </div>
    );
  }

  const name = view?.label || activeSignal;
  const code = view?.key || activeSignal;
  const direction = view?.direction;
  const entryLvl = shortLevelLabel(view?.entryLabel) || view?.entryLabel || "—";
  const targetLvl = shortLevelLabel(view?.targetLabel) || view?.targetLabel || "—";
  const stopLvl = shortLevelLabel(view?.stoplossLabel) || view?.stoplossLabel || "—";
  const isUp = direction === "Up";
  const isDown = direction === "Down";
  const dirColor = isUp
    ? "text-emerald-400"
    : isDown
      ? "text-rose-400"
      : "text-slate-400";

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-start gap-1.5 min-w-0">
        <Tag className="w-3 h-3 mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-primary leading-tight truncate" title={name}>
            {name}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <Hash className="w-3 h-3 shrink-0 text-slate-500" aria-hidden />
        <span className="font-mono text-[10px] text-slate-300 truncate" title={code}>
          {code}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5 border-t border-border/60 text-[10px]">
        <span className={`inline-flex items-center gap-0.5 font-semibold uppercase tracking-wide ${dirColor}`}>
          {isUp ? (
            <ArrowUp className="w-3 h-3 shrink-0" aria-hidden />
          ) : isDown ? (
            <ArrowDown className="w-3 h-3 shrink-0" aria-hidden />
          ) : null}
          {direction || "—"}
        </span>
        <span className="inline-flex items-center gap-0.5 text-slate-300">
          <Crosshair className="w-3 h-3 shrink-0 text-slate-500" aria-hidden />
          <span className="text-muted-foreground">Entry</span>
          <strong className="font-mono text-foreground">{entryLvl}</strong>
        </span>
        <span className="inline-flex items-center gap-0.5 text-emerald-400/90">
          <Target className="w-3 h-3 shrink-0" aria-hidden />
          <span className="text-muted-foreground">Target</span>
          <strong className="font-mono text-emerald-400">{targetLvl}</strong>
        </span>
        <span className="inline-flex items-center gap-0.5 text-rose-400/90">
          <Shield className="w-3 h-3 shrink-0" aria-hidden />
          <span className="text-muted-foreground">SL</span>
          <strong className="font-mono text-rose-400">{stopLvl}</strong>
        </span>
      </div>
      {!view?.getEntry && !view?.getTarget && (
        <div className="text-[10px] text-muted-foreground">
          This View has no entry/target defined in the registry.
        </div>
      )}
    </div>
  );
}

/**
 * PDay value colors — same palette as the Active View (SignalDesk
 * exclusivePDayBadge): CON-B pink, MOM-B violet, CON-A green, MOM-A cyan,
 * INSIDE-R1S1 amber. Keep in sync with SignalDesk.tsx.
 */
const PDAY_COLORS: Record<string, string> = {
  "P-CONSOLIDATE-B": "#f472b6",
  "P-MOMENTUM-B": "#a78bfa",
  "P-CONSOLIDATE-A": "#03b07c",
  "P-MOMENTUM-A": "#22d3ee",
  "P-INSIDE-R1S1": "#fcd34d",
  "INSIDE-R1S1": "#fcd34d",
};

/**
 * Card 2 (middle) — only the toast-focused row's PDay + MATCH.
 * All previous pattern-description copy was removed by design.
 */
function FocusToastCard({ focusToast }: { focusToast?: ScreenerLegendFocusToast | null }) {
  if (!focusToast) {
    return (
      <div className="text-[11px] text-muted-foreground">
        Waiting for entry-cross toast…
      </div>
    );
  }
  const isUp = focusToast.direction === "Up";
  const isDown = focusToast.direction === "Down";
  const codeColor = isUp
    ? "text-emerald-400"
    : isDown
      ? "text-rose-400"
      : "text-slate-200";
  return (
    <div className="space-y-1 min-w-0">
      {focusToast.symbol && (
        <div
          className="text-xs font-bold font-mono text-white leading-tight truncate"
          title={focusToast.symbol}
        >
          {focusToast.symbol}
        </div>
      )}
      <div className="text-xs font-semibold font-mono leading-tight min-w-0">
        <span className={`${codeColor} truncate`} title={focusToast.signalCode}>
          {focusToast.signalCode || "—"}
        </span>
      </div>
      <div className="text-xs font-semibold font-mono leading-tight">
        <span className="text-muted-foreground">PDay:</span>
        <span
          className={PDAY_COLORS[focusToast.pDayText] ? undefined : "text-slate-200"}
          style={PDAY_COLORS[focusToast.pDayText] ? { color: PDAY_COLORS[focusToast.pDayText] } : undefined}
        >
          {focusToast.pDayText}
        </span>
      </div>
      <div className="text-xs font-semibold font-mono leading-tight">
        <span className="text-muted-foreground">MATCH:</span>
        <span className="text-sky-300">{focusToast.matchText}</span>
      </div>
    </div>
  );
}

/**
 * The 3-card legend grid shown above the controls row.
 * Card 1: category / pattern overview (unchanged).
 * Card 2: toast-focused row SignalCode + PDay + MATCH (no legacy pattern text).
 * Card 3: selected View trade sheet (name, code, direction, entry/target/stop).
 */
export default function ScreenerLegend(props: ScreenerLegendProps) {
  const { activeSignal, focusToast } = props;

  // Prefer a direct Views parent match; if activeSignal is a leaf View, walk
  // back to its parent category id (e.g. "overlapping-lower"), so Legend Card 1
  // still shows the parent's overview card instead of going blank when a
  // specific View is selected.
  function getLegendParentPattern(patternId: string): string {
    for (const [parentId, children] of Object.entries(Views)) {
      if (children.some((c) => c.id === patternId)) return parentId;
    }
    return patternId;
  }
  const legendPattern = getLegendParentPattern(activeSignal);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      <div className="rounded-lg border border-border bg-card p-3">
        {/* Card 1 — category overview. Keyed on activeSignal's parent category.
            The old "ADK CPR Formula" fallback for unmatched patterns has been
            removed entirely — unmatched patterns now render empty until the
            left nav (pivotcategories array in ViewsSidebar.tsx). */}
        {legendPattern === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-primary mb-1">Overlapping Lower</div>
            <div className="text-xs text-muted-foreground">Today CPR overlaps below prev CPR</div>
          </>
        ) : legendPattern === "levelsabove" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Levels Above</div>
            <div className="text-xs text-muted-foreground">Price structure leaning higher vs prior session</div>
          </>
        ) : legendPattern === "levelsbelow" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Levels Below</div>
            <div className="text-xs text-muted-foreground">Price structure leaning lower vs prior session</div>
          </>
        ) : legendPattern === "compressed" ? (
          <>
            <div className="text-xs font-semibold text-amber-400 mb-1">Compressed CPR</div>
            <div className="text-xs text-muted-foreground">Narrow CPR — breakout potential</div>
          </>
        ) : legendPattern === "expanded" ? (
          <>
            <div className="text-xs font-semibold text-cyan-400 mb-1">Expanded CPR</div>
            <div className="text-xs text-muted-foreground">Wide CPR — range / mean-reversion bias</div>
          </>
        ) : legendPattern === "inside-cpr" ? (
          <>
            <div className="text-xs font-semibold text-accent mb-1">Inside CPR</div>
            <div className="text-xs text-muted-foreground">Today CPR fully inside previous CPR</div>
          </>
        ) : legendPattern === "equal-cpr" ? (
          <>
            <div className="text-xs font-semibold text-primary mb-1">Equal CPR</div>
            <div className="text-xs text-muted-foreground">Today CPR width matches previous</div>
          </>
        ) : legendPattern === "R1AbovePR4" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">ABOVE LEVEL4</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500 text-white">Above L4</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s R1 above prev day&apos;s R4</div>
          </>
        ) : legendPattern === "BPS4" || legendPattern === "S1BelowPS4" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">BELOW LEVEL4</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive text-white">Below L4</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s S1 below prev day&apos;s S4</div>
          </>
        ) : activeSignal ? (
          <>
            <div className="flex items-center gap-1 mb-1">
              <Flag className="w-3 h-3 text-primary shrink-0" aria-hidden />
              <span className="text-xs font-semibold text-primary truncate">{activeSignal}</span>
            </div>
            <div className="text-xs text-muted-foreground">Selected pattern / View</div>
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground">Select a category or View</div>
        )}
      </div>

      {/* Card 2: toast-focused row — PDay + MATCH only */}
      <div className="rounded-lg border border-border bg-card p-3">
        <FocusToastCard focusToast={focusToast} />
      </div>

      {/* Card 3: selected View — name, code, direction, entry / target / stop */}
      <div className="rounded-lg border border-border bg-card p-3">
        <SelectedViewTradeCard activeSignal={activeSignal} />
      </div>
    </div>
  );
}
