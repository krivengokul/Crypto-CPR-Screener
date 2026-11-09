export interface SignalOutcomeInput {
  direction: string;
  entry: number;
  target: number;
  sl: number;
  timestamp: number;
}

export interface SignalOutcomeCandle {
  high: number;
  low: number;
}

export interface SignalOutcome {
  status: "ACTIVE" | "PASS" | "FAIL" | "EXPIRED";
  highestPriceSince: number;
  lowestPriceSince: number;
  outcomeNotes: string;
  evaluatedAt: number;
  exitPrice?: number;
}

export function evaluateSignalCandles(
  signal: SignalOutcomeInput,
  candles: SignalOutcomeCandle[],
  now = Date.now()
): SignalOutcome {
  let highest = signal.entry;
  let lowest = signal.entry;
  let status: SignalOutcome["status"] = "ACTIVE";
  let outcomeNotes = "Trade active and within parameters";
  let exitPrice = signal.entry;

  const isUp = signal.direction === "Up" || signal.direction === "LONG";
  const isDown = signal.direction === "Down" || signal.direction === "SHORT";

  for (const candle of candles) {
    if (candle.high > highest) highest = candle.high;
    if (candle.low < lowest) lowest = candle.low;

    if (isUp) {
      if (candle.low <= signal.sl) {
        status = "FAIL";
        exitPrice = signal.sl;
        outcomeNotes = `Stopped out at $${signal.sl.toFixed(4)}`;
        break;
      } else if (candle.high >= signal.target) {
        status = "PASS";
        exitPrice = signal.target;
        outcomeNotes = `Target achieved at $${signal.target.toFixed(4)}`;
        break;
      }
    } else if (isDown) {
      if (candle.high >= signal.sl) {
        status = "FAIL";
        exitPrice = signal.sl;
        outcomeNotes = `Stopped out at $${signal.sl.toFixed(4)}`;
        break;
      } else if (candle.low <= signal.target) {
        status = "PASS";
        exitPrice = signal.target;
        outcomeNotes = `Target achieved at $${signal.target.toFixed(4)}`;
        break;
      }
    }
  }

  if (status === "ACTIVE" && now - signal.timestamp > 7 * 24 * 60 * 60 * 1000) {
    status = "EXPIRED";
    outcomeNotes = "Session expired after 7 days without triggering SL or TP";
  }

  return {
    status,
    highestPriceSince: highest,
    lowestPriceSince: lowest,
    outcomeNotes,
    evaluatedAt: now,
    exitPrice: status !== "ACTIVE" ? exitPrice : undefined,
  };
}

/**
 * Has the live price already reached (or passed) this signal's target or
 * stop? Long: price >= target passes, price <= sl fails. Short: price <=
 * target passes, price >= sl fails. Used to trigger an outcome check without
 * waiting for the user to press Auto-Check.
 */
export function livePriceCrossedBoundary(
  signal: Pick<SignalOutcomeInput, "direction" | "target" | "sl">,
  livePrice: number | undefined
): boolean {
  if (livePrice === undefined || !Number.isFinite(livePrice) || livePrice <= 0) return false;
  const isUp = signal.direction === "Up" || signal.direction === "LONG";
  const isDown = signal.direction === "Down" || signal.direction === "SHORT";
  if (isUp) return livePrice >= signal.target || livePrice <= signal.sl;
  if (isDown) return livePrice <= signal.target || livePrice >= signal.sl;
  return false;
}

/**
 * Session R4 / S4 extreme reached — independent of Views.
 * PASS when *today's* session high (or last price) is at/above R4, or low
 * (or last price) at/below S4. Callers must feed todayHigh/todayLow from the
 * forming UTC daily candle only — never the prior completed day candle.
 */
export function sessionReachedR4OrS4(r: {
  currentPrice?: number;
  todayHigh?: number;
  todayLow?: number;
  todayCPR?: { r4?: number; s4?: number } | null;
}): boolean {
  return sessionR4OrS4Hit(r) !== null;
}

/** Which extreme was hit (both possible). */
export function sessionR4OrS4Hit(r: {
  currentPrice?: number;
  todayHigh?: number;
  todayLow?: number;
  todayCPR?: { r4?: number; s4?: number } | null;
}): "R4" | "S4" | "R4+S4" | null {
  const r4 = r.todayCPR?.r4;
  const s4 = r.todayCPR?.s4;
  const px = r.currentPrice;
  // Prefer stored session extremes, but never treat high as below last price
  // (missed live ticks / rescan gaps would otherwise hide a real R4 tag).
  const hiRaw = r.todayHigh;
  const loRaw = r.todayLow;
  const hi =
    Number.isFinite(hiRaw) && Number.isFinite(px) && (px as number) > 0
      ? Math.max(hiRaw as number, px as number)
      : hiRaw;
  const lo =
    Number.isFinite(loRaw) && Number.isFinite(px) && (px as number) > 0
      ? Math.min(loRaw as number, px as number)
      : loRaw;

  // Reject garbage extremes (0, inverted range, or non-positive).
  // Stale/wrong todayLow (e.g. prior session low) was causing false PASS · S4
  // while price sat above PDH / R1 (seen on XMR etc.).
  // The inversion is judged on the RAW stored values: widening the high up to
  // last price (above) would otherwise hide a stale low > high pair.
  const rawInverted =
    Number.isFinite(hiRaw) && Number.isFinite(loRaw) && (loRaw as number) > (hiRaw as number);
  const validHi =
    !rawInverted &&
    Number.isFinite(hi) && (hi as number) > 0 &&
    (!Number.isFinite(px) || (hi as number) >= (px as number) * 0.5);
  const validLo =
    !rawInverted &&
    Number.isFinite(lo) && (lo as number) > 0 &&
    (!Number.isFinite(hi) || (lo as number) <= (hi as number)) &&
    (!Number.isFinite(px) || (lo as number) <= (px as number) * 1.02);

  const hitR4 =
    Number.isFinite(r4) &&
    ((validHi && (hi as number) >= (r4 as number)) ||
      (Number.isFinite(px) && (px as number) > 0 && (px as number) >= (r4 as number)));

  // S4 from valid session low, or last price actually at/below S4.
  // (Recovery above TC after tagging S4 still counts — session extreme sticks.)
  const hitS4 =
    Number.isFinite(s4) &&
    ((validLo && (lo as number) <= (s4 as number)) ||
      (Number.isFinite(px) &&
        (px as number) > 0 &&
        (px as number) <= (s4 as number)));

  if (hitR4 && hitS4) return "R4+S4";
  if (hitR4) return "R4";
  if (hitS4) return "S4";
  return null;
}

/**
 * Has the target been reached at any point this session? True if the live
 * price is at/through the target OR today's session high (Up) / low (Down)
 * got there. Without the session extreme, a coin that hit the target and then
 * retraced (pump-and-crash) falls back to "Ready" even though the trade has
 * already played out. Session high/low are optional: when missing (results
 * cached before they were stored) this behaves exactly like
 * livePriceReachedTarget.
 */

export function sessionReachedTarget(
  direction: string,
  target: number,
  sessionHigh: number | undefined,
  sessionLow: number | undefined,
  livePrice: number | undefined
): boolean {
  if (livePriceReachedTarget(direction, target, livePrice)) return true;
  if (!Number.isFinite(target)) return false;
  if (direction === "Up" || direction === "LONG") {
    return sessionHigh !== undefined && Number.isFinite(sessionHigh) && sessionHigh >= target;
  }
  if (direction === "Down" || direction === "SHORT") {
    return sessionLow !== undefined && Number.isFinite(sessionLow) && sessionLow > 0 && sessionLow <= target;
  }
  return false;
}

export function livePriceReachedTarget(
  direction: string,
  target: number,
  livePrice: number | undefined
): boolean {
  if (
    livePrice === undefined ||
    !Number.isFinite(livePrice) ||
    livePrice <= 0 ||
    !Number.isFinite(target)
  ) return false;

  if (direction === "Up" || direction === "LONG") return livePrice >= target;
  if (direction === "Down" || direction === "SHORT") return livePrice <= target;
  return false;
}


/** UTC session day key — same rollover as scan session (UTC date). */
function sessionDayKey(atMs: number = Date.now()): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

const STICKY_PASS_PREFIX = "cpr_session_pass_v2_";
const STICKY_R4S4_PREFIX = "cpr_session_r4s4_v1_";

/**
 * Once a View's target has been tagged for a symbol, keep that View Pass for
 * the rest of the UTC day even if live price retraces or todayHigh is briefly
 * missing after a rescan. Scoped to the exact symbol + View: one View's Pass
 * must never make another View of the same symbol read Pass. Cleared
 * automatically on the next UTC day (the key includes the date).
 */
export function hasStickySessionPass(symbol: string, viewId?: string | null): boolean {
  if (typeof localStorage === "undefined" || !symbol || !viewId) return false;
  try {
    return localStorage.getItem(`${STICKY_PASS_PREFIX}${sessionDayKey()}_${symbol}_${viewId}`) === "1";
  } catch {
    return false;
  }
}

export function markStickySessionPass(symbol: string, viewId?: string | null): void {
  if (typeof localStorage === "undefined" || !symbol || !viewId) return;
  try {
    localStorage.setItem(`${STICKY_PASS_PREFIX}${sessionDayKey()}_${symbol}_${viewId}`, "1");
  } catch {
    /* quota / private mode */
  }
}

/** Latch a terminal session pass for one View so later rescans cannot revive Active. */
export function latchViewSessionPass(
  symbol: string,
  viewId: string | null | undefined,
  passed: boolean,
): boolean {
  if (passed) markStickySessionPass(symbol, viewId);
  return passed || hasStickySessionPass(symbol, viewId);
}

type R4S4Hit = "R4" | "S4" | "R4+S4";

/**
 * Session R4 / S4 display tag for the UTC day.
 *
 * Only shows a tag when the *live* scan confirms a touch (session high/price
 * ≥ R4 or low/price ≤ S4 from *today's* forming extremes). We still merge
 * R4+S4 across the day when both have been confirmed live at some point, but
 * we never keep a prior latch after live returns null — that was painting
 * false PASS · R4 from stale/yesterday highs after a bad scan.
 */
export function latchSessionR4OrS4(symbol: string, live: R4S4Hit | null): R4S4Hit | null {
  if (!symbol) return live;
  if (typeof localStorage === "undefined") return live;
  const key = `${STICKY_R4S4_PREFIX}${sessionDayKey()}_${symbol}`;
  try {
    if (!live) {
      // Live scan no longer sees a touch — clear sticky so bad data cannot stick.
      localStorage.removeItem(key);
      return null;
    }
    const prev = localStorage.getItem(key) ?? "";
    const hasR4 = prev.includes("R4") || live.includes("R4");
    const hasS4 = prev.includes("S4") || live.includes("S4");
    const merged: R4S4Hit = hasR4 && hasS4 ? "R4+S4" : hasR4 ? "R4" : "S4";
    if (merged !== prev) localStorage.setItem(key, merged);
    return merged;
  } catch {
    return live;
  }
}

/**
 * Drop stored session extremes that cannot be trusted: non-positive values, or
 * an inverted high/low pair (low above high = stale values from a prior
 * session). Comparisons against the last price are unnecessary here: if an
 * extreme was off the wrong side of price, the live price itself already
 * decides the entry touch.
 */
function saneSessionExtremes(
  hiRaw: number | undefined,
  loRaw: number | undefined,
): { hi?: number; lo?: number } {
  const hiOk = typeof hiRaw === "number" && Number.isFinite(hiRaw) && hiRaw > 0;
  const loOk = typeof loRaw === "number" && Number.isFinite(loRaw) && loRaw > 0;
  if (hiOk && loOk && (loRaw as number) > (hiRaw as number)) return {};
  return { hi: hiOk ? hiRaw : undefined, lo: loOk ? loRaw : undefined };
}

/**
 * Has the entry line been touched at any point this session? Same rule as
 * hasTouchedEntry (Up: price >= entry, Down: price <= entry, other directions
 * have no entry line so count as touched), widened with the session extremes:
 * a trade that reached its entry and then retraced is still ENTERED (Up:
 * sessionHigh >= entry, Down: sessionLow <= entry). Without this an entered
 * trade flips back to Ready as price retraces, and a stop-out that follows is
 * never evaluated.
 */
export function entryTouchedThisSession(
  direction: string,
  entry: number,
  livePrice: number,
  sessionHigh?: number,
  sessionLow?: number,
): boolean {
  if (direction !== "Up" && direction !== "Down") return true;
  if (direction === "Up" && livePrice >= entry) return true;
  if (direction === "Down" && livePrice <= entry) return true;
  if (!Number.isFinite(entry)) return false;
  const { hi, lo } = saneSessionExtremes(sessionHigh, sessionLow);
  return direction === "Up" ? hi !== undefined && hi >= entry : lo !== undefined && lo <= entry;
}

/**
 * Effective session high for status checks — never below last price.
 */
export function effectiveSessionHigh(
  todayHigh: number | undefined,
  currentPrice: number | undefined,
): number | undefined {
  const vals = [todayHigh, currentPrice].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  return vals.length ? Math.max(...vals) : undefined;
}

export function effectiveSessionLow(
  todayLow: number | undefined,
  currentPrice: number | undefined,
): number | undefined {
  const vals = [todayLow, currentPrice].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  return vals.length ? Math.min(...vals) : undefined;
}
