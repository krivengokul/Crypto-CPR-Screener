import { OHLC, CPRResult, analyzeCPR } from "./cpr";
import { fetchTopUSDTSymbols, fetchDailyKlines } from "./binance";
import { fetchDeltaPerps } from "./delta";

export type BacktestSource = "binance" | "delta";

/**
 * A backtestable pattern needs a machine-readable target level, not just
 * the descriptive "Target" text in Screener.tsx's legend. Each entry here
 * pins down: which CPR level counts as "the target" for that pattern, and
 * whether price needs to go UP to it (bullish) or DOWN to it (bearish).
 *
 * v1 scope: only 2 patterns, chosen to exercise both target styles you'll
 * need later — "target = today's own CPR level" vs "target = previous
 * day's CPR level". Add more entries here once this is validated; each one
 * needs its target level worked out from that pattern's legend/condition.
 */
export interface BacktestTargetDef {
  key: string;          // matches passesPattern's pattern-key string exactly
  label: string;        // display name
  direction: "bullish" | "bearish";
  getTarget: (r: CPRResult) => number;
  targetLabel: string;  // e.g. "U4 (today's R4)"
  // NEW: Entry/Stoploss for every View. Rule: if the View's target is one of
  // today's/prev's R-levels (r1-r4, i.e. direction "bullish"), Entry is
  // today's TC and Stoploss is today's S1. If the target is one of
  // today's/prev's S-levels (s1-s4, i.e. direction "bearish"), Entry is
  // today's BC and Stoploss is today's R1.
  getEntry: (r: CPRResult) => number;
  entryLabel: string;    // e.g. "TC (today's TC)"
  getStoploss: (r: CPRResult) => number;
  stoplossLabel: string; // e.g. "S1 (today's S1)"
}

export const BACKTEST_TARGETS: BacktestTargetDef[] = [
  // Renamed from the former 6PM HHLLA/RRHH-Gap View. This View is now nested
  // under the A-A-AA-AA-EU3L4 Pattern. Its effective condition is the
  // A-A-AA-AA structural base + EU3L4 (the parent Pattern) + HLGap-B,
  // replacing the old RRGap + HHGap conditions. Bullish, targets today's
  // own R4 / U4.
  {
    key: "A-A-AA-AA-EU3L4-GapB",
    label: "A-A-AA-AA-EU3L4-GapB",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: A-A-AA-AA-S1pPDH-U3 — nested as a View under the
  // A-A-AA-AA-U2L4 Pattern. Bullish U3 target (today's R3). Condition:
  // A-A-AA-AA + U2L4 + LevelsAbove + today's S1 above prev day's PDH.
  // Target changed from prev day's R3 to TODAY'S R3 per user request.
  {
    key: "A-A-AA-AA-S1pPDH-U3",
    label: "A-A-AA-AA-S1pPDH-U3",
    direction: "bullish",
    targetLabel: "U3 (today's R3)",
    getTarget: (r) => r.todayCPR.r3,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: A-A-AA-AA-EU2L4-ApR2 — nested as a View under the
  // A-A-AA-AA-EU2L4 Pattern. Bullish U4 target, using the existing
  // backtest time horizon.
  {
    key: "A-A-AA-AA-EU2L4-ApR2",
    label: "A-A-AA-AA-EU2L4-ApR2",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // RENAMED from "A-A-AA-AA:Candidate-Unfavorable". This remains a
  // target-graded View, now nested under the A-A-AA-AA-U3L4 Pattern.
  {
    key: "A-A-AA-AA-U3L4-pGapB",
    label: "A-A-AA-AA-U3L4-pGapB",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "7PM:MoMi->U4:2AM" — nested under "LEVEL ABOVE" → Pattern "EU2L4".
  // Bullish, targets today's own R4 / U4 by ~2AM.
  {
    key: "7PM:MoMi->U4:2AM",
    label: "7PM:MoMi->U4:2AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "7PM:MoMi-<L4:2AM" — bearish sibling of "7PM:MoMi->U4:2AM", same
  // nesting ("LEVEL ABOVE" → Pattern "EU2L4") and same base condition
  // (p-CU1L1, pMicro/Mini widths, both PDLs below L1), but split on
  // today's PDL vs prev day's pivot: this variant fires when
  // todayCPR.PDL < prevCPR.pivot, targeting today's own S4 / L4 by ~2AM.
  {
    key: "7PM:MoMi-<L4:2AM",
    label: "7PM:MoMi-<L4:2AM",
    direction: "bearish",
    targetLabel: "L4 (today's S4)",
    getTarget: (r) => r.todayCPR.s4,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  // NEW: "6PM:APHS1A-FAU4:9PM" — nested under "LEVEL ABOVE" → Pattern
  // "EU2L4", alongside its "7PM:MoMi->U4:2AM" /
  // "7PM:MoMi-<L4:2AM" siblings. Condition: LevelsAbove + EU2L4 + the
  // prev day's own pivot sub-label being EU3L4 (p-EU3L4) + today's BC
  // above prev day's own PDH + today's S1 above prev day's TC — see
  // ScreenerUtils.tsx. Bullish, entry ~6PM, targets Far Above today's R4
  // by ~9PM.
  {
    key: "6PM:APHS1A-FAU4:9PM",
    label: "6PM:APHS1A-FAU4:9PM",
    direction: "bullish",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "9AM:pPALPApH-FAU4:2PM" — nested under "LEVEL ABOVE" → Pattern
  // "U4L3" (see BACKTEST_CATEGORIES below), alongside its "EU2L4"
  // siblings. Condition: LevelsAbove + raw U4L3 flag + prev day's Pivot
  // above today's PDL + today's own Pivot above today's PDH — see
  // ScreenerUtils.tsx. Bullish, entry ~9AM, targets Far Above today's R4
  // by ~2PM.
  {
    key: "9AM:pPALPApH-FAU4:2PM",
    label: "9AM:pPALPApH-FAU4:2PM",
    direction: "bullish",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // REMOVED: "HA-U1>PU4" — its condition (cprRising && strWideCPR &&
  // todayCPR.r1 > prevCPR.r4) is identical to the "U1 > pU4" (R1AbovePR4)
  // parent category's own base condition, so it was just a duplicate
  // "dot" in the Backtest dropdown. Use the "U1 > pU4" category's own
  // symbol-list scan instead.
  // RENAMED from "9AM:APHS1A-FAU4:4AM". Nested under the "U1 > pU4"
  // category's new "A-A-AA-AA-EUTL3" Subpattern (moved out from directly
  // under "EUTL3"): the structural A-A-AA-AA check (see PIVOT_PATTERNS in
  // ScreenerUtils.tsx) was added on top of the existing EUTL3 + BC>pPDH +
  // S1>pTC condition. Bullish, same PU4 target style as the (now-removed)
  // HA-U1>PU4 (matches ViewsSidebar's R1AbovePR4 sub-pattern).
  {
    key: "9A:A-A-AA-AA-EUTL3-S1ATC-U4:4A",
    label: "9A:A-A-AA-AA-EUTL3-S1ATC-U4:4A",
    direction: "bullish",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // RENAMED from "6AM:pX-APHS1A-pL4:4AM". Nested under the "U1 > pU4"
  // (R1AbovePR4) category's "A-A-AA-AA-EUTL3" Subpattern (moved out from
  // directly under "EUTL3"), right after its
  // "9A:A-A-AA-AA-EUTL3-S1ATC-U4:4A" sibling. Condition: this category's
  // U1>pU4 condition + the structural A-A-AA-AA check (see PIVOT_PATTERNS
  // in ScreenerUtils.tsx, newly added here) + Pattern EUTL3 + today's BC
  // above prev day's PDH + today's S1 above prev day's TC + the prev
  // day's own pivot sub-label being EU3L4. Bearish, targets pL4 (prev
  // day's S4) by ~4AM.
  {
    key: "6A:A-A-AA-AA-EUTL3-S1ATCpE-pL4:4A",
    label: "6A:A-A-AA-AA-EUTL3-S1ATCpE-pL4:4A",
    direction: "bearish",
    targetLabel: "pL4 (prev day's S4)",
    getTarget: (r) => r.prevCPR.s4,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  // NEW: "8AM:APHS1A-FAU4:4AM" — nested under the "U1 > pU4" (R1AbovePR4)
  // category's "EU1L3" Pattern, alongside its
  // "9AM:APHS1A-FAU4:4AM" sibling. Base condition: this category's
  // U1>pU4 condition AND the raw EU1L3 flag AND today's BC above prev
  // day's own PDH AND today's S1 above prev day's TC — see
  // ScreenerUtils.tsx. Bullish, targets Far Above U4 (today's R4) by ~4AM.
  {
    key: "8AM:APHS1A-FAU4:4AM",
    label: "8AM:APHS1A-FAU4:4AM",
    direction: "bullish",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "RRHH-BB:SSLL-AA:SSLLGap" — duplicate of "6A:HLC-SSLL:R4-6P", added only
  // for the Backtest dropdown (not exposed in Screener/left-nav/legend).
  // Same condition and target as its 6A:HLC-SSLL:R4-6P sibling.
  {
    key: "RRHH-BB:SSLL-AA:SSLLGap",
    label: "RRHH-BB:SSLL-AA:SSLLGap",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // RENAMED from "SMi-L1pU1>-APU4:11PM": all previous conditions removed.
  // "6A:HLC-SSLL:R4-6P" — nested under "COMPRESSED". Condition:
  // compressed + HHLL-C + SSLL-AA + RRHH-BB + SSGap + LLGap — see
  // ScreenerUtils.tsx. Bullish, entry ~6AM, targets today's own R4 (U4)
  // by ~6PM.
  {
    key: "6A:HLC-SSLL:R4-6P",
    label: "6A:HLC-SSLL:R4-6P",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // RENAMED from "S0-L1pU1>-AU4:7PM": all previous conditions removed.
  // "8A:HLC-SSHH:S4-1P" — second sub-pattern under "COMPRESSED". Condition:
  // compressed + RRSSGapCategory SSGap + RRHHCategory RRHH-BB +
  // SSLLCategory SSLL-AA + HHLLCategory HHLL-C + PDHPDLGapCategory HHGap +
  // prevCPR.HLSwitch HL-A + todayCPR.HLSwitch HL-B with hlGapWinner
  // "today" (HLGap-B) — see ScreenerUtils.tsx. Bearish, entry ~8AM,
  // targets today's own S4 (L4) by ~1PM.
  {
    key: "8A:HLC-SSHH:S4-1P",
    label: "8A:HLC-SSHH:S4-1P",
    direction: "bearish",
    targetLabel: "L4 (today's S4)",
    getTarget: (r) => r.todayCPR.s4,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  // RENAMED from "T0-L1pU1>-BPL4:5AM": all previous conditions removed.
  // "9AM:RHLB-RRHH:5AM" — third sub-pattern under "COMPRESSED".
  // Condition: compressed + RRSSGapCategory RRGap + RRHHCategory RRHH-BB +
  // HHLLCategory HHLL-B + PDHPDLGapCategory HHGap — see ScreenerUtils.tsx.
  // Bearish, targets today's own S2 (L2) by ~5AM.
  {
    key: "9AM:RHLB-RRHH:5AM",
    label: "9AM:RHLB-RRHH:5AM",
    direction: "bearish",
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  // RENAMED from "RHLB-RRHHpGap": View nested under the "RHLB-RRHHpGap"
  // Pattern arrow in COMPRESSED (not exposed in Screener/left-nav/legend).
  // Condition: same base as its "9AM:RHLB-RRHH:5AM" cousin (compressed +
  // RRGap + RRHH-BB + HHLL-B + HHGap) PLUS SSRRCategory RRSS-C +
  // SSLLCategory SSLL-C + prevCPR.HLSwitch HL-A with hlGapWinner "prev"
  // (pHLGap-A) + todayCPR.HLSwitch HL-A PLUS prev day's PDL above today's
  // pivot + prev day's own pivot above today's PDH — see
  // ScreenerUtils.tsx. Bullish, entry ~8AM, targets today's own R4 (U4)
  // by ~5PM.
  {
    key: "8A:pLAPpPAH:R4-5P",
    label: "8A:pLAPpPAH:R4-5P",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // RENAMED from "eXHrL3U3-AU4": all previous conditions removed and moved
  // from "Outside CPR" into "EXPANDED". "6A:SLE-RRHH:R2-6A" — sub-pattern
  // under "EXPANDED". Condition: expanded + RRSSGapCategory RRGap +
  // RRHHCategory RRHH-AA + SSLLCategory SSLL-E + HHLLCategory HHLL-A +
  // PDHPDLGapCategory HHGap + prevCPR.HLSwitch HL-B (pHL-B) +
  // todayCPR.HLSwitch HL-A with hlGapWinner "today" (HLGap-A) — see
  // cpr.ts / ScreenerUtils.tsx. Bullish, entry ~6AM, targets today's own
  // R2 (U2) by ~6AM.
  {
    key: "6A:SLE-RRHH:R2-6A",
    label: "6A:SLE-RRHH:R2-6A",
    direction: "bullish",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "ss-EL1U4-U4:10PM" — nested under the "BELOW LEVEL4"
  // (S1BelowPS4) category's "EL1U4" Pattern. Bullish, targets U4
  // (today's R4) by ~10PM.
  {
    key: "ss-EL1U4-U4:10PM",
    label: "ss-EL1U4-U4:10PM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // RENAMED from "BC>pPDL-U3:5AM", then from "3P:HA-pABOVE:pR4-3A".
  // "3P:HA-pBELOWR1:R2-3A" — nested under "LEVEL BELOW" (levelsbelow)
  // category. Bullish — per ScreenerUtils.tsx's condition (LevelsBelow +
  // SSGap + RRHH-HA + SSLL-BB + HHLL-E + LLGap + pHL-B + HLGap-A + prev
  // day's S3 above today's S1 + prev day's own Pivot above today's R1) —
  // targets today's own R2 (U2) by ~3AM (+1).
  {
    key: "3P:HA-pBELOWR1:R2-3A",
    label: "3P:HA-pBELOWR1:R2-3A",
    direction: "bullish",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "3P:HA-pABOVER1:S2-6P" — replica of "3P:HA-pBELOWR1:R2-3A" with
  // the same base conditions, but prev day's own Pivot BELOW today's R1
  // (instead of above). Bearish, targets today's own S2 (L2) by ~6PM.
  {
    key: "3P:HA-pABOVER1:S2-6P",
    label: "3P:HA-pABOVER1:S2-6P",
    direction: "bearish",
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  // NEW: "2P:HA-HABOVEpR1:R4-4P" — replica of "3P:HA-pBELOWR1:R2-3A" with
  // the same base conditions, but today's own R1 above prev day's PDH
  // (instead of prev day's own Pivot above today's R1) and today's R3
  // above prev day's R4 (instead of prev day's R3). Bullish, targets
  // today's own R4 (U4) by ~4PM.
  {
    key: "2P:HA-HABOVEpR1:R4-4P",
    label: "2P:HA-HABOVEpR1:R4-4P",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "PDH>pTC-U4:5AM" — nested directly under "LEVEL BELOW" (levelsbelow)
  // category, alongside the "HALB-SSLLGap" Pattern. Base condition:
  // this category's LevelsBelow condition AND today's PDH (todayCPR.prevHigh)
  // above prev day's TC (prevCPR.tc) — see ScreenerUtils.tsx. Bullish,
  // targets U4 (today's R4), same target style as its sibling
  // BC>pPDL-U3:5AM.
  {
    key: "PDH>pTC-U4:5AM",
    label: "PDH>pTC-U4:5AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "11AM:pCPR1AHi-FApU4:1PM" — nested under "LEVEL BELOW"
  // (levelsbelow) category's new "L4U3" Pattern (see
  // BACKTEST_CATEGORIES below), alongside its "HALB-SSLLGap"/"L3U3" siblings.
  // Base condition: this category's LevelsBelow condition AND the raw
  // L4U3 flag AND HHLLBelow — see ScreenerUtils.tsx. Bullish, targets
  // Far Above pU4 (prev day's R4) by ~1PM.
  {
    key: "11AM:pCPR1AHi-FApU4:1PM",
    label: "11AM:pCPR1AHi-FApU4:1PM",
    direction: "bullish",
    targetLabel: "FApU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "2P:L4U4-pLAP:R4-2A" — View nested under "LEVEL BELOW"
  // (levelsbelow) category's "RHSLB-SSLLpGap" Pattern (renamed from
  // "2P:RHSLB-SSLLpGap:2A" — see BACKTEST_CATEGORIES below). Base
  // condition: the shared "RHSLB-SSLLpGap" flag AND the raw L4U4 flag AND
  // prev day's own PDL above today's Pivot — see ScreenerUtils.tsx.
  // Bullish, entry ~2PM, targets today's own R4 (U4) by ~2AM.
  {
    key: "2P:L4U4-pLAP:R4-2A",
    label: "2P:L4U4-pLAP:R4-2A",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "TiMe-EUTL3-AU4:2PM" — nested directly under "U1 > pU4"
  // (R1AbovePR4), alongside "A-A-AA-AA-EUTL3" (which nests
  // "9A:A-A-AA-AA-EUTL3-S1ATC-U4:4A", renamed from
  // "9AM:APHS1A-FAU4:4AM"). Bullish, Pattern EUTL3 +
  // pTiny/Mega width combo, targets AU4 (prev day's R4) by ~2PM.
  {
    key: "TiMe-EUTL3-AU4:2PM",
    label: "TiMe-EUTL3-AU4:2PM",
    direction: "bullish",
    targetLabel: "AU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "SMg-exHiL2L1-U4:3AM" — nested under "U1 > pU4" via the
  // "EL1L2" Pattern. Bullish, targets U4 (today's R4) @ 3AM.
  {
    key: "SMg-exHiL2L1-U4:3AM",
    label: "SMg-exHiL2L1-U4:3AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "6AM:MegMeg-L3:8PM" — nested under "U1 > pU4" (R1AbovePR4) via
  // the new "EU1L4" Pattern. Base R1AbovePR4 condition +
  // raw EU1L4 flag + prev/today CPR both width category Mega
  // (5.00%-10.00%). Bearish, targets L3 (today's S3) by ~8PM.
  {
    key: "6AM:MegMeg-L3:8PM",
    label: "6AM:MegMeg-L3:8PM",
    direction: "bearish",
    targetLabel: "L3 (today's S3)",
    getTarget: (r) => r.todayCPR.s3,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  // NEW: "8AM:CoLApHA-U4+1:8AM" — Direct View, sits directly on the
  // "inside-cpr" category's own subPatternKeys in BACKTEST_CATEGORIES
  // (NOT nested under a "Pattern"  / arrow like its
  // "8AM:SRBHHLLA-pU4+1:8AM" sibling just below — matches ViewsSidebar's
  // left-nav, where it's a top-level item under "Inside CPR" rather than
  // one of its Views). Base InsideCPR condition + today's PDL above prev
  // day's S1 ("PDL>pS1") + EITHER today's PDH above prev day's R1
  // ("PDH>pR1") OR prev day's PDH above today's R1 ("pPDH>R1"). Bullish,
  // targets pU4 (prev day's R4), entry ~8AM, by ~8AM the next day.
  {
    key: "8AM:CoLApHA-U4+1:8AM",
    label: "8AM:CoLApHA-U4+1:8AM",
    direction: "bullish",
    targetLabel: "Far Above U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "8AM:SRBHHLLA-pU4+1:8AM" — nested under "CPR Inside" (inside-cpr)
  // via the new "CU3L3" Pattern (see BACKTEST_CATEGORIES
  // below). Base inside-cpr condition + raw CU3L3 flag + pLarge/Medium
  // width combo + p-PDL<L1 + PDH>U1 + prev R1>today R1 + prev S1>today S1
  // + today's PDH/PDL above prev day's PDH/PDL. Bullish, targets pU4
  // (prev day's R4), entry ~8AM, by ~8AM the next day.
  {
    key: "8AM:SRBHHLLA-pU4+1:8AM",
    label: "8AM:SRBHHLLA-pU4+1:8AM",
    direction: "bullish",
    targetLabel: "PU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "2PM:pPDHLA-SRA-U4:7PM" — nested under "CPR Inside" (inside-cpr)
  // via the new "CU4L4" Pattern (see BACKTEST_CATEGORIES
  // below). Base inside-cpr condition + raw CU4L4 flag + pLarge/Large
  // width combo + p-PDH>U1 + PDL<L1 + today R1>prev R1 + today S1>prev S1
  // + prev day's PDH/PDL above today's PDH/PDL. Bullish, entry ~2PM,
  // targets U4 (today's R4) by ~7PM.
  // MOVED: "8AM:pPDHA-SRA-U4+2:2AM" — was nested under "CPR Inside"
  // (inside-cpr) via the "EU4L4" Pattern; now nested under "LEVEL ABOVE"
  // (levelsabove) via "A-B-C-C" → "A-B-C-C-EU4L4" instead (see
  // BACKTEST_CATEGORIES below). Base condition = PIVOT_PATTERNS["A-B-C-C"]
  // (replaces the old InsideCPR gate) + raw EU4L4 flag + today's SSRRAbove
  // + prev day's PDH above today's PDH + prev day's PDL above today's PDL
  // + (if today's own PDH is below today's own R1, additionally require
  // prev day's PDH above today's R1). Bullish, entry ~8AM, targets today's
  // own R4 / U4 two days out (+2), by ~2AM.
  {
    key: "8AM:pPDHA-SRA-U4+2:2AM",
    label: "8AM:pPDHA-SRA-U4+2:2AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  {
    key: "2PM:pPDHLA-SRA-U4:7PM",
    label: "2PM:pPDHLA-SRA-U4:7PM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "2PM:SSLLpRRHHA-ApU4:5PM" — nested directly under "Overlap Below"
  // (overlapping-lower, see BACKTEST_CATEGORIES below), same shape as
  // "8AM:CoLApHA-U4+1:8AM" sitting directly on "inside-cpr"'s own
  // subPatternKeys rather than behind a Pattern. Base
  // overlapLower condition + SSLL-AA (today's S1 AND today's PDL both
  // above the higher of prev's S1/PDL, full separation) + HHRRBelow (today's R1 AND
  // today's PDH both below the lower of prev's R1/PDH) + (prev day's R1
  // above today's R2 OR today's S3 above prev day's S2) — see cpr.ts /
  // ScreenerUtils.tsx. Bullish, entry ~2PM, targets ApU4 (prev day's R4)
  // by ~5PM.
  {
    key: "2PM:SSLLpRRHHA-ApU4:5PM",
    label: "2PM:SSLLpRRHHA-ApU4:5PM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "8AM:SSLLpRRHHA-L4:1PM" — bearish sibling of
  // "2PM:SSLLpRRHHA-ApU4:5PM", nested directly under "Overlap Below"
  // (overlapping-lower). Same base overlapLower + SSLL-AA + HHRRBelow
  // condition, but with the comparison direction reversed (prev day's R1
  // below today's R2 OR today's S3 below prev day's S2) — see cpr.ts /
  // ScreenerUtils.tsx. Bearish, entry ~8AM, targets today's own L4 (S4)
  // by ~1PM.
  {
    key: "8AM:SSLLpRRHHA-L4:1PM",
    label: "8AM:SSLLpRRHHA-L4:1PM",
    direction: "bearish",
    targetLabel: "L4 (today's S4)",
    getTarget: (r) => r.todayCPR.s4,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  // NEW: "9AM:SSRRBHHLLA-U4:9PM" — RENAMED from "Exp-U3>U3", nested
  // directly under "Overlap Below" (overlapping-lower, see
  // BACKTEST_CATEGORIES below), same shape as its
  // "2PM:SSLLpRRHHA-ApU4:5PM" sibling. Base overlapLower condition +
  // HHLLAbove (today's PDH AND today's R1 both above prev's R1/PDH) +
  // SSRRBelow (today's S1 AND today's PDL both below prev's S1/PDL) —
  // see cpr.ts / ScreenerUtils.tsx. Bullish, entry ~9AM, targets today's
  // own R4 / U4 by ~9PM.
  {
    key: "9AM:SSRRBHHLLA-U4:9PM",
    label: "9AM:SSRRBHHLLA-U4:9PM",
    direction: "bullish",
    targetLabel: "U4 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // MOVED: "9AM:pRRHHLLA-U4:9PM" — nested under the "pRRHHLLA" Pattern
  // (arrow), which itself sits under "Overlap Below" (overlapping-lower,
  // see BACKTEST_CATEGORIES below), sibling of "9AM:SSRRBHHLLA-U4:9PM".
  // Base overlapLower condition + HHRRBelow (today's R1 AND today's PDH
  // both below the lower of prev's R1/PDH) + HHLLAbove (today's PDH
  // strictly above prev's PDH AND today's PDL >= prev's PDL) + (today's
  // R1 above prev day's TC) + (today's S2 above prev day's PDH) +
  // (today's S2 above prev day's S2) + (prev day's PDH above today's S1)
  // — see cpr.ts / ScreenerUtils.tsx. Bullish, entry ~9AM, targets
  // today's own U4 by ~9PM.
  {
    key: "9AM:pRRHHLLA-U4:9PM",
    label: "9AM:pRRHHLLA-U4:9PM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "pRRHHLLA" — exposed as its own direct View (subPattern) on
  // "Overlap Below" (overlapping-lower, see BACKTEST_CATEGORIES below),
  // in addition to its "9AM:pRRHHLLA-U4:9PM" child nested under the
  // "pRRHHLLA" Pattern (arrow) above. Uses the base overlapLower +
  // HHRRBelow + HHLLAbove condition only (see passesPattern's own
  // "pRRHHLLA" case in ScreenerUtils.tsx — no extra conditions), target
  // graded the same as its "9AM:pRRHHLLA-U4:9PM" sibling.
  {
    key: "pRRHHLLA",
    label: "pRRHHLLA",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: "B-B-BB-BB-L4U4-pLTC-U2" — View nested under the "B-B-BB-BB-L4U4"
  // Pattern in "LEVEL BELOW" (see its subPatternKeys entry in
  // BACKTEST_CATEGORIES below, and the matching case in passesPattern in
  // ScreenerUtils.tsx). Bullish, targets today's own R2 (U2).
  {
    key: "B-B-BB-BB-L4U4-pLTC-U2",
    label: "B-B-BB-BB-L4U4-pLTC-U2",
    direction: "bullish",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  // NEW: target definitions for "B-B-BB-BB" and its four L4U4/L3U4/L4U3/
  // L3U3 children in "LEVEL BELOW" (previously symbol-list-only scans
  // with no defined target — see BACKTEST_CATEGORIES below). All five
  // graded bearish against today's own S2 (L2) per user request.
  {
    key: "B-B-BB-BB",
    label: "B-B-BB-BB",
    direction: "bearish",
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  {
    key: "B-B-BB-BB-L4U4",
    label: "B-B-BB-BB-L4U4",
    direction: "bearish",
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  {
    key: "B-B-BB-BB-L3U4",
    label: "B-B-BB-BB-L3U4",
    direction: "bearish",
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  {
    key: "B-B-BB-BB-L4U3",
    label: "B-B-BB-BB-L4U3",
    direction: "bearish",
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  {
    key: "B-B-BB-BB-L3U3",
    label: "B-B-BB-BB-L3U3",
    direction: "bearish",
    targetLabel: "L2 (today's S2)",
    getTarget: (r) => r.todayCPR.s2,
    getEntry: (r) => r.todayCPR.bc,
    entryLabel: "BC (today's BC)",
    getStoploss: (r) => r.todayCPR.r1,
    stoplossLabel: "R1 (today's R1)",
  },
  // NEW: target definitions for "E-E-AA-BB"'s five nested Subpatterns
  // (EL1U2/EU1L2/EU2L2/EU1L3/EL1U1 — see BacktestSubCategoryDef.patterns
  // in the interfaces above and BACKTEST_CATEGORIES below). Selecting one
  // of these Subpatterns (arrow ↳, nested under the "E-E-AA-BB" Pattern)
  // now grades against the specific target defined here instead of
  // pivotLevelBacktestSymbolOnDate's hardcoded bullish U4/R4 default — see
  // that function's BACKTEST_TARGETS lookup. All five bullish against
  // today's own R2 (U2) per user request.
  {
    key: "E-E-AA-BB-EL1U2",
    label: "E-E-AA-BB-EL1U2",
    direction: "bullish",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  {
    key: "E-E-AA-BB-EU1L2",
    label: "E-E-AA-BB-EU1L2",
    direction: "bullish",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  {
    key: "E-E-AA-BB-EU2L2",
    label: "E-E-AA-BB-EU2L2",
    direction: "bullish",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  {
    key: "E-E-AA-BB-EU1L3",
    label: "E-E-AA-BB-EU1L3",
    direction: "bullish",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
  {
    key: "E-E-AA-BB-EL1U1",
    label: "E-E-AA-BB-EL1U1",
    direction: "bullish",
    targetLabel: "U2 (today's R2)",
    getTarget: (r) => r.todayCPR.r2,
    getEntry: (r) => r.todayCPR.tc,
    entryLabel: "TC (today's TC)",
    getStoploss: (r) => r.todayCPR.s1,
    stoplossLabel: "S1 (today's S1)",
  },
];

/**
 * NEW: Category groupings — a "category" is a broad, non-specific base
 * condition (e.g. "compressed" = the COMPRESSED base condition) that itself has
 * no single well-defined target, but has one or more specific sub-patterns
 * nested under it that DO have defined targets (see BACKTEST_TARGETS).
 *
 * Selecting a category in the UI runs runCategoryScan (below): it lists
 * every symbol matching the category's base condition on the entry date,
 * with their CPR data, but WITHOUT Target/Result/Hit Date — there's no
 * single target to grade against for the category as a whole. Selecting
 * one of its subPatternKeys instead runs the normal runBacktest flow
 * against that pattern's specific target.
 *
 * NEW: patterns — a category can additionally nest one or more
 * "Pattern" sub-categories (e.g. "CPR Inside" → Pattern
 * "CU4L4"). A Pattern is itself just another
 * symbol-list-only, single-date, no-target scan — same as a category —
 * except its base condition is the PARENT category's condition AND the
 * named Pattern's raw flag (see matchesPatternFlag in
 * ScreenerUtils.tsx), both evaluated together. Selecting one of ITS
 * subPatternKeys runs the normal runBacktest flow (single date or date
 * range) against that pattern's specific target, same as a top-level
 * category's direct sub-patterns.
 */
export interface BacktestSubCategoryDef {
  key: string;              // Pattern label (matches matchesPatternFlag's `label` param, e.g. "U3L4")
  label: string;            // display name, e.g. "U3L4"
  subPatternKeys: string[]; // BACKTEST_TARGETS keys (Views, leaf/graded) nested directly under this Pattern
  // NEW: patterns — a Pattern can itself nest one or more "Subpattern"
  // children (e.g. "E-E-AA-BB" → Subpattern "E-E-AA-BB-EL1U2"), rendered
  // with the same arrow (↳) treatment as a top-level Pattern rather than
  // as a flat View bullet. Same recursive shape as
  // BacktestCategoryDef.patterns: a Subpattern's base condition is the
  // PARENT Pattern's condition AND the named Subpattern's own raw flag
  // (see matchesPatternFlag/passesPattern in ScreenerUtils.tsx), and it
  // can in turn nest its own subPatternKeys (Views) once specific
  // targets are defined for it.
  patterns?: BacktestSubCategoryDef[];
}

export interface BacktestCategoryDef {
  key: string;                          // matches passesPattern's BASE category key (e.g. "compressed")
  label: string;                        // display name, e.g. "LittleCPR Above"
  subPatternKeys?: string[];            // BACKTEST_TARGETS keys nested directly under this category
  patterns?: BacktestSubCategoryDef[]; // NEW: Pattern sub-categories nested under this category
  /** Optional explicit ordering for mixed direct Views and Pattern entries. */
  orderedEntries?: { kind: "subPattern" | "pattern"; key: string }[];
}

export const BACKTEST_CATEGORIES: BacktestCategoryDef[] = [
  // NEW: "TOP 15 GAINERS" / "TOP 15 LOSERS" — ranking categories, not
  // CPR-shape filters. passesPattern's "top15gainers"/"top15losers" cases
  // (ScreenerUtils.tsx) let every symbol through the base-condition check,
  // so runCategoryScan returns the full universe with each symbol's
  // entry-day changePct already attached (see closeAndChange below);
  // BacktestPanel then sorts by changePct and keeps only the top 15 in
  // each direction before rendering. No subPatternKeys/patterns, same
  // shape as "Equal CPR" below — symbol-list-only, no single target to
  // grade.
  { key: "top15gainers", label: "TOP 15 GAINERS" },
  { key: "top15losers", label: "TOP 15 LOSERS" },
  {
    key: "levelsabove",
    label: "LEVEL ABOVE",
    // RENAMED from "9AM:MegL-U4+1:3PM": all previous conditions removed.
    // The former 6PM View now lives under the A-A-AA-AA-EU3L4 Pattern
    // below.
    subPatternKeys: [],
    // NEW: "EU2L4" Pattern (arrow) — same shape as
    // CL4U3/L3U3/U3L4 elsewhere. Base condition = parent
    // levelsabove's condition AND the raw EU2L4 flag (see
    // matchesPatternFlag in ScreenerUtils.tsx).
    patterns: [
      {
        key: "EU2L4",
        label: "EU2L4",
        subPatternKeys: ["7PM:MoMi->U4:2AM", "7PM:MoMi-<L4:2AM", "6PM:APHS1A-FAU4:9PM"],
      },
      // NEW: "U4L3" Pattern (arrow) — same shape as its
      // "EU2L4" sibling above. Base condition = parent levelsabove's
      // condition AND the raw U4L3 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). Nests "9AM:pPALPApH-FAU4:2PM".
      {
        key: "U4L3",
        label: "U4L3",
        subPatternKeys: ["9AM:pPALPApH-FAU4:2PM"],
      },
      // RRSSA-{Level}{Gap} — Patterns (arrows), same shape as
      // EU2L4/U4L3 siblings above: base condition = this category's
      // r.LevelsAbove condition AND the raw RRSSA-* flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). Level = HHLLCategory
      // (A/B) crossed with Gap = combined PDHPDLGapCategory ×
      // RRSSGapCategory (HR/HS/LR). Only these of the naive 4×4=16
      // combinations are reachable here — the rest are mathematically
      // impossible under LevelsAbove (see the proof in
      // matchesPatternFlag's comment in ScreenerUtils.tsx) and were left
      // out entirely, same treatment as RRHH-X. Both remaining Gap-based
      // entries (BHS, BLR) are REPLACED below by RRSSA-B{RRHH}-{SSLL} —
      // see that block for the RRHHCategory-then-SSLLCategory re-split —
      // leaving zero Gap-based RRSSA-* entries.
      //
      // RRSSA-B{RRHH}-{SSLL} — 9 Patterns (arrows), REPLACES the old
      // RRSSA-BHS/RRSSA-BLR pair. Base condition = this category's
      // r.LevelsAbove condition AND the raw RRSSA-B* flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). Under HHLL-B,
      // RRSSGapCategory is fully determined by PDHPDLGapCategory, so
      // BHS/BLR were relabeling the same HHLL-B condition twice — merged
      // and re-split by crossing RRHHCategory first, then SSLLCategory
      // on top (same two-axis treatment as RRSSA-A{RRHH}-{SSLL} below,
      // since HHLL-B has both its R1/PDH and S1/PDL relationships in
      // play). Of the 9x9 naive RRHHCategory×SSLLCategory combinations,
      // RRHHCategory is pinned to RRHH-C/RRHH-E/RRHH-RA and SSLLCategory
      // to SSLL-C/SSLL-E/SSLL-LB (see the full proof in
      // matchesPatternFlag's comment in ScreenerUtils.tsx), giving 9
      // independent combinations — not yet checked against real data, so
      // some may come back empty and need trimming later, the same way
      // RRSSA-C{RRHH}/RRSSB-E{RRHH} each trimmed their own reachable set
      // after an empirical check. No target-graded sub-patterns nested
      // under any of them yet, so each shows up as a symbol-list-only
      // scan in the Backtest dropdown until specific targets are
      // defined.
      // RENAMED to the A-{Level}-{RRHH}-{SSLL} convention, same as
      // A-A-{RRHH}-{SSLL} / A-C-{RRHH}-{SSLL} above: RRSSA-BC-C ->
      // A-B-C-C, RRSSA-BC-LB -> A-B-C-LB, RRSSA-BE-E -> A-B-E-E,
      // RRSSA-BE-LB -> A-B-E-LB, RRSSA-BRA-C -> A-B-RA-C, RRSSA-BRA-E ->
      // A-B-RA-E, RRSSA-BRA-LB -> A-B-RA-LB. RRSSA-BC-E and RRSSA-BE-C
      // were REMOVED (confirmed empty against real data), leaving 7 of
      // the original 9.
      { key: "A-B-C-C",     label: "A-B-C-C",     subPatternKeys: [] },
      // NEW: "A-B-C-C-EU4L4" — nested under "A-B-C-C" directly above
      // (same array level — "A-B-C-C" has no `patterns` field of its own,
      // so this sibling entry conveys the nesting via naming, same
      // convention as "EU1L3"/"EUTL3"/"EL1L2" siblings under "R1AbovePR4"
      // or "CU3L3"/"CU4L4"/"EU4L4" siblings under "inside-cpr"). Base
      // condition = PIVOT_PATTERNS["A-B-C-C"] AND the raw EU4L4 flag (see
      // matchesPatternFlag in ScreenerUtils.tsx, which already has an
      // "EU4L4" case). MOVED: "8AM:pPDHA-SRA-U4+2:2AM" now nests here
      // (was under "Inside CPR" → "EU4L4" — see that case's comment in
      // ScreenerUtils.tsx for what changed in its own condition).
      {
        key: "A-B-C-C-EU4L4",
        label: "A-B-C-C-EU4L4",
        subPatternKeys: ["8AM:pPDHA-SRA-U4+2:2AM"],
      },
      { key: "A-B-C-LB",    label: "A-B-C-LB",    subPatternKeys: [] },
      { key: "A-B-E-E",     label: "A-B-E-E",     subPatternKeys: [] },
      { key: "A-B-E-LB",    label: "A-B-E-LB",    subPatternKeys: [] },
      { key: "A-B-RA-C",    label: "A-B-RA-C",    subPatternKeys: [] },
      { key: "A-B-RA-E",    label: "A-B-RA-E",    subPatternKeys: [] },
      { key: "A-B-RA-LB",   label: "A-B-RA-LB",   subPatternKeys: [] },
      // RRSSA-A{RRHH} — 2 Patterns (arrows), REPLACES the old
      // RRSSA-AHR/RRSSA-ALS pair. Base condition = this category's
      // r.LevelsAbove condition AND the raw RRSSA-A* flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). Under HHLL-A,
      // RRSSGapCategory is fully determined by PDHPDLGapCategory (proof
      // in ScreenerUtils.tsx), so AHR/ALS were relabeling the same
      // HHLL-A condition twice — merged into a single gap-agnostic
      // HHLL-A condition, then re-split by crossing against RRHHCategory
      // instead (same treatment as RRSSA-C{RRHH}/RRSSB-E{RRHH} below).
      // Unlike those, this split is EXHAUSTIVELY PROVEN rather than
      // empirically trimmed: under HHLL-A + LevelsAbove, RRHHCategory is
      // provably always either RRHH-AA or RRHH-OA (see the max/min
      // monotonicity proof in ScreenerUtils.tsx) — no other RRHHCategory
      // value is reachable, so nothing here needed backtesting to drop.
      //
      // RRSSA-A{RRHH}-{SSLL} — 4 Patterns (arrows), further re-splits
      // RRSSA-AAA and RRSSA-AOA each by crossing against SSLLCategory.
      // Same max/min monotonicity proof, run over the S1/PDL band this
      // time, ALSO exhaustively pins SSLLCategory to just SSLL-AA/SSLL-OA
      // under HHLL-A + LevelsAbove — but RRHHCategory and SSLLCategory
      // are driven by different level pairs with nothing forcing them to
      // move together, so the cross gives 4 independent combinations,
      // none ruled out mathematically. All 4 were CONFIRMED to have
      // records against real data and are kept. Keys keep the RRHH and
      // SSLL halves visually separated (RRSSA-A{RRHH}-{SSLL}) since both
      // axes already use "A" suffixes.
      // RENAMED to the A-{Level}-{RRHH}-{SSLL} convention (same shape as
      // the "compressed"/C-* and "expanded"/E-* sets): RRSSA-AAA-AA ->
      // A-A-AA-AA, RRSSA-AAA-OA -> A-A-AA-OA, RRSSA-AOA-AA -> A-A-OA-AA,
      // RRSSA-AOA-OA -> A-A-OA-OA. Conditions unchanged.
      //
      // The diagnostic branches below are Pattern entries (not Views).
      // Their predicates are the structural A-A-AA-AA condition AND the
      // branch's raw CPR flag; target-graded Views remain nested beneath the
      // relevant branch.
      { key: "A-A-AA-AA", label: "A-A-AA-AA", subPatternKeys: [] },
      { key: "A-A-AA-AA-U3L3", label: "A-A-AA-AA-U3L3", subPatternKeys: [] },
      { key: "A-A-AA-AA-U4L3", label: "A-A-AA-AA-U4L3", subPatternKeys: [] },
      { key: "A-A-AA-AA-EU2L4", label: "A-A-AA-AA-EU2L4", subPatternKeys: ["A-A-AA-AA-EU2L4-ApR2"] },
      { key: "A-A-AA-AA-U2L4", label: "A-A-AA-AA-U2L4", subPatternKeys: ["A-A-AA-AA-S1pPDH-U3"] },
      { key: "A-A-AA-AA-U3L4", label: "A-A-AA-AA-U3L4", subPatternKeys: ["A-A-AA-AA-U3L4-pGapB"] },
      // NEW: A-A-AA-AA-EU3L4 — structural A-A-AA-AA + raw EU3L4 flag.
      // Nests the renamed former 6PM View, whose leaf adds HLGap-B.
      { key: "A-A-AA-AA-EU3L4", label: "A-A-AA-AA-EU3L4", subPatternKeys: ["A-A-AA-AA-EU3L4-GapB"] },
      { key: "A-A-AA-OA", label: "A-A-AA-OA", subPatternKeys: [] },
      { key: "A-A-OA-AA", label: "A-A-OA-AA", subPatternKeys: [] },
      { key: "A-A-OA-OA", label: "A-A-OA-OA", subPatternKeys: [] },
      // RRSSA-C{RRHH} — 3 Patterns (arrows), REPLACES the old
      // RRSSA-CHS/RRSSA-CLS pair. Base condition = this category's
      // r.LevelsAbove condition AND the raw RRSSA-C* flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). HHLL-C's gap is always
      // SSGap (the old CHS/CLS distinction was PDHPDLGapCategory alone),
      // so the merged HHLL-C condition is instead re-split by crossing
      // against RRHHCategory. Of the 9 non-"none" RRHHCategory values,
      // RRHH-BB/RRHH-OB/RRHH-HA are mathematically impossible under
      // LevelsAbove and RRHH= is negligible (see the proof in
      // matchesPatternFlag's comment in ScreenerUtils.tsx), leaving 5
      // mathematically reachable (AA/OA/C/E/RA) — of those, RRHH-AA and
      // RRHH-OA both came back CONFIRMED EMPTY against real data and
      // were dropped, leaving CC/CE/CRA. No target-graded sub-patterns
      // nested under any of them yet, so each shows up as a
      // symbol-list-only scan in the Backtest dropdown until specific
      // targets are defined.
      // RENAMED to A-C-{RRHH}-{SSLL}, each further re-split by crossing
      // against SSLLCategory (SSLL-AA/SSLL-OA), same convention as
      // A-A-{RRHH}-{SSLL} above: RRSSA-CC -> A-C-C-AA/A-C-C-OA,
      // RRSSA-CE -> A-C-E-AA/A-C-E-OA, RRSSA-CRA -> A-C-RA-AA/A-C-RA-OA.
      { key: "A-C-C-AA", label: "A-C-C-AA", subPatternKeys: [] },
      { key: "A-C-C-OA", label: "A-C-C-OA", subPatternKeys: [] },
      { key: "A-C-E-AA", label: "A-C-E-AA", subPatternKeys: [] },
      { key: "A-C-E-OA", label: "A-C-E-OA", subPatternKeys: [] },
      { key: "A-C-RA-AA", label: "A-C-RA-AA", subPatternKeys: [] },
      { key: "A-C-RA-OA", label: "A-C-RA-OA", subPatternKeys: [] },
      // RRSSA-E + SSLL — 8 combinations.
      // RRSSA-E is the merged LevelsAbove RRSS-E condition (HHLL-E with
      // RRHH-AA or RRHH-OA), crossed with each SSLLCategory. Each entry is
      // a symbol-list-only scan and keeps the corresponding SSLL-* badge.
      // RENAMED to the A-E-{RRHH}-{SSLL} convention, same shape as
      // A-A-{RRHH}-{SSLL}/A-C-{RRHH}-{SSLL} above: RRSSA-EC ->
      // A-E-AA-C/A-E-OA-C, RRSSA-EE -> A-E-AA-E/A-E-OA-E, RRSSA-ELB ->
      // A-E-AA-LB/A-E-OA-LB — each re-split by crossing against
      // RRHHCategory (RRHH-AA/RRHH-OA), the same free axis noted above.
      // REMOVED: "A-E-AA-OB" — despite the comments in
      // ScreenerUtils.PIVOT_PATTERNS claiming it was "defined, using
      // SSLL-LB", no "A-E-AA-OB" key was ever actually added to that
      // object (only "A-E-AA-LB" was) — so matchesPatternFlag/passesPattern
      // fell through to the default case for this key and it ALWAYS
      // returned zero records. Confirmed empty (no records available) and
      // dropped from the dropdown entirely — its real condition (HHLL-E +
      // RRHH-AA + SSLL-LB) already lives under "A-E-AA-LB" above, so no
      // combination is lost.
      { key: "A-E-AA-C",  label: "A-E-AA-C",  subPatternKeys: [] },
      { key: "A-E-OA-C",  label: "A-E-OA-C",  subPatternKeys: [] },
      { key: "A-E-AA-E",  label: "A-E-AA-E",  subPatternKeys: [] },
      { key: "A-E-OA-E",  label: "A-E-OA-E",  subPatternKeys: [] },
      { key: "A-E-AA-LB", label: "A-E-AA-LB", subPatternKeys: [] },
      { key: "A-E-OA-LB", label: "A-E-OA-LB", subPatternKeys: [] },
    ],
    // Keep the complete A-A-AA-AA diagnostic branch at the top of this
    // category's dropdown tree. Direct Views and other Patterns are appended
    // in their existing order below these entries by buildBacktestOptions().
    orderedEntries: [
      { kind: "pattern", key: "A-A-AA-AA" },
      { kind: "pattern", key: "A-A-AA-AA-U3L3" },
      { kind: "pattern", key: "A-A-AA-AA-U4L3" },
      { kind: "pattern", key: "A-A-AA-AA-EU2L4" },
      { kind: "pattern", key: "A-A-AA-AA-U2L4" },
      { kind: "pattern", key: "A-A-AA-AA-U3L4" },
      { kind: "pattern", key: "A-A-AA-AA-EU3L4" },
    ],
  },
  // NEW: "LEVEL BELOW" left-nav section (top of the pattern tree in
  // ViewsSidebar.tsx) — nests the "HALB-SSLLGap" Pattern (REPLACES
  // "CL4U3" here — see matchesPatternFlag in ScreenerUtils.tsx), which
  // in turn nests "3P:HA-pBELOWR1:R2-3A" (RENAMED from "BC>pPDL-U3:5AM",
  // then from "3P:HA-pABOVE:pR4-3A") and its replicas
  // "3P:HA-pABOVER1:S2-6P" and "2P:HA-HABOVEpR1:R4-4P"; note none of the
  // leaf conditions include the raw HALB-SSLLGap flag — see
  // ScreenerUtils.tsx — they're kept nested here only for dropdown
  // grouping, matching the sidebar/legend structure).
  {
    key: "levelsbelow",
    label: "LEVEL BELOW",
    // NEW: "PDH>pTC-U4:5AM" now nests under the "L3U3" Pattern
    //  below (not directly on the category), since it also
    // requires the raw L3U3 flag — see ScreenerUtils.tsx.
    patterns: [
      // MOVED: "B-B-BB-BB" to the very top of this list (above
      // "HALB-SSLLGap") — was previously grouped with its B-B-BB-OB/
      // B-B-OB-BB/B-B-OB-OB siblings further down (see the comment there).
      // Base condition unchanged: this category's r.LevelsBelow condition
      // AND PIVOT_PATTERNS["B-B-BB-BB"] (HHLL-B + RRHH-BB + SSLL-BB).
      { key: "B-B-BB-BB", label: "B-B-BB-BB", subPatternKeys: [] },
      // NEW: four Patterns nested under "B-B-BB-BB" directly above (same
      // array level — "B-B-BB-BB" has no `patterns` field of its own, so
      // these sibling entries convey the nesting via naming, same
      // convention as "A-B-C-C-EU4L4" under "A-B-C-C" or
      // "CU3L3"/"CU4L4"/"EU4L4" under "inside-cpr"). Each base condition =
      // PIVOT_PATTERNS["B-B-BB-BB"] AND its own raw target-window flag
      // (see matchesPatternFlag in ScreenerUtils.tsx, which already has
      // L4U4/L3U4/L4U3/L3U3 cases). No specific target-graded sub-pattern
      // nested under any of them yet — selecting one in the Backtest
      // dropdown runs a symbol-list-only scan.
      {
        key: "B-B-BB-BB-L4U4",
        label: "B-B-BB-BB-L4U4",
        // NEW: nests "B-B-BB-BB-L4U4-pLTC-U2" — parent's raw B-B-BB-BB-L4U4
        // flag PLUS pHLGap-A PLUS "Prev PrevLow > today.tc" (see
        // passesPattern in ScreenerUtils.tsx). Targets today's R2 (U2).
        subPatternKeys: ["B-B-BB-BB-L4U4-pLTC-U2"],
      },
      {
        key: "B-B-BB-BB-L3U4",
        label: "B-B-BB-BB-L3U4",
        subPatternKeys: [],
      },
      {
        key: "B-B-BB-BB-L4U3",
        label: "B-B-BB-BB-L4U3",
        subPatternKeys: [],
      },
      {
        key: "B-B-BB-BB-L3U3",
        label: "B-B-BB-BB-L3U3",
        subPatternKeys: [],
      },
      {
        key: "HALB-SSLLGap",
        label: "HALB-SSLLGap",
        subPatternKeys: ["3P:HA-pBELOWR1:R2-3A", "3P:HA-pABOVER1:S2-6P", "2P:HA-HABOVEpR1:R4-4P"],
      },
      // NEW: "L3U3" — Pattern (arrow), same shape as
      // "CL4U3": base condition = this category's LevelsBelow condition
      // AND the raw L3U3 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). Nests "PDH>pTC-U4:5AM".
      {
        key: "L3U3",
        label: "L3U3",
        subPatternKeys: ["PDH>pTC-U4:5AM"],
      },
      // NEW: "L4U3" — Pattern (arrow), same shape as its
      // "L3U3" sibling: base condition = this category's LevelsBelow
      // condition AND the raw L4U3 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). Nests "11AM:pCPR1AHi-FApU4:1PM".
      {
        key: "L4U3",
        label: "L4U3",
        subPatternKeys: ["11AM:pCPR1AHi-FApU4:1PM"],
      },
      // NEW: "CL4U2" — Pattern (arrow), same shape as its
      // CL4U3/L3U3/L4U3 siblings above: base condition = this
      // category's LevelsBelow condition AND the raw CL4U2 flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). No specific
      // target-graded sub-pattern nested under it yet — selecting it in
      // the Backtest dropdown runs a symbol-list-only category scan.
      {
        key: "CL4U2",
        label: "CL4U2",
        subPatternKeys: [],
      },
      // RENAMED from "2P:RHSLB-SSLLpGap:2A" to "RHSLB-SSLLpGap" — Pattern
      // (arrow), same shape as its CL4U3/L3U3/L4U3/CL4U2 siblings above:
      // base condition = this category's LevelsBelow condition AND the raw
      // "RHSLB-SSLLpGap" flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). Nests "2P:L4U4-pLAP:R4-2A" (exposed in
      // Backtest/legend/screener/left-nav, unlike its symbol-list-only
      // CL4U2 sibling).
      {
        key: "RHSLB-SSLLpGap",
        label: "RHSLB-SSLLpGap",
        subPatternKeys: ["2P:L4U4-pLAP:R4-2A"],
      },
      // RRSSB-{Level}{Gap} — the LevelsBelow mirror of levelsabove's
      // RRSSA-* siblings: base condition = this category's
      // r.LevelsBelow condition AND the raw RRSSB-* flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). All four Gap-based
      // entries (AHS/ALR/BHR/BLS) are REPLACED below by
      // RRSSB-A{RRHH}-{SSLL} and RRSSB-B{RRHH}-{SSLL} — see those blocks
      // for the RRHHCategory-then-SSLLCategory re-splits — leaving zero
      // Gap-based RRSSB-* entries, same end state as RRSSA-* above.
      //
      // B-A-{RRHH}-{SSLL} — 7 Patterns (arrows) (RENAMED from the
      // intermediate RRSSB-A{RRHH}-{SSLL} naming to the
      // B-{Level}-{RRHH}-{SSLL} convention used by B-B-*/B-C-*/A-B-*
      // elsewhere; RRSSB-AC-E and RRSSB-AE-C were REMOVED, confirmed
      // empty against real data, leaving 7 of the original 9 — same
      // trimming outcome as A-B-C-E/A-B-E-C). Mirrors B-B-{RRHH}-{SSLL}
      // above exactly, with LevelsBelow's flipped sign regime run through
      // HHLL-A instead of HHLL-B (the direct mirror pairing of
      // RRSSA-B/RRSSB-A, same as RRSSA-A/RRSSB-B mirror each other
      // below). RRHHCategory is pinned to RRHH-C/RRHH-E/RRHH-HA and
      // SSLLCategory to SSLL-C/SSLL-E/SSLL-SB (see the full proof in
      // matchesPatternFlag's comment in ScreenerUtils.tsx).
      { key: "B-A-C-C",   label: "B-A-C-C",   subPatternKeys: [] },
      { key: "B-A-C-SB",  label: "B-A-C-SB",  subPatternKeys: [] },
      { key: "B-A-E-E",   label: "B-A-E-E",   subPatternKeys: [] },
      { key: "B-A-E-SB",  label: "B-A-E-SB",  subPatternKeys: [] },
      { key: "B-A-HA-C",  label: "B-A-HA-C",  subPatternKeys: [] },
      { key: "B-A-HA-E",  label: "B-A-HA-E",  subPatternKeys: [] },
      { key: "B-A-HA-SB", label: "B-A-HA-SB", subPatternKeys: [] },
      // PatternStats HHLL/RRHH/SSLL combo census (temporary debug
      // addition) found 8 more reachable combos under HHLL-A — see the
      // matching comment block in ScreenerUtils.tsx's PIVOT_PATTERNS.
      { key: "B-A-OB-SB", label: "B-A-OB-SB", subPatternKeys: [] },
      { key: "B-A-OB-E",  label: "B-A-OB-E",  subPatternKeys: [] },
      { key: "B-A-OB-C",  label: "B-A-OB-C",  subPatternKeys: [] },
      { key: "B-A-HA-OB", label: "B-A-HA-OB", subPatternKeys: [] },
      { key: "B-A-HA-OA", label: "B-A-HA-OA", subPatternKeys: [] },
      { key: "B-A-E-OA",  label: "B-A-E-OA",  subPatternKeys: [] },
      { key: "B-A-E-OB",  label: "B-A-E-OB",  subPatternKeys: [] },
      { key: "B-A-C-OA",  label: "B-A-C-OA",  subPatternKeys: [] },
      { key: "B-A-OA-E",  label: "B-A-OA-E",  subPatternKeys: [] },
      // B-B-{RRHH}-{SSLL} — 4 Patterns (arrows), REPLACES the old
      // RRSSB-BHR/RRSSB-BLS pair (RENAMED from the intermediate
      // RRSSB-B{RRHH}-{SSLL} naming to the B-{Level}-{RRHH}-{SSLL}
      // convention used by B-C-*/A-B-* elsewhere). Unlike
      // RRSSB-A{RRHH}-{SSLL} above, this is the CLEAN mirror of
      // RRSSA-A{RRHH}-{SSLL} — not of RRSSA-B{RRHH}-{SSLL} — since
      // LevelsBelow's ΔR1<=0 and HHLL-B's ΔPDH<=0 both agree
      // (non-positive), the mirror image of LevelsAbove's ΔR1>0 +
      // HHLL-A's ΔPDH>=0 both agreeing (non-negative). RRHHCategory is
      // EXHAUSTIVELY pinned to RRHH-BB/RRHH-OB and SSLLCategory to
      // SSLL-BB/SSLL-OB — no empirical trimming needed on either axis,
      // same as RRSSA-A{RRHH}-{SSLL}. Crossing gives 4 combinations,
      // mathematically exhaustive the same way. MOVED: the first of the
      // 4, "B-B-BB-BB", now sits at the very top of this category's
      // patterns array instead (above "HALB-SSLLGap") — see there for why
      // — leaving the remaining 3 (B-B-BB-OB/B-B-OB-BB/B-B-OB-OB) here.
      { key: "B-B-BB-OB", label: "B-B-BB-OB", subPatternKeys: [] },
      { key: "B-B-OB-BB", label: "B-B-OB-BB", subPatternKeys: [] },
      { key: "B-B-OB-OB", label: "B-B-OB-OB", subPatternKeys: [] },
      // PatternStats HHLL/RRHH/SSLL combo census (temporary debug
      // addition) found 3 more reachable combos under HHLL-B — see the
      // matching comment block in ScreenerUtils.tsx's PIVOT_PATTERNS.
      { key: "B-B-C-BB",  label: "B-B-C-BB",  subPatternKeys: [] },
      { key: "B-B-C-OB",  label: "B-B-C-OB",  subPatternKeys: [] },
      { key: "B-B-BB-C",  label: "B-B-BB-C",  subPatternKeys: [] },
      // RRSSB-C{SSLL} — 3 Patterns (arrows), REPLACES the old
      // RRSSB-CHR/RRSSB-CLR pair. Base condition = this category's
      // r.LevelsBelow condition AND the raw B-C-* flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). HHLL-C's gap is always
      // RRGap (the old CHR/CLR distinction was PDHPDLGapCategory alone),
      // so the merged HHLL-C condition is instead re-split by crossing
      // against SSLLCategory — mirrors RRSSA-E{SSLL}'s treatment of
      // HHLL-E above. Unlike that case's clean sign proof, HHLL-C's
      // non-strict ΔPDL>=0 doesn't cleanly rule AA/OA/BB/OB in or out —
      // checked against real data instead, leaving 3 reachable:
      // SSLL-C, SSLL-E, SSLL-SB.
      //
      // RENAMED: RRSSB-CC/RRSSB-CE/RRSSB-CSB -> B-C-{RRHH}-{SSLL}, each
      // further re-split by crossing against RRHHCategory (RRHH-BB/
      // RRHH-OB) — CC and CE both got the full BB/OB split; CSB only got
      // BB (no "B-C-OB-SB" requested).
      { key: "B-C-BB-C", label: "B-C-BB-C", subPatternKeys: [] },
      { key: "B-C-OB-C", label: "B-C-OB-C", subPatternKeys: [] },
      { key: "B-C-BB-E", label: "B-C-BB-E", subPatternKeys: [] },
      { key: "B-C-OB-E", label: "B-C-OB-E", subPatternKeys: [] },
      { key: "B-C-BB-SB", label: "B-C-BB-SB", subPatternKeys: [] },
      // PatternStats HHLL/RRHH/SSLL combo census (temporary debug
      // addition) found 3 more reachable combos under HHLL-C, including
      // the largest single gap found (B-C-BB-OB, 19 rows) — see the
      // matching comment block in ScreenerUtils.tsx's PIVOT_PATTERNS.
      { key: "B-C-BB-OB", label: "B-C-BB-OB", subPatternKeys: [] },
      { key: "B-C-BB-OA", label: "B-C-BB-OA", subPatternKeys: [] },
      { key: "B-C-OB-OB", label: "B-C-OB-OB", subPatternKeys: [] },
      // RRSSB-E{RRHH} — 3 Patterns (arrows), REPLACES the old
      // RRSSB-EHS/RRSSB-ELS pair. Base condition = this category's
      // r.LevelsBelow condition AND the raw B-E-* flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). HHLL-E's gap is always
      // SSGap (the old EHS/ELS distinction was PDHPDLGapCategory alone),
      // so the merged HHLL-E condition is instead re-split by crossing
      // against RRHHCategory — mirrors RRSSA-C{RRHH}'s treatment of
      // HHLL-C above. Of the 9 non-"none" RRHHCategory values, RRHH-AA/
      // RRHH-OA/RRHH-RA are mathematically impossible under LevelsBelow
      // and RRHH= is negligible (see the proof in matchesPatternFlag's
      // comment in ScreenerUtils.tsx), leaving 5 mathematically reachable
      // (BB/OB/C/E/HA). RRSSA-C{RRHH}'s own "both up" pair (RRHH-AA,
      // RRHH-OA) both came back CONFIRMED EMPTY there, and their direct
      // mirror pair here — RRSSB-EBB and RRSSB-EOB — likewise came back
      // CONFIRMED EMPTY against real data and were dropped, leaving 3.
      //
      // RENAMED: RRSSB-EC/RRSSB-EE/RRSSB-EHA -> B-E-{RRHH}-{SSLL}, each
      // further re-split by crossing against SSLLCategory (SSLL-BB/
      // SSLL-OB) — EC and EE both got the full BB/OB split; EHA only got
      // BB (no "B-E-HA-OB" requested).
      { key: "B-E-C-BB", label: "B-E-C-BB", subPatternKeys: [] },
      { key: "B-E-C-OB", label: "B-E-C-OB", subPatternKeys: [] },
      { key: "B-E-E-BB", label: "B-E-E-BB", subPatternKeys: [] },
      { key: "B-E-E-OB", label: "B-E-E-OB", subPatternKeys: [] },
      // NEW: B-E-OB-BB — HHLL-E + RRHH-OB + SSLL-BB, same
      // B-{Level}-{RRHH}-{SSLL} convention as its B-E-* siblings above.
      { key: "B-E-OB-BB", label: "B-E-OB-BB", subPatternKeys: [] },
      { key: "B-E-OB-OB", label: "B-E-OB-OB", subPatternKeys: [] },
      { key: "B-E-HA-BB", label: "B-E-HA-BB", subPatternKeys: [] },
      // PatternStats HHLL/RRHH/SSLL combo census (temporary debug
      // addition) found 1 more reachable combo under HHLL-E — see the
      // matching comment block in ScreenerUtils.tsx's PIVOT_PATTERNS.
      { key: "B-E-OA-BB", label: "B-E-OA-BB", subPatternKeys: [] },
    ],
  },
  // NEW: "COMPRESSED" left-nav section (first item). CHANGED:
  // "6A:HLC-SSLL:R4-6P" moved off this category's own subPatternKeys and
  // nested under the "RRHH-BB:SSLL-AA:SSLLGap-R4" Pattern arrow instead
  // (same shape as U3L4/CU3L3 elsewhere); the Pattern arrow no longer
  // duplicates itself as a nested View, since selecting the bare Pattern
  // already grades the identical condition via runPivotLevelBacktest.
  {
    key: "compressed",
    label: "COMPRESSED",
    subPatternKeys: ["8A:HLC-SSHH:S4-1P", "9AM:RHLB-RRHH:5AM"],
    patterns: [
      {
        key: "RRHH-BB:SSLL-AA:SSLLGap",
        label: "RRHH-BB:SSLL-AA:SSLLGap",
        subPatternKeys: ["6A:HLC-SSLL:R4-6P"],
      },
      // NEW: "RHLB-RRHHpGap" Pattern (arrow) — same shape as its
      // "RRHH-BB:SSLL-AA:SSLLGap" sibling above: base condition = parent
      // "compressed" category's condition AND the raw RHLB-RRHHpGap flag
      // (see matchesPatternFlag in ScreenerUtils.tsx). Nests its
      // "8A:pLAPpPAH:R4-5P" View (RENAMED from "RHLB-RRHHpGap" — the full
      // graded pattern, incl. r.compressed — see passesPattern in
      // ScreenerUtils.tsx / BACKTEST_TARGETS above), so it shows an arrow
      // with a single (green, bullish) dot inside, not a bare dot on the
      // category itself.
      {
        key: "RHLB-RRHHpGap",
        label: "RHLB-RRHHpGap",
        subPatternKeys: ["8A:pLAPpPAH:R4-5P"],
      },
      // C-{Level}-{RRHH}-{SSLL} — 19 Patterns (arrows), nested under
      // "compressed" (today's R1 down vs prev AND today's S1 up vs prev —
      // see cpr.ts's r.compressed / the "RRSS-C" SSRRCategory). REPLACES
      // the old RRSSC-{Level}{SSLL} set (RRSSC-AAA/AOA/BLB/BC/BE/CAA/COA/
      // CC): each surviving HHLL x SSLL combo is re-split by crossing in
      // RRHHCategory, same treatment as "expanded"'s E-{Level}-{RRHH}-
      // {SSLL} set — condition is RRSS-C (r.compressed) + HHLL + RRHH +
      // SSLL only, with NO GapCategory check of any kind (see
      // PIVOT_PATTERNS in ScreenerUtils.tsx). RRSSC-CC (HHLL-C + SSLL-C)
      // is CONFIRMED mathematically impossible under r.compressed (proven
      // via the ΔR1-ΔS1 = ΔPDH-ΔPDL identity + a 20M-pair brute-force
      // sweep: 0 hits) — stays dropped.
      //
      // CORRECTED: PatternStats (2026-07-01..07-31) showed the base
      // "compressed" scan matching 3566 (symbol, date) rows against only
      // 3550 summed across the original 17 C-* patterns — a gap of 16.
      // An earlier attempt attributed this to the dropped CC combo and
      // re-added it; that was wrong (0 real matches, confirmed above).
      // The brute-force sweep found the actual two gaps instead — combos
      // that are reachable but had no key: HHLL-A + RRHH-OB + SSLL-AA,
      // and HHLL-C + RRHH-C + SSLL-AA. Added below (C-A-OB-AA,
      // C-C-C-AA), bringing this back to 19:
      // AAA -> C-A-C-AA/C-A-HA-AA/C-A-E-AA/C-A-OA-AA/C-A-OB-AA (HHLL-A + SSLL-AA),
      // AOA -> C-A-E-OA/C-A-C-OA/C-A-OA-OA (HHLL-A + SSLL-OA),
      // BLB -> C-B-BB-LB/C-B-OB-LB (HHLL-B + SSLL-LB),
      // BC  -> C-B-BB-C/C-B-OB-C (HHLL-B + SSLL-C),
      // BE  -> C-B-BB-E/C-B-OB-E (HHLL-B + SSLL-E),
      // CAA -> C-C-BB-AA/C-C-OB-AA/C-C-C-AA (HHLL-C + SSLL-AA),
      // COA -> C-C-BB-OA/C-C-OB-OA (HHLL-C + SSLL-OA).
      // A few other combos (HHLL-B+RRHH-C+SSLL-C, HHLL-A+RRHH-OB+SSLL-OA,
      // HHLL-C+RRHH-C+SSLL-OA) surfaced at ~1-in-20M frequency in the
      // sweep — negligible boundary-tolerance ties, same treatment as the
      // existing "RRHH= is negligible" precedent; not worth a key.
      // No target-graded sub-patterns nested under any of them yet, so
      // each shows up as a symbol-list-only scan in the Backtest dropdown
      // until specific targets are defined.
      { key: "C-A-C-AA", label: "C-A-C-AA", subPatternKeys: [] },
      { key: "C-A-HA-AA", label: "C-A-HA-AA", subPatternKeys: [] },
      { key: "C-A-E-AA", label: "C-A-E-AA", subPatternKeys: [] },
      { key: "C-A-OA-AA", label: "C-A-OA-AA", subPatternKeys: [] },
      { key: "C-A-OB-AA", label: "C-A-OB-AA", subPatternKeys: [] },
      { key: "C-A-E-OA", label: "C-A-E-OA", subPatternKeys: [] },
      { key: "C-A-C-OA", label: "C-A-C-OA", subPatternKeys: [] },
      { key: "C-A-OA-OA", label: "C-A-OA-OA", subPatternKeys: [] },
      { key: "C-B-BB-LB", label: "C-B-BB-LB", subPatternKeys: [] },
      { key: "C-B-OB-LB", label: "C-B-OB-LB", subPatternKeys: [] },
      { key: "C-B-BB-C", label: "C-B-BB-C", subPatternKeys: [] },
      { key: "C-B-OB-C", label: "C-B-OB-C", subPatternKeys: [] },
      { key: "C-B-BB-E", label: "C-B-BB-E", subPatternKeys: [] },
      { key: "C-B-OB-E", label: "C-B-OB-E", subPatternKeys: [] },
      { key: "C-C-BB-AA", label: "C-C-BB-AA", subPatternKeys: [] },
      { key: "C-C-OB-AA", label: "C-C-OB-AA", subPatternKeys: [] },
      { key: "C-C-C-AA", label: "C-C-C-AA", subPatternKeys: [] },
      { key: "C-C-BB-OA", label: "C-C-BB-OA", subPatternKeys: [] },
      { key: "C-C-OB-OA", label: "C-C-OB-OA", subPatternKeys: [] },
    ],
  },
  // NEW: "EXPANDED" left-nav section, mirroring "COMPRESSED" above but for
  // RRSS-E (today's R1 up AND today's S1 down vs prev — levels widening
  // outward). "6A:SLE-RRHH:R2-6A" moved off this category's own
  // subPatternKeys and now nests under the "E-A-AA-E" Pattern below —
  // its base condition (HHLL-A + RRHH-AA + SSLL-E) is exactly that
  // Pattern's condition, same as "6A:HLC-SSLL:R4-6P" nesting under
  // "RRHH-BB:SSLL-AA:SSLLGap" elsewhere.
  {
    key: "expanded",
    label: "EXPANDED",
    subPatternKeys: [],
    // E-{Level}-{RRHH}-{SSLL} — 16 Patterns (arrows), nested under
    // "expanded" (today's R1 up vs prev AND today's S1 down vs prev — see
    // cpr.ts's r.expanded / the "RRSS-E" SSRRCategory), built by crossing
    // HHLLCategory (A/B/E — HHLL-C stays impossible under expanded) with
    // RRHHCategory (checked before SSLLCategory) with SSLLCategory — see
    // the full derivation, including each combo's empirically-confirmed
    // reachable RRHHCategory set, in matchesPatternFlag's comment in
    // ScreenerUtils.tsx. The original 8 HHLL+SSLL combos (AOB/ASB/AC/AE
    // under HHLL-A, BBB/BOB under HHLL-B, EBB/EOB under HHLL-E) each
    // split into 1-3 of these by RRHHCategory, giving 16 total. No
    // target-graded sub-patterns nested under any of them yet, so each
    // shows up as a symbol-list-only scan in the Backtest dropdown until
    // specific targets are defined.
    patterns: [
      { key: "E-A-AA-OB", label: "E-A-AA-OB", subPatternKeys: [] },
      { key: "E-A-OA-OB", label: "E-A-OA-OB", subPatternKeys: [] },
      { key: "E-A-AA-SB", label: "E-A-AA-SB", subPatternKeys: [] },
      { key: "E-A-AA-C", label: "E-A-AA-C", subPatternKeys: [] },
      { key: "E-A-OA-C", label: "E-A-OA-C", subPatternKeys: [] },
      // "6A:SLE-RRHH:R2-6A" now nests here — its base condition (HHLL-A +
      // RRHH-AA + SSLL-E) is exactly this Pattern's condition (moved off
      // "expanded" category's own subPatternKeys above).
      { key: "E-A-AA-E", label: "E-A-AA-E", subPatternKeys: ["6A:SLE-RRHH:R2-6A"] },
      { key: "E-A-OA-E", label: "E-A-OA-E", subPatternKeys: [] },
      { key: "E-B-RA-BB", label: "E-B-RA-BB", subPatternKeys: [] },
      { key: "E-B-C-BB", label: "E-B-C-BB", subPatternKeys: [] },
      { key: "E-B-E-BB", label: "E-B-E-BB", subPatternKeys: [] },
      { key: "E-B-C-OB", label: "E-B-C-OB", subPatternKeys: [] },
      { key: "E-B-E-OB", label: "E-B-E-OB", subPatternKeys: [] },
      // "E-E-AA-BB" nests five Subpatterns (EL1U2/EU1L2/EU2L2/EU1L3/EL1U1)
      // — these are Patterns themselves (arrow ↳), not Views (green dot),
      // per user correction. Each combines this Pattern's base condition
      // with its own raw CPR flag — see matchesPatternFlag/passesPattern's
      // "E-E-AA-BB-*" cases in ScreenerUtils.tsx. No Views defined under
      // any of them yet, so each is currently a symbol-list-only scan,
      // same as any other freshly-added Pattern with empty subPatternKeys.
      {
        key: "E-E-AA-BB",
        label: "E-E-AA-BB",
        subPatternKeys: [],
        patterns: [
          { key: "E-E-AA-BB-EL1U2", label: "E-E-AA-BB-EL1U2", subPatternKeys: [] },
          { key: "E-E-AA-BB-EU1L2", label: "E-E-AA-BB-EU1L2", subPatternKeys: [] },
          { key: "E-E-AA-BB-EU2L2", label: "E-E-AA-BB-EU2L2", subPatternKeys: [] },
          { key: "E-E-AA-BB-EU1L3", label: "E-E-AA-BB-EU1L3", subPatternKeys: [] },
          { key: "E-E-AA-BB-EL1U1", label: "E-E-AA-BB-EL1U1", subPatternKeys: [] },
        ],
      },
      { key: "E-E-OA-BB", label: "E-E-OA-BB", subPatternKeys: [] },
      { key: "E-E-AA-OB", label: "E-E-AA-OB", subPatternKeys: [] },
      { key: "E-E-OA-OB", label: "E-E-OA-OB", subPatternKeys: [] },
    ],
  },
  // NEW: left-nav sections exposed in the Backtest dropdown as
  // symbol-list-only categories (no target grading). Each `key` matches an
  // existing passesPattern() case in ScreenerUtils.tsx, so runCategoryScan
  // works with no further changes.
  {
    key: "R1AbovePR4",
    label: "ABOVE LEVEL4",
    // NEW: "EU1L3" Pattern (arrow) — same shape as
    // CL4U3/L3U3/EUTL3/EL1L2 elsewhere. Base condition = parent
    // R1AbovePR4's condition AND the raw EU1L3 flag (see
    // matchesPatternFlag in ScreenerUtils.tsx). Nests the existing
    // "9AM:APHS1A-FAU4:4AM" pattern, which used to sit directly on this
    // category's own subPatternKeys.
    patterns: [
      {
        key: "EU1L3",
        label: "EU1L3",
        // "9AM:APHS1A-FAU4:4AM" moved to the sibling "EUTL3" Pattern.
        subPatternKeys: ["8AM:APHS1A-FAU4:4AM"],
      },
      // NEW: "EUTL3" Pattern — shown above its own
      // sub-pattern ("TiMe-EUTL3-AU4:2PM") in the Backtest dropdown, same
      // "Pattern" grouping style as CU3L3 / EL1U4 elsewhere. Base
      // condition = parent R1AbovePR4's condition AND the raw EUTL3 flag
      // (see matchesPatternFlag in ScreenerUtils.tsx).
      {
        key: "EUTL3",
        label: "EUTL3",
        // Both "9AM:APHS1A-FAU4:4AM" and "6AM:pX-APHS1A-pL4:4AM" moved out
        // from here into the new "A-A-AA-AA-EUTL3" Subpattern below
        // (nested under the new "A-A-AA-AA" Pattern) — both renamed, and
        // both conditions now AND in the structural A-A-AA-AA check, so
        // neither is a bare EUTL3 View anymore.
        subPatternKeys: ["TiMe-EUTL3-AU4:2PM"],
      },
      // NEW: "A-A-AA-AA" Pattern — structural A-A-AA-AA raw flag (see
      // PIVOT_PATTERNS in ScreenerUtils.tsx), nested directly under
      // "U1 > pU4" (R1AbovePR4) alongside its EU1L3/EUTL3/etc. Pattern
      // siblings. True nested parent (via its own `patterns` field,
      // same recursive shape as "E-E-AA-BB" above) of the
      // "A-A-AA-AA-EUTL3" Subpattern, which used to sit as a flat
      // sibling directly in this array.
      {
        key: "A-A-AA-AA",
        label: "A-A-AA-AA",
        subPatternKeys: [],
        patterns: [
          // "A-A-AA-AA-EUTL3" Subpattern — structural A-A-AA-AA (parent
          // Pattern's own condition) crossed with the raw EUTL3 flag,
          // same naming/nesting convention as the "A-A-AA-AA-EU3L4"
          // Subpattern under "levelsabove". Nests the renamed
          // "9A:A-A-AA-AA-EUTL3-S1ATC-U4:4A" View (was
          // "9AM:APHS1A-FAU4:4AM") followed by the renamed
          // "6A:A-A-AA-AA-EUTL3-S1ATCpE-pL4:4A" View (was
          // "6AM:pX-APHS1A-pL4:4AM", moved here from "EUTL3" and now
          // also ANDing in the A-A-AA-AA check).
          {
            key: "A-A-AA-AA-EUTL3",
            label: "A-A-AA-AA-EUTL3",
            subPatternKeys: [
              "9A:A-A-AA-AA-EUTL3-S1ATC-U4:4A",
              "6A:A-A-AA-AA-EUTL3-S1ATCpE-pL4:4A",
            ],
          },
        ],
      },
      {
        key: "EL1L2",
        label: "EL1L2",
        subPatternKeys: ["SMg-exHiL2L1-U4:3AM"],
      },
      // NEW: "EU1L4" Pattern (arrow), same shape as its
      // EU1L3/EUTL3/EL1L2 siblings above. Base condition = parent
      // R1AbovePR4's condition AND the raw EU1L4 flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). Nests the new
      // "6AM:MegMeg-L3:8PM" pattern.
      {
        key: "EU1L4",
        label: "EU1L4",
        subPatternKeys: ["6AM:MegMeg-L3:8PM"],
      },
      // NEW: "EUPL2" Pattern (arrow), same shape as its
      // EU1L3/EUTL3/EL1L2/EU1L4 siblings above. Base condition =
      // parent R1AbovePR4's condition AND the raw EUPL2 flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). No specific
      // target-graded sub-pattern nested under it yet — selecting it in
      // the Backtest dropdown runs a symbol-list-only category scan.
      {
        key: "EUPL2",
        label: "EUPL2",
        subPatternKeys: [],
      },
      // NEW: "EL2L1" Pattern (arrow), same shape as its
      // EL1L2 sibling above (both derive from the same
      // eXHiLoL2L1Bands base band check in cpr.ts, split on today's PDL
      // vs prev Pivot). Base condition = parent R1AbovePR4's condition
      // AND the raw EL2L1 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). No specific target-graded sub-pattern
      // nested under it yet — selecting it in the Backtest dropdown
      // runs a symbol-list-only category scan.
      {
        key: "EL2L1",
        label: "EL2L1",
        subPatternKeys: [],
      },
      // NEW: "EUBL3" Pattern (arrow), same shape as its
      // EU1L3/EUTL3/EL1L2/EU1L4/EUPL2/EL2L1 siblings above.
      // Base condition = parent R1AbovePR4's condition AND the raw
      // EUBL3 flag (see matchesPatternFlag in ScreenerUtils.tsx). No
      // specific target-graded sub-pattern nested under it yet —
      // selecting it in the Backtest dropdown runs a symbol-list-only
      // category scan.
      {
        key: "EUBL3",
        label: "EUBL3",
        subPatternKeys: [],
      },
      // NEW: "EUBL2" Pattern (arrow), same shape as its EUBL3 sibling
      // directly above. Base condition = parent R1AbovePR4's condition
      // AND the raw EUBL2 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). No specific target-graded sub-pattern
      // nested under it yet — selecting it in the Backtest dropdown
      // runs a symbol-list-only category scan.
      {
        key: "EUBL2",
        label: "EUBL2",
        subPatternKeys: [],
      },
    ],
  },
  // RENAMED from "L1 < pL4" to "BELOW LEVEL4" (mirrors "R1AbovePR4"'s
  // "ABOVE LEVEL4" label). Nests the "EL1U4" Pattern, which in turn
  // nests the bullish "ss-EL1U4-U4:10PM" pattern.
  {
    key: "S1BelowPS4",
    label: "BELOW LEVEL4",
    patterns: [
      {
        key: "EL1U4",
        label: "EL1U4",
        subPatternKeys: ["ss-EL1U4-U4:10PM"],
      },
    ],
  },
  // NEW: "CPR Inside" now nests the "CU3L3" Pattern — base condition =
  // this category's inside-cpr condition AND the raw CU3L3 flag (see
  // matchesPatternFlag in ScreenerUtils.tsx). Nests the bullish
  // "8AM:SRBHHLLA-pU4+1:8AM" View (target: prev day's R4 / PU4).
  {
    key: "inside-cpr",
    label: "Inside CPR",
    // NEW: "8AM:CoLApHA-U4+1:8AM" sits directly on this category's own
    // subPatternKeys (not inside a "Pattern" /arrow below) —
    // it's a Direct View in ViewsSidebar's left-nav (top-level, under but
    // not nested inside "Inside CPR"), so it isn't gated behind one of
    // the raw Pattern flags (CU3L3/CU4L4/EU4L4) the way its
    // patterns siblings are.
    subPatternKeys: ["8AM:CoLApHA-U4+1:8AM"],
    patterns: [
      {
        key: "CU3L3",
        label: "CU3L3",
        subPatternKeys: ["8AM:SRBHHLLA-pU4+1:8AM"],
      },
      // NEW: CU4L4 Pattern — base condition = the inside-cpr
      // condition AND the raw CU4L4 flag. Nests the bullish
      // "2PM:pPDHLA-SRA-U4:7PM" View (target: today's R4 / U4).
      {
        key: "CU4L4",
        label: "CU4L4",
        subPatternKeys: ["2PM:pPDHLA-SRA-U4:7PM"],
      },
      // NEW: EU4L4 Pattern — base condition = the inside-cpr
      // condition AND the raw EU4L4 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx, which already has an "EU4L4" case). MOVED:
      // its "8AM:pPDHA-SRA-U4+2:2AM" View now nests under "levelsabove" →
      // "A-B-C-C" → "A-B-C-C-EU4L4" instead (see that pattern's comment
      // above), so this Pattern has no View of its own left — it still
      // shows up as a symbol-list-only scan in the Backtest dropdown.
      {
        key: "EU4L4",
        label: "EU4L4",
        subPatternKeys: [],
      },
    ],
  },
  // NEW: "Overlap Below" now nests "2PM:SSLLpRRHHA-ApU4:5PM" directly on
  // its own subPatternKeys (Direct View in ViewsSidebar's left-nav, not
  // behind a Pattern/arrow), same shape as
  // "8AM:CoLApHA-U4+1:8AM" under "inside-cpr" above.
  // RENAMED: "Exp-U3>U3" -> "9AM:SSRRBHHLLA-U4:9PM", now exposed here in
  // the Backtest panel alongside its "2PM:SSLLpRRHHA-ApU4:5PM" sibling.
  // NEW: "8AM:SSLLpRRHHA-L4:1PM" added as the bearish sibling of
  // "2PM:SSLLpRRHHA-ApU4:5PM".
  {
    key: "overlapping-lower",
    label: "Overlap Below",
    subPatternKeys: ["2PM:SSLLpRRHHA-ApU4:5PM", "8AM:SSLLpRRHHA-L4:1PM", "9AM:SSRRBHHLLA-U4:9PM", "pRRHHLLA"],
    // NEW: "L4U4" Pattern (arrow) — base condition =
    // Overlap Below's r.overlapLower condition AND the raw L4U4 flag
    // (see matchesPatternFlag in ScreenerUtils.tsx, which already has a
    // "L4U4" case). No target-graded pattern nested under it yet, so it
    // shows up as a symbol-list-only scan in the Backtest dropdown.
    patterns: [
      {
        key: "L4U4",
        label: "L4U4",
        subPatternKeys: [],
      },
      // NEW: "pRRHHLLA" Pattern (arrow), same shape as
      // "L4U4" above — base condition = Overlap Below's r.overlapLower
      // condition AND the raw pRRHHLLA compound flag (see
      // matchesPatternFlag in ScreenerUtils.tsx, which already has a
      // "pRRHHLLA" case). MOVED: "9AM:pRRHHLLA-U4:9PM" now nests directly
      // under this arrow (instead of on the parent's own subPatternKeys),
      // as its target-graded sibling.
      {
        key: "pRRHHLLA",
        label: "pRRHHLLA",
        subPatternKeys: ["9AM:pRRHHLLA-U4:9PM"],
      },
    ],
  },
  { key: "equal-cpr", label: "Equal CPR" },
];

/**
 * NEW: flat option list for the "Category / Pattern / Subpattern / View"
 * dropdown in the Backtest panel.
 *
 * The dropdown no longer renders bold, non-selectable group headings
 * ("LittleCPR Above", "Overlap Below", ...). Instead every group's own
 * "— all (symbol list only)" row IS the heading: the category name is
 * rendered bold and the "— all (symbol list only)" suffix normal-weight,
 * e.g. render each option as:
 *
 *   <span className="font-semibold">{opt.boldLabel}</span>
 *   <span className="font-normal opacity-70">{opt.suffix}</span>
 *
 * Nested Pattern nodes follow their parent at any depth. Views remain leaf
 * entries beneath the Pattern node that owns them and have no bold part.
 */
export type BacktestOptionKind = "category" | "pattern" | "view";

export interface BacktestOption {
  value: string;              // category key, or category + full Pattern path, or a View key
  kind: BacktestOptionKind;
  boldLabel: string;          // bold part, e.g. "LittleCPR Above" ("" for patterns)
  suffix: string;             // normal-weight part, e.g. " — all (symbol list only)"
  plainLabel: string;         // boldLabel + suffix, for the collapsed/selected value
  depth: number;              // indentation level
  categoryKey: string;
  patternKey?: string;           // Pattern or Subpattern node key
  viewKey?: string;              // View leaf key
  symbolListOnly: boolean;    // true => runCategoryScan / runPivotLevelScan (Close + % Change columns)
}

export const SYMBOL_LIST_ONLY_SUFFIX = " — all (symbol list only)";

export function buildBacktestOptions(): BacktestOption[] {
  const opts: BacktestOption[] = [];
  const patternLabel = (key: string) => BACKTEST_TARGETS.find((t) => t.key === key)?.label ?? key;

  for (const cat of BACKTEST_CATEGORIES) {
    opts.push({
      value: cat.key,
      kind: "category",
      boldLabel: cat.label,
      suffix: SYMBOL_LIST_ONLY_SUFFIX,
      plainLabel: cat.label + SYMBOL_LIST_ONLY_SUFFIX,
      depth: 0,
      categoryKey: cat.key,
      symbolListOnly: true,
    });

    const directViews = new Map((cat.subPatternKeys ?? []).map((key) => [key, key]));
    const patterns = new Map((cat.patterns ?? []).map((sub) => [sub.key, sub]));

    const pushDirectView = (key: string) => {
      opts.push({
        value: key,
        kind: "view",
        boldLabel: "",
        suffix: patternLabel(key),
        plainLabel: patternLabel(key),
        depth: 1,
        categoryKey: cat.key,
        viewKey: key,
        symbolListOnly: false,
      });
    };

    const pushPattern = (sub: BacktestSubCategoryDef, path: BacktestSubCategoryDef[], depth: number) => {
      // A Pattern node is selectable independently from its Views. Its
      // selection value carries the category and full ancestor path so a
      // nested Subpattern cannot be confused with a direct View that happens
      // to have the same raw key.
      const selectionValue = [cat.key, ...path.map((p) => p.key)].join("::");
      opts.push({
        value: selectionValue,
        kind: "pattern",
        boldLabel: sub.label,
        suffix: "",
        plainLabel: sub.label,
        depth,
        categoryKey: cat.key,
        patternKey: sub.key,
        symbolListOnly: false,
      });
      for (const key of sub.subPatternKeys) {
        opts.push({
          value: key,
          kind: "view",
          boldLabel: "",
          suffix: patternLabel(key),
          plainLabel: patternLabel(key),
          depth: depth + 1,
          categoryKey: cat.key,
          patternKey: sub.key,
          viewKey: key,
          symbolListOnly: false,
        });
      }
      for (const child of sub.patterns ?? []) {
        pushPattern(child, [...path, child], depth + 1);
      }
    };

    if (cat.orderedEntries) {
      const emittedDirectViews = new Set<string>();
      const emittedPatterns = new Set<string>();
      for (const entry of cat.orderedEntries) {
        if (entry.kind === "subPattern" && directViews.has(entry.key)) {
          pushDirectView(entry.key);
          emittedDirectViews.add(entry.key);
        } else if (entry.kind === "pattern") {
          const sub = patterns.get(entry.key);
          if (sub) {
            pushPattern(sub, [sub], 1);
            emittedPatterns.add(entry.key);
          }
        }
      }
      for (const key of cat.subPatternKeys ?? []) {
        if (!emittedDirectViews.has(key)) pushDirectView(key);
      }
      for (const sub of cat.patterns ?? []) {
        if (!emittedPatterns.has(sub.key)) pushPattern(sub, [sub], 1);
      }
    } else {
      for (const key of cat.subPatternKeys ?? []) pushDirectView(key);
      for (const sub of cat.patterns ?? []) pushPattern(sub, [sub], 1);
    }
  }

  return opts;
}

export const BACKTEST_OPTIONS: BacktestOption[] = buildBacktestOptions();

export function findBacktestOption(value: string): BacktestOption | undefined {
  return BACKTEST_OPTIONS.find((o) => o.value === value);
}

export interface BacktestRow {
  symbol: string;
  source: BacktestSource;
  entryDate: string;               // YYYY-MM-DD (UTC) — the date the pattern was flagged
  todayCPR: CPRResult["todayCPR"];
  prevCPR: CPRResult["prevCPR"];
  compressionRatio: number;         // NEW: shown as a ratio in BacktestPanel's results table
  targetLevel: number;
  targetLabel: string;
  // NEW: Entry/Stoploss levels for the View, per BacktestTargetDef's
  // getEntry/getStoploss (today's TC/S1 for bullish R-level targets,
  // today's BC/R1 for bearish S-level targets).
  entryLevel: number;
  entryLabel: string;
  stoplossLevel: number;
  stoplossLabel: string;
  // NEW: "invalid-target" — the pattern matched on this date, but the CPR
  // level getTarget() reads off (e.g. todayCPR.r4) came back NaN/undefined
  // for this reconstruction, so there's no real price to grade the outcome
  // against. Previously this silently fell through to "fail", which read
  // as a real miss even though the target itself was never computable —
  // see BACKTEST_TARGETS' getTarget comment and backtestSymbolOnDate below.
  result: "pass" | "fail" | "insufficient-data" | "invalid-target";
  hitDate: string | null;          // which day (entryDate, entryDate+1, or entryDate+2) hit target, if any
  daysToHit: 0 | 1 | null;
  /** Entry-day close / prev close / day-over-day % change (same as CategoryScanRow). */
  closePrice: number | null;
  prevClose: number | null;
  changePct: number | null;
  /**
   * The full reconstructed CPRResult (all pattern-flag booleans,
   * todayCPR/prevCPR/ppCPR) — same field CategoryScanRow carries, so the
   * pattern-backtest ("view") table renders the IDENTICAL S/R ladder panel
   * and Pattern badges as the category-scan tables.
   */
  raw: CPRResult;
}

/**
 * NEW: Simplified row for category scans — same CPR reconstruction as
 * BacktestRow, but deliberately has no targetLevel/result/hitDate fields.
 * A category (e.g. "LittleCPR Above") has no single defined target, so
 * there's nothing meaningful to grade; this just proves which symbols
 * matched the category's base condition on the entry date, plus their CPR
 * shape for reference (compressionRatio, widths via todayCPR/prevCPR).
 *
 * Also reused, unchanged, for Pattern scans (e.g.
 * "CPR Inside" → "CU4L4") — same shape, same reasoning: a Pattern
 * bucket within a category still has no single target to grade.
 */
export interface CategoryScanRow {
  symbol: string;
  source: BacktestSource;
  entryDate: string;
  todayCPR: CPRResult["todayCPR"];
  prevCPR: CPRResult["prevCPR"];
  compressionRatio: number;
  /**
   * NEW: entry-day close price and day-over-day % change, so the results
   * table can show "Close" and "% Change" columns (colour them green when
   * changePct >= 0, red when < 0) for every "— all (symbol list only)"
   * scan. Null when the entry-day candle isn't available (e.g. entryDate
   * is today and the daily candle hasn't printed yet).
   */
  closePrice: number | null;
  prevClose: number | null;
  changePct: number | null;
  /**
   * NEW: the full reconstructed CPRResult (all pattern-flag booleans,
   * todayCPR/prevCPR/ppCPR) for this symbol/date. Lets consumers (e.g.
   * BacktestPanel's results table) render the same "Pattern" and
   * "Prev Pattern" badges as ScreenerTableRow does, via
   * renderTodayPatternBadges / renderPrevPatternBadge in
   * ScreenerTableRow.tsx.
   */
  raw: CPRResult;
}

/**
 * NEW: entry-day close + day-over-day % change for a scanned symbol.
 * Uses the entry date's own daily candle when it exists; falls back to the
 * last completed candle (D-1, the one that built todayCPR) otherwise.
 */
function closeAndChange(
  window: Map<string, OHLC>,
  entryDateISO: string
): { closePrice: number | null; prevClose: number | null; changePct: number | null } {
  const candle = window.get(entryDateISO) ?? window.get(addDaysISO(entryDateISO, -1)) ?? null;
  if (!candle) return { closePrice: null, prevClose: null, changePct: null };
  const baseDate = window.get(entryDateISO) ? entryDateISO : addDaysISO(entryDateISO, -1);
  const prevCandle = window.get(addDaysISO(baseDate, -1)) ?? null;
  const prevClose = prevCandle ? prevCandle.close : candle.open;
  const changePct = prevClose ? ((candle.close - prevClose) / prevClose) * 100 : null;
  return { closePrice: candle.close, prevClose, changePct };
}

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * ADK PERF FIX (instant multi-date / yearly backtests)
 * ----------------------------------------------------
 * The old implementation fetched a fresh 9-candle window PER SYMBOL PER DATE.
 * A 1-day scan of 500 symbols = 500 HTTP calls; a 31-day sweep = 15,500 calls;
 * a full year = ~180,000 calls. That's why even a monthly sweep crawled.
 *
 * Daily candles never change once closed, so we now fetch each symbol's WHOLE
 * daily history ONCE (up to 1500 candles ≈ 4 years, a single API page) and
 * cache it in memory for the session. Every subsequent date in the sweep is a
 * pure in-memory Map lookup — zero network. A yearly sweep therefore costs the
 * same ~500 requests as a single day, and every date after the first is
 * effectively instant.
 */
/**
 * ADK FIX (backtest returned far fewer symbols than the Live Scanner)
 * ------------------------------------------------------------------
 * A 1500-candle klines page costs request-weight 10 on Binance Futures.
 * Prefetching ~530 symbols therefore burned ~5300 weight in one burst,
 * well past the 2400/min ceiling: most symbols came back 429/418, their
 * retries were exhausted, and they were silently dropped — which is why a
 * category showing 20 live only listed 9 in the backtest.
 *
 * A 500-candle page costs weight 2 (~1060 total for the whole universe),
 * which stays inside the limit, and still covers ~16 months of history —
 * more than enough for the date ranges the UI offers. Longer sweeps can
 * opt in via setBacktestHistoryLimit().
 */
let HISTORY_LIMIT = 500;

/** Opt-in for very long sweeps (max 1500). Clears the cache when changed. */
export function setBacktestHistoryLimit(limit: number): void {
  const next = Math.max(10, Math.min(1500, Math.floor(limit)));
  if (next === HISTORY_LIMIT) return;
  HISTORY_LIMIT = next;
  clearBacktestHistoryCache();
}

/** Symbols dropped by the last run because Binance never returned candles. */
let lastRunSkipped: string[] = [];
export function getLastRunSkippedSymbols(): string[] {
  return [...lastRunSkipped];
}

/** symbol -> full daily-candle history, keyed by UTC date string, plus which
 *  UTC calendar day the fetch happened on. */
interface CachedHistory {
  map: Map<string, OHLC>;
  fetchedOnUTCDate: string;
}
const binanceHistoryCache = new Map<string, CachedHistory | null>();
const deltaHistoryCache = new Map<string, CachedHistory | null>();
/** In-flight de-dupe so parallel dates/symbols never double-fetch. */
const inFlight = new Map<string, Promise<Map<string, OHLC> | null>>();

/** True when a symbol's history is already in memory for TODAY (no network
 *  needed) — a cache entry from a previous UTC day doesn't count, since it
 *  may still be holding yesterday's live/incomplete candle (see getHistory). */
export function hasCachedHistory(symbol: string, source: BacktestSource): boolean {
  const cache = source === "binance" ? binanceHistoryCache : deltaHistoryCache;
  const cached = cache.get(symbol);
  if (cached === undefined) return false;
  if (cached === null) return true; // cached failure — still "resolved", don't re-hammer it
  return cached.fetchedOnUTCDate === utcDateKey(Date.now());
}

/** Drop all cached candle history (e.g. to pick up a newly closed day). */
export function clearBacktestHistoryCache(): void {
  binanceHistoryCache.clear();
  deltaHistoryCache.clear();
  inFlight.clear();
}

/**
 * Full Binance daily history for a symbol, keyed by UTC date string.
 *
 * ADK FIX (single source of truth): this used to re-implement Binance access
 * — its own URLs, its own venue cache, its own kline parsing and NO retry on
 * 429/418. It now delegates to binance.ts's `fetchDailyKlines`, so
 * rate-limit backoff and kline parsing are shared with the live screener
 * and can never drift apart again.
 *
 * FUTURES/PERPS ONLY: `fetchDailyKlines` only ever fetches from Binance
 * USDⓈ-M Futures now — there is no Spot fallback anywhere in the app. A
 * symbol with no perpetual listing, or whose futures request keeps
 * failing, is simply skipped for this backtest run rather than silently
 * analysed on Spot data (which could be a different instrument than the
 * one the Live Scanner charts/links).
 */
async function fetchBinanceHistory(symbol: string): Promise<Map<string, OHLC> | null> {
  const candles = await fetchDailyKlines(symbol, HISTORY_LIMIT);
  if (!candles || !candles.length) return null;
  const map = new Map<string, OHLC>();
  for (const c of candles) map.set(utcDateKey(c.openTime), c);
  return map;
}
/**
 * Full Delta Exchange India daily history for a symbol. Delta's candles
 * endpoint requires an explicit start/end, so we ask for the last
 * HISTORY_LIMIT days up to now — same coverage as the Binance page.
 */
async function fetchDeltaHistory(symbol: string): Promise<Map<string, OHLC> | null> {
  const end = Math.floor(Date.now() / 1000) + 86400;
  const start = end - HISTORY_LIMIT * 86400;
  try {
    const res = await fetch(
      `https://api.india.delta.exchange/v2/history/candles?symbol=${symbol}&resolution=1d&start=${start}&end=${end}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    let raw: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> | null = null;
    if (Array.isArray(data.result)) raw = data.result;
    else if (data.result && Array.isArray(data.result.candles)) raw = data.result.candles;
    else if (Array.isArray(data.candles)) raw = data.candles;
    else if (Array.isArray(data)) raw = data;
    if (!raw || !raw.length) return null;
    const map = new Map<string, OHLC>();
    for (const k of raw) {
      const openTimeMs = k.time > 1e10 ? k.time : k.time * 1000;
      map.set(utcDateKey(openTimeMs), {
        openTime: openTimeMs,
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume: Number(k.volume),
      });
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Cached accessor — one network call per symbol per UTC calendar day, shared
 * by every date in a sweep within that day. Replaces the old
 * fetchBinanceWindow/fetchDeltaWindow.
 *
 * FIX (false "Fail" on a same-day breakout): fetchDailyKlines has no
 * endTime, so its response always includes TODAY's still-forming daily
 * candle — whatever high/low it has SO FAR at fetch time, not the day's
 * eventual final high/low (see isLiveDailyCandle in binance.ts, used for the
 * exact same reason by the live screener). The old cache kept that
 * snapshot for the rest of the browser session with no expiry: fetch once
 * mid-day, and even after the real day closes with a much higher high (a
 * late breakout, say), every later backtest run in that session kept
 * grading against the stale, incomplete candle — a pattern whose target was
 * genuinely reached could still show "Fail" for the rest of the session.
 * Cache entries now carry the UTC calendar date they were fetched on; once
 * "now" rolls past that date, the entry is treated as stale and refetched,
 * so a candle that was live at fetch time is re-read once it's actually
 * closed. Still only one network call per symbol per day, not per request.
 */
async function getHistory(symbol: string, source: BacktestSource): Promise<Map<string, OHLC> | null> {
  const cache = source === "binance" ? binanceHistoryCache : deltaHistoryCache;
  const today = utcDateKey(Date.now());
  const cached = cache.get(symbol);
  if (cached !== undefined && (cached === null || cached.fetchedOnUTCDate === today)) {
    return cached ? cached.map : null;
  }

  const key = `${source}:${symbol}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const p = (source === "binance" ? fetchBinanceHistory(symbol) : fetchDeltaHistory(symbol))
    .then((hist) => {
      // Only cache SUCCESS. A null here almost always means "rate-limited
      // / transient network failure", and caching it used to permanently
      // amputate that symbol from every later scan in the session.
      if (hist) cache.set(symbol, { map: hist, fetchedOnUTCDate: today });
      inFlight.delete(key);
      return hist;
    })
    .catch(() => {
      inFlight.delete(key);
      return null;
    });
  inFlight.set(key, p);
  return p;
}

/**
 * Returns a date-aware symbol universe for a backtest.
 *
 * Binance and Delta expose the current tradable universe, not a complete
 * historical listing/unlisting archive. This function uses three protections
 * against look-ahead bias:
 *
 * 1. A saved snapshot for the requested UTC date is preferred when available.
 * 2. For older dates without a snapshot, only symbols with an actual candle on
 *    the requested date are retained. This prevents later listings from
 *    entering an older backtest.
 * 3. For today's date, the current live universe is valid and is snapshotted
 *    for future reuse.
 *
 * The candle-based fallback cannot recover symbols that were delisted and are
 * no longer returned by the exchange's current universe endpoint. That is an
 * exchange-data limitation, so the fallback is logged as approximate.
 */
const HISTORICAL_UNIVERSE_STORAGE_PREFIX = "cpr_historical_universe_v1:";

type StoredUniverse = string[];

function universeStorageKey(source: BacktestSource, dateISO: string): string {
  return HISTORICAL_UNIVERSE_STORAGE_PREFIX + source + ":" + dateISO;
}

function readStoredUniverse(source: BacktestSource, dateISO: string): StoredUniverse | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(universeStorageKey(source, dateISO));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((value): value is string => typeof value === "string" && value.length > 0)) {
      return null;
    }
    return [...new Set(parsed)];
  } catch {
    return null;
  }
}

function writeStoredUniverse(source: BacktestSource, dateISO: string, symbols: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(universeStorageKey(source, dateISO), JSON.stringify([...new Set(symbols)]));
  } catch {
    // Storage may be disabled or full. The backtest can still run in memory.
  }
}

function utcTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidUTCDateISO(dateISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const parsed = Date.parse(dateISO + "T00:00:00.000Z");
  return Number.isFinite(parsed);
}

async function getCurrentSymbolCandidates(source: BacktestSource): Promise<string[]> {
  const symbols = source === "binance"
    ? (await fetchTopUSDTSymbols()).map((ticker) => ticker.symbol)
    : (await fetchDeltaPerps()).map((ticker) => ticker.symbol);
  return [...new Set(symbols)];
}

async function getSymbolUniverse(
  source: BacktestSource,
  entryDateISO: string,
): Promise<string[]> {
  if (!isValidUTCDateISO(entryDateISO)) {
    throw new Error("Invalid backtest date " + entryDateISO + ". Expected YYYY-MM-DD.");
  }

  const saved = readStoredUniverse(source, entryDateISO);
  if (saved && saved.length > 0) return saved;

  const currentCandidates = await getCurrentSymbolCandidates(source);
  if (!currentCandidates.length) {
    throw new Error("No current " + source + " symbols were returned by the exchange.");
  }

  // Today's current exchange universe is the correct as-of-date universe.
  if (entryDateISO === utcTodayISO()) {
    writeStoredUniverse(source, entryDateISO, currentCandidates);
    return currentCandidates;
  }

  // Warm history once. The run functions prefetch the filtered list again,
  // but those entries are already cached here.
  await prefetchHistories(currentCandidates, source);

  const historicalSymbols: string[] = [];
  for (const symbol of currentCandidates) {
    const history = await getHistory(symbol, source);
    if (history?.has(entryDateISO)) historicalSymbols.push(symbol);
  }

  if (!historicalSymbols.length) {
    throw new Error(
      "No historical candle coverage was found for " + source + " on " + entryDateISO + ". " +
      "The date may be outside the configured history limit, or a date-specific universe snapshot is required."
    );
  }

  console.warn(
    "[backtest] Using a candle-availability universe for " + entryDateISO + ": " +
    historicalSymbols.length + "/" + currentCandidates.length + " current symbols had a candle on that date. " +
    "Delisted symbols cannot be recovered from the exchange's current universe endpoint; treat this as approximate unless a saved snapshot exists."
  );

  return historicalSymbols;
}

/**
 * Yields to the browser's paint cycle. `await Promise.all(...)` alone only
 * yields a microtask — when every symbol in a batch already has cached
 * candles (no real network I/O), the whole scan resolves as a chain of
 * microtasks with no macrotask in between, so the browser never gets a
 * chance to repaint the progress bar between onProgress calls: it stays at
 * 0% until the entire scan finishes, then jumps straight to 100%. This
 * forces an actual macrotask boundary so each progress update gets painted.
 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Warms the cache for a whole symbol universe in parallel chunks. Call this
 * once before a multi-date sweep: after it resolves, every date in the range
 * scans purely in memory.
 */
export async function prefetchHistories(
  symbols: string[],
  source: BacktestSource,
  onProgress?: (done: number, total: number, symbol: string) => void,
  // Matches the Live Scanner's CONCURRENCY of 10 so both put the same
  // pressure on Binance's rate limiter and see the same symbol universe.
  concurrency = 10
): Promise<void> {
  lastRunSkipped = [];

  // Up to 3 passes: anything that failed (almost always a 429 burst) is
  // retried after a short cool-off instead of vanishing from the results.
  let pending = symbols.filter((s) => !hasCachedHistory(s, source));
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    if (pass > 0) await new Promise((r) => setTimeout(r, 2000 * pass));
    for (let i = 0; i < pending.length; i += concurrency) {
      const chunk = pending.slice(i, i + concurrency);
      await Promise.all(chunk.map((s) => getHistory(s, source)));
      const done = symbols.length - pending.length + Math.min(i + concurrency, pending.length);
      onProgress?.(done, symbols.length, chunk[chunk.length - 1]);
      await yieldToBrowser();
    }
    pending = pending.filter((s) => !hasCachedHistory(s, source));
  }

  lastRunSkipped = pending;
  if (pending.length) {
    console.warn(
      `[backtest] ${pending.length}/${symbols.length} symbols had no Binance candles after 3 passes:`,
      pending
    );
  }
}

/**
 * Shared reconstruction step used by both backtestSymbolOnDate (patterns,
 * below), categoryScanSymbolOnDate (categories, further below), and
 * pivotLevelScanSymbolOnDate (Pattern sub-categories, further below):
 * fetches the candle window for a symbol/date and rebuilds the CPRResult
 * that would have been active on entryDate, exactly as the live scanner
 * does (pp/prev/today candle selection). Returns null if there isn't
 * enough history to reconstruct it at all.
 */
async function reconstructCPRForDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string
): Promise<{ result: CPRResult; window: Map<string, OHLC> } | null> {
  const window = await getHistory(symbol, source);
  if (!window) return null;

  // ADK FIX (backtest count < live count): the old version looked up the
  // EXACT calendar keys D-1/D-2/D-3 and bailed out whenever one was
  // missing. Binance occasionally has gaps in daily data for thin pairs,
  // and the Live Scanner never sees those gaps because it selects candles
  // BY POSITION (the last completed klines), not by date. We now do the
  // same: take every completed candle strictly before the entry date and
  // use the last three — identical semantics to runScreener's
  // pp/prev/today selection in binance.ts.
  const entryMs = Date.parse(entryDateISO + "T00:00:00.000Z");
  const completed = [...window.values()]
    .filter((c) => c.openTime < entryMs)
    .sort((a, b) => a.openTime - b.openTime);
  if (completed.length < 2) return null; // not enough history to reconstruct the CPR

  const todayCandle = completed[completed.length - 1]; // D-1 → today's CPR
  const prevCandle = completed[completed.length - 2]; // D-2 → prev CPR
  const ppCandle = completed.length >= 3 ? completed[completed.length - 3] : null;

  const candlesForAnalysis: OHLC[] = ppCandle ? [ppCandle, prevCandle, todayCandle] : [prevCandle, todayCandle];

  // currentPrice/change24h/quoteVolume aren't read by passesPattern for
  // any of the target/category patterns used here, so placeholder values
  // (todayCandle.close, 0, 0) are fine.
  const result = analyzeCPR(symbol, candlesForAnalysis, todayCandle.close, 0, 0, todayCandle.open);
  if (!result) return null;

  return { result, window };
}

/**
 * Backtests one symbol on one date:
 *   1. Reconstruct the CPR that would have been active on entryDate D
 *      (todayCPR from D-1's candle, prevCPR from D-2's, ppCPR from D-3's —
 *      identical candle selection to the live scanner).
 *   2. Check whether the pattern condition actually held on that date.
 *      If not, this symbol isn't part of the backtest for D — returns null,
 *      NOT a "fail" (fail is reserved for "matched the pattern but target
 *      wasn't hit").
 *   3. If it matched, check whether target was reached within the entry
 *      day or D+1 — using each day's high (bullish) or low (bearish).
 *      A hit on either of these two days counts as a pass; CHANGED: D+2 is
 *      no longer checked at all, so a miss on both the entry day and D+1
 *      is graded "fail" outright instead of getting a third D+2 chance.
 *
 * Returns null when there isn't enough candle history to evaluate at all
 * (e.g. symbol didn't exist yet, or D is too recent for D+1 data to
 * exist).
 */
export async function backtestSymbolOnDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string,
  target: BacktestTargetDef,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean
): Promise<BacktestRow | null> {
  const dPlus1 = addDaysISO(entryDateISO, 1);

  const reconstructed = await reconstructCPRForDate(symbol, source, entryDateISO);
  if (!reconstructed) return null;
  const { result, window } = reconstructed;

  if (!passesPatternFn(result, target.key)) return null; // didn't match the pattern on this date

  const targetLevel = target.getTarget(result);
  const entryLevel = target.getEntry(result);
  const stoplossLevel = target.getStoploss(result);
  const entryDayCandle = window.get(entryDateISO) ?? null;
  const nextDayCandle = window.get(dPlus1) ?? null;

  // FIX: a NaN/undefined targetLevel (getTarget read off a CPR level that
  // wasn't computed for this reconstruction, e.g. todayCPR.r4 missing) used
  // to fall through to the hits() check below, where every `c.high >=
  // NaN` comparison is false — so hitDate never got set and the row was
  // mislabeled "fail" even though no real target existed to miss. Bail out
  // to "invalid-target" instead so it reads distinctly from a genuine miss.
  if (!Number.isFinite(targetLevel)) {
    console.warn(
      `[backtest] ${symbol} on ${entryDateISO}: pattern "${target.key}" matched but its target ` +
        `level ("${target.targetLabel}") came back non-finite (${targetLevel}) — marking invalid-target.`
    );
    return {
      symbol,
      source,
      entryDate: entryDateISO,
      todayCPR: result.todayCPR,
      prevCPR: result.prevCPR,
      compressionRatio: result.compressionRatio,
      targetLevel,
      targetLabel: target.targetLabel,
      entryLevel,
      entryLabel: target.entryLabel,
      stoplossLevel,
      stoplossLabel: target.stoplossLabel,
      result: "invalid-target",
      hitDate: null,
      daysToHit: null,
      ...closeAndChange(window, entryDateISO),
      raw: result,
    };
  }

  const hits = (c: OHLC | null) =>
    !!c && (target.direction === "bullish" ? c.high >= targetLevel : c.low <= targetLevel);

  let hitDate: string | null = null;
  let daysToHit: 0 | 1 | null = null;
  if (hits(entryDayCandle)) {
    hitDate = entryDateISO;
    daysToHit = 0;
  } else if (hits(nextDayCandle)) {
    hitDate = dPlus1;
    daysToHit = 1;
  }

  const outcome: BacktestRow["result"] =
    entryDayCandle || nextDayCandle ? (hitDate ? "pass" : "fail") : "insufficient-data";

  return {
    symbol,
    source,
    entryDate: entryDateISO,
    todayCPR: result.todayCPR,
    prevCPR: result.prevCPR,
    compressionRatio: result.compressionRatio,
    targetLevel,
    targetLabel: target.targetLabel,
    entryLevel,
    entryLabel: target.entryLabel,
    stoplossLevel,
    stoplossLabel: target.stoplossLabel,
    result: outcome,
    hitDate,
    daysToHit,
    ...closeAndChange(window, entryDateISO),
    raw: result,
  };
}

/**
 * NEW: Category-scan version of backtestSymbolOnDate — same CPR
 * reconstruction, but checks the CATEGORY's base condition (e.g.
 * "compressed") instead of a specific pattern's, and returns a
 * CategoryScanRow with no target/result/hitDate fields, since a category
 * has no single defined target to grade against.
 */
export async function categoryScanSymbolOnDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string,
  categoryKey: string,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean
): Promise<CategoryScanRow | null> {
  const reconstructed = await reconstructCPRForDate(symbol, source, entryDateISO);
  if (!reconstructed) return null;
  const { result, window } = reconstructed;

  if (!passesPatternFn(result, categoryKey)) return null; // didn't match the category's base condition

  return {
    symbol,
    source,
    entryDate: entryDateISO,
    todayCPR: result.todayCPR,
    prevCPR: result.prevCPR,
    compressionRatio: result.compressionRatio,
    ...closeAndChange(window, entryDateISO),
    raw: result,
  };
}

/**
 * NEW: Pattern backtest version of backtestSymbolOnDate — same CPR
 * reconstruction, and checks BOTH the parent CATEGORY's base condition
 * (e.g. "inside-cpr") AND the named Pattern's raw flag (e.g.
 * "CU4L4", via matchesPatternFn — see matchesPatternFlag in
 * ScreenerUtils.tsx), same two-part match as before. CHANGED: every
 * existing Pattern now grades against a fixed target — today's own R4 /
 * U4, bullish ("-R4") — instead of running as a symbol-list-only scan, so
 * it returns a full BacktestRow (targetLevel/result/hitDate/daysToHit)
 * using the identical entry/D+1 hit-window logic as
 * backtestSymbolOnDate. This lets the Backtest panel render Pattern
 * selections with the exact same Result/Hit Date/Change columns as a
 * View backtest.
 */
export async function pivotLevelBacktestSymbolOnDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string,
  categoryKey: string,
  pivotLevelKey: string,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  matchesPatternFn: (r: CPRResult, label: string) => boolean
): Promise<BacktestRow | null> {
  const dPlus1 = addDaysISO(entryDateISO, 1);

  const reconstructed = await reconstructCPRForDate(symbol, source, entryDateISO);
  if (!reconstructed) return null;
  const { result, window } = reconstructed;

  if (!passesPatternFn(result, categoryKey)) return null; // didn't match the parent category's base condition
  if (!matchesPatternFn(result, pivotLevelKey)) return null; // didn't match this Pattern's raw flag

  // NEW: if this Pattern (or a nested Subpattern under it — see
  // BacktestSubCategoryDef.patterns in the interfaces above) has its own
  // BACKTEST_TARGETS entry keyed by its exact pivotLevelKey (e.g.
  // "E-E-AA-BB-EL1U2" graded against today's own R2), grade against THAT
  // specific target/direction instead. Falls back to the original
  // hardcoded bullish U4/R4 target below for every Pattern that has no
  // defined target of its own, so existing Pattern-only selections are
  // unaffected.
  const definedTarget = BACKTEST_TARGETS.find((t) => t.key === pivotLevelKey);
  const bullish = definedTarget ? definedTarget.direction === "bullish" : true;
  const targetLevel = definedTarget ? definedTarget.getTarget(result) : result.todayCPR.r4;
  const targetLabel = definedTarget ? definedTarget.targetLabel : "U4 (today's R4)";
  // Entry/Stoploss follow the same bullish/bearish rule as every View:
  // bullish (R-level target) -> Entry = today's TC, Stoploss = today's S1;
  // bearish (S-level target) -> Entry = today's BC, Stoploss = today's R1.
  // The hardcoded U4/R4 fallback above is bullish, so its fallback
  // Entry/Stoploss follow the same "bullish" rule.
  const entryLevel = definedTarget ? definedTarget.getEntry(result) : result.todayCPR.tc;
  const entryLabel = definedTarget ? definedTarget.entryLabel : "TC (today's TC)";
  const stoplossLevel = definedTarget ? definedTarget.getStoploss(result) : result.todayCPR.s1;
  const stoplossLabel = definedTarget ? definedTarget.stoplossLabel : "S1 (today's S1)";
  const entryDayCandle = window.get(entryDateISO) ?? null;
  const nextDayCandle = window.get(dPlus1) ?? null;

  // Same non-finite-target guard as backtestSymbolOnDate — see its
  // comment for why this is "invalid-target" rather than a silent "fail".
  if (!Number.isFinite(targetLevel)) {
    console.warn(
      `[backtest] ${symbol} on ${entryDateISO}: Pattern "${pivotLevelKey}" matched but its ` +
        `target (${targetLabel}) came back non-finite (${targetLevel}) — marking invalid-target.`
    );
    return {
      symbol,
      source,
      entryDate: entryDateISO,
      todayCPR: result.todayCPR,
      prevCPR: result.prevCPR,
      compressionRatio: result.compressionRatio,
      targetLevel,
      targetLabel,
      entryLevel,
      entryLabel,
      stoplossLevel,
      stoplossLabel,
      result: "invalid-target",
      hitDate: null,
      daysToHit: null,
      ...closeAndChange(window, entryDateISO),
      raw: result,
    };
  }

  const hits = (c: OHLC | null) => !!c && (bullish ? c.high >= targetLevel : c.low <= targetLevel);

  let hitDate: string | null = null;
  let daysToHit: 0 | 1 | null = null;
  if (hits(entryDayCandle)) {
    hitDate = entryDateISO;
    daysToHit = 0;
  } else if (hits(nextDayCandle)) {
    hitDate = dPlus1;
    daysToHit = 1;
  }

  const outcome: BacktestRow["result"] =
    entryDayCandle || nextDayCandle ? (hitDate ? "pass" : "fail") : "insufficient-data";

  return {
    symbol,
    source,
    entryDate: entryDateISO,
    todayCPR: result.todayCPR,
    prevCPR: result.prevCPR,
    compressionRatio: result.compressionRatio,
    targetLevel,
    targetLabel,
    entryLevel,
    entryLabel,
    stoplossLevel,
    stoplossLabel,
    result: outcome,
    hitDate,
    daysToHit,
    ...closeAndChange(window, entryDateISO),
    raw: result,
  };
}

/**
 * Runs the requested historical universe through backtestSymbolOnDate.
 *
 * The universe is date-aware: saved point-in-time snapshots are preferred,
 * and otherwise symbols must have a candle on the requested entry date. The
 * fallback still cannot restore delisted symbols that are absent from the
 * exchange's current symbol endpoint.
 */
export async function runBacktest(
  patternKey: string,
  entryDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<BacktestRow[]> {
  const target = BACKTEST_TARGETS.find((t) => t.key === patternKey);
  if (!target) throw new Error(`No backtest target defined yet for pattern "${patternKey}"`);

  // Single source of truth — see getSymbolUniverse above. No per-call
  // duplication of the fetch/filter/sort logic.
  const symbols: string[] = await getSymbolUniverse(source, entryDateISO);

  // Warm the candle cache once; subsequent dates in a sweep hit memory only.
  await prefetchHistories(symbols, source, onProgress);

  const rows: BacktestRow[] = [];
  const batchSize = 50;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((sym) => backtestSymbolOnDate(sym, source, entryDateISO, target, passesPatternFn))
    );
    batchResults.forEach((r) => {
      if (r) rows.push(r);
    });
    onProgress?.(Math.min(i + batchSize, symbols.length), symbols.length, batch[batch.length - 1]);
    await yieldToBrowser();
  }

  return rows;
}

/**
 * NEW: Category-scan counterpart of runBacktest — same symbol-universe
 * caveat applies (see KNOWN LIMITATION above). Runs categoryScanSymbolOnDate
 * across the full universe and returns the simplified CategoryScanRow list
 * (symbol list + CPR data only, no target/result/hitDate).
 */
export async function runCategoryScan(
  categoryKey: string,
  entryDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<CategoryScanRow[]> {
  // Single source of truth — see getSymbolUniverse above. No per-call
  // duplication of the fetch/filter/sort logic.
  const symbols: string[] = await getSymbolUniverse(source, entryDateISO);

  const rows: CategoryScanRow[] = [];
  await prefetchHistories(symbols, source, onProgress);

  const batchSize = 50;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((sym) => categoryScanSymbolOnDate(sym, source, entryDateISO, categoryKey, passesPatternFn))
    );
    batchResults.forEach((r) => {
      if (r) rows.push(r);
    });
    onProgress?.(Math.min(i + batchSize, symbols.length), symbols.length, batch[batch.length - 1]);
    await yieldToBrowser();
  }

  return rows;
}

/**
 * NEW: Pattern backtest counterpart of runCategoryScan — same
 * symbol-universe caveat applies (see KNOWN LIMITATION above). Runs
 * pivotLevelBacktestSymbolOnDate across the full universe and returns a
 * graded BacktestRow list (Target/Result/Hit Date, target = today's R4 /
 * U4, bullish) for a category's Pattern sub-bucket (e.g. "CPR Inside"
 * → "CU4L4-R4"), same shape as runBacktest's output.
 */
/**
 * NEW: Pattern Stats page support. One row per dropdown pattern entry
 * (every `sub.key` nested under a BACKTEST_CATEGORIES category's
 * `patterns` list — e.g. "A-A-AA-AA", "B-C-BB-C") plus how many real
 * historical (symbol, date) rows actually matched it.
 */
export interface PatternCensusRow {
  categoryKey: string;
  categoryLabel: string;
  patternKey: string; // matches matchesPatternFlag's `label` param
  patternLabel: string;
  count: number;
}

/**
 * TEMPORARY DEBUG ADDITION — one row per distinct raw
 * (HHLLCategory, RRHHCategory, SSLLCategory) combination actually observed
 * among the real historical rows that pass a category's base condition
 * (passesPatternFn(result, categoryKey)). This is the same raw-flag triple
 * the comments throughout BACKTEST_PATTERN_MATCHERS reason about ("of the
 * 9x9 naive HHLLCategory x RRHHCategory x SSLLCategory combinations, only
 * N are reachable") — surfaced directly from live data instead of by
 * proof, so those claims can be sanity-checked per category. Remove this
 * (and its plumbing in runPatternCensus/PatternStats) once no longer needed.
 */
export interface CategoryComboRow {
  categoryKey: string;
  categoryLabel: string;
  combo: string; // e.g. "HHLL-A / RRHH-AA / SSLL-AA", or, for
                 // "top15gainers"/"top15losers" only,
                 // "RRSS-A / HHLL-A / RRHH-AA / SSLL-OA" (see
                 // RRSS_COMBO_CATEGORIES below).
  hhll: string;
  rrhh: string;
  ssll: string;
  rrss?: string; // only set for RRSS_COMBO_CATEGORIES ("top15gainers"/"top15losers")
  count: number;
}

// TEMPORARY DEBUG ADDITION — categories whose combo tally gets the raw
// SSRRCategory (RRSS-A/RRSS-B/RRSS-C/RRSS-E/RRSS=) prepended as a 4th
// segment, ahead of HHLL/RRHH/SSLL. Requested for "TOP 15 GAINERS"/
// "TOP 15 LOSERS" only — every other category keeps the plain
// HHLL/RRHH/SSLL combo.
const RRSS_COMBO_CATEGORIES = new Set(["top15gainers", "top15losers"]);

/**
 * Counts live matches for EVERY dropdown pattern across a date range in a
 * single sweep, instead of re-running runPivotLevelBacktest once per
 * pattern (which would reconstruct the same symbol/date CPR dozens of
 * times over — one pass per pattern instead of one pass total). For each
 * (symbol, date) in range, reconstructCPRForDate runs ONCE (cached candle
 * history, so no extra network calls after the initial prefetch), and the
 * resulting CPRResult is checked against every (categoryKey, patternKey)
 * pair — same passesPatternFn/matchesPatternFn used everywhere else in
 * this file (see passesPattern/matchesPatternFlag in ScreenerUtils.tsx).
 *
 * The symbol universe is resolved once, as of endDateISO (the most recent
 * date in range) — same "current exchange universe, walked backward"
 * caveat as getSymbolUniverse's other callers; see its KNOWN LIMITATION
 * comment above for what that means for delisted symbols.
 */
export async function runPatternCensus(
  startDateISO: string,
  endDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  matchesPatternFn: (r: CPRResult, label: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<{ rows: PatternCensusRow[]; combos: CategoryComboRow[] }> {
  if (!isValidUTCDateISO(startDateISO) || !isValidUTCDateISO(endDateISO)) {
    throw new Error("Invalid date range " + startDateISO + " .. " + endDateISO + ". Expected YYYY-MM-DD.");
  }
  if (startDateISO > endDateISO) {
    throw new Error("startDateISO must be <= endDateISO.");
  }

  // Flatten every (category, pattern) pair once up front.
  const pairs: { categoryKey: string; categoryLabel: string; patternKey: string; patternLabel: string }[] = [];
  for (const cat of BACKTEST_CATEGORIES) {
    for (const sub of cat.patterns ?? []) {
      pairs.push({ categoryKey: cat.key, categoryLabel: cat.label, patternKey: sub.key, patternLabel: sub.label });
    }
  }

  const counts = new Map<string, number>();
  const pairKey = (categoryKey: string, patternKey: string) => `${categoryKey}::${patternKey}`;
  pairs.forEach((p) => counts.set(pairKey(p.categoryKey, p.patternKey), 0));

  // TEMPORARY DEBUG ADDITION — see CategoryComboRow above. One counter per
  // (category, raw HHLL/RRHH/SSLL combo) observed among rows that pass
  // that category's base condition. Every category is covered here (not
  // just categories with a `patterns` list), since the combo is a property
  // of the base condition itself, not of any nested pattern.
  const comboCounts = new Map<string, number>();
  const comboKey = (categoryKey: string, combo: string) => `${categoryKey}::${combo}`;

  const dates: string[] = [];
  for (let d = startDateISO; d <= endDateISO; d = addDaysISO(d, 1)) dates.push(d);

  const symbols: string[] = await getSymbolUniverse(source, endDateISO);
  await prefetchHistories(symbols, source, onProgress);

  const batchSize = 50;
  let done = 0;
  const total = symbols.length;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (symbol) => {
        for (const dateISO of dates) {
          const reconstructed = await reconstructCPRForDate(symbol, source, dateISO);
          if (!reconstructed) continue;
          const { result } = reconstructed;

          // TEMPORARY DEBUG ADDITION — tally the raw HHLL/RRHH/SSLL combo
          // once per category (independent of any nested pattern loop
          // below), for every category, not only ones with `patterns`.
          // For RRSS_COMBO_CATEGORIES ("top15gainers"/"top15losers") the
          // raw SSRRCategory (RRSS-X) is prepended as a 4th segment.
          const hhll = result.HHLLCategory ?? "none";
          const rrhh = result.RRHHCategory ?? "none";
          const ssll = result.SSLLCategory ?? "none";
          const rrss = result.SSRRCategory ?? "none";
          const baseCombo = `${hhll} / ${rrhh} / ${ssll}`;
          for (const cat of BACKTEST_CATEGORIES) {
            if (!passesPatternFn(result, cat.key)) continue; // base category condition
            const combo = RRSS_COMBO_CATEGORIES.has(cat.key) ? `${rrss} / ${baseCombo}` : baseCombo;
            const k = comboKey(cat.key, combo);
            comboCounts.set(k, (comboCounts.get(k) ?? 0) + 1);
          }

          for (const p of pairs) {
            if (!passesPatternFn(result, p.categoryKey)) continue; // base category condition
            if (!matchesPatternFn(result, p.patternKey)) continue; // this pattern's raw flag
            const k = pairKey(p.categoryKey, p.patternKey);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        }
      })
    );
    done = Math.min(i + batchSize, symbols.length);
    onProgress?.(done, total, batch[batch.length - 1]);
    await yieldToBrowser();
  }

  const rows = pairs
    .map((p) => ({ ...p, count: counts.get(pairKey(p.categoryKey, p.patternKey)) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  // TEMPORARY DEBUG ADDITION — flatten comboCounts into CategoryComboRow[],
  // sorted highest-count-first within each category (PatternStats groups
  // these back up by categoryKey). RRSS_COMBO_CATEGORIES combos carry an
  // extra leading RRSS-X segment, so they're split into 4 parts instead of 3.
  const combos: CategoryComboRow[] = [];
  for (const cat of BACKTEST_CATEGORIES) {
    const prefix = `${cat.key}::`;
    for (const [k, count] of comboCounts.entries()) {
      if (!k.startsWith(prefix)) continue;
      const combo = k.slice(prefix.length);
      if (RRSS_COMBO_CATEGORIES.has(cat.key)) {
        const [rrss, hhll, rrhh, ssll] = combo.split(" / ");
        combos.push({ categoryKey: cat.key, categoryLabel: cat.label, combo, hhll, rrhh, ssll, rrss, count });
      } else {
        const [hhll, rrhh, ssll] = combo.split(" / ");
        combos.push({ categoryKey: cat.key, categoryLabel: cat.label, combo, hhll, rrhh, ssll, count });
      }
    }
  }
  combos.sort((a, b) => b.count - a.count);

  return { rows, combos };
}

export async function runPivotLevelBacktest(
  categoryKey: string,
  pivotLevelKey: string,
  entryDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  matchesPatternFn: (r: CPRResult, label: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<BacktestRow[]> {
  // Single source of truth — see getSymbolUniverse above. No per-call
  // duplication of the fetch/filter/sort logic.
  const symbols: string[] = await getSymbolUniverse(source, entryDateISO);

  const rows: BacktestRow[] = [];
  await prefetchHistories(symbols, source, onProgress);

  const batchSize = 50;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((sym) =>
        pivotLevelBacktestSymbolOnDate(sym, source, entryDateISO, categoryKey, pivotLevelKey, passesPatternFn, matchesPatternFn)
      )
    );
    batchResults.forEach((r) => {
      if (r) rows.push(r);
    });
    onProgress?.(Math.min(i + batchSize, symbols.length), symbols.length, batch[batch.length - 1]);
    await yieldToBrowser();
  }

  return rows;
}