import type {
  CPRResult,
  SSRRCategory,
  HHLLCategory,
  SSLLCategory,
  RRHHCategory,
} from "./cpr";

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
