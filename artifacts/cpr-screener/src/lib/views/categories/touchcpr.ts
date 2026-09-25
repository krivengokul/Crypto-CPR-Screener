import type { CPRResult } from "../../cpr";
import type { ViewDef } from "../types";
import { passesView } from "../registry";

export const OVERLAP_ABOVE_TOUCH_VIEWS: ViewDef[] = [
  // --- A-A-OA-AA (order 1) ---
  {
    key: "OVA-A-A-OA-AA",
    label: "A-A-OA-AA",
    parentKey: "OVA",
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
    parentKey: "OVA-A-A-OA-AA",
    kind: "pattern",
    condition: (r) => r.CU3L3,
    order: 0,
  },

  // --- A-C-RA-AA (order 2) ---
  {
    key: "OVA-A-C-RA-AA",
    label: "A-C-RA-AA",
    parentKey: "OVA",
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
    parentKey: "OVA-A-C-RA-AA",
    kind: "pattern",
    condition: (r) => r.CU4L3,
    order: 0,
  },
  {
    key: "A-C-RA-AA-CU3L3",
    label: "A-C-RA-AA-CU3L3",
    parentKey: "OVA-A-C-RA-AA",
    kind: "pattern",
    condition: (r) => r.CU3L3,
    order: 1,
  },

  // --- A-E-OA-E (order 3) ---
  {
    key: "OVA-A-E-OA-E",
    label: "A-E-OA-E",
    parentKey: "OVA",
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
    parentKey: "OVA-A-E-OA-E",
    kind: "pattern",
    condition: (r) => r.U4L4,
    order: 0,
  },

  // --- C-A-C-AA (order 4) ---
  {
    key: "OVA-C-A-C-AA",
    label: "C-A-C-AA",
    parentKey: "OVA",
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
    parentKey: "OVA-C-A-C-AA",
    kind: "pattern",
    condition: (r) => r.CL4U3,
    order: 0,
  },
  {
    key: "C-A-C-AA-CU3L2",
    label: "C-A-C-AA-CU3L2",
    parentKey: "OVA-C-A-C-AA",
    kind: "pattern",
    condition: (r) => r.CU3L2,
    order: 1,
  },

  // --- C-A-E-AA (order 5) ---
  {
    key: "OVA-C-A-E-AA",
    label: "C-A-E-AA",
    parentKey: "OVA",
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
    parentKey: "OVA-C-A-E-AA",
    kind: "pattern",
    condition: (r) => r.CU4L4,
    order: 0,
  },

  // --- C-C-BB-AA (order 6) ---
  {
    key: "OVA-C-C-BB-AA",
    label: "C-C-BB-AA",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-AA",
    order: 6,
  },
  // Keys prefixed "OVA-" here (not the plain "C-C-BB-AA-CU3L3"
  // style) because the plain key is already taken by the existing child
  // of the ORIGINAL "C-C-BB-AA" node (under "compressed") — see the
  // batch comment above.
  {
    key: "OVA-C-C-BB-AA-CU3L3",
    label: "C-C-BB-AA-CU3L3",
    parentKey: "OVA-C-C-BB-AA",
    kind: "pattern",
    condition: (r) => r.CU3L3,
    order: 0,
  },
  {
    key: "OVA-C-C-BB-AA-CU3L2",
    label: "C-C-BB-AA-CU3L2",
    parentKey: "OVA-C-C-BB-AA",
    kind: "pattern",
    condition: (r) => r.CU3L2,
    order: 1,
  },
  {
    key: "OVA-C-C-BB-AA-CU2L2",
    label: "C-C-BB-AA-CU2L2",
    parentKey: "OVA-C-C-BB-AA",
    kind: "pattern",
    condition: (r) => r.CU2L2,
    order: 2,
  },

  // --- C-C-OB-AA (order 7) ---
  {
    key: "OVA-C-C-OB-AA",
    label: "C-C-OB-AA",
    parentKey: "OVA",
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
    parentKey: "OVA-C-C-OB-AA",
    kind: "pattern",
    condition: (r) => r.CU3L2,
    order: 0,
  },

  // -------------------------------------------------------------------
  // Added from PatternStats "Missing Subpatterns" (Overlap Above
  // unclassified rows) — same duplicate-branch treatment as above: each
  // compound gets a node under "OVA" plus its flag children.
  // Every key here is "OVA-" prefixed so it can never shadow an
  // identically named node on the original levelsabove/compressed branch.
  // -------------------------------------------------------------------


  // --- A-A-OA-OA (order 8) ---
  {
    key: "OVA-A-A-OA-OA",
    label: "A-A-OA-OA",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-OA",
    order: 8,
  },
  { key: "OVA-A-A-OA-OA-U4L4", label: "A-A-OA-OA-U4L4", parentKey: "OVA-A-A-OA-OA", kind: "pattern", condition: (r) => r.U4L4, order: 0 },
  { key: "OVA-A-A-OA-OA-EU4L4", label: "A-A-OA-OA-EU4L4", parentKey: "OVA-A-A-OA-OA", kind: "pattern", condition: (r) => r.EU4L4, order: 1 },
  { key: "OVA-A-A-OA-OA-EU3L4", label: "A-A-OA-OA-EU3L4", parentKey: "OVA-A-A-OA-OA", kind: "pattern", condition: (r) => r.EU3L4, order: 2 },

  // --- A-C-E-AA (order 9) ---
  {
    key: "OVA-A-C-E-AA",
    label: "A-C-E-AA",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-AA",
    order: 9,
  },
  { key: "OVA-A-C-E-AA-CU4L3", label: "A-C-E-AA-CU4L3", parentKey: "OVA-A-C-E-AA", kind: "pattern", condition: (r) => r.CU4L3, order: 0 },

  // --- E-E-AA-BB (order 10) ---
  {
    key: "OVA-E-E-AA-BB",
    label: "E-E-AA-BB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 10,
  },
  { key: "OVA-E-E-AA-BB-EU2L2", label: "E-E-AA-BB-EU2L2", parentKey: "OVA-E-E-AA-BB", kind: "pattern", condition: (r) => r.EU2L2, order: 0 },
  { key: "OVA-E-E-AA-BB-EU2L3", label: "E-E-AA-BB-EU2L3", parentKey: "OVA-E-E-AA-BB", kind: "pattern", condition: (r) => r.EU2L3, order: 1 },

  // --- C-A-HA-AA (order 11) ---
  {
    key: "OVA-C-A-HA-AA",
    label: "C-A-HA-AA",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-AA",
    order: 11,
  },
  { key: "OVA-C-A-HA-AA-CU3L2", label: "C-A-HA-AA-CU3L2", parentKey: "OVA-C-A-HA-AA", kind: "pattern", condition: (r) => r.CU3L2, order: 0 },
  { key: "OVA-C-A-HA-AA-CU3L3", label: "C-A-HA-AA-CU3L3", parentKey: "OVA-C-A-HA-AA", kind: "pattern", condition: (r) => r.CU3L3, order: 1 },

  // --- E-A-AA-E (order 12) ---
  {
    key: "OVA-E-A-AA-E",
    label: "E-A-AA-E",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-E",
    order: 12,
  },
  { key: "OVA-E-A-AA-E-EU4L4", label: "E-A-AA-E-EU4L4", parentKey: "OVA-E-A-AA-E", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },
  { key: "OVA-E-A-AA-E-EU3L3", label: "E-A-AA-E-EU3L3", parentKey: "OVA-E-A-AA-E", kind: "pattern", condition: (r) => r.EU3L3, order: 1 },

  // --- B-A-HA-SB (order 13) ---
  {
    key: "OVA-B-A-HA-SB",
    label: "B-A-HA-SB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-SB",
    order: 13,
  },
  { key: "OVA-B-A-HA-SB-EU4L4", label: "B-A-HA-SB-EU4L4", parentKey: "OVA-B-A-HA-SB", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },
  { key: "OVA-B-A-HA-SB-EL3U4", label: "B-A-HA-SB-EL3U4", parentKey: "OVA-B-A-HA-SB", kind: "pattern", condition: (r) => r.EL3U4, order: 1 },
  { key: "OVA-B-A-HA-SB-CU4L4", label: "B-A-HA-SB-CU4L4", parentKey: "OVA-B-A-HA-SB", kind: "pattern", condition: (r) => r.CU4L4, order: 2 },

  // --- A-B-RA-LB (order 14) ---
  {
    key: "OVA-A-B-RA-LB",
    label: "A-B-RA-LB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-LB",
    order: 14,
  },
  { key: "OVA-A-B-RA-LB-CU4L3", label: "A-B-RA-LB-CU4L3", parentKey: "OVA-A-B-RA-LB", kind: "pattern", condition: (r) => r.CU4L3, order: 0 },

  // --- E-A-AA-SB (order 15) ---
  {
    key: "OVA-E-A-AA-SB",
    label: "E-A-AA-SB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-SB",
    order: 15,
  },
  { key: "OVA-E-A-AA-SB-EU4L4", label: "E-A-AA-SB-EU4L4", parentKey: "OVA-E-A-AA-SB", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },
  { key: "OVA-E-A-AA-SB-EU2L2", label: "E-A-AA-SB-EU2L2", parentKey: "OVA-E-A-AA-SB", kind: "pattern", condition: (r) => r.EU2L2, order: 1 },
  { key: "OVA-E-A-AA-SB-U4L4", label: "E-A-AA-SB-U4L4", parentKey: "OVA-E-A-AA-SB", kind: "pattern", condition: (r) => r.U4L4, order: 2 },
  { key: "OVA-E-A-AA-SB-EU2L3", label: "E-A-AA-SB-EU2L3", parentKey: "OVA-E-A-AA-SB", kind: "pattern", condition: (r) => r.EU2L3, order: 3 },
  { key: "OVA-E-A-AA-SB-EU3L3", label: "E-A-AA-SB-EU3L3", parentKey: "OVA-E-A-AA-SB", kind: "pattern", condition: (r) => r.EU3L3, order: 4 },

  // --- A-A-AA-OA (order 16) ---
  {
    key: "OVA-A-A-AA-OA",
    label: "A-A-AA-OA",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-OA",
    order: 16,
  },
  { key: "OVA-A-A-AA-OA-EU3L4", label: "A-A-AA-OA-EU3L4", parentKey: "OVA-A-A-AA-OA", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },

  // --- E-A-AA-C (order 17) ---
  {
    key: "OVA-E-A-AA-C",
    label: "E-A-AA-C",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-C",
    order: 17,
  },
  { key: "OVA-E-A-AA-C-EU3L4", label: "E-A-AA-C-EU3L4", parentKey: "OVA-E-A-AA-C", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },
  { key: "OVA-E-A-AA-C-EU4L4", label: "E-A-AA-C-EU4L4", parentKey: "OVA-E-A-AA-C", kind: "pattern", condition: (r) => r.EU4L4, order: 1 },

  // --- A-E-AA-E (order 18) ---
  {
    key: "OVA-A-E-AA-E",
    label: "A-E-AA-E",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-E",
    order: 18,
  },
  { key: "OVA-A-E-AA-E-EU3L4", label: "A-E-AA-E-EU3L4", parentKey: "OVA-A-E-AA-E", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },

  // --- E-E-AA-OB (order 19) ---
  {
    key: "OVA-E-E-AA-OB",
    label: "E-E-AA-OB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-OB",
    order: 19,
  },
  { key: "OVA-E-E-AA-OB-EU3L4", label: "E-E-AA-OB-EU3L4", parentKey: "OVA-E-E-AA-OB", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },

  // --- C-A-OA-AA (order 20) ---
  {
    key: "OVA-C-A-OA-AA",
    label: "C-A-OA-AA",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-AA",
    order: 20,
  },
  { key: "OVA-C-A-OA-AA-CU4L4", label: "C-A-OA-AA-CU4L4", parentKey: "OVA-C-A-OA-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },

  // --- B-A-C-SB (order 21) ---
  {
    key: "OVA-B-A-C-SB",
    label: "B-A-C-SB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-SB",
    order: 21,
  },
  { key: "OVA-B-A-C-SB-CU4L4", label: "B-A-C-SB-CU4L4", parentKey: "OVA-B-A-C-SB", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },

  // --- E-E-OA-OB (order 22) ---
  {
    key: "OVA-E-E-OA-OB",
    label: "E-E-OA-OB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-OB",
    order: 22,
  },
  { key: "OVA-E-E-OA-OB-EU3L4", label: "E-E-OA-OB-EU3L4", parentKey: "OVA-E-E-OA-OB", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },

  // Added from PatternStats "Missing Subpatterns" (Overlap Above 22-row
  // unclassified breakdown). Every child key here is "OVA-" prefixed
  // (full compound + flag), matching its parent, so it can never
  // collide with a same-named leaf under a different top-level category
  // (several of these combos are also missing under INCPR/OVB, above).

  // --- A-C-C-AA (order 23) ---
  {
    key: "OVA-A-C-C-AA",
    label: "A-C-C-AA",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-AA",
    order: 23,
  },
  { key: "OVA-A-C-C-AA-CU4L3", label: "A-C-C-AA-CU4L3", parentKey: "OVA-A-C-C-AA", kind: "pattern", condition: (r) => r.CU4L3, order: 0 },
  { key: "OVA-A-C-C-AA-CU4L4", label: "A-C-C-AA-CU4L4", parentKey: "OVA-A-C-C-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 1 },

  // --- A-B-C-LB (order 24) ---
  {
    key: "OVA-A-B-C-LB",
    label: "A-B-C-LB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-LB",
    order: 24,
  },
  { key: "OVA-A-B-C-LB-CU4L3", label: "A-B-C-LB-CU4L3", parentKey: "OVA-A-B-C-LB", kind: "pattern", condition: (r) => r.CU4L3, order: 0 },
  { key: "OVA-A-B-C-LB-CU4L4", label: "A-B-C-LB-CU4L4", parentKey: "OVA-A-B-C-LB", kind: "pattern", condition: (r) => r.CU4L4, order: 1 },

  // --- A-E-AA-LB (order 25) ---
  {
    key: "OVA-A-E-AA-LB",
    label: "A-E-AA-LB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-LB",
    order: 25,
  },
  { key: "OVA-A-E-AA-LB-EU3L4", label: "A-E-AA-LB-EU3L4", parentKey: "OVA-A-E-AA-LB", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },

  // --- A-C-RA-OA (order 26) ---
  {
    key: "OVA-A-C-RA-OA",
    label: "A-C-RA-OA",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-OA",
    order: 26,
  },
  { key: "OVA-A-C-RA-OA-CU4L3", label: "A-C-RA-OA-CU4L3", parentKey: "OVA-A-C-RA-OA", kind: "pattern", condition: (r) => r.CU4L3, order: 0 },

  // Added from PatternStats "Missing Subpatterns" (OVA unclassified breakdown, Sep 2026) —
  // duplicate top nodes + flag leaves, prefixed keys to avoid collisions.
  // --- A-B-RA-E (order 27) ---
  {
    key: "OVA-A-B-RA-E",
    label: "A-B-RA-E",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-E",
    order: 27,
  },
  { key: "OVA-A-B-RA-E-EU4L4", label: "A-B-RA-E-EU4L4", parentKey: "OVA-A-B-RA-E", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },
  // --- A-B-E-LB (order 28) ---
  {
    key: "OVA-A-B-E-LB",
    label: "A-B-E-LB",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-LB",
    order: 28,
  },
  { key: "OVA-A-B-E-LB-CU4L4", label: "A-B-E-LB-CU4L4", parentKey: "OVA-A-B-E-LB", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },
  // --- B-A-HA-E (order 29) ---
  {
    key: "OVA-B-A-HA-E",
    label: "B-A-HA-E",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-E",
    order: 29,
  },
  { key: "OVA-B-A-HA-E-EU4L4", label: "B-A-HA-E-EU4L4", parentKey: "OVA-B-A-HA-E", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },
  // --- E-A-OA-C (order 30) ---
  {
    key: "OVA-E-A-OA-C",
    label: "E-A-OA-C",
    parentKey: "OVA",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-C",
    order: 30,
  },
  { key: "OVA-E-A-OA-C-EU4L4", label: "E-A-OA-C-EU4L4", parentKey: "OVA-E-A-OA-C", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },
];

export const INSIDE_CPR_TOUCH_VIEWS: ViewDef[] = [
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

  // Added from PatternStats "Missing Subpatterns" (INCPR unclassified rows).
  {
    key: "INCPR-C-A-C-AA",
    label: "C-A-C-AA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-AA",
    order: 8,
  },
  { key: "INCPR-C-A-C-AA-CU3L3", label: "C-A-C-AA-CU3L3", parentKey: "INCPR-C-A-C-AA", kind: "pattern", condition: (r) => r.CU3L3, order: 0 },
  { key: "INCPR-C-A-C-AA-CU3L2", label: "C-A-C-AA-CU3L2", parentKey: "INCPR-C-A-C-AA", kind: "pattern", condition: (r) => r.CU3L2, order: 1 },

  {
    key: "INCPR-B-A-OA-C",
    label: "B-A-OA-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-C",
    order: 9,
  },
  { key: "INCPR-B-A-OA-C-EU4L4", label: "B-A-OA-C-EU4L4", parentKey: "INCPR-B-A-OA-C", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },

  {
    key: "INCPR-B-A-HA-SB",
    label: "B-A-HA-SB",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-SB",
    order: 10,
  },
  { key: "INCPR-B-A-HA-SB-CL4U3", label: "B-A-HA-SB-CL4U3", parentKey: "INCPR-B-A-HA-SB", kind: "pattern", condition: (r) => r.CL4U3, order: 0 },
  { key: "INCPR-B-A-HA-SB-EU4L4", label: "B-A-HA-SB-EU4L4", parentKey: "INCPR-B-A-HA-SB", kind: "pattern", condition: (r) => r.EU4L4, order: 1 },

  {
    key: "INCPR-B-A-HA-C",
    label: "B-A-HA-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-C",
    order: 11,
  },
  { key: "INCPR-B-A-HA-C-EU4L4", label: "B-A-HA-C-EU4L4", parentKey: "INCPR-B-A-HA-C", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },

  {
    key: "INCPR-E-A-AA-C",
    label: "E-A-AA-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-C",
    order: 12,
  },
  { key: "INCPR-E-A-AA-C-EU3L4", label: "E-A-AA-C-EU3L4", parentKey: "INCPR-E-A-AA-C", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },

  {
    key: "INCPR-C-C-OB-OA",
    label: "C-C-OB-OA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-OA",
    order: 13,
  },
  { key: "INCPR-C-C-OB-OA-CU4L4", label: "C-C-OB-OA-CU4L4", parentKey: "INCPR-C-C-OB-OA", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },

  {
    key: "INCPR-E-A-OA-C",
    label: "E-A-OA-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-C",
    order: 14,
  },
  { key: "INCPR-E-A-OA-C-EU4L4", label: "E-A-OA-C-EU4L4", parentKey: "INCPR-E-A-OA-C", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },

  // Added from PatternStats "Missing Subpatterns" (INCPR 56-row
  // unclassified breakdown). Every child key here is "INCPR-" prefixed
  // (full compound + flag), matching its parent, so it can never
  // collide with a same-named leaf under a different top-level category.

  // --- A-B-RA-LB (order 15) ---
  {
    key: "INCPR-A-B-RA-LB",
    label: "A-B-RA-LB",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-LB",
    order: 15,
  },
  { key: "INCPR-A-B-RA-LB-CU4L3", label: "A-B-RA-LB-CU4L3", parentKey: "INCPR-A-B-RA-LB", kind: "pattern", condition: (r) => r.CU4L3, order: 0 },
  { key: "INCPR-A-B-RA-LB-CL3U3", label: "A-B-RA-LB-CL3U3", parentKey: "INCPR-A-B-RA-LB", kind: "pattern", condition: (r) => r.CL3U3, order: 1 },
  { key: "INCPR-A-B-RA-LB-CU3L3", label: "A-B-RA-LB-CU3L3", parentKey: "INCPR-A-B-RA-LB", kind: "pattern", condition: (r) => r.CU3L3, order: 2 },
  { key: "INCPR-A-B-RA-LB-CL4U4", label: "A-B-RA-LB-CL4U4", parentKey: "INCPR-A-B-RA-LB", kind: "pattern", condition: (r) => r.CL4U4, order: 3 },

  // --- A-C-RA-AA (order 16) ---
  {
    key: "INCPR-A-C-RA-AA",
    label: "A-C-RA-AA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-AA",
    order: 16,
  },
  { key: "INCPR-A-C-RA-AA-CU3L3", label: "A-C-RA-AA-CU3L3", parentKey: "INCPR-A-C-RA-AA", kind: "pattern", condition: (r) => r.CU3L3, order: 0 },

  // --- A-C-C-AA (order 17) ---
  {
    key: "INCPR-A-C-C-AA",
    label: "A-C-C-AA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-AA",
    order: 17,
  },
  { key: "INCPR-A-C-C-AA-CU4L3", label: "A-C-C-AA-CU4L3", parentKey: "INCPR-A-C-C-AA", kind: "pattern", condition: (r) => r.CU4L3, order: 0 },

  // --- A-B-C-LB (order 18) ---
  {
    key: "INCPR-A-B-C-LB",
    label: "A-B-C-LB",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-LB",
    order: 18,
  },
  { key: "INCPR-A-B-C-LB-CU4L3", label: "A-B-C-LB-CU4L3", parentKey: "INCPR-A-B-C-LB", kind: "pattern", condition: (r) => r.CU4L3, order: 0 },
  { key: "INCPR-A-B-C-LB-CU4L4", label: "A-B-C-LB-CU4L4", parentKey: "INCPR-A-B-C-LB", kind: "pattern", condition: (r) => r.CU4L4, order: 1 },

  // --- C-B-BB-C (order 19) ---
  {
    key: "INCPR-C-B-BB-C",
    label: "C-B-BB-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-C",
    order: 19,
  },
  { key: "INCPR-C-B-BB-C-CL3U3", label: "C-B-BB-C-CL3U3", parentKey: "INCPR-C-B-BB-C", kind: "pattern", condition: (r) => r.CL3U3, order: 0 },
  { key: "INCPR-C-B-BB-C-CL3U2", label: "C-B-BB-C-CL3U2", parentKey: "INCPR-C-B-BB-C", kind: "pattern", condition: (r) => r.CL3U2, order: 1 },

  // --- C-C-BB-OA (order 20) ---
  {
    key: "INCPR-C-C-BB-OA",
    label: "C-C-BB-OA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-OA",
    order: 20,
  },
  { key: "INCPR-C-C-BB-OA-CL3U3", label: "C-C-BB-OA-CL3U3", parentKey: "INCPR-C-C-BB-OA", kind: "pattern", condition: (r) => r.CL3U3, order: 0 },

  // --- A-C-C-OA (order 21) ---
  {
    key: "INCPR-A-C-C-OA",
    label: "A-C-C-OA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-OA",
    order: 21,
  },
  { key: "INCPR-A-C-C-OA-CU4L4", label: "A-C-C-OA-CU4L4", parentKey: "INCPR-A-C-C-OA", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },
  { key: "INCPR-A-C-C-OA-CU4L3", label: "A-C-C-OA-CU4L3", parentKey: "INCPR-A-C-C-OA", kind: "pattern", condition: (r) => r.CU4L3, order: 1 },

  // --- A-B-C-C (order 22) ---
  {
    key: "INCPR-A-B-C-C",
    label: "A-B-C-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-C",
    order: 22,
  },
  { key: "INCPR-A-B-C-C-EU4L4", label: "A-B-C-C-EU4L4", parentKey: "INCPR-A-B-C-C", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },
  { key: "INCPR-A-B-C-C-CU4L3", label: "A-B-C-C-CU4L3", parentKey: "INCPR-A-B-C-C", kind: "pattern", condition: (r) => r.CU4L3, order: 1 },
  { key: "INCPR-A-B-C-C-EL4U4", label: "A-B-C-C-EL4U4", parentKey: "INCPR-A-B-C-C", kind: "pattern", condition: (r) => r.EL4U4, order: 2 },

  // --- A-B-RA-C (order 23) ---
  {
    key: "INCPR-A-B-RA-C",
    label: "A-B-RA-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-C",
    order: 23,
  },
  { key: "INCPR-A-B-RA-C-EU4L4", label: "A-B-RA-C-EU4L4", parentKey: "INCPR-A-B-RA-C", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },

  // Added from PatternStats "Missing Subpatterns" (INCPR unclassified breakdown, Sep 2026) —
  // duplicate top nodes + flag leaves, prefixed keys to avoid collisions.
  // --- C-A-HA-AA (order 24) ---
  {
    key: "INCPR-C-A-HA-AA",
    label: "C-A-HA-AA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-AA",
    order: 24,
  },
  { key: "INCPR-C-A-HA-AA-CU3L2", label: "C-A-HA-AA-CU3L2", parentKey: "INCPR-C-A-HA-AA", kind: "pattern", condition: (r) => r.CU3L2, order: 0 },
  // --- B-C-BB-C (order 25) ---
  {
    key: "INCPR-B-C-BB-C",
    label: "B-C-BB-C",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-C",
    order: 25,
  },
  { key: "INCPR-B-C-BB-C-CL4U3", label: "B-C-BB-C-CL4U3", parentKey: "INCPR-B-C-BB-C", kind: "pattern", condition: (r) => r.CL4U3, order: 0 },
  { key: "INCPR-B-C-BB-C-CL4U4", label: "B-C-BB-C-CL4U4", parentKey: "INCPR-B-C-BB-C", kind: "pattern", condition: (r) => r.CL4U4, order: 1 },
  { key: "INCPR-B-C-BB-C-L4U4", label: "B-C-BB-C-L4U4", parentKey: "INCPR-B-C-BB-C", kind: "pattern", condition: (r) => r.L4U4, order: 2 },
  // --- C-A-OB-AA (order 26) ---
  {
    key: "INCPR-C-A-OB-AA",
    label: "C-A-OB-AA",
    parentKey: "insidecpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-AA",
    order: 26,
  },
  { key: "INCPR-C-A-OB-AA-CU3L2", label: "C-A-OB-AA-CU3L2", parentKey: "INCPR-C-A-OB-AA", kind: "pattern", condition: (r) => r.CU3L2, order: 0 },
];

export const OUTCPR_TOUCH_VIEWS: ViewDef[] = [
  // --- C-C-BB-AA (order 0) ---
  {
    key: "OUT-C-C-BB-AA",
    label: "C-C-BB-AA",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-AA",
    order: 0,
  },
  {
    key: "OUT-C-C-BB-AA-CL3U3",
    label: "C-C-BB-AA-CL3U3",
    parentKey: "OUT-C-C-BB-AA",
    kind: "pattern",
    condition: (r) => r.CL3U3,
    order: 0,
  },

  // Added from PatternStats "Missing Subpatterns" (OutCPR 29-row
  // unclassified breakdown). Child keys reuse the plain "<compound>-<FLAG>"
  // form UNLESS that exact key already exists elsewhere in the file (true
  // for E-E-AA-BB-EU2L2, B-E-HA-BB-EL3U3, B-A-HA-SB-EL3U4 — already
  // children of the ORIGINAL/OVB branches) — those get the "OUT-" prefix
  // instead, same collision rule used throughout this file's duplicate
  // sections.

  // --- E-E-AA-BB (order 1) ---
  {
    key: "OUT-E-E-AA-BB",
    label: "E-E-AA-BB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 1,
  },
  { key: "OUT-E-E-AA-BB-EU2L2", label: "E-E-AA-BB-EU2L2", parentKey: "OUT-E-E-AA-BB", kind: "pattern", condition: (r) => r.EU2L2, order: 0 },
  { key: "E-E-AA-BB-EU3L3", label: "E-E-AA-BB-EU3L3", parentKey: "OUT-E-E-AA-BB", kind: "pattern", condition: (r) => r.EU3L3, order: 1 },

  // --- B-E-HA-BB (order 2) ---
  {
    key: "OUT-B-E-HA-BB",
    label: "B-E-HA-BB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 2,
  },
  { key: "OUT-B-E-HA-BB-EL3U3", label: "B-E-HA-BB-EL3U3", parentKey: "OUT-B-E-HA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 0 },

  // --- B-A-HA-SB (order 3) ---
  {
    key: "OUT-B-A-HA-SB",
    label: "B-A-HA-SB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-SB",
    order: 3,
  },
  { key: "B-A-HA-SB-EU3L3", label: "B-A-HA-SB-EU3L3", parentKey: "OUT-B-A-HA-SB", kind: "pattern", condition: (r) => r.EU3L3, order: 0 },
  { key: "OUT-B-A-HA-SB-EL3U4", label: "B-A-HA-SB-EL3U4", parentKey: "OUT-B-A-HA-SB", kind: "pattern", condition: (r) => r.EL3U4, order: 1 },

  // --- A-B-RA-LB (order 4) ---
  {
    key: "OUT-A-B-RA-LB",
    label: "A-B-RA-LB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-LB",
    order: 4,
  },
  { key: "A-B-RA-LB-EU4L4", label: "A-B-RA-LB-EU4L4", parentKey: "OUT-A-B-RA-LB", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },

  // --- E-E-OA-OB (order 5) ---
  {
    key: "OUT-E-E-OA-OB",
    label: "E-E-OA-OB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-OB",
    order: 5,
  },
  { key: "E-E-OA-OB-EU4L4", label: "E-E-OA-OB-EU4L4", parentKey: "OUT-E-E-OA-OB", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },

  // --- E-E-AA-OB (order 6) ---
  {
    key: "OUT-E-E-AA-OB",
    label: "E-E-AA-OB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-OB",
    order: 6,
  },
  { key: "E-E-AA-OB-EU3L4", label: "E-E-AA-OB-EU3L4", parentKey: "OUT-E-E-AA-OB", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },

  // --- A-B-E-E (order 7) ---
  {
    key: "OUT-A-B-E-E",
    label: "A-B-E-E",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-E",
    order: 7,
  },
  { key: "A-B-E-E-EL4U4", label: "A-B-E-E-EL4U4", parentKey: "OUT-A-B-E-E", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },
  { key: "A-B-E-E-L4U4", label: "A-B-E-E-L4U4", parentKey: "OUT-A-B-E-E", kind: "pattern", condition: (r) => r.L4U4, order: 1 },
  { key: "A-B-E-E-EU4L4", label: "A-B-E-E-EU4L4", parentKey: "OUT-A-B-E-E", kind: "pattern", condition: (r) => r.EU4L4, order: 2 },

  // --- A-E-OA-E (order 8) ---
  {
    key: "OUT-A-E-OA-E",
    label: "A-E-OA-E",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-E",
    order: 8,
  },
  { key: "A-E-OA-E-EU4L4", label: "A-E-OA-E-EU4L4", parentKey: "OUT-A-E-OA-E", kind: "pattern", condition: (r) => r.EU4L4, order: 0 },

  // --- B-A-E-E (order 9) ---
  {
    key: "OUT-B-A-E-E",
    label: "B-A-E-E",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-E",
    order: 9,
  },
  { key: "B-A-E-E-L4U4", label: "B-A-E-E-L4U4", parentKey: "OUT-B-A-E-E", kind: "pattern", condition: (r) => r.L4U4, order: 0 },
  { key: "B-A-E-E-CL4U4", label: "B-A-E-E-CL4U4", parentKey: "OUT-B-A-E-E", kind: "pattern", condition: (r) => r.CL4U4, order: 1 },

  // --- B-A-E-SB (order 10) ---
  {
    key: "OUT-B-A-E-SB",
    label: "B-A-E-SB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-SB",
    order: 10,
  },
  { key: "B-A-E-SB-EL4U4", label: "B-A-E-SB-EL4U4", parentKey: "OUT-B-A-E-SB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },

  // Added from PatternStats "Missing Subpatterns" (OUT unclassified breakdown, Sep 2026) —
  // duplicate top nodes + flag leaves, prefixed keys to avoid collisions.
  // --- E-B-E-BB (order 11) ---
  {
    key: "OUT-E-B-E-BB",
    label: "E-B-E-BB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-BB",
    order: 11,
  },
  { key: "OUT-E-B-E-BB-EU3L4", label: "E-B-E-BB-EU3L4", parentKey: "OUT-E-B-E-BB", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },
  // --- A-B-E-LB (order 12) ---
  {
    key: "OUT-A-B-E-LB",
    label: "A-B-E-LB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-LB",
    order: 12,
  },
  { key: "OUT-A-B-E-LB-EL4U4", label: "A-B-E-LB-EL4U4", parentKey: "OUT-A-B-E-LB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },
  // --- C-C-OB-AA (order 13) ---
  {
    key: "OUT-C-C-OB-AA",
    label: "C-C-OB-AA",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-AA",
    order: 13,
  },
  { key: "OUT-C-C-OB-AA-CU3L3", label: "C-C-OB-AA-CU3L3", parentKey: "OUT-C-C-OB-AA", kind: "pattern", condition: (r) => r.CU3L3, order: 0 },
  // --- E-E-OA-BB (order 14) ---
  {
    key: "OUT-E-E-OA-BB",
    label: "E-E-OA-BB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 14,
  },
  { key: "OUT-E-E-OA-BB-EL3U3", label: "E-E-OA-BB-EL3U3", parentKey: "OUT-E-E-OA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 0 },
  // --- E-B-RA-BB (order 15) ---
  {
    key: "OUT-E-B-RA-BB",
    label: "E-B-RA-BB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 15,
  },
  { key: "OUT-E-B-RA-BB-EL4U4", label: "E-B-RA-BB-EL4U4", parentKey: "OUT-E-B-RA-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },
  // --- A-C-E-AA (order 16) ---
  {
    key: "OUT-A-C-E-AA",
    label: "A-C-E-AA",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-AA",
    order: 16,
  },
  { key: "OUT-A-C-E-AA-CU4L4", label: "A-C-E-AA-CU4L4", parentKey: "OUT-A-C-E-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 0 },
  // --- C-C-OB-OA (order 17) ---
  {
    key: "OUT-C-C-OB-OA",
    label: "C-C-OB-OA",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-OA",
    order: 17,
  },
  { key: "OUT-C-C-OB-OA-CL4U4", label: "C-C-OB-OA-CL4U4", parentKey: "OUT-C-C-OB-OA", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },
  { key: "OUT-C-C-OB-OA-CU4L4", label: "C-C-OB-OA-CU4L4", parentKey: "OUT-C-C-OB-OA", kind: "pattern", condition: (r) => r.CU4L4, order: 1 },
  // --- A-B-RA-E (order 18) ---
  {
    key: "OUT-A-B-RA-E",
    label: "A-B-RA-E",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-E",
    order: 18,
  },
  { key: "OUT-A-B-RA-E-EU3L4", label: "A-B-RA-E-EU3L4", parentKey: "OUT-A-B-RA-E", kind: "pattern", condition: (r) => r.EU3L4, order: 0 },
  { key: "OUT-A-B-RA-E-CL4U4", label: "A-B-RA-E-CL4U4", parentKey: "OUT-A-B-RA-E", kind: "pattern", condition: (r) => r.CL4U4, order: 1 },
  // --- E-A-AA-E (order 19) ---
  {
    key: "OUT-E-A-AA-E",
    label: "E-A-AA-E",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-E",
    order: 19,
  },
  { key: "OUT-E-A-AA-E-EU3L3", label: "E-A-AA-E-EU3L3", parentKey: "OUT-E-A-AA-E", kind: "pattern", condition: (r) => r.EU3L3, order: 0 },
  // --- C-B-BB-E (order 20) ---
  {
    key: "OUT-C-B-BB-E",
    label: "C-B-BB-E",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-E",
    order: 20,
  },
  { key: "OUT-C-B-BB-E-CL4U4", label: "C-B-BB-E-CL4U4", parentKey: "OUT-C-B-BB-E", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },
  // --- A-E-AA-E (order 21) ---
  {
    key: "OUT-A-E-AA-E",
    label: "A-E-AA-E",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-E",
    order: 21,
  },
  { key: "OUT-A-E-AA-E-EU2L3", label: "A-E-AA-E-EU2L3", parentKey: "OUT-A-E-AA-E", kind: "pattern", condition: (r) => r.EU2L3, order: 0 },
  // --- E-B-E-OB (order 22) ---
  {
    key: "OUT-E-B-E-OB",
    label: "E-B-E-OB",
    parentKey: "outcpr",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-OB",
    order: 22,
  },
  { key: "OUT-E-B-E-OB-EL4U4", label: "E-B-E-OB-EL4U4", parentKey: "OUT-E-B-E-OB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },
];

export const OVERLAP_BELOW_TOUCH_VIEWS: ViewDef[] = [
  // --- C-B-BB-LB (order 0) ---
  {
    key: "OVB-C-B-BB-LB",
    label: "C-B-BB-LB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-LB",
    order: 0,
  },
  {
    key: "OVB-C-B-BB-LB-CL4U4",
    label: "C-B-BB-LB-CL4U4",
    parentKey: "OVB-C-B-BB-LB",
    kind: "pattern",
    condition: (r) => r.CL4U4,
    order: 0,
  },

  // Added from PatternStats "Missing Subpatterns" (Overlap Below 101-row
  // unclassified breakdown) — one duplicate top node per distinct
  // SSRR-HHLL-RRHH-SSLL compound shown in that breakdown, each with the
  // specific raw-flag leaves that showed up under it. Child keys reuse the
  // plain "<compound>-<FLAG>" form UNLESS that exact key already exists as
  // a child of the ORIGINAL node (true for C-C-BB-AA's four flags and
  // E-E-AA-BB's EU2L2, all already children of their original
  // compressed/expanded-parented nodes) — those get the "OVB-" prefix
  // instead, same collision rule as OVERLAP_ABOVE_TOUCH_VIEWS above.

  // --- B-E-HA-BB (order 1) ---
  {
    key: "OVB-B-E-HA-BB",
    label: "B-E-HA-BB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 1,
  },
  { key: "OVB-B-E-HA-BB-EL3U4", label: "B-E-HA-BB-EL3U4", parentKey: "OVB-B-E-HA-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 0 },
  { key: "B-E-HA-BB-EL2U3", label: "B-E-HA-BB-EL2U3", parentKey: "OVB-B-E-HA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 1 },
  { key: "B-E-HA-BB-EL3U3", label: "B-E-HA-BB-EL3U3", parentKey: "OVB-B-E-HA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 2 },
  { key: "B-E-HA-BB-EU2L2", label: "B-E-HA-BB-EU2L2", parentKey: "OVB-B-E-HA-BB", kind: "pattern", condition: (r) => r.EU2L2, order: 3 },
  { key: "B-E-HA-BB-L4U4", label: "B-E-HA-BB-L4U4", parentKey: "OVB-B-E-HA-BB", kind: "pattern", condition: (r) => r.L4U4, order: 4 },
  { key: "B-E-HA-BB-L3U4", label: "B-E-HA-BB-L3U4", parentKey: "OVB-B-E-HA-BB", kind: "pattern", condition: (r) => r.L3U4, order: 5 },

  // --- B-E-E-BB (order 2) ---
  {
    key: "OVB-B-E-E-BB",
    label: "B-E-E-BB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-BB",
    order: 2,
  },
  { key: "B-E-E-BB-EL3U4", label: "B-E-E-BB-EL3U4", parentKey: "OVB-B-E-E-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 0 },
  { key: "B-E-E-BB-EL2U3", label: "B-E-E-BB-EL2U3", parentKey: "OVB-B-E-E-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 1 },
  { key: "B-E-E-BB-EL3U3", label: "B-E-E-BB-EL3U3", parentKey: "OVB-B-E-E-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 2 },
  { key: "B-E-E-BB-EL2U4", label: "B-E-E-BB-EL2U4", parentKey: "OVB-B-E-E-BB", kind: "pattern", condition: (r) => r.EL2U4, order: 3 },

  // --- B-A-HA-SB (order 3) ---
  {
    key: "OVB-B-A-HA-SB",
    label: "B-A-HA-SB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-SB",
    order: 3,
  },
  { key: "B-A-HA-SB-EL4U4", label: "B-A-HA-SB-EL4U4", parentKey: "OVB-B-A-HA-SB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },
  { key: "B-A-HA-SB-L4U4", label: "B-A-HA-SB-L4U4", parentKey: "OVB-B-A-HA-SB", kind: "pattern", condition: (r) => r.L4U4, order: 1 },
  { key: "B-A-HA-SB-CL4U3", label: "B-A-HA-SB-CL4U3", parentKey: "OVB-B-A-HA-SB", kind: "pattern", condition: (r) => r.CL4U3, order: 2 },
  { key: "B-A-HA-SB-EL3U4", label: "B-A-HA-SB-EL3U4", parentKey: "OVB-B-A-HA-SB", kind: "pattern", condition: (r) => r.EL3U4, order: 3 },
  { key: "B-A-HA-SB-L3U4", label: "B-A-HA-SB-L3U4", parentKey: "OVB-B-A-HA-SB", kind: "pattern", condition: (r) => r.L3U4, order: 4 },

  // --- E-E-AA-BB (order 4) ---
  {
    key: "OVB-E-E-AA-BB",
    label: "E-E-AA-BB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-AA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 4,
  },
  // "EU2L2" prefixed — plain "E-E-AA-BB-EU2L2" already exists as a child
  // of the ORIGINAL "E-E-AA-BB" node (expanded).
  { key: "OVB-E-E-AA-BB-EU2L2", label: "E-E-AA-BB-EU2L2", parentKey: "OVB-E-E-AA-BB", kind: "pattern", condition: (r) => r.EU2L2, order: 0 },
  { key: "E-E-AA-BB-EL3U3", label: "E-E-AA-BB-EL3U3", parentKey: "OVB-E-E-AA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 1 },
  { key: "E-E-AA-BB-EL2U3", label: "E-E-AA-BB-EL2U3", parentKey: "OVB-E-E-AA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 2 },

  // --- B-E-C-BB (order 5) ---
  {
    key: "OVB-B-E-C-BB",
    label: "B-E-C-BB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-BB",
    order: 5,
  },
  { key: "B-E-C-BB-L4U4", label: "B-E-C-BB-L4U4", parentKey: "OVB-B-E-C-BB", kind: "pattern", condition: (r) => r.L4U4, order: 0 },
  { key: "B-E-C-BB-EL3U3", label: "B-E-C-BB-EL3U3", parentKey: "OVB-B-E-C-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 1 },
  { key: "B-E-C-BB-EL3U4", label: "B-E-C-BB-EL3U4", parentKey: "OVB-B-E-C-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 2 },

  // --- B-C-BB-SB (order 6) ---
  {
    key: "OVB-B-C-BB-SB",
    label: "B-C-BB-SB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-SB",
    order: 6,
  },
  { key: "B-C-BB-SB-CL4U3", label: "B-C-BB-SB-CL4U3", parentKey: "OVB-B-C-BB-SB", kind: "pattern", condition: (r) => r.CL4U3, order: 0 },
  { key: "B-C-BB-SB-L4U3", label: "B-C-BB-SB-L4U3", parentKey: "OVB-B-C-BB-SB", kind: "pattern", condition: (r) => r.L4U3, order: 1 },

  // --- B-A-HA-C (order 7) ---
  {
    key: "OVB-B-A-HA-C",
    label: "B-A-HA-C",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-C",
    order: 7,
  },
  { key: "B-A-HA-C-CL4U4", label: "B-A-HA-C-CL4U4", parentKey: "OVB-B-A-HA-C", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },

  // --- E-B-E-BB (order 8) ---
  {
    key: "OVB-E-B-E-BB",
    label: "E-B-E-BB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-BB",
    order: 8,
  },
  { key: "E-B-E-BB-EL3U3", label: "E-B-E-BB-EL3U3", parentKey: "OVB-E-B-E-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 0 },

  // --- E-E-OA-BB (order 9) ---
  {
    key: "OVB-E-E-OA-BB",
    label: "E-E-OA-BB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 9,
  },
  { key: "E-E-OA-BB-EL2U3", label: "E-E-OA-BB-EL2U3", parentKey: "OVB-E-E-OA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 0 },
  { key: "E-E-OA-BB-EL3U4", label: "E-E-OA-BB-EL3U4", parentKey: "OVB-E-E-OA-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 1 },

  // --- C-C-BB-AA (order 10) ---
  {
    key: "OVB-C-C-BB-AA",
    label: "C-C-BB-AA",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-AA",
    order: 10,
  },
  // All four prefixed — plain keys already exist as children of the
  // ORIGINAL "C-C-BB-AA" node (compressed).
  { key: "OVB-C-C-BB-AA-CL4U4", label: "C-C-BB-AA-CL4U4", parentKey: "OVB-C-C-BB-AA", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },
  { key: "OVB-C-C-BB-AA-CL3U3", label: "C-C-BB-AA-CL3U3", parentKey: "OVB-C-C-BB-AA", kind: "pattern", condition: (r) => r.CL3U3, order: 1 },
  { key: "OVB-C-C-BB-AA-CL2U2", label: "C-C-BB-AA-CL2U2", parentKey: "OVB-C-C-BB-AA", kind: "pattern", condition: (r) => r.CL2U2, order: 2 },
  { key: "OVB-C-C-BB-AA-CL3U2", label: "C-C-BB-AA-CL3U2", parentKey: "OVB-C-C-BB-AA", kind: "pattern", condition: (r) => r.CL3U2, order: 3 },

  // --- E-B-RA-BB (order 11) ---
  {
    key: "OVB-E-B-RA-BB",
    label: "E-B-RA-BB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 11,
  },
  { key: "E-B-RA-BB-EL4U4", label: "E-B-RA-BB-EL4U4", parentKey: "OVB-E-B-RA-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },

  // --- A-B-RA-LB (order 12) ---
  {
    key: "OVB-A-B-RA-LB",
    label: "A-B-RA-LB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-LB",
    order: 12,
  },
  { key: "A-B-RA-LB-CL4U4", label: "A-B-RA-LB-CL4U4", parentKey: "OVB-A-B-RA-LB", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },

  // --- B-C-BB-C (order 13) ---
  {
    key: "OVB-B-C-BB-C",
    label: "B-C-BB-C",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-C",
    order: 13,
  },
  { key: "B-C-BB-C-CL4U3", label: "B-C-BB-C-CL4U3", parentKey: "OVB-B-C-BB-C", kind: "pattern", condition: (r) => r.CL4U3, order: 0 },

  // --- B-E-OA-BB (order 14) ---
  {
    key: "OVB-B-E-OA-BB",
    label: "B-E-OA-BB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-BB",
    order: 14,
  },
  { key: "B-E-OA-BB-EL2U3", label: "B-E-OA-BB-EL2U3", parentKey: "OVB-B-E-OA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 0 },

  // --- B-A-E-SB (order 15) ---
  {
    key: "OVB-B-A-E-SB",
    label: "B-A-E-SB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-SB",
    order: 15,
  },
  { key: "B-A-E-SB-L4U3", label: "B-A-E-SB-L4U3", parentKey: "OVB-B-A-E-SB", kind: "pattern", condition: (r) => r.L4U3, order: 0 },

  // --- E-B-E-OB (order 16) ---
  {
    key: "OVB-E-B-E-OB",
    label: "E-B-E-OB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-OB",
    order: 16,
  },
  { key: "E-B-E-OB-EL4U4", label: "E-B-E-OB-EL4U4", parentKey: "OVB-E-B-E-OB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },

  // --- B-B-OB-OB (order 17) ---
  {
    key: "OVB-B-B-OB-OB",
    label: "B-B-OB-OB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-OB",
    order: 17,
  },
  { key: "B-B-OB-OB-L4U4", label: "B-B-OB-OB-L4U4", parentKey: "OVB-B-B-OB-OB", kind: "pattern", condition: (r) => r.L4U4, order: 0 },

  // --- C-B-OB-E (order 18) ---
  {
    key: "OVB-C-B-OB-E",
    label: "C-B-OB-E",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-E",
    order: 18,
  },
  { key: "C-B-OB-E-CL4U4", label: "C-B-OB-E-CL4U4", parentKey: "OVB-C-B-OB-E", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },

  // --- B-B-OB-BB (order 19) ---
  {
    key: "OVB-B-B-OB-BB",
    label: "B-B-OB-BB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-BB",
    order: 19,
  },
  { key: "B-B-OB-BB-EL4U4", label: "B-B-OB-BB-EL4U4", parentKey: "OVB-B-B-OB-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },

  // --- C-C-OB-OA (order 20) ---
  {
    key: "OVB-C-C-OB-OA",
    label: "C-C-OB-OA",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-OB" &&
      r.SSLLCategory === "SSLL-OA",
    order: 20,
  },
  { key: "C-C-OB-OA-CL4U3", label: "C-C-OB-OA-CL4U3", parentKey: "OVB-C-C-OB-OA", kind: "pattern", condition: (r) => r.CL4U3, order: 0 },

  // Added from PatternStats "Missing Subpatterns" (Overlap Below 17-row
  // unclassified breakdown). Every child key here is "OVB-" prefixed
  // (full compound + flag), matching its parent, so it can never
  // collide with a same-named leaf under a different top-level category
  // (several of these combos are also missing under INCPR/OVA, above).

  // --- C-B-BB-C (order 21) ---
  {
    key: "OVB-C-B-BB-C",
    label: "C-B-BB-C",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-C",
    order: 21,
  },
  { key: "OVB-C-B-BB-C-CL3U3", label: "C-B-BB-C-CL3U3", parentKey: "OVB-C-B-BB-C", kind: "pattern", condition: (r) => r.CL3U3, order: 0 },
  { key: "OVB-C-B-BB-C-CU4L3", label: "C-B-BB-C-CU4L3", parentKey: "OVB-C-B-BB-C", kind: "pattern", condition: (r) => r.CU4L3, order: 1 },
  { key: "OVB-C-B-BB-C-CL3U2", label: "C-B-BB-C-CL3U2", parentKey: "OVB-C-B-BB-C", kind: "pattern", condition: (r) => r.CL3U2, order: 2 },
  { key: "OVB-C-B-BB-C-CL4U4", label: "C-B-BB-C-CL4U4", parentKey: "OVB-C-B-BB-C", kind: "pattern", condition: (r) => r.CL4U4, order: 3 },

  // --- C-C-BB-OA (order 22) ---
  {
    key: "OVB-C-C-BB-OA",
    label: "C-C-BB-OA",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-C" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-OA",
    order: 22,
  },
  { key: "OVB-C-C-BB-OA-CL3U3", label: "C-C-BB-OA-CL3U3", parentKey: "OVB-C-C-BB-OA", kind: "pattern", condition: (r) => r.CL3U3, order: 0 },

  // --- A-B-RA-C (order 23) ---
  {
    key: "OVB-A-B-RA-C",
    label: "A-B-RA-C",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-C",
    order: 23,
  },
  { key: "OVB-A-B-RA-C-L4U4", label: "A-B-RA-C-L4U4", parentKey: "OVB-A-B-RA-C", kind: "pattern", condition: (r) => r.L4U4, order: 0 },

  // --- A-B-RA-E (order 24) ---
  {
    key: "OVB-A-B-RA-E",
    label: "A-B-RA-E",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-RA" &&
      r.SSLLCategory === "SSLL-E",
    order: 24,
  },
  { key: "OVB-A-B-RA-E-CL4U4", label: "A-B-RA-E-CL4U4", parentKey: "OVB-A-B-RA-E", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },

  // Added from PatternStats "Missing Subpatterns" (OVB unclassified breakdown, Sep 2026) —
  // duplicate top nodes + flag leaves, prefixed keys to avoid collisions.
  // --- B-B-BB-OB (order 25) ---
  {
    key: "OVB-B-B-BB-OB",
    label: "B-B-BB-OB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-OB",
    order: 25,
  },
  { key: "OVB-B-B-BB-OB-CL4U4", label: "B-B-BB-OB-CL4U4", parentKey: "OVB-B-B-BB-OB", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },
  // --- B-A-HA-E (order 26) ---
  {
    key: "OVB-B-A-HA-E",
    label: "B-A-HA-E",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-A" &&
      r.RRHHCategory === "RRHH-HA" &&
      r.SSLLCategory === "SSLL-E",
    order: 26,
  },
  { key: "OVB-B-A-HA-E-CL4U4", label: "B-A-HA-E-CL4U4", parentKey: "OVB-B-A-HA-E", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },
  // --- A-B-E-LB (order 27) ---
  {
    key: "OVB-A-B-E-LB",
    label: "A-B-E-LB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-A" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-E" &&
      r.SSLLCategory === "SSLL-LB",
    order: 27,
  },
  { key: "OVB-A-B-E-LB-EL4U4", label: "A-B-E-LB-EL4U4", parentKey: "OVB-A-B-E-LB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },
  // --- C-B-BB-E (order 28) ---
  {
    key: "OVB-C-B-BB-E",
    label: "C-B-BB-E",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-C" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-BB" &&
      r.SSLLCategory === "SSLL-E",
    order: 28,
  },
  { key: "OVB-C-B-BB-E-CL4U4", label: "C-B-BB-E-CL4U4", parentKey: "OVB-C-B-BB-E", kind: "pattern", condition: (r) => r.CL4U4, order: 0 },
  // --- B-B-C-OB (order 29) ---
  {
    key: "OVB-B-B-C-OB",
    label: "B-B-C-OB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-B" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-OB",
    order: 29,
  },
  { key: "OVB-B-B-C-OB-EL4U4", label: "B-B-C-OB-EL4U4", parentKey: "OVB-B-B-C-OB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },
  // --- B-E-C-OB (order 30) ---
  {
    key: "OVB-B-E-C-OB",
    label: "B-E-C-OB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-B" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-C" &&
      r.SSLLCategory === "SSLL-OB",
    order: 30,
  },
  { key: "OVB-B-E-C-OB-EL4U4", label: "B-E-C-OB-EL4U4", parentKey: "OVB-B-E-C-OB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },
  // --- E-E-OA-OB (order 31) ---
  {
    key: "OVB-E-E-OA-OB",
    label: "E-E-OA-OB",
    parentKey: "overlapLower",
    kind: "pattern",
    condition: (r) =>
      r.SSRRCategory === "RRSS-E" &&
      r.HHLLCategory === "HHLL-E" &&
      r.RRHHCategory === "RRHH-OA" &&
      r.SSLLCategory === "SSLL-OB",
    order: 31,
  },
  { key: "OVB-E-E-OA-OB-EL4U4", label: "E-E-OA-OB-EL4U4", parentKey: "OVB-E-E-OA-OB", kind: "pattern", condition: (r) => r.EL4U4, order: 0 },
];

// Backward compatibility aliases
export const OVERLAP_ABOVE_DUPLICATE_VIEWS = OVERLAP_ABOVE_TOUCH_VIEWS;
export const INSIDE_CPR_DUPLICATE_VIEWS = INSIDE_CPR_TOUCH_VIEWS;
export const OUTCPR_DUPLICATE_VIEWS = OUTCPR_TOUCH_VIEWS;
export const OVERLAP_BELOW_DUPLICATE_VIEWS = OVERLAP_BELOW_TOUCH_VIEWS;
