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
 *
 * NEW: "eXHi-L4U4-U4" — nested under the "Overlap Above" category's
 * "HiL4U3" Pattern (see BACKTEST_CATEGORIES below).
 * Bullish, per Screener.tsx's legend card ("Overlap Higher continuation —
 * bullish bias toward U4") the target is today's own R4 / U4.
 */
export interface BacktestTargetDef {
  key: string;          // matches passesPattern's pattern-key string exactly
  label: string;        // display name
  direction: "bullish" | "bearish";
  getTarget: (r: CPRResult) => number;
  targetLabel: string;  // e.g. "U4 (today's R4)"
}

export const BACKTEST_TARGETS: BacktestTargetDef[] = [
  // RENAMED from "9AM:MegL-U4+1:3PM": all previous conditions removed.
  // "6PM:HHLLA-RRHHGap:6AM" — nested directly under "LEVELS ABOVE" (no
  // longer gated on the "eXL4U2" Pattern flag). Condition: LevelsAbove +
  // RRSSGapCategory RRGap + RRHHCategory RRHH-AA + SSLLCategory SSLL-AA +
  // HHLLCategory HHLL-A + PDHPDLGapCategory HHGap — see ScreenerUtils.tsx.
  // Bullish, entry ~6PM, targets today's own R4 / U4 by ~6AM.
  {
    key: "6PM:HHLLA-RRHHGap:6AM",
    label: "6PM:HHLLA-RRHHGap:6AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "7PM:MoMi->U4:2AM" — nested under "LEVELS ABOVE" → Pattern "eXL4U2",
  // alongside its sibling "6PM:HHLLA-RRHHGap:6AM". Bullish, targets today's
  // own R4 / U4 by ~2AM.
  {
    key: "7PM:MoMi->U4:2AM",
    label: "7PM:MoMi->U4:2AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "7PM:MoMi-<L4:2AM" — bearish sibling of "7PM:MoMi->U4:2AM", same
  // nesting ("LEVELS ABOVE" → Pattern "eXL4U2") and same base condition
  // (p-cOL1U1, pMicro/Mini widths, both PDLs below L1), but split on
  // today's PDL vs prev day's pivot: this variant fires when
  // todayCPR.PDL < prevCPR.pivot, targeting today's own S4 / L4 by ~2AM.
  {
    key: "7PM:MoMi-<L4:2AM",
    label: "7PM:MoMi-<L4:2AM",
    direction: "bearish",
    targetLabel: "L4 (today's S4)",
    getTarget: (r) => r.todayCPR.s4,
  },
  // NEW: "6PM:APHS1A-FAU4:9PM" — nested under "LEVELS ABOVE" → Pattern
  // "eXL4U2", alongside its "7PM:MoMi->U4:2AM" /
  // "7PM:MoMi-<L4:2AM" siblings. Condition: LevelsAbove + eXL4U2 + the
  // prev day's own pivot sub-label being eXL4U3 (p-eXL4U3) + today's BC
  // above prev day's own PDH + today's S1 above prev day's TC — see
  // ScreenerUtils.tsx. Bullish, entry ~6PM, targets Far Above today's R4
  // by ~9PM.
  {
    key: "6PM:APHS1A-FAU4:9PM",
    label: "6PM:APHS1A-FAU4:9PM",
    direction: "bullish",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "9AM:pPALPApH-FAU4:2PM" — nested under "LEVELS ABOVE" → Pattern
  // "HiL3U4" (see BACKTEST_CATEGORIES below), alongside its "eXL4U2"
  // siblings. Condition: LevelsAbove + raw HiL3U4 flag + prev day's Pivot
  // above today's PDL + today's own Pivot above today's PDH — see
  // ScreenerUtils.tsx. Bullish, entry ~9AM, targets Far Above today's R4
  // by ~2PM.
  {
    key: "9AM:pPALPApH-FAU4:2PM",
    label: "9AM:pPALPApH-FAU4:2PM",
    direction: "bullish",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // REMOVED: "HA-U1>PU4" — its condition (cprRising && strWideCPR &&
  // todayCPR.r1 > prevCPR.r4) is identical to the "U1 > pU4" (u1-gt-pu4)
  // parent category's own base condition, so it was just a duplicate
  // "dot" in the Backtest dropdown. Use the "U1 > pU4" category's own
  // symbol-list scan instead.
  // NEW: nested under the "U1 > pU4" category. Bullish, same PU4 target
  // style as the (now-removed) HA-U1>PU4 (matches ViewsSidebar's
  // u1-gt-pu4 sub-pattern).
  {
    key: "9AM:APHS1A-FAU4:4AM",
    label: "9AM:APHS1A-FAU4:4AM",
    direction: "bullish",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "6AM:pX-APHS1A-pL4:4AM" — nested under the "U1 > pU4" (u1-gt-pu4)
  // category's "eXL3TC" Pattern, alongside
  // "9AM:APHS1A-FAU4:4AM". Same base condition as that sibling plus the
  // prev day's own pivot sub-label being eXL4U3 (see ScreenerUtils.tsx).
  // Bearish, targets pL4 (prev day's S4) by ~4AM.
  {
    key: "6AM:pX-APHS1A-pL4:4AM",
    label: "6AM:pX-APHS1A-pL4:4AM",
    direction: "bearish",
    targetLabel: "pL4 (prev day's S4)",
    getTarget: (r) => r.prevCPR.s4,
  },
  // NEW: "8AM:APHS1A-FAU4:4AM" — nested under the "U1 > pU4" (u1-gt-pu4)
  // category's "eXL3U1" Pattern, alongside its
  // "9AM:APHS1A-FAU4:4AM" sibling. Base condition: this category's
  // U1>pU4 condition AND the raw eXL3U1 flag AND today's BC above prev
  // day's own PDH AND today's S1 above prev day's TC — see
  // ScreenerUtils.tsx. Bullish, targets Far Above U4 (today's R4) by ~4AM.
  {
    key: "8AM:APHS1A-FAU4:4AM",
    label: "8AM:APHS1A-FAU4:4AM",
    direction: "bullish",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "eXHi-L4U4-U4" — nested under "Overlap Above" → Pattern "HiL4U3"
  {
    key: "eXHi-L4U4-U4",
    label: "eXHi-L4U4-U4",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "7AM:MiMi-pU4:11PM" — nested under "Overlap Above" → Pattern "cOL4U4".
  // Bullish; per its legend card the target is today's own R4 / U4 (~11PM IST).
  {
    key: "7AM:MiMi-pU4:11PM",
    label: "7AM:MiMi-pU4:11PM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "cOL3U3-pL4" — nested under "Overlap Above" → Pattern
  // "cOL3U3". Bearish — unlike its Overlap Above sibling eXHi-L4U4-U4,
  // this one targets prev day's S4 (PL4).
  {
    key: "cOL3U3-pL4",
    label: "cOL3U3-pL4",
    direction: "bearish",
    targetLabel: "PL4 (prev day's S4)",
    getTarget: (r) => r.prevCPR.s4,
  },
  // NEW: "6PM:LaLa->U4:2AM" — nested under "Overlap Above" → Pattern
  // "eXL4U4" (previously an empty symbol-list-only Pattern, see
  // BACKTEST_CATEGORIES below). Base eXL4U4 flag + prev day's own pivot
  // sub-label p-cOU3L3 + pLarge/Large width combo + p-PDL<L1 + today's
  // PDH>U1 + today's PDH/PDL above prev day's R1/S1. Bullish, targets
  // today's own R4 / U4, entry ~6PM by ~2AM.
  {
    key: "6PM:LaLa->U4:2AM",
    label: "6PM:LaLa->U4:2AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
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
  },
  // NEW: "ss-eXU4L1-U4:10PM" — nested under the "L1 < pL4" category's
  // "eXU4L1" Pattern. Bullish, targets U4 (today's R4)
  // by ~10PM.
  {
    key: "ss-eXU4L1-U4:10PM",
    label: "ss-eXU4L1-U4:10PM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "BC>pPDL-U3:5AM" — nested under "LEVELs BELOW" (levelsbelow)
  // category's new "cOU3L4" Pattern (see BACKTEST_CATEGORIES
  // below). Bullish — per ScreenerUtils.tsx's condition (today's BC above
  // prev day's PDH, prevCPR.bc > todayCPR.r1) — targets U4 (today's R4)
  // by ~5AM, same target style as the other "little/overlap" bullish subs.
  {
    key: "BC>pPDL-U3:5AM",
    label: "BC>pPDL-U3:5AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "PDH>pTC-U4:5AM" — nested directly under "LEVELs BELOW" (levelsbelow)
  // category, alongside the "cOU3L4" Pattern. Base condition:
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
  },
  // NEW: "11AM:pCPR1AHi-FApU4:1PM" — nested under "LEVELs BELOW"
  // (levelsbelow) category's new "LoU3L4" Pattern (see
  // BACKTEST_CATEGORIES below), alongside its "cOU3L4"/"LoU3L3" siblings.
  // Base condition: this category's LevelsBelow condition AND the raw
  // LoU3L4 flag AND HHLLBelow — see ScreenerUtils.tsx. Bullish, targets
  // Far Above pU4 (prev day's R4) by ~1PM.
  {
    key: "11AM:pCPR1AHi-FApU4:1PM",
    label: "11AM:pCPR1AHi-FApU4:1PM",
    direction: "bullish",
    targetLabel: "FApU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
  },
  // NEW: "TiMe-eXL3TC-AU4:2PM" — nested directly under "U1 > pU4"
  // (u1-gt-pu4), alongside 9AM:APHS1A-FAU4:4AM. Bullish, Pattern eXL3TC +
  // pTiny/Mega width combo, targets AU4 (prev day's R4) by ~2PM.
  {
    key: "TiMe-eXL3TC-AU4:2PM",
    label: "TiMe-eXL3TC-AU4:2PM",
    direction: "bullish",
    targetLabel: "AU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
  },
  // NEW: "SMg-exHiL2L1-U4:3AM" — nested under "U1 > pU4" via the
  // "eXHiL2L1" Pattern. Bullish, targets U4 (today's R4) @ 3AM.
  {
    key: "SMg-exHiL2L1-U4:3AM",
    label: "SMg-exHiL2L1-U4:3AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "6AM:MegMeg-L3:8PM" — nested under "U1 > pU4" (u1-gt-pu4) via
  // the new "eXL4U1" Pattern. Base u1-gt-pu4 condition +
  // raw eXL4U1 flag + prev/today CPR both width category Mega
  // (5.00%-10.00%). Bearish, targets L3 (today's S3) by ~8PM.
  {
    key: "6AM:MegMeg-L3:8PM",
    label: "6AM:MegMeg-L3:8PM",
    direction: "bearish",
    targetLabel: "L3 (today's S3)",
    getTarget: (r) => r.todayCPR.s3,
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
  },
  // NEW: "8AM:SRBHHLLA-pU4+1:8AM" — nested under "CPR Inside" (inside-cpr)
  // via the new "cOL3U3" Pattern (see BACKTEST_CATEGORIES
  // below). Base inside-cpr condition + raw cOL3U3 flag + pLarge/Medium
  // width combo + p-PDL<L1 + PDH>U1 + prev R1>today R1 + prev S1>today S1
  // + today's PDH/PDL above prev day's PDH/PDL. Bullish, targets pU4
  // (prev day's R4), entry ~8AM, by ~8AM the next day.
  {
    key: "8AM:SRBHHLLA-pU4+1:8AM",
    label: "8AM:SRBHHLLA-pU4+1:8AM",
    direction: "bullish",
    targetLabel: "PU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
  },
  // NEW: "2PM:pPDHLA-SRA-U4:7PM" — nested under "CPR Inside" (inside-cpr)
  // via the new "cOL4U4" Pattern (see BACKTEST_CATEGORIES
  // below). Base inside-cpr condition + raw cOL4U4 flag + pLarge/Large
  // width combo + p-PDH>U1 + PDL<L1 + today R1>prev R1 + today S1>prev S1
  // + prev day's PDH/PDL above today's PDH/PDL. Bullish, entry ~2PM,
  // targets U4 (today's R4) by ~7PM.
  // NEW: "8AM:pPDHA-SRA-U4+2:2AM" — nested under "CPR Inside" (inside-cpr)
  // via the new "eXL4U4" Pattern (see BACKTEST_CATEGORIES
  // below). Base inside-cpr condition + raw eXL4U4 flag + today's SSRRAbove
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
  },
  {
    key: "2PM:pPDHLA-SRA-U4:7PM",
    label: "2PM:pPDHLA-SRA-U4:7PM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
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
 * "Pattern" sub-categories (e.g. "Overlap Above" → Pattern
 * "HiL4U3"). A Pattern is itself just another
 * symbol-list-only, single-date, no-target scan — same as a category —
 * except its base condition is the PARENT category's condition AND the
 * named Pattern's raw flag (see matchesPatternFlag in
 * ScreenerUtils.tsx), both evaluated together. Selecting one of ITS
 * subPatternKeys runs the normal runBacktest flow (single date or date
 * range) against that pattern's specific target, same as a top-level
 * category's direct sub-patterns.
 */
export interface BacktestSubCategoryDef {
  key: string;              // Pattern label (matches matchesPatternFlag's `label` param, e.g. "HiL4U3")
  label: string;            // display name, e.g. "HiL4U3"
  subPatternKeys: string[]; // BACKTEST_TARGETS keys nested under this Pattern
}

export interface BacktestCategoryDef {
  key: string;                          // matches passesPattern's BASE category key (e.g. "compressed")
  label: string;                        // display name, e.g. "LittleCPR Above"
  subPatternKeys?: string[];            // BACKTEST_TARGETS keys nested directly under this category
  patterns?: BacktestSubCategoryDef[]; // NEW: Pattern sub-categories nested under this category
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
    label: "LEVELs ABOVE",
    // RENAMED from "9AM:MegL-U4+1:3PM": all previous conditions removed,
    // so "6PM:HHLLA-RRHHGap:6AM" is no longer gated on the "eXL4U2"
    // Pattern flag — it now sits directly on this category's own
    // subPatternKeys again (base condition = parent levelsabove's
    // condition AND RRGap/RRHH-AA/SSLL-AA/HHLL-A/HHGap — see
    // ScreenerUtils.tsx).
    subPatternKeys: ["6PM:HHLLA-RRHHGap:6AM"],
    // NEW: "eXL4U2" Pattern (arrow) — same shape as
    // cOU3L4/LoU3L3/HiL4U3 elsewhere. Base condition = parent
    // levelsabove's condition AND the raw eXL4U2 flag (see
    // matchesPatternFlag in ScreenerUtils.tsx).
    patterns: [
      {
        key: "eXL4U2",
        label: "eXL4U2",
        subPatternKeys: ["7PM:MoMi->U4:2AM", "7PM:MoMi-<L4:2AM", "6PM:APHS1A-FAU4:9PM"],
      },
      // NEW: "HiL3U4" Pattern (arrow) — same shape as its
      // "eXL4U2" sibling above. Base condition = parent levelsabove's
      // condition AND the raw HiL3U4 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). Nests "9AM:pPALPApH-FAU4:2PM".
      {
        key: "HiL3U4",
        label: "HiL3U4",
        subPatternKeys: ["9AM:pPALPApH-FAU4:2PM"],
      },
    ],
  },
  // NEW: "LEVELs BELOW" left-nav section (top of the pattern tree in
  // ViewsSidebar.tsx) — nests the "cOU3L4" Pattern, which
  // in turn nests "BC>pPDL-U3:5AM" (base condition: this category's
  // LevelsBelow condition AND the raw cOU3L4 flag — see
  // matchesPatternFlag in ScreenerUtils.tsx).
  {
    key: "levelsbelow",
    label: "LEVELs BELOW",
    // NEW: "PDH>pTC-U4:5AM" now nests under the "LoU3L3" Pattern
    //  below (not directly on the category), since it also
    // requires the raw LoU3L3 flag — see ScreenerUtils.tsx.
    patterns: [
      {
        key: "cOU3L4",
        label: "cOU3L4",
        subPatternKeys: ["BC>pPDL-U3:5AM"],
      },
      // NEW: "LoU3L3" — Pattern (arrow), same shape as
      // "cOU3L4": base condition = this category's LevelsBelow condition
      // AND the raw LoU3L3 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). Nests "PDH>pTC-U4:5AM".
      {
        key: "LoU3L3",
        label: "LoU3L3",
        subPatternKeys: ["PDH>pTC-U4:5AM"],
      },
      // NEW: "LoU3L4" — Pattern (arrow), same shape as its
      // "LoU3L3" sibling: base condition = this category's LevelsBelow
      // condition AND the raw LoU3L4 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). Nests "11AM:pCPR1AHi-FApU4:1PM".
      {
        key: "LoU3L4",
        label: "LoU3L4",
        subPatternKeys: ["11AM:pCPR1AHi-FApU4:1PM"],
      },
      // NEW: "cOU2L4" — Pattern (arrow), same shape as its
      // cOU3L4/LoU3L3/LoU3L4 siblings above: base condition = this
      // category's LevelsBelow condition AND the raw cOU2L4 flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). No specific
      // target-graded sub-pattern nested under it yet — selecting it in
      // the Backtest dropdown runs a symbol-list-only category scan.
      {
        key: "cOU2L4",
        label: "cOU2L4",
        subPatternKeys: [],
      },
    ],
  },
  // NEW: "COMPRESSED" left-nav section (first item). CHANGED:
  // "6A:HLC-SSLL:R4-6P" moved off this category's own subPatternKeys and
  // nested under the "RRHH-BB:SSLL-AA:SSLLGap-R4" Pattern arrow instead
  // (same shape as HiL4U3/cOL3U3 elsewhere); the Pattern arrow no longer
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
    ],
  },
  // NEW: "EXPANDED" left-nav section, mirroring "COMPRESSED" above but for
  // RRSS-E (today's R1 up AND today's S1 down vs prev — levels widening
  // outward). No sub-patterns nested yet — selecting it in the Backtest
  // dropdown runs a symbol-list-only category scan (see runCategoryScan).
  {
    key: "expanded",
    label: "EXPANDED",
    subPatternKeys: [],
  },
  // NEW: "Overlap Above" category (base condition: r.overlapHigher, same
  // key passesPattern already uses for the "overlapping-higher" left-nav
  // page) — nests the "HiL4U3" Pattern, which in turn
  // nests the "eXHi-L4U4-U4" pattern.
  {
    key: "overlapping-higher",
    label: "Overlap Above",
    patterns: [
      {
        key: "HiL4U3",
        label: "HiL4U3",
        subPatternKeys: ["eXHi-L4U4-U4"],
      },
      // NEW: cOL3U3 Pattern, alongside HiL4U3 — nests
      // the bearish "cOL3U3-pL4" View (target: prev day's S4 / PL4).
      {
        key: "cOL3U3",
        label: "cOL3U3",
        subPatternKeys: ["cOL3U3-pL4"],
      },
      // NEW: cOL4U4 Pattern — nests the bullish
      // "7AM:MiMi-pU4:11PM" View (target: today's R4 / U4).
      {
        key: "cOL4U4",
        label: "cOL4U4",
        subPatternKeys: ["7AM:MiMi-pU4:11PM"],
      },
      // NEW: eXL4U4 Pattern (arrow), same shape as its
      // HiL4U3/cOL3U3/cOL4U4 siblings — base condition = Overlap Above's
      // r.overlapHigher condition AND the raw eXL4U4 flag (see
      // matchesPatternFlag in ScreenerUtils.tsx, which already has a
      // "eXL4U4" case). No target-graded pattern nested under it yet, so
      // it shows up as a symbol-list-only scan in the Backtest dropdown.
      {
        key: "eXL4U4",
        label: "eXL4U4",
        // NEW: now nests "6PM:LaLa->U4:2AM" (was previously an empty,
        // symbol-list-only scan).
        subPatternKeys: ["6PM:LaLa->U4:2AM"],
      },
    ],
  },
  // NEW: left-nav sections exposed in the Backtest dropdown as
  // symbol-list-only categories (no target grading). Each `key` matches an
  // existing passesPattern() case in ScreenerUtils.tsx, so runCategoryScan
  // works with no further changes.
  {
    key: "u1-gt-pu4",
    label: "ABOVE LEVEL4",
    // NEW: "eXL3U1" Pattern (arrow) — same shape as
    // cOU3L4/LoU3L3/eXL3TC/eXHiL2L1 elsewhere. Base condition = parent
    // u1-gt-pu4's condition AND the raw eXL3U1 flag (see
    // matchesPatternFlag in ScreenerUtils.tsx). Nests the existing
    // "9AM:APHS1A-FAU4:4AM" pattern, which used to sit directly on this
    // category's own subPatternKeys.
    patterns: [
      {
        key: "eXL3U1",
        label: "eXL3U1",
        // "9AM:APHS1A-FAU4:4AM" moved to the sibling "eXL3TC" Pattern.
        subPatternKeys: ["8AM:APHS1A-FAU4:4AM"],
      },
      // NEW: "eXL3TC" Pattern — shown above its own
      // sub-pattern ("TiMe-eXL3TC-AU4:2PM") in the Backtest dropdown, same
      // "Pattern" grouping style as cOL3U3 / eXU4L1 elsewhere. Base
      // condition = parent u1-gt-pu4's condition AND the raw eXL3TC flag
      // (see matchesPatternFlag in ScreenerUtils.tsx).
      {
        key: "eXL3TC",
        label: "eXL3TC",
        // "9AM:APHS1A-FAU4:4AM" now nests here (moved from "eXL3U1").
        subPatternKeys: ["TiMe-eXL3TC-AU4:2PM", "9AM:APHS1A-FAU4:4AM", "6AM:pX-APHS1A-pL4:4AM"],
      },
      {
        key: "eXHiL2L1",
        label: "eXHiL2L1",
        subPatternKeys: ["SMg-exHiL2L1-U4:3AM"],
      },
      // NEW: "eXL4U1" Pattern (arrow), same shape as its
      // eXL3U1/eXL3TC/eXHiL2L1 siblings above. Base condition = parent
      // u1-gt-pu4's condition AND the raw eXL4U1 flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). Nests the new
      // "6AM:MegMeg-L3:8PM" pattern.
      {
        key: "eXL4U1",
        label: "eXL4U1",
        subPatternKeys: ["6AM:MegMeg-L3:8PM"],
      },
      // NEW: "eXL2CP" Pattern (arrow), same shape as its
      // eXL3U1/eXL3TC/eXHiL2L1/eXL4U1 siblings above. Base condition =
      // parent u1-gt-pu4's condition AND the raw eXL2CP flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). No specific
      // target-graded sub-pattern nested under it yet — selecting it in
      // the Backtest dropdown runs a symbol-list-only category scan.
      {
        key: "eXL2CP",
        label: "eXL2CP",
        subPatternKeys: [],
      },
      // NEW: "eXLoL2L1" Pattern (arrow), same shape as its
      // eXHiL2L1 sibling above (both derive from the same
      // eXHiLoL2L1Bands base band check in cpr.ts, split on today's PDL
      // vs prev Pivot). Base condition = parent u1-gt-pu4's condition
      // AND the raw eXLoL2L1 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). No specific target-graded sub-pattern
      // nested under it yet — selecting it in the Backtest dropdown
      // runs a symbol-list-only category scan.
      {
        key: "eXLoL2L1",
        label: "eXLoL2L1",
        subPatternKeys: [],
      },
      // NEW: "eXL3BC" Pattern (arrow), same shape as its
      // eXL3U1/eXL3TC/eXHiL2L1/eXL4U1/eXL2CP/eXLoL2L1 siblings above.
      // Base condition = parent u1-gt-pu4's condition AND the raw
      // eXL3BC flag (see matchesPatternFlag in ScreenerUtils.tsx). No
      // specific target-graded sub-pattern nested under it yet —
      // selecting it in the Backtest dropdown runs a symbol-list-only
      // category scan.
      {
        key: "eXL3BC",
        label: "eXL3BC",
        subPatternKeys: [],
      },
      // NEW: "eXL2BC" Pattern (arrow), same shape as its eXL3BC sibling
      // directly above. Base condition = parent u1-gt-pu4's condition
      // AND the raw eXL2BC flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). No specific target-graded sub-pattern
      // nested under it yet — selecting it in the Backtest dropdown
      // runs a symbol-list-only category scan.
      {
        key: "eXL2BC",
        label: "eXL2BC",
        subPatternKeys: [],
      },
    ],
  },
  // NEW: "L1 < pL4" now nests the "eXU4L1" Pattern, which
  // in turn nests the bullish "ss-eXU4L1-U4:10PM" pattern.
  {
    key: "l1-lt-pl4",
    label: "L1 < pL4",
    patterns: [
      {
        key: "eXU4L1",
        label: "eXU4L1",
        subPatternKeys: ["ss-eXU4L1-U4:10PM"],
      },
    ],
  },
  // NEW: "CPR Inside" now nests the "cOL3U3" Pattern, same
  // shape as its "Overlap Above" sibling — base condition = this
  // category's inside-cpr condition AND the raw cOL3U3 flag (see
  // matchesPatternFlag in ScreenerUtils.tsx). Nests the bullish
  // "8AM:SRBHHLLA-pU4+1:8AM" View (target: prev day's R4 / PU4).
  {
    key: "inside-cpr",
    label: "Inside CPR",
    // NEW: "8AM:CoLApHA-U4+1:8AM" sits directly on this category's own
    // subPatternKeys (not inside a "Pattern" /arrow below) —
    // it's a Direct View in ViewsSidebar's left-nav (top-level, under but
    // not nested inside "Inside CPR"), so it isn't gated behind one of
    // the raw Pattern flags (cOL3U3/cOL4U4/eXL4U4) the way its
    // patterns siblings are.
    subPatternKeys: ["8AM:CoLApHA-U4+1:8AM"],
    patterns: [
      {
        key: "cOL3U3",
        label: "cOL3U3",
        subPatternKeys: ["8AM:SRBHHLLA-pU4+1:8AM"],
      },
      // NEW: cOL4U4 Pattern — base condition = the inside-cpr
      // condition AND the raw cOL4U4 flag. Nests the bullish
      // "2PM:pPDHLA-SRA-U4:7PM" View (target: today's R4 / U4).
      {
        key: "cOL4U4",
        label: "cOL4U4",
        subPatternKeys: ["2PM:pPDHLA-SRA-U4:7PM"],
      },
      // NEW: eXL4U4 Pattern — base condition = the inside-cpr
      // condition AND the raw eXL4U4 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx, which already has an "eXL4U4" case). Nests the
      // bullish "8AM:pPDHA-SRA-U4+2:2AM" View (target: today's R4 / U4).
      {
        key: "eXL4U4",
        label: "eXL4U4",
        subPatternKeys: ["8AM:pPDHA-SRA-U4+2:2AM"],
      },
    ],
  },
  { key: "outside-cpr", label: "Outside CPR" },
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
    // NEW: "LoU4L4" Pattern (arrow), same shape as its
    // "eXL4U4" counterpart under "overlapping-higher" — base condition =
    // Overlap Below's r.overlapLower condition AND the raw LoU4L4 flag
    // (see matchesPatternFlag in ScreenerUtils.tsx, which already has a
    // "LoU4L4" case). No target-graded pattern nested under it yet, so it
    // shows up as a symbol-list-only scan in the Backtest dropdown.
    patterns: [
      {
        key: "LoU4L4",
        label: "LoU4L4",
        subPatternKeys: [],
      },
      // NEW: "pRRHHLLA" Pattern (arrow), same shape as
      // "LoU4L4" above — base condition = Overlap Below's r.overlapLower
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
 * NEW: flat option list for the "Pivot Level / Pattern / View"
 * dropdown in the Backtest panel.
 *
 * The dropdown no longer renders bold, non-selectable group headings
 * ("LittleCPR Above", "Overlap Above", ...). Instead every group's own
 * "— all (symbol list only)" row IS the heading: the category name is
 * rendered bold and the "— all (symbol list only)" suffix normal-weight,
 * e.g. render each option as:
 *
 *   <span className="font-semibold">{opt.boldLabel}</span>
 *   <span className="font-normal opacity-70">{opt.suffix}</span>
 *
 * Sub-patterns follow their parent with depth = 1 (or 2 under a Pivot
 * Level) and no bold part.
 */
export type BacktestOptionKind = "category" | "pivotLevel" | "pattern";

export interface BacktestOption {
  value: string;              // "<categoryKey>" | "<categoryKey>::<pivotLevelKey>" | "<patternKey>"
  kind: BacktestOptionKind;
  boldLabel: string;          // bold part, e.g. "LittleCPR Above" ("" for patterns)
  suffix: string;             // normal-weight part, e.g. " — all (symbol list only)"
  plainLabel: string;         // boldLabel + suffix, for the collapsed/selected value
  depth: 0 | 1 | 2;           // indentation level
  categoryKey: string;
  pivotLevelKey?: string;
  patternKey?: string;
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

    for (const key of cat.subPatternKeys ?? []) {
      opts.push({
        value: key,
        kind: "pattern",
        boldLabel: "",
        suffix: patternLabel(key),
        plainLabel: patternLabel(key),
        depth: 1,
        categoryKey: cat.key,
        patternKey: key,
        symbolListOnly: false,
      });
    }

    for (const sub of cat.patterns ?? []) {
      // CHANGED: Pattern-level selections are no longer symbol-list-only —
      // they now grade against today's R4 / U4 (bullish) — but the label
      // itself stays plain (no "-R4" suffix); the target is still shown
      // separately wherever Result/Hit Date/pass-fail is displayed.
      opts.push({
        value: `${cat.key}::${sub.key}`,
        kind: "pivotLevel",
        boldLabel: sub.label,
        suffix: "",
        plainLabel: sub.label,
        depth: 1,
        categoryKey: cat.key,
        pivotLevelKey: sub.key,
        symbolListOnly: false,
      });
      for (const key of sub.subPatternKeys) {
        opts.push({
          value: key,
          kind: "pattern",
          boldLabel: "",
          suffix: patternLabel(key),
          plainLabel: patternLabel(key),
          depth: 2,
          categoryKey: cat.key,
          pivotLevelKey: sub.key,
          patternKey: key,
          symbolListOnly: false,
        });
      }
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
 * "Overlap Above" → "HiL4U3") — same shape, same reasoning: a Pattern
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
 * (e.g. "overlapping-higher") AND the named Pattern's raw flag (e.g.
 * "HiL4U3", via matchesPatternFn — see matchesPatternFlag in
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

  const targetLevel = result.todayCPR.r4;
  const targetLabel = "U4 (today's R4)";
  const entryDayCandle = window.get(entryDateISO) ?? null;
  const nextDayCandle = window.get(dPlus1) ?? null;

  // Same non-finite-target guard as backtestSymbolOnDate — see its
  // comment for why this is "invalid-target" rather than a silent "fail".
  if (!Number.isFinite(targetLevel)) {
    console.warn(
      `[backtest] ${symbol} on ${entryDateISO}: Pattern "${pivotLevelKey}-R4" matched but its R4 ` +
        `target came back non-finite (${targetLevel}) — marking invalid-target.`
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
      result: "invalid-target",
      hitDate: null,
      daysToHit: null,
      ...closeAndChange(window, entryDateISO),
      raw: result,
    };
  }

  const hits = (c: OHLC | null) => !!c && c.high >= targetLevel; // bullish only — R4/U4 target

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
  }

  return rows;
}

/**
 * NEW: Pattern backtest counterpart of runCategoryScan — same
 * symbol-universe caveat applies (see KNOWN LIMITATION above). Runs
 * pivotLevelBacktestSymbolOnDate across the full universe and returns a
 * graded BacktestRow list (Target/Result/Hit Date, target = today's R4 /
 * U4, bullish) for a category's Pattern sub-bucket (e.g. "Overlap Above"
 * → "HiL4U3-R4"), same shape as runBacktest's output.
 */
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
  }

  return rows;
}
