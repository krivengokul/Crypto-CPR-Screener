import type { CPRResult } from "../../cpr";
import { computePrevPattern } from "../../cpr";
import type { ViewDef } from "../types";
import { passesView } from "../registry";
import { matchesGapBadge } from "../gapBadges";

export const LEVELSABOVE_VIEWS: ViewDef[] = [
  // --- A-A-AA-AA's nested Subpattern children ---
  { key: "A-A-AA-AA-U3L3", label: "A-A-AA-AA-U3L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U3L3,
      order: 1
},
  { key: "A-A-AA-AA-U4L3", label: "A-A-AA-AA-U4L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U4L3,
      order: 2
},
  { key: "A-A-AA-AA-CU4L3", label: "A-A-AA-AA-CU4L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.CU4L3,
      order: 7
},
  { key: "A-A-AA-AA-EU2L4", label: "A-A-AA-AA-EU2L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.EU2L4,
      order: 3
},
  { key: "A-A-AA-AA-U2L4", label: "A-A-AA-AA-U2L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U2L4,
      order: 4
},
  { key: "A-A-AA-AA-U3L4", label: "A-A-AA-AA-U3L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U3L4,
      order: 5
},
  { key: "A-A-AA-AA-U4L4", label: "A-A-AA-AA-U4L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U4L4,
      order: 8
},
  { key: "A-A-AA-AA-EU3L4", label: "A-A-AA-AA-EU3L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.EU3L4,
      order: 6
},
  { key: "A-A-AA-AA-CU4L2", label: "A-A-AA-AA-CU4L2", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.CU4L2,
      order: 9
},
  { key: "A-A-AA-AA-CU3L2", label: "A-A-AA-AA-CU3L2", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.CU3L2,
      order: 10
},
  { key: "A-A-AA-AA-EU2L3", label: "A-A-AA-AA-EU2L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.EU2L3,
      order: 11
},
  { key: "A-A-AA-AA-U4L2", label: "A-A-AA-AA-U4L2", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U4L2,
      order: 12
},
  { key: "A-A-AA-AA-CU4L4", label: "A-A-AA-AA-CU4L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.CU4L4,
      order: 13
},
  { key: "A-A-AA-AA-U2L3", label: "A-A-AA-AA-U2L3", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U2L3,
      order: 14
},
  { key: "A-A-AA-AA-U3L2", label: "A-A-AA-AA-U3L2", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.U3L2,
      order: 15
},
  // Added from PatternStats "Missing Subpatterns" (A-A-AA-AA, 3 unclassified rows).
  { key: "A-A-AA-AA-EU4L4", label: "A-A-AA-AA-EU4L4", parentKey: "A-A-AA-AA", kind: "pattern", condition: (r) => r.EU4L4,
      order: 16
},
  { key: "A-A-AA-AA-EUTL3", label: "A-A-AA-AA-EUTL3", parentKey: "R1AbovePR4-A-A-AA-AA", kind: "pattern", condition: (r) => r.EUTL3,
      order: 7
},

  // --- A-A-AA-OA's nested Subpattern children ---
  { key: "A-A-AA-OA-U3L4", label: "A-A-AA-OA-U3L4", parentKey: "A-A-AA-OA", kind: "pattern", condition: (r) => r.U3L4,
      order: 0
},
  { key: "A-A-AA-OA-EU3L4", label: "A-A-AA-OA-EU3L4", parentKey: "A-A-AA-OA", kind: "pattern", condition: (r) => r.EU3L4,
      order: 1
},
  { key: "A-A-AA-OA-U4L4", label: "A-A-AA-OA-U4L4", parentKey: "A-A-AA-OA", kind: "pattern", condition: (r) => r.U4L4,
      order: 2
},
  { key: "A-A-AA-OA-EU2L4", label: "A-A-AA-OA-EU2L4", parentKey: "A-A-AA-OA", kind: "pattern", condition: (r) => r.EU2L4,
      order: 3
},
  // Added from PatternStats "Missing Subpatterns" (A-A-AA-OA, 4 unclassified rows).
  { key: "A-A-AA-OA-EU2L3", label: "A-A-AA-OA-EU2L3", parentKey: "A-A-AA-OA", kind: "pattern", condition: (r) => r.EU2L3,
      order: 4
},

  // --- leaf Views (self-contained, target-graded) ---
  {
    key: "6PM:APHS1A-FAU4:9PM",
    label: "6PM:APHS1A-FAU4:9PM",
    parentKey: "A-A-AA-AA-EU2L4",
    kind: "view",
    direction: "Up",
    condition: (r) =>
      r.todayCPR.bc > r.prevCPR.prevHigh && r.todayCPR.s1 > r.prevCPR.tc &&
      (computePrevPattern(r.prevCPR, r.ppCPR) === "EU3L3" ||
        computePrevPattern(r.prevCPR, r.ppCPR) === "L4U4" ||
        (computePrevPattern(r.prevCPR, r.ppCPR) === "EU3L4" &&
          r.prevCPR.pivot > r.todayCPR.prevLow && r.todayCPR.s3 > r.prevCPR.s3)),
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 2
},
  {
    key: "9AM:pPALPApH-FAU4:2PM",
    label: "9AM:pPALPApH-FAU4:2PM",
    parentKey: "A-A-AA-AA-U4L3",
    kind: "view",
    direction: "Up",
    condition: (r) => r.prevCPR.pivot > r.todayCPR.prevLow && r.todayCPR.pivot > r.prevCPR.prevHigh,
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
  {
    // Real source condition for the "RH-BGapB" GapBadge signature
    // (computeGapBadge in ScreenerUtils.tsx): RRGap + HHGap, prev day's
    // HLSwitch "HL-B" (no Gap prefix -> hlGapWinner !== "prev"), today's
    // HLSwitch "HL-B" WITH the Gap prefix -> hlGapWinner === "today".
    // A6-EU2L4-RH-BGapB:R4 below should grade against THIS key. (The
    // "A-A-AA-AA-EU2L4-ApR2" key this comment used to contrast against
    // has been deleted.)
    key: "A-A-AA-AA-EU2L4-RH-BGapB",
    label: "A-A-AA-AA-EU2L4-RH-BGapB",
    parentKey: "A-A-AA-AA-EU2L4",
    kind: "view",
    direction: "Up",
    condition: (r) =>
      r.RRSSGapCategory === "RRGap" &&
      r.PDHPDLGapCategory === "HHGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.hlGapWinner === "today",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 1
},
  {
    key: "A-A-AA-AA-U3L4-pGapB",
    label: "A-A-AA-AA-U3L4-pGapB",
    parentKey: "A-A-AA-AA-U3L4",
    kind: "view",
    direction: "Up",
    condition: (r) =>
      r.RRSSGapCategory === "RRGap" &&
      r.PDHPDLGapCategory === "HHGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.hlGapWinner === "prev" &&
      r.narrowCPR,
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "s4", subject: "today", bandKeys: ["s4", "s3"] },
      { key: "s3", subject: "today", bandKeys: ["s3", "s2"] },
      { key: "s2", subject: "today", bandKeys: ["s2", "prevLow"] },
      { key: "prevLow", subject: "today", bandKeys: ["s1", "bc"] },
      { key: "s1", subject: "today", bandKeys: ["s1", "bc"] },
      { key: "bc", subject: "today", bandKeys: ["prevHigh", "r1"] },
      { key: "pivot", subject: "today", bandKeys: ["prevHigh", "r1"] },
      { key: "tc", subject: "today", bandKeys: ["prevHigh", "r1"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r2", "r3"] },
      { key: "r1", subject: "today", bandKeys: ["r2", "r3"] },
      { key: "r2", subject: "today", bandKeys: ["r3", "r4"] },
      { key: "r3", subject: "previous", bandKeys: ["r1", "r2"] },
      { key: "r4", subject: "previous", bandKeys: ["r2", "r3"] },
    ],
      order: 0
},
  {
    key: "A-A-AA-AA-EU3L4-GapB",
    label: "A-A-AA-AA-EU3L4-GapB",
    parentKey: "A-A-AA-AA-EU3L4",
    kind: "view",
    direction: "Up",
    condition: (r) => r.todayCPR.HLSwitch === "HL-B" && r.hlGapWinner === "today",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
      order: 0
},
  {
    key: "A-A-AA-OA-U3L4-RRHHGap:R4",
    label: "A-A-AA-OA-U3L4-RRHHGap:R4",
    parentKey: "A-A-AA-OA-U3L4",
    kind: "view",
    direction: "Up",
    condition: (r) =>
      r.RRSSGapCategory === "RRGap" &&
      r.PDHPDLGapCategory === "HHGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.hlGapWinner === "today",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["r3", "r2"] },
      { key: "r3", subject: "previous", bandKeys: ["r3", "r2"] },
      { key: "r2", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "r1", subject: "today", bandKeys: ["r2", "r1"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r2", "r1"] },
      { key: "tc", subject: "today", bandKeys: ["prevHigh", "tc"] },
      { key: "pivot", subject: "today", bandKeys: ["prevHigh", "tc"] },
      { key: "bc", subject: "today", bandKeys: ["prevHigh", "tc"] },
      { key: "s1", subject: "today", bandKeys: ["bc", "s1"] },
      { key: "prevLow", subject: "today", bandKeys: ["s1", "prevLow"] },
      { key: "s2", subject: "today", bandKeys: ["prevLow", "s2"] },
      { key: "s3", subject: "today", bandKeys: ["s2", "s3"] },
      { key: "s4", subject: "today", bandKeys: ["s3", "s4"] },
    ],
      order: 0
},
  {
    key: "A6-U3L3-SLBBG-R4",
    label: "A6-U3L3-SLBBG-R4",
    parentKey: "A-A-AA-AA-U3L3",
    kind: "view",
    direction: "Up",
    condition: (r) =>
      r.RRSSGapCategory === "SSGap" &&
      r.PDHPDLGapCategory === "LLGap" &&
      r.prevCPR.HLSwitch === "HL-B" &&
      r.todayCPR.HLSwitch === "HL-B" &&
      r.hlGapWinner === "today",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
    levelCheckDefs: [
      { key: "r4", subject: "previous", bandKeys: ["r3", "r2"] },
      { key: "r3", subject: "previous", bandKeys: ["r3", "r2"] },
      { key: "r2", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "r1", subject: "today", bandKeys: ["r3", "r2"] },
      { key: "prevHigh", subject: "today", bandKeys: ["r2", "r1"] },
      { key: "tc", subject: "today", bandKeys: ["r2", "r1"] },
      { key: "pivot", subject: "today", bandKeys: ["r2", "prevHigh"] },
      { key: "bc", subject: "today", bandKeys: ["r1", "prevHigh"] },
      { key: "s1", subject: "today", bandKeys: ["prevHigh", "tc"] },
      { key: "prevLow", subject: "today", bandKeys: ["pivot", "bc"] },
      { key: "s2", subject: "today", bandKeys: ["bc", "s1"] },
      { key: "s3", subject: "today", bandKeys: ["prevLow", "s2"] },
      { key: "s4", subject: "today", bandKeys: ["s2", "s3"] },
    ],
      order: 0
},
    {
        key: "A-A-AA-AA-CU4L3-GapBB:R4",
        label: "A-A-AA-AA-CU4L3-GapBB:R4",
        parentKey: "A-A-AA-AA-CU4L3",
        conditionKey: "A-A-AA-AA-CU4L3",
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
          "r2",
          "r1"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
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
          "prevHigh",
          "tc"
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
        key: "A6-EU2L4-RH-BGapB:R4",
        label: "A6-EU2L4-RH-BGapB:R4",
        parentKey: "A-A-AA-AA-EU2L4",
        conditionKey: "A-A-AA-AA-EU2L4-RH-BGapB",
        kind: "view",
        direction: "Up",
        targetLabel: "U4 (today's R4)",
        getTarget: (r) => r.todayCPR.r4,
        entryLabel: "TC (today's TC)",
        getEntry: (r) => r.todayCPR.tc,
        stoplossLabel: "S1 (today's S1)",
        getStoploss: (r) => r.todayCPR.s1,
        // Old 12-rung levelCheckDefs removed: it was missing "s4" (only
        // 12 of the 13 rungs, so s4 always graded UnDefined) and several
        // bands (e.g. r2 checked against [pivot, tc], s1 against
        // [tc, prevHigh]) paired a rung with a band nowhere near it in
        // ladder order, which would fail nearly every time even after
        // the conditionKey fix above. Leave this undefined — it imposes
        // no extra Level Check gate on top of the RH-BGapB condition —
        // until a real 13-rung signature is derived (e.g. via
        // deriveLevelCheckDefs from an actual matching symbol/date).
      },
    {
        key: "A6-EU2L4-RH-BGapB1:R4",
        label: "A6-EU2L4-RH-BGapB1:R4",
        parentKey: "A-A-AA-AA-EU2L4",
        conditionKey: "A-A-AA-AA-EU2L4-RH-BGapB",
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
          "r2",
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "tc"
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
        key: "A6-U4L4-SLBBG-R4",
        label: "A6-U4L4-SLBBG-R4",
        parentKey: "A-A-AA-AA-U4L4",
        conditionKey: "A-A-AA-AA-U4L4",
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
          "r2",
          "r1"
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
          "prevHigh",
          "tc"
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
        key: "A6-U2L4-PLpTC-R4",
        label: "A6-U2L4-PLpTC-R4",
        parentKey: "A-A-AA-AA-U2L4",
        conditionKey: "A-A-AA-AA-U2L4",
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
          "r2",
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "r1",
          "prevHigh"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "tc",
          "pivot"
        ]
      },
      {
        "key": "prevHigh",
        "subject": "today",
        "bandKeys": [
          "r3",
          "r2"
        ]
      },
      {
        "key": "r1",
        "subject": "today",
        "bandKeys": [
          "r4",
          "r3"
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
          "r2",
          "r1"
        ]
      },
      {
        "key": "bc",
        "subject": "today",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "prevLow",
        "subject": "today",
        "bandKeys": [
          "prevHigh",
          "tc"
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
          "s1",
          "prevLow"
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
        key: "BC-A-A-AA-AA-EU2L4-RH-GapBB-S1",
        label: "pMega-S1",
        parentKey: "A-A-AA-AA-EU2L4",
        condition: (r) => passesView(r, "A-A-AA-AA-EU2L4") && matchesGapBadge(r, "RH-GapBB"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "L1 (today's S1)",
        getTarget: (r) => r.todayCPR.s1,
        entryLabel: "BC (today's BC)",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
      {
        "key": "r4",
        "subject": "previous",
        "bandKeys": [
          "r2",
          "r1"
        ]
      },
      {
        "key": "r3",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "tc"
        ]
      },
      {
        "key": "r2",
        "subject": "previous",
        "bandKeys": [
          "prevHigh",
          "tc"
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
        key: "BC-A-A-AA-AA-EU2L4-RH-GapBB-S2",
        label: "A6-EU2L4-pUltra-S2",
        parentKey: "A-A-AA-AA-EU2L4",
        condition: (r) => passesView(r, "A-A-AA-AA-EU2L4") && matchesGapBadge(r, "RH-GapBB"),
        standalone: true,
        kind: "view",
        direction: "Down",
        targetLabel: "L2 (today's S2)",
        getTarget: (r) => r.todayCPR.s2,
        entryLabel: "BC (today's BC)",
        getEntry: (r) => r.todayCPR.bc,
        stoplossLabel: "R1 (today's R1)",
        getStoploss: (r) => r.todayCPR.r1,
        levelCheckDefs: [
          {
            "key": "r4",
            "subject": "previous",
            "bandKeys": [
              "r2",
              "r1"
            ]
          },
          {
            "key": "r3",
            "subject": "previous",
            "bandKeys": [
              "prevHigh",
              "tc"
            ]
          },
          {
            "key": "r2",
            "subject": "previous",
            "bandKeys": [
              "prevHigh",
              "tc"
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
              "s3",
              "s4"
            ]
          }
        ],
      },
  // Added from PatternStats "Missing Subpatterns" for LEVEL ABOVE.
  { key: "A-A-OA-AA-CU4L4", label: "A-A-OA-AA-CU4L4", parentKey: "A-A-OA-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 100 },
  { key: "A-C-C-AA-CU4L4", label: "A-C-C-AA-CU4L4", parentKey: "A-C-C-AA", kind: "pattern", condition: (r) => r.CU4L4, order: 100 },
  { key: "A-C-E-AA-CU3L2", label: "A-C-E-AA-CU3L2", parentKey: "A-C-E-AA", kind: "pattern", condition: (r) => r.CU3L2, order: 100 },
  { key: "A-C-RA-AA-CU4L3", label: "A-C-RA-AA-CU4L3", parentKey: "A-C-RA-AA", kind: "pattern", condition: (r) => r.CU4L3, order: 100 },
  { key: "A-E-AA-C-EU3L4", label: "A-E-AA-C-EU3L4", parentKey: "A-E-AA-C", kind: "pattern", condition: (r) => r.EU3L4, order: 100 },
  { key: "A-E-AA-E-EU3L3", label: "A-E-AA-E-EU3L3", parentKey: "A-E-AA-E", kind: "pattern", condition: (r) => r.EU3L3, order: 100 },
  { key: "A-E-AA-LB-EU2L3", label: "A-E-AA-LB-EU2L3", parentKey: "A-E-AA-LB", kind: "pattern", condition: (r) => r.EU2L3, order: 100 },
];
