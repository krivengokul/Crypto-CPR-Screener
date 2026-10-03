import type { CPRResult } from "../../cpr";
import type { ViewDef } from "../types";
import { dirTol, computePrevPattern, pickOuterLevelPattern } from "../../cpr";
import { passesView } from "../registry";
import { matchesGapBadge } from "../gapBadges";

export const COMPRESSED_VIEWS: ViewDef[] = [
  { key: "A-C-C-AA-CU4L4", label: "A-C-C-AA-CU4L4", parentKey: "A-C-C-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 100 },

  { key: "A-C-E-AA-CU3L2", label: "A-C-E-AA-CU3L2", parentKey: "A-C-E-AA", kind: "pattern", condition: (r) => r.CU3L2, order: 100 },

  { key: "A-C-RA-AA-CU4L3", label: "A-C-RA-AA-CU4L3", parentKey: "A-C-RA-AA", kind: "pattern", condition: (r) => r.CU4L3, order: 100 },

  { key: "A-C-C-AA-CU4L3", label: "A-C-C-AA-CU4L3", parentKey: "A-C-C-AA", kind: "pattern", condition: (r) => r.CU4L3, order: 101 },

  { key: "A-C-C-AA-CU3L2", label: "A-C-C-AA-CU3L2", parentKey: "A-C-C-AA", kind: "pattern", condition: (r) => r.CU3L2, order: 102 },

  { key: "A-C-C-AA-CU3L3", label: "A-C-C-AA-CU3L3", parentKey: "A-C-C-AA", kind: "pattern", condition: (r) => r.CU3L3, order: 103 },

  { key: "A-C-E-AA-CU4L3", label: "A-C-E-AA-CU4L3", parentKey: "A-C-E-AA", kind: "pattern", condition: (r) => r.CU4L3, order: 101 },

  { key: "A-C-E-AA-CU3L3", label: "A-C-E-AA-CU3L3", parentKey: "A-C-E-AA", kind: "pattern", condition: (r) => r.CU3L3, order: 102 },

  { key: "A-C-E-AA-CU4L4", label: "A-C-E-AA-CU4L4", parentKey: "A-C-E-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 103 },

  { key: "A-C-RA-AA-CU3L2", label: "A-C-RA-AA-CU3L2", parentKey: "A-C-RA-AA", kind: "pattern", condition: (r) => r.CU3L2, order: 101 },

  { key: "A-C-RA-AA-CU3L3", label: "A-C-RA-AA-CU3L3", parentKey: "A-C-RA-AA", kind: "pattern", condition: (r) => r.CU3L3, order: 102 },

  { key: "A-C-RA-AA-CU4L4", label: "A-C-RA-AA-CU4L4", parentKey: "A-C-RA-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 103 },

  { key: "A-C-RA-AA-U4L3", label: "A-C-RA-AA-U4L3", parentKey: "A-C-RA-AA", kind: "pattern", condition: (r) => r.U4L3, order: 104 },

  { key: "A-C-RA-AA-CU4L2", label: "A-C-RA-AA-CU4L2", parentKey: "A-C-RA-AA", kind: "pattern", condition: (r) => r.CU4L2, order: 105 },

  { key: "A-C-RA-AA-U4L4", label: "A-C-RA-AA-U4L4", parentKey: "A-C-RA-AA", kind: "pattern", condition: (r) => r.U4L4, order: 106 },

  {
          key: "S1-A-C-E-AA-CU4L3-SL-ABGap-S4",
          label: "pLittleBelow",
          parentKey: "A-C-E-AA-CU4L3",
          condition: (r) => passesView(r, "A-C-E-AA-CU4L3") && matchesGapBadge(r, "SL-ABGap"),
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
            "r2",
            "prevHigh"
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
          key: "R1-A-C-E-AA-CU4L3-SL-ABGap-R4",
          label: "pLittleBelow-Up",
          parentKey: "A-C-E-AA-CU4L3",
          condition: (r) => passesView(r, "A-C-E-AA-CU4L3") && matchesGapBadge(r, "SL-ABGap"),
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
            "r2",
            "prevHigh"
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

  // --- Additional LEVEL BELOW Pattern children ---
    { key: "B-C-BB-SB-CL3U2", label: "B-C-BB-SB-CL3U2", parentKey: "B-C-BB-SB", kind: "pattern", condition: (r) => r.CL3U2, order: 0 },

  { key: "B-C-BB-E-CL3U3", label: "B-C-BB-E-CL3U3", parentKey: "B-C-BB-E", kind: "pattern", condition: (r) => r.CL3U3, order: 0 },

  { key: "B-C-BB-C-CL4U3", label: "B-C-BB-C-CL4U3", parentKey: "B-C-BB-C", kind: "pattern", condition: (r) => r.CL4U3, order: 0 },

  // Missing Subpatterns added from PatternStats (B-C-BB-SB, 95 rows, 72 unclassified)
    { key: "B-C-BB-SB-CL4U3", label: "B-C-BB-SB-CL4U3", parentKey: "B-C-BB-SB", kind: "pattern", condition: (r) => r.CL4U3, order: 1 },

  { key: "B-C-BB-SB-CL4U4", label: "B-C-BB-SB-CL4U4", parentKey: "B-C-BB-SB", kind: "pattern", condition: (r) => r.CL4U4, order: 2 },

  { key: "B-C-BB-SB-CL3U3", label: "B-C-BB-SB-CL3U3", parentKey: "B-C-BB-SB", kind: "pattern", condition: (r) => r.CL3U3, order: 3 },

  { key: "B-C-BB-SB-CL4U2", label: "B-C-BB-SB-CL4U2", parentKey: "B-C-BB-SB", kind: "pattern", condition: (r) => r.CL4U2, order: 4 },

  { key: "B-C-BB-SB-L4U4", label: "B-C-BB-SB-L4U4", parentKey: "B-C-BB-SB", kind: "pattern", condition: (r) => r.L4U4, order: 5 },

  { key: "B-C-BB-SB-L4U3", label: "B-C-BB-SB-L4U3", parentKey: "B-C-BB-SB", kind: "pattern", condition: (r) => r.L4U3, order: 6 },

  // Missing Subpatterns added from PatternStats (B-C-BB-E, 60 rows, 49 unclassified)
    { key: "B-C-BB-E-CL3U2", label: "B-C-BB-E-CL3U2", parentKey: "B-C-BB-E", kind: "pattern", condition: (r) => r.CL3U2, order: 1 },

  { key: "B-C-BB-E-CL4U3", label: "B-C-BB-E-CL4U3", parentKey: "B-C-BB-E", kind: "pattern", condition: (r) => r.CL4U3, order: 2 },

  { key: "B-C-BB-E-CL4U4", label: "B-C-BB-E-CL4U4", parentKey: "B-C-BB-E", kind: "pattern", condition: (r) => r.CL4U4, order: 3 },

  { key: "B-C-BB-E-CL3U1", label: "B-C-BB-E-CL3U1", parentKey: "B-C-BB-E", kind: "pattern", condition: (r) => r.CL3U1, order: 4 },

  // Missing Subpatterns added from PatternStats (B-C-BB-C, 37 rows, 5 unclassified)
    { key: "B-C-BB-C-CL4U4", label: "B-C-BB-C-CL4U4", parentKey: "B-C-BB-C", kind: "pattern", condition: (r) => r.CL4U4, order: 1 },

  { key: "B-C-BB-C-CL3U2", label: "B-C-BB-C-CL3U2", parentKey: "B-C-BB-C", kind: "pattern", condition: (r) => r.CL3U2, order: 2 },

  { key: "B-C-BB-OB-L4U4", label: "B-C-BB-OB-L4U4", parentKey: "B-C-BB-OB", kind: "pattern", condition: (r) => r.L4U4, order: 0 },

  { key: "B-C-BB-OA-CL3U3", label: "B-C-BB-OA-CL3U3", parentKey: "B-C-BB-OA", kind: "pattern", condition: (r) => r.CL3U3, order: 0 },

  { key: "levelsbelow-B-C-BB-C-CL3U3", label: "B-C-BB-C-CL3U3", parentKey: "B-C-BB-C", kind: "pattern", condition: (r) => r.CL3U3, order: 100 },

  { key: "levelsbelow-B-C-BB-OB-CL4U3", label: "B-C-BB-OB-CL4U3", parentKey: "B-C-BB-OB", kind: "pattern", condition: (r) => r.CL4U3, order: 100 },

  { key: "levelsbelow-B-C-BB-OB-CL3U2", label: "B-C-BB-OB-CL3U2", parentKey: "B-C-BB-OB", kind: "pattern", condition: (r) => r.CL3U2, order: 101 },

  { key: "levelsbelow-B-C-BB-OB-CL3U3", label: "B-C-BB-OB-CL3U3", parentKey: "B-C-BB-OB", kind: "pattern", condition: (r) => r.CL3U3, order: 102 },

  { key: "levelsbelow-B-C-BB-OA-CL4U3", label: "B-C-BB-OA-CL4U3", parentKey: "B-C-BB-OA", kind: "pattern", condition: (r) => r.CL4U3, order: 100 },

  { key: "C-C-BB-OA-CL2U1", label: "C-C-BB-OA-CL2U1", parentKey: "C-C-BB-OA", kind: "pattern", condition: (r) => r.CL2U1, order: 0 },

  { key: "C-C-OB-AA-CU3L2", label: "C-C-OB-AA-CU3L2", parentKey: "C-C-OB-AA", kind: "pattern", condition: (r) => r.CU3L2, order: 0 },

  { key: "C-C-OB-AA-CU3L3", label: "C-C-OB-AA-CU3L3", parentKey: "C-C-OB-AA", kind: "pattern", condition: (r) => r.CU3L3, order: 1 },

  { key: "C-C-OB-AA-CU2L2", label: "C-C-OB-AA-CU2L2", parentKey: "C-C-OB-AA", kind: "pattern", condition: (r) => r.CU2L2, order: 2 },

  { key: "C-C-OB-AA-CU4L3", label: "C-C-OB-AA-CU4L3", parentKey: "C-C-OB-AA", kind: "pattern", condition: (r) => r.CU4L3, order: 3 },

  { key: "C-C-OB-AA-CU2L1", label: "C-C-OB-AA-CU2L1", parentKey: "C-C-OB-AA", kind: "pattern", condition: (r) => r.CU2L1, order: 4 },

  { key: "C-C-OB-AA-CU2BC", label: "C-C-OB-AA-CU2BC", parentKey: "C-C-OB-AA", kind: "pattern", condition: (r) => r.CU2BC, order: 5 },

  { key: "C-C-BB-OA-CL3U2", label: "C-C-BB-OA-CL3U2", parentKey: "C-C-BB-OA", kind: "pattern", condition: (r) => r.CL3U2, order: 1 },

  { key: "C-C-BB-OA-CL2U2", label: "C-C-BB-OA-CL2U2", parentKey: "C-C-BB-OA", kind: "pattern", condition: (r) => r.CL2U2, order: 2 },

  { key: "C-C-BB-OA-CL3U3", label: "C-C-BB-OA-CL3U3", parentKey: "C-C-BB-OA", kind: "pattern", condition: (r) => r.CL3U3, order: 3 },

  { key: "C-C-BB-OA-CL4U3", label: "C-C-BB-OA-CL4U3", parentKey: "C-C-BB-OA", kind: "pattern", condition: (r) => r.CL4U3, order: 4 },

  { key: "C-C-BB-OA-CL4U4", label: "C-C-BB-OA-CL4U4", parentKey: "C-C-BB-OA", kind: "pattern", condition: (r) => r.CL4U4, order: 5 },

  { key: "C-C-BB-OA-CL1U1", label: "C-C-BB-OA-CL1U1", parentKey: "C-C-BB-OA", kind: "pattern", condition: (r) => r.CL1U1, order: 6 },

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

  { key: "C-C-BB-AA-None", label: "C-C-BB-AA-None", parentKey: "C-C-BB-AA", kind: "pattern", condition: (r) => !pickOuterLevelPattern(r), order: 14 },

  {
          key: "C-CL3U3-SH-AGapB-S4",
          label: "C-CL3U3-SH-AGapB-S4",
          parentKey: "C-C-BB-AA-CL3U3",
          conditionKey: "compressed",
          kind: "view",
          direction: "Down",
          targetLabel: "S4",
          getTarget: (r) => r.todayCPR.s4,
          entryLabel: "BC",
          getEntry: (r) => r.todayCPR.bc,
          stoplossLabel: "R1",
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
          targetLabel: "R4",
          getTarget: (r) => r.todayCPR.r4,
          entryLabel: "TC",
          getEntry: (r) => r.todayCPR.tc,
          stoplossLabel: "S1",
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
          targetLabel: "R4",
          getTarget: (r) => r.todayCPR.r4,
          entryLabel: "TC",
          getEntry: (r) => r.todayCPR.tc,
          stoplossLabel: "S1",
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
          targetLabel: "R4",
          getTarget: (r) => r.todayCPR.r4,
          entryLabel: "TC",
          getEntry: (r) => r.todayCPR.tc,
          stoplossLabel: "S1",
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
        },
];
