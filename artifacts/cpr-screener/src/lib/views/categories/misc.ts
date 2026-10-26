import type { CPRResult } from "../../cpr";
import type { ViewDef } from "../types";
import { dirTol, pickOuterLevelPattern, getPatternCategory } from "../../cpr";
import { passesView } from "../registry";
import { matchesGapBadge, matchesCandleCheck } from "../gapBadges";

export const MISC_VIEWS: ViewDef[] = [
  { key: "equal-cpr", label: "Equal CPR", kind: "pattern", parentKey: "touch", condition: (r) => r.equalCPR,
      order: 5
},
  {
    key: "touch",
    label: "TOUCH",
    kind: "category",
    // touchCategory already applies the shared precedence rule from cpr.ts:
    // Level4 crossings stay in ABOVE/BELOW LEVEL4 and do not also appear
    // under TOUCH.
    condition: (r) => r.touchCategory,
    order: 11,
  },
  {
    key: "insidecpr",
    label: "INCPR",
    parentKey: "touch",
    kind: "pattern",
    order: 1,
    condition: (r) => !!(r.InsideCPR || (r as any).insideCPR),
  },
  {
    key: "outcpr",
    label: "OutCPR",
    parentKey: "touch",
    kind: "pattern",
    order: 2,
    condition: (r) => !!r.outCPR,
  },
  {
    key: "OVA",
    label: "Overlap Above",
    parentKey: "touch",
    kind: "pattern",
    order: 3,
    condition: (r) => !!r.overlapHigher,
  },
  {
    key: "overlapLower",
    label: "Overlap Below",
    parentKey: "touch",
    kind: "pattern",
    order: 4,
    condition: (r) => !!r.overlapLower,
  },
  {
    key: "inside-cpr",
    label: "INCPR",
    kind: "pattern",
    condition: (r) => !!(r.InsideCPR || (r as any).insideCPR),
  },
  {
    key: "outside-cpr",
    label: "OutCPR",
    kind: "pattern",
    condition: (r) => !!r.outCPR,
  },
  { key: "top15gainers", label: "TOP 15 GAINERS", kind: "category", condition: () => true,
      order: 0
},
  { key: "top15losers", label: "TOP 15 LOSERS", kind: "category", condition: () => true,
      order: 1
},
    {
        key: "A5-CU3L3-SLGapBB-R4",
        label: "A5-CU3L3-SLGapBB-R4",
        parentKey: "A-A-OA-AA-CU3L3",
        conditionKey: "A-A-OA-AA-CU3L3",
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
          "r3",
          "r2"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
        key: "TC-INCPR-B-A-C-C-U4L4-RL-GapBB-R4",
        label: "InnerRocket",
        parentKey: "INCPR-B-A-C-C-U4L4",
        condition: (r) => passesView(r, "INCPR-B-A-C-C-U4L4") && matchesGapBadge(r, "RL-GapBB"),
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
          "r3",
          "r2"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "R1-INCPR-C-C-BB-AA-CL2U2-SH-GapAB-R4",
        label: "PR4ContinueR4Nxt",
        parentKey: "INCPR-C-C-BB-AA-CL2U2",
        condition: (r) => passesView(r, "INCPR-C-C-BB-AA-CL2U2") && matchesGapBadge(r, "SH-GapAB"),
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
          "prevHigh",
          "r1"
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
          "pivot",
          "bc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
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
        key: "S1-INCPR-C-C-BB-AA-CL3U3-RL-GapBB-S4",
        label: "CL3U3-MicroFall",
        parentKey: "INCPR-C-C-BB-AA-CL3U3",
        condition: (r) => passesView(r, "INCPR-C-C-BB-AA-CL3U3") && matchesGapBadge(r, "RL-GapBB"),
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
              "r2",
              "r1"
            ]
          },
          {
            "key": "r2",
            "subject": "today",
            "bandKeys": [
              "r2",
              "r1"
            ]
          },
          {
            "key": "prevHigh",
            "subject": "today",
            "bandKeys": [
              "prevHigh",
              "tc"
            ]
          },
          {
            "key": "r1",
            "subject": "today",
            "bandKeys": [
              "prevHigh",
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
              "pivot",
              "bc"
            ]
          },
          {
            "key": "bc",
            "subject": "today",
            "bandKeys": [
              "pivot",
              "bc"
            ]
          },
          {
            "key": "prevLow",
            "subject": "today",
            "bandKeys": [
              "bc",
              "s1"
            ]
          },
          {
            "key": "s1",
            "subject": "today",
            "bandKeys": [
              "bc",
              "s1"
            ]
          },
          {
            "key": "s2",
            "subject": "today",
            "bandKeys": [
              "prevLow",
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
        key: "R1-OVA-A-A-OA-OA-EU4L4-RH-BBGap-R4",
        label: "A2OA2-EU4L4-SmallMedium",
        parentKey: "OVA-A-A-OA-OA-EU4L4",
        condition: (r) => passesView(r, "OVA-A-A-OA-OA-EU4L4") && matchesGapBadge(r, "RH-BBGap"),
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
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
          "s1",
          "prevLow"
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
        key: "TC-INCPR-C-C-BB-AA-CU3L3-SH-GapAB-R4",
        label: "INCPR2R4",
        parentKey: "INCPR-C-C-BB-AA-CU3L3",
        condition: (r) => passesView(r, "INCPR-C-C-BB-AA-CU3L3") && matchesGapBadge(r, "SH-GapAB"),
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
          "r2",
          "prevHigh"
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
          "tc",
          "pivot"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
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
          "s2",
          "s3"
        ]
      }
    ],
        requireFullMatch: true,
      },
    {
        key: "TC-OVA-C-A-C-AA-CU3L3-SL-GapBB-R4",
        label: "2Tiny-RocketAbove",
        parentKey: "OVA-C-A-C-AA-CU3L3",
        condition: (r) => passesView(r, "OVA-C-A-C-AA-CU3L3") && matchesGapBadge(r, "SL-GapBB"),
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
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
        key: "BC-OVA-C-A-C-AA-CU3L3-SL-GapBB-PL",
        label: "Below-pUltra",
        parentKey: "OVA-C-A-C-AA-CU3L3",
        condition: (r) => passesView(r, "OVA-C-A-C-AA-CU3L3") && matchesGapBadge(r, "SL-GapBB"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "PL (previous day's low)",
        getTarget: (r) => r.todayCPR.prevLow,
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
        key: "R1-A-B-E-E-CU4L4-SH-ABGap-R4",
        label: "RocketUp-pMiniMedium",
        parentKey: "A-B-E-E-CU4L4",
        condition: (r) => passesView(r, "A-B-E-E-CU4L4") && matchesGapBadge(r, "SH-ABGap"),
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
          "r4",
          "r3"
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
          "tc",
          "pivot"
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
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "R1-INCPR-B-C-OB-C-CL4U4-RL-GapBB-R4",
        label: "CompressedHigher",
        parentKey: "INCPR-B-C-OB-C-CL4U4",
        condition: (r) => passesView(r, "INCPR-B-C-OB-C-CL4U4") && matchesGapBadge(r, "RL-GapBB"),
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
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
          "pivot",
          "bc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
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
        "subject": "today",
        "bandKeys": [
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "S1-INCPR-B-C-OB-C-CL4U4-RL-GapBB-S4",
        label: "CompHigher-DownMove",
        parentKey: "INCPR-B-C-OB-C-CL4U4",
        condition: (r) => passesView(r, "INCPR-B-C-OB-C-CL4U4") && matchesGapBadge(r, "RL-GapBB"),
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
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
          "pivot",
          "bc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "TC-INCPR-C-A-HA-AA-CU3L3-RL-GapBA-R4",
        label: "JetUp-1AM",
        parentKey: "INCPR-C-A-HA-AA-CU3L3",
        condition: (r) => passesView(r, "INCPR-C-A-HA-AA-CU3L3") && matchesGapBadge(r, "RL-GapBA"),
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
        key: "R1-INCPR-C-C-BB-AA-CL2U2-SH-GapAA-R4",
        label: "PassNxtDay",
        parentKey: "INCPR-C-C-BB-AA-CL2U2",
        condition: (r) => passesView(r, "INCPR-C-C-BB-AA-CL2U2") && matchesGapBadge(r, "SH-GapAA"),
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
          "tc",
          "pivot"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
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
        key: "TC-OVB-E-B-RA-BB-EL3U3-RL-GapAB-R4",
        label: "Rocket-Upmove",
        parentKey: "OVB-E-B-RA-BB-EL3U3",
        condition: (r) => passesView(r, "OVB-E-B-RA-BB-EL3U3") && matchesGapBadge(r, "RL-GapAB"),
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "previous",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "previous",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "previous",
        "bandKeys": [
          "bc",
          "s1"
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
      },
    {
        key: "TC-A-C-RA-AA-CU4L3-SL-ABGap-R4",
        label: "2Mega-UptoR4",
        parentKey: "A-C-RA-AA-CU4L3",
        condition: (r) => passesView(r, "A-C-RA-AA-CU4L3") && matchesGapBadge(r, "SL-ABGap"),
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
          "r4",
          "r3"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "r1"
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
          "prevHigh",
          "r1"
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
          "tc",
          "pivot"
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
          "s2",
          "s3"
        ]
      }
    ],
      },
    {
        key: "R1-CB-INCPR-C-C-BB-AA-CU2L2-SH-GapAB-PR4",
        label: "ROCKETUPMOVE-PR4",
        parentKey: "INCPR-C-C-BB-AA-CU2L2",
        condition: (r) => passesView(r, "INCPR-C-C-BB-AA-CU2L2") && matchesGapBadge(r, "SH-GapAB") && matchesCandleCheck(r, "CB"),
        standalone: true,
        candleCheck: "CB",
        kind: "view",
        direction: "Up",
        targetLabel: "PR4 (previous day's R4)",
        getTarget: (r) => r.prevCPR.r4,
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
          "tc",
          "pivot"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
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
          "prevLow",
          "s1"
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
        requireFullMatch: true,
      },
    {
        key: "TC-CA-OVB-B-C-BB-SB-CL4U3-RL-BAGap-R4",
        label: "UpMove-P2DConsolidation",
        parentKey: "OVB-B-C-BB-SB-CL4U3",
        condition: (r) => passesView(r, "OVB-B-C-BB-SB-CL4U3") && matchesGapBadge(r, "RL-BAGap") && matchesCandleCheck(r, "CA"),
        standalone: true,
        candleCheck: "CA",
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
          "r3",
          "r2"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "TC-CA-OVA-C-C-BB-AA-CU2L2-RL-GapBA-R4",
        label: "ToR4NxtDay",
        parentKey: "OVA-C-C-BB-AA-CU2L2",
        condition: (r) => passesView(r, "OVA-C-C-BB-AA-CU2L2") && matchesGapBadge(r, "RL-GapBA") && matchesCandleCheck(r, "CA"),
        standalone: true,
        candleCheck: "CA",
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
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      }
    ],
      },
    {
        key: "S1-INCPR-C-C-OB-AA-CU4L4-RL-GapBB-S4",
        label: "Mini-INCPRDownS4",
        parentKey: "INCPR-C-C-OB-AA-CU4L4",
        condition: (r) => passesView(r, "INCPR-C-C-OB-AA-CU4L4") && matchesGapBadge(r, "RL-GapBB"),
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "S1-OVA-C-A-C-AA-CU4L4-SL-GapBB-S4",
        label: "PMINITINYDOWN",
        parentKey: "OVA-C-A-C-AA-CU4L4",
        condition: (r) => passesView(r, "OVA-C-A-C-AA-CU4L4") && matchesGapBadge(r, "SL-GapBB"),
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
          "s3",
          "s4"
        ]
      }
    ],
      },
    {
        key: "PH-CB-OVB-C-B-BB-LB-CL4U4-SH-GapAB-R3",
        label: "CONB-UPMOVE",
        parentKey: "OVB-C-B-BB-LB-CL4U4",
        condition: (r) => passesView(r, "OVB-C-B-BB-LB-CL4U4") && matchesGapBadge(r, "SH-GapAB") && matchesCandleCheck(r, "CB"),
        standalone: true,
        candleCheck: "CB",
        kind: "view",
        direction: "Up",
        targetLabel: "U3 (today's R3)",
        getTarget: (r) => r.todayCPR.r3,
        entryLabel: "PH (previous day's high)",
        getEntry: (r) => r.todayCPR.prevHigh,
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
          "s3",
          "s4"
        ]
      }
    ],
        requireFullMatch: false,
      },
    {
        key: "S2-OVA-C-C-BB-AA-CU3L2-RL-BAGap-R1",
        label: "INRANGE-UPTRADE",
        parentKey: "OVA-C-C-BB-AA-CU3L2",
        condition: (r) => passesView(r, "OVA-C-C-BB-AA-CU3L2") && matchesGapBadge(r, "RL-BAGap"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "U1 (today's R1)",
        getTarget: (r) => r.todayCPR.r1,
        entryLabel: "S2 (today's S2)",
        getEntry: (r) => r.todayCPR.s2,
        stoplossLabel: "S4 (today's S4)",
        getStoploss: (r) => r.todayCPR.s4,
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
          "r2",
          "r1"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      }
    ],
        requireFullMatch: false,
      },
    {
        key: "S1-CA-INCPR-C-C-BB-AA-CL2U2-RL-GapBA-S4",
        label: "IN-NXTDAYR4",
        parentKey: "INCPR-C-C-BB-AA-CL2U2",
        condition: (r) => passesView(r, "INCPR-C-C-BB-AA-CL2U2") && matchesGapBadge(r, "RL-GapBA") && matchesCandleCheck(r, "CA"),
        standalone: true,
        candleCheck: "CA",
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
          "r2",
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
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
          "pivot",
          "bc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      }
    ],
        requireFullMatch: true,
      },
    {
        key: "R1-OVA-C-C-OB-AA-CU4L3-SL-GapBB-PR4",
        label: "UPMOVE-PR4",
        parentKey: "OVA-C-C-OB-AA-CU4L3",
        condition: (r) => passesView(r, "OVA-C-C-OB-AA-CU4L3") && matchesGapBadge(r, "SL-GapBB"),
        standalone: true,
        kind: "view",
        direction: "Up",
        targetLabel: "PR4 (previous day's R4)",
        getTarget: (r) => r.prevCPR.r4,
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
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
        requireFullMatch: true,
      },
    {
        key: "R1-CA-OVA-C-C-BB-AA-CU2L2-SL-GapBB-R4",
        label: "C-C-BB-AA-CU2L2",
        parentKey: "OVA-C-C-BB-AA-CU2L2",
        condition: (r) => passesView(r, "OVA-C-C-BB-AA-CU2L2") && matchesGapBadge(r, "SL-GapBB") && matchesCandleCheck(r, "CA"),
        standalone: true,
        candleCheck: "CA",
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
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s4",
        "subject": "today",
        "bandKeys": [
          "prevLow",
          "s2"
        ]
      }
    ],
        requireFullMatch: true,
      },
    {
        key: "PL-INCPR-C-C-BB-AA-CL3U3-RL-GapBA-S4",
        label: "P-CON-FALL-S4",
        parentKey: "INCPR-C-C-BB-AA-CL3U3",
        condition: (r) => passesView(r, "INCPR-C-C-BB-AA-CL3U3") && matchesGapBadge(r, "RL-GapBA"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "L4 (today's S4)",
        getTarget: (r) => r.todayCPR.s4,
        entryLabel: "PL (previous day's low)",
        getEntry: (r) => r.todayCPR.prevLow,
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
          "r2",
          "r1"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "tc",
        "subject": "today",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "pivot",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s1",
        "subject": "today",
        "bandKeys": [
          "bc",
          "s1"
        ]
      },
      {
        "key": "s2",
        "subject": "today",
        "bandKeys": [
          "s1",
          "prevLow"
        ]
      },
      {
        "key": "s3",
        "subject": "today",
        "bandKeys": [
          "prevLow",
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
        requireFullMatch: true,
      },
    {
        key: "R1-OVA-A-B-RA-LB-CU4L4-SH-GapAB-R4",
        label: "AFTERLQ-ENTER",
        parentKey: "OVA-A-B-RA-LB-CU4L4",
        condition: (r) => passesView(r, "OVA-A-B-RA-LB-CU4L4") && matchesGapBadge(r, "SH-GapAB"),
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
          "r4",
          "r3"
        ]
      },
      {
        "key": "r2",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "r1"
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
          "tc",
          "pivot"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "pivot",
          "bc"
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
          "s3",
          "s4"
        ]
      }
    ],
        requireFullMatch: true,
      },
    {
        key: "R1-VR-OVA-A-C-E-AA-CU4L3-SH-ABGap-R4",
        label: "SMALL280MEDIUM",
        parentKey: "OVA-A-C-E-AA-CU4L3",
        condition: (r) => passesView(r, "OVA-A-C-E-AA-CU4L3") && matchesGapBadge(r, "SH-ABGap") && matchesCandleCheck(r, "VR"),
        standalone: true,
        candleCheck: "VR",
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
          "pivot",
          "bc"
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
        requireFullMatch: true,
      }
];

export const OUTER_LEVEL_PATTERNS: ViewDef[] = [
  { key: "EU1L3", label: "EU1L3", kind: "pattern", condition: (r) => r.EU1L3 },
  { key: "EU1L4", label: "EU1L4", kind: "pattern", condition: (r) => r.EU1L4 },
  { key: "EUBL2", label: "EUBL2", kind: "pattern", condition: (r) => r.EUBL2 },
  { key: "CL4U3", label: "CL4U3", kind: "pattern", condition: (r) => r.CL4U3 },
  { key: "L4U4", label: "L4U4", kind: "pattern", condition: (r) => r.L4U4,
      order: 4
},
  { key: "U4L3", label: "U4L3", kind: "pattern", condition: (r) => r.U4L3 },
  { key: "EU3L4", label: "EU3L4", kind: "pattern", condition: (r) => r.EU3L4 },
  { key: "EU4L4", label: "EU4L4", kind: "pattern", condition: (r) => r.EU4L4,
      order: 3
},
  { key: "EL4U4", label: "EL4U4", kind: "pattern", condition: (r) => r.EL4U4 },
  { key: "QU4L4", label: "QU4L4", kind: "pattern", condition: (r) => r.QU4L4 },
  { key: "U4L4", label: "U4L4", kind: "pattern", condition: (r) => r.U4L4 },
  { key: "U3L4", label: "U3L4", kind: "pattern", condition: (r) => r.U3L4 },
  { key: "U2L4", label: "U2L4", kind: "pattern", condition: (r) => r.U2L4 },
  { key: "U1L4", label: "U1L4", kind: "pattern", condition: (r) => r.U1L4 },
  { key: "CU3L2", label: "CU3L2", kind: "pattern", condition: (r) => r.CU3L2 },
  { key: "CU3L3", label: "CU3L3", kind: "pattern", condition: (r) => r.CU3L3,
      order: 1
},
  { key: "CU4L4", label: "CU4L4", kind: "pattern", condition: (r) => r.CU4L4,
      order: 2
},
  { key: "EL2U4", label: "EL2U4", kind: "pattern", condition: (r) => r.EL2U4 },
  { key: "EL3U4", label: "EL3U4", kind: "pattern", condition: (r) => r.EL3U4 },
  { key: "CU4L2", label: "CU4L2", kind: "pattern", condition: (r) => r.CU4L2 },
  { key: "EU3L3", label: "EU3L3", kind: "pattern", condition: (r) => r.EU3L3 },
  { key: "EU1L2", label: "EU1L2", kind: "pattern", condition: (r) => r.EU1L2 },
  { key: "EUBL1", label: "EUBL1", kind: "pattern", condition: (r) => r.EUBL1 },
  { key: "EUPL1", label: "EUPL1", kind: "pattern", condition: (r) => r.EUPL1 },
  { key: "EUTL1", label: "EUTL1", kind: "pattern", condition: (r) => r.EUTL1 },
  { key: "EUPL3", label: "EUPL3", kind: "pattern", condition: (r) => r.EUPL3 },
  { key: "EU2L2", label: "EU2L2", kind: "pattern", condition: (r) => r.EU2L2 },
  { key: "EUTL2", label: "EUTL2", kind: "pattern", condition: (r) => r.EUTL2 },
  { key: "EU1L1", label: "EU1L1", kind: "pattern", condition: (r) => r.EU1L1 },
  { key: "EL1U1", label: "EL1U1", kind: "pattern", condition: (r) => r.EL1U1 },
  { key: "EL1U2", label: "EL1U2", kind: "pattern", condition: (r) => r.EL1U2 },
  { key: "EL1U3", label: "EL1U3", kind: "pattern", condition: (r) => r.EL1U3 },
  { key: "EL2U3", label: "EL2U3", kind: "pattern", condition: (r) => r.EL2U3 },
  { key: "ELTU2", label: "ELTU2", kind: "pattern", condition: (r) => r.ELTU2 },
  { key: "ELBU2", label: "ELBU2", kind: "pattern", condition: (r) => r.ELBU2 },
  { key: "ELTU3", label: "ELTU3", kind: "pattern", condition: (r) => r.ELTU3 },
  { key: "ELPU2", label: "ELPU2", kind: "pattern", condition: (r) => r.ELPU2 },
  { key: "ELPU3", label: "ELPU3", kind: "pattern", condition: (r) => r.ELPU3 },
  { key: "ELBU3", label: "ELBU3", kind: "pattern", condition: (r) => r.ELBU3 },
  { key: "EUTL4", label: "EUTL4", kind: "pattern", condition: (r) => r.EUTL4 },
  { key: "L2U3", label: "L2U3", kind: "pattern", condition: (r) => r.L2U3 },
  { key: "CU2L1", label: "CU2L1", kind: "pattern", condition: (r) => r.CU2L1 },
  { key: "CU2BC", label: "CU2BC", kind: "pattern", condition: (r) => r.CU2BC },
  { key: "CU3L1", label: "CU3L1", kind: "pattern", condition: (r) => r.CU3L1 },
  { key: "U2L3", label: "U2L3", kind: "pattern", condition: (r) => r.U2L3 },
  { key: "ELBU4", label: "ELBU4", kind: "pattern", condition: (r) => r.ELBU4 },
  { key: "CL1U1", label: "CL1U1", kind: "pattern", condition: (r) => r.CL1U1 },
  { key: "CU1L1", label: "CU1L1", kind: "pattern", condition: (r) => r.CU1L1 },
  { key: "CL2U2", label: "CL2U2", kind: "pattern", condition: (r) => r.CL2U2 },
  { key: "CU2L2", label: "CU2L2", kind: "pattern", condition: (r) => r.CU2L2 },
  { key: "CL2U1", label: "CL2U1", kind: "pattern", condition: (r) => r.CL2U1 },
  { key: "CL4U4", label: "CL4U4", kind: "pattern", condition: (r) => r.CL4U4 },
  { key: "EU2L3", label: "EU2L3", kind: "pattern", condition: (r) => r.EU2L3 },
  { key: "CL2UT", label: "CL2UT", kind: "pattern", condition: (r) => r.CL2UT },
  { key: "L3CP", label: "L3CP", kind: "pattern", condition: (r) => r.L3CP },
  { key: "L2CP", label: "L2CP", kind: "pattern", condition: (r) => r.L2CP },
  { key: "L3TC", label: "L3TC", kind: "pattern", condition: (r) => r.L3TC },
];
