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
 * NEW: "1LHr-L4U3-U4" and "sT-cOL2U3-APU4" (displayed as "cOL2U3-ApU4") —
 * these are the two specific sub-patterns nested under the "LittleCPR
 * Above" category (see BACKTEST_CATEGORIES below). Both are bullish,
 * both target U4-style levels:
 *   - "1LHr-L4U3-U4" has no distinct target called out in Screener.tsx's
 *     legend, so it inherits the same target as its parent category
 *     (today's own R4 / U4) — matching the base "littleabove" entry above.
 *   - "sT-cOL2U3-APU4" ("cOL2U3-ApU4" in the UI) explicitly targets "Bullish
 *     Above PU4" per its legend card, i.e. prev day's R4.
 *
 * NEW: "eXHi-L4U4-U4" — nested under the "Overlap Above" category's
 * "HiL4U3" Pattern sub-category (see BACKTEST_CATEGORIES below).
 * Bullish, per Screener.tsx's legend card ("Overlap Higher continuation —
 * bullish bias toward U4") the target is today's own R4 / U4, same target
 * style as "littleabove".
 */
export interface BacktestTargetDef {
  key: string;          // matches passesPattern's pattern-key string exactly
  label: string;        // display name
  direction: "bullish" | "bearish";
  getTarget: (r: CPRResult) => number;
  targetLabel: string;  // e.g. "U4 (today's R4)"
}

export const BACKTEST_TARGETS: BacktestTargetDef[] = [
  {
    key: "littleabove",
    label: "LittleCPR Above",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  {
    key: "9AM:MegL-U4+1:3PM",
    label: "9AM:MegL-U4+1:3PM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "7PM:MoMi->U4:2AM" — nested under "CPR 1ABOVE" → Pattern "eXL4U2",
  // alongside its sibling "9AM:MegL-U4+1:3PM". Bullish, targets today's own
  // R4 / U4 by ~2AM.
  {
    key: "7PM:MoMi->U4:2AM",
    label: "7PM:MoMi->U4:2AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "7PM:MoMi-<L4:2AM" — bearish sibling of "7PM:MoMi->U4:2AM", same
  // nesting ("CPR 1ABOVE" → Pattern "eXL4U2") and same base condition
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
  // REMOVED: "HA-U1>PU4" — its condition (cprRising && strWideCPR &&
  // todayCPR.r1 > prevCPR.r4) is identical to the "U1 > pU4" (u1-gt-pu4)
  // parent category's own base condition, so it was just a duplicate
  // "dot" in the Backtest dropdown. Use the "U1 > pU4" category's own
  // symbol-list scan instead.
  // NEW: nested under the "U1 > pU4" category. Bullish, same PU4 target
  // style as the (now-removed) HA-U1>PU4 (matches PatternSidebar's
  // u1-gt-pu4 sub-pattern).
  {
    key: "9AM:APHS1A-FAU4:4AM",
    label: "9AM:APHS1A-FAU4:4AM",
    direction: "bullish",
    targetLabel: "FAU4 (Far Above today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "6AM:pX-APHS1A-pL4:4AM" — nested under the "U1 > pU4" (u1-gt-pu4)
  // category's "eXL3TC" Pattern sub-category, alongside
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
  // category's "eXL3U1" Pattern sub-category, alongside its
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
  // NEW: the two "LittleCPR Above" sub-patterns
  {
    key: "1LHr-L4U3-U4",
    label: "1LHr-L4U3-U4",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  {
    key: "sT-cOL2U3-APU4",
    label: "cOL2U3-ApU4",
    direction: "bullish",
    targetLabel: "PU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
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
  // "eXL4U4" (previously an empty symbol-list-only sub-category, see
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
  // NEW: "SMi-L1pU1>-APU4:11PM" — nested under the new "L1pU1 Above"
  // category (moved out of CPR Inside). Bullish, targets "Above PU4",
  // i.e. prev day's R4.
  {
    key: "SMi-L1pU1>-APU4:11PM",
    label: "SMi-L1pU1>-APU4:11PM",
    direction: "bullish",
    targetLabel: "PU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
  },
  // NEW: "S0-L1pU1>-AU4:7PM" — second sub-pattern under "L1pU1 Above".
  // Same L1pU1Above base condition as SMi-L1pU1>-APU4:11PM, but the
  // 1-Line CPR variant (compressionRatio == 0, today's R1 < prev TC).
  // Bullish, targets AU4 (prev day's R4) by ~7PM.
  {
    key: "S0-L1pU1>-AU4:7PM",
    label: "S0-L1pU1>-AU4:7PM",
    direction: "bullish",
    targetLabel: "AU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
  },
  // NEW: "T0-L1pU1>-BPL4:5AM" — third sub-pattern under "L1pU1 Above".
  // Bearish counterpart to SMi-L1pU1>-APU4:11PM: same L1pU1Above base
  // condition (today & prev PDH/L above, not Outside CPR), but targets a
  // move BELOW prev day's S4 (PL4) by ~5AM instead of above PU4.
  {
    key: "T0-L1pU1>-BPL4:5AM",
    label: "T0-L1pU1>-BPL4:5AM",
    direction: "bearish",
    targetLabel: "PL4 (prev day's S4)",
    getTarget: (r) => r.prevCPR.s4,
  },
  // NEW: "ss-eXU4L1-U4:10PM" — nested under the "L1 < pL4" category's
  // "eXU4L1" Pattern sub-category. Bullish, targets U4 (today's R4)
  // by ~10PM.
  {
    key: "ss-eXU4L1-U4:10PM",
    label: "ss-eXU4L1-U4:10PM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "BC>pPDL-U3:5AM" — nested under "PREVCPR 1ABOVE" (pcpr-u1-cpr-pl1)
  // category's new "cOU3L4" Pattern sub-category (see BACKTEST_CATEGORIES
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
  // NEW: "PDH>pTC-U4:5AM" — nested directly under "PREVCPR 1ABOVE" (pcpr-u1-cpr-pl1)
  // category, alongside the "cOU3L4" Pattern sub-category. Base condition:
  // this category's pCPR1Above condition AND today's PDH (todayCPR.prevHigh)
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
  // NEW: "11AM:pCPR1AHi-FApU4:1PM" — nested under "PREVCPR 1ABOVE"
  // (pcpr-u1-cpr-pl1) category's new "LoU3L4" Pattern sub-category (see
  // BACKTEST_CATEGORIES below), alongside its "cOU3L4"/"LoU3L3" siblings.
  // Base condition: this category's pCPR1Above condition AND the raw
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
  // "eXHiL2L1" Pattern sub-category. Bullish, targets U4 (today's R4) @ 3AM.
  {
    key: "SMg-exHiL2L1-U4:3AM",
    label: "SMg-exHiL2L1-U4:3AM",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
  },
  // NEW: "6AM:MegMeg-L3:8PM" — nested under "U1 > pU4" (u1-gt-pu4) via
  // the new "eXL4U1" Pattern sub-category. Base u1-gt-pu4 condition +
  // raw eXL4U1 flag + prev/today CPR both width category Mega
  // (5.00%-10.00%). Bearish, targets L3 (today's S3) by ~8PM.
  {
    key: "6AM:MegMeg-L3:8PM",
    label: "6AM:MegMeg-L3:8PM",
    direction: "bearish",
    targetLabel: "L3 (today's S3)",
    getTarget: (r) => r.todayCPR.s3,
  },
  // NEW: "TiMi-cOL2U2-pL4:5AM" — nested under "BigCPR Above"
  // (structure-bigabove) via the new "cOL2U2" Pattern sub-category. Base
  // structure-bigabove condition + raw cOL2U2 flag + today's PDH below
  // today's R1 + pTiny/Mini width combo + prev day's own pattern (prevCPR
  // vs ppCPR) being cOL4U4 (the "p-cOL4U4" badge). Bearish, targets PL4
  // (prev day's S4) by ~5AM.
  {
    key: "TiMi-cOL2U2-pL4:5AM",
    label: "TiMi-cOL2U2-pL4:5AM",
    direction: "bearish",
    targetLabel: "PL4 (prev day's S4)",
    getTarget: (r) => r.prevCPR.s4,
  },
  // NEW: "8AM:pSR-PDHL-pU4+1:8AM" — nested under "CPR Inside" (inside-cpr)
  // via the new "cOL3U3" Pattern sub-category (see BACKTEST_CATEGORIES
  // below). Base inside-cpr condition + raw cOL3U3 flag + pLarge/Medium
  // width combo + p-PDL<L1 + PDH>U1 + prev R1>today R1 + prev S1>today S1
  // + today's PDH/PDL above prev day's PDH/PDL. Bullish, targets pU4
  // (prev day's R4), entry ~8AM, by ~8AM the next day.
  {
    key: "8AM:pSR-PDHL-pU4+1:8AM",
    label: "8AM:pSR-PDHL-pU4+1:8AM",
    direction: "bullish",
    targetLabel: "PU4 (prev day's R4)",
    getTarget: (r) => r.prevCPR.r4,
  },
  // NEW: "2PM:pPDHLA-SRA-U4:7PM" — nested under "CPR Inside" (inside-cpr)
  // via the new "cOL4U4" Pattern sub-category (see BACKTEST_CATEGORIES
  // below). Base inside-cpr condition + raw cOL4U4 flag + pLarge/Large
  // width combo + p-PDH>U1 + PDL<L1 + today R1>prev R1 + today S1>prev S1
  // + prev day's PDH/PDL above today's PDH/PDL. Bullish, entry ~2PM,
  // targets U4 (today's R4) by ~7PM.
  // NEW: "8AM:pPDHA-SRA-U4+2:2AM" — nested under "CPR Inside" (inside-cpr)
  // via the new "eXL4U4" Pattern sub-category (see BACKTEST_CATEGORIES
  // below). Base inside-cpr condition + raw eXL4U4 flag + today's SRAbove
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
];

/**
 * NEW: Category groupings — a "category" is a broad, non-specific base
 * condition (e.g. "littleabove" = cprRising && narrowCPR) that itself has
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
 * NEW: subCategories — a category can additionally nest one or more
 * "Pattern" sub-categories (e.g. "Overlap Above" → Pattern
 * "HiL4U3"). A Pattern sub-category is itself just another
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
  key: string;                          // matches passesPattern's BASE category key (e.g. "littleabove")
  label: string;                        // display name, e.g. "LittleCPR Above"
  subPatternKeys?: string[];            // BACKTEST_TARGETS keys nested directly under this category
  subCategories?: BacktestSubCategoryDef[]; // NEW: Pattern sub-categories nested under this category
}

export const BACKTEST_CATEGORIES: BacktestCategoryDef[] = [
  {
    key: "cpr-1-above",
    label: "CPR 1ABOVE",
    // NEW: "eXL4U2" Pattern sub-category (arrow) — same shape as
    // cOU3L4/LoU3L3/HiL4U3 elsewhere. Base condition = parent
    // cpr-1-above's condition AND the raw eXL4U2 flag (see
    // matchesPatternFlag in ScreenerUtils.tsx). Nests the existing
    // "9AM:MegL-U4+1:3PM" pattern, which used to sit directly on this
    // category's own subPatternKeys.
    subCategories: [
      {
        key: "eXL4U2",
        label: "eXL4U2",
        subPatternKeys: ["9AM:MegL-U4+1:3PM", "7PM:MoMi->U4:2AM", "7PM:MoMi-<L4:2AM"],
      },
    ],
  },
  // NEW: "PREVCPR 1ABOVE" (displayed as "PCPR 1ABOVE" in PatternSidebar's
  // left-nav) left-nav section (top of the pattern tree in
  // PatternSidebar.tsx) — nests the "cOU3L4" Pattern sub-category, which
  // in turn nests "BC>pPDL-U3:5AM" (base condition: this category's
  // pCPR1Above condition AND the raw cOU3L4 flag — see
  // matchesPatternFlag in ScreenerUtils.tsx).
  {
    key: "pcpr-u1-cpr-pl1",
    label: "PREVCPR 1ABOVE",
    // NEW: "PDH>pTC-U4:5AM" now nests under the "LoU3L3" Pattern
    // sub-category below (not directly on the category), since it also
    // requires the raw LoU3L3 flag — see ScreenerUtils.tsx.
    subCategories: [
      {
        key: "cOU3L4",
        label: "cOU3L4",
        subPatternKeys: ["BC>pPDL-U3:5AM"],
      },
      // NEW: "LoU3L3" — Pattern sub-category (arrow), same shape as
      // "cOU3L4": base condition = this category's pCPR1Above condition
      // AND the raw LoU3L3 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). Nests "PDH>pTC-U4:5AM".
      {
        key: "LoU3L3",
        label: "LoU3L3",
        subPatternKeys: ["PDH>pTC-U4:5AM"],
      },
      // NEW: "LoU3L4" — Pattern sub-category (arrow), same shape as its
      // "LoU3L3" sibling: base condition = this category's pCPR1Above
      // condition AND the raw LoU3L4 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx). Nests "11AM:pCPR1AHi-FApU4:1PM".
      {
        key: "LoU3L4",
        label: "LoU3L4",
        subPatternKeys: ["11AM:pCPR1AHi-FApU4:1PM"],
      },
    ],
  },
  // NEW: "L1pU1 Above" left-nav section (first item), nesting the
  // "SMi-L1pU1>-APU4:11PM" pattern that used to live under CPR Inside.
  {
    key: "l1pu1-above",
    label: "L1pU1 Above",
    subPatternKeys: ["SMi-L1pU1>-APU4:11PM", "S0-L1pU1>-AU4:7PM", "T0-L1pU1>-BPL4:5AM"],
  },
  {
    key: "littleabove",
    label: "LittleCPR Above",
    subPatternKeys: ["1LHr-L4U3-U4", "sT-cOL2U3-APU4"],
  },
  // NEW: "Overlap Above" category (base condition: r.overlapHigher, same
  // key passesPattern already uses for the "overlapping-higher" left-nav
  // page) — nests the "HiL4U3" Pattern sub-category, which in turn
  // nests the "eXHi-L4U4-U4" pattern.
  {
    key: "overlapping-higher",
    label: "Overlap Above",
    subCategories: [
      {
        key: "HiL4U3",
        label: "HiL4U3",
        subPatternKeys: ["eXHi-L4U4-U4"],
      },
      // NEW: cOL3U3 Pattern sub-category, alongside HiL4U3 — nests
      // the bearish "cOL3U3-pL4" pattern (target: prev day's S4 / PL4).
      {
        key: "cOL3U3",
        label: "cOL3U3",
        subPatternKeys: ["cOL3U3-pL4"],
      },
      // NEW: cOL4U4 Pattern sub-category — nests the bullish
      // "7AM:MiMi-pU4:11PM" pattern (target: today's R4 / U4).
      {
        key: "cOL4U4",
        label: "cOL4U4",
        subPatternKeys: ["7AM:MiMi-pU4:11PM"],
      },
      // NEW: eXL4U4 Pattern sub-category (arrow), same shape as its
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
  { key: "littlebelow", label: "LittleCPR Below" },
  // NEW: "cOL2U2" Pattern sub-category (arrow), same shape as cOU3L4/
  // LoU3L3/HiL4U3/cOL3U3/eXL3U1/eXL3TC/eXHiL2L1/eXU4L1 elsewhere. Base
  // condition = parent structure-bigabove's condition AND the raw cOL2U2
  // flag (see matchesPatternFlag in ScreenerUtils.tsx). Nests the new
  // "TiMi-cOL2U2-pL4:5AM" pattern.
  {
    key: "structure-bigabove",
    label: "BigCPR Above",
    subCategories: [
      {
        key: "cOL2U2",
        label: "cOL2U2",
        subPatternKeys: ["TiMi-cOL2U2-pL4:5AM"],
      },
    ],
  },
  {
    key: "u1-gt-pu4",
    label: "U1 > pU4",
    // NEW: "eXL3U1" Pattern sub-category (arrow) — same shape as
    // cOU3L4/LoU3L3/eXL3TC/eXHiL2L1 elsewhere. Base condition = parent
    // u1-gt-pu4's condition AND the raw eXL3U1 flag (see
    // matchesPatternFlag in ScreenerUtils.tsx). Nests the existing
    // "9AM:APHS1A-FAU4:4AM" pattern, which used to sit directly on this
    // category's own subPatternKeys.
    subCategories: [
      {
        key: "eXL3U1",
        label: "eXL3U1",
        // "9AM:APHS1A-FAU4:4AM" moved to the sibling "eXL3TC" sub-category.
        subPatternKeys: ["8AM:APHS1A-FAU4:4AM"],
      },
      // NEW: "eXL3TC" Pattern sub-category — shown above its own
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
      // NEW: "eXL4U1" Pattern sub-category (arrow), same shape as its
      // eXL3U1/eXL3TC/eXHiL2L1 siblings above. Base condition = parent
      // u1-gt-pu4's condition AND the raw eXL4U1 flag (see
      // matchesPatternFlag in ScreenerUtils.tsx). Nests the new
      // "6AM:MegMeg-L3:8PM" pattern.
      {
        key: "eXL4U1",
        label: "eXL4U1",
        subPatternKeys: ["6AM:MegMeg-L3:8PM"],
      },
    ],
  },
  { key: "structure-bigbelow", label: "BigCPR Below" },
  // NEW: "L1 < pL4" now nests the "eXU4L1" Pattern sub-category, which
  // in turn nests the bullish "ss-eXU4L1-U4:10PM" pattern.
  {
    key: "l1-lt-pl4",
    label: "L1 < pL4",
    subCategories: [
      {
        key: "eXU4L1",
        label: "eXU4L1",
        subPatternKeys: ["ss-eXU4L1-U4:10PM"],
      },
    ],
  },
  // NEW: "CPR Inside" now nests the "cOL3U3" Pattern sub-category, same
  // shape as its "Overlap Above" sibling — base condition = this
  // category's inside-cpr condition AND the raw cOL3U3 flag (see
  // matchesPatternFlag in ScreenerUtils.tsx). Nests the bullish
  // "8AM:pSR-PDHL-pU4+1:8AM" pattern (target: prev day's R4 / PU4).
  {
    key: "inside-cpr",
    label: "CPR Inside",
    subCategories: [
      {
        key: "cOL3U3",
        label: "cOL3U3",
        subPatternKeys: ["8AM:pSR-PDHL-pU4+1:8AM"],
      },
      // NEW: cOL4U4 Pattern sub-category — base condition = the inside-cpr
      // condition AND the raw cOL4U4 flag. Nests the bullish
      // "2PM:pPDHLA-SRA-U4:7PM" pattern (target: today's R4 / U4).
      {
        key: "cOL4U4",
        label: "cOL4U4",
        subPatternKeys: ["2PM:pPDHLA-SRA-U4:7PM"],
      },
      // NEW: eXL4U4 Pattern sub-category — base condition = the inside-cpr
      // condition AND the raw eXL4U4 flag (see matchesPatternFlag in
      // ScreenerUtils.tsx, which already has an "eXL4U4" case). Nests the
      // bullish "8AM:pPDHA-SRA-U4+2:2AM" pattern (target: today's R4 / U4).
      {
        key: "eXL4U4",
        label: "eXL4U4",
        subPatternKeys: ["8AM:pPDHA-SRA-U4+2:2AM"],
      },
    ],
  },
  { key: "outside-cpr", label: "CPR Outside" },
  { key: "overlapping-lower", label: "Overlap Below" },
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

    for (const sub of cat.subCategories ?? []) {
      opts.push({
        value: `${cat.key}::${sub.key}`,
        kind: "pivotLevel",
        boldLabel: sub.label,
        suffix: SYMBOL_LIST_ONLY_SUFFIX,
        plainLabel: sub.label + SYMBOL_LIST_ONLY_SUFFIX,
        depth: 1,
        categoryKey: cat.key,
        pivotLevelKey: sub.key,
        symbolListOnly: true,
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
  result: "pass" | "fail" | "insufficient-data";
  hitDate: string | null;          // which day (entryDate, entryDate+1, or entryDate+2) hit target, if any
  daysToHit: 0 | 1 | 2 | null;
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
 * Also reused, unchanged, for Pattern sub-category scans (e.g.
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
const HISTORY_LIMIT = 1500;

/** symbol -> full daily-candle history, keyed by UTC date string. */
const binanceHistoryCache = new Map<string, Map<string, OHLC> | null>();
const deltaHistoryCache = new Map<string, Map<string, OHLC> | null>();
/** In-flight de-dupe so parallel dates/symbols never double-fetch. */
const inFlight = new Map<string, Promise<Map<string, OHLC> | null>>();

/** True when a symbol's history is already in memory (no network needed). */
export function hasCachedHistory(symbol: string, source: BacktestSource): boolean {
  const cache = source === "binance" ? binanceHistoryCache : deltaHistoryCache;
  return cache.has(symbol);
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
 * 429/418. It now delegates to binance.ts's `fetchDailyKlines`, so venue
 * resolution (futures-first, spot fallback) and rate-limit backoff are shared
 * with the live screener and can never drift apart again.
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
 * Cached accessor — one network call per symbol per session, shared by every
 * date in a sweep. Replaces the old fetchBinanceWindow/fetchDeltaWindow.
 */
async function getHistory(symbol: string, source: BacktestSource): Promise<Map<string, OHLC> | null> {
  const cache = source === "binance" ? binanceHistoryCache : deltaHistoryCache;
  const cached = cache.get(symbol);
  if (cached !== undefined) return cached;

  const key = `${source}:${symbol}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const p = (source === "binance" ? fetchBinanceHistory(symbol) : fetchDeltaHistory(symbol))
    .then((hist) => {
      cache.set(symbol, hist);
      inFlight.delete(key);
      return hist;
    })
    .catch(() => {
      cache.set(symbol, null);
      inFlight.delete(key);
      return null;
    });
  inFlight.set(key, p);
  return p;
}

/**
 * Single source of truth for the Backtest's tradable symbol universe.
 *
 * Delegates entirely to binance.ts's fetchTopUSDTSymbols() (Binance) / the
 * delta.ts equivalent (Delta) — no separate filtering, sorting, or capping
 * logic lives here. This mirrors the Live Scanner's universe exactly
 * ("No limit: scan the full tradable USDT universe" per binance.ts's
 * runScreener), and is called once by runBacktest, runCategoryScan, and
 * runPivotLevelScan instead of each duplicating this same lookup.
 */
async function getSymbolUniverse(source: BacktestSource): Promise<string[]> {
  return source === "binance"
    ? (await fetchTopUSDTSymbols()).map((t) => t.symbol)
    : (await fetchDeltaPerps()).map((t) => t.symbol);
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
  concurrency = 25
): Promise<void> {
  const pending = symbols.filter((s) => !hasCachedHistory(s, source));
  let done = symbols.length - pending.length;
  for (let i = 0; i < pending.length; i += concurrency) {
    const chunk = pending.slice(i, i + concurrency);
    await Promise.all(chunk.map((s) => getHistory(s, source)));
    done += chunk.length;
    onProgress?.(done, symbols.length, chunk[chunk.length - 1]);
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
  const dMinus3 = addDaysISO(entryDateISO, -3);
  const dMinus2 = addDaysISO(entryDateISO, -2);
  const dMinus1 = addDaysISO(entryDateISO, -1);

  const window = await getHistory(symbol, source);
  if (!window) return null;

  const ppCandle = window.get(dMinus3) ?? null;
  const prevCandle = window.get(dMinus2);
  const todayCandle = window.get(dMinus1);
  if (!prevCandle || !todayCandle) return null; // not enough history to reconstruct the CPR

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
 *      day, D+1, or D+2 — using each day's high (bullish) or low (bearish).
 *      A hit on any of these three days counts as a pass.
 *
 * Returns null when there isn't enough candle history to evaluate at all
 * (e.g. symbol didn't exist yet, or D is too recent for D+1/D+2 data to
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
  const dPlus2 = addDaysISO(entryDateISO, 2);

  const reconstructed = await reconstructCPRForDate(symbol, source, entryDateISO);
  if (!reconstructed) return null;
  const { result, window } = reconstructed;

  if (!passesPatternFn(result, target.key)) return null; // didn't match the pattern on this date

  const targetLevel = target.getTarget(result);
  const entryDayCandle = window.get(entryDateISO) ?? null;
  const nextDayCandle = window.get(dPlus1) ?? null;
  const nextNextDayCandle = window.get(dPlus2) ?? null;

  const hits = (c: OHLC | null) =>
    !!c && (target.direction === "bullish" ? c.high >= targetLevel : c.low <= targetLevel);

  let hitDate: string | null = null;
  let daysToHit: 0 | 1 | 2 | null = null;
  if (hits(entryDayCandle)) {
    hitDate = entryDateISO;
    daysToHit = 0;
  } else if (hits(nextDayCandle)) {
    hitDate = dPlus1;
    daysToHit = 1;
  } else if (hits(nextNextDayCandle)) {
    hitDate = dPlus2;
    daysToHit = 2;
  }

  const outcome: BacktestRow["result"] =
    entryDayCandle || nextDayCandle || nextNextDayCandle ? (hitDate ? "pass" : "fail") : "insufficient-data";

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
 * "littleabove") instead of a specific pattern's, and returns a
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
 * NEW: Pattern sub-category scan version of backtestSymbolOnDate —
 * same CPR reconstruction, but checks BOTH the parent CATEGORY's base
 * condition (e.g. "overlapping-higher") AND the named Pattern's raw
 * flag (e.g. "HiL4U3", via matchesPatternFn — see matchesPatternFlag
 * in ScreenerUtils.tsx). Returns a CategoryScanRow, same shape/reasoning as
 * categoryScanSymbolOnDate: a Pattern bucket within a category still
 * has no single target to grade against.
 */
export async function pivotLevelScanSymbolOnDate(
  symbol: string,
  source: BacktestSource,
  entryDateISO: string,
  categoryKey: string,
  pivotLevelKey: string,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  matchesPatternFn: (r: CPRResult, label: string) => boolean
): Promise<CategoryScanRow | null> {
  const reconstructed = await reconstructCPRForDate(symbol, source, entryDateISO);
  if (!reconstructed) return null;
  const { result, window } = reconstructed;

  if (!passesPatternFn(result, categoryKey)) return null; // didn't match the parent category's base condition
  if (!matchesPatternFn(result, pivotLevelKey)) return null; // didn't match this Pattern's raw flag

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
 * Runs the full symbol universe through backtestSymbolOnDate.
 *
 * KNOWN LIMITATION: the "universe" of symbols is fetched from the CURRENT
 * top-500-by-volume (Binance) / current perpetuals list (Delta) — not a
 * point-in-time snapshot of what was actively traded/liquid on entryDate.
 * A coin that's since been delisted, or one that's only recently become
 * liquid, won't be included even if it would have matched the pattern
 * historically. Fine for the v1 prove-out; flag if you need a true
 * point-in-time universe later (would need a separate historical-listings
 * source, which neither exchange's public API straightforwardly provides).
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
  const symbols: string[] = await getSymbolUniverse(source);

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
  const symbols: string[] = await getSymbolUniverse(source);

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
 * NEW: Pattern sub-category scan counterpart of runCategoryScan — same
 * symbol-universe caveat applies (see KNOWN LIMITATION above). Runs
 * pivotLevelScanSymbolOnDate across the full universe and returns the same
 * simplified CategoryScanRow list (symbol list + CPR data only, no
 * target/result/hitDate) for a category's Pattern sub-bucket (e.g.
 * "Overlap Above" → "HiL4U3").
 */
export async function runPivotLevelScan(
  categoryKey: string,
  pivotLevelKey: string,
  entryDateISO: string,
  source: BacktestSource,
  passesPatternFn: (r: CPRResult, pattern: string) => boolean,
  matchesPatternFn: (r: CPRResult, label: string) => boolean,
  onProgress?: (done: number, total: number, symbol: string) => void
): Promise<CategoryScanRow[]> {
  // Single source of truth — see getSymbolUniverse above. No per-call
  // duplication of the fetch/filter/sort logic.
  const symbols: string[] = await getSymbolUniverse(source);

  const rows: CategoryScanRow[] = [];
  await prefetchHistories(symbols, source, onProgress);

  const batchSize = 50;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((sym) =>
        pivotLevelScanSymbolOnDate(sym, source, entryDateISO, categoryKey, pivotLevelKey, passesPatternFn, matchesPatternFn)
      )
    );
    batchResults.forEach((r) => {
      if (r) rows.push(r);
    });
    onProgress?.(Math.min(i + batchSize, symbols.length), symbols.length, batch[batch.length - 1]);
  }

  return rows;
}
