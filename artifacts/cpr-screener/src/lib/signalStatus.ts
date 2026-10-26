// src/lib/signalStatus.ts
//
// Single source of truth for Ready / Active / Pass / Fail across
// Screener, SignalDesk, and Journal display/sync.

import { hasTouchedEntry } from "@/lib/signalTracker";
import {
  sessionReachedTarget,
  livePriceReachedTarget,
} from "@/lib/signalOutcome";

/** UI + filter status used by Screener and SignalDesk. */
export type SignalLifecycleStatus = "ready" | "active" | "pass" | "fail";

/** Journal-persisted status (subset maps onto lifecycle). */
export type JournalOutcomeStatus = "ACTIVE" | "PASS" | "FAIL" | "EXPIRED";

export type SignalStatusInput = {
  direction: string;
  entry: number;
  target: number;
  stop: number;
  livePrice: number;
  sessionHigh?: number;
  sessionLow?: number;
  /** Today's journal row status, if any. */
  journalStatus?: JournalOutcomeStatus | null;
};

/**
 * Resolve Ready / Active / Pass / Fail.
 *
 * Priority:
 * 1. Journal terminal outcome (PASS / FAIL / EXPIRED→fail-like for UI)
 * 2. Live/session target → pass
 * 3. Live/session stop → fail
 * 4. Entry touched → active
 * 5. Else ready
 */
export function resolveSignalStatus(input: SignalStatusInput): SignalLifecycleStatus {
  const {
    direction,
    entry,
    target,
    stop,
    livePrice,
    sessionHigh,
    sessionLow,
    journalStatus,
  } = input;

  if (journalStatus === "PASS") return "pass";
  if (journalStatus === "FAIL") return "fail";
  // EXPIRED is terminal; treat like fail for filters/badges (closed, not active).
  if (journalStatus === "EXPIRED") return "fail";

  const entryTouched =
    journalStatus === "ACTIVE" ||
    (Number.isFinite(entry) && hasTouchedEntry(direction, entry, livePrice));

  // Target / stop only matter once the trade is "in play".
  // (entryTouched is already true for an ACTIVE journal row.)
  if (entryTouched) {
    if (
      sessionReachedTarget(direction, target, sessionHigh, sessionLow, livePrice) ||
      livePriceReachedTarget(direction, target, livePrice)
    ) {
      return "pass";
    }

    const isUp = direction === "Up" || direction === "LONG";
    const isDown = direction === "Down" || direction === "SHORT";
    if (isUp) {
      if (Number.isFinite(livePrice) && livePrice > 0 && livePrice <= stop) return "fail";
      if (
        sessionLow !== undefined &&
        Number.isFinite(sessionLow) &&
        sessionLow > 0 &&
        sessionLow <= stop
      ) {
        return "fail";
      }
    } else if (isDown) {
      if (Number.isFinite(livePrice) && livePrice > 0 && livePrice >= stop) return "fail";
      if (
        sessionHigh !== undefined &&
        Number.isFinite(sessionHigh) &&
        sessionHigh >= stop
      ) {
        return "fail";
      }
    }
  }

  if (entryTouched) return "active";
  return "ready";
}

/** Map lifecycle status → journal field when persisting a live resolution. */
export function lifecycleToJournalStatus(
  status: SignalLifecycleStatus,
): "ACTIVE" | "PASS" | "FAIL" | undefined {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  if (status === "active") return "ACTIVE";
  return undefined;
}

export function journalToLifecycle(
  status: JournalOutcomeStatus | null | undefined,
): SignalLifecycleStatus | null {
  if (status === "PASS") return "pass";
  if (status === "FAIL" || status === "EXPIRED") return "fail";
  if (status === "ACTIVE") return "active";
  return null;
}
