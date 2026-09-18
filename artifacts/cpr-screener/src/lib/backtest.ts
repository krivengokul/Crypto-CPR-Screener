import { OHLC, CPRResult, analyzeCPR, isExpandedPatternPair } from "./cpr";
import { fetchTopUSDTSymbols, fetchDailyKlines, isLiveDailyCandle } from "./binance";
import { fetchDeltaPerps } from "./delta";
import { buildViewTree, type ViewTreeNode, VIEWS, getView, type ViewDef } from "./views";


export type BacktestSource = "binance" | "delta";

/**
 * A backtestable pattern needs a machine-readable target level, not just
 * the descriptive "Target" text in Screener.tsx's legend. Each entry here
 * pins down: which CPR level counts as "the target" for that pattern, and
 * whether price needs to go UP to it (bullish) or DOWN to it (bearish).
 *
 * v1 scope: only 2 patterns, chosen to exercise both target styles you'll
 * need later — "target = today's own CPR level" vs "target = previous
 * day's CPR level". Add more entries here once this is validated; each one
 * needs its target level worked out from that pattern's legend/condition.
 */
/**
 * A single View's Level Check rule for one of the 13 ADK ladder lines
 * (R4, R3, R2, PH, R1, TC, Pivot, BC, PL, S1, S2, S3, S4).
 *
 * `subject` picks which day's value at `key` is being tested: "today" is
 * the common case — does today's own level sit inside a band drawn from
 * yesterday's levels. "previous" runs the check the other way — did
 * YESTERDAY's level get absorbed into a band drawn from TODAY's new
 * structure; this is for a View's target/breakout rungs, where the
 * meaningful question is whether the old resistance/support zone is now
 * inside the new range, not whether today's own rung held its old spot.
 * Either way, `bandKeys` is always read from the day `subject` is NOT.
 */
export type LevelCheckKey =
  | "r4" | "r3" | "r2" | "prevHigh" | "r1" | "tc" | "pivot" | "bc"
  | "prevLow" | "s1" | "s2" | "s3" | "s4";

export interface LevelCheckCondition {
  key: LevelCheckKey;
  subject: "today" | "previous";
  bandKeys: [LevelCheckKey, LevelCheckKey];
}

/**
 * NEW: auto-derivation for levelCheckDefs — this is what a "Create View"
 * button in the SR Ladder panel would call instead of a human eyeballing
 * two ladders and writing 13 lines by hand (see the worked example this
 * replaces: A-A-AA-AA-U3L3-SSLLGap:R4's levelCheckDefs above).
 *
 * The rule, per rung:
 *   1. Find the TIGHTEST adjacent band from the OTHER day's 13 rungs
 *      containing this rung's value. Equality is treated as a valid
 *      boundary, using the same tolerance as CPR classification. This is
 *      important when (for example) today's S2 equals previous S4:
 *      the generated band must be [today S1, today S2], not [today S1,
 *      today S3] with today's S2 incorrectly left inside the band.
 *   2. If no such band exists because the value breaks out beyond the
 *      OTHER day's entire range (e.g. today's own R4/R3 sitting above
 *      every prev level in a strong bullish shift), flip it: check
 *      whether YESTERDAY's rung at this key fits inside a band drawn
 *      from TODAY's structure instead (subject: "previous"). This is
 *      exactly the "did yesterday's R4/R3 get absorbed into today's
 *      new R3-R2 band" check we wrote by hand for the top two rungs —
 *      here it falls out automatically instead of being hardcoded to
 *      "the top two rungs", so it also works for a bearish View whose
 *      breakout happens at the bottom (S4/S3) instead of the top.
 *
 * No `direction` parameter is needed: the function just reacts to
 * whichever side of the ladder actually broke out in the reconstructed
 * CPRResult, so it self-adapts to bullish and bearish Views alike.
 */
const LEVEL_CHECK_KEYS: LevelCheckKey[] = [
  "r4", "r3", "r2", "prevHigh", "r1", "tc", "pivot", "bc",
  "prevLow", "s1", "s2", "s3", "s4",
];

interface RungEntry {
  key: LevelCheckKey;
  value: number;
}

const LEVEL_EQUALITY_TOLERANCE = 0.00001;

function sameLevel(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * LEVEL_EQUALITY_TOLERANCE;
}

/** Closest value meaningfully greater than `target`, or null if none. */
function closestGreater(entries: RungEntry[], target: number): RungEntry | null {
  let best: RungEntry | null = null;
  for (const e of entries) {
    if (
      Number.isFinite(e.value) &&
      e.value > target &&
      !sameLevel(e.value, target) &&
      (!best || e.value < best.value)
    ) best = e;
  }
  return best;
}

/** Closest value meaningfully less than `target`, or null if none. */
function closestLesser(entries: RungEntry[], target: number): RungEntry | null {
  let best: RungEntry | null = null;
  for (const e of entries) {
    if (
      Number.isFinite(e.value) &&
      e.value < target &&
      !sameLevel(e.value, target) &&
      (!best || e.value > best.value)
    ) best = e;
  }
  return best;
}

/**
 * Tightest adjacent band from `entries` containing `value`, as
 * [higherKey, lowerKey].
 *
 * If value equals a rung within the level tolerance, that rung is used as
 * the nearest boundary and the next rung above it is preferred. This keeps
 * an equality such as today's S2 == previous S4 from skipping S2 and
 * generating the non-adjacent [S1, S3] band.
 */
function tightestAdjacentBand(entries: RungEntry[], value: number): [LevelCheckKey, LevelCheckKey] | null {
  const equal = entries.find((e) => Number.isFinite(e.value) && sameLevel(e.value, value));
  if (equal) {
    const upper = closestGreater(entries, equal.value);
    if (upper) return [upper.key, equal.key];

    const lower = closestLesser(entries, equal.value);
    if (lower) return [equal.key, lower.key];

    return null;
  }

  const upper = closestGreater(entries, value);
  const lower = closestLesser(entries, value);
  if (!upper || !lower) return null;
  return [upper.key, lower.key];
}

/**
 * Shared bracket lookup for both Backtest and Copy View.
 *
 * The band belongs to the opposite day's ladder, so the same-named level is
 * a valid candidate. For example, EU2L4 explicitly places previous S4
 * between today's S4 and S3; excluding today's S4 would make that valid
 * condition impossible to derive.
 */
export function findTightestAdjacentBand(
  bandCPR: CPRResult["todayCPR"],
  value: number
): [LevelCheckKey, LevelCheckKey] | null {
  const entries: RungEntry[] = LEVEL_CHECK_KEYS.map((key) => ({
    key,
    value: (bandCPR as unknown as Record<LevelCheckKey, number>)[key],
  }));
  return tightestAdjacentBand(entries, value);
}

/**
 * Evaluates a View's levelCheckDefs against a specific result's
 * prevCPR/todayCPR, returning whether ALL conditions matched. Same
 * subject/band semantics as compareSRLadders in pages/SRLadderDiff.tsx —
 * duplicated here rather than imported, since lib/ shouldn't import from
 * pages/ (same reason LevelCheckCondition itself is a local type there
 * instead of importing this one).
 *
 * A View with no levelCheckDefs at all imposes no extra gate — it's
 * still filtered purely by its passesPattern condition, same as before
 * this existed. A View WITH levelCheckDefs (via Copy View / Create View)
 * is stricter: a row only counts as matching the View if it also hits
 * the View's full signature, not just the underlying real-time/backtest
 * condition — otherwise a copied View would show every row the ORIGINAL
 * condition matches, most of which may only partially resemble the
 * specific setup the copy was made to capture.
 *
 * FIX: this used to only check "does the subject value fall inside
 * [lower, upper]?", which is a WEAKER test than compareSRLadders/
 * getLadderMatchSummary's own "Matching" rule (SRLadderDiff.tsx) — that
 * one additionally requires the band to be INTACT: no other one of the
 * 13 same-day lines may sit strictly between the two named band
 * boundaries, or the pair is no longer the adjacent band the condition
 * was written against. Because this function skipped that second half,
 * a symbol could pass this gate (raw value happens to land inside
 * [lower, upper]) while the "Ladder Check" column — built from the SAME
 * levelCheckDefs via getLadderMatchSummary — scored it well under
 * 13/13, since that column DOES apply the intact-band rule. That
 * mismatch is exactly how a View like "C-CL3U3-SH-AGapB-S4" could show
 * rows with a 5/13 Ladder Check: they passed the loose gate here but
 * fail the strict one everyone actually reads as "matching". Mirroring
 * the same intact-band check here makes levelCheckFullyMatches(r,
 * conditions) === true exactly when getLadderMatchSummary(r.prevCPR,
 * r.todayCPR, conditions).fullMatch === true — i.e. only genuine 13/13
 * rows pass the View from here on, for both the live Screener
 * (ScreenerUtils.tsx's passesPattern) and Backtest (below).
 */
export function levelCheckFullyMatches(r: CPRResult, conditions: LevelCheckCondition[] | undefined): boolean {
  if (!conditions || conditions.length === 0) return true;
  const today = r.todayCPR as unknown as Record<LevelCheckKey, number>;
  const prev = r.prevCPR as unknown as Record<LevelCheckKey, number>;

  return conditions.every((cond) => {
    const subjectIsToday = cond.subject === "today";
    const subjectVal = (subjectIsToday ? today : prev)[cond.key];
    const bandCPR = subjectIsToday ? prev : today;
    const bandA = bandCPR[cond.bandKeys[0]];
    const bandB = bandCPR[cond.bandKeys[1]];
    const lower = Math.min(bandA, bandB);
    const upper = Math.max(bandA, bandB);
    if (!(subjectVal >= lower && subjectVal <= upper)) return false;

    // Band-intact check — same rule as compareSRLadders: any OTHER of
    // the 13 same-day (bandCPR) lines strictly between lower/upper
    // breaks the band, even though subjectVal itself still numerically
    // qualifies.
    const bandKeySet = new Set<LevelCheckKey>(cond.bandKeys);
    for (const key of LEVEL_CHECK_KEYS) {
      if (bandKeySet.has(key)) continue;
      const v = bandCPR[key];
      if (Number.isFinite(v) && v > lower && v < upper) return false;
    }
    return true;
  });
}

/**
 * Derives all 13 LevelCheckCondition rows for a View from a single real
 * reconstructed CPRResult (e.g. whatever's currently on screen in the SR
 * Ladder panel when "Create View" is clicked) — see the algorithm
 * comment above. `CPRResult["todayCPR"]`/`["prevCPR"]` are assumed to
 * expose a property per LevelCheckKey (r4, r3, ..., prevHigh, ...,
 * prevLow, ..., s4), matching how getTarget/getEntry/getStoploss above
 * already read them (e.g. `r.todayCPR.r4`).
 */
export function deriveLevelCheckDefs(r: CPRResult): LevelCheckCondition[] {
  const today = r.todayCPR as unknown as Record<LevelCheckKey, number>;
  const prev = r.prevCPR as unknown as Record<LevelCheckKey, number>;

  const todayEntries: RungEntry[] = LEVEL_CHECK_KEYS.map((key) => ({ key, value: today[key] }));
  const prevEntries: RungEntry[] = LEVEL_CHECK_KEYS.map((key) => ({ key, value: prev[key] }));

  // Expanded pairs (EU2L4/EU3L4/EUTL3/EL2U4/...): today's structure
  // expands on prev's rather than sitting inside it, so grade the whole
  // ladder uniformly as "did YESTERDAY's rung get absorbed into TODAY's
  // new structure" (subject: "previous") instead of the mixed per-rung
  // forward/reversed check below — that mixed check would otherwise flip
  // direction rung-by-rung as today's wider range progressively falls
  // outside prev's narrower one, producing an inconsistent signature.
  if (isExpandedPatternPair(r.todayCPR, r.prevCPR)) {
    const defs: LevelCheckCondition[] = [];
    for (const key of LEVEL_CHECK_KEYS) {
      const todayVal = today[key];
      const prevVal = prev[key];
      if (!Number.isFinite(todayVal) || !Number.isFinite(prevVal)) {
        console.warn(`[levelCheck] "${key}" missing today/prev value — skipping`);
        continue;
      }
      const band = tightestAdjacentBand(todayEntries, prevVal);
      if (band) {
        defs.push({ key, subject: "previous", bandKeys: band });
      } else {
        console.warn(`[levelCheck] could not derive a "previous"-subject band for "${key}" — skipping`);
      }
    }
    return defs;
  }

  const defs: LevelCheckCondition[] = [];

  for (const key of LEVEL_CHECK_KEYS) {
    const todayVal = today[key];
    const prevVal = prev[key];
    if (!Number.isFinite(todayVal) || !Number.isFinite(prevVal)) {
      console.warn(`[levelCheck] "${key}" missing today/prev value — skipping`);
      continue;
    }

    // 1. Natural check: does today's rung sit inside a band from prev's ladder?
    const forwardBand = tightestAdjacentBand(prevEntries, todayVal);
    if (forwardBand) {
      defs.push({ key, subject: "today", bandKeys: forwardBand });
      continue;
    }

    // 2. Breakout: today's value is outside prev's entire range. Flip the
    // check — did YESTERDAY's rung get absorbed into TODAY's new structure?
    const reversedBand = tightestAdjacentBand(todayEntries, prevVal);
    if (reversedBand) {
      defs.push({ key, subject: "previous", bandKeys: reversedBand });
      continue;
    }

    // 3. Neither direction found a strict band — surface it rather than
    // silently emitting a bad rule (e.g. all 13 today/prev values equal,
    // or a genuinely broken reconstruction).
    console.warn(`[levelCheck] could not derive a band for "${key}" from either direction — skipping`);
  }

  return defs;
}

export interface CopyViewResult {
  ok: boolean;
  reason?: "source-not-found" | "duplicate-key" | "source-not-in-tree";
  cloned?: ViewDef;
}

/**
 * NEW: flat, indented list of every Category/Pattern/Subpattern node in
 * BACKTEST_CATEGORIES (Views excluded — they're leaves and can't host
 * children), for the Create/Copy View popovers' "attach under" dropdown.
 * Mirrors the same tree the "Category / Pattern / Subpattern / View"
 * picker at the top of BacktestPanel renders, so a person copying/
 * creating a View can file it under any node in that tree, not just a
 * flat, unrelated Screener-sidebar bucket.
 */
export function findContainingNodeKey(key: string): string | null {
  return getView(key)?.parentKey ?? null;
}

export interface AttachPointOption {
  key: string;
  label: string;
  depth: number; // 0 = category, 1 = Pattern, 2+ = nested Subpattern
  categoryLabel: string;
}

export function getAttachPointOptions(): AttachPointOption[] {
  const tree = buildViewTree();
  const opts: AttachPointOption[] = [];

  const walk = (nodes: ViewTreeNode[], depth: number, categoryLabel: string) => {
    for (const n of nodes) {
      if (n.kind === "pattern") {
        opts.push({ key: n.key, label: n.label, depth, categoryLabel });
        walk(n.children, depth + 1, categoryLabel);
      }
    }
  };

  for (const cat of tree) {
    if (cat.kind === "category") {
      opts.push({ key: cat.key, label: cat.label, depth: 0, categoryLabel: cat.label });
      walk(cat.children, 1, cat.label);
    }
  }

  return opts;
}

export function copyBacktestView(
  sourceKey: string,
  newKey: string,
  newLabel: string,
  attachKey?: string,
  levelCheckDefs?: LevelCheckCondition[]
): CopyViewResult {
  if (VIEWS.some(v => v.key === newKey)) {
    return { ok: false, reason: "duplicate-key" };
  }

  const sourceView = getView(sourceKey);
  if (!sourceView) {
    return { ok: false, reason: "source-not-found" };
  }

  const resolvedParentKey = attachKey ?? sourceView.parentKey ?? sourceKey;
  const conditionKey = sourceView.conditionKey ?? sourceView.key;

  const newViewDef: ViewDef = {
    ...sourceView,
    key: newKey,
    label: newLabel,
    parentKey: resolvedParentKey,
    conditionKey,
    kind: "view",
    levelCheckDefs: levelCheckDefs
      ? levelCheckDefs.map(d => ({ ...d, bandKeys: [...d.bandKeys] }))
      : sourceView.levelCheckDefs
      ? sourceView.levelCheckDefs.map(d => ({ ...d, bandKeys: [...d.bandKeys] }))
      : undefined,
  };

  VIEWS.push(newViewDef);

  return { ok: true, cloned: newViewDef };
}

// Finds the Pattern/Subpattern node (at any depth, under a category's
// `patterns` tree) whose OWN key matches `patternKey`, returning its
// subPatternKeys array (creating an empty one if the node doesn't have
// one yet). Distinct from findSubPatternKeysArray above, which searches
// for a node CONTAINING a given key — this searches for a node's own
// identity, since createBacktestView (below) has no existing View to
// search for; it's given the Pattern/Subpattern's own key directly.

export interface CreateViewResult {
  ok: boolean;
  reason?: "pattern-not-found" | "duplicate-key" | "invalid-target";
  created?: ViewDef;
}

const BULLISH_TARGETS: Record<string, { label: string; key: "r1" | "r2" | "r3" | "r4" }> = {
  // R1 is the nearest rung above entry (TC) — the quickest-to-hit target,
  // and the one an Up View's own stoploss (S1) mirrors on the other side.
  R1: { label: "U1 (today's R1)", key: "r1" },
  R2: { label: "U2 (today's R2)", key: "r2" },
  R3: { label: "U3 (today's R3)", key: "r3" },
  R4: { label: "U4 (today's R4)", key: "r4" },
};
const BEARISH_TARGETS: Record<string, { label: string; key: "s1" | "s2" | "s3" | "s4" }> = {
  // S1 mirrors R1 above: nearest rung below entry (BC), stoploss R1.
  S1: { label: "L1 (today's S1)", key: "s1" },
  S2: { label: "L2 (today's S2)", key: "s2" },
  S3: { label: "L3 (today's S3)", key: "s3" },
  S4: { label: "L4 (today's S4)", key: "s4" },
};

/**
 * Creates a brand-new View directly under a Pattern/Subpattern that
 * doesn't have one of its own yet (BacktestPanel.tsx's activePatternTarget
 * undefined for it — the case that currently shows a fallback "U4
 * (today's R4)"-style description instead of a real graded View).
 *
 * `direction` fixes entry/stoploss to this codebase's own convention —
 * bullish: entry TC, stoploss S1; bearish: entry BC, stoploss R1 (see
 * e.g. "7PM:MoMi-<L4:2AM" for a real bearish example of this exact
 * shape) — `target` picks which of that direction's four rungs
 * (R1/R2/R3/R4 bullish, S1/S2/S3/S4 bearish) actually grades the View.
 * Grades against `patternKey` itself via conditionKey — a
 * Pattern/Subpattern node's own key is already a real passesPattern
 * condition, so no new pattern-matching logic is needed.
 *
 * `levelCheckDefs` is the caller's responsibility to derive (see
 * deriveLevelCheckDefs above) — typically from whichever symbol's row
 * was on screen in the SR Ladder panel when "Create View" was clicked.
 *
 * `attachKey` (a Category/Pattern/Subpattern key from
 * getAttachPointOptions) picks where in the dropdown tree the new View
 * is filed. Defaults to `patternKey` itself — the node "Create View" was
 * opened from — so omitting it keeps the original behavior. `patternKey`
 * always stays the View's conditionKey (what it grades against);
 * `attachKey` only changes where it's nested, so a View can be created
 * from one Pattern's row but filed under a different Subpattern.
 */
export function createBacktestView(
  patternKey: string,
  newKey: string,
  newLabel: string,
  direction: "Up" | "Down",
  target: string,
  levelCheckDefs?: LevelCheckCondition[],
  attachKey?: string
): CreateViewResult {
  if (VIEWS.some(v => v.key === newKey)) {
    return { ok: false, reason: "duplicate-key" };
  }

  const isUp = direction === "Up" || (direction as string) === "bullish";
  const targetDefs = isUp ? BULLISH_TARGETS : BEARISH_TARGETS;
  const targetDef = targetDefs[target];
  if (!targetDef) {
    return { ok: false, reason: "invalid-target" };
  }

  const resolvedParentKey = attachKey ?? patternKey;
  const targetKey = targetDef.key;

  const newViewDef: ViewDef = {
    key: newKey,
    label: newLabel,
    parentKey: resolvedParentKey,
    conditionKey: patternKey,
    kind: "view",
    direction: isUp ? "Up" : "Down",
    targetLabel: targetDef.label,
    getTarget: (r: CPRResult) => r.todayCPR[targetKey],
    entryLabel: isUp ? "TC (today's TC)" : "BC (today's BC)",
    getEntry: (r: CPRResult) => (isUp ? r.todayCPR.tc : r.todayCPR.bc),
    stoplossLabel: isUp ? "S1 (today's S1)" : "R1 (today's R1)",
    getStoploss: (r: CPRResult) => (isUp ? r.todayCPR.s1 : r.todayCPR.r1),
    levelCheckDefs: levelCheckDefs
      ? levelCheckDefs.map(d => ({ ...d, bandKeys: [...d.bandKeys] }))
      : undefined,
  };

  VIEWS.push(newViewDef);

  return { ok: true, created: newViewDef };
}

/**
 * The dropdown no longer renders bold, non-selectable group headings
 * ("LittleCPR Above", "Overlap Below", ...). Instead every group's own
 * "— all (symbol list only)" row IS the heading: the category name is
 * rendered bold and the "— all (symbol list only)" suffix normal-weight,
 * e.g. render each option as:
 *
 *   <span className="font-semibold">{opt.boldLabel}</span>
 *   <span className="font-normal opacity-70">{opt.suffix}</span>
 *
 * Nested Pattern nodes follow their parent at any depth. Views remain leaf
 * entries beneath the Pattern node that owns them and have no bold part.
 */
export type BacktestOptionKind = "category" | "pattern" | "view";

export interface BacktestOption {
  value: string;              // category key, or category + full Pattern path, or a View key
  kind: BacktestOptionKind;
  boldLabel: string;          // bold part, e.g. "LittleCPR Above" ("" for patterns)
  suffix: string;             // normal-weight part, e.g. " — all (symbol list only)"
  plainLabel: string;         // boldLabel + suffix, for the collapsed/selected value
  depth: number;              // indentation level
  categoryKey: string;
  patternKey?: string;           // Pattern or Subpattern node key
  viewKey?: string;              // View leaf key
  symbolListOnly: boolean;    // true => runCategoryScan / runPivotLevelScan (Close + % Change columns)
}

export const SYMBOL_LIST_ONLY_SUFFIX = " — all (symbol list only)";

export function buildBacktestOptions(): BacktestOption[] {
  const tree = buildViewTree();
  const opts: BacktestOption[] = [];

  const walkPattern = (sub: ViewTreeNode, catKey: string, path: string[], depth: number) => {
    const selectionValue = [catKey, ...path].join("::");
    opts.push({
      value: selectionValue,
      kind: "pattern",
      boldLabel: sub.label,
      suffix: "",
      plainLabel: sub.label,
      depth,
      categoryKey: catKey,
      patternKey: sub.key,
      symbolListOnly: false,
    });

    for (const child of sub.children) {
      if (child.kind === "view") {
        opts.push({
          value: child.key,
          kind: "view",
          boldLabel: "",
          suffix: child.label,
          plainLabel: child.label,
          depth: depth + 1,
          categoryKey: catKey,
          patternKey: sub.key,
          viewKey: child.key,
          symbolListOnly: false,
        });
      } else if (child.kind === "pattern") {
        walkPattern(child, catKey, [...path, child.key], depth + 1);
      }
    }
  };

  for (const cat of tree) {
    opts.push({
      value: cat.key,
      kind: "category",
      boldLabel: cat.label,
      suffix: SYMBOL_LIST_ONLY_SUFFIX,
      plainLabel: cat.label + SYMBOL_LIST_ONLY_SUFFIX,
      depth: 0,
      categoryKey: cat.key,
      symbolListOnly: true,
    });

    for (const child of cat.children) {
      if (child.kind === "view") {
        opts.push({
          value: child.key,
          kind: "view",
          boldLabel: "",
          suffix: child.label,
          plainLabel: child.label,
          depth: 1,
          categoryKey: cat.key,
          viewKey: child.key,
          symbolListOnly: false,
        });
      } else if (child.kind === "pattern") {
        walkPattern(child, cat.key, [child.key], 1);
      }
    }
  }

  return opts;
}


export const BACKTEST_OPTIONS: BacktestOption[] = buildBacktestOptions();

export function findBacktestOption(value: string): BacktestOption | undefined {
  return BACKTEST_OPTIONS.find((o) => o.value === value);
}

export interface BacktestRow {
  symbol: string;
  source: BacktestSource;
  entryDate: string;               // YYYY-MM-DD (UTC) — the date the pattern was flagged
  todayCPR: CPRResult["todayCPR"];
  prevCPR: CPRResult["prevCPR"];
  compressionRatio: number;         // NEW: shown as a ratio in BacktestPanel's results table
  targetLevel: number;
  targetLabel: string;
  // NEW: Entry/Stoploss levels for the View, per BacktestTargetDef's
  // getEntry/getStoploss (today's TC/S1 for bullish R-level targets,
  // today's BC/R1 for bearish S-level targets).
  entryLevel: number;
  entryLabel: string;
  stoplossLevel: number;
  stoplossLabel: string;
  // NEW: "invalid-target" — the pattern matched on this date, but the CPR
  // level getTarget() reads off (e.g. todayCPR.r4) came back NaN/undefined
  // for this reconstruction, so there's no real price to grade the outcome
  // against. Previously this silently fell through to "fail", which read
  // as a real miss even though the target itself was never computable —
  // see BACKTEST_TARGETS' getTarget comment and backtestSymbolOnDate below.
  result: "pass" | "fail" | "insufficient-data" | "invalid-target";
  hitDate: string | null;          // which day (entryDate, entryDate+1, or entryDate+2) hit target, if any
  daysToHit: 0 | 1 | null;
  /** Entry-day close / prev close / day-before-prev close / day-over-day % change (same as CategoryScanRow). */
  closePrice: number | null;
  prevClose: number | null;
  ppClose: number | null;
  changePct: number | null;
  /**
   * The full reconstructed CPRResult (all pattern-flag booleans,
   * todayCPR/prevCPR/ppCPR) — same field CategoryScanRow carries, so the
   * pattern-backtest ("view") table renders the IDENTICAL S/R ladder panel
   * and Pattern badges as the category-scan tables.
   */
  raw: CPRResult;
}

/**
 * NEW: Simplified row for category scans — same CPR reconstruction as
 * BacktestRow, but deliberately has no targetLevel/result/hitDate fields.
 * A category (e.g. "LittleCPR Above") has no single defined target, so
 * there's nothing meaningful to grade; this just proves which symbols
 * matched the category's base condition on the entry date, plus their CPR
 * shape for reference (compressionRatio, widths via todayCPR/prevCPR).
 *
 * Also reused, unchanged, for Pattern scans (e.g.
 * "CPR Inside" → "CU4L4") — same shape, same reasoning: a Pattern
 * bucket within a category still has no single target to grade.
 */
export interface CategoryScanRow {
  symbol: string;
  source: BacktestSource;
  entryDate: string;
  todayCPR: CPRResult["todayCPR"];
  prevCPR: CPRResult["prevCPR"];
  compressionRatio: number;
  /**
   * NEW: entry-day close price and day-over-day % change, so the results
   * table can show "Close" and "% Change" columns (colour them green when
   * changePct >= 0, red when < 0) for every "— all (symbol list only)"
   * scan. Null when the entry-day candle isn't available (e.g. entryDate
   * is today and the daily candle hasn't printed yet).
   */
  closePrice: number | null;
  prevClose: number | null;
  ppClose: number | null;
  changePct: number | null;
  /**
   * NEW: the full reconstructed CPRResult (all pattern-flag booleans,
   * todayCPR/prevCPR/ppCPR) for this symbol/date. Lets consumers (e.g.
   * BacktestPanel's results table) render the same "Pattern" and
   * "Prev Pattern" badges as ScreenerTableRow does, via
   * renderTodayPatternBadges / renderPrevPatternBadge in
   * ScreenerTableRow.tsx.
   */
  raw: CPRResult;
}

/**
 * NEW: entry-day close + day-over-day % change for a scanned symbol.
 * Uses the entry date's own daily candle when it exists; falls back to the
 * last completed candle (D-1, the one that built todayCPR) otherwise.
 */
function closeAndChange(
  window: Map<string, OHLC>,
  entryDateISO: string
): { closePrice: number | null; prevClose: number | null; ppClose: number | null; changePct: number | null } {
  const candle = window.get(entryDateISO) ?? window.get(addDaysISO(entryDateISO, -1)) ?? null;
  if (!candle) return { closePrice: null, prevClose: null, ppClose: null, changePct: null };
  const baseDate = window.get(entryDateISO) ? entryDateISO : addDaysISO(entryDateISO, -1);
  const prevCandle = window.get(addDaysISO(baseDate, -1)) ?? null;
  const prevClose = prevCandle ? prevCandle.close : candle.open;
  // Close from two days before the entry/base date — feeds the SR Ladder's
  // ppClose row (the close that built ppCPR). Null when that candle isn't in
  // the reconstruction window.
  const ppCandle = window.get(addDaysISO(baseDate, -2)) ?? null;
  const ppClose = ppCandle ? ppCandle.close : null;
  const changePct = prevClose ? ((candle.close - prevClose) / prevClose) * 100 : null;
  return { closePrice: candle.close, prevClose, ppClose, changePct };
}

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * ADK PERF FIX (instant multi-date / yearly backtests)
 * ----------------------------------------------------
 * The old implementation fetched a fresh 9-candle window PER SYMBOL PER DATE.
 * A 1-day scan of 500 symbols = 500 HTTP calls; a 31-day sweep = 15,500 calls;
 * a full year = ~180,000 calls. That's why even a monthly sweep crawled.
 *
 * Daily candles never change once closed, so we now fetch each symbol's WHOLE
 * daily history ONCE (up to 1500 candles ≈ 4 years, a single API page) and
 * cache it in memory for the session. Every subsequent date in the sweep is a
 * pure in-memory Map lookup — zero network. A yearly sweep therefore costs the
 * same ~500 requests as a single day, and every date after the first is
 * effectively instant.
 */
/**
 * ADK FIX (backtest returned far fewer symbols than the Live Scanner)
 * ------------------------------------------------------------------
 * A 1500-candle klines page costs request-weight 10 on Binance Futures.
 * Prefetching ~530 symbols therefore burned ~5300 weight in one burst,
 * well past the 2400/min ceiling: most symbols came back 429/418, their
 * retries were exhausted, and they were silently dropped — which is why a
 * category showing 20 live only listed 9 in the backtest.
 *
 * A 500-candle page costs weight 2 (~1060 total for the whole universe),
 * which stays inside the limit, and still covers ~16 months of history —
 * more than enough for the date ranges the UI offers. Longer sweeps can
 * opt in via setBacktestHistoryLimit().
 */
// Start with the smallest useful window. Before each run, the requested date
// expands this only as far as needed (D-3 through D+1 plus a small safety
// margin). Recent single-date scans therefore transfer ~10-15 candles per
// symbol instead of 500, cutting both payload and Binance request weight.
let HISTORY_LIMIT = 10;

function ensureHistoryCoverage(entryDateISO: string): void {
  const entryMs = Date.parse(entryDateISO + "T00:00:00.000Z");
  if (!Number.isFinite(entryMs)) return;
  const todayMs = Date.parse(utcTodayISO() + "T00:00:00.000Z");
  const daysAgo = Math.max(0, Math.ceil((todayMs - entryMs) / 86_400_000));
  const required = Math.max(10, Math.min(1500, daysAgo + 6));
  if (required <= HISTORY_LIMIT) return;
  HISTORY_LIMIT = required;
  clearBacktestHistoryCache();
}

/** Opt-in for very long sweeps (max 1500). Clears the cache when changed. */
export function setBacktestHistoryLimit(limit: number): void {
  const next = Math.max(10, Math.min(1500, Math.floor(limit)));
  if (next === HISTORY_LIMIT) return;
  HISTORY_LIMIT = next;
  clearBacktestHistoryCache();
}

/** Symbols dropped by the last run because Binance never returned candles. */
let lastRunSkipped: string[] = [];
export function getLastRunSkippedSymbols(): string[] {
  return [...lastRunSkipped];
}

/** symbol -> full daily-candle history, keyed by UTC date string, plus which
 *  UTC calendar day the fetch happened on. */
interface CachedHistory {
  map: Map<string, OHLC>;
  fetchedOnUTCDate: string;
  fetchedAt: number;
}

/**
 * PERF FIX (the real cause of "Run Backtest is slow"): while TODAY's daily
 * candle is still forming, the freshness check below refused to reuse ANY
 * cached history, so every getHistory() call re-hit the network — once per
 * symbol, per date, per scan. prefetchHistories couldn't help either,
 * because hasCachedHistory() used a *different* (date-only) rule and
 * reported those symbols as already cached, so the parallel prefetch
 * skipped them and the refetching happened one-at-a-time inside the scan
 * loop instead. A short TTL keeps the intraday-freshness intent (a run a
 * minute later still picks up new prices) while letting a single run reuse
 * memory, and both call sites now share one freshness rule.
 */
const LIVE_CANDLE_TTL_MS = 60 * 1000;

function isHistoryFresh(cached: CachedHistory): boolean {
  const today = utcDateKey(Date.now());
  if (cached.fetchedOnUTCDate !== today) return false; // may hold yesterday's live candle
  const todaysCandle = cached.map.get(today);
  const stillLive = !!todaysCandle && isLiveDailyCandle(todaysCandle.openTime);
  if (!stillLive) return true; // day closed — snapshot is final
  return Date.now() - cached.fetchedAt < LIVE_CANDLE_TTL_MS;
}
const binanceHistoryCache = new Map<string, CachedHistory | null>();
const deltaHistoryCache = new Map<string, CachedHistory | null>();
/** In-flight de-dupe so parallel dates/symbols never double-fetch. */
const inFlight = new Map<string, Promise<Map<string, OHLC> | null>>();

/** True when a symbol's history is already in memory for TODAY (no network
 *  needed) — a cache entry from a previous UTC day doesn't count, since it
 *  may still be holding yesterday's live/incomplete candle (see getHistory). */
export function hasCachedHistory(symbol: string, source: BacktestSource): boolean {
  const cache = source === "binance" ? binanceHistoryCache : deltaHistoryCache;
  const cached = cache.get(symbol);
  if (cached === undefined) return false;
  if (cached === null) return true; // cached failure — still "resolved", don't re-hammer it
  // Must use the SAME rule as getHistory, or the prefetch skips symbols that
  // getHistory then refetches serially inside the scan loop.
  return isHistoryFresh(cached);
}

/** Drop all cached candle history (e.g. to pick up a newly closed day). */
export function clearBacktestHistoryCache(): void {
  binanceHistoryCache.clear();
  deltaHistoryCache.clear();
  inFlight.clear();
}

/**
 * Full Binance daily history for a symbol, keyed by UTC date string.
 *
 * ADK FIX (single source of truth): this used to re-implement Binance access
 * — its own URLs, its own venue cache, its own kline parsing and NO retry on
 * 429/418. It now delegates to binance.ts's `fetchDailyKlines`, so
 * rate-limit backoff and kline parsing are shared with the live screener
 * and can never drift apart again.
 *
 * FUTURES/PERPS ONLY: `fetchDailyKlines` only ever fetches from Binance
 * USDⓈ-M Futures now — there is no Spot fallback anywhere in the app. A
 * symbol with no perpetual listing, or whose futures request keeps
 * failing, is simply skipped for this backtest run rather than silently
 * analysed on Spot data (which could be a different instrument than the
 * one the Live Scanner charts/links).
 */
async function fetchBinanceHistory(symbol: string): Promise<Map<string, OHLC> | null> {
  const candles = await fetchDailyKlines(symbol, HISTORY_LIMIT);
  if (!candles || !candles.length) return null;
  const map = new Map<string, OHLC>();
  for (const c of candles) map.set(utcDateKey(c.openTime), c);
  return map;
}
/**
 * Full Delta Exchange India daily history for a symbol. Delta's candles
 * endpoint requires an explicit start/end, so we ask for the last
 * HISTORY_LIMIT days up to now — same coverage as the Binance page.
 */
async function fetchDeltaHistory(symbol: string): Promise<Map<string, OHLC> | null> {
  const end = Math.floor(Date.now() / 1000) + 86400;
  const start = end - HISTORY_LIMIT * 86400;
  try {
    const res = await fetch(
      `https://api.india.delta.exchange/v2/history/candles?symbol=${symbol}&resolution=1d&start=${start}&end=${end}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    let raw: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> | null = null;
    if (Array.isArray(data.result)) raw = data.result;
    else if (data.result && Array.isArray(data.result.candles)) raw = data.result.candles;
    else if (Array.isArray(data.candles)) raw = data.candles;
    else if (Array.isArray(data)) raw = data;
    if (!raw || !raw.length) return null;
    const map = new Map<string, OHLC>();
    for (const k of raw) {
      const openTimeMs = k.time > 1e10 ? k.time : k.time * 1000;
      map.set(utcDateKey(openTimeMs), {
        openTime: openTimeMs,
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume: Number(k.volume),
      });
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Cached accessor — one network call per symbol per UTC calendar day, shared
 * by every date in a sweep within that day. Replaces the old
 * fetchBinanceWindow/fetchDeltaWindow.
 *
 * FIX (false "Fail" on a same-day breakout): fetchDailyKlines has no
 * endTime, so its response always includes TODAY's still-forming daily
 * candle — whatever high/low it has SO FAR at fetch time, not the day's
 * eventual final high/low (see isLiveDailyCandle in binance.ts, used for the
 * exact same reason by the live screener). The old cache kept that
 * snapshot for the rest of the browser session with no expiry: fetch once
 * mid-day, and even after the real day closes with a much higher high (a
 * late breakout, say), every later backtest run in that session kept
 * grading against the stale, incomplete candle — a pattern whose target was
 * genuinely reached could still show "Fail" for the rest of the session.
 * Cache entries now carry the UTC calendar date they were fetched on; once
 * "now" rolls past that date, the entry is treated as stale and refetched,
 * so a candle that was live at fetch time is re-read once it's actually
 * closed. Still only one network call per symbol per day, not per request.
 */
async function getHistory(symbol: string, source: BacktestSource): Promise<Map<string, OHLC> | null> {
  const cache = source === "binance" ? binanceHistoryCache : deltaHistoryCache;
  const today = utcDateKey(Date.now());
  const cached = cache.get(symbol);

  // FIX (stale live price on repeated same-day runs): a cache entry from
  // earlier today is only safe to reuse once TODAY's own daily candle has
  // actually closed. While it's still forming, its close/high/low keep
  // moving (that's the whole point of isLiveDailyCandle — see binance.ts),
  // so a snapshot fetched once mid-day and reused for every later run
  // this session would keep showing an old close/price long after the
  // live Screener has moved on. Only short-circuit here once today's
  // candle (if present in the cached map) is no longer live; otherwise
  // fall through and refetch so intraday price moves are picked up.
  if (cached === null) return null; // cached failure — still "resolved", don't re-hammer it
  if (cached !== undefined && isHistoryFresh(cached)) return cached.map;

  const key = `${source}:${symbol}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const p = (source === "binance" ? fetchBinanceHistory(symbol) : fetchDeltaHistory(symbol))
    .then((hist) => {
      // Only cache SUCCESS. A null here almost always means "rate-limited
      // / transient network failure", and caching it used to permanently
      // amputate that symbol from every later scan in the session.
      if (hist) cache.set(symbol, { map: hist, fetchedOnUTCDate: today, fetchedAt: Date.now() });
      inFlight.delete(key);
      return hist;
    })
    .catch(() => {
      inFlight.delete(key);
      return null;
    });
  inFlight.set(key, p);
  return p;
}

/**
 * Returns a date-aware symbol universe for a backtest.
 *
 * Binance and Delta expose the current tradable universe, not a complete
 * historical listing/unlisting archive. This function uses three protections
 * against look-ahead bias:
 *
 * 1. A saved snapshot for the requested UTC date is preferred when available.
 * 2. For older dates without a snapshot, only symbols with an actual candle on
 *    the requested date are retained. This prevents later listings from
 *    entering an older backtest.
 * 3. For today's date, the current live universe is valid and is snapshotted
 *    for future reuse.
 *
 * The candle-based fallback cannot recover symbols that were delisted and are
 * no longer returned by the exchange's current universe endpoint. That is an
 * exchange-data limitation, so the fallback is logged as approximate.
 */
const HISTORICAL_UNIVERSE_STORAGE_PREFIX = "cpr_historical_universe_v1:";

type StoredUniverse = string[];

function universeStorageKey(source: BacktestSource, dateISO: string): string {
  return HISTORICAL_UNIVERSE_STORAGE_PREFIX + source + ":" + dateISO;
}

function readStoredUniverse(source: BacktestSource, dateISO: string): StoredUniverse | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(universeStorageKey(source, dateISO));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((value): value is string => typeof value === "string" && value.length > 0)) {
      return null;
    }
    return [...new Set(parsed)];
  } catch {
    return null;
  }
}

function writeStoredUniverse(source: BacktestSource, dateISO: string, symbols: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(universeStorageKey(source, dateISO), JSON.stringify([...new Set(symbols)]));
  } catch {
    // Storage may be disabled or full. The backtest can still run in memory.
  }
}

export function utcTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidUTCDateISO(dateISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const parsed = Date.parse(dateISO + "T00:00:00.000Z");
  return Number.isFinite(parsed);
}

async function getCurrentSymbolCandidates(source: BacktestSource): Promise<string[]> {
  const symbols = source === "binance"
    ? (await fetchTopUSDTSymbols()).map((ticker) => ticker.symbol)
    : (await fetchDeltaPerps()).map((ticker) => ticker.symbol);
  return [...new Set(symbols)];
}

// PERF/CONSISTENCY FIX: a date-range sweep used to call getCurrentSymbolCandidates
// (a live exchange fetch) once per date -- 10 dates meant 10 live fetches in quick
// succession, which both slowed the sweep down and made it more likely to get
// rate-limited partway through, silently shrinking the candidate universe for
// whichever dates lost that race. The live top-symbols list also doesn't change
// meaningfully within the few seconds/minutes a sweep takes, so there's nothing
// gained by refetching it per date. This short-TTL cache makes every date in one
// sweep share a single fetch; a genuinely new run later (past the TTL) still gets
// a fresh live list.
const CANDIDATE_CACHE_TTL_MS = 5 * 60 * 1000;
const candidateCache = new Map<BacktestSource, { symbols: string[]; fetchedAt: number }>();

async function getCurrentSymbolCandidatesCached(source: BacktestSource): Promise<string[]> {
  const cached = candidateCache.get(source);
  if (cached && Date.now() - cached.fetchedAt < CANDIDATE_CACHE_TTL_MS) return cached.symbols;
  const symbols = await getCurrentSymbolCandidates(source);
  candidateCache.set(source, { symbols, fetchedAt: Date.now() });
  return symbols;
}

async function getSymbolUniverse(
  source: BacktestSource,
  entryDateISO: string,
  onProgress?: (done: number, total: number, symbol: string) => void,
): Promise<string[]> {
  if (!isValidUTCDateISO(entryDateISO)) {
    throw new Error("Invalid backtest date " + entryDateISO + ". Expected YYYY-MM-DD.");
  }

  // Size the exchange response for this date before any history is fetched.
  // The limit only grows during a range sweep, so an older date warms enough
  // data for every newer date without repeatedly clearing the cache.
  ensureHistoryCoverage(entryDateISO);

  const saved = readStoredUniverse(source, entryDateISO);
  if (saved && saved.length > 0) return saved;

  // PERF/CONSISTENCY FIX: shared across every date in a sweep (see cache above)
  // instead of a fresh live fetch per date.
  const currentCandidates = await getCurrentSymbolCandidatesCached(source);
  if (!currentCandidates.length) {
    throw new Error("No current " + source + " symbols were returned by the exchange.");
  }

  // Today's current exchange universe is the correct as-of-date universe.
  if (entryDateISO === utcTodayISO()) {
    writeStoredUniverse(source, entryDateISO, currentCandidates);
    return currentCandidates;
  }

  // Warm history once. The run functions prefetch the filtered list again,
  // but those entries are already cached here.
  await prefetchHistories(currentCandidates, source, onProgress);

  // PERF FIX: this used to await getHistory() one symbol at a time. With the
  // cache warmed above that is cheap, but any symbol the prefetch missed
  // turned into a serial network round-trip per symbol. Resolve in parallel
  // chunks instead, preserving the original ordering.
  const historicalSymbols: string[] = [];
  const COVERAGE_CHUNK = 20;
  for (let i = 0; i < currentCandidates.length; i += COVERAGE_CHUNK) {
    const chunk = currentCandidates.slice(i, i + COVERAGE_CHUNK);
    const histories = await Promise.all(chunk.map((s) => getHistory(s, source)));
    histories.forEach((history, idx) => {
      if (history?.has(entryDateISO)) historicalSymbols.push(chunk[idx]);
    });
  }

  if (!historicalSymbols.length) {
    throw new Error(
      "No historical candle coverage was found for " + source + " on " + entryDateISO + ". " +
      "The date may be outside the configured history limit, or a date-specific universe snapshot is required."
    );
  }

  console.warn(
    "[backtest] Using a candle-availability universe for " + entryDateISO + ": " +
    historicalSymbols.length + "/" + currentCandidates.length + " current symbols had a candle on that date. " +
    "Delisted symbols cannot be recovered from the exchange's current universe endpoint; treat this as approximate unless a saved snapshot exists."
  );

  // CONSISTENCY FIX: previously only "today's" universe was ever persisted, so
  // every run against a past date -- single-date or range -- re-derived its
  // universe from scratch against whatever the live top-symbols list happened
  // to be at that moment. That's what let a single-date run and a range run
  // disagree on the very same historical date. Persisting it here means the
  // FIRST run for a given (source, date) pins the snapshot, and every later
  // run -- either mode -- reuses that exact list via readStoredUniverse above
  // instead of re-deriving a possibly-different one.
  writeStoredUniverse(source, entryDateISO, historicalSymbols);

  return historicalSymbols;
}

/**
 * Yields to the browser's paint cycle. `await Promise.all(...)` alone only
 * yields a microtask — when every symbol in a batch already has cached
 * candles (no real network I/O), the whole scan resolves as a chain of
 * microtasks with no macrotask in between, so the browser never gets a
 * chance to repaint the progress bar between onProgress calls: it stays at
 * 0% until the entire scan finishes, then jumps straight to 100%. This
 * forces an actual macrotask boundary so each progress update gets painted.
 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Warms the cache for a whole symbol universe in parallel chunks. Call this
 * once before a multi-date sweep: after it resolves, every date in the range
 * scans purely in memory.
 */
export async function prefetchHistories(
  symbols: string[],
  source: BacktestSource,
  onProgress?: (done: number, total: number, symbol: string) => void,
  // Small recent-date requests cost less exchange weight, so they can use a
  // wider pool. Long-history pages stay conservative to avoid 429/418 waits.
  concurrency = HISTORY_LIMIT <= 100 ? 40 : HISTORY_LIMIT <= 500 ? 20 : 5
): Promise<void> {
  lastRunSkipped = [];

  // Up to 3 passes: anything that failed (almost always a 429 burst) is
  // retried after a short cool-off instead of vanishing from the results.
  // A worker pool replaces fixed Promise.all chunks: when one request finishes,
  // the next starts immediately instead of waiting for the slowest request in
  // its chunk. This matters on first-run single-date scans with 500+ symbols.
  let pending = symbols.filter((s) => !hasCachedHistory(s, source));
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    if (pass > 0) await new Promise((r) => setTimeout(r, 2000 * pass));
    let nextIndex = 0;
    let completed = symbols.length - pending.length;
    const runWorker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= pending.length) return;
        const symbol = pending[index];
        await getHistory(symbol, source);
        completed++;
        onProgress?.(completed, symbols.length, symbol);
        if (completed % 25 === 0) await yieldToBrowser();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, pending.length) }, () => runWorker())
    );
    pending = pending.filter((s) => !hasCachedHistory(s, source));
  }

  lastRunSkipped = pending;
  if (pending.length) {
    console.warn(
      `[backtest] ${pending.length}/${symbols.length} symbols had no Binance candles after 3 passes:`,
      pending
    );
  }
}

/**
 * Shared reconstruction step used by both backtestSymbolOnDate (patterns,
 * below), categoryScanSymbolOnDate (categories, further below), and
 * pivotLevelScanSymbolOnDate (Pattern sub-categories, further below):
 * fetches the candle window for a symbol/date and rebuilds the CPRResult
 * that would have been active on entryDate, exactly as the live scanner
 * does (pp/prev/today candle selection). Returns null if there isn't
 * enough history to reconstruct it at all.
 */
async function reconstructCPRForDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string
): Promise<{ result: CPRResult; window: Map<string, OHLC> } | null> {
  const window = await getHistory(symbol, source);
  if (!window) return null;

  // ADK FIX (backtest count < live count): the old version looked up the
  // EXACT calendar keys D-1/D-2/D-3 and bailed out whenever one was
  // missing. Binance occasionally has gaps in daily data for thin pairs,
  // and the Live Scanner never sees those gaps because it selects candles
  // BY POSITION (the last completed klines), not by date. We now do the
  // same: take every completed candle strictly before the entry date and
  // use the last three — identical semantics to runScreener's
  // pp/prev/today selection in binance.ts.
  const entryMs = Date.parse(entryDateISO + "T00:00:00.000Z");
  const completed = [...window.values()]
    .filter((c) => c.openTime < entryMs)
    .sort((a, b) => a.openTime - b.openTime);
  if (completed.length < 2) return null; // not enough history to reconstruct the CPR

  const todayCandle = completed[completed.length - 1]; // D-1 → today's CPR
  const prevCandle = completed[completed.length - 2]; // D-2 → prev CPR
  const ppCandle = completed.length >= 3 ? completed[completed.length - 3] : null;

  const candlesForAnalysis: OHLC[] = ppCandle ? [ppCandle, prevCandle, todayCandle] : [prevCandle, todayCandle];

  // currentPrice/change24h/quoteVolume aren't read by passesPattern for
  // any of the target/category patterns used here, so placeholder values
  // (todayCandle.close, 0, 0) are fine.
  const result = analyzeCPR(symbol, candlesForAnalysis, todayCandle.close, 0, 0, todayCandle.open);
  if (!result) return null;

  return { result, window };
}

/**
 * Backtests one symbol on one date:
 *   1. Reconstruct the CPR that would have been active on entryDate D
 *      (todayCPR from D-1's candle, prevCPR from D-2's, ppCPR from D-3's —
 *      identical candle selection to the live scanner).
 *   2. Check whether the pattern condition actually held on that date.
 *      If not, this symbol isn't part of the backtest for D — returns null,
 *      NOT a "fail" (fail is reserved for "matched the pattern but target
 *      wasn't hit").
 *   3. If it matched, check whether target was reached within the entry
 *      day or D+1 — using each day's high (bullish) or low (bearish).
 *      A hit on either of these two days counts as a pass; CHANGED: D+2 is
 *      no longer checked at all, so a miss on both the entry day and D+1
 *      is graded "fail" outright instead of getting a third D+2 chance.
 *
 * Returns null when there isn't enough candle history to evaluate at all
 * (e.g. symbol didn't exist yet, or D is too recent for D+1 data to
 * exist).
 */
export async function backtestSymbolOnDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string,
  target: ViewDef,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean
): Promise<BacktestRow | null> {
  const dPlus1 = addDaysISO(entryDateISO, 1);

  const reconstructed = await reconstructCPRForDate(symbol, source, entryDateISO);
  if (!reconstructed) return null;
  const { result, window } = reconstructed;

  if (!passesPatternFn(result, target.conditionKey ?? target.key)) return null; // didn't match the pattern on this date
  if (!levelCheckFullyMatches(result, target.levelCheckDefs)) return null; // didn't hit this View's full Level Check signature

  const getTarget = target.getTarget ?? ((r: CPRResult) => r.todayCPR.r4);
  const isDown = target.direction === "Down" || (target.direction as string) === "bearish";
  const isUp = target.direction === "Up" || (target.direction as string) === "bullish" || !isDown;
  const getEntry = target.getEntry ?? ((r: CPRResult) => (isDown ? r.todayCPR.bc : r.todayCPR.tc));
  const getStoploss = target.getStoploss ?? ((r: CPRResult) => (isDown ? r.todayCPR.r1 : r.todayCPR.s1));

  const targetLevel = getTarget(result);
  const entryLevel = getEntry(result);
  const stoplossLevel = getStoploss(result);
  const entryDayCandle = window.get(entryDateISO) ?? null;
  const nextDayCandle = window.get(dPlus1) ?? null;

  // FIX: a NaN/undefined targetLevel (getTarget read off a CPR level that
  // wasn't computed for this reconstruction, e.g. todayCPR.r4 missing) used
  // to fall through to the hits() check below, where every `c.high >=
  // NaN` comparison is false — so hitDate never got set and the row was
  // mislabeled "fail" even though no real target existed to miss. Bail out
  // to "invalid-target" instead so it reads distinctly from a genuine miss.
  if (!Number.isFinite(targetLevel)) {
    console.warn(
      `[backtest] ${symbol} on ${entryDateISO}: pattern "${target.key}" matched but its target ` +
        `level ("${target.targetLabel}") came back non-finite (${targetLevel}) — marking invalid-target.`
    );
    return {
      symbol,
      source,
      entryDate: entryDateISO,
      todayCPR: result.todayCPR,
      prevCPR: result.prevCPR,
      compressionRatio: result.compressionRatio,
      targetLevel,
      targetLabel: target.targetLabel ?? "U4 (today's R4)",
      entryLevel,
      entryLabel: target.entryLabel ?? "TC (today's TC)",
      stoplossLevel,
      stoplossLabel: target.stoplossLabel ?? "S1 (today's S1)",
      result: "invalid-target",
      hitDate: null,
      daysToHit: null,
      ...closeAndChange(window, entryDateISO),
      raw: result,
    };
  }

  const hits = (c: OHLC | null) =>
    !!c && (isUp ? c.high >= targetLevel : c.low <= targetLevel);

  let hitDate: string | null = null;
  let daysToHit: 0 | 1 | null = null;
  if (hits(entryDayCandle)) {
    hitDate = entryDateISO;
    daysToHit = 0;
  } else if (hits(nextDayCandle)) {
    hitDate = dPlus1;
    daysToHit = 1;
  }

  const outcome: BacktestRow["result"] =
    entryDayCandle || nextDayCandle ? (hitDate ? "pass" : "fail") : "insufficient-data";

  return {
    symbol,
    source,
    entryDate: entryDateISO,
    todayCPR: result.todayCPR,
    prevCPR: result.prevCPR,
    compressionRatio: result.compressionRatio,
    targetLevel,
    targetLabel: target.targetLabel ?? "U4 (today's R4)",
    entryLevel,
    entryLabel: target.entryLabel ?? "TC (today's TC)",
    stoplossLevel,
    stoplossLabel: target.stoplossLabel ?? "S1 (today's S1)",
    result: outcome,
    hitDate,
    daysToHit,
    ...closeAndChange(window, entryDateISO),
    raw: result,
  };
}

/**
 * NEW: Category-scan version of backtestSymbolOnDate — same CPR
 * reconstruction, but checks the CATEGORY's base condition (e.g.
 * "compressed") instead of a specific pattern's, and returns a
 * CategoryScanRow with no target/result/hitDate fields, since a category
 * has no single defined target to grade against.
 */
export async function categoryScanSymbolOnDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string,
  categoryKey: string,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean
): Promise<CategoryScanRow | null> {
  const reconstructed = await reconstructCPRForDate(symbol, source, entryDateISO);
  if (!reconstructed) return null;
  const { result, window } = reconstructed;

  if (!passesPatternFn(result, categoryKey)) return null; // didn't match the category's base condition

  return {
    symbol,
    source,
    entryDate: entryDateISO,
    todayCPR: result.todayCPR,
    prevCPR: result.prevCPR,
    compressionRatio: result.compressionRatio,
    ...closeAndChange(window, entryDateISO),
    raw: result,
  };
}

/**
 * NEW: Pattern backtest version of backtestSymbolOnDate — same CPR
 * reconstruction, and checks BOTH the parent CATEGORY's base condition
 * (e.g. "inside-cpr") AND the named Pattern's raw flag (e.g.
 * "CU4L4", via matchesPatternFn — see matchesPatternFlag in
 * ScreenerUtils.tsx), same two-part match as before. CHANGED: every
 * existing Pattern now grades against a fixed target — today's own R4 /
 * U4, bullish ("-R4") — instead of running as a symbol-list-only scan, so
 * it returns a full BacktestRow (targetLevel/result/hitDate/daysToHit)
 * using the identical entry/D+1 hit-window logic as
 * backtestSymbolOnDate. This lets the Backtest panel render Pattern
 * selections with the exact same Result/Hit Date/Change columns as a
 * View backtest.
 */
export async function pivotLevelBacktestSymbolOnDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string,
  categoryKey: string,
  pivotLevelKey: string,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  matchesPatternFn: (r: CPRResult, label: string) => boolean
): Promise<BacktestRow | null> {
  const dPlus1 = addDaysISO(entryDateISO, 1);

  const reconstructed = await reconstructCPRForDate(symbol, source, entryDateISO);
  if (!reconstructed) return null;
  const { result, window } = reconstructed;

  if (!passesPatternFn(result, categoryKey)) return null; // didn't match the parent category's base condition
  if (!matchesPatternFn(result, pivotLevelKey)) return null; // didn't match this Pattern's raw flag

  // NEW: if this Pattern (or a nested Subpattern under it — see
  // BacktestSubCategoryDef.patterns in the interfaces above) has its own
  // BACKTEST_TARGETS entry keyed by its exact pivotLevelKey (e.g.
  // "E-E-AA-BB-EL1U2" graded against today's own R2), grade against THAT
  // specific target/direction instead. Falls back to the original
  // hardcoded bullish U4/R4 target below for every Pattern that has no
  // defined target of its own, so existing Pattern-only selections are
  // unaffected.
  const definedTarget = getView(pivotLevelKey);
  const isUpTarget = definedTarget
    ? definedTarget.direction === "Up" || (definedTarget.direction as string) === "bullish" || (definedTarget.direction as string) !== "Down" && (definedTarget.direction as string) !== "bearish"
    : true;
  const targetLevel = definedTarget?.getTarget ? definedTarget.getTarget(result) : result.todayCPR.r4;
  const targetLabel = definedTarget?.targetLabel ?? "U4 (today's R4)";
  const entryLevel = definedTarget?.getEntry ? definedTarget.getEntry(result) : (isUpTarget ? result.todayCPR.tc : result.todayCPR.bc);
  const entryLabel = definedTarget?.entryLabel ?? (isUpTarget ? "TC (today's TC)" : "BC (today's BC)");
  const stoplossLevel = definedTarget?.getStoploss ? definedTarget.getStoploss(result) : (isUpTarget ? result.todayCPR.s1 : result.todayCPR.r1);
  const stoplossLabel = definedTarget?.stoplossLabel ?? (isUpTarget ? "S1 (today's S1)" : "R1 (today's R1)");
  const entryDayCandle = window.get(entryDateISO) ?? null;
  const nextDayCandle = window.get(dPlus1) ?? null;

  // Same non-finite-target guard as backtestSymbolOnDate — see its
  // comment for why this is "invalid-target" rather than a silent "fail".
  if (!Number.isFinite(targetLevel)) {
    console.warn(
      `[backtest] ${symbol} on ${entryDateISO}: Pattern "${pivotLevelKey}" matched but its ` +
        `target (${targetLabel}) came back non-finite (${targetLevel}) — marking invalid-target.`
    );
    return {
      symbol,
      source,
      entryDate: entryDateISO,
      todayCPR: result.todayCPR,
      prevCPR: result.prevCPR,
      compressionRatio: result.compressionRatio,
      targetLevel,
      targetLabel,
      entryLevel,
      entryLabel,
      stoplossLevel,
      stoplossLabel,
      result: "invalid-target",
      hitDate: null,
      daysToHit: null,
      ...closeAndChange(window, entryDateISO),
      raw: result,
    };
  }

  const hits = (c: OHLC | null) => !!c && (isUpTarget ? c.high >= targetLevel : c.low <= targetLevel);

  let hitDate: string | null = null;
  let daysToHit: 0 | 1 | null = null;
  if (hits(entryDayCandle)) {
    hitDate = entryDateISO;
    daysToHit = 0;
  } else if (hits(nextDayCandle)) {
    hitDate = dPlus1;
    daysToHit = 1;
  }

  const outcome: BacktestRow["result"] =
    entryDayCandle || nextDayCandle ? (hitDate ? "pass" : "fail") : "insufficient-data";

  return {
    symbol,
    source,
    entryDate: entryDateISO,
    todayCPR: result.todayCPR,
    prevCPR: result.prevCPR,
    compressionRatio: result.compressionRatio,
    targetLevel,
    targetLabel,
    entryLevel,
    entryLabel,
    stoplossLevel,
    stoplossLabel,
    result: outcome,
    hitDate,
    daysToHit,
    ...closeAndChange(window, entryDateISO),
    raw: result,
  };
}

/**
 * Runs the requested historical universe through backtestSymbolOnDate.
 *
 * The universe is date-aware: saved point-in-time snapshots are preferred,
 * and otherwise symbols must have a candle on the requested entry date. The
 * fallback still cannot restore delisted symbols that are absent from the
 * exchange's current symbol endpoint.
 */
export async function runBacktest(
  patternKey: string,
  entryDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void,
  // NEW: streams matched rows to the UI as each batch resolves, instead of
  // waiting for the full scan to finish before showing anything.
  onPartialRows?: (newRows: BacktestRow[]) => void
): Promise<BacktestRow[]> {
  const target = getView(patternKey);
  if (!target) throw new Error(`No backtest target defined yet for pattern "${patternKey}"`);

  // Single source of truth — see getSymbolUniverse above. No per-call
  // duplication of the fetch/filter/sort logic. onProgress is forwarded so
  // the initial universe prefetch reports progress instead of going silent.
  const symbols: string[] = await getSymbolUniverse(source, entryDateISO, onProgress);

  // Warm the candle cache once; subsequent dates in a sweep hit memory only.
  await prefetchHistories(symbols, source, onProgress);

  const rows: BacktestRow[] = [];
  // PERF FIX: this was dropped from 50 to 25 in a recent change, which
  // doubled the number of batch iterations (and doubled the number of
  // yieldToBrowser() macrotask hops + onPartialRows/setRows re-renders)
  // for the same symbol universe -- the direct cause of Run Backtest
  // feeling slower. Raised to 100: by this point prefetchHistories has
  // already warmed the whole universe into cache, so backtestSymbolOnDate
  // is pure in-memory CPR reconstruction + pattern matching here, not
  // network I/O -- a bigger batch costs nothing in lost parallelism and
  // buys fewer round-trips through the loop below.
  const batchSize = 100;

  // PERF FIX: streamed rows are now buffered and flushed to onPartialRows
  // at most every FLUSH_INTERVAL_MS, instead of once per batch. Flushing
  // less often directly cuts total work: BacktestPanel's onPartialRows
  // handler does setRows((prev) => [...prev, ...streamed]), which
  // re-copies the WHOLE accumulated rows array on every call -- so total
  // copy + re-render cost scales with the NUMBER of flushes, not just the
  // number of rows. Time-based throttling keeps the UI live on slow scans
  // (network-bound, real waiting) while collapsing many small flushes
  // into a few large ones on fast scans (cache-warm, CPU-bound), where
  // the old per-batch flush was pure overhead.
  const FLUSH_INTERVAL_MS = 200;
  let pendingFlush: BacktestRow[] = [];
  let lastFlushAt = Date.now();
  const maybeFlush = (force: boolean) => {
    if (!pendingFlush.length) return;
    if (!force && Date.now() - lastFlushAt < FLUSH_INTERVAL_MS) return;
    onPartialRows?.(pendingFlush);
    pendingFlush = [];
    lastFlushAt = Date.now();
  };

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((sym) => backtestSymbolOnDate(sym, source, entryDateISO, target, passesPatternFn))
    );
    const isLastBatch = i + batchSize >= symbols.length;
    batchResults.forEach((r) => {
      if (r) { rows.push(r); pendingFlush.push(r); }
    });
    maybeFlush(isLastBatch);
    onProgress?.(Math.min(i + batchSize, symbols.length), symbols.length, batch[batch.length - 1]);
    await yieldToBrowser();
  }

  return rows;
}

/**
 * NEW: Category-scan counterpart of runBacktest — same symbol-universe
 * caveat applies (see KNOWN LIMITATION above). Runs categoryScanSymbolOnDate
 * across the full universe and returns the simplified CategoryScanRow list
 * (symbol list + CPR data only, no target/result/hitDate).
 */
export async function runCategoryScan(
  categoryKey: string,
  entryDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<CategoryScanRow[]> {
  // Single source of truth — see getSymbolUniverse above. No per-call
  // duplication of the fetch/filter/sort logic.
  const symbols: string[] = await getSymbolUniverse(source, entryDateISO);

  const rows: CategoryScanRow[] = [];
  await prefetchHistories(symbols, source, onProgress);

  const batchSize = 50;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((sym) => categoryScanSymbolOnDate(sym, source, entryDateISO, categoryKey, passesPatternFn))
    );
    batchResults.forEach((r) => {
      if (r) rows.push(r);
    });
    onProgress?.(Math.min(i + batchSize, symbols.length), symbols.length, batch[batch.length - 1]);
    await yieldToBrowser();
  }

  return rows;
}

/**
 * NEW: Pattern backtest counterpart of runCategoryScan — same
 * symbol-universe caveat applies (see KNOWN LIMITATION above). Runs
 * pivotLevelBacktestSymbolOnDate across the full universe and returns a
 * graded BacktestRow list (Target/Result/Hit Date, target = today's R4 /
 * U4, bullish) for a category's Pattern sub-bucket (e.g. "CPR Inside"
 * → "CU4L4-R4"), same shape as runBacktest's output.
 */
/**
 * NEW: Pattern Stats page support. One row per dropdown pattern entry
 * (every `sub.key` nested under a BACKTEST_CATEGORIES category's
 * `patterns` list — e.g. "A-A-AA-AA", "B-C-BB-C") plus how many real
 * historical (symbol, date) rows actually matched it.
 */
export interface PatternCensusRow {
  categoryKey: string;
  categoryLabel: string;
  patternKey: string; // matches matchesPatternFlag's `label` param
  patternLabel: string;
  count: number;
}

/**
 * TEMPORARY DEBUG ADDITION — one row per distinct raw
 * (HHLLCategory, RRHHCategory, SSLLCategory) combination actually observed
 * among the real historical rows that pass a category's base condition
 * (passesPatternFn(result, categoryKey)). This is the same raw-flag triple
 * the comments throughout BACKTEST_PATTERN_MATCHERS reason about ("of the
 * 9x9 naive HHLLCategory x RRHHCategory x SSLLCategory combinations, only
 * N are reachable") — surfaced directly from live data instead of by
 * proof, so those claims can be sanity-checked per category. Remove this
 * (and its plumbing in runPatternCensus/PatternStats) once no longer needed.
 */
export interface CategoryComboRow {
  categoryKey: string;
  categoryLabel: string;
  combo: string; // e.g. "HHLL-A / RRHH-AA / SSLL-AA", or, for
                 // "top15gainers"/"top15losers" only,
                 // "RRSS-A / HHLL-A / RRHH-AA / SSLL-OA" (see
                 // RRSS_COMBO_CATEGORIES below).
  hhll: string;
  rrhh: string;
  ssll: string;
  rrss?: string; // only set for RRSS_COMBO_CATEGORIES ("top15gainers"/"top15losers")
  count: number;
}

// TEMPORARY DEBUG ADDITION — categories whose combo tally gets the raw
// SSRRCategory (RRSS-A/RRSS-B/RRSS-C/RRSS-E/RRSS=) prepended as a 4th
// segment, ahead of HHLL/RRHH/SSLL. Requested for "TOP 15 GAINERS"/
// "TOP 15 LOSERS" only — every other category keeps the plain
// HHLL/RRHH/SSLL combo.
const RRSS_COMBO_CATEGORIES = new Set(["top15gainers", "top15losers"]);

/**
 * Counts live matches for EVERY dropdown pattern across a date range in a
 * single sweep, instead of re-running runPivotLevelBacktest once per
 * pattern (which would reconstruct the same symbol/date CPR dozens of
 * times over — one pass per pattern instead of one pass total). For each
 * (symbol, date) in range, reconstructCPRForDate runs ONCE (cached candle
 * history, so no extra network calls after the initial prefetch), and the
 * resulting CPRResult is checked against every (categoryKey, patternKey)
 * pair — same passesPatternFn/matchesPatternFn used everywhere else in
 * this file (see passesPattern/matchesPatternFlag in ScreenerUtils.tsx).
 *
 * The symbol universe is resolved once, as of endDateISO (the most recent
 * date in range) — same "current exchange universe, walked backward"
 * caveat as getSymbolUniverse's other callers; see its KNOWN LIMITATION
 * comment above for what that means for delisted symbols.
 */
export async function runPatternCensus(
  startDateISO: string,
  endDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  matchesPatternFn: (r: CPRResult, label: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<{ rows: PatternCensusRow[]; combos: CategoryComboRow[] }> {
  if (!isValidUTCDateISO(startDateISO) || !isValidUTCDateISO(endDateISO)) {
    throw new Error("Invalid date range " + startDateISO + " .. " + endDateISO + ". Expected YYYY-MM-DD.");
  }
  if (startDateISO > endDateISO) {
    throw new Error("startDateISO must be <= endDateISO.");
  }

  // Flatten every (category, pattern) pair once up front.
  const rootCategories = buildViewTree();
  const pairs: { categoryKey: string; categoryLabel: string; patternKey: string; patternLabel: string }[] = [];
  for (const cat of rootCategories) {
    const collectPatterns = (nodes: ViewTreeNode[]) => {
      for (const sub of nodes) {
        if (sub.kind === "pattern" || sub.kind === "view") {
          pairs.push({ categoryKey: cat.key, categoryLabel: cat.label, patternKey: sub.key, patternLabel: sub.label });
        }
        if (sub.children && sub.children.length > 0) collectPatterns(sub.children);
      }
    };
    collectPatterns(cat.children);
  }

  const counts = new Map<string, number>();
  const pairKey = (categoryKey: string, patternKey: string) => `${categoryKey}::${patternKey}`;
  pairs.forEach((p) => counts.set(pairKey(p.categoryKey, p.patternKey), 0));

  // TEMPORARY DEBUG ADDITION — see CategoryComboRow above. One counter per
  // (category, raw HHLL/RRHH/SSLL combo) observed among rows that pass
  // that category's base condition. Every category is covered here (not
  // just categories with a `patterns` list), since the combo is a property
  // of the base condition itself, not of any nested pattern.
  const comboCounts = new Map<string, number>();
  const comboKey = (categoryKey: string, combo: string) => `${categoryKey}::${combo}`;

  const dates: string[] = [];
  for (let d = startDateISO; d <= endDateISO; d = addDaysISO(d, 1)) dates.push(d);

  const symbols: string[] = await getSymbolUniverse(source, endDateISO);
  await prefetchHistories(symbols, source, onProgress);

  const batchSize = 50;
  let done = 0;
  const total = symbols.length;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (symbol) => {
        for (const dateISO of dates) {
          const reconstructed = await reconstructCPRForDate(symbol, source, dateISO);
          if (!reconstructed) continue;
          const { result } = reconstructed;

          // TEMPORARY DEBUG ADDITION — tally the raw HHLL/RRHH/SSLL combo
          // once per category (independent of any nested pattern loop
          // below), for every category, not only ones with `patterns`.
          // For RRSS_COMBO_CATEGORIES ("top15gainers"/"top15losers") the
          // raw SSRRCategory (RRSS-X) is prepended as a 4th segment.
          const hhll = result.HHLLCategory ?? "none";
          const rrhh = result.RRHHCategory ?? "none";
          const ssll = result.SSLLCategory ?? "none";
          const rrss = result.SSRRCategory ?? "none";
          const baseCombo = `${hhll} / ${rrhh} / ${ssll}`;
          for (const cat of rootCategories) {
            if (!passesPatternFn(result, cat.key)) continue; // base category condition
            const combo = RRSS_COMBO_CATEGORIES.has(cat.key) ? `${rrss} / ${baseCombo}` : baseCombo;
            const k = comboKey(cat.key, combo);
            comboCounts.set(k, (comboCounts.get(k) ?? 0) + 1);
          }

          for (const p of pairs) {
            if (!passesPatternFn(result, p.categoryKey)) continue; // base category condition
            if (!matchesPatternFn(result, p.patternKey)) continue; // this pattern's raw flag
            const k = pairKey(p.categoryKey, p.patternKey);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        }
      })
    );
    done = Math.min(i + batchSize, symbols.length);
    onProgress?.(done, total, batch[batch.length - 1]);
    await yieldToBrowser();
  }

  const rows = pairs
    .map((p) => ({ ...p, count: counts.get(pairKey(p.categoryKey, p.patternKey)) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  // TEMPORARY DEBUG ADDITION — flatten comboCounts into CategoryComboRow[],
  // sorted highest-count-first within each category (PatternStats groups
  // these back up by categoryKey). RRSS_COMBO_CATEGORIES combos carry an
  // extra leading RRSS-X segment, so they're split into 4 parts instead of 3.
  const combos: CategoryComboRow[] = [];
  for (const cat of rootCategories) {
    const prefix = `${cat.key}::`;
    for (const [k, count] of comboCounts.entries()) {
      if (!k.startsWith(prefix)) continue;
      const combo = k.slice(prefix.length);
      if (RRSS_COMBO_CATEGORIES.has(cat.key)) {
        const [rrss, hhll, rrhh, ssll] = combo.split(" / ");
        combos.push({ categoryKey: cat.key, categoryLabel: cat.label, combo, hhll, rrhh, ssll, rrss, count });
      } else {
        const [hhll, rrhh, ssll] = combo.split(" / ");
        combos.push({ categoryKey: cat.key, categoryLabel: cat.label, combo, hhll, rrhh, ssll, count });
      }
    }
  }
  combos.sort((a, b) => b.count - a.count);

  return { rows, combos };
}

export async function runPivotLevelBacktest(
  categoryKey: string,
  pivotLevelKey: string,
  entryDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  matchesPatternFn: (r: CPRResult, label: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<BacktestRow[]> {
  // Single source of truth — see getSymbolUniverse above. No per-call
  // duplication of the fetch/filter/sort logic.
  const symbols: string[] = await getSymbolUniverse(source, entryDateISO);

  const rows: BacktestRow[] = [];
  await prefetchHistories(symbols, source, onProgress);

  const batchSize = 50;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((sym) =>
        pivotLevelBacktestSymbolOnDate(sym, source, entryDateISO, categoryKey, pivotLevelKey, passesPatternFn, matchesPatternFn)
      )
    );
    batchResults.forEach((r) => {
      if (r) rows.push(r);
    });
    onProgress?.(Math.min(i + batchSize, symbols.length), symbols.length, batch[batch.length - 1]);
    await yieldToBrowser();
  }

  return rows;
}