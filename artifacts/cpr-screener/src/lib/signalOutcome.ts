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
 * PASS when today's high (or last price) is at/above R4, or low (or last price) at/below S4.
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
  const hi = r.todayHigh;
  const lo = r.todayLow;
  const px = r.currentPrice;

  // Reject garbage extremes (0, inverted range, or non-positive).
  // Stale/wrong todayLow (e.g. prior session low) was causing false PASS · S4
  // while price sat above PDH / R1 (seen on XMR etc.).
  const validHi =
    Number.isFinite(hi) && (hi as number) > 0 &&
    (!Number.isFinite(px) || (hi as number) >= (px as number) * 0.5);
  const validLo =
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
