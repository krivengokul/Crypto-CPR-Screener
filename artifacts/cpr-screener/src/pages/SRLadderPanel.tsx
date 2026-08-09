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
   * for "PrevDay S/R"). Rendered right after the header label, above the
   * R4/level rows. Omit when there's no pattern to show (e.g. "PDay-1
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
    if (key === "TC" || key === "BC" || key === "Pivot")
      return "text-yellow-500 font-semibold bg-yellow-500/5";
    if (key === "PH" || key === "PL")
      return "text-orange-400 font-medium bg-orange-500/5";
    if (key.startsWith("R")) return "text-green-400";
    return "text-red-400";
  };

  return (
    <div className="w-[180px] min-w-0">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 text-left pl-2">
        {label}
      </p>
      {badge && <div className="pl-2 mb-1.5">{badge}</div>}
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

/**
 * The full expanded panel shown when a symbol row is clicked:
 * PDay-1 / Prev / Today CPR mini-cards, the U4/L4 gap card, and the three
 * S/R ladders. Reused by Screener and BacktestPanel.
 */
export function SRLadderPanel({
  r,
  todayPatternBadge,
  prevPatternBadge,
  pDay1PatternBadge,
}: {
  r: SRLadderData;
  /** Today's pattern badge(s) — e.g. renderTodayPatternBadges(r) — shown on the "Today S/R" ladder. */
  todayPatternBadge?: ReactNode;
  /** Prev day's pattern badge — e.g. renderPrevPatternBadge(r) — shown on the "PrevDay S/R" ladder. */
  prevPatternBadge?: ReactNode;
  /** PDay-1's pattern badge, shown on the "PDay-1 S/R" ladder. Not currently computable (no ppp CPR to compare against) — reserved for future use. */
  pDay1PatternBadge?: ReactNode;
}) {
  return (
    <div className="grid min-w-[920px] grid-cols-[minmax(300px,340px)_repeat(3,180px)] items-start gap-5">
      <div className="flex min-w-0 flex-col gap-4 border-r border-border/50 pr-5">
        <div className="flex flex-wrap gap-6 items-start">
          {r.ppCPR && (
            <div className="min-w-[140px]">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">PDay-1 CPR</p>
              <div className="rounded-lg border border-border bg-card/40 px-3 py-2 font-mono space-y-1.5">
                <div className="flex justify-between gap-4 text-xs">
                  <span style={{ color: "#6b7280" }}>TC:</span>
                  <span style={{ color: "#9ca3af" }}>{fmt(r.ppCPR.tc)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-xs" style={{ color: "#6b7280" }}>Pivot</span>
                  <span className="font-bold text-sm" style={{ color: "#d1d5db" }}>{fmt(r.ppCPR.pivot)}</span>
                </div>
                <div className="flex justify-between gap-4 text-xs">
                  <span style={{ color: "#6b7280" }}>BC:</span>
                  <span style={{ color: "#9ca3af" }}>{fmt(r.ppCPR.bc)}</span>
                </div>
              </div>
            </div>
          )}
          <div className="min-w-[140px]">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Prev Day CPR</p>
            <div className="rounded-lg border border-border bg-card/60 px-3 py-2 font-mono space-y-1.5">
              <div className="flex justify-between gap-4 text-xs">
                <span style={{ color: "#6b7280" }}>TC:</span>
                <span style={{ color: "#9ca3af" }}>{fmt(r.prevCPR.tc)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-xs" style={{ color: "#6b7280" }}>Pivot</span>
                <span className="font-bold text-sm" style={{ color: "#d1d5db" }}>{fmt(r.prevCPR.pivot)}</span>
              </div>
              <div className="flex justify-between gap-4 text-xs">
                <span style={{ color: "#6b7280" }}>BC:</span>
                <span style={{ color: "#9ca3af" }}>{fmt(r.prevCPR.bc)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="min-w-[140px]">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Today CPR</p>
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 font-mono space-y-1.5">
            <div className="flex justify-between gap-4 text-xs">
              <span style={{ color: "#6b7280" }}>TC:</span>
              <span style={{ color: "#9ca3af" }}>{fmt(r.todayCPR.tc)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-xs" style={{ color: "#6b7280" }}>Pivot</span>
              <span className="font-bold text-sm" style={{ color: "#ffffff" }}>{fmt(r.todayCPR.pivot)}</span>
            </div>
            <div className="flex justify-between gap-4 text-xs">
              <span style={{ color: "#6b7280" }}>BC:</span>
              <span style={{ color: "#9ca3af" }}>{fmt(r.todayCPR.bc)}</span>
            </div>
          </div>
        </div>
        {(() => {
          const r4Gap = Math.abs(r.todayCPR.r4 - r.prevCPR.r4);
          const s4Gap = Math.abs(r.todayCPR.s4 - r.prevCPR.s4);
          const r4d = (r as any).r4Distance as number | undefined;
          const s4d = (r as any).s4Distance as number | undefined;
          if (r4d == null || s4d == null || !isFinite(r4d) || !isFinite(s4d)) return null;
          const maxD = Math.max(r4d, s4d);
          const diffPct = maxD > 0 ? ((r4d - s4d) / maxD) * 100 : 0;
          const diffColor =
            diffPct > 0 ? "text-green-400" : diffPct < 0 ? "text-orange-400" : "text-muted-foreground";
          return (
            <div className="min-w-[140px]">
              <div
                className="rounded-lg border border-border bg-card/60 px-3 py-2 font-mono space-y-1"
                title={`Normalized: U4Δ ${r4d.toFixed(2)}× vs L4Δ ${s4d.toFixed(2)}× of prev CPR width`}
              >
                <div className="flex justify-between gap-4 text-xs text-chart-3">
                  <span className="text-muted-foreground">U4Gap:</span>
                  <span>{fmt(r4Gap)}</span>
                </div>
                <div className={`text-xs font-semibold ${diffColor}`}>
                  {diffPct >= 0 ? "+" : ""}
                  {diffPct.toFixed(2)}%
                  <div className="w-full bg-muted rounded-full h-1 mt-0.5">
                    <div
                      className={`h-1 rounded-full transition-all ${
                        diffPct > 0 ? "bg-green-400" : diffPct < 0 ? "bg-orange-400" : "bg-muted-foreground"
                      }`}
                      style={{ width: `${Math.min(Math.abs(diffPct), 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between gap-4 text-xs text-chart-3/70">
                  <span className="text-muted-foreground">L4Gap:</span>
                  <span>{fmt(s4Gap)}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
      {r.ppCPR ? (
        <SRLadder cpr={r.ppCPR} currentPrice={r.currentPrice} label="PDay-1 S/R" badge={pDay1PatternBadge} />
      ) : (
        <div aria-hidden="true" />
      )}
      <SRLadder cpr={r.prevCPR} currentPrice={r.currentPrice} label="PrevDay S/R" badge={prevPatternBadge} />
      <SRLadder cpr={r.todayCPR} currentPrice={r.currentPrice} label="Today S/R" badge={todayPatternBadge} />
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
}: {
  r: SRLadderData;
  colSpan?: number;
  rowKey?: string;
  /** Today's pattern badge(s) — e.g. renderTodayPatternBadges(r) — shown on the "Today S/R" ladder. */
  todayPatternBadge?: ReactNode;
  /** Prev day's pattern badge — e.g. renderPrevPatternBadge(r) — shown on the "PrevDay S/R" ladder. */
  prevPatternBadge?: ReactNode;
  /** PDay-1's pattern badge, shown on the "PDay-1 S/R" ladder. Not currently computable (no ppp CPR to compare against) — reserved for future use. */
  pDay1PatternBadge?: ReactNode;
}) {
  return (
    <tr key={rowKey ? `${rowKey}-sr` : undefined} className="bg-muted/20 border-b border-border">
      <td colSpan={colSpan} className="px-3 py-4 sm:px-4">
        <SRLadderPanel
          r={r}
          todayPatternBadge={todayPatternBadge}
          prevPatternBadge={prevPatternBadge}
          pDay1PatternBadge={pDay1PatternBadge}
        />
      </td>
    </tr>
  );
}
