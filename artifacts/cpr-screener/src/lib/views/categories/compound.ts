import type {
  CPRResult,
  SSRRCategory,
  HHLLCategory,
  SSLLCategory,
  RRHHCategory,
} from "../../cpr";
import type {
  ViewDef,
  SSRRLetter,
  HHLLLetter,
  RRHHSuffix,
  SSLLSuffix,
} from "../types";

export const SSRR_INFO: Record<SSRRLetter, { parentKey: string; category: SSRRCategory }> = {
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
  // A-B-* — removed per user request: all 7 combos (A-B-C-C, A-B-C-LB,
  // A-B-E-E, A-B-E-LB, A-B-RA-C, A-B-RA-E, A-B-RA-LB) showed 0 matched
  // rows under LEVEL ABOVE in PatternStats, along with A-B-C-C's own
  // EU4L4 child and that child's "8AM:pPDHA-SRA-U4+2:2AM" leaf view
  // (both removed below, in LEVELSABOVE_VIEWS).
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

  // B-A-* — removed per user request: all 16 combos (B-A-C-C, B-A-C-SB,
  // B-A-E-E, B-A-E-SB, B-A-HA-C, B-A-HA-E, B-A-HA-SB, B-A-OB-SB,
  // B-A-OB-E, B-A-OB-C, B-A-HA-OB, B-A-HA-OA, B-A-E-OA, B-A-E-OB,
  // B-A-C-OA, B-A-OA-E) removed from LEVEL BELOW. The same-named patterns
  // under the OVA/INCPR/OUT/OVB trees are NOT affected.
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

export const COMPOUND_VIEWS: ViewDef[] = COMPOUND_COMBOS.map(makeCompoundView);

// Real sibling order for the 97 compound combos, extracted from
// backtest.ts's actual BACKTEST_CATEGORIES source (each combo's index
// within its parent SSRR-letter's patterns array) — COMPOUND_VIEWS is
// built via .map(), not authored as individual object literals, so it
// can't carry order the way the hand-authored batches below do; patched
// on after construction instead.
const COMPOUND_ORDER: Record<string, number> = {
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

