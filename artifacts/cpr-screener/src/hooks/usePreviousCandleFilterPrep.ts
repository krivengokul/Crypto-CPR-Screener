import { useCallback, useEffect, useRef, useState } from "react";

type Progress = { done: number; total: number } | null;

export type CandleFilterCandidate = {
  symbol: string;
  source: "binance" | "delta";
  [key: string]: unknown;
};

type ScanResult = {
  outcomes: Map<string, boolean | null> | Record<string, boolean | null>;
  unavailable: number;
};

export type UsePreviousCandleFilterPrepArgs<T extends CandleFilterCandidate> = {
  /** Label used in user-facing messages, e.g. "CONSOLIDATE-A" */
  label: string;
  /** When true, effect runs (typically after Binance/Delta scan is done) */
  canRun: boolean;
  sessionStartMs: number;
  /**
   * Opaque stamp that increments/changes each time a fresh scan completes.
   * Adding it to the dependency array causes the effect to re-run on every new
   * scan even when canRun stays true (i.e., back-to-back scans).
   */
  scanStamp: number;
  /** Build candidates from current scan results */
  buildCandidates: () => T[];
  /** Cache key for one candidate in this session */
  cacheKey: (sessionStartMs: number, candidate: T) => string;
  loadResults: (sessionStartMs: number) => Map<string, boolean | null>;
  saveResults: (sessionStartMs: number, map: Map<string, boolean | null>) => void;
  /**
   * Scan only the missing candidates.
   * Outcomes must be keyed by `${source}:${symbol}`.
   */
  scanMissing: (
    missing: T[],
    onProgress: (done: number, total: number) => void,
    sessionEndMs: number,
  ) => Promise<ScanResult>;
};

export type PreviousCandleFilterPrep = {
  includedSymbols: Set<string>;
  progress: Progress;
  ready: boolean;
  message: string;
  resetMessage: () => void;
};

function outcomesGet(
  outcomes: ScanResult["outcomes"],
  key: string,
): boolean | null | undefined {
  if (outcomes instanceof Map) return outcomes.get(key);
  return outcomes[key];
}

/**
 * Shared "candidates → cache → missing → scan → save" pipeline used by
 * P-CONSOLIDATE-A/B, P-MOMENTUM-A/B, and INSIDE-R1S1 in the live Screener.
 * Does not clear the user's active radio filter when re-prepping.
 */
export function usePreviousCandleFilterPrep<T extends CandleFilterCandidate>(
  args: UsePreviousCandleFilterPrepArgs<T>,
): PreviousCandleFilterPrep {
  const {
    label,
    canRun,
    sessionStartMs,
    scanStamp,
    buildCandidates,
    cacheKey,
    loadResults,
    saveResults,
    scanMissing,
  } = args;

  const [includedSymbols, setIncludedSymbols] = useState<Set<string>>(
    () => new Set(),
  );
  const [progress, setProgress] = useState<Progress>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  const resultsRef = useRef<Map<string, boolean | null>>(
    loadResults(sessionStartMs),
  );
  const cacheSessionRef = useRef(sessionStartMs);
  const runRef = useRef(0);

  const buildCandidatesRef = useRef(buildCandidates);
  const cacheKeyRef = useRef(cacheKey);
  const scanMissingRef = useRef(scanMissing);
  buildCandidatesRef.current = buildCandidates;
  cacheKeyRef.current = cacheKey;
  scanMissingRef.current = scanMissing;

  useEffect(() => {
    if (cacheSessionRef.current !== sessionStartMs) {
      resultsRef.current = loadResults(sessionStartMs);
      cacheSessionRef.current = sessionStartMs;
    }

    if (!canRun) return;

    const currentCandidates = buildCandidatesRef.current();
    if (currentCandidates.length === 0) {
      setReady(false);
      setProgress(null);
      setIncludedSymbols(new Set());
      return;
    }

    const keyOf = (c: T) => cacheKeyRef.current(sessionStartMs, c);
    // Treat null (prior transient fetch failure / rate-limit) as missing so a
    // rescan or page refresh retries instead of staying poisoned all day.
    const missing = currentCandidates.filter((c) => {
      const v = resultsRef.current.get(keyOf(c));
      return v !== true && v !== false;
    });

    const updateIncluded = () => {
      setIncludedSymbols(
        new Set(
          currentCandidates
            .filter((c) => resultsRef.current.get(keyOf(c)) === true)
            .map((c) => `${c.source}:${c.symbol}`),
        ),
      );
    };

    if (missing.length === 0) {
      // Cache hit: safe to update counts immediately from warm cache.
      updateIncluded();
      setReady(true);
      setProgress(null);
      const unavailable = currentCandidates.filter(
        (c) => resultsRef.current.get(keyOf(c)) === null,
      ).length;
      setMessage(
        unavailable > 0
          ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from ${label} because no usable completed 15m candles were returned for the previous IST session.`
          : "",
      );
      return;
    }
    // Cache miss (session rollover / first load): do NOT wipe includedSymbols
    // to an empty Set — keep the previous state visible while the scan runs.
    // updateIncluded() is called below once the scan resolves.

    const runId = ++runRef.current;
    setReady(false);
    setProgress({ done: 0, total: missing.length });

    void scanMissingRef
      .current(
        missing,
        (done, total) => {
          if (runId === runRef.current) setProgress({ done, total });
        },
        sessionStartMs + 24 * 60 * 60 * 1000,
      )
      .then(({ outcomes, unavailable }) => {
        if (runId !== runRef.current) return;
        for (const candidate of missing) {
          const symbolKey = `${candidate.source}:${candidate.symbol}`;
          const outcome = outcomesGet(outcomes, symbolKey);
          // Only cache resolved booleans; null means rate-limited / transient
          // failure and must not be persisted so later scans can retry.
          if (outcome === true || outcome === false) {
            resultsRef.current.set(keyOf(candidate), outcome);
          } else {
            resultsRef.current.delete(keyOf(candidate));
          }
        }
        saveResults(sessionStartMs, resultsRef.current);
        updateIncluded();
        setReady(true);
        setProgress(null);
        setMessage(
          unavailable > 0
            ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} excluded from ${label} because no usable completed 15m candles were returned for the previous IST session.`
            : "",
        );
      })
      .catch((cause: unknown) => {
        if (runId !== runRef.current) return;
        setProgress(null);
        setReady(false);
        setMessage(
          cause instanceof Error
            ? `${label} preparation failed: ${cause.message}`
            : `${label} preparation failed.`,
        );
      });
  // scanStamp changes on every new completed scan, ensuring re-prep even when
  // canRun was already true from the previous scan (back-to-back scans).
  }, [canRun, sessionStartMs, scanStamp, label, loadResults, saveResults]);

  // Stable identity: callers list resetMessage in dependency arrays.
  const resetMessage = useCallback(() => setMessage(""), []);

  return {
    includedSymbols,
    progress,
    ready,
    message,
    resetMessage,
  };
}
