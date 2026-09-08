/**
 * Chart-link storage — lets you attach a TradingView snapshot URL to a
 * specific View's read of a specific symbol/day, so a link pasted in
 * while looking at one View doesn't silently show up under a different
 * View for the same symbol/day.
 *
 * Purely browser-local (localStorage) — this is personal reference data,
 * not a shared source of truth, so unlike copyBacktestView/
 * createBacktestView (which patch backtest.ts via a GitHub Action)
 * there's no server-side step: saving here is the actual persistence,
 * not a staging area for one.
 *
 * Mirrors the existing readStoredUniverse/writeStoredUniverse pattern in
 * backtest.ts: a versioned key prefix, an SSR-safe guard, and a
 * try/catch around every read/write since storage can be disabled or
 * full.
 */

const CHART_LINK_STORAGE_PREFIX = "cpr_chart_link_v1:";

export type StoredChartLink = {
  url: string;
  savedAt: string; // ISO timestamp
};

function chartLinkStorageKey(viewKey: string, rowKey: string): string {
  return `${CHART_LINK_STORAGE_PREFIX}${viewKey}::${rowKey}`;
}

/** Read the chart link saved for this View + row, if any. */
export function getChartLink(viewKey: string, rowKey: string): StoredChartLink | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(chartLinkStorageKey(viewKey, rowKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as StoredChartLink).url !== "string" ||
      !(parsed as StoredChartLink).url
    ) {
      return null;
    }
    return parsed as StoredChartLink;
  } catch {
    return null;
  }
}

/** Save (or overwrite) the chart link for this View + row. Returns false on failure (storage disabled/full) or an empty url. */
export function setChartLink(viewKey: string, rowKey: string, url: string): boolean {
  if (typeof localStorage === "undefined") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const value: StoredChartLink = { url: trimmed, savedAt: new Date().toISOString() };
    localStorage.setItem(chartLinkStorageKey(viewKey, rowKey), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Remove the chart link for this View + row, if one exists. */
export function removeChartLink(viewKey: string, rowKey: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(chartLinkStorageKey(viewKey, rowKey));
  } catch {
    // ignore — nothing to clean up if storage isn't available
  }
}
