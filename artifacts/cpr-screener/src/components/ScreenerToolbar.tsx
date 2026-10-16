/**
 * ScreenerToolbar — the scan button row (Scan Binance only).
 * Presentational: all state lives in Screener / hooks; this only renders controls.
 *
 * Search, the 15M-A filter, the status chips and the Binance | NIFTY source
 * switch live together in Screener's single filter row, not here. Do not add
 * scan/filter logic here.
 */
import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import type { ScanStatus } from "@/hooks/useExchangeScan";

export type ScreenerToolbarProps = {
  status: ScanStatus;
  onScanBinance: () => void;
  /** Optional extra controls rendered below the scan button */
  children?: ReactNode;
};

export function ScreenerToolbar({ status, onScanBinance, children }: ScreenerToolbarProps) {
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
      </div>

      {children}
    </div>
  );
}
