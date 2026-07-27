import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Screener from "@/pages/Screener";
import BacktestPanel from "@/pages/BacktestPanel";
import PatternSidebar, { patterns, SCREENER_PATTERN_IDS, type SidebarMode } from "@/components/ui/PatternSidebar";
import { Menu } from "lucide-react";

const queryClient = new QueryClient();
const SIDEBAR_KEY = "cpr-sidebar-collapsed";
const MODE_KEY = "cpr-sidebar-mode";

function getSavedCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return false;
  }
}

function getSavedMode(): SidebarMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === "backtest" ? "backtest" : "scanner";
  } catch {
    return "scanner";
  }
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center h-full min-h-screen">
      <div className="text-center">
        <div className="text-lg font-semibold text-foreground mb-2">{label}</div>
        <div className="text-muted-foreground text-sm">Pattern coming soon</div>
      </div>
    </div>
  );
}

// Screener-handled pattern IDs now come from PatternSidebar (single source
// of truth — derived from its `patterns` + `subPatterns` tree, plus a small
// LEGACY_SCREENER_PATTERN_IDS list). Kept out of App.tsx to avoid drift.

function App() {
  const [activePattern, setActivePattern] = useState("littleabove");
  const [scanKey, setScanKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getSavedCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState<SidebarMode>(getSavedMode);
  // NEW: top-level pattern -> matching count, reported up by Screener,
  // passed down into PatternSidebar for the "(41)" labels.
  const [patternCounts, setPatternCounts] = useState<Record<string, number>>({});

  // Auto-scan on first page load
  useEffect(() => {
    setScanKey((k) => k + 1);
  }, []);

  const handleToggle = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  const handlePatternSelect = (id: string) => {
    setActivePattern(id);
  };

  const handleModeChange = (next: SidebarMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch { /* ignore */ }
  };

  const activeLabel =
    patterns.find((p) => p.id === activePattern)?.label ?? activePattern;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex min-h-screen bg-background">
          <PatternSidebar
            activePattern={activePattern}
            onSelect={handlePatternSelect}
            collapsed={sidebarCollapsed}
            onToggle={handleToggle}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
            mode={mode}
            onModeChange={handleModeChange}
            counts={patternCounts}
          />
          <main className="flex-1 overflow-auto min-w-0">
            <button
              className="md:hidden fixed top-3 left-3 z-30 flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
              style={{ background: "#161b22", border: "1px solid #1e2d3d", color: "#8ba3bc" }}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Screener stays mounted at all times — only visually hidden when
                not the active view — so switching modes/patterns never remounts
                it and never re-triggers the scanKey effect / loses scan state. */}
            <div style={{ display: mode === "backtest" ? "none" : "block" }}>
              {SCREENER_PATTERN_IDS.has(activePattern) ? (
                <Screener activePattern={activePattern} scanKey={scanKey} onCounts={setPatternCounts} />
              ) : (
                <ComingSoon label={activeLabel} />
              )}
            </div>

            {mode === "backtest" && (
              <div className="max-w-5xl mx-auto px-4 py-8">
                <BacktestPanel />
              </div>
            )}
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
