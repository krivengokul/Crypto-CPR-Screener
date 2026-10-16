/**
 * ScreenerToolbar — scan buttons, search, source tabs, and filter chips.
 * Presentational: all state lives in Screener / hooks; this only renders controls.
 *
 * Extracted from Screener.tsx to shrink the orchestrator. Wire props from the
 * parent; do not add scan/filter logic here.
 */
import type { ReactNode } from "react";
import { RefreshCw, Search } from "lucide-react";
import { COINDCX_ENABLED, DELTA_ENABLED } from "@/lib/featureFlags";
import type { ActiveTab } from "@/pages/ScreenerUtils";
import type { ScanStatus } from "@/hooks/useExchangeScan";

export type ScreenerToolbarProps = {
  search: string;
  onSearchChange: (v: string) => void;
  activeTab: ActiveTab;
  onActiveTabChange: (tab: ActiveTab) => void;
  canShowCombined: boolean;
  status: ScanStatus;
  deltaStatus: ScanStatus;
  coindcxStatus: ScanStatus;
  onScanBinance: () => void;
  onScanDelta: () => void;
  onScanCoinDCX: () => void;
  /** Extra filter chips / P-filter radios rendered by parent or children */
  children?: ReactNode;
};

const TAB_LABEL: Partial<Record<ActiveTab, string>> = {
  binance: "Binance",
  nifty: "NIFTY",
};

/** Source switches shown in the toolbar (Binance + NIFTY only). */
const SOURCE_TABS: ActiveTab[] = ["binance", "nifty"];

export function ScreenerToolbar({
  search,
  onSearchChange,
  activeTab,
  onActiveTabChange,
  canShowCombined,
  status,
  deltaStatus,
  coindcxStatus,
  onScanBinance,
  onScanDelta,
  onScanCoinDCX,
  children,
}: ScreenerToolbarProps) {
  return (
    <div className="space-y-3 mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onScanBinance}
          disabled={status === "scanning"}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50 shrink-0"
          style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff" }}
        >
          <RefreshCw className={`w-3 h-3 ${status === "scanning" ? "animate-spin" : ""}`} />
          {status === "scanning" ? "Scanning Binance…" : "Scan Binance"}
        </button>
        <button
          type="button"
          onClick={onScanDelta}
          disabled={!DELTA_ENABLED || deltaStatus === "scanning"}
          title={DELTA_ENABLED ? undefined : "Delta scanning is paused"}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
            DELTA_ENABLED ? "disabled:opacity-50" : "opacity-40 cursor-not-allowed"
          }`}
          style={
            DELTA_ENABLED
              ? { background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", color: "#fff" }
              : { background: "#334155", color: "#94a3b8" }
          }
        >
          <RefreshCw className={`w-3 h-3 ${deltaStatus === "scanning" ? "animate-spin" : ""}`} />
          {deltaStatus === "scanning" ? "Scanning Delta…" : "Scan Delta"}
        </button>
        <button
          type="button"
          onClick={onScanCoinDCX}
          disabled={!COINDCX_ENABLED || coindcxStatus === "scanning"}
          title={COINDCX_ENABLED ? undefined : "CoinDCX scanning is paused"}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
            COINDCX_ENABLED ? "disabled:opacity-50" : "opacity-40 cursor-not-allowed"
          }`}
          style={
            COINDCX_ENABLED
              ? { background: "linear-gradient(135deg,#10b981,#047857)", color: "#fff" }
              : { background: "#334155", color: "#94a3b8" }
          }
        >
          <RefreshCw className={`w-3 h-3 ${coindcxStatus === "scanning" ? "animate-spin" : ""}`} />
          {coindcxStatus === "scanning" ? "Scanning CoinDCX…" : "Scan CoinDCX"}
        </button>
      </div>

      {canShowCombined && (
        <div className="px-0 py-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              placeholder="Search symbol or view…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-[#151e2c] border border-[#22354a] rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500/50"
            />
          </div>
          <div className="flex gap-0.5 p-0.5 rounded-md border border-[#22354a] bg-[#151e2c]">
            {SOURCE_TABS.map((tab) => {
              const activeClass =
                tab === "binance"
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50"
                  : "bg-amber-500/20 text-amber-300 border-amber-500/50";
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onActiveTabChange(tab)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition border cursor-pointer ${
                    activeTab === tab
                      ? activeClass
                      : "text-slate-400 hover:text-slate-200 border-transparent"
                  }`}
                >
                  {TAB_LABEL[tab]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
