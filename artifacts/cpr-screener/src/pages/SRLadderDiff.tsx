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