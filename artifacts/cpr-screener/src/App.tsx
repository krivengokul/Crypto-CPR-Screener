import { useState, useEffect, useMemo, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Screener from "@/pages/Screener";
import BacktestPanel from "@/pages/BacktestPanel";
import SignalDesk, { type SignalDeskSymbol, buildPills, computeSignalLevels } from "@/pages/SignalDesk";
import type { CPRResultWithSource, ActiveTab } from "@/pages/ScreenerUtils";
import { passesPattern } from "@/pages/ScreenerUtils";
import { autoSaveQualifiedSignals } from "@/lib/signalTracker";
import { LiveEntryCrossMonitor, type EntryCrossCandidate } from "@/lib/liveEntryCrossMonitor";
import { playEntryCrossAlert, unlockAlertAudio } from "@/lib/alertSound";
import { toast } from "@/hooks/use-toast";
import PatternStats from "@/pages/PatternStats";
import SignalsJournal from "./pages/SignalsJournal";
import ViewsSidebar, { SCREENER_PATTERN_IDS, VIEW_LABEL_BY_ID, type SidebarMode } from "@/lib/ViewsSidebar";
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

// Screener-handled IDs come from the registry-backed ViewsSidebar export,
// plus a small list of legacy IDs not present in the registry.

function App() {
  // Empty string = no left-nav pattern selected. On first load / refresh we
  // want the screener to open on "Show All" (Binance tab, unfiltered
  // results) rather than pre-selecting a specific pattern like Little
  // Above. "" isn't a real pattern id, so ViewsSidebar won't highlight
  // any nav item, and the Screener render check below special-cases it to
  // still render the Screener (with its own showAll-defaults-true state)
  // instead of the ComingSoon placeholder.
  const [activeSignal, setActiveSignal] = useState("");
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
  // to build activeSignalSymbols. Without this, SignalDesk only ever gets
  // `symbols` (the lightweight card projection), activeSignalSymbols stays
  // permanently empty, and the real autoSaveQualifiedSignals() call never
  // fires even though the cards still render fine via the symbols-only
  // fallback path.
  const [signalResults, setSignalResults] = useState<CPRResultWithSource[]>([]);
  // NEW: single shared Binance/Delta/Combined source, now driving BOTH the
  // Live Screener's own tab AND Signal Desk's Binance/Delta/All toggle —
  // they used to be two independent pieces of state, which is why
  // switching sources in Signal Desk never updated the left-nav sidebar's
  // per-pattern counts (those come from Screener's onCounts, scoped to
  // whichever tab Screener itself had active). "combined" <-> "all" is
  // just a naming difference between the two components' own toggles —
  // mapped at the two call sites below, not renamed in either file.
  const [dataSource, setDataSource] = useState<ActiveTab>("binance");

  // Browsers require a user gesture before they allow audio playback. Unlock
  // once on the first interaction so later websocket crossings can alert.
  useEffect(() => {
    const unlock = () => {
      unlockAlertAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Auto-scan on first page load
  useEffect(() => {
    setScanKey((k) => k + 1);
  }, []);

  // Derive eligible setups from the scan, then use exchange trade streams to
  // catch their entry crossing. This prevents the next 15-second REST refresh
  // from being mislabeled as the time of entry.
  const entryCrossCandidates = useMemo(() => {
    if (signalResults.length === 0) return [] as EntryCrossCandidate[];
    const pills = buildPills(signalResults);
    const activeMap = new Map<string, CPRResultWithSource>();
    for (const v of pills) {
      for (const r of signalResults) {
        const key = `${r.source}:${r.symbol.toUpperCase()}`;
        if (!activeMap.has(key) && passesPattern(r, v.id)) activeMap.set(key, r);
      }
    }
    const candidates: EntryCrossCandidate[] = [];
    for (const [key, r] of activeMap) {
      if (r.source === "coindcx") continue;
      const levels = computeSignalLevels(r, pills);
      if (!levels || !Number.isFinite(levels.price) || !Number.isFinite(r.currentPrice)) continue;
      candidates.push({
        key,
        symbol: r.symbol,
        source: r.source,
        direction: levels.direction,
        entry: levels.price,
        initialPrice: r.currentPrice,
        payload: {
          symbol: r.symbol,
          source: r.source,
          timeframe: "Daily / 1D",
          direction: levels.direction,
          type: `${levels.patternLabel} Setup`,
          patternName: levels.patternLabel,
          patternId: levels.patternId,
          entry: levels.price,
          currentPrice: r.currentPrice,
          target: levels.targetPrice,
          sl: levels.stopPrice,
          rr: `1 : ${levels.rrRatio}`,
          cprStatus: `${levels.patternLabel} (Target ${levels.targetLevel})`,
          timestamp: 0,
          dateStr: "",
          status: "ACTIVE",
        },
      });
    }
    return candidates;
  }, [signalResults]);

  const entryMonitorRef = useRef<LiveEntryCrossMonitor | null>(null);
  useEffect(() => {
    const monitor = new LiveEntryCrossMonitor((candidate, price, timestamp) => {
      playEntryCrossAlert();

      // Light, global banner (Toaster lives at the App root, so it shows on
      // every screen) explaining why the beep fired.
      const dir = candidate.direction === "Up" ? "LONG" : "SHORT";
      const px = Number.isFinite(price) ? price.toPrecision(6) : String(price);
      const entry = Number.isFinite(candidate.entry)
        ? candidate.entry.toPrecision(6)
        : String(candidate.entry);
      toast({
        title: "Entry crossed — alert",
        description: `${candidate.symbol} (${candidate.source}) ${dir} · ${candidate.payload.patternName} · trade ${px} crossed entry ${entry}`,
        duration: 12_000, // ms; dismissible via X anytime
      });

      void autoSaveQualifiedSignals([{
        ...candidate.payload,
        currentPrice: price,
        timestamp,
        dateStr: new Date(timestamp).toLocaleString(),
        entryTimeSource: "exchange_trade" as const,
      }]);
    });
    entryMonitorRef.current = monitor;
    return () => {
      monitor.stop();
      entryMonitorRef.current = null;
    };
  }, []);

  useEffect(() => {
    entryMonitorRef.current?.update(entryCrossCandidates);
  }, [entryCrossCandidates]);

  const handleToggle = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  const handleSignalSelect = (id: string) => {
    setActiveSignal(id);
  };

  const handleModeChange = (next: SidebarMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch { /* ignore */ }
  };

  const activeSignalLabel = VIEW_LABEL_BY_ID[activeSignal] ?? activeSignal;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex min-h-screen bg-background">
          <ViewsSidebar
            activeSignal={activeSignal}
            onSelect={handleSignalSelect}
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
              {activeSignal === "" || SCREENER_PATTERN_IDS.has(activeSignal) ? (
                <Screener
                  activeSignal={activeSignal}
                  scanKey={scanKey}
                  onCounts={setPatternCounts}
                  onSignalSymbols={setSignalSymbols}
                  onResults={setSignalResults}
                  activeTab={dataSource}
                  onActiveTabChange={setDataSource}
                  onActiveSignalChange={setActiveSignal}
                />
              ) : (
                <ComingSoon label={activeSignalLabel} />
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
                activeSignal={activeSignal}
                activeSignalLabel={activeSignalLabel}
                counts={patternCounts}
                onSelectSignal={handleSignalSelect}
                onNavigateToScreener={(signalId) => {
                  setActiveSignal(signalId);
                  handleModeChange("scanner");
                }}
                sourceFilter={dataSource === "combined" ? "all" : dataSource}
                onSourceFilterChange={(next) => setDataSource(next === "all" ? "combined" : next)}
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
