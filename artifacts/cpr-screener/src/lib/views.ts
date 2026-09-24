import type {
  CPRResult,
  CPRLevels,
  SSRRCategory,
  HHLLCategory,
  SSLLCategory,
  RRHHCategory,
} from "./cpr";
import { dirTol, classifyCPRPair, pickOuterLevelPattern, getPatternCategory } from "./cpr";

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
   * When true, passesView does NOT chain parentKey. Used for compound
   * patterns whose condition is already complete and self-contained
   * across the full 4-dimensional category matrix (SSRR x HHLL x RRHH x SSLL),
   * while retaining parentKey for tree navigation/display in buildViewTree().
   */
  standalone?: boolean;
  /**
   * This ViewDef's OWN condition, NOT including the parent's — passesView
   * chains parentKey for you. (This mirrors PIVOT_PATTERNS' original
   * contract in ScreenerUtils.tsx: "NONE of these conditions AND in their
   * parent category's own base condition — that's left to the caller."
   * Here "the caller" is passesView itself, applied uniformly instead of
   * ad hoc per call site.)
   *
   * Optional when conditionKey is set (see below) — a "Copy View" entry's
   * grading is entirely delegated to the referenced key, so it has no
   * condition function of its own.
   */
  condition?: (r: CPRResult) => boolean;
  /**
   * "Copy View" mechanism (backtest.ts's BacktestTargetDef.conditionKey):
   * when set, this ViewDef's PASS/FAIL grading is delegated entirely to
   * passesView(r, conditionKey) — its own `condition`/`parentKey` are NOT
   * consulted at all (the referenced key already carries its own full
   * parent chain). Only this ViewDef's OWN metadata (target/entry/
   * stoploss/direction/levelCheckDefs/label) is its own — it's nested in
   * the Backtest dropdown tree via its own parentKey for DISPLAY
   * purposes only, same as the original backtest.ts data (a Copy View's
   * tree position and its graded condition are independent).
   */
  conditionKey?: string;
  direction?: "Up" | "Down";
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
const activeEvaluationKeys = new Set<string>();

export function passesView(r: CPRResult, key: string): boolean {
  if (activeEvaluationKeys.has(key)) return false;
  activeEvaluationKeys.add(key);
  try {
    const v = getView(key);
    if (!v) return false;
    // "Copy View" redirect — grades entirely against the referenced key,
    // ignoring this ViewDef's own parentKey/condition (see conditionKey's
    // doc on ViewDef above).
    if (v.conditionKey && v.conditionKey !== key) return passesView(r, v.conditionKey);
    if (v.parentKey && !v.standalone && v.parentKey !== key && !passesView(r, v.parentKey)) return false;
    return v.condition ? v.condition(r) : false;
  } finally {
    activeEvaluationKeys.delete(key);
  }
}

/** All direct children of a Category/Pattern key, in display order. */
export function childrenOf(parentKey: string | undefined): ViewDef[] {
  return VIEWS.filter((v) => v.parentKey === parentKey).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
}

// ---------------------------------------------------------------------
// Gap Badge — composite label used by ScreenerUtils.tsx's Pattern-column
// badge (computeGapBadge there) and, here, by "Create View"'s optional
// Gap Badge dropdown (BacktestPanel.tsx's CreateViewControl). Kept here
// rather than in ScreenerUtils.tsx so createBacktestView (backtest.ts,
// lib/) can grade a View against a specific badge without lib/ importing
// from pages/ — same duplication convention already used for
// LevelCheckCondition/computePrevPattern elsewhere in this codebase.
// ScreenerUtils.tsx's own computeGapBadge must stay in sync with
// buildGapBadgeLabel below if either ever changes.
// ---------------------------------------------------------------------

export type GapBadgeLetter1 = "R" | "S" | "Q";
export type GapBadgeLetter2 = "H" | "L" | "Q";
export type GapBadgeLetterAB = "A" | "B" | "Q";

/**
 * buildGapBadgeLabel — pure assembly of the "{1}{2}-{3}{4}" composite
 * label, "Gap" written wherever the gap winner's letter is, except it
 * never sits in the middle: prev winning keeps "Gap" up front (part 3),
 * today winning moves it to the very end (part 4). Mirrors
 * ScreenerUtils.tsx's computeGapBadge exactly — see its own doc comment
 * for the full label-shape rationale and examples.
 */
export function buildGapBadgeLabel(
  letter1: GapBadgeLetter1,
  letter2: GapBadgeLetter2,
  letter3: GapBadgeLetterAB,
  letter4: GapBadgeLetterAB,
  gapWinsPrev: boolean,
  gapWinsToday: boolean
): string {
  const part3 = gapWinsPrev ? `Gap${letter3}` : letter3;
  const part4 = gapWinsToday ? `${letter4}Gap` : letter4;
  return `${letter1}${letter2}-${part3}${part4}`;
}

/**
 * computeGapBadge — derives the 4 letters + 2 "did the gap win" flags
 * off a CPRResult and hands them to buildGapBadgeLabel. Duplicate of
 * ScreenerUtils.tsx's function of the same name (see the section note
 * above for why); the two must keep producing identical labels.
 */
export function computeGapBadge(r: CPRResult): string {
  const letter1: GapBadgeLetter1 =
    r.RRSSGapCategory === "RRGap" ? "R" : r.RRSSGapCategory === "SSGap" ? "S" : "Q";
  const letter2: GapBadgeLetter2 =
    r.PDHPDLGapCategory === "HHGap" ? "H" : r.PDHPDLGapCategory === "LLGap" ? "L" : "Q";

  const prevSW = r.prevCPR.HLSwitch;
  const todaySW = r.todayCPR.HLSwitch;
  const letter3: GapBadgeLetterAB = prevSW === "HL-A" ? "A" : prevSW === "HL-B" ? "B" : "Q";
  const letter4: GapBadgeLetterAB = todaySW === "HL-A" ? "A" : todaySW === "HL-B" ? "B" : "Q";

  const gapWinsPrev = prevSW !== "HL-Q" && r.hlGapWinner === "prev";
  const gapWinsToday = todaySW !== "HL-Q" && r.hlGapWinner === "today";

  return buildGapBadgeLabel(letter1, letter2, letter3, letter4, gapWinsPrev, gapWinsToday);
}

/**
 * ALL_GAP_BADGES — every label buildGapBadgeLabel can ever produce,
 * walked mechanically off the same 5 source dimensions computeGapBadge
 * itself reads (RRSSGapCategory x PDHPDLGapCategory x prevCPR.HLSwitch x
 * todayCPR.HLSwitch x hlGapWinner), rather than hand-listed — so this
 * list can never drift out of sync with what a real row can actually
 * show. Powers the "Gap Badge" dropdown in Create View; sorted for a
 * stable, scannable menu.
 */
export const ALL_GAP_BADGES: string[] = (() => {
  const letter1s: GapBadgeLetter1[] = ["R", "S", "Q"];
  const letter2s: GapBadgeLetter2[] = ["H", "L", "Q"];
  const abqs: GapBadgeLetterAB[] = ["A", "B", "Q"];
  const winners: Array<"prev" | "today" | "none"> = ["prev", "today", "none"];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const letter1 of letter1s) {
    for (const letter2 of letter2s) {
      for (const letter3 of abqs) {
        for (const letter4 of abqs) {
          for (const winner of winners) {
            // A "Gap" prefix/suffix only ever applies to a non-"Q"
            // letter — matches computeGapBadge's own gapWinsPrev/
            // gapWinsToday guards.
            const gapWinsPrev = letter3 !== "Q" && winner === "prev";
            const gapWinsToday = letter4 !== "Q" && winner === "today";
            const label = buildGapBadgeLabel(letter1, letter2, letter3, letter4, gapWinsPrev, gapWinsToday);
            if (!seen.has(label)) {
              seen.add(label);
              out.push(label);
            }
          }
        }
      }
    }
  }
  return out.sort();
})();

/**
 * matchesGapBadge — predicate form of computeGapBadge, for grading a
 * View against one specific composite Gap Badge label (e.g. one picked
 * from ALL_GAP_BADGES in Create View). Picking "RH-GapAB" in the
 * dropdown and a row's Pattern-column Gap Badge reading "RH-GapAB" are
 * guaranteed to mean the same thing, since both go through
 * computeGapBadge.
 */
export function matchesGapBadge(r: CPRResult, badge: string): boolean {
  return computeGapBadge(r) === badge;
}

// ---------------------------------------------------------------------
// Step 2 — the four top-level Categories
// ---------------------------------------------------------------------

const CATEGORY_VIEWS: ViewDef[] = [
  { key: "levelsabove", label: "LEVEL ABOVE", kind: "category", condition: (r) => r.LevelsAbove,
      order: 2
},
  { key: "levelsbelow", label: "LEVEL BELOW", kind: "category", condition: (r) => r.LevelsBelow,
      order: 3
},
  { key: "compressed", label: "COMPRESSED", kind: "category", condition: (r) => r.compressed,
      order: 4
},
  { key: "expanded", label: "EXPANDED", kind: "category", condition: (r) => r.expanded,
      order: 5
},
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

// Real sibling order for the 97 compound combos, extracted from
// backtest.ts's actual BACKTEST_CATEGORIES source (each combo's index
// within its parent SSRR-letter's patterns array) — COMPOUND_VIEWS is
// built via .map(), not authored as individual object literals, so it
// can't carry order the way the hand-authored batches below do; patched
// on after construction instead.
const COMPOUND_ORDER: Record<string, number> = {
  "A-B-C-C": 2,
  "A-B-C-LB": 4,
  "A-B-E-E": 5,
  "A-B-E-LB": 6,
  "A-B-RA-C": 7,
  "A-B-RA-E": 8,
  "A-B-RA-LB": 9,
  "A-A-AA-AA": 10,
  "A-A-AA-OA": 11,
  "A-A-OA-AA": 12,
  "A-A-OA-OA": 13,
  "A-E-AA-C": 20,
  "A-E-OA-C": 21,
  "A-E-AA-E": 22,
  "A-E-OA-E": 23,
  "A-E-AA-LB": 24,
  "A-E-OA-LB": 25,
  "A-C-C-AA": 14,
  "A-C-C-OA": 15,
  "A-C-E-AA": 16,
  "A-C-E-OA": 17,
  "A-C-RA-AA": 18,
  "A-C-RA-OA": 19,
  "B-A-C-C": 2,
  "B-A-C-SB": 3,
  "B-A-E-E": 4,
  "B-A-E-SB": 5,
  "B-A-HA-C": 6,
  "B-A-HA-E": 7,
  "B-A-HA-SB": 8,
  "B-A-OB-SB": 9,
  "B-A-OB-E": 10,
  "B-A-OB-C": 11,
  "B-A-HA-OB": 12,
  "B-A-HA-OA": 13,
  "B-A-E-OA": 14,
  "B-A-E-OB": 15,
  "B-A-C-OA": 16,
  "B-A-OA-E": 17,
  "B-B-BB-BB": 0,
  "B-B-BB-OB": 18,
  "B-B-OB-BB": 19,
  "B-B-OB-OB": 20,
  "B-B-C-BB": 21,
  "B-B-C-OB": 22,
  "B-B-BB-C": 23,
  "B-C-BB-C": 24,
  "B-C-OB-C": 25,
  "B-C-BB-E": 26,
  "B-C-OB-E": 27,
  "B-C-BB-SB": 28,
  "B-C-BB-OB": 29,
  "B-C-BB-OA": 30,
  "B-C-OB-OB": 31,
  "B-E-C-BB": 32,
  "B-E-C-OB": 33,
  "B-E-E-BB": 34,
  "B-E-E-OB": 35,
  "B-E-OB-BB": 36,
  "B-E-OB-OB": 37,
  "B-E-HA-BB": 38,
  "B-E-OA-BB": 39,
  "C-A-C-AA": 4,
  "C-A-HA-AA": 5,
  "C-A-E-AA": 6,
  "C-A-OA-AA": 7,
  "C-A-OB-AA": 8,
  "C-A-E-OA": 9,
  "C-A-C-OA": 10,
  "C-A-OA-OA": 11,
  "C-B-BB-LB": 12,
  "C-B-OB-LB": 13,
  "C-B-BB-C": 14,
  "C-B-OB-C": 15,
  "C-B-BB-E": 16,
  "C-B-OB-E": 17,
  "C-C-BB-AA": 18,
  "C-C-OB-AA": 19,
  "C-C-BB-OA": 21,
  "C-C-OB-OA": 22,
  "C-C-C-AA": 20,
  "E-A-AA-OB": 0,
  "E-A-OA-OB": 1,
  "E-A-AA-SB": 2,
  "E-A-AA-C": 3,
  "E-A-OA-C": 4,
  "E-A-AA-E": 5,
  "E-A-OA-E": 6,
  "E-B-RA-BB": 7,
  "E-B-C-BB": 8,
  "E-B-E-BB": 9,
  "E-B-C-OB": 10,
  "E-B-E-OB": 11,
  "E-E-AA-BB": 12,
  "E-E-OA-BB": 13,
  "E-E-AA-OB": 14,
  "E-E-OA-OB": 15
};
for (const v of COMPOUND_VIEWS) {
  const o = COMPOUND_ORDER[v.key];
  if (o !== undefined) v.order = o;
}


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
  Object.fromEntries(COMPOUND_VIEWS.map((v) => [v.key, v.condition!]));

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
// "B6-L4U4-pStepUp:R4", "B-B-BB-BB-L4U4-pGapA", and
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
  return pickOuterLevelPattern(classifyCPRPair(today, prev));
}

const LEVELSABOVE_VIEWS: ViewDef[] = [
  // --- A-B-C-C's one nested child ---
  { key: "A-B-C-C-EU4L4", label: "A-B-C-C-EU4L4", parentKey: "A-B-C-C", kind: "pattern", condition: (r) => r.EU4L4,
      order: 3
},

  // --- A-A-AA-AA's nested Subpattern children ---
  { key: "A-A-AA-AA-U3L3", label: "A-A-AA-AA-U3L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U3L3,
      order: 1
},
  { key: "A-A-AA-AA-U4L3", label: "A-A-AA-AA-U4L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U4L3,
      order: 2
},
  { key: "A-A-AA-AA-CU4L3", label: "A-A-AA-AA-CU4L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.CU4L3,
      order: 7
},
  { key: "A-A-AA-AA-EU2L4", label: "A-A-AA-AA-EU2L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.EU2L4,
      order: 3
},
  { key: "A-A-AA-AA-U2L4", label: "A-A-AA-AA-U2L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U2L4,
      order: 4
},
  { key: "A-A-AA-AA-U3L4", label: "A-A-AA-AA-U3L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U3L4,
      order: 5
},
  { key: "A-A-AA-AA-U4L4", label: "A-A-AA-AA-U4L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U4L4,
      order: 8
},
  { key: "A-A-AA-AA-EU3L4", label: "A-A-AA-AA-EU3L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.EU3L4,
      order: 6
},
  { key: "A-A-AA-AA-EUTL3", label: "A-A-AA-AA-EUTL3", parentKey: "R1AbovePR4-A-A-AA-AA", kind: "pattern", condition: (r) => r.EUTL3,
      order: 7
},

  // --- A-A-AA-OA's one nested child ---
  { key: "A-A-AA-OA-U3L4", label: "A-A-AA-OA-U3L4", parentKey: "A-A-AA-OA", kind: "pattern", condition: (r) => r.U3L4,
      order: 0
},

  // --- leaf Views (self-contained, target-graded) ---
  {
    key: "6PM:APHS1A-FAU4:9PM",
    label: "6PM:APHS1A-FAU4:9PM",
    parentKey: "A-A-AA-AA-EU2L4",
    kind: "view",
    direction: "Up",
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
      order: 2
},
  {
    key: "9AM:pPALPApH-FAU4:2PM",
    label: "9AM:pPALPApH-FAU4:2PM",
    parentKey: "A-A-AA-AA-U4L3",
    kind: "view",
    direction: "Up",
    condition: (r) => r.prevCPR.pivot > r.todayCPR.prevLow && r.todayCPR.pivot > r.prevCPR.prevHigh,
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
  {
    key: "8AM:pPDHA-SRA-U4+2:2AM",
    label: "8AM:pPDHA-SRA-U4+2:2AM",
    parentKey: "A-B-C-C-EU4L4",
    kind: "view",
    direction: "Up",
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
      order: 0
},
  {
    // Real source condition for the "RH-BGapB" GapBadge signature
    // (computeGapBadge in ScreenerUtils.tsx): RRGap + HHGap, prev day's
    // HLSwitch "HL-B" (no Gap prefix -> hlGapWinner !== "prev"), today's
    // HLSwitch "HL-B" WITH the Gap prefix -> hlGapWinner === "today".
    // A6-EU2L4-RH-BGapB:R4 below should grade against THIS key. (The
    // "A-A-AA-AA-EU2L4-ApR2" key this comment used to contrast against
    // has been deleted.)
    key: "A-A-AA-AA-EU2L4-RH-BGapB",
    label: "A-A-AA-AA-EU2L4-RH-BGapB",
    parentKey: "A-A-AA-AA-EU2L4",
    kind: "view",
    direction: "Up",
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
      order: 1
},
  {
    key: "A-A-AA-AA-U3L4-pGapB",
    label: "A-A-AA-AA-U3L4-pGapB",
    parentKey: "A-A-AA-AA-U3L4",
    kind: "view",
    direction: "Up",
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
      order: 0
},
  {
    key: "A-A-AA-AA-EU3L4-GapB",
    label: "A-A-AA-AA-EU3L4-GapB",
    parentKey: "A-A-AA-AA-EU3L4",
    kind: "view",
    direction: "Up",
    condition: (r) => r.todayCPR.HLSwitch === "HL-B" && r.hlGapWinner === "today",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
  {
    key: "A-A-AA-OA-U3L4-RRHHGap:R4",
    label: "A-A-AA-OA-U3L4-RRHHGap:R4",
    parentKey: "A-A-AA-OA-U3L4",
    kind: "view",
    direction: "Up",
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
      order: 0
},
  {
    key: "A6-U3L3-SLBBG-R4",
    label: "A6-U3L3-SLBBG-R4",
    parentKey: "A-A-AA-AA-U3L3",
    kind: "view",
    direction: "Up",
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
      order: 0
},
    {
        key: "A-A-AA-AA-CU4L3-GapBB:R4",
        label: "A-A-AA-AA-CU4L3-GapBB:R4",
        parentKey: "A-A-AA-AA-CU4L3",
        conditionKey: "A-A-AA-AA-CU4L3",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "r4",
          "r3"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      }
    ],
      },
    {
        key: "A6-EU2L4-RH-BGapB:R4",
        label: "A6-EU2L4-RH-BGapB:R4",
        parentKey: "A-A-AA-AA-EU2L4",
        conditionKey: "A-A-AA-AA-EU2L4-RH-BGapB",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        // Old 12-rung levelCheckDefs removed: it was missing "s4" (only
        // 12 of the 13 rungs, so s4 always graded UnDefined) and several
        // bands (e.g. r2 checked against [pivot, tc], s1 against
        // [tc, prevHigh]) paired a rung with a band nowhere near it in
        // ladder order, which would fail nearly every time even after
        // the conditionKey fix above. Leave this undefined — it imposes
        // no extra Level Check gate on top of the RH-BGapB condition —
        // until a real 13-rung signature is derived (e.g. via
        // deriveLevelCheckDefs from an actual matching symbol/date).
      },
    {
        key: "A6-EU2L4-RH-BGapB1:R4",
        label: "A6-EU2L4-RH-BGapB1:R4",
        parentKey: "A-A-AA-AA-EU2L4",
        conditionKey: "A-A-AA-AA-EU2L4-RH-BGapB",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "s3",
          "s4"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "A6-U4L4-SLBBG-R4",
        label: "A6-U4L4-SLBBG-R4",
        parentKey: "A-A-AA-AA-U4L4",
        conditionKey: "A-A-AA-AA-U4L4",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r4",
          "r3"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r4",
          "r3"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "A6-U2L4-PLpTC-R4",
        label: "A6-U2L4-PLpTC-R4",
        parentKey: "A-A-AA-AA-U2L4",
        conditionKey: "A-A-AA-AA-U2L4",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r4",
          "r3"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "BC-A-A-AA-AA-EU2L4-RH-GapBB-S1",
        label: "pMega-S1",
        parentKey: "A-A-AA-AA-EU2L4",
        condition: (r) => passesView(r, "A-A-AA-AA-EU2L4") && matchesGapBadge(r, "RH-GapBB"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "L1 (today's S1)",
        getTarget: (r) => r.todayCPR.s1,
        entryLabel: "BC (today's BC)",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "s3",
          "s4"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "BC-A-A-AA-AA-EU2L4-RH-GapBB-S2",
        label: "A6-EU2L4-pUltra-S2",
        parentKey: "A-A-AA-AA-EU2L4",
        condition: (r) => passesView(r, "A-A-AA-AA-EU2L4") && matchesGapBadge(r, "RH-GapBB"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "L2 (today's S2)",
        getTarget: (r) => r.todayCPR.s2,
        entryLabel: "BC (today's BC)",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
          {
            "key": "r4",
            "subject": "previous",
            "bandKeys": [
              "r2",
              "r1"
            ]
          },
          {
            "key": "r3",
            "subject": "previous",
            "bandKeys": [
              "prevHigh",
              "tc"
            ]
          },
          {
            "key": "r2",
            "subject": "previous",
            "bandKeys": [
              "prevHigh",
              "tc"
            ]
          },
          {
            "key": "prevHigh",
            "subject": "previous",
            "bandKeys": [
              "bc",
              "s1"
            ]
          },
          {
            "key": "r1",
            "subject": "previous",
            "bandKeys": [
              "bc",
              "s1"
            ]
          },
          {
            "key": "tc",
            "subject": "previous",
            "bandKeys": [
              "bc",
              "s1"
            ]
          },
          {
            "key": "pivot",
            "subject": "previous",
            "bandKeys": [
              "prevLow",
              "s2"
            ]
          },
          {
            "key": "bc",
            "subject": "previous",
            "bandKeys": [
              "prevLow",
              "s2"
            ]
          },
          {
            "key": "prevLow",
            "subject": "previous",
            "bandKeys": [
              "prevLow",
              "s2"
            ]
          },
          {
            "key": "s1",
            "subject": "previous",
            "bandKeys": [
              "prevLow",
              "s2"
            ]
          },
          {
            "key": "s2",
            "subject": "previous",
            "bandKeys": [
              "s2",
              "s3"
            ]
          },
          {
            "key": "s3",
            "subject": "previous",
            "bandKeys": [
              "s2",
              "s3"
            ]
          },
          {
            "key": "s4",
            "subject": "previous",
            "bandKeys": [
              "s3",
              "s4"
            ]
          }
        ],
      }
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
      order: 1
},

  // --- B-B-BB-BB's eleven nested Pattern children ---
  {
    key: "B-B-BB-BB-L4U4", label: "B-B-BB-BB-L4U4", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L4U4,
    direction: "Down", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
      order: 0
},
  { key: "B-B-BB-BB-EL4U4", label: "B-B-BB-BB-EL4U4", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL4U4,
      order: 1
},
  {
    key: "B-B-BB-BB-L3U4", label: "B-B-BB-BB-L3U4", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L3U4,
    direction: "Down", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
      order: 2
},
  {
    key: "B-B-BB-BB-L2U4", label: "B-B-BB-BB-L2U4", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L2U4,
    direction: "Down", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
      order: 3
},
  {
    key: "B-B-BB-BB-L4U3", label: "B-B-BB-BB-L4U3", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L4U3,
    direction: "Down", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
      order: 4
},
  {
    key: "B-B-BB-BB-L3U3", label: "B-B-BB-BB-L3U3", parentKey: "B-B-BB-BB", kind: "pattern",
    condition: (r) => r.L3U3,
    direction: "Down", targetLabel: "L2 (today's S2)", getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)", getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)", getStoploss: (r) => r.todayCPR.r1,
      order: 5
},
  { key: "B-B-BB-BB-CL4U2", label: "B-B-BB-BB-CL4U2", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL4U2,
      order: 6
},
  { key: "B-B-BB-BB-EL3U4", label: "B-B-BB-BB-EL3U4", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL3U4,
      order: 7
},
  { key: "B-B-BB-BB-EL2U3", label: "B-B-BB-BB-EL2U3", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL2U3,
      order: 8
},
  { key: "B-B-BB-BB-EL2U4", label: "B-B-BB-BB-EL2U4", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL2U4,
      order: 9
},
  { key: "B-B-BB-BB-EL1U3", label: "B-B-BB-BB-EL1U3", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL1U3,
      order: 10
},

  // --- leaf Views ---
  {
    key: "3P:HA-pBELOWR1:R2-3A",
    label: "3P:HA-pBELOWR1:R2-3A",
    parentKey: "HALB-SSLLGap",
    kind: "view",
    direction: "Up",
    condition: (r) =>
      r.prevCPR.pivot > r.todayCPR.r1 && r.todayCPR.pivot > r.prevCPR.prevLow &&
      r.prevCPR.s3 > r.todayCPR.s1 && r.todayCPR.r3 > r.prevCPR.r3,
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
  {
    key: "3P:HA-pABOVER1:S2-6P",
    label: "3P:HA-pABOVER1:S2-6P",
    parentKey: "HALB-SSLLGap",
    kind: "view",
    direction: "Down",
    condition: (r) => r.prevCPR.s3 > r.todayCPR.s1 && r.prevCPR.pivot < r.todayCPR.r1,
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    entryLabel: "BC (today's BC)",
    getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)",
    getStoploss: (r) => r.todayCPR.r1,
      order: 1
},
  {
    key: "2P:HA-HABOVEpR1:R4-4P",
    label: "2P:HA-HABOVEpR1:R4-4P",
    parentKey: "HALB-SSLLGap",
    kind: "view",
    direction: "Up",
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
      order: 2
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
    direction: "Up",
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
      order: 0
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
    direction: "Up",
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
      order: 0
},
  {
      key: "BC-B-B-BB-BB-EL4U4-SL-BAGap-S4",
      label: "B6-EL4U4-pMini",
      parentKey: "B-B-BB-BB-EL4U4",
      condition: (r) => passesView(r, "B-B-BB-BB-EL4U4") && matchesGapBadge(r, "SL-BAGap"),
      standalone: true,
      kind: "view",
      direction: "Down",
      targetLabel: "L4 (today's S4)",
      getTarget: (r) => r.todayCPR.s4,
      entryLabel: "BC (today's BC)",
      getEntry: (r) => r.todayCPR.bc,
      stoplossLabel: "R1 (today's R1)",
      getStoploss: (r) => r.todayCPR.r1,
      levelCheckDefs: [
    {
      "key": "r4",
      "subject": "previous",
      "bandKeys": [
        "r4",
        "r3"
      ]
    },
    {
      "key": "r3",
      "subject": "previous",
      "bandKeys": [
        "r4",
        "r3"
      ]
    },
    {
      "key": "r2",
      "subject": "previous",
      "bandKeys": [
        "r3",
        "r2"
      ]
    },
    {
      "key": "prevHigh",
      "subject": "previous",
      "bandKeys": [
        "r2",
        "prevHigh"
      ]
    },
    {
      "key": "r1",
      "subject": "previous",
      "bandKeys": [
        "r2",
        "prevHigh"
      ]
    },
    {
      "key": "tc",
      "subject": "previous",
      "bandKeys": [
        "r1",
        "tc"
      ]
    },
    {
      "key": "pivot",
      "subject": "previous",
      "bandKeys": [
        "r1",
        "tc"
      ]
    },
    {
      "key": "bc",
      "subject": "previous",
      "bandKeys": [
        "r1",
        "tc"
      ]
    },
    {
      "key": "prevLow",
      "subject": "previous",
      "bandKeys": [
        "bc",
        "prevLow"
      ]
    },
    {
      "key": "s1",
      "subject": "previous",
      "bandKeys": [
        "bc",
        "prevLow"
      ]
    },
    {
      "key": "s2",
      "subject": "previous",
      "bandKeys": [
        "s1",
        "s2"
      ]
    },
    {
      "key": "s3",
      "subject": "previous",
      "bandKeys": [
        "s2",
        "s3"
      ]
    },
    {
      "key": "s4",
      "subject": "previous",
      "bandKeys": [
        "s3",
        "s4"
      ]
    }
  ],
    },
  {
    key: "B-B-BB-BB-L4U4-pLAP:R4",
    label: "B-B-BB-BB-L4U4-pLAP:R4",
    parentKey: "B-B-BB-BB-L4U4",
    kind: "view",
    direction: "Up",
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
      order: 1
},
  {
      key: "R1-B-B-BB-BB-L4U4-SL-GapAB-R4",
      label: "B6-L4U4-Micro",
      parentKey: "B-B-BB-BB-L4U4",
      condition: (r) => passesView(r, "B-B-BB-BB-L4U4") && matchesGapBadge(r, "SL-GapAB"),
      standalone: true,
      kind: "view",
      direction: "Up",
      targetLabel: "U4 (today's R4)",
      getTarget: (r) => r.todayCPR.r4,
      entryLabel: "R1 (today's R1)",
      getEntry: (r) => r.todayCPR.r1,
      stoplossLabel: "S1 (today's S1)",
      getStoploss: (r) => r.todayCPR.s1,
      levelCheckDefs: [
    {
      "key": "r4",
      "subject": "today",
      "bandKeys": [
        "r4",
        "r3"
      ]
    },
    {
      "key": "r3",
      "subject": "today",
      "bandKeys": [
        "r3",
        "r2"
      ]
    },
    {
      "key": "r2",
      "subject": "today",
      "bandKeys": [
        "prevHigh",
        "r1"
      ]
    },
    {
      "key": "prevHigh",
      "subject": "today",
      "bandKeys": [
        "tc",
        "pivot"
      ]
    },
    {
      "key": "r1",
      "subject": "today",
      "bandKeys": [
        "tc",
        "pivot"
      ]
    },
    {
      "key": "tc",
      "subject": "today",
      "bandKeys": [
        "prevLow",
        "s1"
      ]
    },
    {
      "key": "pivot",
      "subject": "today",
      "bandKeys": [
        "prevLow",
        "s1"
      ]
    },
    {
      "key": "bc",
      "subject": "today",
      "bandKeys": [
        "prevLow",
        "s1"
      ]
    },
    {
      "key": "prevLow",
      "subject": "today",
      "bandKeys": [
        "s1",
        "s2"
      ]
    },
    {
      "key": "s1",
      "subject": "today",
      "bandKeys": [
        "s1",
        "s2"
      ]
    },
    {
      "key": "s2",
      "subject": "today",
      "bandKeys": [
        "s2",
        "s3"
      ]
    },
    {
      "key": "s3",
      "subject": "today",
      "bandKeys": [
        "s3",
        "s4"
      ]
    },
    {
      "key": "s4",
      "subject": "previous",
      "bandKeys": [
        "s3",
        "s4"
      ]
    }
  ],
    },
    {
        key: "B6-L3U3-GapAA:R4",
        label: "B6-L3U3-GapAA:R4",
        parentKey: "B-B-BB-BB-L3U3",
        conditionKey: "levelsbelow",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      }
    ],
      },
    {
        key: "R1-B-B-BB-BB-EL3U4-SL-GapBA-R4",
        label: "B6-EL3U4-MiniMicro",
        parentKey: "B-B-BB-BB-EL3U4",
        condition: (r) => passesView(r, "B-B-BB-BB-EL3U4") && matchesGapBadge(r, "SL-GapBA"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "R1 (today's R1)",
        getEntry: (r) => r.todayCPR.r1,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r4",
          "r3"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      }
    ],
      },
    {
        key: "R1-B-B-BB-BB-L4U4-RH-GapAA-R4",
        label: "B6-L4U4-pStepUp",
        parentKey: "B-B-BB-BB-L4U4",
        condition: (r) => passesView(r, "B-B-BB-BB-L4U4") && matchesGapBadge(r, "RH-GapAA"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "R1 (today's R1)",
        getEntry: (r) => r.todayCPR.r1,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
          { key: "r4", subject: "today", bandKeys: ["r4", "r3"] },
          { key: "r3", subject: "today", bandKeys: ["r3", "r2"] },
          { key: "r2", subject: "today", bandKeys: ["r2", "prevHigh"] },
          { key: "prevHigh", subject: "today", bandKeys: ["r1", "tc"] },
          { key: "r1", subject: "today", bandKeys: ["r1", "tc"] },
          { key: "tc", subject: "today", bandKeys: ["bc", "prevLow"] },
          { key: "pivot", subject: "today", bandKeys: ["bc", "prevLow"] },
          { key: "bc", subject: "today", bandKeys: ["bc", "prevLow"] },
          { key: "prevLow", subject: "today", bandKeys: ["s1", "s2"] },
          { key: "s1", subject: "today", bandKeys: ["s1", "s2"] },
          { key: "s2", subject: "today", bandKeys: ["s2", "s3"] },
          { key: "s3", subject: "today", bandKeys: ["s3", "s4"] },
          { key: "s4", subject: "previous", bandKeys: ["s3", "s4"] },
        ],
      }
];

VIEWS.push(...LEVELSABOVE_VIEWS, ...LEVELSBELOW_VIEWS);

// "B-B-BB-BB" itself also has bare-pattern target grading (bearish
// against today's own S2) — patched onto the existing compound ViewDef
// from COMPOUND_VIEWS rather than redefining it, since its CONDITION is
// already correct there.
{
  const bbbb = VIEWS.find((v) => v.key === "B-B-BB-BB");
  if (bbbb) {
    bbbb.direction = "Down";
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
    direction: "Down",
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
      order: 0
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
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 2
},
  {
    key: "6A:HLC-SSLL:R4-6P",
    label: "6A:HLC-SSLL:R4-6P",
    parentKey: "RRHH-BB:SSLL-AA:SSLLGap",
    kind: "view",
    direction: "Up",
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
      order: 0
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
      order: 3
},
  {
    key: "8A:pLAPpPAH:R4-5P",
    label: "8A:pLAPpPAH:R4-5P",
    parentKey: "RHLB-RRHHpGap",
    kind: "view",
    direction: "Up",
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
      order: 0
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
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
  {
    key: "C-B-BB-LB-CL3U2-RRHHGap:R4",
    label: "C-B-BB-LB-CL3U2-RRHHGap:R4",
    parentKey: "C-B-BB-LB-CL3U2",
    kind: "view",
    direction: "Up",
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
      order: 0
},

  // --- "C-C-BB-AA"'s 14 nested Subpattern children (raw flag AND'd onto
  // the parent compound condition via parentKey) — none target-graded
  // yet (no BACKTEST_TARGETS entries for these 14), so each is currently
  // a symbol-list-only scan, same as any freshly-added Pattern. ---
  { key: "C-C-BB-AA-CU4L4", label: "C-C-BB-AA-CU4L4", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU4L4,
      order: 0
},
  { key: "C-C-BB-AA-CL4U4", label: "C-C-BB-AA-CL4U4", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL4U4,
      order: 1
},
  { key: "C-C-BB-AA-CU4L3", label: "C-C-BB-AA-CU4L3", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU4L3,
      order: 2
},
  { key: "C-C-BB-AA-CL4U3", label: "C-C-BB-AA-CL4U3", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL4U3,
      order: 3
},
  { key: "C-C-BB-AA-CU3L3", label: "C-C-BB-AA-CU3L3", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU3L3,
      order: 4
},
  { key: "C-C-BB-AA-CL3U3", label: "C-C-BB-AA-CL3U3", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL3U3,
      order: 5
},
  { key: "C-C-BB-AA-CU3L2", label: "C-C-BB-AA-CU3L2", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU3L2,
      order: 6
},
  { key: "C-C-BB-AA-CL3U2", label: "C-C-BB-AA-CL3U2", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL3U2,
      order: 7
},
  { key: "C-C-BB-AA-CU2L2", label: "C-C-BB-AA-CU2L2", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU2L2,
      order: 8
},
  { key: "C-C-BB-AA-CL2U2", label: "C-C-BB-AA-CL2U2", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL2U2,
      order: 9
},
  { key: "C-C-BB-AA-CU2L1", label: "C-C-BB-AA-CU2L1", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU2L1,
      order: 10
},
  { key: "C-C-BB-AA-CL2U1", label: "C-C-BB-AA-CL2U1", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL2U1,
      order: 11
},
  { key: "C-C-BB-AA-CU1L1", label: "C-C-BB-AA-CU1L1", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CU1L1,
      order: 12
},
  { key: "C-C-BB-AA-CL1U1", label: "C-C-BB-AA-CL1U1", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => r.CL1U1,
      order: 13
},
    {
        key: "C-CL3U3-SH-AGapB-S4",
        label: "C-CL3U3-SH-AGapB-S4",
        parentKey: "C-C-BB-AA-CL3U3",
        conditionKey: "compressed",
        kind: "view",
        direction: "Down",
        targetLabel: "L4 (today's S4)",
        getTarget: (r) => r.todayCPR.s4,
        entryLabel: "BC (today's BC)",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      }
    ],
      },
    {
        key: "CBA-CL2U2-RHGapAB-R4",
        label: "CBA-CL2U2-RHGapAB-R4",
        parentKey: "C-C-BB-AA-CL2U2",
        conditionKey: "C-C-BB-AA-CL2U2",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      }
    ],
      },
    {
        key: "CBA-CL3U2-RH-GapAB-R4",
        label: "CBA-CL3U2-RH-GapAB-R4",
        parentKey: "C-C-BB-AA-CL3U2",
        conditionKey: "C-C-BB-AA-CL3U2",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      }
    ],
      },
    {
        key: "CBA-CL2U1-RH-AAGap-R4",
        label: "CBA-CL2U1-RH-AAGap-R4",
        parentKey: "C-C-BB-AA-CL2U1",
        conditionKey: "C-C-BB-AA-CL2U1",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      }
    ],
      }
];

const EXPANDED_VIEWS: ViewDef[] = [
  // --- "E-E-AA-BB"'s five nested Subpattern children — all target-graded
  // bullish against today's own R2 (U2), per user request. ---
  {
    key: "E-E-AA-BB-EL1U2", label: "E-E-AA-BB-EL1U2", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EL1U2,
    direction: "Up", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
  {
    key: "E-E-AA-BB-EU1L2", label: "E-E-AA-BB-EU1L2", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EU1L2,
    direction: "Up", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
      order: 1
},
  {
    key: "E-E-AA-BB-EU2L2", label: "E-E-AA-BB-EU2L2", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EU2L2,
    direction: "Up", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
      order: 2
},
  {
    key: "E-E-AA-BB-EU1L3", label: "E-E-AA-BB-EU1L3", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EU1L3,
    direction: "Up", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
      order: 3
},
  {
    key: "E-E-AA-BB-EL1U1", label: "E-E-AA-BB-EL1U1", parentKey: "E-E-AA-BB", kind: "pattern",
    condition: (r) => r.EL1U1,
    direction: "Up", targetLabel: "U2 (today's R2)", getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)", getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)", getStoploss: (r) => r.todayCPR.s1,
      order: 4
},
];

VIEWS.push(...COMPRESSED_VIEWS, ...EXPANDED_VIEWS);

// ---------------------------------------------------------------------
// Step 3, batch 3 — "R1AbovePR4" ("ABOVE LEVEL4") and "S1BelowPS4"
// ("BELOW LEVEL4"): two standalone top-level categories (true
// complements of levelsabove/levelsbelow — see cpr.ts's r.R1AbovePR4 /
// r.S1BelowPS4 — NOT nested under levelsabove/levelsbelow themselves),
// plus the 8 "Copy View" conditionKey entries deferred from every prior
// batch (there are 8 of these total, not 6 — see the corrected count
// below; the earlier chat estimate undercounted them).
//
// Transcribed directly from the uploaded ScreenerUtils.tsx (passesPattern
// lines 1442-1553, 2159-2196; matchesPatternFlag line 2172) and
// backtest.ts (BACKTEST_TARGETS lines 283-292, 349-395, 590-614,
// 637-667, 788-800, 921-964, 1284-1359; BACKTEST_CATEGORIES lines
// 1563-1582, 1712-1734, 2122-2276).
//
// Note on "A-A-AA-AA": backtest.ts's own tree shows this SAME label
// under both "levelsabove" and "R1AbovePR4". The single-source model
// represents those two displayed branches with separate keys: the existing
// "A-A-AA-AA" node remains under "levelsabove", while
// "R1AbovePR4-A-A-AA-AA" is the corresponding node under "ABOVE LEVEL4".
// The EUTL3 branch is intentionally attached to the latter, so its pattern
// and child views appear only under "ABOVE LEVEL4" in the Backtest dropdown.
// ---------------------------------------------------------------------

const R1ABOVEPR4_S1BELOWPS4_VIEWS: ViewDef[] = [
  // --- the two standalone top-level categories ---
  { key: "R1AbovePR4", label: "ABOVE LEVEL4", kind: "category", condition: (r) => r.R1AbovePR4,
      order: 6
},
  { key: "S1BelowPS4", label: "BELOW LEVEL4", kind: "category", condition: (r) => r.S1BelowPS4,
      order: 7
},

  // --- direct Pattern children of "R1AbovePR4" ---
  { key: "EUTL3", label: "EUTL3", parentKey: "R1AbovePR4", kind: "pattern", condition: (r) => r.EUTL3,
      order: 1
},
  // No target-graded sub-patterns nested under EUPL2 yet — it's a
  // symbol-list-only scan in the Backtest dropdown.
  // (EL1L2 / EL2L1 used to be direct children of "R1AbovePR4" here; they now
  // live under "A-A-AA-AA" as A-A-AA-AA-EL1L2 / A-A-AA-AA-EL2L1 below.)
  { key: "EUPL2", label: "EUPL2", parentKey: "R1AbovePR4", kind: "pattern", condition: (r) => r.EUPL2,
      order: 5
},

  // --- Pattern "A-E-AA-E" inside "ABOVE LEVEL4" and its subpatterns ---
  // Note: this key was previously declared a second time further below
  // (order: 12, with only the "EUBL2" child) — that second declaration
  // was a duplicate of this same node and caused "A-E-AA-E" (and its
  // subpatterns) to render twice in the tree/search. The duplicate
  // parent declaration has been removed; EU1L3/EU1L2 below now appear
  // once, and "EUBL2" further down is re-pointed at this declaration.
  {
    key: "R1AbovePR4-A-E-AA-E",
    label: "A-E-AA-E",
    parentKey: "R1AbovePR4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-E",
    order: 8,
  },
  {
    key: "A-E-AA-E-EU1L3",
    label: "A-E-AA-E-EU1L3",
    parentKey: "R1AbovePR4-A-E-AA-E",
    kind: "pattern",
    condition: (r) => r.EU1L3,
    order: 0,
  },
  {
    key: "A-E-AA-E-EU1L2",
    label: "A-E-AA-E-EU1L2",
    parentKey: "R1AbovePR4-A-E-AA-E",
    kind: "pattern",
    condition: (r) => r.EU1L2,
    order: 1,
  },

  // --- Pattern "A-A-AA-AA" inside "ABOVE LEVEL4" and its subpatterns ---
  {
    key: "R1AbovePR4-A-A-AA-AA",
    label: "A-A-AA-AA",
    parentKey: "R1AbovePR4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-AA",
    order: 9,
  },
  {
    key: "A-A-AA-AA-EU1L4",
    label: "A-A-AA-AA-EU1L4",
    parentKey: "R1AbovePR4-A-A-AA-AA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-AA" &&
      r.EU1L4,
    order: 0,
  },
  {
    key: "A-A-AA-AA-EUBL2",
    label: "A-A-AA-AA-EUBL2",
    parentKey: "R1AbovePR4-A-A-AA-AA",
    kind: "pattern",
    condition: (r) => r.EUBL2,
    order: 1,
  },
  {
    key: "A-A-AA-AA-EU1L3",
    label: "A-A-AA-AA-EU1L3",
    parentKey: "R1AbovePR4-A-A-AA-AA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-AA" &&
      r.EU1L3,
    order: 2,
  },
  {
    key: "A-A-AA-AA-EUPL3",
    label: "A-A-AA-AA-EUPL3",
    parentKey: "R1AbovePR4-A-A-AA-AA",
    kind: "pattern",
    condition: (r) => r.EUPL3,
    order: 3,
  },
  {
    key: "A-A-AA-AA-EUPL2",
    label: "A-A-AA-AA-EUPL2",
    parentKey: "R1AbovePR4-A-A-AA-AA",
    kind: "pattern",
    condition: (r) => r.EUPL2,
    order: 4,
  },
  {
    // MOVED: previously the flat "EUBL3" pattern directly under
    // "R1AbovePR4" (no A-A-AA-AA gating at all). Renested here so it
    // properly ANDs in the A-A-AA-AA-AA compound (SSRR-A + HHLL-A +
    // RRHH-AA + SSLL-AA) via passesView's parentKey chain, same
    // treatment as its EUTL3 sibling below.
    key: "A-A-AA-AA-EUBL3",
    label: "A-A-AA-AA-EUBL3",
    parentKey: "R1AbovePR4-A-A-AA-AA",
    kind: "pattern",
    condition: (r) => r.EUBL3,
    order: 5,
  },

  // MOVED from direct children of "R1AbovePR4" (was "EL1L2" / "EL2L1"):
  // now nested under the A-A-AA-AA Pattern in ABOVE LEVEL4. passesView
  // chains the parent, so each ANDs A-A-AA-AA (SSRR-A + HHLL-A + RRHH-AA +
  // SSLL-AA) and R1AbovePR4 with the raw flag.
  { key: "A-A-AA-AA-EL1L2", label: "A-A-AA-AA-EL1L2", parentKey: "R1AbovePR4-A-A-AA-AA", kind: "pattern", condition: (r) => r.EL1L2,
      order: 8
},
  { key: "A-A-AA-AA-EL2L1", label: "A-A-AA-AA-EL2L1", parentKey: "R1AbovePR4-A-A-AA-AA", kind: "pattern", condition: (r) => r.EL2L1,
      order: 9
},

  // --- Pattern "A-A-AA-OA" inside "ABOVE LEVEL4" and its subpatterns ---
  {
    key: "R1AbovePR4-A-A-AA-OA",
    label: "A-A-AA-OA",
    parentKey: "R1AbovePR4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-OA",
    order: 9.5,
  },
  {
    key: "A-A-AA-OA-EU1L2",
    label: "A-A-AA-OA-EU1L2",
    parentKey: "R1AbovePR4-A-A-AA-OA",
    kind: "pattern",
    condition: (r) => r.EU1L2,
    order: 0,
  },
  {
    key: "A-A-AA-OA-EU1L3",
    label: "A-A-AA-OA-EU1L3",
    parentKey: "R1AbovePR4-A-A-AA-OA",
    kind: "pattern",
    condition: (r) => r.EU1L3,
    order: 1,
  },

  // --- Pattern "A-E-AA-LB" inside "ABOVE LEVEL4" and its subpatterns ---
  {
    key: "R1AbovePR4-A-E-AA-LB",
    label: "A-E-AA-LB",
    parentKey: "R1AbovePR4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-LB",
    order: 10,
  },
  {
    key: "A-E-AA-LB-EUPL2",
    label: "A-E-AA-LB-EUPL2",
    parentKey: "R1AbovePR4-A-E-AA-LB",
    kind: "pattern",
    condition: (r) => r.EUPL2,
    order: 0,
  },
  {
    key: "A-E-AA-LB-EUTL2",
    label: "A-E-AA-LB-EUTL2",
    parentKey: "R1AbovePR4-A-E-AA-LB",
    kind: "pattern",
    condition: (r) => r.EUTL2,
    order: 1,
  },

  // --- Pattern "E-E-AA-OB" inside "ABOVE LEVEL4" and its subpatterns ---
  {
    key: "R1AbovePR4-E-E-AA-OB",
    label: "E-E-AA-OB",
    parentKey: "R1AbovePR4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-OB",
    order: 11,
  },
  {
    key: "E-E-AA-OB-EU1L2",
    label: "E-E-AA-OB-EU1L2",
    parentKey: "R1AbovePR4-E-E-AA-OB",
    kind: "pattern",
    condition: (r) => r.EU1L2,
    order: 0,
  },

  // --- "A-E-AA-E-EUBL2" subpattern, child of the single "A-E-AA-E" node
  // declared earlier under "ABOVE LEVEL4" (its duplicate parent-node
  // declaration, order: 12, was removed from here) ---
  {
    key: "A-E-AA-E-EUBL2",
    label: "A-E-AA-E-EUBL2",
    parentKey: "R1AbovePR4-A-E-AA-E",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-E" &&
      r.EUBL2,
    order: 0,
  },

  // --- "EL1U4" Pattern nested under "S1BelowPS4" ---
  { key: "EL1U4", label: "EL1U4", parentKey: "S1BelowPS4", kind: "pattern", condition: (r) => r.EL1U4,
      order: 0
},

  // --- leaf Views ---
  {
    key: "TiMe-EUTL3-AU4:2PM",
    label: "TiMe-EUTL3-AU4:2PM",
    parentKey: "EUTL3",
    kind: "view",
    direction: "Up",
    condition: (r) =>
      r.prevCPR.widthPct > 0.10 && r.prevCPR.widthPct <= 0.22 && // Tiny
      r.todayCPR.widthPct > 5.00 && r.todayCPR.widthPct <= 10.00, // Mega
    targetLabel: "AU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
  {
    key: "6AM:MegMeg-L3:8PM",
    label: "6AM:MegMeg-L3:8PM",
    parentKey: "A-A-AA-AA-EU1L4",
    kind: "view",
    direction: "Down",
    condition: (r) =>
      r.prevCPR.widthPct > 5.00 && r.prevCPR.widthPct <= 10.00 && // pMega
      r.todayCPR.widthPct > 5.00 && r.todayCPR.widthPct <= 10.00, // Mega
    targetLabel: "L3 (today's S3)",
    getTarget: (r) => r.todayCPR.s3,
    entryLabel: "BC (today's BC)",
    getEntry: (r) => r.todayCPR.bc,
    stoplossLabel: "R1 (today's R1)",
    getStoploss: (r) => r.todayCPR.r1,
      order: 0
},
  {
      key: "BC-A-A-AA-AA-EUTL3-RH-BBGap-S2",
      label: "A6-EUTL3-MegaUltra",
      parentKey: "A-A-AA-AA-EUTL3",
      condition: (r) => passesView(r, "A-A-AA-AA-EUTL3") && matchesGapBadge(r, "RH-BBGap"),
      standalone: true,
      kind: "view",
      direction: "Down",
      targetLabel: "L2 (today's S2)",
      getTarget: (r) => r.todayCPR.s2,
      entryLabel: "BC (today's BC)",
      getEntry: (r) => r.todayCPR.bc,
      stoplossLabel: "R1 (today's R1)",
      getStoploss: (r) => r.todayCPR.r1,
      levelCheckDefs: [
    {
      "key": "r4",
      "subject": "previous",
      "bandKeys": [
        "tc",
        "pivot"
      ]
    },
    {
      "key": "r3",
      "subject": "previous",
      "bandKeys": [
        "pivot",
        "bc"
      ]
    },
    {
      "key": "r2",
      "subject": "previous",
      "bandKeys": [
        "bc",
        "s1"
      ]
    },
    {
      "key": "prevHigh",
      "subject": "previous",
      "bandKeys": [
        "s1",
        "prevLow"
      ]
    },
    {
      "key": "r1",
      "subject": "previous",
      "bandKeys": [
        "s1",
        "prevLow"
      ]
    },
    {
      "key": "tc",
      "subject": "previous",
      "bandKeys": [
        "s1",
        "prevLow"
      ]
    },
    {
      "key": "pivot",
      "subject": "previous",
      "bandKeys": [
        "s1",
        "prevLow"
      ]
    },
    {
      "key": "bc",
      "subject": "previous",
      "bandKeys": [
        "s1",
        "prevLow"
      ]
    },
    {
      "key": "prevLow",
      "subject": "previous",
      "bandKeys": [
        "prevLow",
        "s2"
      ]
    },
    {
      "key": "s1",
      "subject": "previous",
      "bandKeys": [
        "prevLow",
        "s2"
      ]
    },
    {
      "key": "s2",
      "subject": "previous",
      "bandKeys": [
        "prevLow",
        "s2"
      ]
    },
    {
      "key": "s3",
      "subject": "previous",
      "bandKeys": [
        "prevLow",
        "s2"
      ]
    },
    {
      "key": "s4",
      "subject": "previous",
      "bandKeys": [
        "s2",
        "s3"
      ]
    }
  ],
    },
  {
    key: "A5-EUTL3-pA-S1ATC",
    label: "A5-EUTL3-pA-S1ATC",
    parentKey: "A-A-AA-AA-EUTL3",
    kind: "view",
    direction: "Up",
    condition: (r) => r.prevCPR.HLSwitch === "HL-A",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["tc", "pivot"] },
      { key: "r3", subject: "previous", bandKeys: ["pivot", "bc"] },
      { key: "r2", subject: "previous", bandKeys: ["bc", "s1"] },
      { key: "prevHigh", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "r1", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "tc", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "pivot", subject: "today", bandKeys: ["r4", "r3"] },
      { key: "bc", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "prevLow", subject: "today", bandKeys: ["bc", "prevLow"] },
      { key: "s1", subject: "today", bandKeys: ["r2", "prevHigh"] },
      { key: "s2", subject: "today", bandKeys: ["s2", "s3"] },
      { key: "s3", subject: "previous", bandKeys: ["s2", "s3"] },
      { key: "s4", subject: "previous", bandKeys: ["s2", "s3"] },
    ],
      order: 2
},
  {
    key: "A-A-AA-AA-EUPL3-RRHHGap:R4",
    label: "A-A-AA-AA-EUPL3-RRHHGap:R4",
    parentKey: "A-A-AA-AA-EUPL3",
    kind: "view",
    direction: "Up",
    condition: (r) =>
      r.RRSSGapCategory === "RRGap" &&
      r.PDHPDLGapCategory === "HHGap" &&
      r.prevCPR.HLSwitch === "HL-A" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.hlGapWinner === "today" &&
      r.prevCPR.r1 > r.todayCPR.s1,
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
  {
    key: "ss-EL1U4-U4:10PM",
    label: "ss-EL1U4-U4:10PM",
    parentKey: "EL1U4",
    kind: "view",
    direction: "Up",
    condition: (r) =>
      r.cprFalling && r.strWideCPR &&
      r.prevCPR.HLSwitch === "HL-A" && r.todayCPR.HLSwitch === "HL-A" &&
      r.prevCPR.bc >= r.todayCPR.prevHigh && r.prevCPR.s2 >= r.todayCPR.tc &&
      r.prevCPR.widthPct > 0.60 && r.prevCPR.widthPct <= 1.10 && // pSmall
      r.todayCPR.widthPct > 0.60 && r.todayCPR.widthPct <= 1.10, // Small
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
    {
        key: "A-E-AA-E-EUBL2-GapB-S1",
        label: "A-E-AA-E-EUBL2-GapB-S1",
        parentKey: "A-E-AA-E-EUBL2",
        conditionKey: "A-E-AA-E-EUBL2",
        kind: "view",
        direction: "Down",
        targetLabel: "L2 (today's S2)",
        getTarget: (r) => r.todayCPR.s2,
        entryLabel: "BC (today's BC)",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      }
    ],
      },
    {
        key: "A6-EUTL3-BGapB-Ultra-S1",
        label: "A6-EUTL3-BGapB-Ultra-S1",
        parentKey: "A-A-AA-AA-EUTL3",
        conditionKey: "R1AbovePR4",
        kind: "view",
        direction: "Down",
        targetLabel: "L1 (today's S1)",
        getTarget: (r) => r.todayCPR.s1,
        entryLabel: "BC (today's BC)",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "r4",
          "r3"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      }
    ],
      },
    {
        key: "A5-EU1L2-AGapA-R3",
        label: "A5-EU1L2-AGapA-R3",
        parentKey: "A-A-AA-OA-EU1L2",
        conditionKey: "A-A-AA-OA-EU1L2",
        kind: "view",
        direction: "Up",
        targetLabel: "U3 (today's R3)",
        getTarget: (r) => r.todayCPR.r3,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s3",
          "s4"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "s2"
        ]
      }
    ],
      },
    {
        key: "AE-EUBL2-RH-AGapB-R4",
        label: "AE-EUBL2-RH-AGapB-R4",
        parentKey: "A-E-AA-E-EUBL2",
        conditionKey: "A-E-AA-E-EUBL2",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      }
    ],
      },
    {
        key: "A6-EL2L1-ABGap-R2",
        label: "A6-EL2L1-ABGap-R2",
        parentKey: "A-A-AA-AA-EL2L1",
        conditionKey: "A-A-AA-AA-EL2L1",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      }
    ],
      },
    {
        key: "BC-A-A-AA-AA-EUPL3-RH-BBGap-S2",
        label: "A6-EUPL3-Ultra-S2",
        parentKey: "A-A-AA-AA-EUPL3",
        condition: (r) => passesView(r, "A-A-AA-AA-EUPL3") && matchesGapBadge(r, "RH-BBGap"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "L2 (today's S2)",
        getTarget: (r) => r.todayCPR.s2,
        entryLabel: "BC (today's BC)",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      }
    ],
      },
    {
        key: "TC-A-A-AA-AA-EUTL3-RH-BBGap-R1",
        label: "A6-EUTL3-pTiny",
        parentKey: "A-A-AA-AA-EUTL3",
        condition: (r) => passesView(r, "A-A-AA-AA-EUTL3") && matchesGapBadge(r, "RH-BBGap"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "U1 (today's R1)",
        getTarget: (r) => r.todayCPR.r1,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "s2",
          "s3"
        ]
      }
    ],
      }
];

VIEWS.push(...R1ABOVEPR4_S1BELOWPS4_VIEWS);

// ---------------------------------------------------------------------
// The 8 "Copy View" entries (backtest.ts's BacktestTargetDef.conditionKey
// mechanism) — each has NO passesPattern case of its own; it grades
// entirely against a DIFFERENT key's condition, via conditionKey (see
// ViewDef.conditionKey / passesView above). Each keeps its own
// target/entry/stoploss/levelCheckDefs and its own tree position
// (parentKey) for Backtest-dropdown display only. There are 8 of these,
// not 6 as an earlier chat estimate said — corrected here.
// ---------------------------------------------------------------------

const COPY_VIEWS: ViewDef[] = [
  {
    key: "A-A-AA-AA-U3L3-SSLLGap:R4+1",
    label: "A-A-AA-AA-U3L3-SSLLGap:R4 +1",
    parentKey: "A-A-AA-AA-U3L3",
    conditionKey: "A6-U3L3-SLBBG-R4",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["r2", "r3"] },
      { key: "r3", subject: "previous", bandKeys: ["r1", "r2"] },
      { key: "r2", subject: "today", bandKeys: ["r3", "r4"] },
      { key: "r1", subject: "today", bandKeys: ["r2", "r3"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r2", "r3"] },
      { key: "tc", subject: "today", bandKeys: ["r1", "r2"] },
      { key: "pivot", subject: "today", bandKeys: ["r1", "r2"] },
      { key: "bc", subject: "today", bandKeys: ["r1", "r2"] },
      { key: "s1", subject: "today", bandKeys: ["tc", "prevHigh"] },
      { key: "prevLow", subject: "today", bandKeys: ["tc", "prevHigh"] },
      { key: "s2", subject: "today", bandKeys: ["s1", "bc"] },
      { key: "s3", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "s4", subject: "today", bandKeys: ["s3", "s2"] },
    ],
      order: 1
},
  {
    key: "A-A-AA-AA-U3L3-SL-PAR1:R4",
    label: "A-A-AA-AA-U3L3-SL-PAR1:R4",
    parentKey: "A-A-AA-AA-U3L3",
    conditionKey: "A6-U3L3-SLBBG-R4",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 2
},
  {
    key: "6PM:APHS1A-FAU4:99PM",
    label: "6PM:APHS1A-FAU4:99PM",
    parentKey: "A-A-AA-AA-EU2L4",
    conditionKey: "6PM:APHS1A-FAU4:9PM",
    kind: "view",
    direction: "Up",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["r1", "r2"] },
      { key: "r3", subject: "previous", bandKeys: ["tc", "prevHigh"] },
      { key: "r2", subject: "previous", bandKeys: ["tc", "prevHigh"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r3", "r4"] },
      { key: "r1", subject: "today", bandKeys: ["r3", "r4"] },
      { key: "tc", subject: "today", bandKeys: ["prevHigh", "r2"] },
      { key: "pivot", subject: "today", bandKeys: ["prevHigh", "r2"] },
      { key: "bc", subject: "today", bandKeys: ["prevHigh", "r2"] },
      { key: "prevLow", subject: "today", bandKeys: ["s1", "bc"] },
      { key: "s1", subject: "today", bandKeys: ["tc", "r1"] },
      { key: "s2", subject: "today", bandKeys: ["s3", "s1"] },
      { key: "s3", subject: "today", bandKeys: ["s4", "s2"] },
    ],
      order: 3
},
  {
    key: "6PM:APHS1A-FAU4:9PMM",
    label: "6PM:APHS1A-FAU4:9PMM",
    parentKey: "A-A-AA-AA-EU2L4",
    conditionKey: "6PM:APHS1A-FAU4:9PM",
    kind: "view",
    direction: "Up",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 4
},
  {
    key: "A-A-AA-AA-EUBL2-pS4S2:R2",
    label: "A-A-AA-AA-EUBL2-pS4S2:R2",
    parentKey: "A-A-AA-AA-EUBL2",
    conditionKey: "A-A-AA-AA",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["bc", "s1"] },
      { key: "r3", subject: "previous", bandKeys: ["bc", "s1"] },
      { key: "r2", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "prevHigh", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "r1", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "tc", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "pivot", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "bc", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "prevLow", subject: "today", bandKeys: ["bc", "s1"] },
      { key: "s1", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "s2", subject: "previous", bandKeys: ["prevLow", "s2"] },
      { key: "s3", subject: "previous", bandKeys: ["prevLow", "s2"] },
      { key: "s4", subject: "previous", bandKeys: ["prevLow", "s2"] },
    ],
      order: 0
},
  {
    key: "B-B-BB-BB-L4U4-pGapA",
    label: "B-B-BB-BB-L4U4-pGapA",
    parentKey: "B-B-BB-BB-L4U4",
    conditionKey: "B-B-BB-BB-L4U4",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "today", bandKeys: ["r4", "r3"] },
      { key: "r3", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "r2", subject: "today", bandKeys: ["r2", "prevHigh"] },
      { key: "prevHigh", subject: "today", bandKeys: ["tc", "pivot"] },
      { key: "r1", subject: "today", bandKeys: ["r1", "tc"] },
      { key: "tc", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "pivot", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "bc", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "prevLow", subject: "today", bandKeys: ["s1", "s2"] },
      { key: "s1", subject: "today", bandKeys: ["s1", "s2"] },
      { key: "s2", subject: "today", bandKeys: ["s2", "s3"] },
      { key: "s3", subject: "today", bandKeys: ["s3", "s4"] },
      { key: "s4", subject: "previous", bandKeys: ["s3", "s4"] },
    ],
      order: 3
},
  {
    key: "B-B-BB-BB-L2U4-pPPHR1",
    label: "B-B-BB-BB-L2U4-pPPHR1",
    parentKey: "B-B-BB-BB-L2U4",
    conditionKey: "B-B-BB-BB-L2U4",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "today", bandKeys: ["r4", "r3"] },
      { key: "r3", subject: "today", bandKeys: ["r2", "prevHigh"] },
      { key: "r2", subject: "today", bandKeys: ["prevHigh", "r1"] },
      { key: "prevHigh", subject: "today", bandKeys: ["pivot", "bc"] },
      { key: "r1", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "tc", subject: "today", bandKeys: ["s1", "s2"] },
      { key: "pivot", subject: "today", bandKeys: ["s1", "s2"] },
      { key: "bc", subject: "today", bandKeys: ["s2", "s3"] },
      { key: "prevLow", subject: "today", bandKeys: ["s2", "s3"] },
      { key: "s1", subject: "today", bandKeys: ["s3", "s4"] },
      { key: "s2", subject: "previous", bandKeys: ["pivot", "bc"] },
      { key: "s3", subject: "previous", bandKeys: ["prevLow", "s1"] },
      { key: "s4", subject: "previous", bandKeys: ["s1", "s2"] },
    ],
      order: 0
},
    {
        key: "B6-L4U4-MiniTiny:R4",
        label: "B6-L4U4-MiniTiny:R4",
        parentKey: "B-B-BB-BB-L4U4",
        conditionKey: "B-B-BB-BB-L4U4",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "r4",
          "r3"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s3",
          "s4"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "CU3L2-MedMicro-R4",
        label: "CU3L2-MedMicro-R4",
        parentKey: "C-C-BB-AA-CU3L2",
        conditionKey: "C-C-BB-AA-CU3L2",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      }
    ],
      }
];

VIEWS.push(...COPY_VIEWS);

// ---------------------------------------------------------------------
// Step 3, batch 4 — "equal-cpr" (kept under TOUCH; "inside-cpr" and "overlapping-lower"
// are DELIBERATELY OMITTED per user request, removing them and everything
// nested under them from the menu — passesView/getView simply won't find
// their keys, same effect as deleting their cases outright), plus the
// small set of standalone top-level toggles that don't nest under ANY
// category in backtest.ts's tree at all (top15gainers/top15losers,
// Price-AbovePDH/BelowPDL, HAThin-U1>PU4, and the four HB-L1* patterns) —
// transcribed from ScreenerUtils.tsx passesPattern lines
// 1432-1437, 1538-1539, 1561-1568, 1570-1575, 1582-1584 for completeness,
// since deleting PIVOT_PATTERNS later requires every reachable key to
// live in VIEWS, not just the ones nested in BACKTEST_CATEGORIES.
// ---------------------------------------------------------------------

const MISC_VIEWS: ViewDef[] = [
  { key: "equal-cpr", label: "Equal CPR", kind: "pattern", parentKey: "touch", condition: (r) => r.equalCPR,
      order: 5
},
  {
    key: "eXLoL3U3-L3",
    label: "eXLoL3U3-L3",
    parentKey: "equal-cpr",
    kind: "view",
    direction: "Down",
    condition: (r) => r.srExpandedLower,
  },
  {
    key: "touch",
    label: "TOUCH",
    kind: "category",
    // touchCategory already applies the shared precedence rule from cpr.ts:
    // Level4 crossings stay in ABOVE/BELOW LEVEL4 and do not also appear
    // under TOUCH.
    condition: (r) => r.touchCategory,
    order: 11,
  },
  {
    key: "insidecpr",
    label: "INCPR",
    parentKey: "touch",
    kind: "pattern",
    order: 1,
    condition: (r) => !!(r.InsideCPR || (r as any).insideCPR),
  },
  {
    key: "outcpr",
    label: "OutCPR",
    parentKey: "touch",
    kind: "pattern",
    order: 2,
    condition: (r) => !!r.outCPR,
  },
  {
    key: "overlapHigher",
    label: "Overlap Above",
    parentKey: "touch",
    kind: "pattern",
    order: 3,
    condition: (r) => !!r.overlapHigher,
  },
  {
    key: "overlapLower",
    label: "Overlap Below",
    parentKey: "touch",
    kind: "pattern",
    order: 4,
    condition: (r) => !!r.overlapLower,
  },
  {
    key: "inside-cpr",
    label: "INCPR",
    kind: "pattern",
    condition: (r) => !!(r.InsideCPR || (r as any).insideCPR),
  },
  {
    key: "outside-cpr",
    label: "OutCPR",
    kind: "pattern",
    condition: (r) => !!r.outCPR,
  },
  { key: "top15gainers", label: "TOP 15 GAINERS", kind: "category", condition: () => true,
      order: 0
},
  { key: "top15losers", label: "TOP 15 LOSERS", kind: "category", condition: () => true,
      order: 1
},
  { key: "Price-AbovePDH", label: "Price-AbovePDH", kind: "view", condition: (r) => r.currentPrice > r.todayCPR.prevHigh },
  { key: "Price-BelowPDL", label: "Price-BelowPDL", kind: "view", condition: (r) => r.currentPrice < r.todayCPR.prevLow },
  {
    key: "HAThin-U1>PU4",
    label: "HAThin-U1>PU4",
    kind: "view",
    condition: (r) => r.cprRising && r.strWideCPR && r.bothTight && r.R1AbovePR4,
  },
  { key: "HB-L1<PL1-PU12CU23", label: "HB-L1<PL1-PU12CU23", kind: "view", condition: (r) => r.cprFalling && r.strWideCPR && r.hbJPattern1 },
  { key: "HB-L1<PL4-U1>TCPR", label: "HB-L1<PL4-U1>TCPR", kind: "view", condition: (r) => r.cprFalling && r.strWideCPR && r.hbJPattern2 },
  { key: "HB-L1<PL2-U12CPU12", label: "HB-L1<PL2-U12CPU12", kind: "view", condition: (r) => r.cprFalling && r.strWideCPR && r.hbJPattern3 },
  { key: "HB-L1>PL1-PU1CU234", label: "HB-L1>PL1-PU1CU234", kind: "view", condition: (r) => r.cprFalling && r.strWideCPR && r.hbJPattern4 },
    {
        key: "A5-CU3L3-SLGapBB-R4",
        label: "A5-CU3L3-SLGapBB-R4",
        parentKey: "A-A-OA-AA-CU3L3",
        conditionKey: "A-A-OA-AA-CU3L3",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      }
    ],
      },
    {
        key: "TC-INCPR-B-A-C-C-U4L4-RL-GapBB-R4",
        label: "InnerRocket",
        parentKey: "INCPR-B-A-C-C-U4L4",
        condition: (r) => passesView(r, "INCPR-B-A-C-C-U4L4") && matchesGapBadge(r, "RL-GapBB"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r4",
          "r3"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s2",
          "s3"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "R1-INCPR-C-C-BB-AA-CL2U2-SH-GapAB-R4",
        label: "PR4ContinueR4Nxt",
        parentKey: "INCPR-C-C-BB-AA-CL2U2",
        condition: (r) => passesView(r, "INCPR-C-C-BB-AA-CL2U2") && matchesGapBadge(r, "SH-GapAB"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "R1 (today's R1)",
        getEntry: (r) => r.todayCPR.r1,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "s1",
          "s2"
        ]
      }
    ],
      },
    {
        key: "S1-INCPR-C-C-BB-AA-CL3U3-RL-GapBB-S4",
        label: "CL3U3-MicroFall",
        parentKey: "INCPR-C-C-BB-AA-CL3U3",
        condition: (r) => passesView(r, "INCPR-C-C-BB-AA-CL3U3") && matchesGapBadge(r, "RL-GapBB"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "L4 (today's S4)",
        getTarget: (r) => r.todayCPR.s4,
        entryLabel: "S1 (today's S1)",
        getEntry: (r) => r.todayCPR.s1,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
          {
            "key": "r4",
            "subject": "today",
            "bandKeys": [
              "r3",
              "r2"
            ]
          },
          {
            "key": "r3",
            "subject": "today",
            "bandKeys": [
              "r2",
              "r1"
            ]
          },
          {
            "key": "r2",
            "subject": "today",
            "bandKeys": [
              "r2",
              "r1"
            ]
          },
          {
            "key": "prevHigh",
            "subject": "today",
            "bandKeys": [
              "prevHigh",
              "tc"
            ]
          },
          {
            "key": "r1",
            "subject": "today",
            "bandKeys": [
              "prevHigh",
              "tc"
            ]
          },
          {
            "key": "tc",
            "subject": "today",
            "bandKeys": [
              "pivot",
              "bc"
            ]
          },
          {
            "key": "pivot",
            "subject": "today",
            "bandKeys": [
              "pivot",
              "bc"
            ]
          },
          {
            "key": "bc",
            "subject": "today",
            "bandKeys": [
              "pivot",
              "bc"
            ]
          },
          {
            "key": "prevLow",
            "subject": "today",
            "bandKeys": [
              "bc",
              "s1"
            ]
          },
          {
            "key": "s1",
            "subject": "today",
            "bandKeys": [
              "bc",
              "s1"
            ]
          },
          {
            "key": "s2",
            "subject": "today",
            "bandKeys": [
              "prevLow",
              "s2"
            ]
          },
          {
            "key": "s3",
            "subject": "today",
            "bandKeys": [
              "s2",
              "s3"
            ]
          },
          {
            "key": "s4",
            "subject": "today",
            "bandKeys": [
              "s2",
              "s3"
            ]
          }
        ],
      }
];

VIEWS.push(...MISC_VIEWS);

// ---------------------------------------------------------------------
// "Include in Overlap Above" — duplicate branch, added per user request.
//
// Same treatment as the existing R1AbovePR4/S1BelowPS4 duplicate-branch
// precedent above ("A-A-AA-AA" appears under BOTH "levelsabove" AND
// "ABOVE LEVEL4" via two separate ViewDef keys sharing one label): each
// of the 7 compound categories listed below gets a SECOND node, nested
// under "overlapHigher" ("Overlap Above") instead of its original
// levelsabove/compressed parent, with the identical 4-way SSRR/HHLL/
// RRHH/SSLL identity condition. Because these duplicate nodes are NOT
// standalone, passesView also ANDs in "overlapHigher"'s own condition
// (r.overlapHigher) via the parentKey chain — so a row must satisfy both
// the compound shape AND the overlap condition to show up here. The
// ORIGINAL nodes (under levelsabove/compressed) are untouched and keep
// showing every row that matches the shape regardless of overlap.
//
// Duplicate top-node keys are prefixed "overlapHigher-<compound-key>" to
// stay unique. Subpattern children keep the plain "<compound-key>-<FLAG>"
// naming UNLESS that exact key is already taken by an existing sibling
// under the original branch (only true for C-C-BB-AA's three listed
// flags, which already exist as children of the original "C-C-BB-AA"
// node) — those three get the same "overlapHigher-" prefix to avoid a
// key collision, since a duplicate `key` would silently shadow the
// original in getView()'s .find().
// ---------------------------------------------------------------------

const OVERLAP_ABOVE_DUPLICATE_VIEWS: ViewDef[] = [
  // --- A-A-OA-AA (order 1) ---
  {
    key: "overlapHigher-A-A-OA-AA",
    label: "A-A-OA-AA",
    parentKey: "overlapHigher",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-AA",
    order: 1,
  },
  {
    key: "A-A-OA-AA-CU3L3",
    label: "A-A-OA-AA-CU3L3",
    parentKey: "overlapHigher-A-A-OA-AA",
    kind: "pattern",
    condition: (r) => r.CU3L3,
    order: 0,
  },

  // --- A-C-RA-AA (order 2) ---
  {
    key: "overlapHigher-A-C-RA-AA",
    label: "A-C-RA-AA",
    parentKey: "overlapHigher",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-AA",
    order: 2,
  },
  {
    key: "A-C-RA-AA-CU4L3",
    label: "A-C-RA-AA-CU4L3",
    parentKey: "overlapHigher-A-C-RA-AA",
    kind: "pattern",
    condition: (r) => r.CU4L3,
    order: 0,
  },
  {
    key: "A-C-RA-AA-CU3L3",
    label: "A-C-RA-AA-CU3L3",
    parentKey: "overlapHigher-A-C-RA-AA",
    kind: "pattern",
    condition: (r) => r.CU3L3,
    order: 1,
  },

  // --- A-E-OA-E (order 3) ---
  {
    key: "overlapHigher-A-E-OA-E",
    label: "A-E-OA-E",
    parentKey: "overlapHigher",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-E",
    order: 3,
  },
  {
    key: "A-E-OA-E-U4L4",
    label: "A-E-OA-E-U4L4",
    parentKey: "overlapHigher-A-E-OA-E",
    kind: "pattern",
    condition: (r) => r.U4L4,
    order: 0,
  },

  // --- C-A-C-AA (order 4) ---
  {
    key: "overlapHigher-C-A-C-AA",
    label: "C-A-C-AA",
    parentKey: "overlapHigher",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-AA",
    order: 4,
  },
  {
    key: "C-A-C-AA-CL4U3",
    label: "C-A-C-AA-CL4U3",
    parentKey: "overlapHigher-C-A-C-AA",
    kind: "pattern",
    condition: (r) => r.CL4U3,
    order: 0,
  },
  {
    key: "C-A-C-AA-CU3L2",
    label: "C-A-C-AA-CU3L2",
    parentKey: "overlapHigher-C-A-C-AA",
    kind: "pattern",
    condition: (r) => r.CU3L2,
    order: 1,
  },

  // --- C-A-E-AA (order 5) ---
  {
    key: "overlapHigher-C-A-E-AA",
    label: "C-A-E-AA",
    parentKey: "overlapHigher",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-AA",
    order: 5,
  },
  {
    key: "C-A-E-AA-CU4L4",
    label: "C-A-E-AA-CU4L4",
    parentKey: "overlapHigher-C-A-E-AA",
    kind: "pattern",
    condition: (r) => r.CU4L4,
    order: 0,
  },

  // --- C-C-BB-AA (order 6) ---
  {
    key: "overlapHigher-C-C-BB-AA",
    label: "C-C-BB-AA",
    parentKey: "overlapHigher",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-AA",
    order: 6,
  },
  // Keys prefixed "overlapHigher-" here (not the plain "C-C-BB-AA-CU3L3"
  // style) because the plain key is already taken by the existing child
  // of the ORIGINAL "C-C-BB-AA" node (under "compressed") — see the
  // batch comment above.
  {
    key: "overlapHigher-C-C-BB-AA-CU3L3",
    label: "C-C-BB-AA-CU3L3",
    parentKey: "overlapHigher-C-C-BB-AA",
    kind: "pattern",
    condition: (r) => r.CU3L3,
    order: 0,
  },
  {
    key: "overlapHigher-C-C-BB-AA-CU3L2",
    label: "C-C-BB-AA-CU3L2",
    parentKey: "overlapHigher-C-C-BB-AA",
    kind: "pattern",
    condition: (r) => r.CU3L2,
    order: 1,
  },
  {
    key: "overlapHigher-C-C-BB-AA-CU2L2",
    label: "C-C-BB-AA-CU2L2",
    parentKey: "overlapHigher-C-C-BB-AA",
    kind: "pattern",
    condition: (r) => r.CU2L2,
    order: 2,
  },

  // --- C-C-OB-AA (order 7) ---
  {
    key: "overlapHigher-C-C-OB-AA",
    label: "C-C-OB-AA",
    parentKey: "overlapHigher",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-AA",
    order: 7,
  },
  {
    key: "C-C-OB-AA-CU3L2",
    label: "C-C-OB-AA-CU3L2",
    parentKey: "overlapHigher-C-C-OB-AA",
    kind: "pattern",
    condition: (r) => r.CU3L2,
    order: 0,
  },
];

VIEWS.push(...OVERLAP_ABOVE_DUPLICATE_VIEWS);


// ---------------------------------------------------------------------
// "Include inside InsideCPR" — duplicate branches requested by the user.
//
// These definitions mirror the existing compound patterns under InsideCPR
// without moving or changing their original branches. Internal keys use an
// "INCPR-" prefix to remain unique; labels preserve the requested names.
// The parentKey chain makes every branch require r.InsideCPR as well as
// its own compound and outer-level conditions.
// ---------------------------------------------------------------------

const INSIDE_CPR_DUPLICATE_VIEWS: ViewDef[] = [
  {
    key: "INCPR-C-C-BB-AA",
    label: "C-C-BB-AA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-AA",
    order: 0,
  },
  { key: "INCPR-C-C-BB-AA-CU4L4", label: "C-C-BB-AA-CU4L4", parentKey: "INCPR-C-C-BB-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },
  { key: "INCPR-C-C-BB-AA-CL4U3", label: "C-C-BB-AA-CL4U3", parentKey: "INCPR-C-C-BB-AA", kind: "pattern", condition: (r) => r.CL4U3, order: 1 },
  { key: "INCPR-C-C-BB-AA-CU3L3", label: "C-C-BB-AA-CU3L3", parentKey: "INCPR-C-C-BB-AA", kind: "pattern", condition: (r) => r.CU3L3, order: 2 },
  { key: "INCPR-C-C-BB-AA-CL3U3", label: "C-C-BB-AA-CL3U3", parentKey: "INCPR-C-C-BB-AA", kind: "pattern", condition: (r) => r.CL3U3, order: 3 },
  { key: "INCPR-C-C-BB-AA-CU2L2", label: "C-C-BB-AA-CU2L2", parentKey: "INCPR-C-C-BB-AA", kind: "pattern", condition: (r) => r.CU2L2, order: 4 },
  { key: "INCPR-C-C-BB-AA-CL2U2", label: "C-C-BB-AA-CL2U2", parentKey: "INCPR-C-C-BB-AA", kind: "pattern", condition: (r) => r.CL2U2, order: 5 },

  {
    key: "INCPR-C-B-BB-LB",
    label: "C-B-BB-LB",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-LB",
    order: 1,
  },
  { key: "INCPR-C-B-BB-LB-CL3U3", label: "C-B-BB-LB-CL3U3", parentKey: "INCPR-C-B-BB-LB", kind: "pattern", condition: (r) => r.CL3U3, order: 0 },

  {
    key: "INCPR-B-A-C-SB",
    label: "B-A-C-SB",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-SB",
    order: 2,
  },
  { key: "INCPR-B-A-C-SB-CU4L4", label: "B-A-C-SB-CU4L4", parentKey: "INCPR-B-A-C-SB", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },

  {
    key: "INCPR-B-A-C-C",
    label: "B-A-C-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-C",
    order: 3,
  },
  { key: "INCPR-B-A-C-C-U4L4", label: "B-A-C-C-U4L4", parentKey: "INCPR-B-A-C-C", kind: "pattern", condition: (r) => r.U4L4, order: 0 },
  { key: "INCPR-B-A-C-C-L4U4", label: "B-A-C-C-L4U4", parentKey: "INCPR-B-A-C-C", kind: "pattern", condition: (r) => r.L4U4, order: 1 },
  { key: "INCPR-B-A-C-C-EU4L4", label: "B-A-C-C-EU4L4", parentKey: "INCPR-B-A-C-C", kind: "pattern", condition: (r) => r.EU4L4, order: 2 },
  { key: "INCPR-B-A-C-C-EL4U4", label: "B-A-C-C-EL4U4", parentKey: "INCPR-B-A-C-C", kind: "pattern", condition: (r) => r.EL4U4, order: 3 },

  {
    key: "INCPR-B-C-OB-C",
    label: "B-C-OB-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-C",
    order: 4,
  },
  { key: "INCPR-B-C-OB-C-CL4U4", label: "B-C-OB-C-CL4U4", parentKey: "INCPR-B-C-OB-C", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },

  {
    key: "INCPR-E-E-AA-BB",
    label: "E-E-AA-BB",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 5,
  },
  { key: "INCPR-E-E-AA-BB-EU3L3", label: "E-E-AA-BB-EU3L3", parentKey: "INCPR-E-E-AA-BB", kind: "pattern", condition: (r) => r.EU3L3, order: 0 },

  {
    key: "INCPR-C-C-OB-AA",
    label: "C-C-OB-AA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-AA",
    order: 6,
  },
  { key: "INCPR-C-C-OB-AA-CU4L4", label: "C-C-OB-AA-CU4L4", parentKey: "INCPR-C-C-OB-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },
  { key: "INCPR-C-C-OB-AA-CL4U3", label: "C-C-OB-AA-CL4U3", parentKey: "INCPR-C-C-OB-AA", kind: "pattern", condition: (r) => r.CL4U3, order: 1 },

  {
    key: "INCPR-C-A-C-OA",
    label: "C-A-C-OA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-OA",
    order: 7,
  },
  { key: "INCPR-C-A-C-OA-CU4L4", label: "C-A-C-OA-CU4L4", parentKey: "INCPR-C-A-C-OA", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },
];

VIEWS.push(...INSIDE_CPR_DUPLICATE_VIEWS);

// ---------------------------------------------------------------------
// Step 3, batch 5 (coverage audit) — the ~25-and-then-some standalone
// raw-flag Pattern badges from matchesPatternFlag's switch (lines
// 1904-2086) that were never nested anywhere in BACKTEST_CATEGORIES at
// all. Per getOuterLevelPatternInfo's own doc comment in ScreenerUtils.tsx: these
// are "independent, section-agnostic booleans" that Screener.tsx renders
// as their own second-row badges and Pattern filter buttons, checking
// the raw r.<FLAG> directly — regardless of activeView/left-nav section.
// None of these have a parentKey (they're not reachable through any
// category's tree), but they DO need a VIEWS entry so matchesPatternFlag
// (once rewritten to call passesView) still resolves them instead of
// silently returning false. Cross-checked against the full current
// VIEWS key list first — anything already present (e.g. "EUBL3", "EUTL3",
// "EU2L4", "EUPL2", "U4L3", "EL1U4", "EL1L2", "EL2L1",
// already added earlier with a real parentKey) is deliberately NOT duplicated here.
// ---------------------------------------------------------------------

const OUTER_LEVEL_PATTERNS: ViewDef[] = [
  { key: "EU1L3", label: "EU1L3", kind: "pattern", condition: (r) => r.EU1L3 },
  { key: "EU1L4", label: "EU1L4", kind: "pattern", condition: (r) => r.EU1L4 },
  { key: "EUBL2", label: "EUBL2", kind: "pattern", condition: (r) => r.EUBL2 },
  { key: "CL4U3", label: "CL4U3", kind: "pattern", condition: (r) => r.CL4U3 },
  { key: "L4U4", label: "L4U4", kind: "pattern", condition: (r) => r.L4U4,
      order: 4
},
  { key: "U4L3", label: "U4L3", kind: "pattern", condition: (r) => r.U4L3 },
  { key: "EU3L4", label: "EU3L4", kind: "pattern", condition: (r) => r.EU3L4 },
  { key: "EU4L4", label: "EU4L4", kind: "pattern", condition: (r) => r.EU4L4,
      order: 3
},
  { key: "EL4U4", label: "EL4U4", kind: "pattern", condition: (r) => r.EL4U4 },
  { key: "QU4L4", label: "QU4L4", kind: "pattern", condition: (r) => r.QU4L4 },
  { key: "U4L4", label: "U4L4", kind: "pattern", condition: (r) => r.U4L4 },
  { key: "U3L4", label: "U3L4", kind: "pattern", condition: (r) => r.U3L4 },
  { key: "U2L4", label: "U2L4", kind: "pattern", condition: (r) => r.U2L4 },
  { key: "U1L4", label: "U1L4", kind: "pattern", condition: (r) => r.U1L4 },
  { key: "CU3L2", label: "CU3L2", kind: "pattern", condition: (r) => r.CU3L2 },
  { key: "CU3L3", label: "CU3L3", kind: "pattern", condition: (r) => r.CU3L3,
      order: 1
},
  { key: "CU4L4", label: "CU4L4", kind: "pattern", condition: (r) => r.CU4L4,
      order: 2
},
  { key: "EL2U4", label: "EL2U4", kind: "pattern", condition: (r) => r.EL2U4 },
  { key: "EL3U4", label: "EL3U4", kind: "pattern", condition: (r) => r.EL3U4 },
  { key: "CU4L2", label: "CU4L2", kind: "pattern", condition: (r) => r.CU4L2 },
  { key: "EU3L3", label: "EU3L3", kind: "pattern", condition: (r) => r.EU3L3 },
  { key: "EU1L2", label: "EU1L2", kind: "pattern", condition: (r) => r.EU1L2 },
  { key: "EUBL1", label: "EUBL1", kind: "pattern", condition: (r) => r.EUBL1 },
  { key: "EUPL1", label: "EUPL1", kind: "pattern", condition: (r) => r.EUPL1 },
  { key: "EUTL1", label: "EUTL1", kind: "pattern", condition: (r) => r.EUTL1 },
  { key: "EUPL3", label: "EUPL3", kind: "pattern", condition: (r) => r.EUPL3 },
  { key: "EU2L2", label: "EU2L2", kind: "pattern", condition: (r) => r.EU2L2 },
  { key: "EUTL2", label: "EUTL2", kind: "pattern", condition: (r) => r.EUTL2 },
  { key: "EU1L1", label: "EU1L1", kind: "pattern", condition: (r) => r.EU1L1 },
  { key: "EL1U1", label: "EL1U1", kind: "pattern", condition: (r) => r.EL1U1 },
  { key: "EL1U2", label: "EL1U2", kind: "pattern", condition: (r) => r.EL1U2 },
  { key: "EL1U3", label: "EL1U3", kind: "pattern", condition: (r) => r.EL1U3 },
  { key: "EL2U3", label: "EL2U3", kind: "pattern", condition: (r) => r.EL2U3 },
  { key: "ELTU2", label: "ELTU2", kind: "pattern", condition: (r) => r.ELTU2 },
  { key: "ELBU2", label: "ELBU2", kind: "pattern", condition: (r) => r.ELBU2 },
  { key: "ELTU3", label: "ELTU3", kind: "pattern", condition: (r) => r.ELTU3 },
  { key: "ELPU2", label: "ELPU2", kind: "pattern", condition: (r) => r.ELPU2 },
  { key: "ELPU3", label: "ELPU3", kind: "pattern", condition: (r) => r.ELPU3 },
  { key: "ELBU3", label: "ELBU3", kind: "pattern", condition: (r) => r.ELBU3 },
  { key: "EUTL4", label: "EUTL4", kind: "pattern", condition: (r) => r.EUTL4 },
  { key: "L2U3", label: "L2U3", kind: "pattern", condition: (r) => r.L2U3 },
  { key: "CU2L1", label: "CU2L1", kind: "pattern", condition: (r) => r.CU2L1 },
  { key: "CU2BC", label: "CU2BC", kind: "pattern", condition: (r) => r.CU2BC },
  { key: "CU3L1", label: "CU3L1", kind: "pattern", condition: (r) => r.CU3L1 },
  { key: "U2L3", label: "U2L3", kind: "pattern", condition: (r) => r.U2L3 },
  { key: "ELBU4", label: "ELBU4", kind: "pattern", condition: (r) => r.ELBU4 },
  { key: "CL1U1", label: "CL1U1", kind: "pattern", condition: (r) => r.CL1U1 },
  { key: "CU1L1", label: "CU1L1", kind: "pattern", condition: (r) => r.CU1L1 },
  { key: "CL2U2", label: "CL2U2", kind: "pattern", condition: (r) => r.CL2U2 },
  { key: "CU2L2", label: "CU2L2", kind: "pattern", condition: (r) => r.CU2L2 },
  { key: "CL2U1", label: "CL2U1", kind: "pattern", condition: (r) => r.CL2U1 },
  { key: "CL4U4", label: "CL4U4", kind: "pattern", condition: (r) => r.CL4U4 },
  { key: "EU2L3", label: "EU2L3", kind: "pattern", condition: (r) => r.EU2L3 },
  { key: "CL2UT", label: "CL2UT", kind: "pattern", condition: (r) => r.CL2UT },
  { key: "L3CP", label: "L3CP", kind: "pattern", condition: (r) => r.L3CP },
  { key: "L2CP", label: "L2CP", kind: "pattern", condition: (r) => r.L2CP },
  { key: "L3TC", label: "L3TC", kind: "pattern", condition: (r) => r.L3TC },
];

VIEWS.push(...OUTER_LEVEL_PATTERNS);

/**
 * NOTE on matchesPatternFlag's ORIGINAL `default` case: it wasn't a raw
 * flag lookup at all, but a fallback to the row's own single computed
 * dominant-pattern label (getOuterLevelPatternInfo(r).label) for the six
 * mutually-exclusive primary labels: "eX-Higher" | "eX-Lower" |
 * "cO-Higher" | "cO-Lower" | "Higher" | "Lower". getOuterLevelPatternInfo lives in
 * ScreenerUtils.tsx (not cpr.ts), and importing it here would create a
 * circular dependency (ScreenerUtils.tsx imports passesView from this
 * file). So that fallback stays in ScreenerUtils.tsx's own
 * matchesPatternFlag wrapper instead of being folded into views.ts —
 * see the ScreenerUtils.tsx diff: `export function matchesPatternFlag(r,
 * label) { return getView(label) ? passesView(r, label) :
 * getOuterLevelPatternInfo(r)?.label === label; }`, same fallback order as the
 * original switch (explicit cases first, getOuterLevelPatternInfo default last).
 */

// ---------------------------------------------------------------------
// Deletion pass, step 1 — VIEWS tree reconstruction.
//
// backtest.ts's BACKTEST_CATEGORIES is a NESTED tree (BacktestCategoryDef
// -> BacktestSubCategoryDef[], each of which can itself nest more
// BacktestSubCategoryDef via `patterns`, plus a flat `subPatternKeys:
// string[]` of leaf View keys at each level). VIEWS is FLAT, linked only
// by each ViewDef's own parentKey. Every remaining function that still
// needs the old nested shape (getAttachPointOptions, buildBacktestOptions,
// copyBacktestView, createBacktestView, and both patch.mjs scripts'
// eventual views.ts-targeting rewrite) can be rewritten against this one
// reconstruction instead of walking BACKTEST_CATEGORIES directly.
//
// Root selection: a naive "no parentKey" filter is WRONG here — the ~52
// standalone raw-flag Patterns (OUTER_LEVEL_PATTERNS) and the handful of
// standalone MISC_VIEWS toggles (Price-AbovePDH, the four HB-L1*
// patterns, etc.) also have no parentKey, but were NEVER part of
// BACKTEST_CATEGORIES's tree at all — they're matchesPatternFlag-only
// badges (see that batch's own comment above). The real signal for "this
// is a top-level Category, i.e. a BACKTEST_CATEGORIES root" is
// `kind === "category"`, which every genuine category ("levelsabove",
// "compressed", "R1AbovePR4", "top15gainers", ...) sets and
// nothing else does.
//
// Sibling order: childrenOf() already sorts by `order` (defaulting all
// undefined to 0) via a STABLE sort, so children come back in the same
// relative order they were declared in their batch's const array — which
// is the same order they appeared in BACKTEST_CATEGORIES's own
// subPatternKeys/patterns, since every batch was transcribed in that
// original order. No separate `orderedEntries` concept is needed: a
// ViewDef's `kind` ("pattern" vs "view") already carries the
// arrow-vs-leaf distinction BacktestCategoryDef used two separate arrays
// for, so one interleaved `children` array reproduces the same rendering
// with less structure, not less information.
// ---------------------------------------------------------------------

export interface ViewTreeNode {
  key: string;
  label: string;
  kind: "category" | "pattern" | "view";
  order?: number | undefined;
  children: ViewTreeNode[];
  viewDef?: ViewDef;
}

function buildViewTreeNode(v: ViewDef): ViewTreeNode {
  return {
    key: v.key,
    label: v.label,
    kind: v.kind,
    order: v.order,
    children: childrenOf(v.key).map(buildViewTreeNode),
    viewDef: v,
  };
}

/** Every root Category, each with its full nested Pattern/Subpattern/View tree. */
export function buildViewTree(): ViewTreeNode[] {
  const rootCategories = VIEWS.filter(v => v.kind === "category");
  
  const buildNode = (def: ViewDef): ViewTreeNode => {
    const rawChildren = VIEWS.filter(v => v.parentKey === def.key);
    const children = rawChildren
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .map(buildNode);

    return {
      key: def.key,
      label: def.label,
      kind: def.kind ?? "view",
      order: def.order,
      children,
      viewDef: def,
    };
  };

  return rootCategories
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    .map(buildNode);
}

/**
 * Root-to-node key chain for `key` (inclusive of `key` itself), e.g.
 * ["levelsabove", "A-A-AA-AA", "A-A-AA-AA-U3L3", "A6-U3L3-SLBBG-R4"].
 * Empty array if `key` isn't in VIEWS at all. Mirrors what
 * resolveTopLevelCategoryKey (copy-view's patch.mjs) and
 * findAttachArrayByKey (backtest.ts) each partially recomputed by
 * re-walking BACKTEST_CATEGORIES from scratch — here it's just following
 * parentKey pointers up, no tree search needed.
 */
export function ancestorChain(key: string): ViewDef[] {
  const chain: ViewDef[] = [];
  let curr = getView(key);
  while (curr?.parentKey) {
    const parent = getView(curr.parentKey);
    if (!parent) break;
    chain.unshift(parent);
    curr = parent;
  }
  return chain;
}

/**
 * The top-level Category key that `key` lives under (walks parentKey up
 * to the root) — direct replacement for copy-view's patch.mjs
 * resolveTopLevelCategoryKey, but O(depth) instead of a full
 * BACKTEST_CATEGORIES re-scan, and without needing separate handling for
 * "key IS a top-level category" vs "key is nested under one" (the chain's
 * first element is always the answer either way). Returns undefined for
 * a key with no ancestor chain at all (not in VIEWS) — callers that need
 * the old "fall back to a default bucket" behavior should do that at the
 * call site, same as resolveTopLevelCategoryKey's callers already do.
 */
export function topLevelCategoryOf(key: string): ViewDef | undefined {
  const chain = ancestorChain(key);
  return chain.find(v => v.kind === "category") ?? (getView(key)?.kind === "category" ? getView(key) : undefined);
}
