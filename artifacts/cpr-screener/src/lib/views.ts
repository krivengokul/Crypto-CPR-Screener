import type {
  CPRResult,
  CPRLevels,
  SSRRCategory,
  HHLLCategory,
  SSLLCategory,
  RRHHCategory,
} from "./cpr";
import { dirTol, classifyCPRPair, pickPattern } from "./cpr";

/**
 * views.ts — SINGLE SOURCE OF TRUTH for every Category / Pattern / View key
 * used across the Screener (ScreenerUtils.tsx: passesPattern,
 * matchesPatternFlag), the left-nav (ViewsSidebar.tsx), and the Backtest
 * panel (backtest.ts: BACKTEST_TARGETS, BACKTEST_CATEGORIES).
 *
 * WHY THIS FILE EXISTS: previously a View's CONDITION lived only in
 * ScreenerUtils.tsx's passesPattern switch, while its METADATA (target/
 * entry/stoploss, label, left-nav/Backtest tree position) lived only in
 * backtest.ts — the two were stitched together purely by matching string
 * keys. That let a key exist on one side with no matching entry on the
 * other (see the several "silently fell through to default, 0 records"
 * bugs already fixed in both files' comments). Every key now gets exactly
 * one ViewDef, in this one array — nothing else defines a condition or
 * a key's metadata.
 *
 * MIGRATION STATUS (see the incremental plan discussed in chat):
 *   Step 1 — this file's scaffolding (ViewDef, VIEWS, passesView, childrenOf). DONE.
 *   Step 2 — PIVOT_PATTERNS (the compound HHLL x RRHH x SSLL conditions
 *            nested under levelsabove/levelsbelow/compressed/expanded). DONE
 *            below, via COMPOUND_COMBOS + makeCompoundView (mechanical
 *            generation, since the key format `${ssrr}-${hhll}-${rrhh}-${ssll}`
 *            IS the condition — no reason to hand-write 97 near-duplicate
 *            arrow functions when a declarative table produces them).
 *   Step 3 — NOT DONE YET: the ~600 hand-authored named Views/Patterns
 *            currently in passesPattern's switch (the "9AM:...", "8AM:...",
 *            "A-A-AA-AA-U3L4" etc. keys) plus their BACKTEST_TARGETS
 *            target/entry/stoploss metadata. These still live in
 *            ScreenerUtils.tsx / backtest.ts untouched for now — do NOT
 *            delete PIVOT_PATTERNS, BACKTEST_TARGETS, or BACKTEST_CATEGORIES
 *            until step 3 folds them in here too.
 */

/**
 * One of the 13 ADK ladder-line checks used by "Copy View"/"Create View"
 * Level Check grading — same shape as backtest.ts's LevelCheckCondition
 * (duplicated here rather than imported, same lib/pages direction reason
 * as computePrevPattern below; backtest.ts is welcome to import this one
 * instead of keeping its own once this migration reaches it).
 */
export type LevelCheckKey =
  | "r4" | "r3" | "r2" | "prevHigh" | "r1" | "tc" | "pivot" | "bc"
  | "prevLow" | "s1" | "s2" | "s3" | "s4";

export interface LevelCheckCondition {
  key: LevelCheckKey;
  subject: "today" | "previous";
  bandKeys: [LevelCheckKey, LevelCheckKey];
}

export interface ViewDef {
  /** Unique key — matches the current pattern-key strings exactly. */
  key: string;
  label: string;
  /**
   * Key of the parent Category/Pattern this is nested under, if any.
   * passesView() ANDs the parent's condition in automatically — callers
   * no longer need to separately apply the category's own base condition
   * the way passesPattern("levelsabove") + a raw flag check used to.
   */
  parentKey?: string;
  kind: "category" | "pattern" | "view";
  /**
   * This ViewDef's OWN condition, NOT including the parent's — passesView
   * chains parentKey for you. (This mirrors PIVOT_PATTERNS' original
   * contract in ScreenerUtils.tsx: "NONE of these conditions AND in their
   * parent category's own base condition — that's left to the caller."
   * Here "the caller" is passesView itself, applied uniformly instead of
   * ad hoc per call site.)
   */
  condition: (r: CPRResult) => boolean;
  direction?: "bullish" | "bearish";
  getTarget?: (r: CPRResult) => number;
  targetLabel?: string;
  getEntry?: (r: CPRResult) => number;
  entryLabel?: string;
  getStoploss?: (r: CPRResult) => number;
  stoplossLabel?: string;
  /** Whether ViewsSidebar's left-nav should render this. */
  showInLeftNav?: boolean;
  /** Explicit sort position among siblings (replaces orderedEntries). */
  order?: number;
  /** Optional Level Check signature — same semantics as BacktestTargetDef's. */
  levelCheckDefs?: LevelCheckCondition[];
}

// ---------------------------------------------------------------------
// Step 1 — registry + evaluator
// ---------------------------------------------------------------------

export const VIEWS: ViewDef[] = [];

export function getView(key: string): ViewDef | undefined {
  return VIEWS.find((v) => v.key === key);
}

/**
 * passesView — the single evaluator every call site should use once
 * migration is complete. Walks the parentKey chain so each ViewDef only
 * has to state what IT adds on top of its parent.
 */
export function passesView(r: CPRResult, key: string): boolean {
  const v = getView(key);
  if (!v) return false;
  if (v.parentKey && !passesView(r, v.parentKey)) return false;
  return v.condition(r);
}

/** All direct children of a Category/Pattern key, in display order. */
export function childrenOf(parentKey: string | undefined): ViewDef[] {
  return VIEWS.filter((v) => v.parentKey === parentKey).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
}

// ---------------------------------------------------------------------
// Step 2 — the four top-level Categories
// ---------------------------------------------------------------------

const CATEGORY_VIEWS: ViewDef[] = [
  { key: "levelsabove", label: "LEVEL ABOVE", kind: "category", condition: (r) => r.LevelsAbove },
  { key: "levelsbelow", label: "LEVEL BELOW", kind: "category", condition: (r) => r.LevelsBelow },
  { key: "compressed", label: "COMPRESSED", kind: "category", condition: (r) => r.compressed },
  { key: "expanded", label: "EXPANDED", kind: "category", condition: (r) => r.expanded },
];

// ---------------------------------------------------------------------
// Step 2 — PIVOT_PATTERNS migration: every compound
// HHLLCategory x RRHHCategory x SSLLCategory condition, keyed
// `${ssrr}-${hhll}-${rrhh}-${ssll}`. The key format IS the condition, so
// this is generated from a declarative combo table instead of 97
// hand-written arrow functions — add a row here, get a working View.
// ---------------------------------------------------------------------

type SSRRLetter = "A" | "B" | "C" | "E";
type HHLLLetter = "A" | "B" | "C" | "E";
type RRHHSuffix = "AA" | "OA" | "BB" | "OB" | "C" | "E" | "RA" | "HA";
type SSLLSuffix = "AA" | "OA" | "BB" | "OB" | "C" | "E" | "SB" | "LB";

const SSRR_INFO: Record<SSRRLetter, { parentKey: string; category: SSRRCategory }> = {
  A: { parentKey: "levelsabove", category: "RRSS-A" },
  B: { parentKey: "levelsbelow", category: "RRSS-B" },
  C: { parentKey: "compressed", category: "RRSS-C" },
  E: { parentKey: "expanded", category: "RRSS-E" },
};

const HHLL_INFO: Record<HHLLLetter, HHLLCategory> = {
  A: "HHLL-A",
  B: "HHLL-B",
  C: "HHLL-C",
  E: "HHLL-E",
};

function rrhhCategory(suffix: RRHHSuffix): RRHHCategory {
  return `RRHH-${suffix}` as RRHHCategory;
}
function ssllCategory(suffix: SSLLSuffix): SSLLCategory {
  return `SSLL-${suffix}` as SSLLCategory;
}

interface CompoundCombo {
  ssrr: SSRRLetter;
  hhll: HHLLLetter;
  rrhh: RRHHSuffix;
  ssll: SSLLSuffix;
}

/**
 * Every combo transcribed 1:1 from ScreenerUtils.tsx's PIVOT_PATTERNS map
 * (same order, grouped the same way: A-B, A-A, A-E, A-C, B-A, B-B, B-C,
 * B-E, C-A, C-B, C-C, E-A, E-B, E-E). See that map's original comments in
 * ScreenerUtils.tsx for the reachability proofs / empirical trims behind
 * each group — those derivations don't change here, only where the
 * resulting conditions live.
 */
const COMPOUND_COMBOS: CompoundCombo[] = [
  // A-B-*
  { ssrr: "A", hhll: "B", rrhh: "C", ssll: "C" },
  { ssrr: "A", hhll: "B", rrhh: "C", ssll: "LB" },
  { ssrr: "A", hhll: "B", rrhh: "E", ssll: "E" },
  { ssrr: "A", hhll: "B", rrhh: "E", ssll: "LB" },
  { ssrr: "A", hhll: "B", rrhh: "RA", ssll: "C" },
  { ssrr: "A", hhll: "B", rrhh: "RA", ssll: "E" },
  { ssrr: "A", hhll: "B", rrhh: "RA", ssll: "LB" },
  // A-A-*
  { ssrr: "A", hhll: "A", rrhh: "AA", ssll: "AA" },
  { ssrr: "A", hhll: "A", rrhh: "AA", ssll: "OA" },
  { ssrr: "A", hhll: "A", rrhh: "OA", ssll: "AA" },
  { ssrr: "A", hhll: "A", rrhh: "OA", ssll: "OA" },
  // A-E-*
  { ssrr: "A", hhll: "E", rrhh: "AA", ssll: "C" },
  { ssrr: "A", hhll: "E", rrhh: "OA", ssll: "C" },
  { ssrr: "A", hhll: "E", rrhh: "AA", ssll: "E" },
  { ssrr: "A", hhll: "E", rrhh: "OA", ssll: "E" },
  { ssrr: "A", hhll: "E", rrhh: "AA", ssll: "LB" },
  { ssrr: "A", hhll: "E", rrhh: "OA", ssll: "LB" },
  // A-C-*
  { ssrr: "A", hhll: "C", rrhh: "C", ssll: "AA" },
  { ssrr: "A", hhll: "C", rrhh: "C", ssll: "OA" },
  { ssrr: "A", hhll: "C", rrhh: "E", ssll: "AA" },
  { ssrr: "A", hhll: "C", rrhh: "E", ssll: "OA" },
  { ssrr: "A", hhll: "C", rrhh: "RA", ssll: "AA" },
  { ssrr: "A", hhll: "C", rrhh: "RA", ssll: "OA" },

  // B-A-*
  { ssrr: "B", hhll: "A", rrhh: "C", ssll: "C" },
  { ssrr: "B", hhll: "A", rrhh: "C", ssll: "SB" },
  { ssrr: "B", hhll: "A", rrhh: "E", ssll: "E" },
  { ssrr: "B", hhll: "A", rrhh: "E", ssll: "SB" },
  { ssrr: "B", hhll: "A", rrhh: "HA", ssll: "C" },
  { ssrr: "B", hhll: "A", rrhh: "HA", ssll: "E" },
  { ssrr: "B", hhll: "A", rrhh: "HA", ssll: "SB" },
  { ssrr: "B", hhll: "A", rrhh: "OB", ssll: "SB" },
  { ssrr: "B", hhll: "A", rrhh: "OB", ssll: "E" },
  { ssrr: "B", hhll: "A", rrhh: "OB", ssll: "C" },
  { ssrr: "B", hhll: "A", rrhh: "HA", ssll: "OB" },
  { ssrr: "B", hhll: "A", rrhh: "HA", ssll: "OA" },
  { ssrr: "B", hhll: "A", rrhh: "E", ssll: "OA" },
  { ssrr: "B", hhll: "A", rrhh: "E", ssll: "OB" },
  { ssrr: "B", hhll: "A", rrhh: "C", ssll: "OA" },
  { ssrr: "B", hhll: "A", rrhh: "OA", ssll: "E" },
  // B-B-*
  { ssrr: "B", hhll: "B", rrhh: "BB", ssll: "BB" },
  { ssrr: "B", hhll: "B", rrhh: "BB", ssll: "OB" },
  { ssrr: "B", hhll: "B", rrhh: "OB", ssll: "BB" },
  { ssrr: "B", hhll: "B", rrhh: "OB", ssll: "OB" },
  { ssrr: "B", hhll: "B", rrhh: "C", ssll: "BB" },
  { ssrr: "B", hhll: "B", rrhh: "C", ssll: "OB" },
  { ssrr: "B", hhll: "B", rrhh: "BB", ssll: "C" },
  // B-C-*
  { ssrr: "B", hhll: "C", rrhh: "BB", ssll: "C" },
  { ssrr: "B", hhll: "C", rrhh: "OB", ssll: "C" },
  { ssrr: "B", hhll: "C", rrhh: "BB", ssll: "E" },
  { ssrr: "B", hhll: "C", rrhh: "OB", ssll: "E" },
  { ssrr: "B", hhll: "C", rrhh: "BB", ssll: "SB" },
  { ssrr: "B", hhll: "C", rrhh: "BB", ssll: "OB" },
  { ssrr: "B", hhll: "C", rrhh: "BB", ssll: "OA" },
  { ssrr: "B", hhll: "C", rrhh: "OB", ssll: "OB" },
  // B-E-*
  { ssrr: "B", hhll: "E", rrhh: "C", ssll: "BB" },
  { ssrr: "B", hhll: "E", rrhh: "C", ssll: "OB" },
  { ssrr: "B", hhll: "E", rrhh: "E", ssll: "BB" },
  { ssrr: "B", hhll: "E", rrhh: "E", ssll: "OB" },
  { ssrr: "B", hhll: "E", rrhh: "OB", ssll: "BB" },
  { ssrr: "B", hhll: "E", rrhh: "OB", ssll: "OB" },
  { ssrr: "B", hhll: "E", rrhh: "HA", ssll: "BB" },
  { ssrr: "B", hhll: "E", rrhh: "OA", ssll: "BB" },

  // C-A-*
  { ssrr: "C", hhll: "A", rrhh: "C", ssll: "AA" },
  { ssrr: "C", hhll: "A", rrhh: "HA", ssll: "AA" },
  { ssrr: "C", hhll: "A", rrhh: "E", ssll: "AA" },
  { ssrr: "C", hhll: "A", rrhh: "OA", ssll: "AA" },
  { ssrr: "C", hhll: "A", rrhh: "OB", ssll: "AA" },
  { ssrr: "C", hhll: "A", rrhh: "E", ssll: "OA" },
  { ssrr: "C", hhll: "A", rrhh: "C", ssll: "OA" },
  { ssrr: "C", hhll: "A", rrhh: "OA", ssll: "OA" },
  // C-B-*
  { ssrr: "C", hhll: "B", rrhh: "BB", ssll: "LB" },
  { ssrr: "C", hhll: "B", rrhh: "OB", ssll: "LB" },
  { ssrr: "C", hhll: "B", rrhh: "BB", ssll: "C" },
  { ssrr: "C", hhll: "B", rrhh: "OB", ssll: "C" },
  { ssrr: "C", hhll: "B", rrhh: "BB", ssll: "E" },
  { ssrr: "C", hhll: "B", rrhh: "OB", ssll: "E" },
  // C-C-*
  { ssrr: "C", hhll: "C", rrhh: "BB", ssll: "AA" },
  { ssrr: "C", hhll: "C", rrhh: "OB", ssll: "AA" },
  { ssrr: "C", hhll: "C", rrhh: "BB", ssll: "OA" },
  { ssrr: "C", hhll: "C", rrhh: "OB", ssll: "OA" },
  { ssrr: "C", hhll: "C", rrhh: "C", ssll: "AA" },

  // E-A-*
  { ssrr: "E", hhll: "A", rrhh: "AA", ssll: "OB" },
  { ssrr: "E", hhll: "A", rrhh: "OA", ssll: "OB" },
  { ssrr: "E", hhll: "A", rrhh: "AA", ssll: "SB" },
  { ssrr: "E", hhll: "A", rrhh: "AA", ssll: "C" },
  { ssrr: "E", hhll: "A", rrhh: "OA", ssll: "C" },
  { ssrr: "E", hhll: "A", rrhh: "AA", ssll: "E" },
  { ssrr: "E", hhll: "A", rrhh: "OA", ssll: "E" },
  // E-B-*
  { ssrr: "E", hhll: "B", rrhh: "RA", ssll: "BB" },
  { ssrr: "E", hhll: "B", rrhh: "C", ssll: "BB" },
  { ssrr: "E", hhll: "B", rrhh: "E", ssll: "BB" },
  { ssrr: "E", hhll: "B", rrhh: "C", ssll: "OB" },
  { ssrr: "E", hhll: "B", rrhh: "E", ssll: "OB" },
  // E-E-*
  { ssrr: "E", hhll: "E", rrhh: "AA", ssll: "BB" },
  { ssrr: "E", hhll: "E", rrhh: "OA", ssll: "BB" },
  { ssrr: "E", hhll: "E", rrhh: "AA", ssll: "OB" },
  { ssrr: "E", hhll: "E", rrhh: "OA", ssll: "OB" },
];

function makeCompoundView(c: CompoundCombo): ViewDef {
  const key = `${c.ssrr}-${c.hhll}-${c.rrhh}-${c.ssll}`;
  const { parentKey, category: ssrrCategory } = SSRR_INFO[c.ssrr];
  const hhllCategory = HHLL_INFO[c.hhll];
  const rrhh = rrhhCategory(c.rrhh);
  const ssll = ssllCategory(c.ssll);
  return {
    key,
    label: key,
    parentKey,
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === ssrrCategory &&
      r.HHLLCategory === hhllCategory &&
      r.RRHHCategory === rrhh &&
      r.SSLLCategory === ssll,
  };
}

const COMPOUND_VIEWS: ViewDef[] = COMPOUND_COMBOS.map(makeCompoundView);

VIEWS.push(...CATEGORY_VIEWS, ...COMPOUND_VIEWS);

/**
 * Backward-compatible shim so ScreenerUtils.tsx's passesPattern and
 * matchesPatternFlag can keep doing `PIVOT_PATTERNS[pattern]` unchanged
 * until step 3 replaces those switches with passesView() directly. Same
 * contract as the original: each function is standalone (does NOT AND in
 * the parent category condition) — callers still apply that separately,
 * exactly as passesPattern("levelsabove") + PIVOT_PATTERNS[key] used to.
 */
export const PIVOT_PATTERNS: Record<string, (r: CPRResult) => boolean> =
  Object.fromEntries(COMPOUND_VIEWS.map((v) => [v.key, v.condition]));

// ---------------------------------------------------------------------
// Step 3, batch 1 — "levelsabove" and "levelsbelow" only (their sibling
// "ABOVE LEVEL4" / R1AbovePR4 and "BELOW LEVEL4" / S1BelowPS4 categories
// are a separate top-level tree, despite the similar name, and are NOT
// touched here — a later batch).
//
// Transcribed directly from the uploaded ScreenerUtils.tsx (passesPattern
// lines 759-1217, matchesPatternFlag's matching cases) and backtest.ts
// (BACKTEST_CATEGORIES lines 1424-2117, BACKTEST_TARGETS). Two real
// findings surfaced while doing this faithfully — see the comments on
// "PDH>pTC-U4:5AM" and "11AM:pCPR1AHi-FApU4:1PM" below — NOT fixed here,
// only preserved and flagged, per the "don't silently fix, just migrate"
// rule for this pass.
//
// Deliberately NOT included in this batch (see chat): "6PM:APHS1A-FAU4:99PM",
// "6PM:APHS1A-FAU4:9PMM", "A-A-AA-AA-EUBL2-pS4S2:R2",
// "B-B-BB-BB-L4U4-Ladder:R4", "B-B-BB-BB-L4U4-pGapA", and
// "B-B-BB-BB-L2U4-pPPHR1" — these are "Copy View" entries (BACKTEST_TARGETS'
// conditionKey mechanism): they have NO passesPattern case of their own,
// they're graded via a redirect to a DIFFERENT key's condition plus a
// levelCheckDefs signature check. That redirect is a backtest.ts-only
// concept this batch doesn't model yet (ViewDef has no conditionKey/
// levelCheckDefs fields) — modeling it properly is its own follow-up, not
// something to bolt on here.
// ---------------------------------------------------------------------

/**
 * Duplicated one-liner from ScreenerUtils.tsx's own computePrevPattern
 * (which just delegates to these same two cpr.ts functions) — NOT a new
 * third implementation, but doing it inline here (rather than importing
 * ScreenerUtils.tsx's copy) keeps this lib/ file from importing a pages/
 * file. FOLLOW-UP WORTH DOING: move the real computePrevPattern into
 * cpr.ts and have both ScreenerUtils.tsx and this file import the one
 * copy — trivial since it has zero dependency on anything else in
 * ScreenerUtils.tsx.
 */
function computePrevPattern(today: CPRLevels, prev: CPRLevels | undefined | null): string | null {
  if (!prev) return null;
  return pickPattern(classifyCPRPair(today, prev));
}

const LEVELSABOVE_VIEWS: ViewDef[] = [
  // --- direct Pattern children of "levelsabove" ---
  { key: "EU2L4", label: "EU2L4", parentKey: "levelsabove", kind: "pattern", condition: (r) => r.EU2L4 },
  { key: "U4L3", label: "U4L3", parentKey: "levelsabove", kind: "pattern", condition: (r) => r.U4L3 },

  // --- A-B-C-C's one nested child ---
  { key: "A-B-C-C-EU4L4", label: "A-B-C-C-EU4L4", parentKey: "A-B-C-C", kind: "pattern", condition: (r) => r.EU4L4 },

  // --- A-A-AA-AA's six nested Subpattern children ---
  { key: "A-A-AA-AA-U3L3", label: "A-A-AA-AA-U3L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U3L3 },
  { key: "A-A-AA-AA-U4L3", label: "A-A-AA-AA-U4L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U4L3 },
  { key: "A-A-AA-AA-EU2L4", label: "A-A-AA-AA-EU2L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.EU2L4 },
  { key: "A-A-AA-AA-U2L4", label: "A-A-AA-AA-U2L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U2L4 },
  { key: "A-A-AA-AA-U3L4", label: "A-A-AA-AA-U3L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U3L4 },
  { key: "A-A-AA-AA-EU3L4", label: "A-A-AA-AA-EU3L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.EU3L4 },

  // --- A-A-AA-OA's one nested child ---
  { key: "A-A-AA-OA-U3L4", label: "A-A-AA-OA-U3L4", parentKey: "A-A-AA-OA", kind: "pattern", condition: (r) => r.U3L4 },

  // --- leaf Views (self-contained, target-graded) ---
  {
    key: "7PM:MoMi->U4:2AM",
    label: "7PM:MoMi->U4:2AM",
    parentKey: "EU2L4",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      computePrevPattern(r.prevCPR, r.ppCPR) === "CU1L1" &&
      r.prevCPR.widthPct <= 0.10 &&
      r.todayCPR.widthPct > 0.22 && r.todayCPR.widthPct <= 0.60 &&
      r.prevCPR.prevLow < r.prevCPR.s1 &&
      r.todayCPR.prevLow < r.todayCPR.s1 &&
      r.todayCPR.prevLow > r.prevCPR.pivot,
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "7PM:MoMi-<L4:2AM",
    label: "7PM:MoMi-<L4:2AM",
    parentKey: "EU2L4",
    kind: "view",
    direction: "bearish",
    condition: (r) =>
      computePrevPattern(r.prevCPR, r.ppCPR) === "CU1L1" &&
      r.prevCPR.widthPct <= 0.10 &&
      r.todayCPR.widthPct > 0.22 && r.todayCPR.widthPct <= 0.60 &&
      r.prevCPR.prevLow < r.prevCPR.s1 &&
      r.todayCPR.prevLow < r.todayCPR.s1 &&
      r.todayCPR.prevLow < r.prevCPR.pivot,
    targetLabel: "L4 (today's S4)",
    getTarget: (r) => r.todayCPR.s4,
    entryLabel: "BC (today's BC)",
    getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)",
    getStoploss: (r) => r.todayCPR.r1,
  },
  {
    key: "6PM:APHS1A-FAU4:9PM",
    label: "6PM:APHS1A-FAU4:9PM",
    parentKey: "EU2L4",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.todayCPR.bc > r.prevCPR.prevHigh && r.todayCPR.s1 > r.prevCPR.tc &&
      (computePrevPattern(r.prevCPR, r.ppCPR) === "EU3L3" ||
        computePrevPattern(r.prevCPR, r.ppCPR) === "L4U4" ||
        (computePrevPattern(r.prevCPR, r.ppCPR) === "EU3L4" &&
          r.prevCPR.pivot > r.todayCPR.prevLow && r.todayCPR.s3 > r.prevCPR.s3)),
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "9AM:pPALPApH-FAU4:2PM",
    label: "9AM:pPALPApH-FAU4:2PM",
    parentKey: "U4L3",
    kind: "view",
    direction: "bullish",
    condition: (r) => r.prevCPR.pivot > r.todayCPR.prevLow && r.todayCPR.pivot > r.prevCPR.prevHigh,
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "8AM:pPDHA-SRA-U4+2:2AM",
    label: "8AM:pPDHA-SRA-U4+2:2AM",
    parentKey: "A-B-C-C-EU4L4",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.prevCPR.prevHigh > r.todayCPR.prevHigh &&
      r.prevCPR.prevLow > r.todayCPR.prevLow &&
      (r.todayCPR.HLSwitch !== "HL-B" ||
        (r.prevCPR.prevHigh > r.todayCPR.r1 && r.todayCPR.prevLow > r.prevCPR.s1)),
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "A-A-AA-AA-S1pPDH-U3",
    label: "A-A-AA-AA-S1pPDH-U3",
    parentKey: "A-A-AA-AA-U2L4",
    kind: "view",
    direction: "bullish",
    condition: (r) => r.todayCPR.s1 > r.prevCPR.prevHigh,
    targetLabel: "U3 (today's R3)",
    getTarget: (r) => r.todayCPR.r3,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "A-A-AA-AA-EU2L4-ApR2",
    label: "A-A-AA-AA-EU2L4-ApR2",
    parentKey: "A-A-AA-AA-EU2L4",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.todayCPR.r1 > r.prevCPR.r3 &&
      r.prevCPR.prevLow > r.todayCPR.s2 &&
      r.prevCPR.s3 > r.todayCPR.s3,
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "A-A-AA-AA-U3L4-pGapB",
    label: "A-A-AA-AA-U3L4-pGapB",
    parentKey: "A-A-AA-AA-U3L4",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.RRSSGapCategory === "RRGap" &&
      r.PDHPDLGapCategory === "HHGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.hlGapWinner === "prev" &&
      r.narrowCPR,
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "s4", subject: "today", bandKeys: ["s4", "s3"] },
      { key: "s3", subject: "today", bandKeys: ["s3", "s2"] },
      { key: "s2", subject: "today", bandKeys: ["s2", "prevLow"] },
      { key: "prevLow", subject: "today", bandKeys: ["s1", "bc"] },
      { key: "s1", subject: "today", bandKeys: ["s1", "bc"] },
      { key: "bc", subject: "today", bandKeys: ["prevHigh", "r1"] },
      { key: "pivot", subject: "today", bandKeys: ["prevHigh", "r1"] },
      { key: "tc", subject: "today", bandKeys: ["prevHigh", "r1"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r2", "r3"] },
      { key: "r1", subject: "today", bandKeys: ["r2", "r3"] },
      { key: "r2", subject: "today", bandKeys: ["r3", "r4"] },
      { key: "r3", subject: "previous", bandKeys: ["r1", "r2"] },
      { key: "r4", subject: "previous", bandKeys: ["r2", "r3"] },
    ],
  },
  {
    key: "A-A-AA-AA-EU3L4-GapB",
    label: "A-A-AA-AA-EU3L4-GapB",
    parentKey: "A-A-AA-AA-EU3L4",
    kind: "view",
    direction: "bullish",
    condition: (r) => r.todayCPR.HLSwitch === "HL-B" && r.hlGapWinner === "today",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "A-A-AA-OA-U3L4-RRHHGap:R4",
    label: "A-A-AA-OA-U3L4-RRHHGap:R4",
    parentKey: "A-A-AA-OA-U3L4",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.RRSSGapCategory === "RRGap" &&
      r.PDHPDLGapCategory === "HHGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.hlGapWinner === "today",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["r3", "r2"] },
      { key: "r3", subject: "previous", bandKeys: ["r3", "r2"] },
      { key: "r2", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "r1", subject: "today", bandKeys: ["r2", "r1"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r2", "r1"] },
      { key: "tc", subject: "today", bandKeys: ["prevHigh", "tc"] },
      { key: "pivot", subject: "today", bandKeys: ["prevHigh", "tc"] },
      { key: "bc", subject: "today", bandKeys: ["prevHigh", "tc"] },
      { key: "s1", subject: "today", bandKeys: ["bc", "s1"] },
      { key: "prevLow", subject: "today", bandKeys: ["s1", "prevLow"] },
      { key: "s2", subject: "today", bandKeys: ["prevLow", "s2"] },
      { key: "s3", subject: "today", bandKeys: ["s2", "s3"] },
      { key: "s4", subject: "today", bandKeys: ["s3", "s4"] },
    ],
  },
  {
    key: "A-A-AA-AA-U3L3-SSLLGap:R4",
    label: "A-A-AA-AA-U3L3-SSLLGap:R4",
    parentKey: "A-A-AA-AA-U3L3",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.RRSSGapCategory === "SSGap" &&
      r.PDHPDLGapCategory === "LLGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.hlGapWinner === "today",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["r3", "r2"] },
      { key: "r3", subject: "previous", bandKeys: ["r3", "r2"] },
      { key: "r2", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "r1", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r2", "r1"] },
      { key: "tc", subject: "today", bandKeys: ["r2", "r1"] },
      { key: "pivot", subject: "today", bandKeys: ["r2", "prevHigh"] },
      { key: "bc", subject: "today", bandKeys: ["r1", "prevHigh"] },
      { key: "s1", subject: "today", bandKeys: ["prevHigh", "tc"] },
      { key: "prevLow", subject: "today", bandKeys: ["pivot", "bc"] },
      { key: "s2", subject: "today", bandKeys: ["bc", "s1"] },
      { key: "s3", subject: "today", bandKeys: ["prevLow", "s2"] },
      { key: "s4", subject: "today", bandKeys: ["s2", "s3"] },
    ],
  },
];

const LEVELSBELOW_VIEWS: ViewDef[] = [
  // --- HALB-SSLLGap: compound Pattern child of "levelsbelow" (not in
  // PIVOT_PATTERNS/COMPOUND_COMBOS since it's a one-off, not part of the
  // HHLL x RRHH x SSLL cross) ---
  {
    key: "HALB-SSLLGap",
    label: "HALB-SSLLGap",
    parentKey: "levelsbelow",
    kind: "pattern",
    condition: (r) =>
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-BB" &&
      r.RRSSGapCategory === "SSGap" &&
      r.PDHPDLGapCategory === "LLGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-A" &&
      r.hlGapWinner === "today",
  },

  // --- B-B-BB-BB's eleven nested Pattern children ---
  {
    key: "B-B-BB-BB-L4U4", label: "B-B-BB-BB-L4U4", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L4U4,
    direction: "bearish", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
  },
  { key: "B-B-BB-BB-EL4U4", label: "B-B-BB-BB-EL4U4", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL4U4 },
  {
    key: "B-B-BB-BB-L3U4", label: "B-B-BB-BB-L3U4", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L3U4,
    direction: "bearish", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
  },
  {
    key: "B-B-BB-BB-L2U4", label: "B-B-BB-BB-L2U4", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L2U4,
    direction: "bearish", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
  },
  {
    key: "B-B-BB-BB-L4U3", label: "B-B-BB-BB-L4U3", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L4U3,
    direction: "bearish", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
  },
  {
    key: "B-B-BB-BB-L3U3", label: "B-B-BB-BB-L3U3", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L3U3,
    direction: "bearish", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
  },
  { key: "B-B-BB-BB-CL4U2", label: "B-B-BB-BB-CL4U2", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL4U2 },
  { key: "B-B-BB-BB-EL3U4", label: "B-B-BB-BB-EL3U4", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL3U4 },
  { key: "B-B-BB-BB-EL2U3", label: "B-B-BB-BB-EL2U3", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL2U3 },
  { key: "B-B-BB-BB-EL2U4", label: "B-B-BB-BB-EL2U4", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL2U4 },
  { key: "B-B-BB-BB-EL1U3", label: "B-B-BB-BB-EL1U3", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL1U3 },

  // --- leaf Views ---
  {
    key: "3P:HA-pBELOWR1:R2-3A",
    label: "3P:HA-pBELOWR1:R2-3A",
    parentKey: "HALB-SSLLGap",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.prevCPR.pivot > r.todayCPR.r1 && r.todayCPR.pivot > r.prevCPR.prevLow &&
      r.prevCPR.s3 > r.todayCPR.s1 && r.todayCPR.r3 > r.prevCPR.r3,
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "3P:HA-pABOVER1:S2-6P",
    label: "3P:HA-pABOVER1:S2-6P",
    parentKey: "HALB-SSLLGap",
    kind: "view",
    direction: "bearish",
    condition: (r) => r.prevCPR.s3 > r.todayCPR.s1 && r.prevCPR.pivot < r.todayCPR.r1,
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)",
    getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)",
    getStoploss: (r) => r.todayCPR.r1,
  },
  {
    key: "2P:HA-HABOVEpR1:R4-4P",
    label: "2P:HA-HABOVEpR1:R4-4P",
    parentKey: "HALB-SSLLGap",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      dirTol(r.prevCPR.s3, r.todayCPR.s1) > 0 &&
      dirTol(r.todayCPR.r1, r.prevCPR.prevHigh) > 0 &&
      dirTol(r.todayCPR.pivot, r.prevCPR.prevLow) > 0 &&
      dirTol(r.todayCPR.r3, r.prevCPR.r3) > 0,
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    // FINDING (not fixed here — flagged in chat): the dropdown/legend nest
    // this View under "B-B-BB-BB" → "B-B-BB-BB-L3U3" (implying it also
    // requires the B-B-BB-BB compound: HHLL-B + RRHH-BB + SSLL-BB), but
    // its actual passesPattern condition only ever checked r.LevelsBelow +
    // r.L3U3 — no compound gate. parentKey below is "levelsbelow" (not
    // "B-B-BB-BB-L3U3") to faithfully match what the code has always
    // graded, not what the tree nesting implies.
    key: "PDH>pTC-U4:5AM",
    label: "PDH>pTC-U4:5AM",
    parentKey: "levelsbelow",
    kind: "view",
    direction: "bullish",
    condition: (r) => {
      const pMini = r.prevCPR.widthPct > 0.22 && r.prevCPR.widthPct <= 0.60;
      const small = r.todayCPR.widthPct > 0.60 && r.todayCPR.widthPct <= 1.10;
      const pSmall = r.prevCPR.widthPct > 0.60 && r.prevCPR.widthPct <= 1.10;
      const large = r.todayCPR.widthPct > 2.00 && r.todayCPR.widthPct <= 5.00;
      return r.L3U3 && r.todayCPR.prevHigh > r.prevCPR.tc && ((pMini && small) || (pSmall && large));
    },
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    // FINDING (not fixed here — flagged in chat): same class of mismatch
    // as "PDH>pTC-U4:5AM" above — nested under "B-B-BB-BB-L4U3" in the
    // dropdown tree, but the actual condition only ever checked
    // r.LevelsBelow + r.L4U3 + HHLLCategory, no B-B-BB-BB compound gate.
    // parentKey is "levelsbelow" to match actual behavior.
    key: "11AM:pCPR1AHi-FApU4:1PM",
    label: "11AM:pCPR1AHi-FApU4:1PM",
    parentKey: "levelsbelow",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.L4U3 && r.HHLLCategory === "HHLL-B" &&
      r.prevCPR.HLSwitch === "HL-B" && r.todayCPR.HLSwitch === "HL-A" &&
      r.todayCPR.r1 > r.prevCPR.bc,
    targetLabel: "FApU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "B-B-BB-BB-EL4U4-SSLLGap:S4",
    label: "B-B-BB-BB-EL4U4-SSLLGap:S4",
    parentKey: "B-B-BB-BB-EL4U4",
    kind: "view",
    direction: "bearish",
    condition: (r) =>
      r.RRSSGapCategory === "SSGap" &&
      r.PDHPDLGapCategory === "LLGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-A" &&
      r.hlGapWinner === "today",
    targetLabel: "L4 (today's S4)",
    getTarget: (r) => r.todayCPR.s4,
    entryLabel: "BC (today's BC)",
    getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)",
    getStoploss: (r) => r.todayCPR.r1,
  },
  {
    key: "B-B-BB-BB-L4U4-pLAP:R4",
    label: "B-B-BB-BB-L4U4-pLAP:R4",
    parentKey: "B-B-BB-BB-L4U4",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.prevCPR.HLSwitch === "HL-A" &&
      r.hlGapWinner === "prev" &&
      r.prevCPR.prevLow > r.todayCPR.pivot &&
      r.RRSSGapCategory === "SSGap" &&
      r.PDHPDLGapCategory === "LLGap" &&
      r.todayCPR.HLSwitch === "HL-B",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "B-B-BB-BB-L4U4-pLTC-U2",
    label: "B-B-BB-BB-L4U4-pLTC-U2",
    parentKey: "B-B-BB-BB-L4U4",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.prevCPR.HLSwitch === "HL-A" &&
      r.hlGapWinner === "prev" &&
      r.prevCPR.prevLow > r.todayCPR.tc,
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
];

VIEWS.push(...LEVELSABOVE_VIEWS, ...LEVELSBELOW_VIEWS);

// "B-B-BB-BB" itself also has bare-pattern target grading (bearish
// against today's own S2) — patched onto the existing compound ViewDef
// from COMPOUND_VIEWS rather than redefining it, since its CONDITION is
// already correct there.
{
  const bbbb = VIEWS.find((v) => v.key === "B-B-BB-BB");
  if (bbbb) {
    bbbb.direction = "bearish";
    bbbb.targetLabel = "L2 (today's S2)";
    bbbb.getTarget = (r) => r.todayCPR.s2;
    bbbb.entryLabel = "BC (today's BC)";
    bbbb.getEntry = (r) => r.todayCPR.bc;
    bbbb.stoplossLabel = "R1 (today's R1)";
    bbbb.getStoploss = (r) => r.todayCPR.r1;
  }
}

// ---------------------------------------------------------------------
// Step 3, batch 2 — "compressed" and "expanded"'s NESTED Views/Patterns
// only (the four top-level category conditions and the 97 compound
// HHLL x RRHH x SSLL Patterns nested directly under them, including all
// 19 C-* and 16 E-* combos, are already covered by CATEGORY_VIEWS /
// COMPOUND_VIEWS above — nothing new needed there).
//
// Transcribed directly from the uploaded ScreenerUtils.tsx (passesPattern
// lines 1218-1340, 1594-1635; matchesPatternFlag lines 2093-2120,
// 2205-2229) and backtest.ts (BACKTEST_TARGETS lines 685-787, 1229-1283;
// BACKTEST_CATEGORIES lines 1939-2052, 2061-2117).
// ---------------------------------------------------------------------

const COMPRESSED_VIEWS: ViewDef[] = [
  // --- direct View children of "compressed" ---
  {
    key: "8A:HLC-SSHH:S4-1P",
    label: "8A:HLC-SSHH:S4-1P",
    parentKey: "compressed",
    kind: "view",
    direction: "bearish",
    condition: (r) =>
      r.RRSSGapCategory === "SSGap" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-AA" &&
      r.HHLLCategory === "HHLL-C" &&
      r.PDHPDLGapCategory === "HHGap" &&
      r.prevCPR.HLSwitch === "HL-A" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.hlGapWinner === "today",
    targetLabel: "L4 (today's S4)",
    getTarget: (r) => r.todayCPR.s4,
    entryLabel: "BC (today's BC)",
    getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)",
    getStoploss: (r) => r.todayCPR.r1,
  },
  {
    key: "9AM:RHLB-RRHH:5AM",
    label: "9AM:RHLB-RRHH:5AM",
    parentKey: "compressed",
    kind: "view",
    direction: "bearish",
    condition: (r) =>
      r.RRSSGapCategory === "RRGap" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.HHLLCategory === "HHLL-B" &&
      r.PDHPDLGapCategory === "HHGap",
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)",
    getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)",
    getStoploss: (r) => r.todayCPR.r1,
  },

  // --- "RRHH-BB:SSLL-AA:SSLLGap" Pattern (arrow), itself target-graded,
  // nesting the "6A:HLC-SSLL:R4-6P" View ---
  {
    key: "RRHH-BB:SSLL-AA:SSLLGap",
    label: "RRHH-BB:SSLL-AA:SSLLGap",
    parentKey: "compressed",
    kind: "pattern",
    condition: (r) =>
      r.HHLLCategory === "HHLL-C" &&
      r.SSLLCategory === "SSLL-AA" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.RRSSGapCategory === "SSGap" &&
      r.PDHPDLGapCategory === "LLGap",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "6A:HLC-SSLL:R4-6P",
    label: "6A:HLC-SSLL:R4-6P",
    parentKey: "RRHH-BB:SSLL-AA:SSLLGap",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      (dirTol(r.todayCPR.r2, r.prevCPR.r1) === 1 ||
        dirTol(r.todayCPR.s3, r.prevCPR.s1) === 1) &&
      dirTol(r.todayCPR.s2, r.prevCPR.s1) === 1,
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },

  // --- "RHLB-RRHHpGap" Pattern (arrow) — NOT itself target-graded (no
  // BACKTEST_TARGETS entry of its own), nesting the target-graded
  // "8A:pLAPpPAH:R4-5P" View ---
  {
    key: "RHLB-RRHHpGap",
    label: "RHLB-RRHHpGap",
    parentKey: "compressed",
    kind: "pattern",
    condition: (r) =>
      r.RRSSGapCategory === "RRGap" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.HHLLCategory === "HHLL-B" &&
      r.PDHPDLGapCategory === "HHGap" &&
      r.SSRRCategory === "RRSS-C" &&
      r.SSLLCategory === "SSLL-C" &&
      r.prevCPR.HLSwitch === "HL-A" &&
      r.hlGapWinner === "prev" &&
      r.todayCPR.HLSwitch === "HL-A",
  },
  {
    key: "8A:pLAPpPAH:R4-5P",
    label: "8A:pLAPpPAH:R4-5P",
    parentKey: "RHLB-RRHHpGap",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.prevCPR.prevLow >= r.todayCPR.pivot &&
      r.prevCPR.prevLow <= r.todayCPR.tc &&
      r.todayCPR.prevHigh > r.prevCPR.bc &&
      r.prevCPR.tc > r.todayCPR.r2,
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },

  // --- "C-B-BB-LB-CL3U2" Pattern, nested under the existing "C-B-BB-LB"
  // compound Pattern (already in COMPOUND_VIEWS) — itself target-graded,
  // nesting the "C-B-BB-LB-CL3U2-RRHHGap:R4" View ---
  {
    key: "C-B-BB-LB-CL3U2",
    label: "C-B-BB-LB-CL3U2",
    parentKey: "C-B-BB-LB",
    kind: "pattern",
    condition: (r) => r.CL3U2,
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "C-B-BB-LB-CL3U2-RRHHGap:R4",
    label: "C-B-BB-LB-CL3U2-RRHHGap:R4",
    parentKey: "C-B-BB-LB-CL3U2",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.RRSSGapCategory === "RRGap" &&
      r.PDHPDLGapCategory === "HHGap" &&
      r.prevCPR.HLSwitch === "HL-A" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.todayCPR.prevHigh > r.prevCPR.pivot &&
      r.todayCPR.r1 > r.prevCPR.tc,
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },

  // --- "C-C-BB-AA"'s 14 nested Subpattern children (raw flag AND'd onto
  // the parent compound condition via parentKey) — none target-graded
  // yet (no BACKTEST_TARGETS entries for these 14), so each is currently
  // a symbol-list-only scan, same as any freshly-added Pattern. ---
  { key: "C-C-BB-AA-CU4L4", label: "C-C-BB-AA-CU4L4", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU4L4 },
  { key: "C-C-BB-AA-CL4U4", label: "C-C-BB-AA-CL4U4", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL4U4 },
  { key: "C-C-BB-AA-CU4L3", label: "C-C-BB-AA-CU4L3", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU4L3 },
  { key: "C-C-BB-AA-CL4U3", label: "C-C-BB-AA-CL4U3", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL4U3 },
  { key: "C-C-BB-AA-CU3L3", label: "C-C-BB-AA-CU3L3", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU3L3 },
  { key: "C-C-BB-AA-CL3U3", label: "C-C-BB-AA-CL3U3", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL3U3 },
  { key: "C-C-BB-AA-CU3L2", label: "C-C-BB-AA-CU3L2", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU3L2 },
  { key: "C-C-BB-AA-CL3U2", label: "C-C-BB-AA-CL3U2", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL3U2 },
  { key: "C-C-BB-AA-CU2L2", label: "C-C-BB-AA-CU2L2", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU2L2 },
  { key: "C-C-BB-AA-CL2U2", label: "C-C-BB-AA-CL2U2", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL2U2 },
  { key: "C-C-BB-AA-CU2L1", label: "C-C-BB-AA-CU2L1", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU2L1 },
  { key: "C-C-BB-AA-CL2U1", label: "C-C-BB-AA-CL2U1", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL2U1 },
  { key: "C-C-BB-AA-CU1L1", label: "C-C-BB-AA-CU1L1", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU1L1 },
  { key: "C-C-BB-AA-CL1U1", label: "C-C-BB-AA-CL1U1", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL1U1 },
];

const EXPANDED_VIEWS: ViewDef[] = [
  // --- "E-A-AA-E"'s one nested View ---
  {
    key: "6A:SLE-RRHH:R2-6A",
    label: "6A:SLE-RRHH:R2-6A",
    parentKey: "E-A-AA-E",
    kind: "view",
    direction: "bullish",
    condition: (r) =>
      r.PDHPDLGapCategory === "HHGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-A" &&
      r.hlGapWinner === "today",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
  },

  // --- "E-E-AA-BB"'s five nested Subpattern children — all target-graded
  // bullish against today's own R2 (U2), per user request. ---
  {
    key: "E-E-AA-BB-EL1U2", label: "E-E-AA-BB-EL1U2", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EL1U2,
    direction: "bullish", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "E-E-AA-BB-EU1L2", label: "E-E-AA-BB-EU1L2", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EU1L2,
    direction: "bullish", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "E-E-AA-BB-EU2L2", label: "E-E-AA-BB-EU2L2", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EU2L2,
    direction: "bullish", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "E-E-AA-BB-EU1L3", label: "E-E-AA-BB-EU1L3", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EU1L3,
    direction: "bullish", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
  },
  {
    key: "E-E-AA-BB-EL1U1", label: "E-E-AA-BB-EL1U1", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EL1U1,
    direction: "bullish", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
  },
];

VIEWS.push(...COMPRESSED_VIEWS, ...EXPANDED_VIEWS);