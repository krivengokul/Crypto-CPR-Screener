/**
 * Weekend / TradFi filter for Binance TRADFI / COMMOD perps.
 *
 * Toggle states (persisted in localStorage):
 *   Week · on  (hideOnWeekend = true, default)
 *     — Hide TRADFI/COMMOD only on Sat/Sun (underlying markets closed).
 *     — Weekdays: show them.
 *   Week · off (hideOnWeekend = false)
 *     — Always hide TRADFI/COMMOD (any day).
 *
 * Default: ON (weekend-only hide).
 */

export type TradfiAssetClass = "COMMOD" | "TRADFI";

export const HIDE_TRADFI_WEEKEND_STORAGE_KEY = "cpr_hide_tradfi_commod_weekend";

/** Fired on window after the Week toggle changes (ViewsSidebar ↔ Screener). */
export const HIDE_TRADFI_WEEKEND_CHANGED_EVENT = "cpr_hide_tradfi_weekend_changed";

/** Saturday (6) or Sunday (0) in the browser's local timezone. */
export function isWeekend(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isTradfiOrCommod(assetClass?: string | null): boolean {
  return assetClass === "COMMOD" || assetClass === "TRADFI";
}

/** Default true = Week ON (hide TRADFI/COMMOD on weekends only). */
export function readHideTradfiWeekend(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const v = localStorage.getItem(HIDE_TRADFI_WEEKEND_STORAGE_KEY);
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export function writeHideTradfiWeekend(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(HIDE_TRADFI_WEEKEND_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent(HIDE_TRADFI_WEEKEND_CHANGED_EVENT, { detail: { on } }),
      );
    } catch {
      /* ignore */
    }
  }
}

/**
 * True when this row should be excluded from live Screener / Signal Desk /
 * toast pools.
 *
 *   hideOnWeekend === true  (Week · on):  hide TRADFI/COMMOD on Sat/Sun only
 *   hideOnWeekend === false (Week · off): always hide TRADFI/COMMOD
 */
export function shouldHideTradfiCommodRow(
  assetClass: string | undefined | null,
  hideOnWeekend: boolean,
  now: Date = new Date(),
): boolean {
  if (!isTradfiOrCommod(assetClass)) return false;
  // Week · off → always hide COM/TRADFI
  if (!hideOnWeekend) return true;
  // Week · on → hide only on the weekend
  return isWeekend(now);
}
