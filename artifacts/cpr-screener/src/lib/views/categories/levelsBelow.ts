import type { CPRResult } from "../../cpr";
import type { ViewDef } from "../types";
import { dirTol, computePrevPattern, pickOuterLevelPattern } from "../../cpr";
import { passesView } from "../registry";
import { matchesGapBadge } from "../gapBadges";

export const LEVELSBELOW_VIEWS: ViewDef[] = [
  // --- B-B-BB-BB's eleven nested Pattern children ---
    {
      key: "B-B-BB-BB-L4U4", label: "B-B-BB-BB-L4U4", parentKey: "B-B-BB-BB", kind: "pattern",
      condition: (r) => r.L4U4,
      direction: "Down", targetLabel: "S2", getTarget: (r) => r.todayCPR.s2,
      entryLabel: "BC", getEntry: (r) => r.todayCPR.bc,
      stoplossLabel: "R1", getStoploss: (r) => r.todayCPR.r1,
        order: 0
  },

  { key: "B-B-BB-BB-EL4U4", label: "B-B-BB-BB-EL4U4", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.EL4U4,
        order: 1
  },

  {
      key: "B-B-BB-BB-L3U4", label: "B-B-BB-BB-L3U4", parentKey: "B-B-BB-BB", kind: "pattern",
      condition: (r) => r.L3U4,
      direction: "Down", targetLabel: "S2", getTarget: (r) => r.todayCPR.s2,
      entryLabel: "BC", getEntry: (r) => r.todayCPR.bc,
      stoplossLabel: "R1", getStoploss: (r) => r.todayCPR.r1,
        order: 2
  },

  {
      key: "B-B-BB-BB-L2U4", label: "B-B-BB-BB-L2U4", parentKey: "B-B-BB-BB", kind: "pattern",
      condition: (r) => r.L2U4,
      direction: "Down", targetLabel: "S2", getTarget: (r) => r.todayCPR.s2,
      entryLabel: "BC", getEntry: (r) => r.todayCPR.bc,
      stoplossLabel: "R1", getStoploss: (r) => r.todayCPR.r1,
        order: 3
  },

  {
      key: "B-B-BB-BB-L4U3", label: "B-B-BB-BB-L4U3", parentKey: "B-B-BB-BB", kind: "pattern",
      condition: (r) => r.L4U3,
      direction: "Down", targetLabel: "S2", getTarget: (r) => r.todayCPR.s2,
      entryLabel: "BC", getEntry: (r) => r.todayCPR.bc,
      stoplossLabel: "R1", getStoploss: (r) => r.todayCPR.r1,
        order: 4
  },

  {
      key: "B-B-BB-BB-L3U3", label: "B-B-BB-BB-L3U3", parentKey: "B-B-BB-BB", kind: "pattern",
      condition: (r) => r.L3U3,
      direction: "Down", targetLabel: "S2", getTarget: (r) => r.todayCPR.s2,
      entryLabel: "BC", getEntry: (r) => r.todayCPR.bc,
      stoplossLabel: "R1", getStoploss: (r) => r.todayCPR.r1,
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

  // Missing Subpatterns added from PatternStats (B-B-BB-BB, 71 unclassified rows)
    { key: "B-B-BB-BB-CL4U3", label: "B-B-BB-BB-CL4U3", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL4U3, order: 11 },

  { key: "B-B-BB-BB-CL3U2", label: "B-B-BB-BB-CL3U2", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL3U2, order: 12 },

  { key: "B-B-BB-BB-CL4U4", label: "B-B-BB-BB-CL4U4", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL4U4, order: 13 },

  { key: "B-B-BB-BB-L4U2", label: "B-B-BB-BB-L4U2", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.L4U2, order: 14 },

  // Missing Subpatterns added from PatternStats (B-B-BB-BB, 2626 rows, 12 unclassified)
    { key: "B-B-BB-BB-L3U2", label: "B-B-BB-BB-L3U2", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.L3U2, order: 15 },

  { key: "B-B-BB-BB-None", label: "B-B-BB-BB-None", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => !pickOuterLevelPattern(r), order: 16 },

  { key: "B-B-BB-BB-CL3U1", label: "B-B-BB-BB-CL3U1", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL3U1, order: 17 },

  { key: "B-B-BB-BB-CL3U3", label: "B-B-BB-BB-CL3U3", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL3U3, order: 18 },

  // --- B-B-BB-OB's nested Pattern children (LEVEL BELOW) ---
    { key: "B-B-BB-OB-CL3U2", label: "B-B-BB-OB-CL3U2", parentKey: "B-B-BB-OB", kind: "pattern", condition: (r) => r.CL3U2, order: 0 },

  { key: "B-B-BB-OB-CL4U4", label: "B-B-BB-OB-CL4U4", parentKey: "B-B-BB-OB", kind: "pattern", condition: (r) => r.CL4U4, order: 1 },

  // --- B-B-OB-BB's nested Pattern children (LEVEL BELOW) ---
    { key: "B-B-OB-BB-EL3U4", label: "B-B-OB-BB-EL3U4", parentKey: "B-B-OB-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 0 },

  // Missing Subpatterns added from PatternStats (B-B-BB-OB, 209 rows, 82 unclassified)
    { key: "B-B-BB-OB-CL4U3", label: "B-B-BB-OB-CL4U3", parentKey: "B-B-BB-OB", kind: "pattern", condition: (r) => r.CL4U3, order: 2 },

  { key: "B-B-BB-OB-CL3U3", label: "B-B-BB-OB-CL3U3", parentKey: "B-B-BB-OB", kind: "pattern", condition: (r) => r.CL3U3, order: 3 },

  { key: "B-B-BB-OB-CL3U1", label: "B-B-BB-OB-CL3U1", parentKey: "B-B-BB-OB", kind: "pattern", condition: (r) => r.CL3U1, order: 4 },

  { key: "B-B-BB-OB-L4U4", label: "B-B-BB-OB-L4U4", parentKey: "B-B-BB-OB", kind: "pattern", condition: (r) => r.L4U4, order: 5 },

  { key: "B-B-BB-OB-CL4U2", label: "B-B-BB-OB-CL4U2", parentKey: "B-B-BB-OB", kind: "pattern", condition: (r) => r.CL4U2, order: 6 },

  { key: "B-B-BB-OB-None", label: "B-B-BB-OB-None", parentKey: "B-B-BB-OB", kind: "pattern", condition: (r) => !pickOuterLevelPattern(r), order: 7 },

  // Additional LEVEL BELOW subpatterns requested from PatternStats.
    { key: "B-B-BB-C-CL3U2", label: "B-B-BB-C-CL3U2", parentKey: "B-B-BB-C", kind: "pattern", condition: (r) => r.CL3U2, order: 0 },

  // Additional missing LEVEL BELOW subpatterns from PatternStats.
    { key: "levelsbelow-B-B-OB-BB-EL2U3", label: "B-B-OB-BB-EL2U3", parentKey: "B-B-OB-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 100 },

  { key: "levelsbelow-B-B-OB-BB-EL2U4", label: "B-B-OB-BB-EL2U4", parentKey: "B-B-OB-BB", kind: "pattern", condition: (r) => r.EL2U4, order: 101 },

  { key: "levelsbelow-B-B-OB-BB-EL4U4", label: "B-B-OB-BB-EL4U4", parentKey: "B-B-OB-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 102 },

  { key: "levelsbelow-B-B-OB-BB-L4U4", label: "B-B-OB-BB-L4U4", parentKey: "B-B-OB-BB", kind: "pattern", condition: (r) => r.L4U4, order: 103 },

  { key: "levelsbelow-B-B-OB-BB-EL3U3", label: "B-B-OB-BB-EL3U3", parentKey: "B-B-OB-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 104 },

  { key: "levelsbelow-B-B-OB-BB-L3U4", label: "B-B-OB-BB-L3U4", parentKey: "B-B-OB-BB", kind: "pattern", condition: (r) => r.L3U4, order: 105 },

  { key: "levelsbelow-B-B-BB-C-CL4U3", label: "B-B-BB-C-CL4U3", parentKey: "B-B-BB-C", kind: "pattern", condition: (r) => r.CL4U3, order: 100 },

  // --- leaf Views ---

    {
        key: "BC-B-B-BB-BB-EL4U4-SL-BAGap-S4",
        label: "B6-EL4U4-pMini",
        parentKey: "B-B-BB-BB-EL4U4",
        condition: (r) => passesView(r, "B-B-BB-BB-EL4U4") && matchesGapBadge(r, "SL-BAGap"),
        standalone: true,
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
        key: "TC-B-B-BB-BB-L4U4-SL-GapAB-R4",
        label: "PLATC-Micro",
        parentKey: "B-B-BB-BB-L4U4",
        condition: (r) => passesView(r, "B-B-BB-BB-L4U4") && matchesGapBadge(r, "SL-GapAB"),
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
        key: "R1-B-B-BB-BB-L4U4-SL-GapAB-R4",
        label: "B6-L4U4-Micro",
        parentKey: "B-B-BB-BB-L4U4",
        condition: (r) => passesView(r, "B-B-BB-BB-L4U4") && matchesGapBadge(r, "SL-GapAB"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "R4",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "R1",
        getEntry: (r) => r.todayCPR.r1,
        stoplossLabel: "S1",
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
          targetLabel: "R4",
          getTarget: (r) => r.todayCPR.r4,
          entryLabel: "R1",
          getEntry: (r) => r.todayCPR.r1,
          stoplossLabel: "S1",
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
          targetLabel: "R4",
          getTarget: (r) => r.todayCPR.r4,
          entryLabel: "R1",
          getEntry: (r) => r.todayCPR.r1,
          stoplossLabel: "S1",
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
        },

  {
          key: "R1-B-B-BB-BB-EL3U4-SL-AAGap-R4",
          label: "TinyMini-Upmove",
          parentKey: "B-B-BB-BB-EL3U4",
          condition: (r) => passesView(r, "B-B-BB-BB-EL3U4") && matchesGapBadge(r, "SL-AAGap"),
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
            "s2",
            "s3"
          ]
        }
      ],
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
      targetLabel: "R4",
      getTarget: (r) => r.todayCPR.r4,
      entryLabel: "TC",
      getEntry: (r) => r.todayCPR.tc,
      stoplossLabel: "S1",
      getStoploss: (r) => r.todayCPR.s1,
        order: 0
  },


  // Missing compressed subpatterns reported by PatternStats.
    { key: "C-B-BB-LB-CL4U3", label: "C-B-BB-LB-CL4U3", parentKey: "C-B-BB-LB", kind: "pattern", condition: (r) => r.CL4U3, order: 1 },

  { key: "C-B-BB-LB-CL3U3", label: "C-B-BB-LB-CL3U3", parentKey: "C-B-BB-LB", kind: "pattern", condition: (r) => r.CL3U3, order: 2 },

  { key: "C-B-BB-LB-CL2U2", label: "C-B-BB-LB-CL2U2", parentKey: "C-B-BB-LB", kind: "pattern", condition: (r) => r.CL2U2, order: 3 },

  { key: "C-B-BB-LB-CL4U4", label: "C-B-BB-LB-CL4U4", parentKey: "C-B-BB-LB", kind: "pattern", condition: (r) => r.CL4U4, order: 4 },

  { key: "C-B-BB-LB-CL2U1", label: "C-B-BB-LB-CL2U1", parentKey: "C-B-BB-LB", kind: "pattern", condition: (r) => r.CL2U1, order: 5 },

  { key: "C-B-BB-LB-CL1U1", label: "C-B-BB-LB-CL1U1", parentKey: "C-B-BB-LB", kind: "pattern", condition: (r) => r.CL1U1, order: 6 },

  { key: "C-B-BB-LB-L4U4", label: "C-B-BB-LB-L4U4", parentKey: "C-B-BB-LB", kind: "pattern", condition: (r) => r.L4U4, order: 7 },

  { key: "C-B-BB-C-CL2U2", label: "C-B-BB-C-CL2U2", parentKey: "C-B-BB-C", kind: "pattern", condition: (r) => r.CL2U2, order: 0 },

  { key: "C-B-BB-C-CL3U2", label: "C-B-BB-C-CL3U2", parentKey: "C-B-BB-C", kind: "pattern", condition: (r) => r.CL3U2, order: 1 },

  { key: "C-B-BB-C-CL3U3", label: "C-B-BB-C-CL3U3", parentKey: "C-B-BB-C", kind: "pattern", condition: (r) => r.CL3U3, order: 2 },

  { key: "C-B-BB-C-CL2U1", label: "C-B-BB-C-CL2U1", parentKey: "C-B-BB-C", kind: "pattern", condition: (r) => r.CL2U1, order: 3 },

  { key: "C-B-BB-C-CL3U1", label: "C-B-BB-C-CL3U1", parentKey: "C-B-BB-C", kind: "pattern", condition: (r) => r.CL3U1, order: 4 },

  { key: "C-B-BB-C-CL2UT", label: "C-B-BB-C-CL2UT", parentKey: "C-B-BB-C", kind: "pattern", condition: (r) => r.CL2UT, order: 5 },

  { key: "C-B-BB-C-CL4U3", label: "C-B-BB-C-CL4U3", parentKey: "C-B-BB-C", kind: "pattern", condition: (r) => r.CL4U3, order: 6 },

  { key: "C-B-BB-C-CL4U4", label: "C-B-BB-C-CL4U4", parentKey: "C-B-BB-C", kind: "pattern", condition: (r) => r.CL4U4, order: 7 },

  { key: "C-B-BB-C-L3TC", label: "C-B-BB-C-L3TC", parentKey: "C-B-BB-C", kind: "pattern", condition: (r) => r.L3TC, order: 8 },

  { key: "C-B-BB-E-CL3U3", label: "C-B-BB-E-CL3U3", parentKey: "C-B-BB-E", kind: "pattern", condition: (r) => r.CL3U3, order: 0 },

  { key: "C-B-BB-E-CL4U3", label: "C-B-BB-E-CL4U3", parentKey: "C-B-BB-E", kind: "pattern", condition: (r) => r.CL4U3, order: 1 },

  { key: "C-B-BB-E-CL3U2", label: "C-B-BB-E-CL3U2", parentKey: "C-B-BB-E", kind: "pattern", condition: (r) => r.CL3U2, order: 2 },

  { key: "C-B-BB-E-CL4U4", label: "C-B-BB-E-CL4U4", parentKey: "C-B-BB-E", kind: "pattern", condition: (r) => r.CL4U4, order: 3 },

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

    {
        key: "PL-B-B-BB-OB-CL3U1-RH-GapAA-S2",
        label: "UltraMega-S2",
        parentKey: "B-B-BB-OB-CL3U1",
        condition: (r) => passesView(r, "B-B-BB-OB-CL3U1") && matchesGapBadge(r, "RH-GapAA"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "L2 (today's S2)",
        getTarget: (r) => r.todayCPR.s2,
        entryLabel: "PL (previous day's low)",
        getEntry: (r) => r.todayCPR.prevLow,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
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
          "tc",
          "pivot"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "bc",
          "prevLow"
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
          "prevLow",
          "s1"
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
        key: "R1-C-B-BB-LB-CL3U2-RH-GapAB-R4",
        label: "2CPR-AbovePPLPH-PR4",
        parentKey: "C-B-BB-LB-CL3U2",
        condition: (r) => passesView(r, "C-B-BB-LB-CL3U2") && matchesGapBadge(r, "RH-GapAB"),
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
          "r2",
          "prevHigh"
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
          "s1",
          "s2"
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
      }
];
