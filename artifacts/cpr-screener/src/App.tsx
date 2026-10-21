import { useState, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Screener from "@/pages/Screener";
import BacktestPanel from "@/pages/BacktestPanel";
import SignalDesk, { type SignalDeskSymbol, type FocusSymbol, buildPills, computeSignalLevels } from "@/pages/SignalDesk";
import type { CPRResultWithSource, ActiveTab } from "@/pages/ScreenerUtils";
import { passesPattern, getChartUrl, openChartInNewTab } from "@/pages/ScreenerUtils";
import {
  autoSaveQualifiedSignals,
  fetchSavedSignalsFromCloud,
  isSignalCompletedToday,
  SIGNALS_JOURNAL_UPDATED_EVENT,
} from "@/lib/signalTracker";
import { LiveEntryCrossMonitor, type EntryCrossCandidate } from "@/lib/liveEntryCrossMonitor";
import {
  playEntryCrossAlert,
  unlockAlertAudio,
} from "@/lib/alertSound";
import {
  postAlertWebhook,
  buildEntryCrossWebhookPayload,
} from "@/lib/alertWebhook";
import { sessionReachedTarget } from "@/lib/signalOutcome";
import { toast } from "@/hooks/use-toast";
import { BuildFooter } from "@/components/BuildFooter";
import PatternStats from "@/pages/PatternStats";
import SignalsJournal from "./pages/SignalsJournal";
import ViewsSidebar, { SCREENER_PATTERN_IDS, VIEW_LABEL_BY_ID, type SidebarMode } from "@/lib/ViewsSidebar";
import { getView } from "@/lib/views";
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
  const modeRef = useRef(mode);
  modeRef.current = mode;
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

  // Symbol SignalDesk should scroll to (toast click / deep-link query params).
  const [focusSymbol, setFocusSymbol] = useState<FocusSymbol | null>(null);

  // Deep-link from entry-cross toast: ?mode=signals&symbol=X&source=Y&patternId=Z
  // opens SignalDesk focused on that card (used when the toast opens a new tab).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get("mode");
      if (modeParam === "signals" || modeParam === "journal" || modeParam === "stats" || modeParam === "backtest" || modeParam === "scanner") {
        setMode(modeParam as SidebarMode);
        try { localStorage.setItem(MODE_KEY, modeParam); } catch { /* ignore */ }
      }
      const symbol = params.get("symbol");
      const source = params.get("source") as FocusSymbol["source"] | null;
      const patternId = params.get("patternId") || undefined;
      if (symbol && (source === "binance" || source === "delta" || source === "coindcx" || source === "nifty")) {
        setFocusSymbol({ symbol, source, patternId });
        if (patternId) setActiveSignal(patternId);
        if (!modeParam) {
          setMode("signals");
          try { localStorage.setItem(MODE_KEY, "signals"); } catch { /* ignore */ }
        }
      }
      // Clean the URL so a refresh doesn't re-apply the deep-link forever.
      if (modeParam || symbol) {
        const url = new URL(window.location.href);
        url.searchParams.delete("mode");
        url.searchParams.delete("symbol");
        url.searchParams.delete("source");
        url.searchParams.delete("patternId");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch { /* ignore */ }
  }, []);

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

  // Bumped whenever the Journal changes (local outcome updates, other tabs,
  // cloud sync) so the candidate list is rebuilt and PASS/FAIL setups drop out
  // immediately instead of waiting for the next scan.
  const [journalRevision, setJournalRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const bump = () => setJournalRevision((n) => n + 1);
    const syncCloud = () => {
      void fetchSavedSignalsFromCloud().then(() => {
        if (!cancelled) bump();
      });
    };
    syncCloud();
    const timer = window.setInterval(syncCloud, 60_000);
    window.addEventListener(SIGNALS_JOURNAL_UPDATED_EVENT, bump);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(SIGNALS_JOURNAL_UPDATED_EVENT, bump);
    };
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
      if (r.source === "coindcx" || r.source === "nifty") continue; // no live entry-cross for CoinDCX / mock NIFTY
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
    // Drop setups already PASS/FAIL/EXPIRED today, or whose target was
    // already hit this session — no more alerts or Journal writes for them.
    return candidates.filter((c) => {
      if (isSignalCompletedToday(
          c.symbol,
          c.direction,
          c.payload.patternName,
          c.source,
          c.payload.patternId,
        )) {
        return false;
      }
      const row = signalResults.find(
        (r) => r.source === c.source && r.symbol.toUpperCase() === c.symbol.toUpperCase(),
      );
      if (
        row &&
        sessionReachedTarget(
          c.direction,
          c.payload.target,
          row.todayHigh,
          row.todayLow,
          row.currentPrice,
        )
      ) {
        return false;
      }
      return true;
    });
  }, [signalResults, journalRevision]);

  const entryMonitorRef = useRef<LiveEntryCrossMonitor | null>(null);
  useEffect(() => {
    const monitor = new LiveEntryCrossMonitor((candidate, price, timestamp) => {
      // Re-check at fire time: Journal may have marked PASS/FAIL since the
      // candidate list was last built, or price may already have hit target.
      if (isSignalCompletedToday(
        candidate.symbol,
        candidate.direction,
        candidate.payload.patternName,
        candidate.source,
        candidate.payload.patternId,
      )) {
        return;
      }

      playEntryCrossAlert();

      const dir = candidate.direction === "Up" ? "LONG" : "SHORT";
      const px = Number.isFinite(price) ? price.toPrecision(6) : String(price);
      const entry = Number.isFinite(candidate.entry)
        ? candidate.entry.toPrecision(6)
        : String(candidate.entry);

      // Auto-focus the crossed symbol when already on Signal Desk or Screener.
      // Never switch modes (stay on Backtest / Journal / Stats if those are open).
      const focusAlertTarget = () => {
        const mode = modeRef.current;
        if (mode !== "signals" && mode !== "scanner") return;
        const patternId = candidate.payload.patternId || undefined;
        // Pin the left-nav View on Signal Desk *and* Screener so Card 3 of
        // ScreenerLegend (SelectedViewTradeCard) shows this View's entry /
        // target / stoploss. Screener also searches + scrolls the row.
        if (patternId) setActiveSignal(patternId);
        setFocusSymbol({
          symbol: candidate.symbol,
          source: candidate.source,
          patternId,
        });
      };

      const viewLabel = candidate.payload.patternName || "";
      const viewCode = candidate.payload.patternId || "";
      // Entry level name from View def (e.g. R1, TC); fall back to first segment of view code.
      const entryLevel =
        getView(viewCode)?.entryLabel ||
        (viewCode.includes("-") ? viewCode.split("-")[0] : "") ||
        "Entry";

      // Auto-focus as soon as the toast appears (no click required).
      focusAlertTarget();

      toast({
        title: "Entry crossed — alert",
        description: (
          <div className="space-y-0.5 text-sm leading-snug">
            <div>
              {candidate.symbol} ({candidate.source}) {dir}
            </div>
            <div>
              <span className="text-slate-400">Price:</span>{" "}
              <span className="font-mono text-slate-100">{px}</span>
              {"  "}
              crossed Entry:{" "}
              <span className="font-semibold text-amber-300">{entryLevel}</span>
              {" @ "}
              <span className="font-mono text-slate-100">{entry}</span>
            </div>
            <div>
              <span className="text-slate-400">View:</span>{" "}
              <span className="text-slate-100">{viewLabel || "—"}</span>
            </div>
            <div>
              <span className="text-slate-400">View code:</span>{" "}
              <span className="font-mono text-[11px] text-slate-200">{viewCode || "—"}</span>
            </div>
          </div>
        ),
        duration: 12_000,
        className: "cursor-pointer",
        // Body click → open TradingView chart for this symbol in a new tab
        // (same URL as the chart icon on Screener / SignalDesk rows).
        // Works from any page (scanner, signals, journal, etc.).
        // Ignore the X close control (and its icon).
        onClick: (e: ReactMouseEvent) => {
          const el = e.target as HTMLElement | null;
          if (el?.closest?.("[toast-close], [data-radix-toast-close]")) return;
          const url = getChartUrl(candidate.symbol, candidate.source);
          // Full navigation (about:blank → location) so TradingView finishes
          // loading the same way as pressing Enter in the address bar.
          openChartInNewTab(url);
        },
      });

      // Always pair toast with Telegram: prefer fetch (see alertWebhook.ts).
      // Surface a short follow-up toast if the Hook URL is missing or the
      // Worker/Telegram path fails, so a silent miss is visible in the UI.
      void (async () => {
        const ok = await postAlertWebhook(
          buildEntryCrossWebhookPayload({
            symbol: candidate.symbol,
            source: candidate.source,
            direction: candidate.direction,
            price,
            entry: candidate.entry,
            entryLevel,
            target: candidate.payload.target,
            stop: candidate.payload.sl,
            riskReward: candidate.payload.rr,
            viewLabel,
            viewCode,
            timestamp,
          }),
        );
        if (!ok) {
          toast({
            title: "Telegram alert failed",
            description: `${candidate.symbol}: check Hook URL / Cloudflare Worker (see console).`,
            duration: 8_000,
          });
        }
      })();

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
          {/* Column: scrollable pages + real footer at the bottom-right of this column */}
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <main className="min-w-0 flex-1 overflow-auto">
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
                    // Only pass when Screener is the visible page so it does
                    // not consume focusSymbol while SignalDesk is active.
                    focusSymbol={mode === "scanner" ? focusSymbol : null}
                    onFocusSymbolConsumed={() => setFocusSymbol(null)}
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
                  sourceFilter={
                    dataSource === "combined" || dataSource === "delta" || dataSource === "coindcx"
                      ? "binance"
                      : dataSource
                  }
                  onSourceFilterChange={(next) => setDataSource(next === "all" ? "combined" : next)}
                  focusSymbol={focusSymbol}
                  onFocusSymbolConsumed={() => setFocusSymbol(null)}
                />
              )}

              {mode === "stats" && <PatternStats />}

              {mode === "journal" && <SignalsJournal />}
            </main>
            <BuildFooter />
          </div>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
} 

export default App;
