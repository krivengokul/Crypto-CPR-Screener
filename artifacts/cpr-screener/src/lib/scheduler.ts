const STORAGE_KEY = "cpr_last_scan_date";
const STORAGE_KEY_BINANCE = "cpr_scan_results_binance";
const STORAGE_KEY_DELTA = "cpr_scan_results_delta";
const STORAGE_KEY_COINDCX = "cpr_scan_results_coindcx";

export { STORAGE_KEY_BINANCE, STORAGE_KEY_DELTA, STORAGE_KEY_COINDCX };

function getNowIST(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const istOffsetMs = 5.5 * 60 * 60_000;
  return new Date(utcMs + istOffsetMs);
}

function toISTDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getTodayISTDate(): string {
  return toISTDateString(getNowIST());
}

export function getLastScanDate(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function markScannedToday(): void {
  localStorage.setItem(STORAGE_KEY, getTodayISTDate());
}

export function hasScannedToday(): boolean {
  return getLastScanDate() === getTodayISTDate();
}

export function isPastScheduledTime(): boolean {
  const ist = getNowIST();
  const h = ist.getHours();
  const m = ist.getMinutes();
  return h > 5 || (h === 5 && m >= 30);
}

export function shouldAutoScan(): boolean {
  return isPastScheduledTime() && !hasScannedToday();
}

export function getNextScanIST(): Date {
  const ist = getNowIST();
  const next = new Date(ist);

  if (isPastScheduledTime()) {
    next.setDate(next.getDate() + 1);
  }

  next.setHours(5, 30, 0, 0);

  const utcMs = next.getTime() - 5.5 * 60 * 60_000;
  return new Date(utcMs);
}

export function formatISTTime(utcDate: Date): string {
  return utcDate.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}


export function isCacheFresh<T>(cache: CachedResults<T> | null): boolean {
  return !!cache && cache.date === getTodayISTDate();
}

export function shouldAutoScanForCache<T>(
  cache: CachedResults<T> | null,
  source?: string
): boolean {
  const alreadyDone = source ? isScanFreshForSource(source, cache) : isCacheFresh(cache);
  return isPastScheduledTime() && !alreadyDone;
}

export interface CachedResults<T> {
  data: T[];
  date: string;
  /** Wall-clock ms (Date.now()) when this cache entry was written by saveCachedResults. Undefined for legacy entries saved before this field existed. */
  savedAt?: number;
}

export function loadCachedResults<T>(key: string): CachedResults<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data) && typeof parsed.date === "string") {
      return parsed;
    }
    if (Array.isArray(parsed)) {
      return { data: parsed, date: getLastScanDate() ?? getTodayISTDate() };
    }
  } catch {
    // Ignore corrupted cache
  }
  return null;
}

/**
 * formatScanTime — compact time-only IST formatting for a savedAt
 * timestamp (e.g. "5:32 AM"), for the "Scanned at ..." badge. Mirrors
 * formatISTTime's locale/timezone but omits the date, since the badge is
 * only ever shown for today's scan.
 */
export function formatScanTime(savedAtMs: number): string {
  return new Date(savedAtMs).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function saveCachedResults<T>(key: string, data: T[]): boolean {
  try {
    const today = getTodayISTDate();
    localStorage.setItem(
      key,
      JSON.stringify({
        data,
        date: today,
        savedAt: Date.now(),
      })
    );
    return true;
  } catch {
    // Quota exceeded (or storage unavailable) — the full result set didn't
    // persist. Callers must not treat this the same as "never scanned":
    // see markScannedForSource/hasScannedTodayForSource below, which record
    // the fact that today's scan completed in a tiny, quota-safe key that
    // survives even when the (much larger) result cache above doesn't.
    return false;
  }
}

// ─── Lightweight per-source "scanned today" marker ───────────────────────
// Independent of the (potentially large) cached result set above. Binance,
// Delta, and CoinDCX all write their full scan results via
// saveCachedResults(), and CoinDCX in particular tends to be the largest/
// last payload written per refresh — if total localStorage usage is near
// the browser's per-origin quota, its write can silently fail (see the
// catch above) while Binance/Delta's earlier, smaller writes succeed. That
// made CoinDCX look "never scanned" on the next hard refresh and forced a
// pointless rescan every time, even though the day's scan genuinely
// completed. These tiny (just a date string) per-source keys always fit
// well within quota, so "was this source scanned today" no longer depends
// on the big result cache having successfully persisted.
const SCANNED_MARKER_PREFIX = "cpr_scanned_date_";

export function markScannedForSource(source: string): void {
  try {
    localStorage.setItem(SCANNED_MARKER_PREFIX + source, getTodayISTDate());
  } catch {
    // Storage unavailable — nothing more we can do; caller falls back to
    // the result cache's own date field.
  }
}

export function hasScannedTodayForSource(source: string): boolean {
  try {
    return localStorage.getItem(SCANNED_MARKER_PREFIX + source) === getTodayISTDate();
  } catch {
    return false;
  }
}

/**
 * True if this source's scan should be treated as "already done today" —
 * either because its full result cache is fresh, or (fallback) because the
 * lightweight scanned-today marker says so even though the result cache
 * itself failed to persist (e.g. quota exceeded).
 */
export function isScanFreshForSource<T>(
  source: string,
  cache: CachedResults<T> | null
): boolean {
  return isCacheFresh(cache) || hasScannedTodayForSource(source);
}

export function formatCountdown(targetUtc: Date): string {
  const diff = targetUtc.getTime() - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
