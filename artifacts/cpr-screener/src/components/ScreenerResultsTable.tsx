/**
 * ScreenerResultsTable — header + body wrapper for screener rows.
 * Parent still maps rows to <ScreenerTableRow />; this isolates the table chrome.
 */
import type { ReactNode } from "react";
import ScreenerTableRow, { ScreenerTableHeader } from "@/pages/ScreenerTableRow";
import type { ActiveTab, SortKey, SortDir } from "@/pages/ScreenerUtils";

export type ScreenerResultsTableProps = {
  canShowCombined: boolean;
  activeTab: ActiveTab;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (key: SortKey) => void;
  /** Already-built <ScreenerTableRow /> elements (or empty state). */
  children: ReactNode;
};

export function ScreenerResultsTable({
  canShowCombined,
  activeTab,
  sortKey,
  sortDir,
  toggleSort,
  children,
}: ScreenerResultsTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <ScreenerTableHeader
            canShowCombined={canShowCombined}
            activeTab={activeTab}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
          />
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export { ScreenerTableRow };
