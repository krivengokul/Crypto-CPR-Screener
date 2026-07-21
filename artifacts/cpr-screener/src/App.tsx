import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Screener from "@/pages/Screener";
import BacktestPanel from "@/pages/BacktestPanel";
import PatternSidebar, { patterns, type SidebarMode } from "@/components/ui/PatternSidebar";
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

/**
 * All pattern IDs (parent + sub-pattern) that the Screener component handles.
 * Sub-pattern IDs correspond to passesPattern() cases in ScreenerUtils.tsx.
 */
const SCREENER_PATTERN_IDS = new Set([
  // ── Top-level patterns ──
  "littleabove",
  "littlebelow",
  "overlapping-higher",
  "overlapping-lower",
  "inside-cpr",
  "outside-cpr",
  "structure-bigabove",
  "structure-bigbelow",
  "equal-cpr",

  // ── Little ABOVE sub-patterns ──
  "la-2tiny",
  "la-allstepup",
  "1LHr-L4U3-U4",
  "LA-PL12CL23",
  "sT-cOL2U3-APU4",
  "eXHiU1L3",
  "T1-U4:6AM",
  "Ss-HiL4U4-FAU4:2AM",

  // ── Little BELOW sub-patterns ──
  "lb-micro2-apu4",
  "lb-allstepdown",
  "lb-cmprss-l4>3-u4<2",
  "lb-c-l34c4/u23c4",
  "lbE11-cOLoL3U2-PU4",
  "co2-l2u2",
  "LB-PU12CU23",
  "1LB-PL12CL23",
  "LBALLD-U2<PU1",

  // ── Overlap Above sub-patterns ──
  "eXHi-L4U4-U4",
  "LAT-PU12CU23",

  // ── Overlap Below sub-patterns ──
  "eXLo-L4U4-U4",
  "Exp-U3>U3",
  "OBN-LoL4U4-U4",
  "OBW-LoL4U4-L4",
  "LBT-PU1>U1PL1>L1",

  // ── CPR Inside sub-patterns ──
  "inside-cpr-expanded",
  "inside-cpr-narrow",
  "cO-U4L3",

  // ── CPR Outside sub-patterns ──
  "outside-cpr-compressed",
  "eXHrL3U3-AU4",

  // ── Big ABOVE sub-patterns ──
  "bigabove-pl34cl4-u3>pu4",
  "bacomp-l3>pl1/u3>pu1",
  "eXHi-L4U234-U4",
  "HA-U1>PU4",
  "HAThin-U1>PU4",
  "hR-HAL",
  "HA55-HrL4U34-FAU4",
  "1T-HiL4U4-FAU4",
  "1S-cOHi-FAU4:1AM",

  // ── U1>pU4 (standalone category) ──
  "u1-gt-pu4",

  // ── Big BELOW sub-patterns ──
  "bigbelow-pmini-pl3",
  "eX-U4L34",
  "eXLoL3U4-AU4",
  "L1<pL4",
  "eXU4L234-AU4",

  // ── L1<pL4 (standalone category) ──
  "l1-lt-pl4",

  // ── Equal CPR ──
  "equal-cpr",
  "eXLoL3U3-L3",
  "cOHiL3U3-pL4",

  // ── Legacy / previously visible left-nav patterns ──
  "lower-bullish",
  "Price-AbovePDH",
  "Price-BelowPDL",
  "HB-L1<PL1-PU12CU23",
  "HB-L1<PL4-U1>TCPR",
  "HB-L1<PL2-U12CPU12",
  "HB-L1>PL1-PU1CU234",
]);

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
