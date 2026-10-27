import { useEffect, useMemo, useState } from "react";
import { getView, shortLevelLabel } from "@/lib/views";
import { buildBacktestOptions } from "@/lib/backtest";
import {
  chartLinkRecordsFromLocalCache,
  findHistoricalChartLinks,
  getAllChartLinkRecords,
  type HistoricalChartLink,
  type StoredChartLinkRecord,
} from "@/lib/chartLinks";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Crosshair,
  Hash,
  Shield,
  Tag,
  Target,
} from "lucide-react";

export interface ScreenerLegendFocusToast {
  /** Crossed coin symbol, e.g. "BTCUSDT" (shown in white above the View code). */
  symbol?: string;
  /** Exchange of the toast row (binance / delta / coindcx) for chart-link match. */
  source?: string;
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
   * PDay + MATCH. Card 1 shows the View name and its chart-link cameras.
   */
  focusToast?: ScreenerLegendFocusToast | null;
}


function formatChartDate(entryDate?: string, savedAt?: string): string {
  const raw = entryDate || (savedAt ? savedAt.slice(0, 10) : "");
  if (!raw) return "";
  const d = new Date(raw + (raw.length === 10 ? "T00:00:00.000Z" : ""));
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
}

/**
 * Every id that may have been stored as lastViewKey for this View.
 *
 * For concrete / Created Views (kind === "view") we keep the list tight
 * (exact key + label only) so Legend Card 2 cameras do not leak
 * attachments from parent patterns or sibling Views.
 *
 * Broader aliases (parent chain + Backtest composite paths) are kept
 * only for pure pattern / category nodes.
 */
export function viewKeyAliases(viewKey?: string): string[] {
  const raw = (viewKey || "").trim();
  if (!raw) return [];
  const aliases = new Set<string>();
  const add = (s?: string | null) => {
    const t = (s || "").trim();
    if (t) aliases.add(t);
  };

  add(raw);
  const resolved = getView(raw);
  const leafKey = resolved?.key || raw;
  add(leafKey);
  add(resolved?.label);

  // Strict mode for concrete Views — no parent / path leakage.
  const isConcreteView = resolved?.kind === "view";
  if (isConcreteView) {
    return [...aliases];
  }

  // Parent pattern chain (only for pattern / category nodes)
  const parents: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = resolved?.parentKey;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    parents.push(cur);
    add(cur);
    cur = getView(cur)?.parentKey;
  }

  try {
    const opts = buildBacktestOptions();
    for (const o of opts) {
      if (o.kind === "view" && (o.viewKey === leafKey || o.viewKey === raw)) {
        add(o.viewKey);
        add(o.patternKey);
        add(o.value);
      }
      if (o.kind === "pattern") {
        const last = o.value.split("::").pop() || "";
        const owns =
          (o.patternKey && (o.patternKey === leafKey || parents.includes(o.patternKey))) ||
          last === leafKey ||
          parents.includes(last);
        if (!owns) continue;
        add(o.value);
        add(o.patternKey);
        const parts = o.value.split("::");
        // Intermediate paths (skip bare category-only n=1)
        for (let n = 2; n <= parts.length; n++) {
          add(parts.slice(0, n).join("::"));
        }
        for (const seg of parts) add(seg);
      }
    }
  } catch {
    /* registry unavailable — key/label still apply */
  }

  return [...aliases];
}

/** Camera badges for historical TradingView snapshots (same affordance as BacktestPanel). */
function HistoricalChartCameras({
  viewKey,
  symbol,
  source,
  // ~1 trading month of snapshots (was 3 — older View attachments never appeared)
  limit = 40,
  emptyText,
}: {
  viewKey?: string;
  symbol?: string;
  source?: string;
  limit?: number;
  /** Shown instead of nothing when the View has no saved chart links. */
  emptyText?: string;
}) {
  // Seed from local cache immediately (Backtest saves here); refresh from Firestore.
  const [records, setRecords] = useState<StoredChartLinkRecord[]>(() =>
    chartLinkRecordsFromLocalCache(),
  );

  useEffect(() => {
    let cancelled = false;
    // Re-read local cache when View changes (storage may have updated in Backtest).
    setRecords(chartLinkRecordsFromLocalCache());
    getAllChartLinkRecords()
      .then((recs) => {
        if (!cancelled) setRecords(recs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [viewKey, symbol, source]);

  const aliases = useMemo(() => viewKeyAliases(viewKey), [viewKey]);

  const links = useMemo(
    () =>
      findHistoricalChartLinks({
        records,
        viewKey: viewKey || "",
        viewKeys: aliases,
        symbol,
        source,
        excludeToday: true,
        limit,
      }),
    [records, viewKey, aliases, symbol, source, limit],
  );

  if (!viewKey) return null;
  if (links.length === 0) {
    return emptyText ? <div className="text-[11px] text-muted-foreground">{emptyText}</div> : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-0">
      {links.map((link) => (
        <HistoricalCameraBadge key={`${link.id}-${link.url}`} link={link} />
      ))}
    </div>
  );
}

function HistoricalCameraBadge({ link }: { link: HistoricalChartLink }) {
  const label = formatChartDate(link.entryDate, link.savedAt);
  const title = [
    "Historical chart snapshot",
    link.symbol ? `Symbol: ${link.symbol}` : null,
    label ? `Day: ${label}` : null,
    link.viewKey ? `View: ${link.viewKey}` : null,
    "Click to open in new tab",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 h-4 max-w-[4.5rem] rounded px-1 bg-sky-500/20 text-sky-400 hover:bg-sky-500/35 hover:text-sky-200 border border-sky-500/40 hover:border-sky-300 transition-all shrink-0 cursor-pointer shadow-sm shadow-sky-950/40"
      title={title}
    >
      <Camera className="w-2.5 h-2.5 shrink-0" />
      {label ? (
        <span className="text-[9px] font-mono leading-none truncate">{label}</span>
      ) : null}
    </a>
  );
}


/**
 * Card 1 (left) — View name on the first row, then every saved chart-link
 * camera for that View from the second row on (wraps onto further rows).
 * Replaces the old category-overview copy; the cameras used to sit next to
 * MATCH in Card 2.
 */
function ViewCamerasCard({ viewKey }: { viewKey: string }) {
  if (!viewKey) {
    return <div className="text-[11px] text-muted-foreground">Select a category or View</div>;
  }
  const view = getView(viewKey);
  const name = view?.label || viewKey;
  const nameColor =
    view?.direction === "Up"
      ? "text-emerald-400"
      : view?.direction === "Down"
        ? "text-rose-400"
        : "text-slate-200";
  return (
    <div className="space-y-1.5 min-w-0">
      <div className={`text-xs font-bold leading-tight truncate ${nameColor}`} title={name}>
        {name}
      </div>
      {/* Capped height so many cameras scroll inside the card instead of stretching the legend row. */}
      <div className="max-h-[7.5rem] overflow-y-auto pr-0.5">
        <HistoricalChartCameras
          viewKey={viewKey}
          limit={40}
          emptyText="No chart snapshots saved for this View yet."
        />
      </div>
    </div>
  );
}

/**
 * Card 3 — when a View (or any left-nav leaf) is selected, replace the old
 * hardcoded bias/time copy with a compact trade sheet: name, code, direction,
 * entry / target / stoploss level labels from the View registry.
 */
function SelectedViewTradeCard({ activeSignal, symbol }: { activeSignal: string; symbol?: string }) {
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
        {symbol ? null : <Tag className={`w-3 h-3 mt-0.5 shrink-0 ${dirColor}`} aria-hidden />}
        <div className="min-w-0 flex-1">
          {symbol ? (
            // A row is focused: its symbol takes the top row (View name lives in Card 2).
            <div className="text-xs font-bold font-mono text-white leading-tight truncate" title={symbol}>
              {symbol}
            </div>
          ) : (
            <div className={`text-[11px] font-semibold leading-tight truncate ${dirColor}`} title={name}>
              {name}
            </div>
          )}
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
 * P-VOLATILE-R1S1 lime. Keep in sync with SignalDesk.tsx.
 */
const PDAY_COLORS: Record<string, string> = {
  "P-CONSOLIDATE-B": "#ff6bb5",
  "P-MOMENTUM-B": "#a78bfa",
  "P-CONSOLIDATE-A": "#03b07c",
  "P-MOMENTUM-A": "#22d3ee",
  "P-VOLATILE-R1S1": "#a3e635",
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
  const viewKey =
    focusToast.signalCode && focusToast.signalCode !== "—"
      ? focusToast.signalCode
      : undefined;
  const viewName = (viewKey && getView(viewKey)?.label) || viewKey || "";
  return (
    <div className="space-y-1 min-w-0">
      {viewName && (
        <div
          className={`text-xs font-bold leading-tight truncate ${codeColor}`}
          title={viewName}
        >
          {viewName}
        </div>
      )}
      <div
        className={`text-[11px] font-semibold font-mono leading-tight ${codeColor} truncate`}
        title={focusToast.signalCode}
      >
        {focusToast.signalCode || "—"}
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
 * Card 1: View name, then the View's chart-link cameras (second row onward).
 * Card 2: toast-focused row SignalCode + PDay + MATCH (no legacy pattern text).
 * Card 3: selected View trade sheet (name, code, direction, entry/target/stop).
 */
export default function ScreenerLegend(props: ScreenerLegendProps) {
  const { focusToast } = props;
  // The toast-focused row's View wins; otherwise the left-nav selection.
  // Cards 1 and 3 both fill in from this same View.
  const focusedViewCode =
    focusToast?.signalCode && focusToast.signalCode !== "—" ? focusToast.signalCode : "";
  const shownView = focusedViewCode || props.activeSignal;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      {/* Card 1: View name (row 1) + chart-link cameras (row 2 onward) */}
      <div className="rounded-lg border border-border bg-card p-3">
        <ViewCamerasCard viewKey={shownView} />
      </div>

      {/* Card 2: toast-focused row — PDay + MATCH only */}
      <div className="rounded-lg border border-border bg-card p-3">
        <FocusToastCard focusToast={focusToast} />
      </div>

      {/* Card 3: selected View — name, code, direction, entry / target / stop */}
      <div className="rounded-lg border border-border bg-card p-3">
        <SelectedViewTradeCard
          activeSignal={shownView}
          symbol={focusToast?.symbol}
        />
      </div>
    </div>
  );
}
