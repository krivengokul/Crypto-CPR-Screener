/**
 * ScreenerToolbar — Scan Binance row + right-end Refresh / Export CSV (Journal-style).
 * Presentational: scan/export logic stays in Screener.
 */
import type { ReactNode } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { ScanStatus } from "@/hooks/useExchangeScan";

export type ScreenerToolbarProps = {
  status: ScanStatus;
  onScanBinance: () => void;
  /** Re-run scan (same as Scan when idle). */
  onRefresh?: () => void;
  onExportCSV?: () => void;
  /** Disable Export when no rows. */
  exportDisabled?: boolean;
  children?: ReactNode;
};

export function ScreenerToolbar({
  status,
  onScanBinance,
  onRefresh,
  onExportCSV,
  exportDisabled = true,
  children,
}: ScreenerToolbarProps) {
  const busy = status === "scanning";
  const refresh = onRefresh ?? onScanBinance;

  return (
    <div className="space-y-3 mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onScanBinance}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50 shrink-0"
          style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff" }}
        >
          <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Scanning Binance…" : "Scan Binance"}
        </button>

        {/* Right end — Journal-style Refresh + Export CSV */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-[#162130] hover:bg-[#1e2f47] border border-[#22354a] disabled:opacity-50 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            title="Refresh / re-scan Binance"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={onExportCSV}
            disabled={exportDisabled || busy}
            className="px-3 py-1.5 rounded-lg bg-[#162130] hover:bg-[#1e2f47] border border-[#22354a] disabled:opacity-50 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            title="Export currently displayed rows as CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {children}
    </div>
  );
}
