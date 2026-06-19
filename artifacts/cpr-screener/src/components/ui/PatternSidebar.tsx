import { ChevronLeft, ChevronRight } from "lucide-react";

export interface Pattern {
  id: string;
  label: string;
}

export const patterns: Pattern[] = [
  { id: "rising", label: "CPR Rising" },
  { id: "falling", label: "CPR Falling" },
  { id: "higher-value", label: "Higher Value CPR" },
  { id: "lower-value", label: "Lower Value CPR" },
  { id: "overlapping-higher", label: "Overlapping Higher" },
  { id: "overlapping-lower", label: "Overlapping Lower" },
  { id: "inside-value", label: "Inside Value CPR" },
  { id: "outside-value", label: "Outside Value CPR" },
  { id: "structure-bullish", label: "Structure Bullish" },
  { id: "structure-bearish", label: "Structure Bearish" },
];

interface PatternSidebarProps {
  activePattern: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function PatternSidebar({
  activePattern,
  onSelect,
  collapsed,
  onToggle,
}: PatternSidebarProps) {
  return (
    <aside
      className={`relative shrink-0 min-h-screen border-r border-border bg-card flex flex-col transition-all duration-300 ${
        collapsed ? "w-12" : "w-56"
      }`}
    >
      <div className="h-12 flex items-center justify-between px-3 border-b border-border">
        {!collapsed && (
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Patterns
          </span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 py-2">
        {patterns.map((pattern) => {
          const isActive = activePattern === pattern.id;
          return (
            <button
              key={pattern.id}
              onClick={() => onSelect(pattern.id)}
              title={collapsed ? pattern.label : undefined}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                isActive
                  ? "bg-primary/10 text-primary font-semibold border-r-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <span
                className={`shrink-0 w-2 h-2 rounded-full border ${
                  isActive
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/40"
                }`}
              />
              {!collapsed && (
                <span className="truncate">{pattern.label}</span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
