import type { LoggedSignal } from "./signalTracker";

export type PaperTradeRecord = Pick<
  LoggedSignal,
  "direction" | "entry" | "status" | "exitPrice"
>;

export interface PaperTradingSummary {
  total: number;
  pass: number;
  fail: number;
  active: number;
  expired: number;
  winRatePct: number | null;
  averageGrossReturnPct: number | null;
}

export function calculateGrossReturnPct(signal: PaperTradeRecord): number | null {
  if (signal.status !== "PASS" && signal.status !== "FAIL") return null;
  if (
    !Number.isFinite(signal.entry) ||
    signal.entry <= 0 ||
    signal.exitPrice === undefined ||
    !Number.isFinite(signal.exitPrice) ||
    signal.exitPrice <= 0
  ) {
    return null;
  }

  if (signal.direction === "Up" || signal.direction === "LONG") {
    return ((signal.exitPrice - signal.entry) / signal.entry) * 100;
  }
  if (signal.direction === "Down" || signal.direction === "SHORT") {
    return ((signal.entry - signal.exitPrice) / signal.entry) * 100;
  }
  return null;
}

export function summarizePaperTrades(
  signals: readonly PaperTradeRecord[]
): PaperTradingSummary {
  const pass = signals.filter((signal) => signal.status === "PASS").length;
  const fail = signals.filter((signal) => signal.status === "FAIL").length;
  const active = signals.filter((signal) => signal.status === "ACTIVE").length;
  const expired = signals.filter((signal) => signal.status === "EXPIRED").length;
  const resolved = pass + fail;
  const returns = signals
    .map(calculateGrossReturnPct)
    .filter((value): value is number => value !== null);

  return {
    total: signals.length,
    pass,
    fail,
    active,
    expired,
    winRatePct: resolved > 0 ? (pass / resolved) * 100 : null,
    averageGrossReturnPct:
      returns.length > 0
        ? returns.reduce((total, value) => total + value, 0) / returns.length
        : null,
  };
}
