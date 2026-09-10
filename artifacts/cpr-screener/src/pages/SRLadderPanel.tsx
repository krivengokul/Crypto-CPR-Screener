import { useState, useEffect, type ReactNode } from "react";
import { Link2, Loader2 } from "lucide-react";
import type { CPRLevels, CPRResult } from "@/lib/cpr";
import { fmt } from "./ScreenerUtils";
import { SRLadderDiffPanel, type LevelCheckCondition } from "./SRLadderDiff";
import { getChartLink, setChartLink, removeChartLink, type StoredChartLink } from "@/lib/chartLinks";

/**
 * Small inline control for attaching a TradingView snapshot link to a
 * specific row (rowKey), rendered inside SRLadderPanel/SRLadderRow so
 * it's automatically available anywhere that panel is used (BacktestPanel
 * today, Screener once wired up later). Chart links are stored at the
 * symbol-date level (${rowKey}) so saving a chart under Top 15 Gainers
 * or any other pattern makes it immediately visible across all patterns.
 *
 * Backed by Firestore (chartLinks.ts) — reads/writes are async, so this
 * tracks its own loading state rather than resolving the saved link
 * synchronously on first render.
 */
function ChartLinkControl({ viewKey, rowKey }: { viewKey: string; rowKey: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<StoredChartLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getChartLink(viewKey, rowKey).then((link) => {
      if (!cancelled) {
        setSaved(link);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [viewKey, rowKey]);

  function openForm() {
    setUrl(saved?.url ?? "");
    setError("");
    setOpen(true);
  }

  async function confirm() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a TradingView snapshot link first.");
      return;
    }
    setSaving(true);
    const ok = await setChartLink(viewKey, rowKey, trimmed);
    setSaving(false);
    if (!ok) {
      setError("Couldn't save — check your connection and try again.");
      return;
    }
    const fresh = await getChartLink(viewKey, rowKey);
    setSaved(fresh);
    setOpen(false);
  }

  async function clear() {
    setSaving(true);
    await removeChartLink(viewKey, rowKey);
    setSaving(false);
    setSaved(null);
    setOpen(false);
  }

  if (loading) {
    return (
      <div className="inline-flex w-fit items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Chart link
      </div>
    );
  }

  if (!open) {
    if (saved) {
      return (
        <div className="flex w-fit items-center gap-1">
          <a
            href={saved.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20"
            title={saved.url}
          >
            <Link2 className="w-3 h-3" />
            Chart
          </a>
          <button
            type="button"
            onClick={openForm}
            className="rounded-md border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            title="Change chart link"
          >
            Edit
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={openForm}
        className="inline-flex w-fit items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        title="Attach a TradingView chart link to this View's read of this signal"
      >
        <Link2 className="w-3 h-3" />
        Attach chart
      </button>
    );
  }

  return (
    <div className="flex w-full min-w-[260px] max-w-[320px] flex-col gap-1.5 rounded-md border border-border bg-popover p-2 shadow-sm">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Chart link</span>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste TradingView snapshot URL"
        disabled={saving}
        className="w-full bg-background border border-border rounded-md px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
      {error && <span className="text-[10px] text-destructive">{error}</span>}
      <div className="flex justify-end gap-1.5 pt-0.5">
        {saved && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="mr-auto rounded-md px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={saving}
          className="rounded-md bg-blue-500/20 px-2 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-500/30 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/**
 * Shared S/R Ladder building blocks.
 *
 * Both the Screener results table (ScreenerTableRow) and the Backtest
 * results tables (BacktestPanel) render the exact same expandable
 * "click the symbol → ADK S/R ladder" panel, so the markup lives here
 * once and is imported by both.
 */

/** Minimal data an SR ladder panel needs. A full CPRResult satisfies it. */
export interface SRLadderData {
  todayCPR: CPRLevels;
  prevCPR: CPRLevels;
  ppCPR?: CPRLevels;
  /** Live/entry-day price. Omit to render the ladder without the price row. */
  currentPrice?: number;
  /** Previous-day close price — shown as the "Close" row in the PDay S/R ladder. */
  prevClose?: number;
  /** PDay-1 close price — shown as the "Close" row in the PDay-1 S/R ladder. */
  ppClose?: number;
  r4Distance?: number;
  s4Distance?: number;
}

/** Narrow a full CPRResult (or a backtest row) down to SRLadderData. */
export function toSRLadderData(
  r: Partial<CPRResult> & {
    todayCPR: CPRLevels;
    prevCPR: CPRLevels;
    ppCPR?: CPRLevels;
  },
  currentPriceOverride?: number,
  prevCloseOverride?: number,
  ppCloseOverride?: number
): SRLadderData {
  return {
    todayCPR: r.todayCPR,
    prevCPR: r.prevCPR,
    ppCPR: r.ppCPR,
    currentPrice: currentPriceOverride ?? (r as { currentPrice?: number }).currentPrice,
    prevClose: prevCloseOverride ?? (r as { prevClose?: number }).prevClose,
    ppClose: ppCloseOverride ?? (r as { ppClose?: number }).ppClose,
    r4Distance: (r as { r4Distance?: number }).r4Distance,
    s4Distance: (r as { s4Distance?: number }).s4Distance,
  };
}

/**
 * ADK-style S/R Ladder.
 *
 * Shows all CPR levels in the same order as "CPR by Ask Dinesh Kumar (ADK)":
 *   R4, R3, R2, PH (Previous High), R1, TC, Pivot, BC, PL (Previous Low), S1, S2, S3, S4
 *
 * The live price row is inserted at the correct position in the ladder.
 */
export function SRLadder({
  cpr,
  currentPrice,
  label,
  badge,
  pricePlain = false,
}: {
  cpr: CPRLevels;
  /** Omit when no price is known (e.g. historical backtest rows). */
  currentPrice?: number;
  label: string;
  /**
   * Optional pattern badge(s) for the day this ladder represents (e.g.
   * renderTodayPatternBadges(r) for "Today S/R", renderPrevPatternBadge(r)
   * for "PrevDay S/R"). Rendered inline, to the RIGHT of the header label. Omit when there's no pattern to show (e.g. "PDay-1
   * S/R" has no earlier CPR to compare against).
   */
  badge?: ReactNode;
  /**
   * When true, the row is rendered as "Close" (not "Price"), without the
   * emerald background, bold weight, or arrow indicator — plain white text
   * matching the other rows. Used for PDay S/R and PDay-1 S/R so the live
   * Today S/R price row keeps its own highlighted styling.
   */
  pricePlain?: boolean;
}) {
  const levels = [
    { key: "R4",    value: cpr.r4 },
    { key: "R3",    value: cpr.r3 },
    { key: "R2",    value: cpr.r2 },
    { key: "PH",    value: cpr.prevHigh },
    { key: "R1",    value: cpr.r1 },
    { key: "TC",    value: cpr.tc },
    { key: "Pivot", value: cpr.pivot },
    { key: "BC",    value: cpr.bc },
    { key: "PL",    value: cpr.prevLow },
    { key: "S1",    value: cpr.s1 },
    { key: "S2",    value: cpr.s2 },
    { key: "S3",    value: cpr.s3 },
    { key: "S4",    value: cpr.s4 },
  ].sort((a, b) => b.value - a.value);

  type Row =
    | { type: "level"; key: string; value: number }
    | { type: "price" };

  const hasPrice = typeof currentPrice === "number" && isFinite(currentPrice);
  const rows: Row[] = [];
  let priceInserted = !hasPrice;
  for (const lvl of levels) {
    if (!priceInserted && (currentPrice as number) > lvl.value) {
      rows.push({ type: "price" });
      priceInserted = true;
    }
    rows.push({ type: "level", key: lvl.key, value: lvl.value });
  }
  if (!priceInserted) rows.push({ type: "price" });

  const rowColor = (key: string) => {
    if (key === "TC") return "text-sky-400";
    if (key === "Pivot") return "text-yellow-300";
    if (key === "BC") return "text-sky-400";
    if (key === "PH") return "text-fuchsia-500";
    if (key === "PL") return "text-fuchsia-500";
    if (key.startsWith("R")) return "text-green-400";
    return "text-red-400";
  };

  return (
    <div className="w-[160px] min-w-0">
      <div className="mb-1.5 flex flex-nowrap items-center gap-1.5 pl-2 text-left">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        {badge && (
          <span className="inline-flex shrink-0 translate-y-[-1px] items-center">
            {badge}
          </span>
        )}
      </div>
      {rows.map((row, i) =>
        row.type === "price" ? (
          <div
            key={`price-${i}`}
            className={`grid grid-cols-[3.5rem_auto] justify-start gap-1 w-fit text-white text-xs px-2 py-0.5 rounded my-0.5 ${
              pricePlain ? "" : "bg-emerald-700/70 font-bold"
            }`}
          >
            <span>{pricePlain ? "Close" : "▶ Price"}</span>
            <span className="font-mono">{fmt(currentPrice as number)}</span>
          </div>
        ) : (
          <div
            key={row.key}
            className={`grid grid-cols-[3.5rem_auto] justify-start gap-1 text-xs px-2 py-0.5 rounded ${rowColor(row.key)}`}
          >
             <span>{row.key}</span>
            <span className="font-mono">{fmt(row.value)}</span>
          </div>
        )
      )}
    </div>
  );
}

/** Ordered level keys, matching the ADK ladder order (top/highest to bottom/lowest). */
const LEVEL_KEYS = [
  "r4",
  "r3",
  "r2",
  "prevHigh",
  "r1",
  "tc",
  "pivot",
  "bc",
  "prevLow",
  "s1",
  "s2",
  "s3",
  "s4",
] as const;

function levelLabel(key: (typeof LEVEL_KEYS)[number]): string {
  if (key === "prevHigh") return "PH";
  if (key === "prevLow") return "PL";
  if (key === "pivot") return "PV";
  return key.toUpperCase();
}

/** Same color coding as SRLadder's rowColor, expressed as hex for SVG stroke/fill. */
function levelColor(key: (typeof LEVEL_KEYS)[number]): string {
  if (key === "tc") return "#38bdf8"; // sky-400 (swapped with PH/PL)
  if (key === "pivot") return "#fde047"; // yellow-300
  if (key === "bc") return "#38bdf8"; // sky-400 (swapped with PH/PL)
  if (key === "prevHigh") return "#FF00FF"; // fuchsia (swapped with BC)
  if (key === "prevLow") return "#FF00FF"; // fuchsia (swapped with BC)
  if (key.startsWith("r")) return "#4ade80"; // green-400
  return "#ff2e2e"; // S1-S4, brighter red
}

/**
 * Nudges vertically-overlapping SVG text labels apart while preserving
 * their top-to-bottom order, using minimal movement.
 *
 * Two-pass relaxation: a forward pass pushes each label down until it's
 * at least `minGap` below the previous one, then a backward pass pulls
 * labels back up wherever the forward pass over-corrected (e.g. a single
 * crowded cluster shouldn't drag every label below it downward). Returns
 * a Map from each entry's key to its adjusted y — the line/tick itself
 * should still be drawn at the true (un-adjusted) y; only the text uses
 * the adjusted value.
 */
function declutterLabelPositions(
  entries: { key: string; y: number }[],
  minGap: number
): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.y - b.y);
  const n = sorted.length;
  const adjusted = sorted.map((e) => e.y);

  for (let i = 1; i < n; i++) {
    adjusted[i] = Math.max(adjusted[i], adjusted[i - 1] + minGap);
  }
  for (let i = n - 2; i >= 0; i--) {
    adjusted[i] = Math.min(adjusted[i], adjusted[i + 1] - minGap);
  }

  const result = new Map<string, number>();
  sorted.forEach((e, i) => result.set(e.key, adjusted[i]));
  return result;
}

/**
 * Line chart replacing the old PDay-1/Prev/Today CPR mini-cards.
 *
 * Plots the Prev Day and Today CPR ladders as horizontal lines on a shared
 * price axis (no live price, no candles) so the two days' R/S/PH/PL/CPR
 * levels can be compared at a glance, using the same color coding as the
 * S/R ladders. The middle band (PH through S1) is expanded vertically
 * because those levels are usually tightly clustered; the outer R/S levels
 * retain their own compact bands so their ordering remains visible too.
 */
function CPRLevelChart({
  prevCPR,
  todayCPR,
  pivotPatternBadge,
}: {
  prevCPR: CPRLevels;
  todayCPR: CPRLevels;
  /** PivotPattern badge (e.g. renderPivotPatternBadge(r)) — shown inline next to the "Levels VIEW" label. */
  pivotPatternBadge?: ReactNode;
}) {
  const width = 480;
  // Keep the chart compact when it sits beside the ladders. The ladders
  // remain the readable, full-size value reference next to it.
  const height = 300;
  // Fixed, fairly tight canvas (paired with a matching fixed-width wrapper
  // below) instead of letting the chart stretch via flex-grow — that's what
  // was pushing "Today S/R" far to the right with a dead gap in between.
  // Left-aligned: the "Levels VIEW" header hugs the left edge, so keep
  // leftMargin small and reserve just enough rightMargin for the "today"
  // labels, rather than splitting the leftover space evenly.
  const leftMargin = 30;
  const rightMargin = 110;
  const plotWidth = width - leftMargin - rightMargin;
  const prevSegmentEnd = leftMargin + plotWidth * 0.5;

  const allValues = LEVEL_KEYS.flatMap((k) => [
    prevCPR[k as keyof CPRLevels] as number,
    todayCPR[k as keyof CPRLevels] as number,
  ]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.01 || 1;
  const domainMin = min - pad;
  const domainMax = max + pad;
  // A linear scale makes the important middle levels nearly indistinguishable
  // when R2-R4 and S2-S4 are far away. Allocate most of the chart height to
  // PH, R1, TC, Pivot, BC, PL and S1, while keeping the outer levels visible.
  const focusKeys = LEVEL_KEYS.slice(3, 10);
  const focusValues = focusKeys.flatMap((k) => [
    prevCPR[k as keyof CPRLevels] as number,
    todayCPR[k as keyof CPRLevels] as number,
  ]);
  const focusMin = Math.min(...focusValues);
  const focusMax = Math.max(...focusValues);
  const focusPad =
    (focusMax - focusMin) * 0.12 ||
    (max - min) * 0.02 ||
    Math.abs(focusMax) * 0.01 ||
    1;
  const focusDomainMin = focusMin - focusPad;
  const focusDomainMax = focusMax + focusPad;
  const topBand = height * 0.22;
  const middleBand = height * 0.56;
  const bottomBand = height - topBand - middleBand;

  const yFor = (v: number) => {
    if (v >= focusDomainMax) {
      const ratio =
        (v - focusDomainMax) / (domainMax - focusDomainMax || 1);
      return Math.max(0, topBand * (1 - ratio));
    }
    if (v <= focusDomainMin) {
      const ratio =
        (focusDomainMin - v) / (focusDomainMin - domainMin || 1);
      return Math.min(height, topBand + middleBand + bottomBand * ratio);
    }
    return (
      topBand +
      ((focusDomainMax - v) / (focusDomainMax - focusDomainMin || 1)) *
        middleBand
    );
  };

  // Text at fontSize 8/9 needs roughly 9-10px of vertical room to avoid
  // clashing (see the overlapping P-TC/P-BC/etc. labels this fixes).
  const prevLabelY = declutterLabelPositions(
    LEVEL_KEYS.map((k) => ({ key: k, y: yFor(prevCPR[k as keyof CPRLevels] as number) })),
    10
  );
  const todayLabelY = declutterLabelPositions(
    LEVEL_KEYS.map((k) => ({ key: k, y: yFor(todayCPR[k as keyof CPRLevels] as number) })),
    11
  );

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-nowrap items-center gap-1.5 pl-2 text-left">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Levels VIEW
        </p>
        {pivotPatternBadge && (
          <span className="inline-flex shrink-0 translate-y-[-1px] items-center">
            {pivotPatternBadge}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[300px] w-full"
        preserveAspectRatio="none"
        aria-label="Previous day and today support and resistance levels"
      >
        {LEVEL_KEYS.map((k) => {
          const pv = prevCPR[k as keyof CPRLevels] as number;
          const y = yFor(pv);
          const color = levelColor(k);
          return (
            <g key={`prev-${k}`}>
              <line
                x1={leftMargin}
                x2={prevSegmentEnd}
                y1={y}
                y2={y}
                stroke={color}
                strokeWidth={0.5}
              />
              <text
                x={leftMargin - 4}
                y={(prevLabelY.get(k) as number) + 3}
                fontSize={8}
                fontFamily="monospace"
                fill={color}
                textAnchor="end"
              >
                P-{levelLabel(k)} {fmt(pv)}
              </text>
            </g>
          );
        })}
        {LEVEL_KEYS.map((k) => {
          const tv = todayCPR[k as keyof CPRLevels] as number;
          const y = yFor(tv);
          const color = levelColor(k);
          return (
            <g key={`today-${k}`}>
              <line
                x1={prevSegmentEnd}
                x2={leftMargin + plotWidth}
                y1={y}
                y2={y}
                stroke={color}
                strokeWidth={0.5}
              />
              <text
                x={leftMargin + plotWidth + 4}
                y={(todayLabelY.get(k) as number) + 3}
                fontSize={9}
                fontFamily="monospace"
                fill={color}
              >
                {levelLabel(k)} {fmt(tv)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * The full expanded panel shown when a symbol row is clicked:
 * PDay S/R first, then the Prev-Day-vs-Today Levels VIEW chart, then
 * Today S/R, then — BacktestPanel only — Level Check right after it. This
 * order keeps each day's ladder close to its own lines in the chart so the
 * overlapping level values are easier to read. Reused by Screener and
 * BacktestPanel.
 *
 * The PDay-1 S/R ladder is currently hidden (not rendered), though
 * ppCPR/ppClose/pDay1PatternBadge are still accepted so it can be
 * reintroduced without re-threading data through callers.
 *
 * The "Attach chart" control sits right after the "Today S/R" ladder,
 * vertically nudged down to line up with the ladders' first data row
 * rather than their header text.
 *
 * Each day-specific ladder shows that day's own closing price as its
 * bottom row: labeled "Close" (plain white text) for PDay S/R's
 * previous-day close, and labeled "▶ Price" (bold, highlighted) for
 * Today S/R's live/entry-day price.
 */
export function SRLadderPanel({
  r,
  rowKey,
  viewKey,
  todayPatternBadge,
  prevPatternBadge,
  pDay1PatternBadge,
  pivotPatternBadge,
  showLevelCheck = false,
  levelCheckConditions,
  copyViewControl,
}: {
  r: SRLadderData;
  /**
   * Identifies this specific row (e.g. `${source}-${symbol}-${entryDate}`)
   * for chart-link storage. Omit to skip rendering the chart-link control
   * entirely (e.g. no stable row identity to key off of).
   */
  rowKey?: string;
  /**
   * Identifies the currently active Category/Pattern/View (BacktestPanel's
   * `selectedKey`), so a chart link is scoped to whichever View it was
   * attached under rather than shared globally per symbol/day. Falls back
   * to an empty-string scope if omitted.
   */
  viewKey?: string;
  /** Today's pattern badge(s) — e.g. renderTodayPatternBadges(r) — shown on the "Today S/R" ladder. */
  todayPatternBadge?: ReactNode;
  /** Prev day's own "p-xxxx" pattern badge — e.g. renderPrevPatternBadge(r) — shown on the "PDay S/R" ladder. */
  prevPatternBadge?: ReactNode;
  /** PDay-1's pattern badge, shown on the "PDay-1 S/R" ladder. Not currently computable (no ppp CPR to compare against) — reserved for future use. */
  pDay1PatternBadge?: ReactNode;
  /** PivotPattern badge (today vs prev HHLL x RRHH x SSLL combo) — e.g. renderPivotPatternBadge(r) — shown next to the "Levels VIEW" label. */
  pivotPatternBadge?: ReactNode;
  /**
   * Show the day-over-day "Level Check" column (compareSRLadders /
   * SRLadderDiffPanel), rendered right after Today S/R. Opt-in and
   * defaulted to false: the Screener's expanded ladder should stay
   * exactly as it was, while BacktestPanel's expanded ladder explicitly
   * passes true to surface it.
   */
  showLevelCheck?: boolean;
  /**
   * The current View's 13 Level Check conditions (BACKTEST_TARGETS'
   * levelCheckDefs), passed straight through to SRLadderDiffPanel. Omit
   * (or a View with none defined yet) and SRLadderDiffPanel shows "No
   * levelCheckDefs" instead of a checklist — see compareSRLadders in
   * SRLadderDiff.tsx. No effect unless showLevelCheck is also true.
   */
  levelCheckConditions?: LevelCheckCondition[];
  /**
   * BacktestPanel-only "Copy View" control, rendered directly under
   * the Level Check panel. Omit (the default) for Screener and for any
   * row where copying the current View doesn't make sense (no active
   * View selected). No effect unless showLevelCheck is also true.
   */
  copyViewControl?: ReactNode;
}) {
  const hasRightSection = Boolean(rowKey || showLevelCheck || copyViewControl);

  return (
    <div className="flex w-full min-w-0 items-start gap-3.5 overflow-x-auto border-b border-border/50 pb-3">
      {/* 1. Previous Day S/R */}
      <SRLadder cpr={r.prevCPR} currentPrice={r.prevClose} label="PDay S/R" badge={prevPatternBadge} pricePlain />

      {/* 2. CPR Level Chart */}
      <div className="w-[480px] shrink-0">
        <CPRLevelChart prevCPR={r.prevCPR} todayCPR={r.todayCPR} pivotPatternBadge={pivotPatternBadge} />
      </div>

      {/* 3. Today S/R */}
      <SRLadder cpr={r.todayCPR} currentPrice={r.currentPrice} label="Today S/R" badge={todayPatternBadge} />

      {/* 4. Top Right Section: Actions (Attach Chart, Create/Copy View) & Level Check */}
      {hasRightSection && (
        <div className="flex min-w-[260px] max-w-[320px] shrink-0 flex-col gap-2.5 border-l border-border/40 pl-3">
          {/* Action buttons toolbar: Attach chart & Create/Copy View */}
          <div className="flex flex-wrap items-center gap-1.5">
            {rowKey && <ChartLinkControl viewKey={viewKey ?? ""} rowKey={rowKey} />}
            {copyViewControl}
          </div>

          {/* Level Check */}
          {showLevelCheck && (
            <div className="w-full pt-1 border-t border-border/30">
              <SRLadderDiffPanel prevCPR={r.prevCPR} todayCPR={r.todayCPR} conditions={levelCheckConditions} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Table-row wrapper around SRLadderPanel, so callers can drop it straight
 * into a <tbody> under the row that was clicked.
 */
export function SRLadderRow({
  r,
  colSpan = 20,
  rowKey,
  viewKey,
  todayPatternBadge,
  prevPatternBadge,
  pDay1PatternBadge,
  pivotPatternBadge,
  showLevelCheck = false,
  levelCheckConditions,
  copyViewControl,
}: {
  r: SRLadderData;
  colSpan?: number;
  rowKey?: string;
  /** Same viewKey as SRLadderPanel — passed straight through. */
  viewKey?: string;
  /** Today's pattern badge(s) — e.g. renderTodayPatternBadges(r) — shown on the "Today S/R" ladder. */
  todayPatternBadge?: ReactNode;
  /** Prev day's own "p-xxxx" pattern badge — e.g. renderPrevPatternBadge(r) — shown on the "PDay S/R" ladder. */
  prevPatternBadge?: ReactNode;
  /** PDay-1's pattern badge, shown on the "PDay-1 S/R" ladder. Not currently computable (no ppp CPR to compare against) — reserved for future use. */
  pDay1PatternBadge?: ReactNode;
  /** PivotPattern badge (today vs prev HHLL x RRHH x SSLL combo) — e.g. renderPivotPatternBadge(r) — shown next to the "Levels VIEW" label. */
  pivotPatternBadge?: ReactNode;
  /** Show the "Level Check" section, rendered right after Today S/R. Defaults to false — pass true only from BacktestPanel. See SRLadderPanel for details. */
  showLevelCheck?: boolean;
  /** The current View's 13 Level Check conditions. See SRLadderPanel for details. */
  levelCheckConditions?: LevelCheckCondition[];
  /** BacktestPanel-only "Copy View" control, rendered under Level Check. See SRLadderPanel for details. */
  copyViewControl?: ReactNode;
}) {
  return (
    <tr key={rowKey ? `${rowKey}-sr` : undefined} className="bg-muted/20 border-b border-border">
      <td colSpan={colSpan} className="px-3 py-4 sm:px-4">
        <SRLadderPanel
          r={r}
          rowKey={rowKey}
          viewKey={viewKey}
          todayPatternBadge={todayPatternBadge}
          prevPatternBadge={prevPatternBadge}
          pDay1PatternBadge={pDay1PatternBadge}
          pivotPatternBadge={pivotPatternBadge}
          showLevelCheck={showLevelCheck}
          levelCheckConditions={levelCheckConditions}
          copyViewControl={copyViewControl}
        />
      </td>
    </tr>
  );
}
