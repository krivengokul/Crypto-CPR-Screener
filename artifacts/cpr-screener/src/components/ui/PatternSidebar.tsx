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
}

/**
 * Sub-patterns for each parent pattern.
 * Each `id` maps to a passesPattern() case in ScreenerUtils.tsx so the
 * existing Screener filtering logic works with no changes.
 */
export const subPatterns: Record<string, SubPattern[]> = {
  littleabove: [
    { id: "la-2tiny",                label: "LA-BothTiny" },
    { id: "la-allstepup",            label: "LA-AllUp" },
    { id: "1LHr-L4U3-U4",            label: "1LHr-L4U3-U4" },
    { id: "LA-PL12CL23",             label: "PL12CL23" },
    { id: "sT-cOL2U3-APU4",          label: "cOL2U3-ApU4" },
  ],
  littlebelow: [
    { id: "lb-2tiny",                label: "LB-BothTiny" },
    { id: "lb-allstepdown",          label: "LB-AllUp" },
    { id: "lb-cmprss-l4>3-u4<2",     label: "lb-Cmprss-L4>3/U4<2" },
    { id: "lb-c-l34c4/u23c4",        label: "lb-c-l34c4/u23c4" },
    { id: "lbE11-cOLoL3U2-PU4",      label: "lbE11-cOLoL3U2-PU4" },
    { id: "co2-l2u2",                label: "cO2-L2U2" },
  ],
  "overlapping-higher": [
    { id: "eXHi-L4U4-U4",            label: "eXHi-L4U4-U4" },
  ],
  "overlapping-lower": [
    { id: "eXLo-L4U4-U4",            label: "Exp-U3>pU4" },
    { id: "Exp-U3>U3",               label: "Exp-U3>U3" },
    { id: "OBN-LoL4U4-U4",           label: "OBN-LoL4U4-U4" },
    { id: "OBW-LoL4U4-L4",           label: "OBW-LoL4U4-L4" },
  ],
  "inside-cpr": [
    { id: "inside-cpr-expanded",     label: "Expanded" },
    { id: "inside-cpr-narrow",       label: "Narrow" },
    { id: "cO-U4L3",                label: "cO-U4L3" },
  ],
  "outside-cpr": [
    { id: "outside-cpr-compressed",  label: "Compressed" },
    { id: "eXHrL3U3-AU4",            label: "eXHrL3U3-AU4" },
  ],
  "structure-bigabove": [
    { id: "bigabove-pl34cl4-u3>pu4", label: "pL34-cL4" },
    { id: "bacomp-l3>pl1/u3>pu1",   label: "Inside PUL2" },
    { id: "eXHi-L4U234-U4",          label: "eXHi-L4U234-U4" },
    { id: "HA-U1>PU4",               label: "U1>PU4" },
    { id: "hR-HAL",                  label: "hR-HAL" },
    { id: "1T-HiL4U4-FAU4",          label: "1T-HiL4U4-FAU4" },
  ],
  "structure-bigbelow": [
    { id: "bigbelow-pmini-pl3",      label: "pMini-L34C4/U3>4" },
    { id: "eX-U4L34",               label: "eX-U4L34" },
    { id: "eXLoL3U4-AU4",            label: "eXLoL3U4-AU4" },
    { id: "L1<pL4",                  label: "L1<pL4" },
    { id: "eXU4L234-AU4",            label: "eXU4L234-AU4" },
  ],
  "equal-cpr": [
    { id: "eXLoL3U3-L3", label: "eXLoL3U3-L3" },
  ],
};

export const patterns: Pattern[] = [
  { id: "littleabove",        label: "Little ABOVE",  subtitle: "Narrow CPR Above PCPR",    icon: TrendingUp },
  { id: "littlebelow",        label: "Little BELOW",  subtitle: "Narrow CPR Below PCPR",    icon: TrendingDown },
  { id: "structure-bigabove", label: "Big ABOVE",     subtitle: "Wide CPR Above PCPR",      icon: BarChart },
  { id: "structure-bigbelow", label: "Big BELOW",     subtitle: "Wide CPR Below PCPR",      icon: BarChart },
  { id: "inside-cpr",         label: "CPR Inside",    subtitle: "Inside CPR range",         icon: Crosshair },
  { id: "outside-cpr",        label: "CPR Outside",   subtitle: "Outside CPR range",        icon: Maximize2 },
  { id: "overlapping-higher", label: "Overlap Above", subtitle: "CPR zones stacking up",    icon: Layers },
  { id: "overlapping-lower",  label: "Overlap Below", subtitle: "CPR zones stacking down",  icon: LayersIcon },
  { id: "equal-cpr",          label: "Equal CPR",     subtitle: "Prev & Today CPR Equal",   icon: Equal },
];

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
                            border: `1px solid ${isActiveSub ? ACTIVE_BLUE : BORDER_COLOR}`,
                            background: isActiveSub
                              ? "rgba(59,130,246,0.18)"
                              : "rgba(255,255,255,0.02)",
                            color: isActiveSub ? ACTIVE_TEXT : SUB_TEXT,
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
