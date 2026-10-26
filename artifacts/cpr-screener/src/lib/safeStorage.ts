/**
 * safeStorage — quota-safe localStorage writes.
 *
 * A raw localStorage.setItem throws QuotaExceededError once the origin's
 * ~5 MB budget is used up. Several scan-path writes (daily symbol pins,
 * Delta session-open map, cached scan results) were unguarded, so a full
 * quota aborted the whole scan with
 *   "Failed to execute 'setItem' on 'Storage': Setting the value of
 *    'cpr_symbols_<date>' exceeded the quota."
 *
 * safeSetItem never throws. On failure it frees space by deleting only
 * re-derivable data and retries after each step:
 *   1. previous days' dated keys (symbol pins, Delta session-open maps)
 *   2. tiny per-source "scanned today" markers
 *   3. backtest.ts's per-day historical-universe snapshots, oldest first
 * Returns true if the value was persisted, false if it stays in memory only.
 */

/** Dated keys (`<prefix><YYYY-MM-DD>`): only today's copy is ever needed. */
const DATED_KEY_PREFIXES = [
  "cpr_symbols_", // binance.ts daily symbol pin
  "cpr_binance_symbols_",
  "cpr_delta_symbols_",
  "cpr_coindcx_symbols_", // coinDCX.ts daily symbol pin
  "delta_session_open_", // delta.ts session-open map
];

/** Per-source "scanned today" markers (owned by scheduler.ts). */
const SCANNED_MARKER_PREFIX = "cpr_scanned_date_";

/** Owned by backtest.ts: `<prefix><source>:<date>`. Re-derivable from candles. */
const UNIVERSE_SNAPSHOT_PREFIX = "cpr_historical_universe_v1:";

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function tryWrite(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Remove previous days' dated keys. Cheap, safe, always worth doing first. */
export function pruneStaleDatedKeys(): number {
  if (typeof localStorage === "undefined") return 0;
  const today = todayIST();
  let removed = 0;
  try {
    for (const k of Object.keys(localStorage)) {
      if (DATED_KEY_PREFIXES.some((p) => k.startsWith(p)) && !k.endsWith(today)) {
        localStorage.removeItem(k);
        removed++;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return removed;
}

export function safeSetItem(key: string, value: string): boolean {
  if (typeof localStorage === "undefined") return false;
  if (tryWrite(key, value)) return true;

  // Step 1 + 2: stale dated keys and scanned markers.
  pruneStaleDatedKeys();
  try {
    for (const k of Object.keys(localStorage)) {
      if (k !== key && k.startsWith(SCANNED_MARKER_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
  if (tryWrite(key, value)) return true;

  // Step 3: historical-universe snapshots, oldest date first, small batches.
  let universeKeys: string[] = [];
  try {
    universeKeys = Object.keys(localStorage)
      .filter((k) => k.startsWith(UNIVERSE_SNAPSHOT_PREFIX))
      .sort((a, b) => a.slice(a.lastIndexOf(":") + 1).localeCompare(b.slice(b.lastIndexOf(":") + 1)));
  } catch {
    /* ignore */
  }
  const BATCH = 20;
  for (let i = 0; i < universeKeys.length; i += BATCH) {
    universeKeys.slice(i, i + BATCH).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    });
    if (tryWrite(key, value)) {
      console.info(
        `[safeStorage] freed space by pruning ${Math.min(i + BATCH, universeKeys.length)} ` +
          `old historical-universe snapshot(s) to persist "${key}".`
      );
      return true;
    }
  }

  console.warn(
    `[safeStorage] could not persist "${key}" (${Math.round(value.length / 1024)} KB) — ` +
      `localStorage quota is full. Continuing with in-memory data only.`
  );
  return false;
}
