"use client";

/**
 * SRLadderDiff — compares prevCPR vs todayCPR (same CPRLevels shape used
 * throughout SRLadderPanel.tsx) and flags whether each level held its
 * expected "slot" relative to yesterday, or crossed into a neighboring
 * level's previous territory.
 *
 * Example output (matches your spec):
 *   S4 between prev S4 and prev S3 — Matching
 *   TC between prev TC and prev PH — Not Matching (TC above prev PH)
 *
 * Design note: the "neighbor" for each level is derived by *sorting
 * yesterday's own 13 values*, not from a hardcoded name order (e.g.
 * "TC's neighbor is always PH"). BC/TC/Pivot can swap relative position
 * depending on the CPR type (your "A-A-AA-OA" label), so a fixed name
 * order would silently mis-check on those days. Sorting yesterday's
 * actual values is self-correcting for that.
 */

import { CheckCircle2, XCircle } from "lucide-react";
import type { CPRLevels } from "@/lib/cpr";

// Same 13 keys / order SRLadderPanel.tsx already uses (LEVEL_KEYS).
const LEVEL_KEYS = [
  "r4", "r3", "r2", "prevHigh", "r1", "tc", "pivot", "bc", "prevLow", "s1", "s2", "s3", "s4",
] as const;

type LevelKey = (typeof LEVEL_KEYS)[number];

// Same label mapping as SRLadderPanel.tsx's levelLabel().
function levelLabel(key: LevelKey): string {
  if (key === "prevHigh") return "PH";
  if (key === "prevLow") return "PL";
  if (key === "pivot") return "PV";
  return key.toUpperCase();
}

// Same color mapping as SRLadderPanel.tsx's levelColor(), reused so the
// diff list visually matches the ladder/chart it sits beside.
function levelColor(key: LevelKey): string {
  if (key === "tc") return "#FF5F1F";
  if (key === "pivot") return "#fde047";
  if (key === "bc") return "#FF00FF";
  if (key === "prevHigh") return "#38bdf8";
  if (key === "prevLow") return "#38bdf8";
  if (key.startsWith("r")) return "#4ade80";
  return "#ff2e2e"; // s1-s4
}

export type SRLevelCheck = {
  key: LevelKey;
  label: string;            // e.g. "TC"
  neighborKey: LevelKey;
  neighborLabel: string;    // e.g. "PH"
  prevSelf: number;
  prevNeighbor: number;
  today: number;
  matching: boolean;
  direction?: "above" | "below"; // set only when not matching
  text: string;              // ready-to-render line, matches your spec's wording
};

export function compareSRLadders(prevCPR: CPRLevels, todayCPR: CPRLevels): SRLevelCheck[] {
  // Sort yesterday's 13 levels by actual value (low -> high) so each
  // level's "neighbor" reflects that specific day, not an assumed order.
  const sortedPrev = LEVEL_KEYS
    .map((key) => ({ key, value: prevCPR[key] as number }))
    .sort((a, b) => a.value - b.value);

  const indexOf = new Map(sortedPrev.map((e, i) => [e.key, i]));

  return LEVEL_KEYS.map((key) => {
    const i = indexOf.get(key)!;
    // Prefer the neighbor one rung above; the highest level that day
    // (usually r4) has nothing above it, so it borrows the rung below.
    const isTop = i === sortedPrev.length - 1;
    const neighborKey = (isTop ? sortedPrev[i - 1] : sortedPrev[i + 1]).key;

    const prevSelf = prevCPR[key] as number;
    const prevNeighbor = prevCPR[neighborKey] as number;
    const todayVal = todayCPR[key] as number;

    const lower = Math.min(prevSelf, prevNeighbor);
    const upper = Math.max(prevSelf, prevNeighbor);
    const matching = todayVal >= lower && todayVal <= upper;

    const selfLabel = levelLabel(key);
    const neighborLabel = levelLabel(neighborKey);
    // Phrase boundaries low-to-high regardless of which is self/neighbor.
    const [lowLabel, highLabel] =
      prevSelf <= prevNeighbor ? [selfLabel, neighborLabel] : [neighborLabel, selfLabel];

    let direction: "above" | "below" | undefined;
    let text: string;

    if (matching) {
      text = `${selfLabel} between prev ${lowLabel} and prev ${highLabel} — Matching`;
    } else {
      direction = todayVal > upper ? "above" : "below";
      const crossed = direction === "above" ? highLabel : lowLabel;
      text =
        `${selfLabel} between prev ${lowLabel} and prev ${highLabel} — Not Matching ` +
        `(${selfLabel} ${direction} prev ${crossed})`;
    }

    return {
      key, label: selfLabel, neighborKey, neighborLabel,
      prevSelf, prevNeighbor, today: todayVal, matching, direction, text,
    };
  });
}

export function summarizeSRLadderDiff(checks: SRLevelCheck[]) {
  const matchingCount = checks.filter((c) => c.matching).length;
  return { matchingCount, notMatchingCount: checks.length - matchingCount, total: checks.length };
}

/**
 * Row-level rollup for table columns / aggregate stats (no JSX): given a
 * single symbol's prev/today CPR, returns the match count plus which
 * levels broke, and whether all 13 held (fullMatch).
 *
 * Always call this scoped to ONE View/Pattern's result set at a time
 * (e.g. BacktestPanel's `rows` for the currently selected dropdown
 * entry). Different Views have different base conditions and targets,
 * so "pass" means something different per View — pooling ladder-match
 * stats across multiple Views' symbols would compare apples to oranges.
 */
export function getLadderMatchSummary(prevCPR: CPRLevels, todayCPR: CPRLevels) {
  const checks = compareSRLadders(prevCPR, todayCPR);
  const mismatches = checks.filter((c) => !c.matching);
  return {
    matchingCount: checks.length - mismatches.length,
    total: checks.length,
    mismatchLabels: mismatches.map((c) => c.label),
    fullMatch: mismatches.length === 0,
  };
}

/**
 * Compact list, styled to sit alongside SRLadder / CPRLevelChart inside
 * SRLadderPanel. Shows all 13 lines by default; pass showMatching={false}
 * to only surface the mismatches, which is usually what you're scanning for.
 */
export function SRLadderDiffPanel({
  prevCPR,
  todayCPR,
  showMatching = true,
}: {
  prevCPR: CPRLevels;
  todayCPR: CPRLevels;
  showMatching?: boolean;
}) {
  const checks = compareSRLadders(prevCPR, todayCPR);
  const { matchingCount, total } = summarizeSRLadderDiff(checks);
  const visible = showMatching ? checks : checks.filter((c) => !c.matching);

  return (
    <div className="min-w-[220px]">
      <div className="mb-1.5 flex flex-nowrap items-center justify-between gap-1.5 pl-2 text-left">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Level Check
        </p>
        <span className="text-[9px] text-muted-foreground pr-1">
          {matchingCount}/{total} matching
        </span>
      </div>
      <div className="space-y-0.5 px-2">
        {visible.map((c) => (
          <div key={c.key} className="flex items-start gap-1.5 text-[10px] font-mono leading-tight">
            {c.matching ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-[1px]" />
            ) : (
              <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-[1px]" />
            )}
            <span
              style={{ color: c.matching ? undefined : levelColor(c.key) }}
              className={c.matching ? "text-muted-foreground" : ""}
            >
              {c.text}
            </span>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-[10px] text-muted-foreground px-1">All 13 levels matching.</p>
        )}
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// View-baseline ladder check
//
// compareSRLadders / getLadderMatchSummary above answer a different
// question: "did this symbol hold its OWN slot vs yesterday" — a fixed
// geometric rule applied the same way to every symbol, every View.
//
// What's needed for backtest review is: within ONE View, use that View's
// own Pass rows to learn what a "healthy" ladder looks like for THAT View
// specifically, then measure each Fail row against that learned shape —
// not against a universal rule. A bullish R4-breakout View's Pass symbols
// will typically show price already through/near R4 with one TC/Pivot/BC
// ordering; a bearish S4-breakdown View's Pass symbols will look nothing
// like that. The functions below build the baseline from a View's Pass
// rows, then score any other row (typically a Fail row) against it.
//
// Always scope buildViewLadderBaseline()'s input to ONE View's Pass rows
// (e.g. BacktestPanel's `rows`, filtered to result === "pass", for the
// currently selected dropdown entry — `rows` is already reset on every
// selectedKey change / run()). Pooling Pass rows across different Views
// would blend unrelated "healthy" shapes together and defeat the point.
// ---------------------------------------------------------------------------

/** One of the 13 CPR levels ranked by value within a single day's own CPR (0 = lowest, 12 = highest). */
export type RankedLevel = { key: LevelKey; label: string; value: number; rank: number };

/** Ranks a single day's 13 CPR levels by value — this permutation is what shifts when TC/Pivot/BC swap relative position across CPR types. */
export function rankLevelsByValue(cpr: CPRLevels): RankedLevel[] {
  return LEVEL_KEYS
    .map((key) => ({ key, label: levelLabel(key), value: cpr[key] as number }))
    .sort((a, b) => a.value - b.value)
    .map((e, i) => ({ ...e, rank: i }));
}

/**
 * Where price sits relative to that same day's 13 levels, expressed as the
 * nearest level ABOVE price (ceiling) and nearest level BELOW price
 * (floor) by that day's own values — so it's comparable across symbols
 * even though raw prices/levels aren't. A null floor means price is above
 * every level (e.g. above R4); a null ceiling means it's below every level.
 */
export type PricePosition = { floor: LevelKey | null; ceiling: LevelKey | null; label: string };

export function pricePosition(cpr: CPRLevels, price: number): PricePosition {
  const ranked = rankLevelsByValue(cpr); // low -> high
  let floor: RankedLevel | null = null;
  let ceiling: RankedLevel | null = null;
  for (const lvl of ranked) {
    if (lvl.value <= price) floor = lvl;
    else {
      ceiling = lvl;
      break;
    }
  }
  const label = !floor
    ? `below ${ceiling!.label}`
    : !ceiling
    ? `above ${floor.label}`
    : `between ${floor.label} and ${ceiling.label}`;
  return { floor: floor?.key ?? null, ceiling: ceiling?.key ?? null, label };
}

function priceZoneKey(p: PricePosition): string {
  return `${p.floor ?? "-"}|${p.ceiling ?? "-"}`;
}

/** A View's learned "healthy" ladder shape, built from that View's own Pass rows only. */
export type ViewLadderBaseline = {
  sampleSize: number;
  /** For each level key, the rank it most often held across Pass rows, and how many Pass rows agreed. */
  levelRank: Record<LevelKey, { modalRank: number; agree: number }>;
  /** The price zone (relative to that day's own levels) most Pass rows shared — null if no Pass row had price data. */
  priceZone: { floor: LevelKey | null; ceiling: LevelKey | null; label: string; agree: number; total: number } | null;
};

/** Builds a View's Pass baseline. Returns null when there are no Pass rows to learn from. */
export function buildViewLadderBaseline(
  passRows: { todayCPR: CPRLevels; currentPrice?: number | null }[]
): ViewLadderBaseline | null {
  if (passRows.length === 0) return null;

  const rankCounts = new Map<LevelKey, Map<number, number>>();
  LEVEL_KEYS.forEach((k) => rankCounts.set(k, new Map()));
  const zoneCounts = new Map<string, { count: number; sample: PricePosition }>();
  let priceSampleCount = 0;

  for (const row of passRows) {
    for (const { key, rank } of rankLevelsByValue(row.todayCPR)) {
      const m = rankCounts.get(key)!;
      m.set(rank, (m.get(rank) ?? 0) + 1);
    }
    if (typeof row.currentPrice === "number" && isFinite(row.currentPrice)) {
      priceSampleCount++;
      const zone = pricePosition(row.todayCPR, row.currentPrice);
      const zk = priceZoneKey(zone);
      const existing = zoneCounts.get(zk);
      zoneCounts.set(zk, { count: (existing?.count ?? 0) + 1, sample: zone });
    }
  }

  const levelRank = {} as ViewLadderBaseline["levelRank"];
  for (const key of LEVEL_KEYS) {
    const m = rankCounts.get(key)!;
    let modalRank = 0;
    let agree = -1;
    for (const [rank, count] of m) {
      if (count > agree) {
        agree = count;
        modalRank = rank;
      }
    }
    levelRank[key] = { modalRank, agree };
  }

  let priceZone: ViewLadderBaseline["priceZone"] = null;
  if (priceSampleCount > 0) {
    let best: { count: number; sample: PricePosition } | undefined;
    for (const entry of zoneCounts.values()) {
      if (!best || entry.count > best.count) best = entry;
    }
    if (best) {
      priceZone = {
        floor: best.sample.floor,
        ceiling: best.sample.ceiling,
        label: best.sample.label,
        agree: best.count,
        total: priceSampleCount,
      };
    }
  }

  return { sampleSize: passRows.length, levelRank, priceZone };
}

/** One level's deviation from the View's Pass baseline, for a single scored row. */
export type BaselineLevelDeviation = {
  key: LevelKey;
  label: string;
  baselineRank: number;
  baselineAgree: number; // how many Pass rows shared that rank
  actualRank: number;
  deviates: boolean;
};

export type FailVsBaselineResult = {
  sampleSize: number;
  levelDeviations: BaselineLevelDeviation[];
  deviationCount: number;
  priceZone?: PricePosition;
  priceDeviates?: boolean;
  priceBaselineLabel?: string;
  priceBaselineAgree?: number;
  priceBaselineTotal?: number;
};

/**
 * Scores a single row's ladder against a View's Pass baseline (built by
 * buildViewLadderBaseline from that same View's Pass rows). Intended for
 * Fail rows — Pass rows compared against a baseline built from themselves
 * would trivially "match", which isn't a meaningful check.
 */
export function scoreAgainstViewBaseline(
  row: { todayCPR: CPRLevels; currentPrice?: number | null },
  baseline: ViewLadderBaseline
): FailVsBaselineResult {
  const ranked = rankLevelsByValue(row.todayCPR);
  const rankByKey = new Map(ranked.map((r) => [r.key, r.rank]));

  const levelDeviations: BaselineLevelDeviation[] = LEVEL_KEYS.map((key) => {
    const actualRank = rankByKey.get(key)!;
    const base = baseline.levelRank[key];
    return {
      key,
      label: levelLabel(key),
      baselineRank: base.modalRank,
      baselineAgree: base.agree,
      actualRank,
      deviates: actualRank !== base.modalRank,
    };
  });

  const result: FailVsBaselineResult = {
    sampleSize: baseline.sampleSize,
    levelDeviations,
    deviationCount: levelDeviations.filter((d) => d.deviates).length,
  };

  if (baseline.priceZone && typeof row.currentPrice === "number" && isFinite(row.currentPrice)) {
    const zone = pricePosition(row.todayCPR, row.currentPrice);
    result.priceZone = zone;
    result.priceDeviates = priceZoneKey(zone) !== `${baseline.priceZone.floor ?? "-"}|${baseline.priceZone.ceiling ?? "-"}`;
    result.priceBaselineLabel = baseline.priceZone.label;
    result.priceBaselineAgree = baseline.priceZone.agree;
    result.priceBaselineTotal = baseline.priceZone.total;
  }

  return result;
}

/**
 * Renders one row's ladder against its View's Pass baseline. Sits
 * alongside SRLadderDiffPanel in the expanded row, but answers a
 * different question: not "did this move vs yesterday", but "does this
 * ladder look like the shape this View's own winners had, or not".
 */
export function ViewBaselineLadderPanel({ result }: { result: FailVsBaselineResult }) {
  const deviating = result.levelDeviations.filter((d) => d.deviates);
  const total = result.levelDeviations.length;
  const matchingCount = total - result.deviationCount;

  return (
    <div className="min-w-[240px]">
      <div className="mb-1.5 flex flex-nowrap items-center justify-between gap-1.5 pl-2 text-left">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Vs. View Pass Baseline (n={result.sampleSize})
        </p>
        <span className="text-[9px] text-muted-foreground pr-1">
          {matchingCount}/{total} matching
        </span>
      </div>
      <div className="space-y-0.5 px-2">
        {typeof result.priceDeviates === "boolean" && (
          <div className="flex items-start gap-1.5 text-[10px] font-mono leading-tight">
            {result.priceDeviates ? (
              <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-[1px]" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-[1px]" />
            )}
            <span className={result.priceDeviates ? "" : "text-muted-foreground"}>
              Price — Pass baseline: {result.priceBaselineLabel} ({result.priceBaselineAgree}/{result.priceBaselineTotal})
              {result.priceDeviates ? ` — this symbol: ${result.priceZone?.label}` : ""}
            </span>
          </div>
        )}
        {deviating.length === 0 ? (
          <p className="text-[10px] text-muted-foreground px-1">All 13 levels match this View's Pass baseline order.</p>
        ) : (
          deviating.map((d) => (
            <div key={d.key} className="flex items-start gap-1.5 text-[10px] font-mono leading-tight">
              <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-[1px]" />
              <span style={{ color: levelColor(d.key) }}>
                {d.label} — Pass baseline rank {d.baselineRank + 1}/13 ({d.baselineAgree}/{result.sampleSize}), this symbol rank {d.actualRank + 1}/13
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}