import { safeSetItem } from "./safeStorage";

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
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function markScannedToday(): void {
  safeSetItem(STORAGE_KEY, getTodayISTDate());
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


/**
 * The scan "session" rolls over at 5:30 AM IST (= UTC 00:00, when the daily
 * candles the CPR is built from roll over) — NOT at IST calendar midnight.
 * A scan run at 12:11 AM IST is stamped with today's IST date but still uses
 * the PREVIOUS session's candles, so comparing calendar dates wrongly treated
 * it as "fresh" after 5:30 AM and suppressed that source's auto-scan while
 * the other sources (with older caches) rescanned.
 */
export function getScanSessionDate(atMs: number = Date.now()): string {
  return new Date(atMs).toISOString().slice(0, 10); // UTC date == IST date shifted by 5:30
}

export function isCacheFresh<T>(cache: CachedResults<T> | null): boolean {
  // A cache only counts as fresh when it belongs to the CURRENT scan session
  // AND actually holds rows. An empty (or missing) result set must never be
  // treated as "done": that state showed 0 results all day with the
  // auto-rescan suppressed.
  if (!cache || cache.data.length === 0) return false;
  // Entries with savedAt are judged by when they were really written; legacy
  // entries (no savedAt) fall back to their IST calendar date, which is
  // conservative — before 5:30 AM IST it never matches the session date, so
  // they simply rescan once.
  const cacheSession =
    typeof cache.savedAt === "number" ? getScanSessionDate(cache.savedAt) : cache.date;
  return cacheSession === getScanSessionDate();
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

// ─── Compact on-disk format for cached scan results ──────────────────────
// A scanned row has ~147 fields, ~120 of them boolean pattern flags that are
// almost always `false`. Written naively, that is ~3.9 KB/row (~2.2 MB for a
// 555-symbol Binance scan) and three sources together overran localStorage's
// ~5 MB quota, so the LAST cache write failed silently, the source looked
// "never scanned", and it rescanned on every page load. Dropping `false`
// flags roughly halves the payload. Only keys that are boolean in EVERY row
// are dropped, so restoring them as `false` on load is lossless.
export function compactRows<T>(rows: T[]): { rows: T[]; falseKeys: string[] } {
  if (rows.length === 0) return { rows, falseKeys: [] };
  let candidates: Set<string> | undefined;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { rows, falseKeys: [] };
    const here = new Set<string>();
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (typeof v === "boolean") here.add(k);
    }
    const prev: Set<string> | undefined = candidates;
    candidates = prev ? new Set([...prev].filter((k) => here.has(k))) : here;
  }
  const falseKeys: string[] = candidates ? [...candidates] : [];
  if (falseKeys.length === 0) return { rows, falseKeys };
  const dropSet = new Set(falseKeys);
  const compact = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (dropSet.has(k) && v === false) continue;
      out[k] = v;
    }
    return out as T;
  });
  return { rows: compact, falseKeys };
}

export function expandRows<T>(rows: T[], falseKeys: string[]): T[] {
  if (falseKeys.length === 0) return rows;
  return rows.map((row) => {
    const out = { ...(row as Record<string, unknown>) };
    for (const k of falseKeys) if (!(k in out)) out[k] = false;
    return out as T;
  });
}

export function loadCachedResults<T>(key: string): CachedResults<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data) && typeof parsed.date === "string") {
      const falseKeys: string[] = Array.isArray(parsed.falseKeys) ? parsed.falseKeys : [];
      return {
        data: expandRows<T>(parsed.data, falseKeys),
        date: parsed.date,
        savedAt: parsed.savedAt,
      };
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
  }).toUpperCase();
}

/**
 * formatScanDate — IST date for the "Scanned ..." badge, e.g. "Oct 02,2026".
 */
export function formatScanDate(savedAtMs: number): string {
  return new Date(savedAtMs)
    .toLocaleDateString("en-US", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "2-digit",
      year: "numeric",
    })
    .replace(", ", ",");
}

export function saveCachedResults<T>(key: string, data: T[]): boolean {
  const { rows, falseKeys } = compactRows(data);
  const payload = JSON.stringify({
    data: rows,
    falseKeys,
    date: getTodayISTDate(),
    savedAt: Date.now(),
  });
  // safeSetItem frees previous days' pins/session maps, scanned markers and
  // (last resort) old historical-universe snapshots, retrying after each step.
  // If it still can't fit, results stay in memory only and the source rescans
  // on refresh.
  return safeSetItem(key, payload);
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
 * True only if this source has usable results for today (a same-day cache
 * that actually contains rows). The lightweight scanned-today marker is
 * deliberately NOT consulted here: a marker without loadable results made
 * the app skip the rescan and show 0 rows until the next IST day.
 */
export function isScanFreshForSource<T>(
  _source: string,
  cache: CachedResults<T> | null
): boolean {
  return isCacheFresh(cache);
}

/**
 * Delete everything CoinDCX has stored in localStorage (result cache, scanned
 * marker, daily symbol pins, historical-universe snapshots). Used while
 * COINDCX_ENABLED is false so the paused venue stops taking up quota. All of it
 * is re-derivable by simply scanning again.
 */
export function purgeCoinDCXStorage(): void {
  try {
    const prefixes = [
      STORAGE_KEY_COINDCX,
      SCANNED_MARKER_PREFIX + "coindcx",
      "cpr_coindcx_symbols_",
      "cpr_historical_universe_v1:coindcx:",
    ];
    for (const k of Object.keys(localStorage)) {
      if (prefixes.some((p) => k === p || k.startsWith(p))) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable — nothing to purge */
  }
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
