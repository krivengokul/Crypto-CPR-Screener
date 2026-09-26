import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
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
import { getView, VIEWS, type ViewDef } from "@/lib/views";

export interface Category {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ElementType;
}

export interface SidebarView {
  id: string;
  label: string;
  /** Optional per-view highlight border color (CSS color). Defaults to ACTIVE_BLUE. */
  activeColor?: string;
  /** Optional per-view highlight text color (CSS color). Defaults to ACTIVE_TEXT. */
  activeText?: string;
  /** Optional per-view highlight background (CSS color). Defaults to blue-tinted. */
  activeBg?: string;
}

export const pivotcategories: Category[] = [
  { id: "levelsabove", label: getView("levelsabove")?.label ?? "LEVEL ABOVE", subtitle: "RRSS-A only (today's R1 up, S1 not down vs prev), excludes ABOVE LEVEL4", icon: TrendingUp },
  { id: "R1AbovePR4", label: getView("R1AbovePR4")?.label ?? "ABOVE LEVEL4", subtitle: "Today R1 above Prev R4", icon: TrendingUp },
  { id: "levelsbelow", label: getView("levelsbelow")?.label ?? "LEVEL BELOW", subtitle: "RRSS-B only (today's R1 not up, S1 down vs prev)", icon: TrendingUp },
  { id: "compressed", label: getView("compressed")?.label ?? "COMPRESSED", subtitle: "RRSS-C only (today's R1 down, S1 up vs prev)", icon: TrendingUp },
  { id: "expanded", label: getView("expanded")?.label ?? "EXPANDED", subtitle: "RRSS-E only (today's R1 up, S1 down vs prev)", icon: TrendingUp },
  { id: "S1BelowPS4", label: getView("S1BelowPS4")?.label ?? "BELOW LEVEL4", subtitle: "Today S1 below Prev S4", icon: TrendingDown },
  { id: "equal-cpr", label: getView("equal-cpr")?.label ?? "Equal CPR", subtitle: "Prev & Today CPR Equal", icon: Equal },
  { id: "touch", label: getView("touch")?.label ?? "TOUCH", subtitle: "Inside, Out, Overlap Above/Below...", icon: Activity },
  { id: "copyViews", label: "CREATED VIEWS", subtitle: "Auto-generated from Backtest's Copy View / Create View", icon: BookmarkCheck },
];

const NAVIGATION_CATEGORY_IDS = new Set(pivotcategories.map((category) => category.id));

function getNavigationCategoryId(definition: ViewDef): string | null {
  if (definition.navigationCategoryKey && NAVIGATION_CATEGORY_IDS.has(definition.navigationCategoryKey)) {
    return definition.navigationCategoryKey;
  }

  let current: ViewDef | undefined = definition;
  while (current) {
    if (NAVIGATION_CATEGORY_IDS.has(current.key)) return current.key;
    current = current.parentKey ? getView(current.parentKey) : undefined;
  }
  return null;
}

function buildSidebarViews(): Record<string, SidebarView[]> {
  const grouped: Record<string, SidebarView[]> = Object.fromEntries(
    pivotcategories.map((category) => [category.id, []]),
  );

  for (const view of VIEWS) {
    if (view.kind !== "view") continue;
    const categoryId = getNavigationCategoryId(view);
    if (!categoryId) continue;
    const isBullish = view.direction === "Up";
    const isBearish = view.direction === "Down";
    grouped[categoryId].push({
      id: view.key,
      label: view.label,
      ...(isBullish
        ? { activeColor: "#22c55e", activeText: "#4ade80", activeBg: "rgba(34, 197, 94, 0.14)" }
        : isBearish
          ? { activeColor: "#f87171", activeText: "#fca5a5", activeBg: "rgba(239, 68, 68, 0.14)" }
          : {}),
    });
  }
  return grouped;
}

/** Screener navigation entries derived from the canonical view registry. */
export const Views = buildSidebarViews();

/**
 * Single source of truth for every pattern id the Screener handles —
 * derived from the registry plus legacy Screener-only ids that aren't in it.
 */
export const LEGACY_SCREENER_PATTERN_IDS = [
  // sub-patterns whose passesPattern() case exists but aren't in the tree yet
  "la-allstepup",
  "eXHiU1L3",
  "LB-PU12CU23",
  "1LB-PL12CL23",
  "LBALLD-U2<PU1",
  "LAT-PU12CU23",
  "LBT-PU1>U1PL1>L1",
  "HA-U1>PU4",
  "HA55-HrL4U34-FAU4",
  "L1<pL4",
] as const;

export const SCREENER_PATTERN_IDS: ReadonlySet<string> = new Set<string>([
  ...VIEWS.map((view) => view.key),
  ...LEGACY_SCREENER_PATTERN_IDS,
]);

export type SidebarMode = "scanner" | "signals" | "stats" | "backtest" | "journal";

/**
 * Flat id → label lookup covering every registry definition and navigation
 * category.
 * Used by SignalDesk's chip strip (and anywhere else that needs a view's
 * display label from just its id, without walking the nested tree).
 */
export const VIEW_LABEL_BY_ID: Record<string, string> = {
  ...Object.fromEntries(VIEWS.map((view) => [view.key, view.label] as const)),
  ...Object.fromEntries(pivotcategories.map((category) => [category.id, category.label] as const)),
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

/** Returns the navigation category for a View or nested registry entry. */
function getParentId(patternId: string): string | null {
  if (NAVIGATION_CATEGORY_IDS.has(patternId)) return null;
  const definition = getView(patternId);
  if (!definition) return null;
  return getNavigationCategoryId(definition);
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
    if (!activeView) return null;
    const parent = getParentId(activeView);
    return parent ?? activeView;
  });

  // Keep tree in sync when activeView is changed from outside
  useEffect(() => {
    if (!activeView) {
      setExpandedId(null);
      return;
    }
    const parent = getParentId(activeView);
    if (parent) {
      setExpandedId(parent);
    } else if (pivotcategories.some((p) => p.id === activeView)) {
      setExpandedId(activeView);
    } else {
      setExpandedId(null);
    }
  }, [activeView]);

  // CHANGED: now applies in every mode, including the Live Screener —
  // mirrors Signal Desk's own Active Views strip (buildPills drops
  // zero-count entries the same way). This only affects this left-nav
  // tree; it's separate from the "VIEWS:" button row Screener.tsx renders
  // in its own main panel when a category is selected (see the pink
  // "VIEWS:" label there) — that row intentionally keeps showing every
  // View regardless of count, unaffected by this change.
  const showOnlyWithCounts = true;
  const visiblePivotCategories = showOnlyWithCounts
    ? pivotcategories.filter((pattern) => {
        const children = Views[pattern.id] ?? [];
        return !!counts?.[pattern.id] || children.some((c) => !!counts?.[c.id]);
      })
    : pivotcategories;
  function visibleChildren(patternId: string) {
    const children = Views[patternId] ?? [];
    return showOnlyWithCounts ? children.filter((c) => !!counts?.[c.id]) : children;
  }

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
          {visiblePivotCategories.map((pattern) => {
            const Icon = pattern.icon;
            const children = visibleChildren(pattern.id);
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
        {visiblePivotCategories.map((pattern) => {
          const Icon = pattern.icon;
          const children = visibleChildren(pattern.id);
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