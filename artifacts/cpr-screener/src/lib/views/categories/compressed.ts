import type { CPRResult } from "../../cpr";
import type { ViewDef } from "../types";
import { dirTol, computePrevPattern } from "../../cpr";
import { passesView } from "../registry";

export const COMPRESSED_VIEWS: ViewDef[] = [
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
