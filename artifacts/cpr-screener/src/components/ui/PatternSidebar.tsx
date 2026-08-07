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
  ChevronDown,
  X,
  FlaskConical,
} from "lucide-react";

export interface Pattern {
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
export const subPatterns: Record<string, SubPattern[]> = {
  littleabove: [
    { id: "la-2tiny",                label: "LA-BothTiny" },
    { id: "1LHr-L4U3-U4",            label: "1LHr-L4U3-U4" },
    { id: "LA-PL12CL23",             label: "PL12CL23" },
    { id: "sT-cOL2U3-APU4",          label: "cOL2U3-ApU4" },
    { id: "T1-U4:6AM",               label: "T1-U4:6AM" },
    { id: "Ss-HiL4U4-FAU4:2AM",      label: "Ss-HiL4U4-FAU4:2AM" },
    { id: "MeMi-eXHiL4U3-U4:6PM",    label: "MeMi-eXHiL4U3-U4:6PM" },
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
    // NEW: 7AM:MiMi:11PM — Overlap Above + cOL4U4 + p-HiL4U4 + pMini + Mini
    // + p-PDH>U1 + PDH>U1
    {
      id: "7AM:MiMi:11PM",
      label: "7AM:MiMi:11PM",
      activeColor: "#34d399",      // emerald-400 border
      activeText:  "#6ee7b7",      // emerald-300 text
      activeBg:    "rgba(16, 185, 129, 0.10)",
    },
  ],
  "overlapping-lower": [
    { id: "eXLo-L4U4-U4",            label: "Exp-U3>pU4" },
    { id: "Exp-U3>U3",               label: "Exp-U3>U3" },
    { id: "OBN-LoU4L4-U4",           label: "OBN-LoU4L4-U4" },
    { id: "OBW-LoU4L4-L4",           label: "OBW-LoU4L4-L4" },
  ],
  "cpr-1-above": [
    {
      id: "9AM:MegL-3PM",
      label: "9AM:MegL-3PM",
      activeColor: "#22c55e",
      activeText: "#4ade80",
      activeBg: "rgba(34, 197, 94, 0.14)",
    },
    // NEW: 7PM:MoMi->U4:2AM — CPR 1ABOVE + prev day's own pivot sub-label
    // p-cOL1U1 + today's Pattern eXL4U2 + prev CPR pMicro + today CPR Mini
    // + both prev and today PDL below their respective L1s. Cyan color
    // family to visually distinguish it from its 9AM:MegL-3PM sibling.
    {
      id: "7PM:MoMi->U4:2AM",
      label: "7PM:MoMi->U4:2AM",
      activeColor: "#22d3ee",      // cyan-400 border
      activeText:  "#67e8f9",      // cyan-300 text
      activeBg:    "rgba(6, 182, 212, 0.14)",
    },
  ],
  "pcpr-u1-cpr-pl1": [
    // NEW: BC>pPDL-U3:5AM — PREVCPR 1ABOVE + today's BC above prev day's PDH
    // (prevCPR.prevHigh, i.e. the actual high of the day before prev day).
    // Green color family to visually flag this as the bullish sub-pattern.
    {
      id: "BC>pPDL-U3:5AM",
      label: "BC>pPDL-U3:5AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
    // NEW: PDH>pTC-U4:5AM — PREVCPR 1ABOVE + today's PDH (todayCPR.prevHigh)
    // above prev day's TC (prevCPR.tc). Bullish, targets U4 (today's R4) by
    // ~5AM. Same green color family as its sibling BC>pPDL-U3:5AM.
    {
      id: "PDH>pTC-U4:5AM",
      label: "PDH>pTC-U4:5AM",
      activeColor: "#22c55e",              // green-500 border
      activeText:  "#4ade80",              // green-400 text
      activeBg:    "rgba(34, 197, 94, 0.14)",
    },
  ],
  "l1pu1-above": [
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
  "inside-cpr": [],
  "outside-cpr": [
    { id: "outside-cpr-compressed",  label: "Compressed" },
    { id: "eXHrL3U3-AU4",            label: "eXHrL3U3-AU4" },
  ],
  "structure-bigabove": [
    { id: "bigabove-pl34cl4-u3>pu4", label: "pL34-cL4" },
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
    { id: "SL-eXL3U1-FAU4:3PM", label: "SL-eXL3U1-FAU4:3PM",
      activeColor: "#22c55e", activeText: "#4ade80", activeBg: "rgba(34,197,94,0.18)" },
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
  ],
  "structure-bigbelow": [
    { id: "bigbelow-pmini-pl3",      label: "pMini-L34C4/U3>4" },
    { id: "eX-U4L34",               label: "eX-U4L34" },
    { id: "eXLoL3U4-AU4",            label: "eXLoL3U4-AU4" },
    { id: "eXU4L234-AU4",            label: "eXU4L234-AU4" },
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

export const patterns: Pattern[] = [
  { id: "cpr-1-above",        label: "CPR 1ABOVE",    subtitle: "Today TC in prev U2 band, S1 in prev BC/R1 band", icon: TrendingUp },
  { id: "pcpr-u1-cpr-pl1",    label: "PCPR 1ABOVE", subtitle: "Prev Pivot in U1 band, CPR above pL1", icon: TrendingUp },
  { id: "l1pu1-above",        label: "L1pU1 Above",   subtitle: "Today L1 above Prev U1",   icon: TrendingUp },
  { id: "littleabove",        label: "Little ABOVE",  subtitle: "Narrow CPR Above PCPR",    icon: TrendingUp },
  { id: "littlebelow",        label: "Little BELOW",  subtitle: "Narrow CPR Below PCPR",    icon: TrendingDown },
  { id: "structure-bigabove", label: "Big ABOVE",     subtitle: "Wide CPR Above PCPR",      icon: BarChart },
  { id: "u1-gt-pu4",          label: "U1>pU4",        subtitle: "Today R1 above Prev R4",   icon: TrendingUp },
  { id: "structure-bigbelow", label: "Big BELOW",     subtitle: "Wide CPR Below PCPR",      icon: BarChart },
  { id: "l1-lt-pl4",          label: "L1<pL4",        subtitle: "Today S1 below Prev S4",   icon: TrendingDown },
  { id: "inside-cpr",         label: "CPR Inside",    subtitle: "Inside CPR range",         icon: Crosshair },
  { id: "outside-cpr",        label: "CPR Outside",   subtitle: "Outside CPR range",        icon: Maximize2 },
  { id: "overlapping-higher", label: "Overlap Above", subtitle: "CPR zones stacking up",    icon: Layers },
  { id: "overlapping-lower",  label: "Overlap Below", subtitle: "CPR zones stacking down",  icon: LayersIcon },
  { id: "equal-cpr",          label: "Equal CPR",     subtitle: "Prev & Today CPR Equal",   icon: Equal },
];

/**
 * Single source of truth for every pattern id the Screener handles —
 * derived from `patterns` (top-level) + `subPatterns` (nested). Legacy /
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
  ...patterns.map((p) => p.id),
  ...Object.values(subPatterns).flatMap((subs) => subs.map((s) => s.id)),
  ...LEGACY_SCREENER_PATTERN_IDS,
]);

export type SidebarMode = "scanner" | "backtest";

/** Returns the parent ID for a sub-pattern, or null if it is a parent itself. */
function getParentId(patternId: string): string | null {
  for (const [parentId, children] of Object.entries(subPatterns)) {
    if (children.some((c) => c.id === patternId)) return parentId;
  }
  return null;
}

interface PatternSidebarProps {
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

export default function PatternSidebar({
  activePattern,
  onSelect,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
  mode,
  onModeChange,
  counts,
}: PatternSidebarProps) {
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
    } else if (patterns.some((p) => p.id === activePattern)) {
      setExpandedId(activePattern);
    }
  }, [activePattern]);

  function handleParentClick(patternId: string) {
    setExpandedId(patternId);
    onSelect(patternId);
  }

  function handleSubClick(subId: string, parentId: string) {
    setExpandedId(parentId);
    onSelect(subId);
  }

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
            PATTERNS
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
            {(["scanner", "backtest"] as SidebarMode[]).map((m) => (
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
                  {m === "scanner" ? "Live" : "Backtest"}
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
          {patterns.map((pattern) => {
            const Icon = pattern.icon;
            const children = subPatterns[pattern.id] ?? [];
            const isActiveParent = activePattern === pattern.id;
            const hasActiveChild = children.some((c) => c.id === activePattern);
            const isHighlighted = isActiveParent || hasActiveChild;
            const isExpanded = expandedId === pattern.id;

            return (
              <div key={pattern.id}>
                {/* Parent row */}
                <button
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
                        fontSize: 13,
                        fontWeight: 600,
                        color: isHighlighted ? "#e2e8f0" : MUTED_TEXT,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        lineHeight: 1.3,
                      }}
                    >
                      {pattern.label}
                      {typeof counts?.[pattern.id] === "number" && (
                        <span style={{ color: DIM_TEXT, fontWeight: 400 }}>
                          {" "}({counts[pattern.id]})
                        </span>
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

                  {/* Expand arrow */}
                  {children.length > 0 &&
                    (isExpanded ? (
                      <ChevronDown
                        style={{ width: 12, height: 12, color: DIM_TEXT, flexShrink: 0 }}
                      />
                    ) : (
                      <ChevronRight
                        style={{ width: 12, height: 12, color: DIM_TEXT, flexShrink: 0 }}
                      />
                    ))}
                </button>

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
                          {sub.label}
                          {typeof counts?.[sub.id] === "number" && (
                            <span style={{ opacity: 0.7, fontWeight: 400 }}>
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
        {patterns.map((pattern) => {
          const Icon = pattern.icon;
          const children = subPatterns[pattern.id] ?? [];
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
