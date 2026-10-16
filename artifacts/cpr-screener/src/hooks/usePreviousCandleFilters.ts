/**
 * usePreviousCandleFilters — CON-A / MOM-A / CON-B / MOM-B prep + exclusive buckets.
 * Wraps the four usePreviousCandleFilterPrep pipelines and candleBucket helpers.
 */
import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { CPRResult } from "@/lib/cpr";
import type { CPRResultWithSource } from "@/pages/ScreenerUtils";
import {
  findPD15MBelowTCSymbols,
  findPD15MMomentumBelowSymbols,
  findPreviousConsolidateASymbols,
  findPreviousUpexSymbols,
  getConsolidateABc,
  getConsolidateBTc,
  getPrevious15MACeiling,
  getPrevious15MBFloor,
  getUpexBc,
  loadPD15MMomentumBelowResults,
  loadPD15MTCBelowResults,
  loadPreviousConsolidateAResults,
  loadPreviousUpexResults,
  previous15MMomentumCandidateCacheKey,
  previous15MTCCandidateCacheKey,
  previousConsolidateACandidateCacheKey,
  previousUpexCandidateCacheKey,
  previousUpexSessionStartUtcMs,
  pruneLegacy15MResultCaches,
  savePD15MBelowTCResults,
  savePD15MMomentumBelowResults,
  savePreviousConsolidateAResults,
  savePreviousUpexResults,
} from "@/lib/15MCandleCheck";
import { usePreviousCandleFilterPrep } from "@/hooks/usePreviousCandleFilterPrep";

export type PreviousCandleFilterId =
  | "all"
  | "consolidate-a"
  | "momentum-a"
  | "consolidate-b"
  | "momentum-b"
  | "inside-r1s1";

export type CandleBucket =
  | "consolidate-a"
  | "momentum-a"
  | "consolidate-b"
  | "momentum-b"
  | "inside-r1s1"
  | null;

export function usePreviousCandleFilters(opts: {
  status: string;
  deltaStatus: string;
  allResults: CPRResult[];
  deltaAllResults: CPRResult[];
  setAllResults: Dispatch<SetStateAction<CPRResult[]>>;
  setDeltaAllResults: Dispatch<SetStateAction<CPRResult[]>>;
}) {
  const {
    status,
    deltaStatus,
    allResults,
    deltaAllResults,
    setAllResults,
    setDeltaAllResults,
  } = opts;

  useEffect(() => {
    pruneLegacy15MResultCaches();
  }, []);

  const previousUpexSessionStart = previousUpexSessionStartUtcMs();
  const candlePrepCanRun =
    status !== "scanning" &&
    deltaStatus !== "scanning" &&
    (status === "done" || deltaStatus === "done");

  const consolidateAPrep = usePreviousCandleFilterPrep({
  label: "CONSOLIDATE-A",
  canRun: candlePrepCanRun,
  sessionStartMs: previousUpexSessionStart,
  buildCandidates: () => {
    const candidates = new Map<string, {
      symbol: string; source: "binance" | "delta"; bc: number; ceiling: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance",
          bc: getConsolidateABc(row.prevCPR, row.ppCPR),
          ceiling: getPrevious15MACeiling(row.prevCPR),
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta",
          bc: getConsolidateABc(row.prevCPR, row.ppCPR),
          ceiling: getPrevious15MACeiling(row.prevCPR),
        });
      }
    }
    return Array.from(candidates.values());
  },
  cacheKey: previousConsolidateACandidateCacheKey,
  loadResults: loadPreviousConsolidateAResults,
  saveResults: savePreviousConsolidateAResults,
  scanMissing: (missing, onProgress, sessionEndMs) =>
    findPreviousConsolidateASymbols(missing, onProgress, sessionEndMs),
});

  const momentumAPrep = usePreviousCandleFilterPrep({
  label: "MOMENTUM-A",
  canRun: candlePrepCanRun,
  sessionStartMs: previousUpexSessionStart,
  buildCandidates: () => {
    const candidates = new Map<string, {
      symbol: string; source: "binance" | "delta"; bc: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance", bc: row.prevCPR.bc,
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta", bc: row.prevCPR.bc,
        });
      }
    }
    return Array.from(candidates.values());
  },
  cacheKey: previousUpexCandidateCacheKey,
  loadResults: loadPreviousUpexResults,
  saveResults: savePreviousUpexResults,
  scanMissing: (missing, onProgress, sessionEndMs) =>
    findPreviousUpexSymbols(missing, onProgress, sessionEndMs),
});

  const consolidateBPrep = usePreviousCandleFilterPrep({
  label: "CONSOLIDATE-B",
  canRun: candlePrepCanRun,
  sessionStartMs: previousUpexSessionStart,
  buildCandidates: () => {
    const candidates = new Map<string, {
      symbol: string; source: "binance" | "delta"; bc: number; floor: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance",
          bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
          floor: getPrevious15MBFloor(row.prevCPR),
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta",
          bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
          floor: getPrevious15MBFloor(row.prevCPR),
        });
      }
    }
    return Array.from(candidates.values());
  },
  cacheKey: previous15MTCCandidateCacheKey,
  loadResults: loadPD15MTCBelowResults,
  saveResults: savePD15MBelowTCResults,
  scanMissing: (missing, onProgress, sessionEndMs) =>
    findPD15MBelowTCSymbols(missing, onProgress, sessionEndMs),
});

  const momentumBPrep = usePreviousCandleFilterPrep({
  label: "MOMENTUM-B",
  canRun: candlePrepCanRun,
  sessionStartMs: previousUpexSessionStart,
  buildCandidates: () => {
    const candidates = new Map<string, {
      symbol: string; source: "binance" | "delta"; bc: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance", bc: row.prevCPR.tc,
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta", bc: row.prevCPR.tc,
        });
      }
    }
    return Array.from(candidates.values());
  },
  cacheKey: previous15MMomentumCandidateCacheKey,
  loadResults: loadPD15MMomentumBelowResults,
  saveResults: savePD15MMomentumBelowResults,
  scanMissing: (missing, onProgress, sessionEndMs) =>
    findPD15MMomentumBelowSymbols(missing, onProgress, sessionEndMs),
});


  // Aliases so existing filter / badge / count code keeps working
  const previousConsolidateAIncludedSymbols = consolidateAPrep.includedSymbols;
  const previousConsolidateAProgress = consolidateAPrep.progress;
  const previousConsolidateAReady = consolidateAPrep.ready;
  const previousConsolidateAMessage = consolidateAPrep.message;
  const previousUpexIncludedSymbols = momentumAPrep.includedSymbols;
  const previousUpexProgress = momentumAPrep.progress;
  const previousUpexReady = momentumAPrep.ready;
  const upexMessageFromPrep = momentumAPrep.message;
  const previous15MTCIncludedSymbols = consolidateBPrep.includedSymbols;
  const previous15MTCProgress = consolidateBPrep.progress;
  const previous15MTCReady = consolidateBPrep.ready;
  const previous15MTCMessage = consolidateBPrep.message;
  const previous15MMomentumIncludedSymbols = momentumBPrep.includedSymbols;
  const previous15MMomentumProgress = momentumBPrep.progress;
  const previous15MMomentumReady = momentumBPrep.ready;
  const previous15MMomentumMessage = momentumBPrep.message;

  // Annotate scan rows with raw 15m flags so matchesCandleCheck / category
  // conditions / Backtest badges see the same CON-A / CON-B / MOM bits the
  // exclusive candleBucket uses (prep Sets are the source of truth).
  useEffect(() => {
  const applyFlags = (
    rows: CPRResult[],
    setRows: Dispatch<SetStateAction<CPRResult[]>>,
    source: "binance" | "delta",
  ) => {
    if (rows.length === 0) return;
    let changed = false;
    const next = rows.map((row) => {
      const key = `${source}:${row.symbol}`;
      const a = previousConsolidateAIncludedSymbols.has(key);
      const ma = previousUpexIncludedSymbols.has(key);
      const b = previous15MTCIncludedSymbols.has(key);
      const mb = previous15MMomentumIncludedSymbols.has(key);
      if (
        row.PD15MConsolidateAPass === a &&
        row.PD15MAboveBCPass === ma &&
        row.PD15MBelowTCPass === b &&
        row.PD15MMomentumBPass === mb
      ) {
        return row;
      }
      changed = true;
      return {
        ...row,
        PD15MConsolidateAPass: a,
        PD15MAboveBCPass: ma,
        PD15MBelowTCPass: b,
        PD15MMomentumBPass: mb,
      };
    });
    if (changed) setRows(next);
  };
  applyFlags(allResults, setAllResults, "binance");
  applyFlags(deltaAllResults, setDeltaAllResults, "delta");
}, [
  previousConsolidateAIncludedSymbols,
  previousUpexIncludedSymbols,
  previous15MTCIncludedSymbols,
  previous15MMomentumIncludedSymbols,
  allResults,
  deltaAllResults,
]);
  const resetConsolidateAMessage = consolidateAPrep.resetMessage;
  const resetMomentumAMessage = momentumAPrep.resetMessage;
  const resetConsolidateBMessage = consolidateBPrep.resetMessage;
  const resetConsolidateAMessage = consolidateAPrep.resetMessage;
  const resetMomentumAMessage = momentumAPrep.resetMessage;
  const resetConsolidateBMessage = consolidateBPrep.resetMessage;
  const resetMomentumBMessage = momentumBPrep.resetMessage;

  const candleBucket = (row: CPRResultWithSource): CandleBucket => {
    const key = `${row.source}:${row.symbol}`;
    const conA = previousConsolidateAIncludedSymbols.has(key);
    const momA = previousUpexIncludedSymbols.has(key);
    const conB = previous15MTCIncludedSymbols.has(key);
    const momB = previous15MMomentumIncludedSymbols.has(key);
    if (conA && conB) return "inside-r1s1";
    if (conB) return "consolidate-b";
    if (momB) return "momentum-b";
    if (conA) return "consolidate-a";
    if (momA) return "momentum-a";
    return null;
  };

  return {
    previousConsolidateAIncludedSymbols,
    previousConsolidateAProgress,
    previousConsolidateAReady,
    previousConsolidateAMessage,
    previousUpexIncludedSymbols,
    previousUpexProgress,
    previousUpexReady,
    upexMessageFromPrep,
    previous15MTCIncludedSymbols,
    previous15MTCProgress,
    previous15MTCReady,
    previous15MTCMessage,
    previous15MMomentumIncludedSymbols,
    previous15MMomentumProgress,
    previous15MMomentumReady,
    previous15MMomentumMessage,
    candleBucket,
    hasConsolidateB: (row: CPRResultWithSource) => candleBucket(row) === "consolidate-b",
    hasMomentumB: (row: CPRResultWithSource) => candleBucket(row) === "momentum-b",
    hasConsolidateA: (row: CPRResultWithSource) => candleBucket(row) === "consolidate-a",
    hasMomentumA: (row: CPRResultWithSource) => candleBucket(row) === "momentum-a",
    hasInsideR1S1: (row: CPRResultWithSource) => candleBucket(row) === "inside-r1s1",
    previousInsideR1S1Ready: previousConsolidateAReady && previous15MTCReady,
    resetConsolidateAMessage,
    resetMomentumAMessage,
    resetConsolidateBMessage,
    resetMomentumBMessage,
  };
}
