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
