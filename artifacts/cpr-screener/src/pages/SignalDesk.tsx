import { useState, useMemo, useEffect, useRef } from "react";
import {
  CPRResultWithSource,
  fmt,
  fmtPct,
  passesPattern,
  getChartUrl,
  hasKnownChartMapping,
} from "./ScreenerUtils";
import { autoSaveQualifiedSignals } from "@/lib/signalTracker";
import { Views } from "@/lib/ViewsSidebar";
import { BACKTEST_TARGETS } from "@/lib/backtest";
import SignalProgressBar from "@/lib/SignalProgressBar";
import {
  Radio,
  TrendingUp,
  TrendingDown,
  Search,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Target,
  Cloud,
  X,
  ExternalLink,
} from "lucide-react";

// Lightweight projection of a matching row that Screener hands up via
// onSignalSymbols — this is the post-filter `displayed` pool (already
// scoped to whatever left-nav pattern/Views is active), not the full
// CPRResultWithSource. It intentionally does NOT carry tc/bc or the
// SSRR/HHLL pattern-category flags, so SignalDesk no longer re-derives
// "which pattern matched" itself — it trusts Screener's activeView/
// activeLabel for that and just projects each symbol into a card.
export interface SignalDeskSymbol {
  key: string;
  symbol: string;
  source: "binance" | "delta";
  currentPrice: number;
  change24h?: number;
  direction: "up" | "down";
  s4: number;
  s3?: number;
  s2: number;
  s1: number;
  pivot: number;
  r1: number;
  r2: number;
  r3?: number;
  r4: number;
}

interface SignalDeskProps {
  symbols?: SignalDeskSymbol[];
  results?: CPRResultWithSource[];
  activeView?: string;
  activeLabel?: string;
  counts?: Record<string, number>;
  onSelectPattern?: (patternId: string) => void;
}

export interface SignalItem {
  id: string;
  symbol: string;
  source: "binance" | "delta";
  timeframe: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  type: string;
  patternName: string;
  // NEW: the canonical View id (matches ViewsSidebar's sub.id / a
  // BACKTEST_TARGETS key) — distinct from patternName, which is the
  // human-readable display label and can differ from the id (e.g.
  // "A-A-AA-AA-S1pPDH-U3" displays as "A-A-AA-AA · S1>pPDH(U3)"). Anything
  // that needs to re-select this View in the left nav / filter pool must
  // use patternId, never patternName — passing the label instead of the id
  // is exactly what broke the left-nav highlight and card filtering before.
  patternId: string;
  triggerPrice: number;
  currentPrice: number;
  targetPrice: number;
  stopPrice: number;
  targetLevel: string;
  riskReward: string;
  cprStatus: string;
  pivot: number;
  r1: number;
  s1: number;
  r2: number;
  s2: number;
  r3?: number;
  s3?: number;
  r4: number;
  s4: number;
  change24h?: number;
  timestamp: string;
  isSaved: boolean;
}

// Entry/target/stop for a single CPR result row — sourced ENTIRELY from
// backtest.ts's own BACKTEST_TARGETS (the exact same lookup runBacktest /
// pivotLevelBacktestSymbolOnDate use: `BACKTEST_TARGETS.find(t => t.key ===
// <View id>)`), never invented here. Returns null when the row's matched
// View has no BACKTEST_TARGETS entry — such a symbol has no defined target
// to trade or save against, full stop, rather than falling back to guessed
// R/S thresholds.
//   • target is an S-level (bearish)  → entry = today's TC, stop = today's R1
//   • target is an R-level (bullish)  → entry = today's BC, stop = today's S1
function computeSignalLevels(
  r: CPRResultWithSource,
  viewPills: { id: string; label: string }[],
  preferredViewId?: string
) {
  const primaryView = preferredViewId
    ? viewPills.find((v) => v.id === preferredViewId)
    : viewPills.find((v) => passesPattern(r, v.id));
  if (!primaryView) return null;

  const targetDef = BACKTEST_TARGETS.find((t) => t.key === primaryView.id);
  if (!targetDef) return null;

  const isBullish = targetDef.direction === "bullish"; // bullish == R-family target
  const direction: "LONG" | "SHORT" = isBullish ? "LONG" : "SHORT";
  const price = isBullish ? r.todayCPR.bc : r.todayCPR.tc; // entry
  const stopPrice = isBullish ? r.todayCPR.s1 : r.todayCPR.r1;
  const targetPrice = targetDef.getTarget(r);
  const targetLevel = targetDef.targetLabel;
  const patternLabel = primaryView.label;
  const patternId = primaryView.id;

  const risk = Math.max(0.0000001, Math.abs(price - stopPrice));
  const reward = Math.abs(targetPrice - price);
  const rrRatio = (reward / risk).toFixed(1);

  return { patternLabel, patternId, price, direction, targetPrice, stopPrice, targetLevel, rrRatio };
}

export default function SignalDesk({
  symbols,
  results,
  activeView,
  activeLabel,
  counts,
  onSelectPattern,
}: SignalDeskProps) {
  const [searchTerm, setSearchTerm] = useState("");
  // Default to Binance (not "All") — mirrors the Live Screener and Backtest
  // panel, which both open on Binance by default.
  const [sourceFilter, setSourceFilter] = useState<"all" | "binance" | "delta">("binance");
  const [directionFilter, setDirectionFilter] = useState<"all" | "LONG" | "SHORT">("all");
  const [selectedViewPattern, setSelectedViewPattern] = useState<string>(activeView || "");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync if activeView changes externally
  useEffect(() => {
    if (activeView !== undefined) {
      setSelectedViewPattern(activeView);
    }
  }, [activeView]);

  // Single source of truth for turning a pool of CPRResultWithSource rows
  // into `{id, label, count}` pills — every id/label in the tree, counted
  // against whichever pool is passed in, zero-count ids dropped, sorted
  // descending. Both pill lists below call this same function so there's
  // exactly one place that defines "how a pool becomes pills" — no risk of
  // the two lists' id/label enumeration drifting apart from each other.
  //
  // NOTE: this deliberately ignores the `counts` prop. `counts` is
  // populated by the Live Screener's own onCounts effect, scoped to
  // whichever tab (Binance/Delta/Combined) is active THERE — that's a
  // different toggle than Signal Desk's own sourceFilter, and trusting it
  // here is exactly what caused the Active Views strip to silently follow
  // the wrong tab. Now that `results` (the full combined pool) is always
  // available via the onResults wiring, there's no reason to prefer a
  // second, externally-scoped source of the same numbers.
  const buildPills = (pool: CPRResultWithSource[]) => {
    const pillMap = new Map<string, { id: string; label: string }>();
    for (const subList of Object.values(Views)) {
      for (const sub of subList) {
        if (!pillMap.has(sub.id)) {
          pillMap.set(sub.id, { id: sub.id, label: sub.label || sub.id });
        }
      }
    }
    const list: { id: string; label: string; count: number }[] = [];
    for (const [id, item] of pillMap.entries()) {
      const count = pool.filter((r) => passesPattern(r, id)).length;
      if (count > 0) list.push({ id, label: item.label, count });
    }
    return list.sort((a, b) => b.count - a.count);
  };

  // Comprehensive pill set — ALWAYS both exchanges, independent of
  // sourceFilter. Feeds activeViewSymbols, computeSignalLevels, and the
  // auto-save-to-Journal effect below, all of which must stay complete
  // regardless of which source tab happens to be on screen right now.
  const viewPills = useMemo(() => buildPills(results ?? []), [results]);

  // Source-scoped pill set — same function, filtered pool. Display only:
  // this is what the "Active Views" strip actually renders, so it's the
  // one that responds to the Binance/Delta/All toggle.
  const displayViewPills = useMemo(() => {
    if (sourceFilter === "all") return viewPills;
    return buildPills((results ?? []).filter((r) => r.source === sourceFilter));
  }, [results, sourceFilter, viewPills]);

  // ─────────────────────────────────────────────────────────────────────
  // SOURCE OF TRUTH for "does this symbol belong to an Active View" — the
  // Journal save-list must be built from THIS, not from SignalDesk's own
  // card-rendering branches below. It mirrors effectiveCounts exactly:
  // for each sidebar pill (a View with count > 0), the same passesPattern()
  // check ScreenerUtils/ViewsSidebar use to produce that pill's count.
  // Deliberately independent of selectedViewPattern/activeView — a symbol
  // is eligible whenever it belongs to ANY Active View, regardless of
  // which single View SignalDesk happens to be displaying right now.
  const activeViewSymbols = useMemo(() => {
    const map = new Map<string, CPRResultWithSource>();
    if (!results || results.length === 0 || viewPills.length === 0) return map;
    for (const v of viewPills) {
      for (const r of results) {
        if (map.has(r.symbol)) continue;
        if (passesPattern(r, v.id)) {
          map.set(r.symbol, r);
        }
      }
    }
    return map;
  }, [results, viewPills]);

  // symbol -> its full CPRResultWithSource row, for filtering the
  // lightweight `symbols` prop against a specific selected View. Kept
  // separate from activeViewSymbols (which only tells you a symbol
  // belongs to SOME Active View, not which one).
  const resultsBySymbol = useMemo(() => {
    const map = new Map<string, CPRResultWithSource>();
    if (!results) return map;
    for (const r of results) {
      if (!map.has(r.symbol)) map.set(r.symbol, r);
    }
    return map;
  }, [results]);

  // Generate live signal cards
  const signals = useMemo<SignalItem[]>(() => {
    // If external symbols were passed explicitly, map them
    if (symbols && symbols.length > 0) {
      // Prefer the canonical activeViewSymbols set (built straight from
      // ScreenerUtils' passesPattern — see above) whenever `results` is
      // available. It's only when this component gets JUST the lightweight
      // `symbols` projection (no CPRResult tc/bc/pattern-category fields to
      // run passesPattern against) that we fall back to trusting the
      // currently-selected View is itself a qualifying Active View.
      const currentViewId = selectedViewPattern || activeView || "";
      const isCurrentViewActive = viewPills.some((p) => p.id === currentViewId);
      const label = selectedViewPattern
        ? viewPills.find((p) => p.id === selectedViewPattern)?.label ?? selectedViewPattern
        : activeLabel || "Active View";

      // Filter down to symbols whose full CPR row (from `results`, when the
      // parent also provides it) actually passes the selected View's own
      // passesPattern() condition — same check the sidebar pill counts and
      // activeViewSymbols use. IMPORTANT: only apply this when we actually
      // have CPR rows to check against (`results` populated). When the
      // parent supplies ONLY the lightweight `symbols` projection (no
      // `results`), there's nothing to test locally — per this file's own
      // doc comment, `symbols` is already the parent's pre-filtered,
      // active-View-scoped pool (see handlePillClick's onSelectPattern call
      // above, which is what actually re-scopes it), so trust it as-is
      // instead of filtering everything down to zero.
      const filteredSymbols =
        selectedViewPattern && resultsBySymbol.size > 0
          ? symbols.filter((sym) => {
              const row = resultsBySymbol.get(sym.symbol);
              return row ? passesPattern(row, selectedViewPattern) : false;
            })
          : symbols;

      return filteredSymbols.map((sym) => {
        const matchedRow = activeViewSymbols.get(sym.symbol);
        const levels = matchedRow ? computeSignalLevels(matchedRow, viewPills) : null;
        const isEligible = activeViewSymbols.size > 0 ? levels !== null : isCurrentViewActive;

        // When this symbol has a real backtest-defined target (levels !==
        // null), entry/target/stop come straight from BACKTEST_TARGETS —
        // same rule as everywhere else in this file. Otherwise (no
        // `results` to match against, or its View has no BACKTEST_TARGETS
        // entry) fall back to a simple display-only approximation; this
        // fallback is NEVER what gets saved to the Journal.
        const direction: "LONG" | "SHORT" = levels ? levels.direction : (sym.direction === "up" ? "LONG" : "SHORT");
        const price = levels ? levels.price : sym.currentPrice;
        const { pivot, r1, r2, s1, s2, r3, s3, r4, s4 } = sym;

        let targetPrice: number;
        let stopPrice: number;
        let targetLevel: string;

        if (levels) {
          targetPrice = levels.targetPrice;
          stopPrice = levels.stopPrice;
          targetLevel = levels.targetLevel;
        } else if (direction === "LONG") {
          if (sym.currentPrice >= r1) {
            targetPrice = r2;
            targetLevel = "R2";
          } else {
            targetPrice = r1;
            targetLevel = "R1";
          }
          stopPrice = s1;
        } else {
          if (sym.currentPrice <= s1) {
            targetPrice = s2;
            targetLevel = "S2";
          } else {
            targetPrice = s1;
            targetLevel = "S1";
          }
          stopPrice = r1;
        }

        const rrRatio = levels
          ? levels.rrRatio
          : (Math.abs(targetPrice - price) / Math.max(0.0000001, Math.abs(price - stopPrice))).toFixed(1);

        const patternLabel = levels ? levels.patternLabel : label;
        // Fall back to the actual selected/active View id (never a label)
        // so "View in Screener" always re-selects something ViewsSidebar
        // can match against sub.id.
        const patternId = levels ? levels.patternId : (selectedViewPattern || activeView || "");

        return {
          id: sym.key,
          symbol: sym.symbol,
          source: sym.source,
          timeframe: "Daily / 1D",
          direction,
          type: `${patternLabel} Setup`,
          patternName: patternLabel,
          patternId,
          triggerPrice: price,
          // Always the live-refreshed price, never the static BC/TC entry
          // level `price` resolves to when `levels` is set — see
          // computeSignalLevels' doc comment. Using `price` here froze the
          // header price and SignalProgressBar needle for any symbol whose
          // View has a BACKTEST_TARGETS entry, since todayCPR.bc/tc never
          // change between live-refresh ticks.
          currentPrice: sym.currentPrice,
          change24h: sym.change24h,
          targetPrice,
          stopPrice,
          targetLevel,
          riskReward: `1 : ${rrRatio}`,
          cprStatus: isEligible
            ? `${patternLabel} (Target ${targetLevel})`
            : direction === "LONG" ? "Above CPR Pivot" : "Below CPR Pivot",
          pivot,
          r1,
          s1,
          r2,
          s2,
          r3,
          s3,
          r4,
          s4,
          timestamp: "Active",
          isSaved: isEligible,
        };
      });
    }

    if (!results || results.length === 0) return [];

    let pool = results;
    if (selectedViewPattern) {
      pool = results.filter((r) => passesPattern(r, selectedViewPattern));
    }

    // Eligibility now comes purely from activeViewSymbols (the canonical
    // passesPattern-against-every-Active-View set computed above) — not
    // from whichever single View this branch's `pool` happens to be scoped
    // to display right now. A symbol belonging to Active View #7 must still
    // show the Saved badge and reach the Journal even while the user is
    // browsing Active View #3.
    const list: SignalItem[] = [];

    for (const r of pool) {
      const levels = computeSignalLevels(r, viewPills, selectedViewPattern || undefined);
      const isActiveViewSymbol = activeViewSymbols.has(r.symbol) && levels !== null;

      const pivot = r.todayCPR.pivot;
      const { r1, r2, r3, r4, s1, s2, s3, s4 } = r.todayCPR;

      // When this row has a real backtest-defined target (levels !== null),
      // entry/target/stop come straight from BACKTEST_TARGETS. Otherwise
      // (not in an Active View, or its View has no BACKTEST_TARGETS entry)
      // fall back to a simple display-only approximation so the card still
      // has something to show; this fallback is NEVER what gets saved.
      const fallbackPrice = r.currentPrice || pivot;
      const fallbackDirection: "LONG" | "SHORT" = fallbackPrice < pivot ? "SHORT" : "LONG";

      const patternLabel = levels?.patternLabel ?? "Standard CPR";
      // Same rule as branch A above: never fall back to a display label
      // for the id that "View in Screener" hands back to the left nav.
      const patternId = levels?.patternId ?? (selectedViewPattern || "");
      const direction: "LONG" | "SHORT" = levels ? levels.direction : fallbackDirection;
      const price = levels ? levels.price : fallbackPrice;
      const targetPrice = levels ? levels.targetPrice : (direction === "LONG" ? r1 : s1);
      const stopPrice = levels ? levels.stopPrice : (direction === "LONG" ? s1 : r1);
      const targetLevel = levels ? levels.targetLevel : (direction === "LONG" ? "R1" : "S1");
      const rrRatio = levels
        ? levels.rrRatio
        : (Math.abs(targetPrice - price) / Math.max(0.0000001, Math.abs(price - stopPrice))).toFixed(1);

      list.push({
        id: `${r.source}-${r.symbol}-${selectedViewPattern || patternLabel}`,
        symbol: r.symbol,
        source: r.source,
        timeframe: "Daily / 1D",
        direction,
        type: `${patternLabel} Setup`,
        patternName: patternLabel,
        patternId,
        triggerPrice: price,
        // Same fix as the `symbols` branch above: keep the live-refreshed
        // r.currentPrice for display, don't collapse it into the static
        // BC/TC entry level that `price` resolves to when `levels` is set.
        currentPrice: r.currentPrice,
        change24h: r.change24h,
        targetPrice,
        stopPrice,
        targetLevel,
        riskReward: `1 : ${rrRatio}`,
        cprStatus: isActiveViewSymbol ? `${patternLabel} (Target ${targetLevel})` : "General CPR Setup",
        pivot,
        r1,
        s1,
        r2,
        s2,
        r3,
        s3,
        r4,
        s4,
        timestamp: "Active",
        isSaved: isActiveViewSymbol,
      });
    }

    return list;
  }, [symbols, results, viewPills, activeViewSymbols, resultsBySymbol, selectedViewPattern, activeView, activeLabel]);

  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
      if (directionFilter !== "all" && s.direction !== directionFilter) return false;
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        return (
          s.symbol.toLowerCase().includes(query) ||
          s.patternName.toLowerCase().includes(query) ||
          s.type.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [signals, sourceFilter, directionFilter, searchTerm]);

  // Header stats are scoped to symbols that actually belong to an Active
  // View (item.isSaved — despite the name, this flags Active View
  // membership, the same eligibility check the auto-save effect uses) —
  // NOT the full scanned/displayed symbol universe. Previously this counted
  // every card in filteredSignals regardless of whether it matched any
  // Active View, which is why "Signals" showed the full scan size (e.g.
  // 516) instead of the actual Active View total (e.g. ~114).
  const stats = useMemo(() => {
    const activeViewOnly = filteredSignals.filter((s) => s.isSaved);
    const total = activeViewOnly.length;
    const saved = activeViewOnly.length;
    const longs = activeViewOnly.filter((s) => s.direction === "LONG").length;
    const shorts = activeViewOnly.filter((s) => s.direction === "SHORT").length;
    const watch = activeViewOnly.filter((s) => s.direction === "NEUTRAL").length;
    return { total, saved, longs, shorts, watch };
  }, [filteredSignals]);

  // Automatically save ONLY qualified signals from Active Views directly to the Journal.
  // Candidates now come straight from activeViewSymbols — the same
  // passesPattern()-against-every-pill computation buildPills() above uses
  // to produce the sidebar's View counts — NOT from
  // SignalDesk's own rendered `signals` card list. That keeps Journal
  // membership tied exactly to "which symbols select into Active Views",
  // regardless of which single View happens to be on screen, which pool
  // branch rendered the cards, or how the cards' own labels are derived. Tracks which symbols were already submitted TODAY so re-renders
  // triggered by price ticks or switching between Active Views don't keep
  // re-submitting the same symbols over and over — the Journal enforces one
  // row per symbol/day, but there's no reason to spam it with redundant
  // writes on every tick either.
  const submittedTodayRef = useRef<{ day: string; symbols: Set<string> }>({
    day: "",
    symbols: new Set(),
  });

  useEffect(() => {
    if (activeViewSymbols.size === 0) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    if (submittedTodayRef.current.day !== todayKey) {
      // New day — reset the in-memory "already submitted" tracker.
      submittedTodayRef.current = { day: todayKey, symbols: new Set() };
    }

    const alreadySubmitted = submittedTodayRef.current.symbols;
    const newlySubmitted: string[] = [];
    const candidateSignals: Array<{
      symbol: string;
      source: "binance" | "delta";
      timeframe: string;
      direction: "LONG" | "SHORT" | "NEUTRAL";
      type: string;
      patternName: string;
      entry: number;
      currentPrice: number;
      target: number;
      sl: number;
      rr: string;
      cprStatus: string;
      timestamp: number;
      dateStr: string;
      status: "ACTIVE";
    }> = [];

    for (const [symbol, r] of activeViewSymbols.entries()) {
      const key = symbol.toUpperCase();
      if (alreadySubmitted.has(key)) continue;

      const levels = computeSignalLevels(r, viewPills);
      if (!levels) continue; // no backtest-defined target for this symbol's View — nothing to save

      newlySubmitted.push(key);
      candidateSignals.push({
        symbol: r.symbol,
        source: r.source,
        timeframe: "Daily / 1D",
        direction: levels.direction,
        type: `${levels.patternLabel} Setup`,
        patternName: levels.patternLabel,
        entry: levels.price,
        currentPrice: levels.price,
        target: levels.targetPrice,
        sl: levels.stopPrice,
        rr: `1 : ${levels.rrRatio}`,
        cprStatus: `${levels.patternLabel} (Target ${levels.targetLevel})`,
        timestamp: Date.now(),
        dateStr: new Date().toLocaleString(),
        status: "ACTIVE",
      });
    }

    if (candidateSignals.length === 0) return;

    autoSaveQualifiedSignals(candidateSignals).then(() => {
      for (const key of newlySubmitted) {
        alreadySubmitted.add(key);
      }
    });
  }, [activeViewSymbols, viewPills]);

  const handleCopy = (item: SignalItem) => {
    const text = `[PIVOT SIGNAL: ${item.symbol}] (${item.direction})
Pattern: ${item.patternName} (${item.type})
Source: ${item.source.toUpperCase()}
Entry / Trigger: ${fmt(item.triggerPrice)}
Target Level: ${fmt(item.targetPrice)}
Stop Level: ${fmt(item.stopPrice)}
R:R: ${item.riskReward}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePillClick = (pillId: string) => {
    const next = selectedViewPattern === pillId ? "" : pillId;
    setSelectedViewPattern(next);
    // Tell the parent (same callback ViewsSidebar's onSelect wires up to) so
    // it can re-scope/re-fetch its own filtered pool and hand a freshly
    // pre-filtered `symbols` array back down — this is the actual filtering
    // step per this file's own "already scoped to whatever left-nav
    // pattern/Views is active" contract at the top of the file. Without this
    // call, the parent never learns the View changed and keeps sending the
    // exact same `symbols` it always was.
    onSelectPattern?.(next);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080d15] text-slate-100 overflow-hidden">
      {/* Top Banner Header */}
      <div className="p-4 border-b border-[#1e2d3d] bg-[#0c131f] flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                SIGNAL DESK
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live Scanner Feeds
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Actionable pivot breakout triggers, CPR trend directions, and automated risk/reward setups
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Counter Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-[#131b26] border border-[#1e2d3d] rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-emerald-400">
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium text-slate-300">
              Auto-Saved to Journal: <strong className="text-emerald-400 font-mono font-bold">{stats.saved}</strong>
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="bg-[#131b26] border border-[#1e2d3d] rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">Signals:</span>
            <span className="text-sm font-bold text-white font-mono">{stats.total}</span>
          </div>
          <div className="bg-[#131b26] border border-emerald-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-emerald-400 font-medium">Long:</span>
            <span className="text-sm font-bold text-emerald-400 font-mono">{stats.longs}</span>
          </div>
          <div className="bg-[#131b26] border border-rose-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[11px] text-rose-400 font-medium">Short:</span>
            <span className="text-sm font-bold text-rose-400 font-mono">{stats.shorts}</span>
          </div>
        </div>
      </div>

      {/* Available Views with Counts Strip (Wrapping chips from sidebar with count > 0) */}
      {displayViewPills.length > 0 && (
        <div className="px-4 py-2.5 border-b border-[#1a2736] bg-[#09101a] shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Active Views ({displayViewPills.length})
              </span>
              {selectedViewPattern && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  {selectedViewPattern}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 italic hidden sm:block">
              Select a different filter in the sidebar to refresh this list.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center max-h-36 overflow-y-auto">
            {displayViewPills.map((pill) => {
              const isSelected = selectedViewPattern === pill.id;

              return (
                <button
                  key={pill.id}
                  onClick={() => handlePillClick(pill.id)}
                  title={`Filter by ${pill.label} (${pill.count} pairs)`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all select-none cursor-pointer ${
                    isSelected
                      ? "bg-[#062c2c] border border-teal-500/80 text-teal-200 shadow-sm shadow-teal-900/60 ring-1 ring-teal-500/40"
                      : "bg-[#111927] hover:bg-[#182335] border border-[#1e2d3f] text-slate-300 hover:text-white"
                  }`}
                >
                  <span className="truncate max-w-[260px] sm:max-w-none">{pill.label}</span>
                  <span
                    className={`px-1.5 py-0.2 font-mono text-[10px] rounded-full font-bold ${
                      isSelected
                        ? "bg-teal-500/30 text-teal-200 border border-teal-500/40"
                        : "bg-[#182333] text-slate-400 border border-[#223347]"
                    }`}
                  >
                    {pill.count}
                  </span>
                </button>
              );
            })}

            {selectedViewPattern && (
              <button
                onClick={() => {
                  setSelectedViewPattern("");
                  onSelectPattern?.("");
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 transition cursor-pointer"
                title="Clear selected pattern filter"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar (Left aligned like Journal) */}
      <div className="px-4 py-2 border-b border-[#1b263b] bg-[#0d1422] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search symbol, setup..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#151e2c] border border-[#22354a] rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {/* Direction Filter */}
          <div className="flex rounded-md overflow-hidden border border-[#22354a] bg-[#151e2c]">
            <button
              onClick={() => setDirectionFilter("all")}
              className={`px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                directionFilter === "all" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setDirectionFilter("LONG")}
              className={`px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                directionFilter === "LONG" ? "bg-emerald-600 text-white" : "text-emerald-400 hover:text-emerald-300"
              }`}
            >
              Long
            </button>
            <button
              onClick={() => setDirectionFilter("SHORT")}
              className={`px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                directionFilter === "SHORT" ? "bg-rose-600 text-white" : "text-rose-400 hover:text-rose-300"
              }`}
            >
              Short
            </button>
          </div>

          {/* Source Filter */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSourceFilter("all")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                sourceFilter === "all"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSourceFilter("binance")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                sourceFilter === "binance"
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                  : "text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
            >
              Binance
            </button>
            <button
              onClick={() => setSourceFilter("delta")}
              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                sourceFilter === "delta"
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "text-slate-400 hover:text-white bg-[#151e2c]"
              }`}
            >
              Delta
            </button>
          </div>
        </div>
      </div>

      {/* Signals Grid / Table List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredSignals.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 border border-dashed border-[#1e2d3d] rounded-xl">
            <ShieldAlert className="w-10 h-10 text-slate-600 mb-2" />
            <p className="text-sm font-medium">No active signals found matching current filters</p>
            <p className="text-xs text-slate-500 mt-1">Try clearing filters or switching source exchanges</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredSignals.map((item) => {
              const isLong = item.direction === "LONG";
              const isShort = item.direction === "SHORT";

              return (
                <div
                  key={item.id}
                  className="bg-[#0f1724] border border-[#1e2d3d] hover:border-slate-600 rounded-xl p-4 transition-all flex flex-col justify-between shadow-lg"
                >
                  {/* Card Top */}
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      {/* Left: Symbol & Exchange + Live Price & 24h % change */}
                      <div className="flex items-start gap-4 sm:gap-6">
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-base sm:text-lg font-extrabold text-white font-mono tracking-tight leading-tight">
                              {item.symbol}
                            </span>
                            {hasKnownChartMapping(item.symbol, item.source) ? (
                              <a
                                href={getChartUrl(item.symbol, item.source)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                                title="Open on TradingView"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span
                                className="text-muted-foreground/30 cursor-not-allowed inline-flex shrink-0"
                                title="Not available on TradingView"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-400 font-mono uppercase tracking-wider mt-0.5">
                            {item.source}
                          </div>
                        </div>

                        <div className="flex flex-col items-end">
                          <div className="text-sm sm:text-base font-bold text-white font-mono leading-tight">
                            {fmt(item.currentPrice).replace(/,/g, "")}
                          </div>
                          <div
                            className={`text-xs font-mono font-bold leading-tight mt-0.5 text-right ${
                              (item.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {fmtPct(item.change24h ?? 0)}
                          </div>
                        </div>
                      </div>

                      {/* Direction Badge on the right */}
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1 font-mono shrink-0 ${
                          isLong
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : isShort
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                            : "bg-slate-500/20 text-slate-300 border border-slate-500/40"
                        }`}
                      >
                        {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : isShort ? <ArrowDownRight className="w-3.5 h-3.5" /> : null}
                        {item.direction}
                      </span>
                    </div>

                    {/* S4-PIVOT (Red family) & PIVOT-R4 (Green family) Live Price Progress Bar */}
                    <SignalProgressBar
                      price={item.currentPrice}
                      pivot={item.pivot}
                      s1={item.s1}
                      s2={item.s2}
                      s3={item.s3}
                      s4={item.s4}
                      r1={item.r1}
                      r2={item.r2}
                      r3={item.r3}
                      r4={item.r4}
                    />

                    {/* Pricing Level Metrics */}
                    <div className="grid grid-cols-3 gap-2 bg-[#090f19] border border-[#1b2636] rounded-lg p-2.5 mb-3 font-mono">
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">Trigger / Entry</div>
                        <div className="text-xs font-bold text-white mt-0.5">{fmt(item.triggerPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-emerald-400 font-sans flex items-center gap-0.5">
                          <Target className="w-2.5 h-2.5" /> Target
                        </div>
                        <div className="text-xs font-bold text-emerald-400 mt-0.5">{fmt(item.targetPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-rose-400 font-sans">Stop Loss</div>
                        <div className="text-xs font-bold text-rose-400 mt-0.5">{fmt(item.stopPrice)}</div>
                      </div>
                    </div>

                    {/* View and Target Details */}
                    <div className="text-[11px] text-slate-400 mb-3 px-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span>View:</span>
                          <strong className="text-slate-200 font-semibold">{selectedViewPattern || item.patternName}</strong>
                        </div>
                        <span className="font-mono text-slate-300">
                          R:R <strong className="text-amber-400">{item.riskReward}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Target:</span>
                        <strong className="text-slate-200 font-semibold font-mono">{item.targetLevel || "S2"}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="pt-2 border-t border-[#1e2d3d] flex items-center justify-between gap-2">
                    <button
                      onClick={() => onSelectPattern?.(item.patternId || item.patternName)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition flex items-center gap-1"
                    >
                      View in Screener &rarr;
                    </button>

                    <div className="flex items-center gap-2">
                      {item.isSaved && (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                          <Cloud className="w-3 h-3 text-emerald-400" />
                          <span>Saved</span>
                        </div>
                      )}

                      <button
                        onClick={() => handleCopy(item)}
                        className="px-2 py-1 rounded bg-[#162130] hover:bg-[#1f2e42] border border-[#22354a] text-slate-300 text-xs font-medium flex items-center gap-1 transition"
                        title="Copy signal details"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 text-[11px]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-400" />
                            <span className="text-[11px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}