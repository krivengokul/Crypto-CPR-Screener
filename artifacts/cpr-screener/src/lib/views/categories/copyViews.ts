import type { CPRResult } from "../../cpr";
import type { ViewDef } from "../types";
import { passesView } from "../registry";
import { matchesGapBadge } from "../gapBadges";

export const COPY_VIEWS: ViewDef[] = [
  {
    key: "A-A-AA-AA-U3L3-SSLLGap:R4+1",
    label: "A-A-AA-AA-U3L3-SSLLGap:R4 +1",
    parentKey: "A-A-AA-AA-U3L3",
    conditionKey: "A6-U3L3-SLBBG-R4",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["r2", "r3"] },
      { key: "r3", subject: "previous", bandKeys: ["r1", "r2"] },
      { key: "r2", subject: "today", bandKeys: ["r3", "r4"] },
      { key: "r1", subject: "today", bandKeys: ["r2", "r3"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r2", "r3"] },
      { key: "tc", subject: "today", bandKeys: ["r1", "r2"] },
      { key: "pivot", subject: "today", bandKeys: ["r1", "r2"] },
      { key: "bc", subject: "today", bandKeys: ["r1", "r2"] },
      { key: "s1", subject: "today", bandKeys: ["tc", "prevHigh"] },
      { key: "prevLow", subject: "today", bandKeys: ["tc", "prevHigh"] },
      { key: "s2", subject: "today", bandKeys: ["s1", "bc"] },
      { key: "s3", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "s4", subject: "today", bandKeys: ["s3", "s2"] },
    ],
      order: 1
},
  {
    key: "A-A-AA-AA-U3L3-SL-PAR1:R4",
    label: "A-A-AA-AA-U3L3-SL-PAR1:R4",
    parentKey: "A-A-AA-AA-U3L3",
    conditionKey: "A6-U3L3-SLBBG-R4",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 2
},
  {
    key: "6PM:APHS1A-FAU4:99PM",
    label: "6PM:APHS1A-FAU4:99PM",
    parentKey: "A-A-AA-AA-EU2L4",
    conditionKey: "6PM:APHS1A-FAU4:9PM",
    kind: "view",
    direction: "Up",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["r1", "r2"] },
      { key: "r3", subject: "previous", bandKeys: ["tc", "prevHigh"] },
      { key: "r2", subject: "previous", bandKeys: ["tc", "prevHigh"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r3", "r4"] },
      { key: "r1", subject: "today", bandKeys: ["r3", "r4"] },
      { key: "tc", subject: "today", bandKeys: ["prevHigh", "r2"] },
      { key: "pivot", subject: "today", bandKeys: ["prevHigh", "r2"] },
      { key: "bc", subject: "today", bandKeys: ["prevHigh", "r2"] },
      { key: "prevLow", subject: "today", bandKeys: ["s1", "bc"] },
      { key: "s1", subject: "today", bandKeys: ["tc", "r1"] },
      { key: "s2", subject: "today", bandKeys: ["s3", "s1"] },
      { key: "s3", subject: "today", bandKeys: ["s4", "s2"] },
    ],
      order: 3
},
  {
    key: "6PM:APHS1A-FAU4:9PMM",
    label: "6PM:APHS1A-FAU4:9PMM",
    parentKey: "A-A-AA-AA-EU2L4",
    conditionKey: "6PM:APHS1A-FAU4:9PM",
    kind: "view",
    direction: "Up",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 4
},
  {
    key: "A-A-AA-AA-EUBL2-pS4S2:R2",
    label: "A-A-AA-AA-EUBL2-pS4S2:R2",
    parentKey: "A-A-AA-AA-EUBL2",
    conditionKey: "A-A-AA-AA",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["bc", "s1"] },
      { key: "r3", subject: "previous", bandKeys: ["bc", "s1"] },
      { key: "r2", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "prevHigh", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "r1", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "tc", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "pivot", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "bc", subject: "previous", bandKeys: ["s1", "prevLow"] },
      { key: "prevLow", subject: "today", bandKeys: ["bc", "s1"] },
      { key: "s1", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "s2", subject: "previous", bandKeys: ["prevLow", "s2"] },
      { key: "s3", subject: "previous", bandKeys: ["prevLow", "s2"] },
      { key: "s4", subject: "previous", bandKeys: ["prevLow", "s2"] },
    ],
      order: 0
},
  {
    key: "B-B-BB-BB-L4U4-pGapA",
    label: "B-B-BB-BB-L4U4-pGapA",
    parentKey: "B-B-BB-BB-L4U4",
    conditionKey: "B-B-BB-BB-L4U4",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "today", bandKeys: ["r4", "r3"] },
      { key: "r3", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "r2", subject: "today", bandKeys: ["r2", "prevHigh"] },
      { key: "prevHigh", subject: "today", bandKeys: ["tc", "pivot"] },
      { key: "r1", subject: "today", bandKeys: ["r1", "tc"] },
      { key: "tc", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "pivot", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "bc", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "prevLow", subject: "today", bandKeys: ["s1", "s2"] },
      { key: "s1", subject: "today", bandKeys: ["s1", "s2"] },
      { key: "s2", subject: "today", bandKeys: ["s2", "s3"] },
      { key: "s3", subject: "today", bandKeys: ["s3", "s4"] },
      { key: "s4", subject: "previous", bandKeys: ["s3", "s4"] },
    ],
      order: 3
},
  {
    key: "B-B-BB-BB-L2U4-pPPHR1",
    label: "B-B-BB-BB-L2U4-pPPHR1",
    parentKey: "B-B-BB-BB-L2U4",
    conditionKey: "B-B-BB-BB-L2U4",
    kind: "view",
    direction: "Up",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "today", bandKeys: ["r4", "r3"] },
      { key: "r3", subject: "today", bandKeys: ["r2", "prevHigh"] },
      { key: "r2", subject: "today", bandKeys: ["prevHigh", "r1"] },
      { key: "prevHigh", subject: "today", bandKeys: ["pivot", "bc"] },
      { key: "r1", subject: "today", bandKeys: ["prevLow", "s1"] },
      { key: "tc", subject: "today", bandKeys: ["s1", "s2"] },
      { key: "pivot", subject: "today", bandKeys: ["s1", "s2"] },
      { key: "bc", subject: "today", bandKeys: ["s2", "s3"] },
      { key: "prevLow", subject: "today", bandKeys: ["s2", "s3"] },
      { key: "s1", subject: "today", bandKeys: ["s3", "s4"] },
      { key: "s2", subject: "previous", bandKeys: ["pivot", "bc"] },
      { key: "s3", subject: "previous", bandKeys: ["prevLow", "s1"] },
      { key: "s4", subject: "previous", bandKeys: ["s1", "s2"] },
    ],
      order: 0
},
    {
        key: "B6-L4U4-MiniTiny:R4",
        label: "B6-L4U4-MiniTiny:R4",
        parentKey: "B-B-BB-BB-L4U4",
        conditionKey: "B-B-BB-BB-L4U4",
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
          "r1",
          "tc"
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
        key: "CU3L2-MedMicro-R4",
        label: "CU3L2-MedMicro-R4",
        parentKey: "C-C-BB-AA-CU3L2",
        conditionKey: "C-C-BB-AA-CU3L2",
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
      }
];
