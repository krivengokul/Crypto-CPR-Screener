import type { CPRResult } from "../../cpr";
import type { ViewDef } from "../types";
import { dirTol, computePrevPattern, pickOuterLevelPattern } from "../../cpr";
import { passesView } from "../registry";
import { matchesGapBadge } from "../gapBadges";

export const EXPANDED_VIEWS: ViewDef[] = [
  { key: "A-E-AA-C-EU3L4", label: "A-E-AA-C-EU3L4", parentKey: "A-E-AA-C", kind: "pattern", condition: (r) => r.EU3L4, order: 100 },

  { key: "A-E-AA-E-EU3L3", label: "A-E-AA-E-EU3L3", parentKey: "A-E-AA-E", kind: "pattern", condition: (r) => r.EU3L3, order: 100 },

  { key: "A-E-AA-LB-EU2L3", label: "A-E-AA-LB-EU2L3", parentKey: "A-E-AA-LB", kind: "pattern", condition: (r) => r.EU2L3, order: 100 },

  { key: "A-E-AA-C-EU2L3", label: "A-E-AA-C-EU2L3", parentKey: "A-E-AA-C", kind: "pattern", condition: (r) => r.EU2L3, order: 101 },

  { key: "A-E-AA-C-EU3L3", label: "A-E-AA-C-EU3L3", parentKey: "A-E-AA-C", kind: "pattern", condition: (r) => r.EU3L3, order: 102 },

  { key: "A-E-AA-C-EU4L4", label: "A-E-AA-C-EU4L4", parentKey: "A-E-AA-C", kind: "pattern", condition: (r) => r.EU4L4, order: 103 },

  { key: "A-E-AA-E-EU3L4", label: "A-E-AA-E-EU3L4", parentKey: "A-E-AA-E", kind: "pattern", condition: (r) => r.EU3L4, order: 101 },

  { key: "A-E-AA-E-EU2L3", label: "A-E-AA-E-EU2L3", parentKey: "A-E-AA-E", kind: "pattern", condition: (r) => r.EU2L3, order: 102 },

  { key: "A-E-AA-E-EU2L4", label: "A-E-AA-E-EU2L4", parentKey: "A-E-AA-E", kind: "pattern", condition: (r) => r.EU2L4, order: 103 },

  { key: "A-E-AA-E-None", label: "A-E-AA-E-None", parentKey: "A-E-AA-E", kind: "pattern", condition: (r) => !pickOuterLevelPattern(r), order: 104 },

  { key: "A-E-AA-LB-EU3L4", label: "A-E-AA-LB-EU3L4", parentKey: "A-E-AA-LB", kind: "pattern", condition: (r) => r.EU3L4, order: 101 },

  { key: "A-E-AA-LB-EU2L4", label: "A-E-AA-LB-EU2L4", parentKey: "A-E-AA-LB", kind: "pattern", condition: (r) => r.EU2L4, order: 102 },

  { key: "A-E-AA-LB-EU4L4", label: "A-E-AA-LB-EU4L4", parentKey: "A-E-AA-LB", kind: "pattern", condition: (r) => r.EU4L4, order: 103 },

  { key: "A-E-AA-LB-U3L4", label: "A-E-AA-LB-U3L4", parentKey: "A-E-AA-LB", kind: "pattern", condition: (r) => r.U3L4, order: 104 },

  { key: "A-E-AA-LB-EU3L3", label: "A-E-AA-LB-EU3L3", parentKey: "A-E-AA-LB", kind: "pattern", condition: (r) => r.EU3L3, order: 105 },

  { key: "A-E-AA-LB-U4L4", label: "A-E-AA-LB-U4L4", parentKey: "A-E-AA-LB", kind: "pattern", condition: (r) => r.U4L4, order: 106 },

  // --- B-E-HA-BB's nested Pattern children (LEVEL BELOW) ---
    { key: "B-E-HA-BB-EL3U4", label: "B-E-HA-BB-EL3U4", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 0 },

  // Missing Subpatterns added from PatternStats (B-E-HA-BB, 49 unclassified rows)
    { key: "B-E-HA-BB-EL2U4", label: "B-E-HA-BB-EL2U4", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL2U4, order: 1 },

  { key: "B-E-HA-BB-EL2U3", label: "B-E-HA-BB-EL2U3", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 2 },

  { key: "B-E-HA-BB-EL3U3", label: "B-E-HA-BB-EL3U3", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 3 },

  { key: "B-E-HA-BB-EL4U4", label: "B-E-HA-BB-EL4U4", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 4 },

  // Missing Subpatterns added from PatternStats (B-E-HA-BB, 211 rows, 6 unclassified)
    { key: "B-E-HA-BB-L4U4", label: "B-E-HA-BB-L4U4", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.L4U4, order: 5 },

  { key: "B-E-HA-BB-L3U4", label: "B-E-HA-BB-L3U4", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.L3U4, order: 6 },

  // --- B-E-E-BB's nested Pattern children (LEVEL BELOW) ---
    { key: "B-E-E-BB-EL2U3", label: "B-E-E-BB-EL2U3", parentKey: "B-E-E-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 0 },

  // --- B-E-C-BB's nested Pattern children (LEVEL BELOW) ---
    { key: "B-E-C-BB-EL2U3", label: "B-E-C-BB-EL2U3", parentKey: "B-E-C-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 0 },

  // Missing Subpatterns added from PatternStats (B-E-E-BB, 175 rows, 70 unclassified)
    { key: "B-E-E-BB-EL3U4", label: "B-E-E-BB-EL3U4", parentKey: "B-E-E-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 1 },

  { key: "B-E-E-BB-EL2U4", label: "B-E-E-BB-EL2U4", parentKey: "B-E-E-BB", kind: "pattern", condition: (r) => r.EL2U4, order: 2 },

  { key: "B-E-E-BB-EL3U3", label: "B-E-E-BB-EL3U3", parentKey: "B-E-E-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 3 },

  { key: "B-E-E-BB-EL4U4", label: "B-E-E-BB-EL4U4", parentKey: "B-E-E-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 4 },

  { key: "B-E-OB-BB-EL2U3", label: "B-E-OB-BB-EL2U3", parentKey: "B-E-OB-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 0 },

  { key: "B-E-OA-BB-EL3U3", label: "B-E-OA-BB-EL3U3", parentKey: "B-E-OA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 0 },

  { key: "levelsbelow-B-E-C-BB-EL3U4", label: "B-E-C-BB-EL3U4", parentKey: "B-E-C-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 100 },

  { key: "levelsbelow-B-E-C-BB-EL3U3", label: "B-E-C-BB-EL3U3", parentKey: "B-E-C-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 101 },

  { key: "levelsbelow-B-E-C-BB-EL4U4", label: "B-E-C-BB-EL4U4", parentKey: "B-E-C-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 102 },

  { key: "levelsbelow-B-E-OB-BB-EL3U4", label: "B-E-OB-BB-EL3U4", parentKey: "B-E-OB-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 100 },

  { key: "levelsbelow-B-E-OB-BB-EL2U4", label: "B-E-OB-BB-EL2U4", parentKey: "B-E-OB-BB", kind: "pattern", condition: (r) => r.EL2U4, order: 101 },

  { key: "levelsbelow-B-E-OB-BB-EL4U4", label: "B-E-OB-BB-EL4U4", parentKey: "B-E-OB-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 102 },

  { key: "levelsbelow-B-E-OB-BB-L4U4", label: "B-E-OB-BB-L4U4", parentKey: "B-E-OB-BB", kind: "pattern", condition: (r) => r.L4U4, order: 103 },

  { key: "levelsbelow-B-E-OA-BB-EL2U3", label: "B-E-OA-BB-EL2U3", parentKey: "B-E-OA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 100 },

  // --- "E-E-AA-BB"'s five nested Subpattern children — all target-graded
    // bullish against today's own R2 (U2), per user request. ---
    {
      key: "E-E-AA-BB-EL1U2", label: "E-E-AA-BB-EL1U2", parentKey: "E-E-AA-BB", kind: "pattern",
      condition: (r) => r.EL1U2,
      direction: "Up", targetLabel: "R2", getTarget: (r) => r.todayCPR.r2,
      entryLabel: "TC", getEntry: (r) => r.todayCPR.tc,
      stoplossLabel: "S1", getStoploss: (r) => r.todayCPR.s1,
        order: 0
  },

  {
      key: "E-E-AA-BB-EU1L2", label: "E-E-AA-BB-EU1L2", parentKey: "E-E-AA-BB", kind: "pattern",
      condition: (r) => r.EU1L2,
      direction: "Up", targetLabel: "R2", getTarget: (r) => r.todayCPR.r2,
      entryLabel: "TC", getEntry: (r) => r.todayCPR.tc,
      stoplossLabel: "S1", getStoploss: (r) => r.todayCPR.s1,
        order: 1
  },

  {
      key: "E-E-AA-BB-EU2L2", label: "E-E-AA-BB-EU2L2", parentKey: "E-E-AA-BB", kind: "pattern",
      condition: (r) => r.EU2L2,
      direction: "Up", targetLabel: "R2", getTarget: (r) => r.todayCPR.r2,
      entryLabel: "TC", getEntry: (r) => r.todayCPR.tc,
      stoplossLabel: "S1", getStoploss: (r) => r.todayCPR.s1,
        order: 2
  },

  {
      key: "E-E-AA-BB-EU1L3", label: "E-E-AA-BB-EU1L3", parentKey: "E-E-AA-BB", kind: "pattern",
      condition: (r) => r.EU1L3,
      direction: "Up", targetLabel: "R2", getTarget: (r) => r.todayCPR.r2,
      entryLabel: "TC", getEntry: (r) => r.todayCPR.tc,
      stoplossLabel: "S1", getStoploss: (r) => r.todayCPR.s1,
        order: 3
  },

  {
      key: "E-E-AA-BB-EL1U1", label: "E-E-AA-BB-EL1U1", parentKey: "E-E-AA-BB", kind: "pattern",
      condition: (r) => r.EL1U1,
      direction: "Up", targetLabel: "R2", getTarget: (r) => r.todayCPR.r2,
      entryLabel: "TC", getEntry: (r) => r.todayCPR.tc,
      stoplossLabel: "S1", getStoploss: (r) => r.todayCPR.s1,
        order: 4
  },

  // --- "E-E-AA-BB"'s remaining Subpattern children — the 8 "Missing
    // Subpatterns" chips (95 previously-unclassified rows) from the Filter
    // Scan / Pattern Stats breakdown. Plain pattern entries (no target
    // grading requested), matching the style used for other categories'
    // Subpatterns (e.g. "B-E-HA-BB-EL2U4" in views.ts). ---
    { key: "E-E-AA-BB-EL2U3", label: "E-E-AA-BB-EL2U3", parentKey: "E-E-AA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 5 },

  { key: "E-E-AA-BB-EU2L3", label: "E-E-AA-BB-EU2L3", parentKey: "E-E-AA-BB", kind: "pattern", condition: (r) => r.EU2L3, order: 6 },

  { key: "E-E-AA-BB-EL3U3", label: "E-E-AA-BB-EL3U3", parentKey: "E-E-AA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 7 },

  { key: "E-E-AA-BB-EU3L3", label: "E-E-AA-BB-EU3L3", parentKey: "E-E-AA-BB", kind: "pattern", condition: (r) => r.EU3L3, order: 8 },

  { key: "E-E-AA-BB-EL3U4", label: "E-E-AA-BB-EL3U4", parentKey: "E-E-AA-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 9 },

  { key: "E-E-AA-BB-EL4U4", label: "E-E-AA-BB-EL4U4", parentKey: "E-E-AA-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 10 },

  { key: "E-E-AA-BB-EU3L4", label: "E-E-AA-BB-EU3L4", parentKey: "E-E-AA-BB", kind: "pattern", condition: (r) => r.EU3L4, order: 11 },

  { key: "E-E-AA-BB-EU4L4", label: "E-E-AA-BB-EU4L4", parentKey: "E-E-AA-BB", kind: "pattern", condition: (r) => r.EU4L4, order: 12 },

  { key: "E-E-OA-BB-EL2U3", label: "E-E-OA-BB-EL2U3", parentKey: "E-E-OA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 0 },

  { key: "E-E-OA-BB-EL3U3", label: "E-E-OA-BB-EL3U3", parentKey: "E-E-OA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 1 },

  { key: "E-E-OA-BB-EL3U4", label: "E-E-OA-BB-EL3U4", parentKey: "E-E-OA-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 2 },

  { key: "E-E-AA-OB-EU2L3", label: "E-E-AA-OB-EU2L3", parentKey: "E-E-AA-OB", kind: "pattern", condition: (r) => r.EU2L3, order: 0 },

  { key: "E-E-AA-OB-EU3L3", label: "E-E-AA-OB-EU3L3", parentKey: "E-E-AA-OB", kind: "pattern", condition: (r) => r.EU3L3, order: 1 },

  { key: "E-E-AA-OB-EU2L2", label: "E-E-AA-OB-EU2L2", parentKey: "E-E-AA-OB", kind: "pattern", condition: (r) => r.EU2L2, order: 2 },

  { key: "E-E-AA-OB-EU3L4", label: "E-E-AA-OB-EU3L4", parentKey: "E-E-AA-OB", kind: "pattern", condition: (r) => r.EU3L4, order: 3 },
];
