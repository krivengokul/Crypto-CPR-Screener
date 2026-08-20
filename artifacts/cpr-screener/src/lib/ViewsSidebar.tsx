import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Layers,
  LayersIcon,
  Crosshair,
  Maximize2,
  BarChart,
  Equal,
  ChevronLeft,
  ChevronRight,
  X,
  FlaskConical,
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
  littleabove: [
    { id: "la-2tiny",                label: "LA-BothTiny" },
    { id: "1LHr-L4U3-U4",            label: "1LHr-L4U3-U4" },
    { id: "LA-PL12CL23",             label: "PL12CL23" },
    { id: "sT-cOL2U3-APU4",          label: "cOL2U3-ApU4" },
    { id: "T1-U4:6AM",               label: "T1-U4:6AM" },
    { id: "Ss-HiL4U4-FAU4:2AM",      label: "Ss-HiL4U4-FAU4:2AM" },
    { id: "MeMi-eXL4U3-U4:6PM",      label: "MeMi-eXL4U3-U4:6PM" },
  ],
  littlebelow: [
    { id: "lb-micro2-apu4",         label: "Micro2-ApU4" },
    { id: "lb-allstepdown",          label: "LB-AllUp" },
    { id: "lb-cmprss-l4>3-u4<2",     label: "lb-Cmprss-L4>3/U4<2" },
    { id: "lb-c-l34c4/u23c4",        label: "lb-c-l34c4/u23c4" },
    { id: "lbE11-cOLoL3U2-PU4",      label: "lbE11-cOLoL3U2-PU4" },
    { id: "co2-l2u2",                label: "cO2-L2U2" },
    { id: "L1-cOU1L2-U4:1AM",        label: "L1-cOU1L2-U4:1AM" },
  ],
  "overlapping-higher": [
    { id: "eXHi-L4U4-U4",            label: "eXHi-L4U4-U4" },
    { id: "cOL3U3-pL4",            label: "cOL3U3-pL4" },
    // NEW
    {
      id: "LMe-eXL2U2-L4:10PM",
      label: "LMe-eXL2U2-L4:10PM",
      activeColor: "#f87171",      // red-400 border
      activeText:  "#fca5a5",      // red-300 text
      activeBg:    "rgba(239, 68, 68, 0.10)",
    },
    // NEW: 7AM:MiMi-pU4:11PM — Overlap Above + cOL4U4 + p-HiL4U4 + pMini + Mini
    // + p-PDH>U1 + PDH>U1
    {
      id: "7AM:MiMi-pU4:11PM",
      label: "7AM:MiMi-pU4:11PM",
      activeColor: "#34d399",      // emerald-400 border
      activeText:  "#6ee7b7",      // emerald-300 text
      activeBg:    "rgba(16, 185, 129, 0.10)",
    },
    // NEW: 6PM:LaLa->U4:2AM — Overlap Above + p-cOU3L3 + eXL4U4 + pLarge +
    // Large + p-PDL<L1 + PDH>U1 + today's PDH > prev R1 + today's PDL > prev S1
    {
      id: "6PM:LaLa->U4:2AM",
      label: "6PM:LaLa->U4:2AM",
      activeColor: "#fbbf24",      // amber-400 border
      activeText:  "#fcd34d",      // amber-300 text
      activeBg:    "rgba(245, 158, 11, 0.10)",
    },
  ],
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
    { id: "OBN-LoU4L4-U4",           label: "OBN-LoU4L4-U4" },
    { id: "OBW-LoU4L4-L4",           label: "OBW-LoU4L4-L4" },
    // NEW: 2PM:SSLLpRRHHA-ApU4:5PM — Overlap Below + SSLLAbove (today's S1
    // AND today's PDL both above the higher of prev's S1/PDL) + HHRRBelow
    // (today's R1 AND today's PDH both below the lower of prev's R1/PDH)
    // + (prev day's R1 above today's R2 OR today's S3 above prev day's S2).
    // Bullish, entry ~2PM, targets ApU4 (prev day's R4) by ~5PM. Green
    // color family to flag it as bullish, matching the other ApU4/AU4
    // bullish siblings elsewhere (e.g. SMi-L1pU1>-APU4:11PM).
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
      id: "9AM:MegL-U4+1:3PM",
      label: "9AM:MegL-U4+1:3PM",
      activeColor: "#22c55e",
      activeText: "#4ade80",
      activeBg: "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 7PM:MoMi->U4:2AM — LEVELS ABOVE + prev day's own pivot sub-label
    // p-cOL1U1 + today's Pattern eXL4U2 + prev CPR pMicro + today CPR Mini
    // + both prev and today PDL below their respective L1s. Cyan color
    // family to visually distinguish it from its 9AM:MegL-U4+1:3PM sibling.
    {
      id: "7PM:MoMi->U4:2AM",
      label: "7PM:MoMi->U4:2AM",
      activeColor: "#22d3ee",      // cyan-400 border
      activeText:  "#67e8f9",      // cyan-300 text
      activeBg:    "rgba(6, 182, 212, 0.14)",
    },
    // NEW: 7PM:MoMi-<L4:2AM — bearish sibling of 7PM:MoMi->U4:2AM, same
    // p-cOL1U1 + eXL4U2 + pMicro/Mini base, but splits on todayCPR.PDL <
    // prevCPR.pivot instead. Targets today's own L4 (S4) by ~2AM. Rose
    // color family to visually flag it as the downtrend/bearish sibling.
    {
      id: "7PM:MoMi-<L4:2AM",
      label: "7PM:MoMi-<L4:2AM",
      activeColor: "#fb7185",      // rose-400 border
      activeText:  "#fda4af",      // rose-300 text
      activeBg:    "rgba(244, 63, 94, 0.14)",
    },
    // NEW: 6PM:APHS1A-FAU4:9PM — LEVELS ABOVE + Pattern eXL4U2 + the PREVIOUS
    // day's own pivot sub-label (prevCPR vs ppCPR) being eXL4U3
    // ("p-eXL4U3" badge) + today's BC above prev day's own PDH
    // (todayCPR.bc > prevCPR.prevHigh) + today's S1 above prev day's TC
    // (todayCPR.s1 > prevCPR.tc). Bullish, entry ~6PM, targets Far Above
    // U4 by ~9PM. Green color family, same as its 9AM:MegL-U4+1:3PM
    // sibling, to flag it as bullish.
    {
      id: "6PM:APHS1A-FAU4:9PM",
      label: "6PM:APHS1A-FAU4:9PM",
      activeColor: "#22c55e",      // green-500 border
      activeText:  "#4ade80",      // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 9AM:pPALPApH-FAU4:2PM — LEVELS ABOVE + Pattern HiL3U4 + prev day's
    // own Pivot above today's PDL (prevCPR.pivot > todayCPR.prevLow) +
    // today's own Pivot above today's own PDH (todayCPR.pivot >
    // todayCPR.prevHigh). Bullish, entry ~9AM, targets Far Above U4 by
    // ~2PM. Green color family, same as its 9AM:MegL-U4+1:3PM /
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
    // NEW: BC>pPDL-U3:5AM — LEVELs BELOW + today's BC above prev day's PDH
    // (prevCPR.prevHigh, i.e. the actual high of the day before prev day).
    // Green color family to visually flag this as the bullish sub-pattern.
    {
      id: "BC>pPDL-U3:5AM",
      label: "BC>pPDL-U3:5AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: PDH>pTC-U4:5AM — LEVELs BELOW + today's PDH (todayCPR.prevHigh)
    // above prev day's TC (prevCPR.tc). Bullish, targets U4 (today's R4) by
    // ~5AM. Same green color family as its sibling BC>pPDL-U3:5AM.
    {
      id: "PDH>pTC-U4:5AM",
      label: "PDH>pTC-U4:5AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 11AM:pCPR1AHi-FApU4:1PM — LEVELs BELOW + LoU3L4 + HHLLBelow
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
  ],
  "compressed": [
    {
      id: "SMi-L1pU1>-APU4:11PM",
      label: "SMi-L1pU1>-APU4:11PM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: S0-L1pU1>-AU4:7PM — second sub-pattern, 1-Line CPR variant of
    // SMi-L1pU1>-APU4:11PM. Bullish, targets AU4 (prev day's R4) by ~7PM.
    // Amber color family to visually distinguish from its siblings.
    {
      id: "S0-L1pU1>-AU4:7PM",
      label: "S0-L1pU1>-AU4:7PM",
      activeColor: "#fbbf24",              // amber-400 border
      activeText:  "#fcd34d",              // amber-300 text
      activeBg:    "rgba(245, 158, 11, 0.14)", // amber-500 tint
    },
    // NEW: T0-L1pU1>-BPL4:5AM — bearish counterpart, targets prev day's
    // S4 (PL4) by ~5AM. Rose color family to visually distinguish from
    // the bullish (green) SMi-L1pU1>-APU4:11PM sibling.
    {
      id: "T0-L1pU1>-BPL4:5AM",
      label: "T0-L1pU1>-BPL4:5AM",
      activeColor: "#fb7185",              // rose-400 border
      activeText:  "#fda4af",              // rose-300 text
      activeBg:    "rgba(244, 63, 94, 0.14)", // rose-500 tint
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
    // NEW: 8AM:SRBHHLLA-pU4+1:8AM — Inside CPR + cOL3U3 + prev CPR width
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
    // NEW: 2PM:pPDHLA-SRA-U4:7PM — Inside CPR + cOL4U4 + prev CPR width
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
    // NEW: 8AM:pPDHA-SRA-U4+2:2AM — Inside CPR + raw eXL4U4 flag (prev R4
    // inside today's R3/R4, prev S4 inside today's S3/S4) + today's
    // SSRRAbove (today's R1 above prev R1 AND today's S1 held at/above prev
    // S1) + prev day's PDH above today's PDH + prev day's PDL above
    // today's PDL + IF today's own PDH is below today's own R1
    // (PDHLBelow), additionally require prev day's PDH above today's R1
    // ("p-PDHA"). Bullish, entry ~8AM, targets today's U4 two days out
    // (+2), by ~2AM. Green color family.
    {
      id: "8AM:pPDHA-SRA-U4+2:2AM",
      label: "8AM:pPDHA-SRA-U4+2:2AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
  ],
  "outside-cpr": [
    { id: "outside-cpr-compressed",  label: "Compressed" },
    { id: "eXHrL3U3-AU4",            label: "eXHrL3U3-AU4" },
  ],
  "structure-bigabove": [
    // RENAMED: was "bigabove-pl34cl4-u3>pu4" -> "9AM:SSRRHHLLA-U4:11PM"
    // (BigCPR Above + SSRRAbove + HHLLAbove + PDHLAbove; entry ~9AM, target
    // U4 by ~11PM). Same condition, id/label updated for consistency with
    // the other time-stamped View ids.
    {
      id: "9AM:SSRRHHLLA-U4:11PM",
      label: "9AM:SSRRHHLLA-U4:11PM",
      activeColor: "#34d399",      // emerald-400 border
      activeText:  "#6ee7b7",      // emerald-300 text
      activeBg:    "rgba(16, 185, 129, 0.10)",
    },
    { id: "bacomp-l3>pl1/u3>pu1",   label: "Inside PUL2" },
    { id: "hR-HAL",                  label: "hR-HAL" },
    { id: "eXL4U2-U4:4AM",           label: "eXL4U2-U4:4AM" },
    { id: "1T-HiL4U4-FAU4",          label: "1T-HiL4U4-FAU4" },
    { id: "1S-cOL3U4-FAU4:1AM",        label: "1S-cOL3U4-FAU4:1AM" },
    { id: "TS-cOL3U4-AU4R:4PM",        label: "TS-cOL3U4-AU4R:4PM" },
    // NEW: TiMi-cOL2U2-pL4:5AM — BigCPR Above + Pattern cOL2U2, pTiny/Mini
    // width combo, today's PDH below today's R1, prev day pattern
    // p-cOL4U4. Bearish, targets PL4 (prev day's S4) by ~5AM. Rose color
    // family to visually flag it as bearish, same as the other pL4 views.
    {
      id: "TiMi-cOL2U2-pL4:5AM",
      label: "TiMi-cOL2U2-pL4:5AM",
      activeColor: "#fb7185",              // rose-400 border
      activeText:  "#fda4af",              // rose-300 text
      activeBg:    "rgba(244, 63, 94, 0.14)", // rose-500 tint
    },
  ],
  "u1-gt-pu4": [
    { id: "9AM:APHS1A-FAU4:4AM", label: "9AM:APHS1A-FAU4:4AM",
      activeColor: "#22c55e", activeText: "#4ade80", activeBg: "rgba(34,197,94,0.18)" },
    // NEW: 6AM:pX-APHS1A-pL4:4AM — same condition as 9AM:APHS1A-FAU4:4AM plus
    // the prev day's own pattern being p-eXL4U3. Bearish, targets pL4
    // (prev day's S4) by ~4AM. Red color family.
    {
      id: "6AM:pX-APHS1A-pL4:4AM",
      label: "6AM:pX-APHS1A-pL4:4AM",
      activeColor: "#f87171",              // red-400 border
      activeText:  "#fca5a5",              // red-300 text
      activeBg:    "rgba(239, 68, 68, 0.14)",
    },
    // NEW: 8AM:APHS1A-FAU4:4AM — U1>pU4 + Pattern eXL3U1 (same "eXL3U1"
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
    // NEW: TiMe-eXL3TC-AU4:2PM — pTiny prev CPR + Mega today CPR +
    // Pattern eXL3TC. Violet color family to visually distinguish it
    // from its U1>pU4 sibling.
    {
      id: "TiMe-eXL3TC-AU4:2PM",
      label: "TiMe-eXL3TC-AU4:2PM",
      activeColor: "#a78bfa",              // violet-400 border
      activeText:  "#c4b5fd",              // violet-300 text
      activeBg:    "rgba(139, 92, 246, 0.14)", // violet-500 tint
    },
    // NEW: SMg-exHiL2L1-U4:3AM — U1>pU4 + Pattern eXHiL2L1. Target U4 @ 3AM.
    {
      id: "SMg-exHiL2L1-U4:3AM",
      label: "SMg-exHiL2L1-U4:3AM",
      activeColor: "#38bdf8",              // sky-400 border
      activeText:  "#7dd3fc",              // sky-300 text
      activeBg:    "rgba(56, 189, 248, 0.14)",
    },
    // NEW: 6AM:MegMeg-L3:8PM — U1>pU4 + Pattern eXL4U1 + pMega (prev CPR
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
  "structure-bigbelow": [
    { id: "bigbelow-pmini-pl3",      label: "pMini-L34C4/U3>4" },
    { id: "eX-U4L34",               label: "eX-U4L34" },
    // CHANGED: these two ids ("eXLoL3U4-AU4" / "eXU4L234-AU4") had no
    // matching passesPattern() case in ScreenerUtils at all (always 0
    // results) — they were stale names for what the Screener's Big Below
    // buttons actually implement as "eXU4L3-AU4" / "eXU4L2-AU4". Renamed to
    // match the real, working ids so the left-nav Views and the Screener's
    // buttons refer to the same filter (see LEGACY_SCREENER_PATTERN_IDS
    // doc-comment for the reverse direction of this same fix).
    { id: "eXU4L3-AU4",              label: "eXU4L3-AU4" },
    { id: "eXU4L2-AU4",              label: "eXU4L2-AU4" },
    { id: "1T-cOU4L4-ApU4:3PM",     label: "1T-cOU4L4-ApU4:3PM" },
  ],
  "l1-lt-pl4": [
    {
      id: "ss-eXU4L1-U4:10PM",
      label: "ss-eXU4L1-U4:10PM",
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
  { id: "levelsabove",        label: "LEVELs ABOVE",    subtitle: "RRSS-A only (today's R1 up, S1 not down vs prev)", icon: TrendingUp },
  { id: "levelsbelow",    label: "LEVELs BELOW", subtitle: "RRSS-B only (today's R1 not up, S1 down vs prev)", icon: TrendingUp },
  { id: "compressed",        label: "COMPRESSED",   subtitle: "RRSS-C only (today's R1 down, S1 up vs prev)",   icon: TrendingUp },
  { id: "littleabove",        label: "Little ABOVE",  subtitle: "Narrow CPR Above PCPR",    icon: TrendingUp },
  { id: "littlebelow",        label: "Little BELOW",  subtitle: "Narrow CPR Below PCPR",    icon: TrendingDown },
  { id: "structure-bigabove", label: "Big ABOVE",     subtitle: "Wide CPR Above PCPR",      icon: BarChart },
  { id: "u1-gt-pu4",          label: "U1>pU4",        subtitle: "Today R1 above Prev R4",   icon: TrendingUp },
  { id: "structure-bigbelow", label: "Big BELOW",     subtitle: "Wide CPR Below PCPR",      icon: BarChart },
  { id: "l1-lt-pl4",          label: "L1<pL4",        subtitle: "Today S1 below Prev S4",   icon: TrendingDown },
  { id: "inside-cpr",         label: "Inside CPR",     subtitle: "Inside CPR range",         icon: Crosshair },
  { id: "outside-cpr",        label: "Outside CPR",  subtitle: "Outside CPR range",        icon: Maximize2 },
  { id: "overlapping-higher", label: "Overlap Above", subtitle: "CPR zones stacking up",    icon: Layers },
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

export type SidebarMode = "scanner" | "backtest" | "signals";

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
  activePattern: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  // NEW: top-level pattern id -> matching count, e.g. { littleabove: 41 }.
  // Shown next to each pattern's label as "(41)". Undefined/missing entries
  // (e.g. before the first scan completes) simply render no count.
  counts?: Record<string, number>;
}

export default function ViewsSidebar({
  activePattern,
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
    const parent = getParentId(activePattern);
    return parent ?? activePattern;
  });

  // Keep tree in sync when activePattern is changed from outside
  useEffect(() => {
    const parent = getParentId(activePattern);
    if (parent) {
      setExpandedId(parent);
    } else if (pivotcategories.some((p) => p.id === activePattern)) {
      setExpandedId(activePattern);
    }
  }, [activePattern]);

  function handleParentClick(patternId: string) {
    setExpandedId(patternId);
    onSelect(patternId);
  }

  function handleSubClick(subId: string, parentId: string) {
    setExpandedId(parentId);
    // Clicking an already-selected sub-view (its "✕") deselects it and falls
    // back to the parent category — mirroring the Screener's ✕ filter buttons.
    onSelect(activePattern === subId ? parentId : subId);
  }

  // Screener → sidebar: closing the matching ✕ filter button in the Screener
  // deselects the same View here.
  useEffect(
    () =>
      subscribeViewDeselect((viewId) => {
        if (viewId !== activePattern) return;
        const parent = getParentId(viewId);
        if (parent) onSelect(parent);
      }),
    [activePattern, onSelect],
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
            {(["scanner", "backtest", "signals"] as SidebarMode[]).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  background: mode === m ? "rgba(59,130,246,0.2)" : "transparent",
                  color: mode === m ? ACTIVE_TEXT : DIM_TEXT,
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
                  <FlaskConical style={{ width: 11, height: 11 }} />
                  {m === "scanner"
                    ? "Live"
                    : m === "backtest"
                      ? "Backtest"
                      : "Signals"}
                </span>
              </button>
            ))}
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
            const isActiveParent = activePattern === pattern.id;
            const hasActiveChild = children.some((c) => c.id === activePattern);
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
                    // border shorthand reset, then set left border via outline trick
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
                      const isActiveSub = activePattern === sub.id;
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

        {/* One icon per pattern */}
        {pivotcategories.map((pattern) => {
          const Icon = pattern.icon;
          const children = Views[pattern.id] ?? [];
          const isHighlighted =
            activePattern === pattern.id ||
            children.some((c) => c.id === activePattern);
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
