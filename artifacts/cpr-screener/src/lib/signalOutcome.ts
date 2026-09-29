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
