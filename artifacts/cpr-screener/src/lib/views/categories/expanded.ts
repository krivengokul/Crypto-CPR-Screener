import type { CPRResult } from "../../cpr";
import type { ViewDef } from "../types";
import { passesView } from "../registry";

export const EXPANDED_VIEWS: ViewDef[] = [
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

  // --- Additional standalone Subpatterns requested directly (not from a
  // single shared parent) — one plain pattern entry per compound parent. ---
  { key: "E-A-AA-E-EU2L3", label: "E-A-AA-E-EU2L3", parentKey: "E-A-AA-E", kind: "pattern", condition: (r) => r.EU2L3, order: 0 },
  { key: "E-A-AA-E-EU3L3", label: "E-A-AA-E-EU3L3", parentKey: "E-A-AA-E", kind: "pattern", condition: (r) => r.EU3L3, order: 1 },
  { key: "E-A-AA-E-EU3L4", label: "E-A-AA-E-EU3L4", parentKey: "E-A-AA-E", kind: "pattern", condition: (r) => r.EU3L4, order: 2 },
  { key: "E-A-AA-E-EU4L4", label: "E-A-AA-E-EU4L4", parentKey: "E-A-AA-E", kind: "pattern", condition: (r) => r.EU4L4, order: 3 },
  { key: "E-A-AA-E-EU2L2", label: "E-A-AA-E-EU2L2", parentKey: "E-A-AA-E", kind: "pattern", condition: (r) => r.EU2L2, order: 4 },
  { key: "E-A-AA-E-U4L4", label: "E-A-AA-E-U4L4", parentKey: "E-A-AA-E", kind: "pattern", condition: (r) => r.U4L4, order: 5 },
  { key: "E-A-AA-C-EU3L4", label: "E-A-AA-C-EU3L4", parentKey: "E-A-AA-C", kind: "pattern", condition: (r) => r.EU3L4, order: 6 },
  { key: "E-A-AA-C-EU2L3", label: "E-A-AA-C-EU2L3", parentKey: "E-A-AA-C", kind: "pattern", condition: (r) => r.EU2L3, order: 7 },
  { key: "E-A-AA-C-EU4L4", label: "E-A-AA-C-EU4L4", parentKey: "E-A-AA-C", kind: "pattern", condition: (r) => r.EU4L4, order: 8 },
  { key: "E-A-AA-C-EU3L3", label: "E-A-AA-C-EU3L3", parentKey: "E-A-AA-C", kind: "pattern", condition: (r) => r.EU3L3, order: 9 },
  { key: "E-A-AA-SB-EU3L4", label: "E-A-AA-SB-EU3L4", parentKey: "E-A-AA-SB", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },
  { key: "E-A-AA-SB-EU2L3", label: "E-A-AA-SB-EU2L3", parentKey: "E-A-AA-SB", kind: "pattern", condition: (r) => r.EU2L3, order: 1 },
  { key: "E-A-AA-SB-U4L4", label: "E-A-AA-SB-U4L4", parentKey: "E-A-AA-SB", kind: "pattern", condition: (r) => r.U4L4, order: 2 },
  { key: "E-A-AA-SB-EU4L4", label: "E-A-AA-SB-EU4L4", parentKey: "E-A-AA-SB", kind: "pattern", condition: (r) => r.EU4L4, order: 3 },
  { key: "E-A-AA-SB-EU3L3", label: "E-A-AA-SB-EU3L3", parentKey: "E-A-AA-SB", kind: "pattern", condition: (r) => r.EU3L3, order: 4 },
  { key: "E-A-AA-SB-EU2L2", label: "E-A-AA-SB-EU2L2", parentKey: "E-A-AA-SB", kind: "pattern", condition: (r) => r.EU2L2, order: 5 },
  { key: "E-A-AA-SB-EU2L4", label: "E-A-AA-SB-EU2L4", parentKey: "E-A-AA-SB", kind: "pattern", condition: (r) => r.EU2L4, order: 6 },
  { key: "E-E-OA-BB-EL2U3", label: "E-E-OA-BB-EL2U3", parentKey: "E-E-OA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 0 },
  { key: "E-E-OA-BB-EL3U3", label: "E-E-OA-BB-EL3U3", parentKey: "E-E-OA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 1 },
  { key: "E-E-OA-BB-EL3U4", label: "E-E-OA-BB-EL3U4", parentKey: "E-E-OA-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 2 },
  { key: "E-E-AA-OB-EU2L3", label: "E-E-AA-OB-EU2L3", parentKey: "E-E-AA-OB", kind: "pattern", condition: (r) => r.EU2L3, order: 0 },
  { key: "E-E-AA-OB-EU3L3", label: "E-E-AA-OB-EU3L3", parentKey: "E-E-AA-OB", kind: "pattern", condition: (r) => r.EU3L3, order: 1 },
  { key: "E-E-AA-OB-EU2L2", label: "E-E-AA-OB-EU2L2", parentKey: "E-E-AA-OB", kind: "pattern", condition: (r) => r.EU2L2, order: 2 },
  { key: "E-E-AA-OB-EU3L4", label: "E-E-AA-OB-EU3L4", parentKey: "E-E-AA-OB", kind: "pattern", condition: (r) => r.EU3L4, order: 3 },
  { key: "E-B-E-BB-EL3U4", label: "E-B-E-BB-EL3U4", parentKey: "E-B-E-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 0 },
  { key: "E-B-E-BB-EL2U3", label: "E-B-E-BB-EL2U3", parentKey: "E-B-E-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 1 },
  { key: "E-B-E-BB-EL4U4", label: "E-B-E-BB-EL4U4", parentKey: "E-B-E-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 2 },
  { key: "E-B-E-BB-EL3U3", label: "E-B-E-BB-EL3U3", parentKey: "E-B-E-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 3 },
  { key: "E-B-C-BB-EL2U3", label: "E-B-C-BB-EL2U3", parentKey: "E-B-C-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 0 },
  { key: "E-B-C-BB-EL3U4", label: "E-B-C-BB-EL3U4", parentKey: "E-B-C-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 1 },
  { key: "E-B-C-BB-EL4U4", label: "E-B-C-BB-EL4U4", parentKey: "E-B-C-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 2 },
  { key: "E-B-RA-BB-EL3U4", label: "E-B-RA-BB-EL3U4", parentKey: "E-B-RA-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 0 },
  { key: "E-B-RA-BB-EL2U3", label: "E-B-RA-BB-EL2U3", parentKey: "E-B-RA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 1 },
  { key: "E-B-RA-BB-EL4U4", label: "E-B-RA-BB-EL4U4", parentKey: "E-B-RA-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 2 },
  { key: "E-B-RA-BB-EL3U3", label: "E-B-RA-BB-EL3U3", parentKey: "E-B-RA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 3 },
  { key: "E-B-RA-BB-L4U4", label: "E-B-RA-BB-L4U4", parentKey: "E-B-RA-BB", kind: "pattern", condition: (r) => r.L4U4, order: 4 },
  { key: "E-A-AA-OB-EU2L3", label: "E-A-AA-OB-EU2L3", parentKey: "E-A-AA-OB", kind: "pattern", condition: (r) => r.EU2L3, order: 0 },
];
