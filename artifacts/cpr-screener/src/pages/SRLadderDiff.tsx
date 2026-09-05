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

export type LevelKey = (typeof LEVEL_KEYS)[number];

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

/**
 * A View-specific Level Check condition for one of the 13 ADK ladder
 * lines (see backtest.ts's BacktestTargetDef.levelCheckDefs, where these
 * are actually defined per View). Structurally identical to the type of
 * the same name in backtest.ts — kept as a separate local type rather
 * than imported, since lib/ shouldn't import from pages/; the two stay
 * in sync because both are just "one of the 13 level keys, a subject,
 * and a two-key band" and never need anything more.
 *
 * `subject` is which day's value at `key` is being checked: "today" is
 * the common case (does today's own level sit inside a band drawn from
 * yesterday). "previous" is for a View's target/breakout rungs, where
 * the meaningful check runs the other way — did YESTERDAY's level get
 * absorbed into a band drawn from TODAY's new structure. Either way,
 * `bandKeys` is always read from the day `subject` is NOT.
 */
export type LevelCheckCondition = {
  key: LevelKey;
  subject: "today" | "previous";
  bandKeys: [LevelKey, LevelKey];
};

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
  text: string;              // full line incl. crossing detail — used by Vs. View Pass Baseline
  basicText: string;         // same line without the "(X above/below prev Y)" detail — used by Level Check
};

/**
 * Compares prevCPR vs todayCPR, line by line.
 *
 * Default (no `conditions` passed): the generic check — each level's
 * "neighbor" is derived by sorting yesterday's own 13 values (not a
 * hardcoded name order, since BC/TC/Pivot can swap relative position),
 * and today's value at that level must fall within yesterday's
 * self-neighbor band.
 *
 * When `conditions` is passed (a View's levelCheckDefs from
 * BACKTEST_TARGETS), that View's own per-line rules are used instead —
 * see LevelCheckCondition above. Both paths feed the same SRLevelCheck
 * shape, so Level Check, Vs. View Pass Baseline, and the match-summary
 * helpers below all work unchanged either way.
 */
export function compareSRLadders(
  prevCPR: CPRLevels,
  todayCPR: CPRLevels,
  conditions?: LevelCheckCondition[]
): SRLevelCheck[] {
  if (conditions && conditions.length > 0) {
    return conditions.map((cond) => {
      const subjectIsToday = cond.subject === "today";
      const subjectVal = (subjectIsToday ? todayCPR : prevCPR)[cond.key] as number;
      // The band always comes from the day `subject` is NOT.
      const bandCPR = subjectIsToday ? prevCPR : todayCPR;
      const bandA = bandCPR[cond.bandKeys[0]] as number;
      const bandB = bandCPR[cond.bandKeys[1]] as number;
      const lower = Math.min(bandA, bandB);
      const upper = Math.max(bandA, bandB);
      const matching = subjectVal >= lower && subjectVal <= upper;

      const selfLabel = levelLabel(cond.key);
      const subjectPrefix = subjectIsToday ? "" : "Previous ";
      const bandPrefix = subjectIsToday ? "prev " : "";
      const [lowKey, highKey] =
        bandA <= bandB ? [cond.bandKeys[0], cond.bandKeys[1]] : [cond.bandKeys[1], cond.bandKeys[0]];
      const lowLabel = levelLabel(lowKey);
      const highLabel = levelLabel(highKey);

      let direction: "above" | "below" | undefined;
      let basicText: string;
      let text: string;

      if (matching) {
        basicText = `${subjectPrefix}${selfLabel} between ${bandPrefix}${lowLabel} and ${bandPrefix}${highLabel} — Matching`;
        text = basicText;
      } else {
        direction = subjectVal > upper ? "above" : "below";
        const crossed = direction === "above" ? highLabel : lowLabel;
        basicText = `${subjectPrefix}${selfLabel} between ${bandPrefix}${lowLabel} and ${bandPrefix}${highLabel} — Not Matching`;
        text = `${basicText} (${selfLabel} ${direction} ${bandPrefix}${crossed})`;
      }

      // neighborKey/neighborLabel/prevSelf/prevNeighbor aren't read by any
      // caller outside this file (only key/label/matching/text/basicText
      // are) — filled in with well-defined, if not perfectly "neighbor-
      // shaped", values for a "previous"-subject condition.
      return {
        key: cond.key,
        label: selfLabel,
        neighborKey: lowKey === cond.key ? highKey : lowKey,
        neighborLabel: lowKey === cond.key ? highLabel : lowLabel,
        prevSelf: prevCPR[cond.key] as number,
        prevNeighbor: bandA,
        today: todayCPR[cond.key] as number,
        matching,
        direction,
        text,
        basicText,
      };
    });
  }

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
    let basicText: string;

    if (matching) {
      basicText = `${selfLabel} between prev ${lowLabel} and prev ${highLabel} — Matching`;
      text = basicText;
    } else {
      direction = todayVal > upper ? "above" : "below";
      const crossed = direction === "above" ? highLabel : lowLabel;
      basicText = `${selfLabel} between prev ${lowLabel} and prev ${highLabel} — Not Matching`;
      text = `${basicText} (${selfLabel} ${direction} prev ${crossed})`;
    }

    return {
      key, label: selfLabel, neighborKey, neighborLabel,
      prevSelf, prevNeighbor, today: todayVal, matching, direction, text, basicText,
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
export function getLadderMatchSummary(
  prevCPR: CPRLevels,
  todayCPR: CPRLevels,
  conditions?: LevelCheckCondition[]
) {
  const checks = compareSRLadders(prevCPR, todayCPR, conditions);
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
 *
 * Pass `conditions` (a View's levelCheckDefs from BACKTEST_TARGETS) to
 * use that View's own per-line rules instead of the generic sorted-
 * neighbor check — see compareSRLadders.
 */
export function SRLadderDiffPanel({
  prevCPR,
  todayCPR,
  showMatching = true,
  conditions,
}: {
  prevCPR: CPRLevels;
  todayCPR: CPRLevels;
  showMatching?: boolean;
  conditions?: LevelCheckCondition[];
}) {
  const checks = compareSRLadders(prevCPR, todayCPR, conditions);
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
// compareSRLadders / getLadderMatchSummary above tell you, per level,
// whether a symbol's ladder is Matching or Not Matching its own previous
// day — that's the raw "ladderdiff" for one symbol. Whether Matching is
// "good" isn't fixed, though: it depends on the View. A bullish
// R4-breakout View's Pass symbols will typically show most levels as Not
// Matching (broken through) — that's what winning looks like there. A
// different View might see mostly Matching on its Pass symbols. So the
// question isn't "is this level Matching" in the abstract, it's "does
// this level's Matching/Not-Matching outcome look like what this View's
// OWN Pass symbols show."
//
// buildViewLadderBaseline() runs compareSRLadders on a View's Pass rows
// and takes, per level, whichever outcome (Matching vs Not Matching) the
// majority of Pass rows landed on — that's the View-specific baseline.
// scoreAgainstViewBaseline() then runs compareSRLadders on another row
// (typically a Fail row) and flags any level whose outcome differs from
// that baseline.
//
// Always scope buildViewLadderBaseline()'s input to ONE View's Pass rows
// (e.g. BacktestPanel's `rows`, filtered to result === "pass", for the
// currently selected dropdown entry — `rows` is already reset on every
// selectedKey change / run()). Pooling Pass rows across different Views
// would blend unrelated "healthy" shapes together and defeat the point.
// ---------------------------------------------------------------------------

/** One level's Matching/Not-Matching outcome as it typically appeared across a View's Pass rows. */
export type LevelMatchBaseline = {
  key: LevelKey;
  label: string;
  /** true = Pass rows were typically "Matching" on this level, false = typically "Not Matching". */
  modalMatching: boolean;
  /** How many Pass rows shared that outcome, out of sampleSize. */
  agree: number;
};

export type ViewLadderBaseline = {
  sampleSize: number;
  levels: Record<LevelKey, LevelMatchBaseline>;
};

/**
 * Builds a View's Pass baseline from that View's own Pass rows' ladderdiff.
 * Null when there are no Pass rows. Pass `conditions` (that View's
 * levelCheckDefs) so the baseline is built from the same per-line rules
 * Level Check uses for this View — see compareSRLadders.
 */
export function buildViewLadderBaseline(
  passRows: { prevCPR: CPRLevels; todayCPR: CPRLevels }[],
  conditions?: LevelCheckCondition[]
): ViewLadderBaseline | null {
  if (passRows.length === 0) return null;

  const counts = new Map<LevelKey, { matching: number; notMatching: number }>();
  LEVEL_KEYS.forEach((k) => counts.set(k, { matching: 0, notMatching: 0 }));

  for (const row of passRows) {
    for (const c of compareSRLadders(row.prevCPR, row.todayCPR, conditions)) {
      const bucket = counts.get(c.key)!;
      if (c.matching) bucket.matching++;
      else bucket.notMatching++;
    }
  }

  const levels = {} as ViewLadderBaseline["levels"];
  for (const key of LEVEL_KEYS) {
    const { matching, notMatching } = counts.get(key)!;
    const modalMatching = matching >= notMatching;
    levels[key] = {
      key,
      label: levelLabel(key),
      modalMatching,
      agree: modalMatching ? matching : notMatching,
    };
  }

  return { sampleSize: passRows.length, levels };
}

/** One level's comparison against the View's Pass baseline, for a single scored row. */
export type BaselineLevelResult = {
  key: LevelKey;
  label: string;
  baselineMatching: boolean;
  baselineAgree: number;
  actualMatching: boolean;
  actualText: string; // that level's own ladderdiff line, for display
  deviates: boolean;
};

export type FailVsBaselineResult = {
  sampleSize: number;
  levelResults: BaselineLevelResult[];
  deviationCount: number;
};

/**
 * Scores a single row's ladderdiff against a View's Pass baseline (built
 * by buildViewLadderBaseline from that same View's Pass rows). Intended
 * for Fail rows — Pass rows compared against a baseline built from
 * themselves would trivially "match" on the majority side, which isn't a
 * meaningful check. Pass the same `conditions` used to build `baseline`
 * so the row is scored on identical per-line rules.
 */
export function scoreAgainstViewBaseline(
  row: { prevCPR: CPRLevels; todayCPR: CPRLevels },
  baseline: ViewLadderBaseline,
  conditions?: LevelCheckCondition[]
): FailVsBaselineResult {
  const checks = compareSRLadders(row.prevCPR, row.todayCPR, conditions);
  const levelResults: BaselineLevelResult[] = checks.map((c) => {
    const base = baseline.levels[c.key];
    return {
      key: c.key,
      label: c.label,
      baselineMatching: base.modalMatching,
      baselineAgree: base.agree,
      actualMatching: c.matching,
      actualText: c.text,
      deviates: c.matching !== base.modalMatching,
    };
  });

  return {
    sampleSize: baseline.sampleSize,
    levelResults,
    deviationCount: levelResults.filter((r) => r.deviates).length,
  };
}

/**
 * Renders one row's ladderdiff against its View's Pass baseline. Sits
 * alongside SRLadderDiffPanel in the expanded row, but answers a
 * different question: not "did this level hold vs yesterday" in the
 * abstract, but "does this level's Matching/Not-Matching outcome look
 * like what this View's own Pass symbols show, or not".
 */
export function ViewBaselineLadderPanel({
  result,
  showMatching = true,
}: {
  result: FailVsBaselineResult;
  /** Show all 13 lines by default, same as SRLadderDiffPanel; pass false to only surface deviations. */
  showMatching?: boolean;
}) {
  const total = result.levelResults.length;
  const matchingCount = total - result.deviationCount;
  const visible = showMatching ? result.levelResults : result.levelResults.filter((r) => r.deviates);

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
        {visible.map((r) => (
          <div key={r.key} className="flex items-start gap-1.5 text-[10px] font-mono leading-tight">
            {r.deviates ? (
              <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-[1px]" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-[1px]" />
            )}
            <span
              style={{ color: r.deviates ? levelColor(r.key) : undefined }}
              className={r.deviates ? "" : "text-muted-foreground"}
            >
              {r.actualText}
              {r.deviates &&
                ` — Pass baseline: ${r.baselineMatching ? "Matching" : "Not Matching"} (${r.baselineAgree}/${result.sampleSize})`}
            </span>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-[10px] text-muted-foreground px-1">All 13 levels match this View&apos;s Pass baseline.</p>
        )}
      </div>
    </div>
  );
}