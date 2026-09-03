import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Screener from "@/pages/Screener";
import BacktestPanel from "@/pages/BacktestPanel";
import SignalDesk, { type SignalDeskSymbol } from "@/pages/SignalDesk";
import type { CPRResultWithSource } from "@/pages/ScreenerUtils";
import PatternStats from "@/pages/PatternStats";
import SignalsJournal from "./pages/SignalsJournal";
import ViewsSidebar, { pivotcategories, SCREENER_PATTERN_IDS, type SidebarMode } from "@/lib/ViewsSidebar";
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
    return stored === "backtest"
      ? "backtest"
      : stored === "signals"
        ? "signals"
        : stored === "stats"
          ? "stats"
          : stored === "journal"
            ? "journal"
            : "scanner";
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

// Screener-handled pattern IDs now come from ViewsSidebar (single source
// of truth — derived from its `pivotcategories` + `Views` tree, plus a small
// LEGACY_SCREENER_PATTERN_IDS list). Kept out of App.tsx to avoid drift.

function App() {
  // Empty string = no left-nav pattern selected. On first load / refresh we
  // want the screener to open on "Show All" (Binance tab, unfiltered
  // results) rather than pre-selecting a specific pattern like Little
  // Above. "" isn't a real pattern id, so ViewsSidebar won't highlight
  // any nav item, and the Screener render check below special-cases it to
  // still render the Screener (with its own showAll-defaults-true state)
  // instead of the ComingSoon placeholder.
  const [activeView, setActiveView] = useState("");
  const [scanKey, setScanKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getSavedCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState<SidebarMode>(getSavedMode);
  // NEW: top-level pattern -> matching count, reported up by Screener,
  // passed down into ViewsSidebar for the "(41)" labels.
  const [patternCounts, setPatternCounts] = useState<Record<string, number>>({});
  const [signalSymbols, setSignalSymbols] = useState<SignalDeskSymbol[]>([]);
  // Full CPR rows (with tc/bc/pattern flags) for whatever Screener just
  // scanned — this is what SignalDesk's auto-save-to-Journal effect needs
  // to build activeViewSymbols. Without this, SignalDesk only ever gets
  // `symbols` (the lightweight card projection), activeViewSymbols stays
  // permanently empty, and the real autoSaveQualifiedSignals() call never
  // fires even though the cards still render fine via the symbols-only
  // fallback path.
  const [signalResults, setSignalResults] = useState<CPRResultWithSource[]>([]);

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
    setActiveView(id);
  };

  const handleModeChange = (next: SidebarMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch { /* ignore */ }
  };

  const activeLabel =
    pivotcategories.find((p) => p.id === activeView)?.label ?? activeView;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex min-h-screen bg-background">
          <ViewsSidebar
            activeView={activeView}
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
            <div style={{ display: mode === "scanner" ? "block" : "none" }}>
              {activeView === "" || SCREENER_PATTERN_IDS.has(activeView) ? (
                <Screener
                  activeView={activeView}
                  scanKey={scanKey}
                  onCounts={setPatternCounts}
                  onSignalSymbols={setSignalSymbols}
                  onResults={setSignalResults}
                />
              ) : (
                <ComingSoon label={activeLabel} />
              )}
            </div>

            {mode === "backtest" && (
              <div className="w-full px-1 py-8 sm:px-2">
                <BacktestPanel />
              </div>
            )}

            {mode === "signals" && (
              <SignalDesk
                symbols={signalSymbols}
                results={signalResults}
                activeView={activeView}
                activeLabel={activeLabel}
                counts={patternCounts}
                onSelectPattern={handlePatternSelect}
              />
            )}

            {mode === "stats" && <PatternStats />}

            {mode === "journal" && <SignalsJournal />}
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
} 

export default App;