import type { CPRResult } from "../../cpr";
import type { ViewDef } from "../types";
import { pickOuterLevelPattern } from "../../cpr";
import { passesView } from "../registry";
import { matchesGapBadge } from "../gapBadges";

export const R1ABOVEPR4_S1BELOWPS4_VIEWS: ViewDef[] = [
  // --- the two standalone top-level categories ---
  { key: "R1AbovePR4", label: "ABOVE LEVEL4", kind: "category", condition: (r) => r.R1AbovePR4,
      order: 6
},
  { key: "BPS4", label: "BELOW LEVEL4", kind: "category", condition: (r) => r.S1BelowPS4,
      order: 7
},

  // --- direct Pattern children of "R1AbovePR4" ---
  // No target-graded sub-patterns nested under EUPL2 yet — it's a
  // symbol-list-only scan in the Backtest dropdown.
  // (EL1L2 / EL2L1 used to be direct children of "R1AbovePR4" here; they now
  // live under "A-A-AA-AA" as A-A-AA-AA-EL1L2 / A-A-AA-AA-EL2L1 below.)
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
  { key: "A-E-AA-E-EUTL2", label: "A-E-AA-E-EUTL2", parentKey: "R1AbovePR4-A-E-AA-E", kind: "pattern", condition: (r) => r.EUTL2, order: 2 },
  { key: "A-E-AA-E-EUPL2", label: "A-E-AA-E-EUPL2", parentKey: "R1AbovePR4-A-E-AA-E", kind: "pattern", condition: (r) => r.EUPL2, order: 3 },

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
  { key: "A-A-AA-AA-EUTL4", label: "A-A-AA-AA-EUTL4", parentKey: "R1AbovePR4-A-A-AA-AA", kind: "pattern", condition: (r) => r.EUTL4, order: 10 },
  { key: "A-A-AA-AA-U1L4", label: "A-A-AA-AA-U1L4", parentKey: "R1AbovePR4-A-A-AA-AA", kind: "pattern", condition: (r) => r.U1L4, order: 11 },
  { key: "A-A-AA-AA-None", label: "A-A-AA-AA-None", parentKey: "R1AbovePR4-A-A-AA-AA", kind: "pattern", condition: (r) => !pickOuterLevelPattern(r), order: 12 },
  { key: "A-A-AA-AA-EU1L2", label: "A-A-AA-AA-EU1L2", parentKey: "R1AbovePR4-A-A-AA-AA", kind: "pattern", condition: (r) => r.EU1L2, order: 13 },
  { key: "A-A-AA-AA-EUTL2", label: "A-A-AA-AA-EUTL2", parentKey: "R1AbovePR4-A-A-AA-AA", kind: "pattern", condition: (r) => r.EUTL2, order: 14 },

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
  { key: "A-A-AA-OA-EUBL2", label: "A-A-AA-OA-EUBL2", parentKey: "R1AbovePR4-A-A-AA-OA", kind: "pattern", condition: (r) => r.EUBL2, order: 2 },
  { key: "A-A-AA-OA-EUPL2", label: "A-A-AA-OA-EUPL2", parentKey: "R1AbovePR4-A-A-AA-OA", kind: "pattern", condition: (r) => r.EUPL2, order: 3 },

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
  { key: "A-E-AA-LB-EU1L3", label: "A-E-AA-LB-EU1L3", parentKey: "R1AbovePR4-A-E-AA-LB", kind: "pattern", condition: (r) => r.EU1L3, order: 2 },
  { key: "A-E-AA-LB-EUTL3", label: "A-E-AA-LB-EUTL3", parentKey: "R1AbovePR4-A-E-AA-LB", kind: "pattern", condition: (r) => r.EUTL3, order: 3 },
  { key: "A-E-AA-LB-EU1L4", label: "A-E-AA-LB-EU1L4", parentKey: "R1AbovePR4-A-E-AA-LB", kind: "pattern", condition: (r) => r.EU1L4, order: 4 },
  { key: "A-E-AA-LB-EU1L2", label: "A-E-AA-LB-EU1L2", parentKey: "R1AbovePR4-A-E-AA-LB", kind: "pattern", condition: (r) => r.EU1L2, order: 5 },
  { key: "A-E-AA-LB-EUBL2", label: "A-E-AA-LB-EUBL2", parentKey: "R1AbovePR4-A-E-AA-LB", kind: "pattern", condition: (r) => r.EUBL2, order: 6 },

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
  { key: "E-E-AA-OB-EUBL1", label: "E-E-AA-OB-EUBL1", parentKey: "R1AbovePR4-E-E-AA-OB", kind: "pattern", condition: (r) => r.EUBL1, order: 1 },
  { key: "E-E-AA-OB-EU1L3", label: "E-E-AA-OB-EU1L3", parentKey: "R1AbovePR4-E-E-AA-OB", kind: "pattern", condition: (r) => r.EU1L3, order: 2 },

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

  // --- Pattern "E-A-AA-E" inside "ABOVE LEVEL4" and its subpatterns ---
  {
    key: "R1AbovePR4-E-A-AA-E",
    label: "E-A-AA-E",
    parentKey: "R1AbovePR4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-E",
    order: 12,
  },
  {
    key: "R1AbovePR4-E-A-AA-E-EUBL2",
    label: "E-A-AA-E-EUBL2",
    parentKey: "R1AbovePR4-E-A-AA-E",
    kind: "pattern",
    condition: (r) => r.EUBL2,
    order: 0,
  },

  // --- Compound Pattern children and their Subpatterns under "BPS4" ---
  {
    key: "BPS4-B-B-BB-BB",
    label: "B-B-BB-BB",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-BB",
    order: 0,
  },
  { key: "BPS4-B-B-BB-BB-EL1U4", label: "B-B-BB-BB-EL1U4", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.EL1U4, order: 0 },
  { key: "BPS4-B-B-BB-BB-EL1U3", label: "B-B-BB-BB-EL1U3", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.EL1U3, order: 1 },
  { key: "BPS4-B-B-BB-BB-ELTU2", label: "B-B-BB-BB-ELTU2", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.ELTU2, order: 2 },
  { key: "BPS4-B-B-BB-BB-ELBU3", label: "B-B-BB-BB-ELBU3", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.ELBU3, order: 3 },
  { key: "BPS4-B-B-BB-BB-ELPU3", label: "B-B-BB-BB-ELPU3", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.ELPU3, order: 4 },
  { key: "BPS4-B-B-BB-BB-EL1U2", label: "B-B-BB-BB-EL1U2", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.EL1U2, order: 5 },
  { key: "BPS4-B-B-BB-BB-ELTU3", label: "B-B-BB-BB-ELTU3", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.ELTU3, order: 6 },
  { key: "BPS4-B-B-BB-BB-L1U4", label: "B-B-BB-BB-L1U4", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.L1U4, order: 7 },
  { key: "BPS4-B-B-BB-BB-ELBU4", label: "B-B-BB-BB-ELBU4", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.ELBU4, order: 8 },
  { key: "BPS4-B-B-BB-BB-ELPU2", label: "B-B-BB-BB-ELPU2", parentKey: "BPS4-B-B-BB-BB", kind: "pattern", condition: (r) => r.ELPU2, order: 9 },
  {
    key: "BPS4-B-E-E-BB",
    label: "B-E-E-BB",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-BB",
    order: 1,
  },
  { key: "BPS4-B-E-E-BB-EL1U3", label: "B-E-E-BB-EL1U3", parentKey: "BPS4-B-E-E-BB", kind: "pattern", condition: (r) => r.EL1U3, order: 0 },
  { key: "BPS4-B-E-E-BB-EL1U2", label: "B-E-E-BB-EL1U2", parentKey: "BPS4-B-E-E-BB", kind: "pattern", condition: (r) => r.EL1U2, order: 1 },
  { key: "BPS4-B-E-E-BB-ELBU2", label: "B-E-E-BB-ELBU2", parentKey: "BPS4-B-E-E-BB", kind: "pattern", condition: (r) => r.ELBU2, order: 2 },
  { key: "BPS4-B-E-E-BB-ELTU2", label: "B-E-E-BB-ELTU2", parentKey: "BPS4-B-E-E-BB", kind: "pattern", condition: (r) => r.ELTU2, order: 3 },
  {
    key: "BPS4-B-E-HA-BB",
    label: "B-E-HA-BB",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 2,
  },
  { key: "BPS4-B-E-HA-BB-EL1U3", label: "B-E-HA-BB-EL1U3", parentKey: "BPS4-B-E-HA-BB", kind: "pattern", condition: (r) => r.EL1U3, order: 0 },
  { key: "BPS4-B-E-HA-BB-EL1U2", label: "B-E-HA-BB-EL1U2", parentKey: "BPS4-B-E-HA-BB", kind: "pattern", condition: (r) => r.EL1U2, order: 1 },
  { key: "BPS4-B-E-HA-BB-EL1U4", label: "B-E-HA-BB-EL1U4", parentKey: "BPS4-B-E-HA-BB", kind: "pattern", condition: (r) => r.EL1U4, order: 2 },
  { key: "BPS4-B-E-HA-BB-ELBU3", label: "B-E-HA-BB-ELBU3", parentKey: "BPS4-B-E-HA-BB", kind: "pattern", condition: (r) => r.ELBU3, order: 3 },
  {
    key: "BPS4-E-A-AA-E",
    label: "E-A-AA-E",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-E",
    order: 3,
  },
  { key: "BPS4-E-A-AA-E-EUBL1", label: "E-A-AA-E-EUBL1", parentKey: "BPS4-E-A-AA-E", kind: "pattern", condition: (r) => r.EUBL1, order: 0 },
  {
    key: "BPS4-E-E-AA-BB",
    label: "E-E-AA-BB",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 4,
  },
  { key: "BPS4-E-E-AA-BB-EL1U2", label: "E-E-AA-BB-EL1U2", parentKey: "BPS4-E-E-AA-BB", kind: "pattern", condition: (r) => r.EL1U2, order: 0 },
  { key: "BPS4-E-E-AA-BB-EU1L1", label: "E-E-AA-BB-EU1L1", parentKey: "BPS4-E-E-AA-BB", kind: "pattern", condition: (r) => r.EU1L1, order: 1 },
  { key: "BPS4-E-E-AA-BB-EL1U1", label: "E-E-AA-BB-EL1U1", parentKey: "BPS4-E-E-AA-BB", kind: "pattern", condition: (r) => r.EL1U1, order: 2 },
  { key: "BPS4-E-E-AA-BB-EUBL1", label: "E-E-AA-BB-EUBL1", parentKey: "BPS4-E-E-AA-BB", kind: "pattern", condition: (r) => r.EUBL1, order: 3 },
  { key: "BPS4-E-E-AA-BB-ELBU2", label: "E-E-AA-BB-ELBU2", parentKey: "BPS4-E-E-AA-BB", kind: "pattern", condition: (r) => r.ELBU2, order: 4 },
  { key: "BPS4-E-E-AA-BB-EUTL1", label: "E-E-AA-BB-EUTL1", parentKey: "BPS4-E-E-AA-BB", kind: "pattern", condition: (r) => r.EUTL1, order: 5 },
  { key: "BPS4-E-E-AA-BB-EUPL1", label: "E-E-AA-BB-EUPL1", parentKey: "BPS4-E-E-AA-BB", kind: "pattern", condition: (r) => r.EUPL1, order: 6 },
  { key: "BPS4-E-E-AA-BB-EL1U3", label: "E-E-AA-BB-EL1U3", parentKey: "BPS4-E-E-AA-BB", kind: "pattern", condition: (r) => r.EL1U3, order: 7 },
  { key: "BPS4-E-E-AA-BB-ELPU2", label: "E-E-AA-BB-ELPU2", parentKey: "BPS4-E-E-AA-BB", kind: "pattern", condition: (r) => r.ELPU2, order: 8 },
  {
    key: "BPS4-E-B-E-BB",
    label: "E-B-E-BB",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-BB",
    order: 5,
  },
  { key: "BPS4-E-B-E-BB-ELPU2", label: "E-B-E-BB-ELPU2", parentKey: "BPS4-E-B-E-BB", kind: "pattern", condition: (r) => r.ELPU2, order: 0 },
  { key: "BPS4-E-B-E-BB-EL1U2", label: "E-B-E-BB-EL1U2", parentKey: "BPS4-E-B-E-BB", kind: "pattern", condition: (r) => r.EL1U2, order: 1 },
  { key: "BPS4-E-B-E-BB-EL1U3", label: "E-B-E-BB-EL1U3", parentKey: "BPS4-E-B-E-BB", kind: "pattern", condition: (r) => r.EL1U3, order: 2 },
  { key: "BPS4-E-B-E-BB-ELTU2", label: "E-B-E-BB-ELTU2", parentKey: "BPS4-E-B-E-BB", kind: "pattern", condition: (r) => r.ELTU2, order: 3 },
  { key: "BPS4-E-B-E-BB-ELBU2", label: "E-B-E-BB-ELBU2", parentKey: "BPS4-E-B-E-BB", kind: "pattern", condition: (r) => r.ELBU2, order: 4 },
  {
    key: "BPS4-B-E-C-BB",
    label: "B-E-C-BB",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-BB",
    order: 6,
  },
  { key: "BPS4-B-E-C-BB-EL1U3", label: "B-E-C-BB-EL1U3", parentKey: "BPS4-B-E-C-BB", kind: "pattern", condition: (r) => r.EL1U3, order: 0 },
  {
    key: "BPS4-E-B-RA-BB",
    label: "E-B-RA-BB",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 7,
  },
  { key: "BPS4-E-B-RA-BB-EL1U2", label: "E-B-RA-BB-EL1U2", parentKey: "BPS4-E-B-RA-BB", kind: "pattern", condition: (r) => r.EL1U2, order: 0 },
  { key: "BPS4-E-B-RA-BB-EL1U3", label: "E-B-RA-BB-EL1U3", parentKey: "BPS4-E-B-RA-BB", kind: "pattern", condition: (r) => r.EL1U3, order: 1 },
  { key: "BPS4-E-B-RA-BB-ELTU2", label: "E-B-RA-BB-ELTU2", parentKey: "BPS4-E-B-RA-BB", kind: "pattern", condition: (r) => r.ELTU2, order: 2 },
  { key: "BPS4-E-B-RA-BB-ELBU2", label: "E-B-RA-BB-ELBU2", parentKey: "BPS4-E-B-RA-BB", kind: "pattern", condition: (r) => r.ELBU2, order: 3 },
  {
    key: "BPS4-E-B-C-BB",
    label: "E-B-C-BB",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-BB",
    order: 8,
  },
  { key: "BPS4-E-B-C-BB-EL1U3", label: "E-B-C-BB-EL1U3", parentKey: "BPS4-E-B-C-BB", kind: "pattern", condition: (r) => r.EL1U3, order: 0 },
  {
    key: "BPS4-B-B-OB-BB",
    label: "B-B-OB-BB",
    parentKey: "BPS4",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-BB",
    order: 9,
  },
  { key: "BPS4-B-B-OB-BB-EL1U3", label: "B-B-OB-BB-EL1U3", parentKey: "BPS4-B-B-OB-BB", kind: "pattern", condition: (r) => r.EL1U3, order: 0 },
  { key: "BPS4-B-B-OB-BB-EL1U4", label: "B-B-OB-BB-EL1U4", parentKey: "BPS4-B-B-OB-BB", kind: "pattern", condition: (r) => r.EL1U4, order: 1 },
  { key: "BPS4-B-B-OB-BB-EL1U2", label: "B-B-OB-BB-EL1U2", parentKey: "BPS4-B-B-OB-BB", kind: "pattern", condition: (r) => r.EL1U2, order: 2 },
  { key: "BPS4-B-B-OB-BB-ELBU2", label: "B-B-OB-BB-ELBU2", parentKey: "BPS4-B-B-OB-BB", kind: "pattern", condition: (r) => r.ELBU2, order: 3 },
  { key: "BPS4-B-B-OB-BB-ELBU3", label: "B-B-OB-BB-ELBU3", parentKey: "BPS4-B-B-OB-BB", kind: "pattern", condition: (r) => r.ELBU3, order: 4 },

  // --- leaf Views ---
  {
      key: "BC-A-A-AA-AA-EUTL3-RH-BBGap-S2",
      label: "A6-EUTL3-MegaUltra",
      parentKey: "A-A-AA-AA-EUTL3",
      condition: (r) => passesView(r, "A-A-AA-AA-EUTL3") && matchesGapBadge(r, "RH-BBGap"),
      standalone: true,
      kind: "view",
      direction: "Down",
      targetLabel: "S2",
      getTarget: (r) => r.todayCPR.s2,
      entryLabel: "BC",
      getEntry: (r) => r.todayCPR.bc,
      stoplossLabel: "R1",
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
    targetLabel: "R2",
    getTarget: (r) => r.todayCPR.r2,
    entryLabel: "TC",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1",
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
    targetLabel: "R4",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1",
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
        targetLabel: "S2",
        getTarget: (r) => r.todayCPR.s2,
        entryLabel: "BC",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1",
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
        targetLabel: "S1",
        getTarget: (r) => r.todayCPR.s1,
        entryLabel: "BC",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1",
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
        targetLabel: "R3",
        getTarget: (r) => r.todayCPR.r3,
        entryLabel: "TC",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1",
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
        targetLabel: "R4",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1",
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
        targetLabel: "R4",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1",
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
        targetLabel: "S2",
        getTarget: (r) => r.todayCPR.s2,
        entryLabel: "BC",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1",
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
        targetLabel: "R1",
        getTarget: (r) => r.todayCPR.r1,
        entryLabel: "TC",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1",
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
      },
    {
        key: "TC-A-A-AA-AA-EUBL2-RH-BBGap-R4",
        label: "A6-EUBL2-Large",
        parentKey: "A-A-AA-AA-EUBL2",
        condition: (r) => passesView(r, "A-A-AA-AA-EUBL2") && matchesGapBadge(r, "RH-BBGap"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "R4",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1",
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
        key: "S1-BPS4-B-B-BB-BB-ELPU3-SL-AAGap-S4",
        label: "BL4-pMicroTiny-ToPPL4Fall",
        parentKey: "BPS4-B-B-BB-BB-ELPU3",
        condition: (r) => passesView(r, "BPS4-B-B-BB-BB-ELPU3") && matchesGapBadge(r, "SL-AAGap"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "S4",
        getTarget: (r) => r.todayCPR.s4,
        entryLabel: "S1",
        getEntry: (r) => r.todayCPR.s1,
        stoplossLabel: "R1",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r3",
          "r2"
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
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      }
    ],
      },
    {
        key: "S1-BPS4-B-B-BB-BB-ELBU3-SL-BAGap-S4",
        label: "P-MicroTiny-PPL4Fall",
        parentKey: "BPS4-B-B-BB-BB-ELBU3",
        condition: (r) => passesView(r, "BPS4-B-B-BB-BB-ELBU3") && matchesGapBadge(r, "SL-BAGap"),
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
        "subject": "previous",
        "bandKeys": [
          "r3",
          "r2"
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
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      }
    ],
      },
    {
        key: "BC-A-E-AA-LB-EUTL2-RH-ABGap-S1",
        label: "EUTL2-2Ultra",
        parentKey: "A-E-AA-LB-EUTL2",
        condition: (r) => passesView(r, "A-E-AA-LB-EUTL2") && matchesGapBadge(r, "RH-ABGap"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "S1",
        getTarget: (r) => r.todayCPR.s1,
        entryLabel: "BC",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1",
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
        key: "TC-A-E-AA-LB-EUTL2-RH-ABGap-R2",
        label: "EUTL2-Large",
        parentKey: "A-E-AA-LB-EUTL2",
        condition: (r) => passesView(r, "A-E-AA-LB-EUTL2") && matchesGapBadge(r, "RH-ABGap"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "R2",
        getTarget: (r) => r.todayCPR.r2,
        entryLabel: "TC",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1",
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
          "s1",
          "prevLow"
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
        key: "BC-BPS4-E-A-AA-E-EUBL1-RH-AAGap-PL",
        label: "BPS4-EUBL1-UltraFall",
        parentKey: "BPS4-E-A-AA-E-EUBL1",
        condition: (r) => passesView(r, "BPS4-E-A-AA-E-EUBL1") && matchesGapBadge(r, "RH-AAGap"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "PL",
        getTarget: (r) => r.todayCPR.prevLow,
        entryLabel: "BC",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
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
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "prevLow"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "prevLow",
          "s1"
        ]
      }
    ],
      },
    {
        key: "TC-BPS4-B-B-BB-BB-ELBU3-SL-AAGap-R4",
        label: "pPHAR1-pPAPH-UpR4",
        parentKey: "BPS4-B-B-BB-BB-ELBU3",
        condition: (r) => passesView(r, "BPS4-B-B-BB-BB-ELBU3") && matchesGapBadge(r, "SL-AAGap"),
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
          "r3",
          "r2"
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
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "r2",
          "prevHigh"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "r1"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "s2",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "s3",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "tc"
        ]
      },
      {
        "key": "s4",
        "subject": "previous",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      }
    ],
      },
    {
        key: "PH-A-E-AA-LB-EU1L3-RH-ABGap-R4",
        label: "Large-Mega",
        parentKey: "A-E-AA-LB-EU1L3",
        condition: (r) => passesView(r, "A-E-AA-LB-EU1L3") && matchesGapBadge(r, "RH-ABGap"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "PH (previous day's high)",
        getEntry: (r) => r.todayCPR.prevHigh,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "pivot",
          "bc"
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
          "s1",
          "prevLow"
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
      }
];
