/**
 * usePreviousCandleFilters — CON-A / MOM-A / CON-B / MOM-B prep + exclusive buckets.
 * Wraps the four usePreviousCandleFilterPrep pipelines and candleBucket helpers.
 */
import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { CPRResult } from "@/lib/cpr";
import { exclusivePDayBadge, exclusivePPDayBadge } from "@/lib/candleExclusiveBadges";
// The shared exclusive badge classifier needs the CPR fields and scan stamps.
type CandleBucketRow = CPRResult & { source: string };
import {
  findInsideR1S1Symbols,
  findVolASymbols,
  findVolBSymbols,
  findPPVolASymbols,
  findPPVolBSymbols,
  previousVolACandidateCacheKey,
  loadPreviousVolAResults,
  savePreviousVolAResults,
  loadPreviousVolAR2Results,
  previousPPVolACandidateCacheKey,
  loadPreviousPPVolAResults,
  savePreviousPPVolAResults,
  loadPreviousPPVolAR2Results,
  previousVolBCandidateCacheKey,
  loadPreviousVolBResults,
  savePreviousVolBResults,
  loadPreviousVolBS2Results,
  previousPPVolBCandidateCacheKey,
  loadPreviousPPVolBResults,
  savePreviousPPVolBResults,
  loadPreviousPPVolBS2Results,
  loadPreviousVolBMomBResults,
  loadPreviousPPVolBMomBResults,
  loadPreviousVolAMomAResults,
  loadPreviousPPVolCMomBResults,
  loadPreviousVolCMomBResults,
  loadPreviousPPVolCMomAResults,
  loadPreviousVolCMomAResults,
  loadPreviousPPVolAMomAResults,
  findPD15MBelowTCSymbols,
  findPD15MMomentumBelowSymbols,
  findPPConsolidateASymbols,
  findPPConsolidateBSymbols,
  findPPMomentumASymbols,
  findPPMomentumBSymbols,
  previousPPInsideR1S1CandidateCacheKey,
  savePreviousPPInsideR1S1Results,
  loadPreviousPPInsideR1S1Results,
  findPPInsideR1S1Symbols,
  findPreviousConsolidateASymbols,
  findPreviousUpexSymbols,
  getConsolidateABc,
  getConsolidateAPivot,
  loadConsolidateZoneScores,
  loadPPConsolidateZoneScores,
  pickExclusiveConsolidateSide,
  getConsolidateBPivot,
  getConsolidateBTc,
  getPrevious15MACeiling,
  getPrevious15MAExtremeLow,
  getPrevious15MBFloor,
  getPrevious15MBExtremeHigh,
  getUpexBc,
  loadPD15MMomentumBelowResults,
  loadPD15MTCBelowResults,
  loadPreviousConsolidateAResults,
  loadPreviousInsideR1S1Results,
  loadPreviousPPConsolidateAResults,
  loadPreviousPPConsolidateBResults,
  loadPreviousUpexResults,
  previous15MMomentumCandidateCacheKey,
  previous15MTCCandidateCacheKey,
  previousConsolidateACandidateCacheKey,
  previousInsideR1S1CandidateCacheKey,
  previousPPConsolidateACandidateCacheKey,
  previousPPConsolidateBCandidateCacheKey,
  previousPreviousUpexSessionStartUtcMs,
  previousUpexCandidateCacheKey,
  previousUpexSessionStartUtcMs,
  pruneLegacy15MResultCaches,
  savePD15MBelowTCResults,
  savePD15MMomentumBelowResults,
  savePreviousConsolidateAResults,
  savePreviousInsideR1S1Results,
  savePreviousPPConsolidateAResults,
  savePreviousPPConsolidateBResults,
  previousPPMomentumBCandidateCacheKey,
  savePreviousPPMomentumBResults,
  loadPreviousPPMomentumBResults,
  previousPPMomentumACandidateCacheKey,
  savePreviousPPMomentumAResults,
  loadPreviousPPMomentumAResults,
  savePreviousUpexResults,
} from "@/lib/15MCandleCheck";
import { usePreviousCandleFilterPrep } from "@/hooks/usePreviousCandleFilterPrep";

/**
 * INSIDE-R1S1 candidate. A type alias (not the UpexCandidate interface) so it
 * satisfies CandleFilterCandidate's index signature; it is structurally
 * assignable to UpexCandidate for the cacheKey / scan helpers. `bc` is unused
 * by the pass rule — floor + ceiling do the work.
 */
type InsideR1S1Candidate = {
  symbol: string;
  source: "binance" | "delta";
  bc: number;
  floor: number;
  ceiling: number;
  r2?: number;
  s2?: number;
  referenceFloor?: number;
  conBPivot?: number;
};

type ConsolidateACandidate = {
  symbol: string;
  source: "binance" | "delta";
  [key: string]: unknown;
  bc: number;
  referenceFloor: number;
  ceiling: number;
  r2: number;
  extremeLow: number;
  floor: number;
  tc: number;
  pivot: number;
};

type VolACandidate = {
  symbol: string;
  source: "binance" | "delta";
  bc: number;
  floor: number;
  ceiling?: number;
  r2?: number;
};

type VolBCandidate = {
  symbol: string;
  source: "binance" | "delta";
  bc: number;
  floor?: number;
  ceiling: number;
  s2?: number;
};

export type PreviousCandleFilterId =
  | "all"
  | "consolidate-a"
  | "pp-consolidate-a"
  | "pp-consolidate-b"
  | "pp-momentum-a"
  | "pp-momentum-b"
  | "pp-volatile-r1s1"
  | "pp-vol-a"
  | "pp-vol-b"
  | "momentum-a"
  | "consolidate-b"
  | "momentum-b"
  | "inside-r1s1"
  | "vol-a"
  | "vol-b";

export type CandleBucket =
  | "consolidate-a"
  | "momentum-a"
  | "consolidate-b"
  | "momentum-b"
  | "inside-r1s1"
  | "vol-a"
  | "vol-b"
  | null;

export function usePreviousCandleFilters(opts: {
  status: string;
  deltaStatus: string;
  allResults: CPRResult[];
  deltaAllResults: CPRResult[];
  setAllResults: Dispatch<SetStateAction<CPRResult[]>>;
  setDeltaAllResults: Dispatch<SetStateAction<CPRResult[]>>;
  /** Opaque number that increments each time a new scan completes. Causes all candle-prep effects to re-run. */
  scanStamp: number;
}) {
  const {
    status,
    deltaStatus,
    allResults,
    deltaAllResults,
    setAllResults,
    setDeltaAllResults,
    scanStamp,
  } = opts;

  useEffect(() => {
    pruneLegacy15MResultCaches();
  }, []);

  const previousUpexSessionStart = previousUpexSessionStartUtcMs();
  const previousPreviousUpexSessionStart = previousPreviousUpexSessionStartUtcMs();
  const candlePrepCanRun =
    status !== "scanning" &&
    deltaStatus !== "scanning" &&
    (status === "done" || deltaStatus === "done");

  const consolidateAPrep = usePreviousCandleFilterPrep<ConsolidateACandidate>({
    label: "P-CON-A",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, ConsolidateACandidate>();
      if (status === "done") {
        for (const row of allResults) {
          candidates.set(`binance:${row.symbol}`, {
            symbol: row.symbol, source: "binance",
            bc: getConsolidateABc(row.prevCPR, row.ppCPR),
            referenceFloor: getConsolidateAPivot(row.prevCPR, row.ppCPR),
            ceiling: getPrevious15MACeiling(row.prevCPR),
            r2: row.prevCPR.r2,
            extremeLow: getPrevious15MAExtremeLow(row.prevCPR),
            floor: getPrevious15MBFloor(row.prevCPR),
            tc: getConsolidateBTc(row.prevCPR, row.ppCPR),
            pivot: row.prevCPR.pivot,
          });
        }
      }
      if (deltaStatus === "done") {
        for (const row of deltaAllResults) {
          candidates.set(`delta:${row.symbol}`, {
            symbol: row.symbol, source: "delta",
            bc: getConsolidateABc(row.prevCPR, row.ppCPR),
            referenceFloor: getConsolidateAPivot(row.prevCPR, row.ppCPR),
            ceiling: getPrevious15MACeiling(row.prevCPR),
            r2: row.prevCPR.r2,
            extremeLow: getPrevious15MAExtremeLow(row.prevCPR),
            floor: getPrevious15MBFloor(row.prevCPR),
            tc: getConsolidateBTc(row.prevCPR, row.ppCPR),
            pivot: row.prevCPR.pivot,
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


  // PP-CON-A: same rules as CON-A on the day-before-previous session.
  // Levels from ppCPR (the CPR that applied on PPDay). Requires ppCPR on the row.
  const ppConsolidateAPrep = usePreviousCandleFilterPrep<ConsolidateACandidate>({
    label: "PP-CON-A",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, ConsolidateACandidate>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        if (!Number.isFinite(pp.r1) || !Number.isFinite(pp.prevHigh) || !Number.isFinite(pp.r2)) return;
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          // INCPR/overlap rewrite vs day-before-PP when pppCPR is present.
          bc: getConsolidateABc(pp, row.pppCPR ?? null),
          referenceFloor: getConsolidateAPivot(pp, row.pppCPR ?? null),
          ceiling: getPrevious15MACeiling(pp),
          r2: pp.r2,
          extremeLow: getPrevious15MAExtremeLow(pp),
          floor: getPrevious15MBFloor(pp),
          tc: getConsolidateBTc(pp, row.pppCPR ?? null),
          pivot: pp.pivot,
        });
      };
      if (status === "done") {
        for (const row of allResults) add(row, "binance");
      }
      if (deltaStatus === "done") {
        for (const row of deltaAllResults) add(row, "delta");
      }
      return Array.from(candidates.values());
    },
    cacheKey: previousPPConsolidateACandidateCacheKey,
    loadResults: loadPreviousPPConsolidateAResults,
    saveResults: savePreviousPPConsolidateAResults,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      // sessionEndMs = PPDay start + 1d = PDay start → finds PP session window
      findPPConsolidateASymbols(missing, onProgress, sessionEndMs),
  });

  // PP-CON-B: same rules as CON-B on the day-before-previous session.
  // Levels from ppCPR (the CPR that applied on PPDay). Requires ppCPR on the row.
  const ppConsolidateBPrep = usePreviousCandleFilterPrep({
    label: "PP-CON-B",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, {
        symbol: string; source: "binance" | "delta"; bc: number; floor: number; s2: number; extremeHigh: number;
      }>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        if (!Number.isFinite(pp.prevHigh) || !Number.isFinite(pp.r1) || !Number.isFinite(pp.s2) || !Number.isFinite(pp.prevLow) || !Number.isFinite(pp.s1)) return;
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          // CON-B stores the Pivot ceiling-reference in candidate.bc (same convention as consolidateBPrep).
          // INCPR/overlap rewrite vs day-before-PP when pppCPR is present.
          bc: getConsolidateBPivot(pp, row.pppCPR ?? null),
          floor: getPrevious15MBFloor(pp),
          s2: pp.s2,
          extremeHigh: getPrevious15MBExtremeHigh(pp),
        });
      };
      if (status === "done") {
        for (const row of allResults) add(row, "binance");
      }
      if (deltaStatus === "done") {
        for (const row of deltaAllResults) add(row, "delta");
      }
      return Array.from(candidates.values());
    },
    cacheKey: previousPPConsolidateBCandidateCacheKey,
    loadResults: loadPreviousPPConsolidateBResults,
    saveResults: savePreviousPPConsolidateBResults,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findPPConsolidateBSymbols(missing, onProgress, sessionEndMs),
  });

  // PP-MOM-A: MOM-A (Pivot reference floor + Extreme Low; no R2) on day-before-previous session.
  const ppMomentumAPrep = usePreviousCandleFilterPrep({
    label: "PP-MOM-A",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, {
        symbol: string; source: "binance" | "delta"; bc: number; referenceFloor: number; extremeLow: number;
      }>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          bc: getConsolidateABc(pp, row.pppCPR ?? null),
          referenceFloor: getConsolidateAPivot(pp, row.pppCPR ?? null),
          extremeLow: getPrevious15MAExtremeLow(pp),
        });
      };
      if (status === "done") {
        for (const row of allResults) add(row, "binance");
      }
      if (deltaStatus === "done") {
        for (const row of deltaAllResults) add(row, "delta");
      }
      return Array.from(candidates.values());
    },
    cacheKey: previousPPMomentumACandidateCacheKey,
    loadResults: loadPreviousPPMomentumAResults,
    saveResults: savePreviousPPMomentumAResults,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findPPMomentumASymbols(missing, onProgress, sessionEndMs),
  });

  // PP-MOM-B: MOM-B (Pivot-Ceiling reference + R2 wick, no S2) on day-before-previous session.
  const ppMomentumBPrep = usePreviousCandleFilterPrep({
    label: "PP-MOM-B",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, {
        symbol: string; source: "binance" | "delta"; bc: number; extremeHigh: number;
      }>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc) || !Number.isFinite(pp.prevHigh) || !Number.isFinite(pp.r1)) return;
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          bc: getConsolidateBPivot(pp, row.pppCPR ?? null),
          extremeHigh: getPrevious15MBExtremeHigh(pp),
        });
      };
      if (status === "done") {
        for (const row of allResults) add(row, "binance");
      }
      if (deltaStatus === "done") {
        for (const row of deltaAllResults) add(row, "delta");
      }
      return Array.from(candidates.values());
    },
    cacheKey: previousPPMomentumBCandidateCacheKey,
    loadResults: loadPreviousPPMomentumBResults,
    saveResults: savePreviousPPMomentumBResults,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findPPMomentumBSymbols(missing, onProgress, sessionEndMs),
  });

  // PP-VOL-C: INSIDE on day-before-previous session. Levels from ppCPR.
  const ppInsideR1S1Prep = usePreviousCandleFilterPrep<InsideR1S1Candidate>({
    label: "PP-VOL-C",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, InsideR1S1Candidate>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        if (!Number.isFinite(pp.prevHigh) || !Number.isFinite(pp.prevLow)) return;
        if (!Number.isFinite(pp.r1) || !Number.isFinite(pp.s1)) return;
        const floor = getPrevious15MBFloor(pp);
        const ceiling = getPrevious15MACeiling(pp);
        const referenceFloor = getConsolidateAPivot(pp, row.pppCPR ?? null);
        const conBPivot = getConsolidateBPivot(pp, row.pppCPR ?? null);
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          bc: referenceFloor,
          referenceFloor,
          conBPivot,
          floor,
          ceiling,
          r2: pp.r2,
          s2: pp.s2,
        });
      };
      if (status === "done") {
        for (const row of allResults) add(row, "binance");
      }
      if (deltaStatus === "done") {
        for (const row of deltaAllResults) add(row, "delta");
      }
      return Array.from(candidates.values());
    },
    cacheKey: previousPPInsideR1S1CandidateCacheKey,
    loadResults: loadPreviousPPInsideR1S1Results,
    saveResults: savePreviousPPInsideR1S1Results,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findPPInsideR1S1Symbols(missing, onProgress, sessionEndMs),
  });

  const momentumAPrep = usePreviousCandleFilterPrep({
  label: "P-MOM-A",
  canRun: candlePrepCanRun,
  scanStamp,
  sessionStartMs: previousUpexSessionStart,
  buildCandidates: () => {
    const candidates = new Map<string, {
      symbol: string; source: "binance" | "delta"; bc: number; referenceFloor: number; extremeLow: number;
      momentumGuardCeiling: number; momentumGuardR2: number;
    }>();
    // P-CON-A/MOM-A use PDay Pivot as their reference-floor level.
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol,
          source: "binance",
          bc: getConsolidateABc(row.prevCPR, row.ppCPR),
          referenceFloor: getConsolidateAPivot(row.prevCPR, row.ppCPR),
          extremeLow: getPrevious15MAExtremeLow(row.prevCPR),
          momentumGuardCeiling: getPrevious15MACeiling(row.prevCPR),
          momentumGuardR2: row.prevCPR.r2,
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol,
          source: "delta",
          bc: getConsolidateABc(row.prevCPR, row.ppCPR),
          referenceFloor: getConsolidateAPivot(row.prevCPR, row.ppCPR),
          extremeLow: getPrevious15MAExtremeLow(row.prevCPR),
          momentumGuardCeiling: getPrevious15MACeiling(row.prevCPR),
          momentumGuardR2: row.prevCPR.r2,
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
  label: "P-CON-B",
  canRun: candlePrepCanRun,
  scanStamp,
  sessionStartMs: previousUpexSessionStart,
  buildCandidates: () => {
    const candidates = new Map<string, {
      symbol: string; source: "binance" | "delta"; bc: number; floor: number; s2: number; extremeHigh: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        if (!Number.isFinite(row.prevCPR.prevHigh) || !Number.isFinite(row.prevCPR.r1) || !Number.isFinite(row.prevCPR.s2)) continue;
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance",
          bc: getConsolidateBPivot(row.prevCPR, row.ppCPR),
          floor: getPrevious15MBFloor(row.prevCPR),
          s2: row.prevCPR.s2,
          extremeHigh: getPrevious15MBExtremeHigh(row.prevCPR),
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        if (!Number.isFinite(row.prevCPR.prevHigh) || !Number.isFinite(row.prevCPR.r1) || !Number.isFinite(row.prevCPR.s2)) continue;
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta",
          bc: getConsolidateBPivot(row.prevCPR, row.ppCPR),
          floor: getPrevious15MBFloor(row.prevCPR),
          s2: row.prevCPR.s2,
          extremeHigh: getPrevious15MBExtremeHigh(row.prevCPR),
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
  label: "P-MOM-B",
  canRun: candlePrepCanRun,
  scanStamp,
  sessionStartMs: previousUpexSessionStart,
  buildCandidates: () => {
    // Same Pivot ceiling-reference as CON-B: prevCPR.pivot, or ppCPR.pivot when previous
    // session was INCPR / Overlap-Below vs the day before (getConsolidateBPivot).
    const candidates = new Map<string, {
      symbol: string; source: "binance" | "delta"; bc: number; extremeHigh: number;
      momentumGuardFloor: number; momentumGuardS2: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        if (!Number.isFinite(row.prevCPR.prevHigh) || !Number.isFinite(row.prevCPR.r1)) continue;
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance",
          bc: getConsolidateBPivot(row.prevCPR, row.ppCPR),
          extremeHigh: getPrevious15MBExtremeHigh(row.prevCPR),
          momentumGuardFloor: getPrevious15MBFloor(row.prevCPR),
          momentumGuardS2: row.prevCPR.s2,
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        if (!Number.isFinite(row.prevCPR.prevHigh) || !Number.isFinite(row.prevCPR.r1)) continue;
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta",
          bc: getConsolidateBPivot(row.prevCPR, row.ppCPR),
          extremeHigh: getPrevious15MBExtremeHigh(row.prevCPR),
          momentumGuardFloor: getPrevious15MBFloor(row.prevCPR),
          momentumGuardS2: row.prevCPR.s2,
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

  const previousPPConsolidateAIncludedSymbols = ppConsolidateAPrep.includedSymbols;
  const previousPPConsolidateAProgress = ppConsolidateAPrep.progress;
  const previousPPConsolidateAReady = ppConsolidateAPrep.ready;
  const previousPPConsolidateAMessage = ppConsolidateAPrep.message;
  const previousPPConsolidateBIncludedSymbols = ppConsolidateBPrep.includedSymbols;
  const previousPPConsolidateBProgress = ppConsolidateBPrep.progress;
  const previousPPConsolidateBReady = ppConsolidateBPrep.ready;
  const previousPPConsolidateBMessage = ppConsolidateBPrep.message;
  const previousPPMomentumAIncludedSymbols = ppMomentumAPrep.includedSymbols;
  const previousPPMomentumAProgress = ppMomentumAPrep.progress;
  const previousPPMomentumAReady = ppMomentumAPrep.ready;
  const previousPPMomentumAMessage = ppMomentumAPrep.message;
  const previousPPMomentumBIncludedSymbols = ppMomentumBPrep.includedSymbols;
  const previousPPMomentumBProgress = ppMomentumBPrep.progress;
  const previousPPMomentumBReady = ppMomentumBPrep.ready;
  const previousPPMomentumBMessage = ppMomentumBPrep.message;
  const previousPPInsideR1S1IncludedSymbols = ppInsideR1S1Prep.includedSymbols;
  const previousPPInsideR1S1Progress = ppInsideR1S1Prep.progress;
  const previousPPInsideR1S1Ready = ppInsideR1S1Prep.ready;
  const previousPPInsideR1S1Message = ppInsideR1S1Prep.message;
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

  // INSIDE-R1S1: max(R1,PH)–min(S1,PL) body/wick mode — independent of CON-A/CON-B
  const insideR1S1Prep = usePreviousCandleFilterPrep<InsideR1S1Candidate>({
    label: "P-VOL-C",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, InsideR1S1Candidate>();
      const push = (row: CPRResult, source: "binance" | "delta") => {
        const floor = getPrevious15MBFloor(row.prevCPR);
        const ceiling = getPrevious15MACeiling(row.prevCPR);
        const referenceFloor = getConsolidateAPivot(row.prevCPR, row.ppCPR);
        const conBPivot = getConsolidateBPivot(row.prevCPR, row.ppCPR);
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          bc: referenceFloor,
          referenceFloor,
          conBPivot,
          floor,
          ceiling,
          r2: row.prevCPR.r2,
          s2: row.prevCPR.s2,
        });
      };
      if (status === "done") for (const row of allResults) push(row, "binance");
      if (deltaStatus === "done") for (const row of deltaAllResults) push(row, "delta");
      return Array.from(candidates.values());
    },
    cacheKey: previousInsideR1S1CandidateCacheKey,
    loadResults: loadPreviousInsideR1S1Results,
    saveResults: savePreviousInsideR1S1Results,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findInsideR1S1Symbols(missing, onProgress, sessionEndMs),
  });

  const previousInsideR1S1IncludedSymbols = insideR1S1Prep.includedSymbols;
  const previousInsideR1S1Progress = insideR1S1Prep.progress;
  const previousInsideR1S1Ready = insideR1S1Prep.ready;
  const previousInsideR1S1Message = insideR1S1Prep.message;

  // VOL-A: floor and CON-A Pivot-floor rules qualify; the opposite ceiling check is irrelevant.
  const volAPrep = usePreviousCandleFilterPrep<VolACandidate>({
    label: "P-VOL-A",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, VolACandidate>();
      const push = (row: CPRResult, source: "binance" | "delta") => {
        const floor = getPrevious15MBFloor(row.prevCPR);
        const referenceFloor = getConsolidateAPivot(row.prevCPR, row.ppCPR);
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          bc: referenceFloor,
          floor,
          r2: row.prevCPR.r2,
        });
      };
      if (status === "done") for (const row of allResults) push(row, "binance");
      if (deltaStatus === "done") for (const row of deltaAllResults) push(row, "delta");
      return Array.from(candidates.values());
    },
    cacheKey: previousVolACandidateCacheKey,
    loadResults: loadPreviousVolAResults,
    saveResults: savePreviousVolAResults,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findVolASymbols(missing, onProgress, sessionEndMs),
  });

  const previousVolAIncludedSymbols = volAPrep.includedSymbols;
  const previousVolAProgress = volAPrep.progress;
  const previousVolAReady = volAPrep.ready;
  const previousVolAMessage = volAPrep.message;

  // VOL-B: ceiling and CON-B Pivot-ceiling rules qualify; the opposite floor check is irrelevant.
  const volBPrep = usePreviousCandleFilterPrep<VolBCandidate>({
    label: "P-VOL-B",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, VolBCandidate>();
      const push = (row: CPRResult, source: "binance" | "delta") => {
        const ceiling = getPrevious15MACeiling(row.prevCPR);
        const floor = getPrevious15MBFloor(row.prevCPR);
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          // `bc` is the Pivot reference used by the CON-B ceiling rule,
          // not the VOL-B band ceiling (which is already carried separately).
          bc: getConsolidateBPivot(row.prevCPR, row.ppCPR),
          floor,
          ceiling,
          s2: row.prevCPR.s2,
        });
      };
      if (status === "done") for (const row of allResults) push(row, "binance");
      if (deltaStatus === "done") for (const row of deltaAllResults) push(row, "delta");
      return Array.from(candidates.values());
    },
    cacheKey: previousVolBCandidateCacheKey,
    loadResults: loadPreviousVolBResults,
    saveResults: savePreviousVolBResults,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findVolBSymbols(missing, onProgress, sessionEndMs),
  });

  const previousVolBIncludedSymbols = volBPrep.includedSymbols;
  const previousVolBProgress = volBPrep.progress;
  const previousVolBReady = volBPrep.ready;
  const previousVolBMessage = volBPrep.message;

  // PP-VOL-A: floor and CON-A Pivot-floor rules qualify; the opposite ceiling check is irrelevant.
  const ppVolAPrep = usePreviousCandleFilterPrep<VolACandidate>({
    label: "PP-VOL-A",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, VolACandidate>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        if (!Number.isFinite(pp.prevLow) || !Number.isFinite(pp.s1)) return;
        const floor = getPrevious15MBFloor(pp);
        const referenceFloor = getConsolidateAPivot(pp, row.pppCPR ?? null);
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          bc: referenceFloor,
          floor,
          r2: pp.r2,
        });
      };
      if (status === "done") for (const row of allResults) add(row, "binance");
      if (deltaStatus === "done") for (const row of deltaAllResults) add(row, "delta");
      return Array.from(candidates.values());
    },
    cacheKey: previousPPVolACandidateCacheKey,
    loadResults: loadPreviousPPVolAResults,
    saveResults: savePreviousPPVolAResults,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findPPVolASymbols(missing, onProgress, sessionEndMs),
  });

  const previousPPVolAIncludedSymbols = ppVolAPrep.includedSymbols;
  const previousPPVolAProgress = ppVolAPrep.progress;
  const previousPPVolAReady = ppVolAPrep.ready;
  const previousPPVolAMessage = ppVolAPrep.message;

  // PP-VOL-B: ceiling and CON-B Pivot-ceiling rules qualify; the opposite floor check is irrelevant.
  const ppVolBPrep = usePreviousCandleFilterPrep<VolBCandidate>({
    label: "PP-VOL-B",
    canRun: candlePrepCanRun,
    scanStamp,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, VolBCandidate>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        if (!Number.isFinite(pp.prevHigh) || !Number.isFinite(pp.r1)) return;
        const ceiling = getPrevious15MACeiling(pp);
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          // `bc` is the Pivot reference used by the CON-B ceiling rule,
          // not the VOL-B band ceiling (which is already carried separately).
          bc: getConsolidateBPivot(pp, row.pppCPR ?? null),
          ceiling,
          s2: pp.s2,
        });
      };
      if (status === "done") for (const row of allResults) add(row, "binance");
      if (deltaStatus === "done") for (const row of deltaAllResults) add(row, "delta");
      return Array.from(candidates.values());
    },
    cacheKey: previousPPVolBCandidateCacheKey,
    loadResults: loadPreviousPPVolBResults,
    saveResults: savePreviousPPVolBResults,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findPPVolBSymbols(missing, onProgress, sessionEndMs),
  });

  const previousPPVolBIncludedSymbols = ppVolBPrep.includedSymbols;
  const previousPPVolBProgress = ppVolBPrep.progress;
  const previousPPVolBReady = ppVolBPrep.ready;
  const previousPPVolBMessage = ppVolBPrep.message;

  // Annotate scan rows with raw 15m flags only.
  // IMPORTANT: do NOT depend on allResults/deltaAllResults — live price refresh
  // replaces those arrays often and would re-map the full universe every tick.
  // Functional setState reads the latest rows when the included-symbol sets change.
  // (The Screener no longer shows CON-B failure labels — Backtest only.)
  useEffect(() => {
    const zoneScoresP = loadConsolidateZoneScores(previousUpexSessionStart);
    const zoneScoresPP = loadPPConsolidateZoneScores(previousPreviousUpexSessionStart);
    // Candle1 Reference Check Rule: load MOM-B-from-VOL-B & MOM-A-from-VOL-A caches
    // (populated as side-effects of VOL-B/VOL-A scans; keyed to the same session starts).
    const volBMomBResults = loadPreviousVolBMomBResults(previousUpexSessionStart);
    const ppVolBMomBResults = loadPreviousPPVolBMomBResults(previousPreviousUpexSessionStart);
    const volAMomAResults = loadPreviousVolAMomAResults(previousUpexSessionStart);
    const ppVolAMomAResults = loadPreviousPPVolAMomAResults(previousPreviousUpexSessionStart);
    const volCMomAResults = loadPreviousVolCMomAResults(previousUpexSessionStart);
    const ppVolCMomAResults = loadPreviousPPVolCMomAResults(previousPreviousUpexSessionStart);
    const volCMomBResults = loadPreviousVolCMomBResults(previousUpexSessionStart);
    const ppVolCMomBResults = loadPreviousPPVolCMomBResults(previousPreviousUpexSessionStart);
    const volAR2Results = loadPreviousVolAR2Results(previousUpexSessionStart);
    const ppVolAR2Results = loadPreviousPPVolAR2Results(previousPreviousUpexSessionStart);
    const volBS2Results = loadPreviousVolBS2Results(previousUpexSessionStart);
    const ppVolBS2Results = loadPreviousPPVolBS2Results(previousPreviousUpexSessionStart);
    const applyFlags = (
      setRows: Dispatch<SetStateAction<CPRResult[]>>,
      source: "binance" | "delta",
    ) => {
      setRows((prev) => {
        if (prev.length === 0) return prev;
        let changed = false;
        const next = prev.map((row) => {
          const key = `${source}:${row.symbol}`;
          const a = previousConsolidateAIncludedSymbols.has(key);
          const ppa = previousPPConsolidateAIncludedSymbols.has(key);
          const ppb = previousPPConsolidateBIncludedSymbols.has(key);
          const ppma = previousPPMomentumAIncludedSymbols.has(key);
          const ppmb = previousPPMomentumBIncludedSymbols.has(key);
          const ppins = previousPPInsideR1S1IncludedSymbols.has(key);
          const ppva = previousPPVolAIncludedSymbols.has(key);
          const ppvb = previousPPVolBIncludedSymbols.has(key);
          // Candle1 Reference Check Rule: MOM-B/MOM-A reclassified from VOL flags.
          const vbMomB = volBMomBResults.get(key) === true;
          const ppvbMomB = ppVolBMomBResults.get(key) === true;
          const vaMomA = volAMomAResults.get(key) === true;
          const ppvaMomA = ppVolAMomAResults.get(key) === true;
          const vcMomA = volCMomAResults.get(key) === true;
          const ppvcMomA = ppVolCMomAResults.get(key) === true;
          const vcMomB = volCMomBResults.get(key) === true;
          const ppvcMomB = ppVolCMomBResults.get(key) === true;
          const vaR2 = volAR2Results.get(key) === true;
          const ppvaR2 = ppVolAR2Results.get(key) === true;
          const vbS2 = volBS2Results.get(key) === true;
          const ppvbS2 = ppVolBS2Results.get(key) === true;
          const ma = previousUpexIncludedSymbols.has(key);
          const b = previous15MTCIncludedSymbols.has(key);
          const mb = previous15MMomentumIncludedSymbols.has(key);
          const ins = previousInsideR1S1IncludedSymbols.has(key);
          const va = previousVolAIncludedSymbols.has(key);
          const vb = previousVolBIncludedSymbols.has(key);
          const z = zoneScoresP.get(key);
          const zp = zoneScoresPP.get(key);
          const exclusive = pickExclusiveConsolidateSide(
            a,
            b,
            z?.zoneA ?? 0,
            z?.zoneB ?? 0,
            z?.above,
            z?.below,
          );
          const ppExclusive = pickExclusiveConsolidateSide(
            ppa,
            ppb,
            zp?.zoneA ?? 0,
            zp?.zoneB ?? 0,
            zp?.above,
            zp?.below,
          );
          if (
            row.PD15MConsolidateAPass === a &&
            row.PD15MPPConsolidateAPass === ppa &&
            row.PD15MPPConsolidateBPass === ppb &&
            row.PD15MPPMomentumAPass === ppma &&
            row.PD15MPPMomentumBPass === ppmb &&
            row.PD15MPPInsideR1S1Pass === ppins &&
            row.PD15MPPVolAPass === ppva &&
            row.PD15MPPVolBPass === ppvb &&
            row.PD15MVolBMomBPass === vbMomB &&
            row.PD15MPPVolBMomBPass === ppvbMomB &&
            row.PD15MVolAMomAPass === vaMomA &&
            row.PD15MVolCMomAPass === vcMomA &&
            row.PD15MVolCMomBPass === vcMomB &&
            row.PD15MPPVolCMomAPass === ppvcMomA &&
            row.PD15MPPVolCMomBPass === ppvcMomB &&
            row.PD15MPPVolAMomAPass === ppvaMomA &&
            row.PD15MVolAR2Pass === vaR2 &&
            row.PD15MPPVolAR2Pass === ppvaR2 &&
            row.PD15MVolBS2Pass === vbS2 &&
            row.PD15MPPVolBS2Pass === ppvbS2 &&
            row.PD15MAboveBCPass === ma &&
            row.PD15MBelowTCPass === b &&
            row.PD15MMomentumBPass === mb &&
            row.PD15MInsideR1S1Pass === ins &&
            row.PD15MVolAPass === va &&
            row.PD15MVolBPass === vb &&
            row.PD15MConsolidateExclusive === exclusive &&
            row.PD15MPPConsolidateExclusive === ppExclusive
          ) {
            return row;
          }
          changed = true;
          return {
            ...row,
            PD15MConsolidateAPass: a,
            PD15MPPConsolidateAPass: ppa,
            PD15MPPConsolidateBPass: ppb,
            PD15MPPMomentumAPass: ppma,
            PD15MPPMomentumBPass: ppmb,
            PD15MPPInsideR1S1Pass: ppins,
            PD15MPPVolAPass: ppva,
            PD15MPPVolBPass: ppvb,
            PD15MVolBMomBPass: vbMomB,
            PD15MPPVolBMomBPass: ppvbMomB,
            PD15MVolAMomAPass: vaMomA,
            PD15MVolCMomAPass: vcMomA,
            PD15MVolCMomBPass: vcMomB,
            PD15MPPVolAMomAPass: ppvaMomA,
            PD15MPPVolCMomAPass: ppvcMomA,
            PD15MPPVolCMomBPass: ppvcMomB,
            PD15MVolAR2Pass: vaR2,
            PD15MPPVolAR2Pass: ppvaR2,
            PD15MVolBS2Pass: vbS2,
            PD15MPPVolBS2Pass: ppvbS2,
            PD15MAboveBCPass: ma,
            PD15MBelowTCPass: b,
            PD15MMomentumBPass: mb,
            PD15MInsideR1S1Pass: ins,
            PD15MVolAPass: va,
            PD15MVolBPass: vb,
            PD15MConsolidateExclusive: exclusive,
            PD15MPPConsolidateExclusive: ppExclusive,
          };
        });
        return changed ? next : prev;
      });
    };
    applyFlags(setAllResults, "binance");
    applyFlags(setDeltaAllResults, "delta");
  }, [
    previousConsolidateAIncludedSymbols,
    previousPPConsolidateAIncludedSymbols,
    previousPPConsolidateBIncludedSymbols,
    previousPPMomentumAIncludedSymbols,
    previousPPMomentumBIncludedSymbols,
    previousPPInsideR1S1IncludedSymbols,
    previousPPVolAIncludedSymbols,
    previousPPVolBIncludedSymbols,
    previousUpexIncludedSymbols,
    previous15MTCIncludedSymbols,
    previous15MMomentumIncludedSymbols,
    previousInsideR1S1IncludedSymbols,
    previousVolAIncludedSymbols,
    previousVolBIncludedSymbols,
    setAllResults,
    setDeltaAllResults,
  ]);

  const resetConsolidateAMessage = consolidateAPrep.resetMessage;
  const resetMomentumAMessage = momentumAPrep.resetMessage;
  const resetConsolidateBMessage = consolidateBPrep.resetMessage;
  const resetMomentumBMessage = momentumBPrep.resetMessage;
  const resetInsideR1S1Message = insideR1S1Prep.resetMessage;

  /**
   * Resolve the live P bucket through the same priority/classifier used by
   * Screener row badges and Statistics, supplying the latest prep-scan sets.
   */
  const candleBucket = useCallback(
    (row: CandleBucketRow): CandleBucket => {
      const label = exclusivePDayBadge(row)?.text;
      if (!label) return null;
      if (label.startsWith("P-CON-B")) return "consolidate-b";
      if (label.startsWith("P-MOM-B")) return "momentum-b";
      if (label.startsWith("P-CON-A")) return "consolidate-a";
      if (label.startsWith("P-MOM-A")) return "momentum-a";
      if (label.startsWith("P-VOL-C")) return "inside-r1s1";
      if (label.startsWith("P-VOL-A")) return "vol-a";
      if (label.startsWith("P-VOL-B")) return "vol-b";
      return null;
    },
    [],
  );
  const hasConsolidateB = useCallback(
    (row: CandleBucketRow) => candleBucket(row) === "consolidate-b",
    [candleBucket],
  );
  const hasMomentumB = useCallback(
    (row: CandleBucketRow) => candleBucket(row) === "momentum-b",
    [candleBucket],
  );
  const hasConsolidateA = useCallback(
    (row: CandleBucketRow) => candleBucket(row) === "consolidate-a",
    [candleBucket],
  );
  /**
   * PP exclusive bucket — single source of truth via exclusivePPDayBadge,
   * the same classifier used by ScreenerTableRow badges and PatternStats.
   */
  const ppCandleBucket = useCallback(
    (row: CandleBucketRow): CandleBucket => {
      const label = exclusivePPDayBadge(row)?.text;
      if (!label) return null;
      if (label.startsWith("PP-CON-B")) return "consolidate-b";
      if (label.startsWith("PP-MOM-B")) return "momentum-b";
      if (label.startsWith("PP-CON-A")) return "consolidate-a";
      if (label.startsWith("PP-MOM-A")) return "momentum-a";
      if (label.startsWith("PP-VOL-C")) return "inside-r1s1";
      if (label.startsWith("PP-VOL-A")) return "vol-a";
      if (label.startsWith("PP-VOL-B")) return "vol-b";
      return null;
    },
    [],
  );
  const hasPPConsolidateB = useCallback(
    (row: CandleBucketRow) => ppCandleBucket(row) === "consolidate-b",
    [ppCandleBucket],
  );
  const hasPPConsolidateA = useCallback(
    (row: CandleBucketRow) => ppCandleBucket(row) === "consolidate-a",
    [ppCandleBucket],
  );
  const hasPPMomentumB = useCallback(
    (row: CandleBucketRow) => ppCandleBucket(row) === "momentum-b",
    [ppCandleBucket],
  );
  const hasPPVolatileR1S1 = useCallback(
    (row: CandleBucketRow) => ppCandleBucket(row) === "inside-r1s1",
    [ppCandleBucket],
  );
  const hasPPVolA = useCallback(
    (row: CandleBucketRow) => ppCandleBucket(row) === "vol-a",
    [ppCandleBucket],
  );
  const hasPPVolB = useCallback(
    (row: CandleBucketRow) => ppCandleBucket(row) === "vol-b",
    [ppCandleBucket],
  );
  const hasPPMomentumA = useCallback(
    (row: CandleBucketRow) => ppCandleBucket(row) === "momentum-a",
    [ppCandleBucket],
  );
  const hasMomentumA = useCallback(
    (row: CandleBucketRow) => candleBucket(row) === "momentum-a",
    [candleBucket],
  );
  const hasInsideR1S1 = useCallback(
    (row: CandleBucketRow) => candleBucket(row) === "inside-r1s1",
    [candleBucket],
  );
  const hasVolA = useCallback(
    (row: CandleBucketRow) => candleBucket(row) === "vol-a",
    [candleBucket],
  );
  const hasVolB = useCallback(
    (row: CandleBucketRow) => candleBucket(row) === "vol-b",
    [candleBucket],
  );

  return {
    previousConsolidateAIncludedSymbols,
    previousConsolidateAProgress,
    previousConsolidateAReady,
    previousConsolidateAMessage,
    previousPPConsolidateAIncludedSymbols,
    previousPPConsolidateAProgress,
    previousPPConsolidateAReady,
    previousPPConsolidateAMessage,
    previousPPConsolidateBIncludedSymbols,
    previousPPConsolidateBProgress,
    previousPPConsolidateBReady,
    previousPPConsolidateBMessage,
    previousPPMomentumAIncludedSymbols,
    previousPPMomentumAProgress,
    previousPPMomentumAReady,
    previousPPMomentumAMessage,
    previousPPMomentumBIncludedSymbols,
    previousPPMomentumBProgress,
    previousPPMomentumBReady,
    previousPPMomentumBMessage,
    previousPPInsideR1S1IncludedSymbols,
    previousPPInsideR1S1Progress,
    previousPPInsideR1S1Ready,
    previousPPInsideR1S1Message,
    previousPPVolAIncludedSymbols,
    previousPPVolAProgress,
    previousPPVolAReady,
    previousPPVolAMessage,
    previousPPVolBIncludedSymbols,
    previousPPVolBProgress,
    previousPPVolBReady,
    previousPPVolBMessage,
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
    previousInsideR1S1IncludedSymbols,
    previousInsideR1S1Progress,
    previousInsideR1S1Ready,
    previousInsideR1S1Message,
    previousVolAIncludedSymbols,
    previousVolAProgress,
    previousVolAReady,
    previousVolAMessage,
    previousVolBIncludedSymbols,
    previousVolBProgress,
    previousVolBReady,
    previousVolBMessage,
    candleBucket,
    hasConsolidateB,
    hasMomentumB,
    hasConsolidateA,
    hasPPConsolidateA,
    hasPPConsolidateB,
    hasPPMomentumA,
    hasPPMomentumB,
    hasPPVolatileR1S1,
    hasPPVolA,
    hasPPVolB,
    hasMomentumA,
    hasInsideR1S1,
    hasVolA,
    hasVolB,
    resetConsolidateAMessage,
    resetPPConsolidateAMessage: ppConsolidateAPrep.resetMessage,
    resetPPConsolidateBMessage: ppConsolidateBPrep.resetMessage,
    resetPPMomentumAMessage: ppMomentumAPrep.resetMessage,
    resetPPMomentumBMessage: ppMomentumBPrep.resetMessage,
    resetPPInsideR1S1Message: ppInsideR1S1Prep.resetMessage,
    resetPPVolAMessage: ppVolAPrep.resetMessage,
    resetPPVolBMessage: ppVolBPrep.resetMessage,
    resetMomentumAMessage,
    resetConsolidateBMessage,
    resetMomentumBMessage,
    resetInsideR1S1Message,
    resetVolAMessage: volAPrep.resetMessage,
    resetVolBMessage: volBPrep.resetMessage,
  };
}
