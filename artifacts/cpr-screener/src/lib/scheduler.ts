const STORAGE_KEY = "cpr_last_scan_date";
const STORAGE_KEY_BINANCE = "cpr_scan_results_binance";
const STORAGE_KEY_DELTA = "cpr_scan_results_delta";
const STORAGE_KEY_COINDCX = "cpr_scan_results_coindcx";
// Owned by backtest.ts; pruned here only as a last resort when a write hits the quota.
const UNIVERSE_SNAPSHOT_PREFIX = "cpr_historical_universe_v1:";

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
  // A cache only counts as fresh when it is from today AND actually holds
  // rows. An empty (or missing) result set must never be treated as "done":
  // that state showed 0 results all day with the auto-rescan suppressed.
  return !!cache && cache.date === getTodayISTDate() && cache.data.length > 0;
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
  const payload = JSON.stringify({
    data,
    date: getTodayISTDate(),
    savedAt: Date.now(),
  });
  try {
    localStorage.setItem(key, payload);
    return true;
  } catch {
    // Quota exceeded (or storage unavailable). Free space by dropping
    // obsolete app keys (old scanned-date markers, previous days' symbol
    // pins) and retry once before giving up.
    try {
      const keep = new Set([
        STORAGE_KEY,
        STORAGE_KEY_BINANCE,
        STORAGE_KEY_DELTA,
        STORAGE_KEY_COINDCX,
      ]);
      const today = getTodayISTDate();
      for (const k of Object.keys(localStorage)) {
        if (k === key || keep.has(k)) continue;
        const isPin = /^cpr_(binance|delta|coindcx)_symbols_/.test(k);
        if ((isPin && !k.endsWith(today)) || k.startsWith(SCANNED_MARKER_PREFIX)) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(key, payload);
      return true;
    } catch {
      // Still full. The largest re-derivable tenant of localStorage is
      // backtest.ts's per-day "historical universe" snapshots
      // (cpr_historical_universe_v1:<source>:<date>) — one key per source
      // per day, never pruned, so they grow without bound. They only make
      // old-date backtests exact (otherwise a candle-based approximation is
      // used), whereas today's scan cache is needed on every refresh. Drop
      // them oldest-first, in small batches, until the write fits.
      const universeKeys = Object.keys(localStorage)
        .filter((k) => k.startsWith(UNIVERSE_SNAPSHOT_PREFIX))
        .sort((a, b) => a.slice(a.lastIndexOf(":") + 1).localeCompare(b.slice(b.lastIndexOf(":") + 1)));
      const BATCH = 20;
      for (let i = 0; i < universeKeys.length; i += BATCH) {
        universeKeys.slice(i, i + BATCH).forEach((k) => localStorage.removeItem(k));
        try {
          localStorage.setItem(key, payload);
          console.info(
            `[scheduler] freed localStorage by pruning ${Math.min(i + BATCH, universeKeys.length)} ` +
              `old historical-universe snapshot(s) to persist "${key}".`
          );
          return true;
        } catch {
          /* keep pruning */
        }
      }
      console.warn(
        `[scheduler] could not persist "${key}" (${Math.round(payload.length / 1024)} KB) — ` +
          `localStorage quota is full. Results stay in memory only; the source will rescan on refresh.`
      );
      return false;
    }
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
