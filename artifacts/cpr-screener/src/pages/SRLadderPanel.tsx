import type { ReactNode } from "react";
import type { CPRLevels, CPRResult } from "@/lib/cpr";
import { fmt } from "./ScreenerUtils";

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
  currentPriceOverride?: number
): SRLadderData {
  return {
    todayCPR: r.todayCPR,
    prevCPR: r.prevCPR,
    ppCPR: r.ppCPR,
    currentPrice: currentPriceOverride ?? (r as { currentPrice?: number }).currentPrice,
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
    if (key === "TC") return "text-[#FF5F1F]";
    if (key === "Pivot") return "text-yellow-300";
    if (key === "BC") return "text-fuchsia-500";
    if (key === "PH") return "text-sky-400";
    if (key === "PL") return "text-sky-400";
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
            className="grid grid-cols-[3.5rem_auto] justify-start gap-1 w-fit bg-emerald-700/70 text-white text-xs px-2 py-0.5 rounded font-bold my-0.5"
          >
            <span>▶ Price</span>
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
  if (key === "tc") return "#FF5F1F";
  if (key === "pivot") return "#fde047"; // yellow-300
  if (key === "bc") return "#FF00FF"; // fuchsia
  if (key === "prevHigh") return "#38bdf8"; // sky-400
  if (key === "prevLow") return "#38bdf8"; // sky-400
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
  const width = 900;
  // Keep the chart compact when it sits beside the ladders. The ladders
  // remain the readable, full-size value reference next to it.
  const height = 300;
  // Keep labels readable while reducing the total chart footprint so the
  // chart and three ladders can fit without a page-level horizontal scrollbar.
  const leftMargin = 76;
  const rightMargin = 76;
  const plotWidth = width - leftMargin - rightMargin;
  const prevSegmentEnd = leftMargin + plotWidth * 0.43;

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
                opacity={0.94}
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
 * a Prev-Day-vs-Today levels chart and the three S/R ladders (Today,
 * PrevDay, PDay-1 — pushed to the right where the chart frees up space).
 * Reused by Screener and BacktestPanel.
 */
export function SRLadderPanel({
  r,
  todayPatternBadge,
  prevPatternBadge,
  pDay1PatternBadge,
  pivotPatternBadge,
}: {
  r: SRLadderData;
  /** Today's pattern badge(s) — e.g. renderTodayPatternBadges(r) — shown on the "Today S/R" ladder. */
  todayPatternBadge?: ReactNode;
  /** Prev day's own "p-xxxx" pattern badge — e.g. renderPrevPatternBadge(r) — shown on the "PDay S/R" ladder. */
  prevPatternBadge?: ReactNode;
  /** PDay-1's pattern badge, shown on the "PDay-1 S/R" ladder. Not currently computable (no ppp CPR to compare against) — reserved for future use. */
  pDay1PatternBadge?: ReactNode;
  /** PivotPattern badge (today vs prev HHLL x RRHH x SSLL combo) — e.g. renderPivotPatternBadge(r) — shown next to the "Levels VIEW" label. */
  pivotPatternBadge?: ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3 border-b border-border/50 pb-3">
        <div className="min-w-[440px] flex-1">
          <CPRLevelChart prevCPR={r.prevCPR} todayCPR={r.todayCPR} pivotPatternBadge={pivotPatternBadge} />
        </div>
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2 pt-0.5">
          <SRLadder cpr={r.todayCPR} currentPrice={r.currentPrice} label="Today S/R" badge={todayPatternBadge} />
          <SRLadder cpr={r.prevCPR} currentPrice={r.currentPrice} label="PDay S/R" badge={prevPatternBadge} />
          {r.ppCPR && (
            <SRLadder cpr={r.ppCPR} currentPrice={r.currentPrice} label="PDay-1 S/R" badge={pDay1PatternBadge} />
          )}
        </div>
      </div>
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
  todayPatternBadge,
  prevPatternBadge,
  pDay1PatternBadge,
  pivotPatternBadge,
}: {
  r: SRLadderData;
  colSpan?: number;
  rowKey?: string;
  /** Today's pattern badge(s) — e.g. renderTodayPatternBadges(r) — shown on the "Today S/R" ladder. */
  todayPatternBadge?: ReactNode;
  /** Prev day's own "p-xxxx" pattern badge — e.g. renderPrevPatternBadge(r) — shown on the "PDay S/R" ladder. */
  prevPatternBadge?: ReactNode;
  /** PDay-1's pattern badge, shown on the "PDay-1 S/R" ladder. Not currently computable (no ppp CPR to compare against) — reserved for future use. */
  pDay1PatternBadge?: ReactNode;
  /** PivotPattern badge (today vs prev HHLL x RRHH x SSLL combo) — e.g. renderPivotPatternBadge(r) — shown next to the "Levels VIEW" label. */
  pivotPatternBadge?: ReactNode;
}) {
  return (
    <tr key={rowKey ? `${rowKey}-sr` : undefined} className="bg-muted/20 border-b border-border">
      <td colSpan={colSpan} className="px-3 py-4 sm:px-4">
        <SRLadderPanel
          r={r}
          todayPatternBadge={todayPatternBadge}
          prevPatternBadge={prevPatternBadge}
          pDay1PatternBadge={pDay1PatternBadge}
          pivotPatternBadge={pivotPatternBadge}
        />
      </td>
    </tr>
  );
}
