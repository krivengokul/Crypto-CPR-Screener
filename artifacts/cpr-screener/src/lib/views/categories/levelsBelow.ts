import type { CPRResult } from "../../cpr";
import { computePrevPattern } from "../../cpr";
import type { ViewDef } from "../types";
import { passesView } from "../registry";
import { matchesGapBadge } from "../gapBadges";

export const LEVELSBELOW_VIEWS: ViewDef[] = [

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
  // Missing Subpatterns added from PatternStats (B-B-BB-BB, 71 unclassified rows)
  { key: "B-B-BB-BB-CL4U3", label: "B-B-BB-BB-CL4U3", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL4U3, order: 11 },
  { key: "B-B-BB-BB-CL3U2", label: "B-B-BB-BB-CL3U2", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL3U2, order: 12 },
  { key: "B-B-BB-BB-CL4U4", label: "B-B-BB-BB-CL4U4", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.CL4U4, order: 13 },
  { key: "B-B-BB-BB-L4U2", label: "B-B-BB-BB-L4U2", parentKey: "B-B-BB-BB", kind: "pattern", condition: (r) => r.L4U2, order: 14 },

  // --- B-E-HA-BB's nested Pattern children (LEVEL BELOW) ---
  { key: "B-E-HA-BB-EL3U4", label: "B-E-HA-BB-EL3U4", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL3U4, order: 0 },
  // Missing Subpatterns added from PatternStats (B-E-HA-BB, 49 unclassified rows)
  { key: "B-E-HA-BB-EL2U4", label: "B-E-HA-BB-EL2U4", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL2U4, order: 1 },
  { key: "B-E-HA-BB-EL2U3", label: "B-E-HA-BB-EL2U3", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL2U3, order: 2 },
  { key: "B-E-HA-BB-EL3U3", label: "B-E-HA-BB-EL3U3", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL3U3, order: 3 },
  { key: "B-E-HA-BB-EL4U4", label: "B-E-HA-BB-EL4U4", parentKey: "B-E-HA-BB", kind: "pattern", condition: (r) => r.EL4U4, order: 4 },

  // --- leaf Views ---

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
