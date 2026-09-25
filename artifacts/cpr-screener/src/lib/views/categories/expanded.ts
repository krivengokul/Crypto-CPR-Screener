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
];
