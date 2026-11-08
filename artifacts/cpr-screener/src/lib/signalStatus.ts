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
 * Priority (terminal outcomes never demote back to Active):
 * 1. Journal PASS / FAIL / EXPIRED
 * 2. Live or session extreme hit target → pass (latched for the session)
 * 3. Live or session extreme hit stop → fail (only if not already pass)
 * 4. Entry touched → active
 * 5. Else ready
 *
 * Target/stop use session high/low when available so a wick through the level
 * still counts after price retraces. Entry is NOT required before pass: once
 * today's high/low tags the target, status is Pass for that setup.
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

  // 1. Journal terminal — never reopen as Active the same day.
  if (journalStatus === "PASS") return "pass";
  if (journalStatus === "FAIL") return "fail";
  if (journalStatus === "EXPIRED") return "fail";

  // 2. Target tagged (session high/low or live) → Pass for the session.
  if (
    sessionReachedTarget(direction, target, sessionHigh, sessionLow, livePrice) ||
    livePriceReachedTarget(direction, target, livePrice)
  ) {
    return "pass";
  }

  const entryTouched =
    journalStatus === "ACTIVE" ||
    (Number.isFinite(entry) && hasTouchedEntry(direction, entry, livePrice));

  // 3. Stop hit only after entry is in play (or journal already ACTIVE).
  if (entryTouched) {
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

  // 4 / 5
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
