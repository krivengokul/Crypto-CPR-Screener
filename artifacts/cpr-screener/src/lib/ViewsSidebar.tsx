import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  LayersIcon,
  Crosshair,
  BarChart,
  Equal,
  ChevronLeft,
  ChevronRight,
  X,
  FlaskConical,
  Zap,
  Activity,
  BookmarkCheck,
} from "lucide-react";

export interface Category {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ElementType;
}

export interface SubPattern {
  id: string;
  label: string;
  /** Optional per-sub-item highlight border color (CSS color). Defaults to ACTIVE_BLUE. */
  activeColor?: string;
  /** Optional per-sub-item highlight text color (CSS color). Defaults to ACTIVE_TEXT. */
  activeText?: string;
  /** Optional per-sub-item highlight background (CSS color). Defaults to blue-tinted. */
  activeBg?: string;
}

/**
 * Sub-patterns for each parent pattern.
 * Each `id` maps to a passesPattern() case in ScreenerUtils.tsx so the
 * existing Screener filtering logic works with no changes.
 */
export const Views: Record<string, SubPattern[]> = {
  "overlapping-lower": [
    { id: "eXLo-L4U4-U4",            label: "Exp-U3>pU4" },
    { id: "9AM:SSRRBHHLLA-U4:9PM",   label: "9AM:SSRRBHHLLA-U4:9PM" },
    // NEW: 9AM:pRRHHLLA-U4:9PM — Overlap Below + HHRRBelow (today's R1 AND
    // today's PDH both below the lower of prev's R1/PDH) + HHLLAbove
    // (today's PDH above prev's PDH AND today's PDL >= prev's PDL).
    // Bullish, entry ~9AM, targets today's own U4 by ~9PM. Green color
    // family, sibling of 9AM:SSRRBHHLLA-U4:9PM.
    {
      id: "9AM:pRRHHLLA-U4:9PM",
      label: "9AM:pRRHHLLA-U4:9PM",
      activeColor: "#22c55e",      // green-500 border
      activeText:  "#4ade80",      // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    { id: "OBN-L4U4-U4",           label: "OBN-L4U4-U4" },
    { id: "OBW-L4U4-L4",           label: "OBW-L4U4-L4" },
    // NEW: 2PM:SSLLpRRHHA-ApU4:5PM — Overlap Below + SSLLAbove (today's S1
    // AND today's PDL both above the higher of prev's S1/PDL) + HHRRBelow
    // (today's R1 AND today's PDH both below the lower of prev's R1/PDH)
    // + (prev day's R1 above today's R2 OR today's S3 above prev day's S2).
    // Bullish, entry ~2PM, targets ApU4 (prev day's R4) by ~5PM. Green
    // color family to flag it as bullish, matching the other ApU4/AU4
    // bullish siblings elsewhere (e.g. 6A:HLC-SSLL:R4-6P).
    {
      id: "2PM:SSLLpRRHHA-ApU4:5PM",
      label: "2PM:SSLLpRRHHA-ApU4:5PM",
      activeColor: "#22c55e",      // green-500 border
      activeText:  "#4ade80",      // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 8AM:SSLLpRRHHA-L4:1PM — bearish sibling of 2PM:SSLLpRRHHA-ApU4:5PM,
    // same overlapLower + SSLLAbove + HHRRBelow base, but with the
    // comparison direction reversed (prev day's R1 below today's R2 OR
    // today's S3 below prev day's S2). Bearish, entry ~8AM, targets today's
    // own L4/S4 by ~1PM. Red color family to flag it as the bearish sibling.
    {
      id: "8AM:SSLLpRRHHA-L4:1PM",
      label: "8AM:SSLLpRRHHA-L4:1PM",
      activeColor: "#ef4444",      // red-500 border
      activeText:  "#f87171",      // red-400 text
      activeBg:    "rgba(239, 68, 68, 0.14)",
    },
  ],
  "levelsabove": [
    {
      id: "A-A-AA-AA-EU3L4-GapB",
      label: "A-A-AA-AA-EU3L4-GapB",
      activeColor: "#22c55e",
      activeText: "#4ade80",
      activeBg: "rgba(34, 197, 94, 0.14)",
    },
    {
      id: "A-A-AA-AA-S1pPDH-U3",
      label: "A-A-AA-AA · S1>pPDH(U3)",
      activeColor: "#22c55e",
      activeText: "#4ade80",
      activeBg: "rgba(34, 197, 94, 0.14)",
    },
    {
      id: "A-A-AA-AA-EU2L4-ApR2",
      label: "A-A-AA-AA-EU2L4-ApR2",
      activeColor: "#22c55e",
      activeText: "#4ade80",
      activeBg: "rgba(34, 197, 94, 0.14)",
    },
    {
      id: "A-A-AA-AA-U3L4-pGapB",
      label: "A-A-AA-AA-U3L4-pGapB",
      activeColor: "#fb7185",
      activeText: "#fda4af",
      activeBg: "rgba(244, 63, 94, 0.14)",
    },
    // RENAMED from "9AM:MegL-U4+1:3PM": all existing conditions removed.
    // NEW: 7PM:MoMi->U4:2AM — LEVEL ABOVE + prev day's own pivot sub-label
    // p-CU1L1 + today's Pattern EU2L4 + prev CPR pMicro + today CPR Mini
    // + both prev and today PDL below their respective L1s. Cyan color
    // family to visually distinguish it from its A-A-AA-AA-EU3L4-GapB sibling.
    {
      id: "7PM:MoMi->U4:2AM",
      label: "7PM:MoMi->U4:2AM",
      activeColor: "#22d3ee",      // cyan-400 border
      activeText:  "#67e8f9",      // cyan-300 text
      activeBg:    "rgba(6, 182, 212, 0.14)",
    },
    // NEW: 7PM:MoMi-<L4:2AM — bearish sibling of 7PM:MoMi->U4:2AM, same
    // p-CU1L1 + EU2L4 + pMicro/Mini base, but splits on todayCPR.PDL <
    // prevCPR.pivot instead. Targets today's own L4 (S4) by ~2AM. Rose
    // color family to visually flag it as the downtrend/bearish sibling.
    {
      id: "7PM:MoMi-<L4:2AM",
      label: "7PM:MoMi-<L4:2AM",
      activeColor: "#fb7185",      // rose-400 border
      activeText:  "#fda4af",      // rose-300 text
      activeBg:    "rgba(244, 63, 94, 0.14)",
    },
    // NEW: 6PM:APHS1A-FAU4:9PM — LEVEL ABOVE + Pattern EU2L4 + the PREVIOUS
    // day's own pivot sub-label (prevCPR vs ppCPR) being EU3L4
    // ("p-EU3L4" badge) + today's BC above prev day's own PDH
    // (todayCPR.bc > prevCPR.prevHigh) + today's S1 above prev day's TC
    // (todayCPR.s1 > prevCPR.tc). Bullish, entry ~6PM, targets Far Above
    // U4 by ~9PM. Green color family, same as its A-A-AA-AA-EU3L4-GapB
    // sibling, to flag it as bullish.
    {
      id: "6PM:APHS1A-FAU4:9PM",
      label: "6PM:APHS1A-FAU4:9PM",
      activeColor: "#22c55e",      // green-500 border
      activeText:  "#4ade80",      // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // MOVED: 8AM:pPDHA-SRA-U4+2:2AM — was nested under "Inside CPR" →
    // "EU4L4" (gated on InsideCPR); now nested under "levelsabove" →
    // "A-B-C-C" → "A-B-C-C-EU4L4" instead (PIVOT_PATTERNS["A-B-C-C"] +
    // raw EU4L4 flag — see that case's comment in ScreenerUtils.tsx).
    // Condition otherwise unchanged: prev R4 inside today's R3/R4, prev S4
    // inside today's S3/S4 (EU4L4) + today's SSRRAbove (today's R1 above
    // prev R1 AND today's S1 held at/above prev S1) + prev day's PDH above
    // today's PDH + prev day's PDL above today's PDL + IF today's own PDH
    // is below today's own R1 (PDHLBelow), additionally require prev day's
    // PDH above today's R1 ("p-PDHA"). Bullish, entry ~8AM, targets
    // today's U4 two days out (+2), by ~2AM. Green color family.
    {
      id: "8AM:pPDHA-SRA-U4+2:2AM",
      label: "8AM:pPDHA-SRA-U4+2:2AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 9AM:pPALPApH-FAU4:2PM — LEVEL ABOVE + Pattern U4L3 + prev day's
    // own Pivot above today's PDL (prevCPR.pivot > todayCPR.prevLow) +
    // today's own Pivot above today's own PDH (todayCPR.pivot >
    // todayCPR.prevHigh). Bullish, entry ~9AM, targets Far Above U4 by
    // ~2PM. Green color family, same as its A-A-AA-AA-EU3L4-GapB /
    // 6PM:APHS1A-FAU4:9PM siblings.
    {
      id: "9AM:pPALPApH-FAU4:2PM",
      label: "9AM:pPALPApH-FAU4:2PM",
      activeColor: "#22c55e",      // green-500 border
      activeText:  "#4ade80",      // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
  ],
  "levelsbelow": [
    // RENAMED from "BC>pPDL-U3:5AM", then from "3P:HA-pABOVE:pR4-3A".
    // "3P:HA-pBELOWR1:R2-3A" — LEVEL BELOW + RRSSGapCategory SSGap +
    // RRHHCategory RRHH-HA + SSLLCategory SSLL-BB + HHLLCategory HHLL-E +
    // PDHPDLGapCategory LLGap + prevCPR.HLSwitch HL-B (pHL-B) +
    // todayCPR.HLSwitch HL-A with hlGapWinner "today" (HLGap-A) + prev
    // day's S3 above today's S1 + prev day's own Pivot above today's R1
    // (see ScreenerUtils.tsx / cpr.ts). Bullish, entry ~3PM, targets
    // today's own R2 (U2) by ~3AM (+1). Green color family to visually
    // flag this as the bullish sub-pattern.
    {
      id: "3P:HA-pBELOWR1:R2-3A",
      label: "3P:HA-pBELOWR1:R2-3A",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: "3P:HA-pABOVER1:S2-6P" — replica of "3P:HA-pBELOWR1:R2-3A"
    // with the same base conditions, but prev day's own Pivot BELOW
    // today's R1 (instead of above). Bearish, entry ~3PM, targets
    // today's own S2 (L2) by ~6PM. Rose color family to visually flag
    // this as the bearish sub-pattern.
    {
      id: "3P:HA-pABOVER1:S2-6P",
      label: "3P:HA-pABOVER1:S2-6P",
      activeColor: "#fb7185",              // rose-400 border
      activeText:  "#fda4af",              // rose-300 text
      activeBg:    "rgba(244, 63, 94, 0.14)", // rose-500 tint
    },
    // NEW: "2P:HA-HABOVEpR1:R4-4P" — replica of "3P:HA-pBELOWR1:R2-3A"
    // with the same base conditions, but today's own R1 above prev day's
    // PDH (instead of prev day's own Pivot above today's R1) and today's
    // R3 above prev day's R4 (instead of prev day's R3). Bullish, entry
    // ~2PM, targets today's own R4 (U4) by ~4PM. Green color family to
    // visually flag this as the bullish sub-pattern.
    {
      id: "2P:HA-HABOVEpR1:R4-4P",
      label: "2P:HA-HABOVEpR1:R4-4P",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: PDH>pTC-U4:5AM — LEVEL BELOW + today's PDH (todayCPR.prevHigh)
    // above prev day's TC (prevCPR.tc). Bullish, targets U4 (today's R4) by
    // ~5AM. Same green color family as its sibling BC>pPDL-U3:5AM.
    {
      id: "PDH>pTC-U4:5AM",
      label: "PDH>pTC-U4:5AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 11AM:pCPR1AHi-FApU4:1PM — LEVEL BELOW + L4U3 + HHLLBelow
    // (today's PDH at/below prev day's PDH AND today's PDL below prev
    // day's PDL). Bullish, targets Far Above pU4 (prev day's R4) by ~1PM.
    // Same green color family as its BC>pPDL-U3:5AM / PDH>pTC-U4:5AM
    // siblings.
    {
      id: "11AM:pCPR1AHi-FApU4:1PM",
      label: "11AM:pCPR1AHi-FApU4:1PM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 2P:L4U4-pLAP:R4-2A — View nested under the "RHSLB-SSLLpGap"
    // Pattern arrow (renamed from "2P:RHSLB-SSLLpGap:2A" — see
    // matchesPatternFlag in ScreenerUtils.tsx). LEVEL BELOW + the shared
    // RHSLB-SSLLpGap base + the raw L4U4 flag (today's R4 inside prev's
    // R3/R4 AND prev's S4 inside today's S3/S4) + prev day's own PDL above
    // today's Pivot. Bullish, entry ~2PM, targets today's own R4 (U4) by
    // ~2AM. Same green color family as its bullish LEVEL BELOW siblings.
    {
      id: "2P:L4U4-pLAP:R4-2A",
      label: "2P:L4U4-pLAP:R4-2A",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
  ],
  "compressed": [
    // RENAMED from "SMi-L1pU1>-APU4:11PM": all previous conditions removed.
    // "6A:HLC-SSLL:R4-6P" — compressed + HHLL-C + SSLL-AA + RRHH-BB +
    // SSGap + LLGap (see ScreenerUtils.tsx / cpr.ts). Bullish, entry ~6AM,
    // targets today's own R4 (U4) by ~6PM.
    {
      id: "6A:HLC-SSLL:R4-6P",
      label: "6A:HLC-SSLL:R4-6P",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // RENAMED from "S0-L1pU1>-AU4:7PM": all previous conditions removed.
    // "8A:HLC-SSHH:S4-1P" — second sub-pattern under "COMPRESSED". Condition
    // is compressed + SSGap + RRHH-BB + SSLL-AA + HHLL-C + HHGap + pHL-A +
    // HLGap-B (see ScreenerUtils.tsx / cpr.ts). Bearish, entry ~8AM,
    // targets today's own S4 (L4) by ~1PM. Rose color family to visually
    // distinguish as bearish, matching its 9AM:RHLB-RRHH:5AM sibling.
    {
      id: "8A:HLC-SSHH:S4-1P",
      label: "8A:HLC-SSHH:S4-1P",
      activeColor: "#fb7185",              // rose-400 border
      activeText:  "#fda4af",              // rose-300 text
      activeBg:    "rgba(244, 63, 94, 0.14)", // rose-500 tint
    },
    // RENAMED from "T0-L1pU1>-BPL4:5AM": all previous conditions removed.
    // "9AM:RHLB-RRHH:5AM" — bearish counterpart, condition is
    // compressed + RRHH-BB + HHLL-B + RRGap + HHGap (see
    // ScreenerUtils.tsx), targets today's own S2 (L2) by ~5AM. Rose
    // color family to visually distinguish from the bullish (green)
    // 6A:HLC-SSLL:R4-6P sibling.
    {
      id: "9AM:RHLB-RRHH:5AM",
      label: "9AM:RHLB-RRHH:5AM",
      activeColor: "#fb7185",              // rose-400 border
      activeText:  "#fda4af",              // rose-300 text
      activeBg:    "rgba(244, 63, 94, 0.14)", // rose-500 tint
    },
  ],
  // "expanded" — "EXPANDED": RRSS-E only, mirroring "compressed" above.
  // "6A:SLE-RRHH:R2-6A" — expanded + RRGap + RRHH-AA + SSLL-E + HHLL-A +
  // HHGap + pHL-B + HLGap-A (see ScreenerUtils.tsx / cpr.ts). RENAMED
  // from "eXHrL3U3-AU4" and moved here from "Outside CPR" (all previous
  // conditions removed). Bullish, entry ~6AM, targets today's own R2
  // (U2) by ~6AM. Green color family.
  "expanded": [
    {
      id: "6A:SLE-RRHH:R2-6A",
      label: "6A:SLE-RRHH:R2-6A",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
  ],
  "inside-cpr": [
    // NEW: 8AM:CoLApHA-U4+1:8AM — Inside CPR + today's PDL above prev
    // day's S1 ("PDL>pS1") + EITHER today's PDH above prev day's R1
    // ("PDH>pR1") OR prev day's PDH above today's R1 ("pPDH>R1"). Bullish,
    // entry ~8AM, targets pU4 (prev day's R4) by ~8AM the next day. Green
    // color family, same as its Inside CPR siblings below.
    {
      id: "8AM:CoLApHA-U4+1:8AM",
      label: "8AM:CoLApHA-U4+1:8AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 8AM:SRBHHLLA-pU4+1:8AM — Inside CPR + CU3L3 + prev CPR width
    // category pLarge (2.00%-5.00%) + today CPR width category Medium
    // (1.10%-2.00%) + prev day's own PDL below prev S1 (p-PDL<L1) + today's
    // PDH above today's R1 (PDH>U1) + prev R1 above today R1 + prev S1
    // above today S1 (today's pivots contracted inside prev day's) +
    // today's PDH above prev PDH + today's PDL above prev PDL. Bullish,
    // entry ~8AM, targets pU4 (prev day's R4) by ~8AM the next day. Green
    // color family.
    {
      id: "8AM:SRBHHLLA-pU4+1:8AM",
      label: "8AM:SRBHHLLA-pU4+1:8AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 2PM:pPDHLA-SRA-U4:7PM — Inside CPR + CU4L4 + prev CPR width
    // category pLarge (2.00%-5.00%) + today CPR width category Large
    // (2.00%-5.00%) + prev day's PDH above prev R1 (p-PDH>U1) + today's PDL
    // below today's S1 (PDL<L1) + today R1 above prev R1 + today S1 above
    // prev S1 (today's pivots stepped up) + prev day's PDH above today's PDH
    // + prev day's PDL above today's PDL. Bullish, entry ~2PM, targets U4
    // (today's R4) by ~7PM. Green color family.
    {
      id: "2PM:pPDHLA-SRA-U4:7PM",
      label: "2PM:pPDHLA-SRA-U4:7PM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
  ],
  "R1AbovePR4": [
    { id: "9AM:APHS1A-FAU4:4AM", label: "9AM:APHS1A-FAU4:4AM",
      activeColor: "#22c55e", activeText: "#4ade80", activeBg: "rgba(34,197,94,0.18)" },
    // NEW: 6AM:pX-APHS1A-pL4:4AM — same condition as 9AM:APHS1A-FAU4:4AM plus
    // the prev day's own pattern being p-EU3L4. Bearish, targets pL4
    // (prev day's S4) by ~4AM. Red color family.
    {
      id: "6AM:pX-APHS1A-pL4:4AM",
      label: "6AM:pX-APHS1A-pL4:4AM",
      activeColor: "#f87171",              // red-400 border
      activeText:  "#fca5a5",              // red-300 text
      activeBg:    "rgba(239, 68, 68, 0.14)",
    },
    // NEW: 8AM:APHS1A-FAU4:4AM — U1>pU4 + Pattern EU1L3 (same "EU1L3"
    // Pattern sub-category as 9AM:APHS1A-FAU4:4AM above) + today's BC above
    // prev day's own PDH + today's S1 above prev day's TC. Bullish,
    // targets Far Above U4 (today's R4) by ~4AM. Same green color family
    // as its 9AM:APHS1A-FAU4:4AM sibling.
    {
      id: "8AM:APHS1A-FAU4:4AM",
      label: "8AM:APHS1A-FAU4:4AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: TiMe-EUTL3-AU4:2PM — pTiny prev CPR + Mega today CPR +
    // Pattern EUTL3. Violet color family to visually distinguish it
    // from its U1>pU4 sibling.
    {
      id: "TiMe-EUTL3-AU4:2PM",
      label: "TiMe-EUTL3-AU4:2PM",
      activeColor: "#a78bfa",              // violet-400 border
      activeText:  "#c4b5fd",              // violet-300 text
      activeBg:    "rgba(139, 92, 246, 0.14)", // violet-500 tint
    },
    // NEW: SMg-exHiL2L1-U4:3AM — U1>pU4 + Pattern EL1L2. Target U4 @ 3AM.
    {
      id: "SMg-exHiL2L1-U4:3AM",
      label: "SMg-exHiL2L1-U4:3AM",
      activeColor: "#38bdf8",              // sky-400 border
      activeText:  "#7dd3fc",              // sky-300 text
      activeBg:    "rgba(56, 189, 248, 0.14)",
    },
    // NEW: 6AM:MegMeg-L3:8PM — U1>pU4 + Pattern EU1L4 + pMega (prev CPR
    // width Mega, 5.00%-10.00%) + Mega (today's CPR width Mega,
    // 5.00%-10.00%). Bearish, targets L3 (today's S3) by ~8PM. Red color
    // family, same as its 6AM:pX-APHS1A-pL4:4AM sibling.
    {
      id: "6AM:MegMeg-L3:8PM",
      label: "6AM:MegMeg-L3:8PM",
      activeColor: "#f87171",              // red-400 border
      activeText:  "#fca5a5",              // red-300 text
      activeBg:    "rgba(239, 68, 68, 0.14)",
    },
  ],
  "S1BelowPS4": [
    {
      id: "ss-EL1U4-U4:10PM",
      label: "ss-EL1U4-U4:10PM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
  ],
  "equal-cpr": [
    { id: "eXLoL3U3-L3", label: "eXLoL3U3-L3" },
  ],
};

export const pivotcategories: Category[] = [
  { id: "levelsabove",        label: "LEVEL ABOVE",    subtitle: "RRSS-A only (today's R1 up, S1 not down vs prev), excludes ABOVE LEVEL4", icon: TrendingUp },
  { id: "R1AbovePR4",          label: "ABOVE LEVEL4",  subtitle: "Today R1 above Prev R4",   icon: TrendingUp },
  { id: "levelsbelow",    label: "LEVEL BELOW", subtitle: "RRSS-B only (today's R1 not up, S1 down vs prev)", icon: TrendingUp },
  { id: "compressed",        label: "COMPRESSED",   subtitle: "RRSS-C only (today's R1 down, S1 up vs prev)",   icon: TrendingUp },
  { id: "expanded",          label: "EXPANDED",     subtitle: "RRSS-E only (today's R1 up, S1 down vs prev)",   icon: TrendingUp },
  { id: "S1BelowPS4",          label: "BELOW LEVEL4",  subtitle: "Today S1 below Prev S4",   icon: TrendingDown },
  { id: "inside-cpr",         label: "Inside CPR",     subtitle: "Inside CPR range",         icon: Crosshair },
  { id: "overlapping-lower",  label: "Overlap Below", subtitle: "CPR zones stacking down",  icon: LayersIcon },
  { id: "equal-cpr",          label: "Equal CPR",     subtitle: "Prev & Today CPR Equal",   icon: Equal },
];

/**
 * Single source of truth for every pattern id the Screener handles —
 * derived from `pivotcategories` (top-level) + `Views` (nested). Legacy /
 * previously-visible left-nav ids that aren't in the tree anymore live in
 * LEGACY_SCREENER_PATTERN_IDS so App.tsx no longer has to duplicate the tree.
 */
export const LEGACY_SCREENER_PATTERN_IDS = [
  "lower-bullish",
  "Price-AbovePDH",
  "Price-BelowPDL",
  "HB-L1<PL1-PU12CU23",
  "HB-L1<PL4-U1>TCPR",
  "HB-L1<PL2-U12CPU12",
  "HB-L1>PL1-PU1CU234",
  // sub-patterns whose passesPattern() case exists but aren't in the tree yet
  "la-allstepup",
  "eXHiU1L3",
  "LB-PU12CU23",
  "1LB-PL12CL23",
  "LBALLD-U2<PU1",
  "LAT-PU12CU23",
  "LBT-PU1>U1PL1>L1",
  "HA-U1>PU4",
  "HAThin-U1>PU4",
  "HA55-HrL4U34-FAU4",
  "L1<pL4",
] as const;

export const SCREENER_PATTERN_IDS: ReadonlySet<string> = new Set<string>([
  ...pivotcategories.map((p) => p.id),
  ...Object.values(Views).flatMap((subs) => subs.map((s) => s.id)),
  ...LEGACY_SCREENER_PATTERN_IDS,
]);

export type SidebarMode = "scanner" | "signals" | "stats" | "backtest" | "journal";

/**
 * Flat id → label lookup covering every view in the tree — both the
 * top-level `pivotcategories` entries and every nested `Views` sub-item.
 * Used by SignalDesk's chip strip (and anywhere else that needs a view's
 * display label from just its id, without walking the nested tree).
 */
export const VIEW_LABEL_BY_ID: Record<string, string> = {
  ...Object.fromEntries(pivotcategories.map((p) => [p.id, p.label])),
  ...Object.fromEntries(
    Object.values(Views).flatMap((subs) => subs.map((s) => [s.id, s.label] as const)),
  ),
};

/**
 * Tiny pub/sub used by the Screener to tell the sidebar that a View was
 * deselected there (its "✕" filter button was closed), so the same View gets
 * deselected in the left nav too — both surfaces show the same filter.
 */
type ViewDeselectListener = (viewId: string) => void;
const viewDeselectListeners = new Set<ViewDeselectListener>();

export function requestViewDeselect(viewId: string) {
  viewDeselectListeners.forEach((listener) => listener(viewId));
}

export function subscribeViewDeselect(listener: ViewDeselectListener) {
  viewDeselectListeners.add(listener);
  return () => {
    viewDeselectListeners.delete(listener);
  };
}

/** Returns the parent ID for a sub-pattern, or null if it is a parent itself. */
function getParentId(patternId: string): string | null {
  for (const [parentId, children] of Object.entries(Views)) {
    if (children.some((c) => c.id === patternId)) return parentId;
  }
  return null;
}

interface ViewsSidebarProps {
  activeView: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  // NEW: top-level pattern id -> matching count, e.g. { "R1AbovePR4": 41 }.
  // Shown next to each pattern's label as "(41)". Undefined/missing entries
  // (e.g. before the first scan completes) simply render no count.
  counts?: Record<string, number>;
}

export default function ViewsSidebar({
  activeView,
  onSelect,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
  mode,
  onModeChange,
  counts,
}: ViewsSidebarProps) {
  // Which parent pattern is currently open in the tree
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    const parent = getParentId(activeView);
    return parent ?? activeView;
  });

  // Keep tree in sync when activeView is changed from outside
  useEffect(() => {
    const parent = getParentId(activeView);
    if (parent) {
      setExpandedId(parent);
    } else if (pivotcategories.some((p) => p.id === activeView)) {
      setExpandedId(activeView);
    }
  }, [activeView]);

  function handleParentClick(patternId: string) {
    setExpandedId(patternId);
    onSelect(patternId);
  }

  function handleSubClick(subId: string, parentId: string) {
    setExpandedId(parentId);
    // Clicking an already-selected sub-view (its "✕") deselects it and falls
    // back to the parent category — mirroring the Screener's ✕ filter buttons.
    onSelect(activeView === subId ? parentId : subId);
  }

  // Screener → sidebar: closing the matching ✕ filter button in the Screener
  // deselects the same View here.
  useEffect(
    () =>
      subscribeViewDeselect((viewId) => {
        if (viewId !== activeView) return;
        const parent = getParentId(viewId);
        if (parent) onSelect(parent);
      }),
    [activeView, onSelect],
  );

  // ─── Shared style helpers ─────────────────────────────────────────────────
  const BG_DARK = "#0d1117";
  const BORDER_COLOR = "#1e2d3d";
  const ACTIVE_BLUE = "#3b82f6";
  const ACTIVE_TEXT = "#60a5fa";
  const MUTED_TEXT = "#8ba3bc";
  const DIM_TEXT = "#4b6a8a";
  const SUB_TEXT = "#5a7a96";

  // ─── Full expanded sidebar ─────────────────────────────────────────────────
  function ExpandedContent({ onClose }: { onClose?: () => void }) {
    return (
      <div
        style={{
          width: 228,
          minHeight: "100vh",
          background: BG_DARK,
          borderRight: `1px solid ${BORDER_COLOR}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "13px 10px 12px 16px",
            borderBottom: `1px solid ${BORDER_COLOR}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: DIM_TEXT,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            PIVOT LEVEL | VIEWS
          </span>
          <button
            onClick={onClose ?? onToggle}
            aria-label={onClose ? "Close menu" : "Collapse sidebar"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: DIM_TEXT,
              padding: "2px",
              display: "flex",
              alignItems: "center",
              borderRadius: 4,
            }}
          >
            {onClose
              ? <X style={{ width: 15, height: 15 }} />
              : <ChevronLeft style={{ width: 15, height: 15 }} />
            }
          </button>
        </div>

        {/* Mode toggle */}
        <div
          style={{
            padding: "8px 10px",
            borderBottom: `1px solid ${BORDER_COLOR}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: `1px solid ${BORDER_COLOR}`,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                width: "100%",
              }}
            >
              {([
                { id: "scanner", label: "Live", icon: BarChart },
                { id: "signals", label: "Signals", icon: Zap },
                { id: "stats", label: "Stats", icon: Activity },
                { id: "backtest", label: "Backtest", icon: FlaskConical },
                { id: "journal", label: "Journal", icon: BookmarkCheck },
              ] as { id: SidebarMode; label: string; icon: React.ElementType }[]).map((tab, index) => {
                const TabIcon = tab.icon;
                const isSelected = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onModeChange(tab.id)}
                    style={{
                      minWidth: 0,
                      padding: "6px 0",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "none",
                      borderRight:
                        index % 2 === 0 ? `1px solid ${BORDER_COLOR}` : "none",
                      borderBottom:
                        index < 4 ? `1px solid ${BORDER_COLOR}` : "none",
                      background: isSelected ? "rgba(59,130,246,0.2)" : "transparent",
                      color: isSelected ? ACTIVE_TEXT : DIM_TEXT,
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <TabIcon style={{ width: 12, height: 12 }} />
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tree nav */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            paddingTop: 4,
            paddingBottom: 16,
          }}
        >
          {pivotcategories.map((pattern) => {
            const Icon = pattern.icon;
            const children = Views[pattern.id] ?? [];
            const isActiveParent = activeView === pattern.id;
            const hasActiveChild = children.some((c) => c.id === activeView);
            const isHighlighted = isActiveParent || hasActiveChild;
            const isExpanded = expandedId === pattern.id;

            return (
              <div key={pattern.id}>
                {/* Parent row */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleParentClick(pattern.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px 9px 14px",
                    background: isHighlighted ? "rgba(59,130,246,0.10)" : "transparent",
                    outline: "none",
                    borderTop: "none",
                    borderRight: "none",
                    borderBottom: "none",
                    borderLeft: `3px solid ${isHighlighted ? ACTIVE_BLUE : "transparent"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isHighlighted)
                      (e.currentTarget as HTMLElement).style.background =
                        "rgba(59,130,246,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isHighlighted)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      background: isHighlighted
                        ? "rgba(59,130,246,0.22)"
                        : "rgba(255,255,255,0.04)",
                    }}
                  >
                    <Icon
                      style={{
                        width: 14,
                        height: 14,
                        color: isHighlighted ? ACTIVE_TEXT : DIM_TEXT,
                      }}
                    />
                  </div>

                  {/* Label + subtitle */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: isHighlighted ? "#e2e8f0" : MUTED_TEXT,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        lineHeight: 1.3,
                      }}
                    >
                      {pattern.label}
                      {!!counts?.[pattern.id] && (
                        <> ({counts[pattern.id]})</>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#3b5278",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginTop: 1,
                        lineHeight: 1.3,
                      }}
                    >
                      {pattern.subtitle}
                    </div>
                  </div>

                  {/* +/- expand toggle — styled like the Screener filter buttons */}
                  {children.length > 0 && (
                    <button
                      type="button"
                      aria-label={isExpanded ? `Collapse ${pattern.label}` : `Expand ${pattern.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isExpanded) {
                          setExpandedId(null);
                        } else {
                          handleParentClick(pattern.id);
                        }
                      }}
                      style={{
                        flexShrink: 0,
                        alignSelf: "flex-start",
                        marginTop: 1,
                        width: 18,
                        height: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        lineHeight: 1,
                        fontWeight: 700,
                        borderRadius: 4,
                        cursor: "pointer",
                        border: `1px solid ${isExpanded ? ACTIVE_BLUE : BORDER_COLOR}`,
                        background: isExpanded ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.02)",
                        color: isExpanded ? ACTIVE_TEXT : SUB_TEXT,
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        if (!isExpanded) {
                          el.style.borderColor = "#2e4a6a";
                          el.style.color = MUTED_TEXT;
                          el.style.background = "rgba(59,130,246,0.06)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        if (!isExpanded) {
                          el.style.borderColor = BORDER_COLOR;
                          el.style.color = SUB_TEXT;
                          el.style.background = "rgba(255,255,255,0.02)";
                        }
                      }}
                    >
                      {isExpanded ? "\u2212" : "+"}
                    </button>
                  )}
                </div>

                {/* Sub-items (chips) — shown when parent is expanded */}
                {isExpanded && children.length > 0 && (
                  <div
                    style={{
                      marginLeft: 14,
                      paddingLeft: 20,
                      paddingRight: 10,
                      paddingTop: 6,
                      paddingBottom: 9,
                      borderLeft: `1px solid ${BORDER_COLOR}`,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "5px 5px",
                    }}
                  >
                    {children.map((sub) => {
                      const isActiveSub = activeView === sub.id;
                      const subActiveColor = sub.activeColor ?? ACTIVE_BLUE;
                      const subActiveText  = sub.activeText  ?? ACTIVE_TEXT;
                      const subActiveBg    = sub.activeBg    ?? "rgba(59,130,246,0.18)";
                      return (
                        <button
                          key={sub.id}
                          onClick={() => handleSubClick(sub.id, pattern.id)}
                          style={{
                            padding: "3px 8px",
                            fontSize: 11,
                            fontWeight: isActiveSub ? 600 : 400,
                            borderRadius: 4,
                            cursor: "pointer",
                            border: `1px solid ${isActiveSub ? subActiveColor : BORDER_COLOR}`,
                            background: isActiveSub
                              ? subActiveBg
                              : "rgba(255,255,255,0.02)",
                            color: isActiveSub ? subActiveText : SUB_TEXT,
                            transition: "all 0.1s",
                            whiteSpace: "nowrap",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActiveSub) {
                              const el = e.currentTarget as HTMLElement;
                              el.style.borderColor = "#2e4a6a";
                              el.style.color = MUTED_TEXT;
                              el.style.background = "rgba(59,130,246,0.06)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActiveSub) {
                              const el = e.currentTarget as HTMLElement;
                              el.style.borderColor = BORDER_COLOR;
                              el.style.color = SUB_TEXT;
                              el.style.background = "rgba(255,255,255,0.02)";
                            }
                          }}
                        >
                          {isActiveSub ? `\u2715 ${sub.label}` : sub.label}
                          {!!counts?.[sub.id] && (
                            <span style={{ color: "#ffffff" }}>
                              {" "}({counts[sub.id]})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    );
  }

  // ─── Collapsed sidebar (icons only) ───────────────────────────────────────
  function CollapsedContent() {
    return (
      <div
        style={{
          width: 52,
          minHeight: "100vh",
          background: BG_DARK,
          borderRight: `1px solid ${BORDER_COLOR}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 10,
          gap: 2,
        }}
      >
        {/* Expand button */}
        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: DIM_TEXT,
            padding: "6px",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 4,
          }}
        >
          <ChevronRight style={{ width: 15, height: 15 }} />
        </button>

        {/* Mode Icons Rail */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            marginBottom: 8,
            width: "100%",
            alignItems: "center",
          }}
        >
          {([
            { id: "scanner", label: "Live", icon: BarChart },
            { id: "signals", label: "Signals", icon: Zap },
            { id: "stats", label: "Stats", icon: Activity },
            { id: "backtest", label: "Test", icon: FlaskConical },
            { id: "journal", label: "Journal", icon: BookmarkCheck },
          ] as { id: SidebarMode; label: string; icon: React.ElementType }[]).map((tab) => {
            const TabIcon = tab.icon;
            const isSelected = mode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onModeChange(tab.id)}
                title={tab.label}
                style={{
                  width: 36,
                  height: 32,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  border: "none",
                  background: isSelected
                    ? "rgba(59,130,246,0.25)"
                    : "transparent",
                  color: isSelected ? ACTIVE_TEXT : DIM_TEXT,
                  transition: "all 0.12s",
                }}
              >
                <TabIcon style={{ width: 14, height: 14 }} />
              </button>
            );
          })}
        </div>
        <div
          style={{
            width: 32,
            height: 1,
            background: BORDER_COLOR,
            marginBottom: 6,
          }}
        />

        {/* One icon per pattern */}
        {pivotcategories.map((pattern) => {
          const Icon = pattern.icon;
          const children = Views[pattern.id] ?? [];
          const isHighlighted =
            activeView === pattern.id ||
            children.some((c) => c.id === activeView);
          return (
            <button
              key={pattern.id}
              onClick={() => handleParentClick(pattern.id)}
              title={
                typeof counts?.[pattern.id] === "number"
                  ? `${pattern.label} (${counts[pattern.id]})`
                  : pattern.label
              }
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                border: "none",
                background: isHighlighted
                  ? "rgba(59,130,246,0.2)"
                  : "rgba(255,255,255,0.04)",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!isHighlighted)
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(59,130,246,0.08)";
              }}
              onMouseLeave={(e) => {
                if (!isHighlighted)
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(255,255,255,0.04)";
              }}
            >
              <Icon
                style={{
                  width: 15,
                  height: 15,
                  color: isHighlighted ? ACTIVE_TEXT : DIM_TEXT,
                }}
              />
            </button>
          );
        })}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block">
        {collapsed ? <CollapsedContent /> : <ExpandedContent />}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={onMobileClose}
          />
          {/* Slide-in panel */}
          <div
            className="md:hidden fixed top-0 left-0 bottom-0 z-50"
            style={{ animation: "slideInLeft 0.22s ease-out" }}
          >
            <ExpandedContent onClose={onMobileClose} />
          </div>
          <style>{`
            @keyframes slideInLeft {
              from { transform: translateX(-100%); }
              to   { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  );
}