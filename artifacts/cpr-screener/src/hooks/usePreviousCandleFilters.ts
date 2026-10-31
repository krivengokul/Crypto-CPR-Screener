/**
 * usePreviousCandleFilters — CON-A / MOM-A / CON-B / MOM-B prep + exclusive buckets.
 * Wraps the four usePreviousCandleFilterPrep pipelines and candleBucket helpers.
 */
import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { CPRResult } from "@/lib/cpr";
// Bucket lookups only read `source` + `symbol`, so accept any row carrying those
// (a full CPRResultWithSource, or a Legend-focus row with just the two fields).
type CandleBucketRow = { symbol: string; source: string };
import {
  findInsideR1S1Symbols,
  findPD15MBelowTCSymbols,
  findPD15MMomentumBelowSymbols,
  findPPConsolidateASymbols,
  findPPConsolidateBSymbols,
  findPPMomentumASymbols,
  findPPMomentumBSymbols,
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
};

export type PreviousCandleFilterId =
  | "all"
  | "consolidate-a"
  | "pp-consolidate-a"
  | "pp-consolidate-b"
  | "pp-momentum-a"
  | "pp-momentum-b"
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
  const previousPreviousUpexSessionStart = previousPreviousUpexSessionStartUtcMs();
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
      symbol: string; source: "binance" | "delta"; bc: number; ceiling: number; r2: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance",
          bc: getConsolidateABc(row.prevCPR, row.ppCPR),
          ceiling: getPrevious15MACeiling(row.prevCPR),
          r2: row.prevCPR.r2,
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta",
          bc: getConsolidateABc(row.prevCPR, row.ppCPR),
          ceiling: getPrevious15MACeiling(row.prevCPR),
          r2: row.prevCPR.r2,
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


  // PP-CONSOLIDATE-A: same rules as CON-A on the day-before-previous session.
  // Levels from ppCPR (the CPR that applied on PPDay). Requires ppCPR on the row.
  const ppConsolidateAPrep = usePreviousCandleFilterPrep({
    label: "PP-CONSOLIDATE-A",
    canRun: candlePrepCanRun,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, {
        symbol: string; source: "binance" | "delta"; bc: number; ceiling: number; r2: number;
      }>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        if (!Number.isFinite(pp.r1) || !Number.isFinite(pp.prevHigh) || !Number.isFinite(pp.r2)) return;
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          // No PPP-day CPR available → BC is PPDay's own BC (no overlap rewrite).
          bc: getConsolidateABc(pp, null),
          ceiling: getPrevious15MACeiling(pp),
          r2: pp.r2,
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

  // PP-CONSOLIDATE-B: same rules as CON-B on the day-before-previous session.
  // Levels from ppCPR (the CPR that applied on PPDay). Requires ppCPR on the row.
  const ppConsolidateBPrep = usePreviousCandleFilterPrep({
    label: "PP-CONSOLIDATE-B",
    canRun: candlePrepCanRun,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, {
        symbol: string; source: "binance" | "delta"; bc: number; floor: number; s2: number;
      }>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        if (!Number.isFinite(pp.s2) || !Number.isFinite(pp.prevLow) || !Number.isFinite(pp.s1)) return;
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          // CON-B stores TC in candidate.bc (same convention as consolidateBPrep).
          // No PPP-day CPR → TC is PPDay's own TC (no overlap rewrite).
          bc: getConsolidateBTc(pp, null),
          floor: getPrevious15MBFloor(pp),
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
    cacheKey: previousPPConsolidateBCandidateCacheKey,
    loadResults: loadPreviousPPConsolidateBResults,
    saveResults: savePreviousPPConsolidateBResults,
    scanMissing: (missing, onProgress, sessionEndMs) =>
      findPPConsolidateBSymbols(missing, onProgress, sessionEndMs),
  });

  // PP-MOMENTUM-A: MOM-A (BC only) on day-before-previous session. Levels from ppCPR.
  const ppMomentumAPrep = usePreviousCandleFilterPrep({
    label: "PP-MOMENTUM-A",
    canRun: candlePrepCanRun,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, {
        symbol: string; source: "binance" | "delta"; bc: number;
      }>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          bc: getConsolidateABc(pp, null),
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

  // PP-MOMENTUM-B: MOM-B (TC only) on day-before-previous session. Levels from ppCPR.
  const ppMomentumBPrep = usePreviousCandleFilterPrep({
    label: "PP-MOMENTUM-B",
    canRun: candlePrepCanRun,
    sessionStartMs: previousPreviousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, {
        symbol: string; source: "binance" | "delta"; bc: number;
      }>();
      const add = (row: CPRResult, source: "binance" | "delta") => {
        const pp = row.ppCPR;
        if (!pp || !Number.isFinite(pp.bc) || !Number.isFinite(pp.tc)) return;
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          bc: getConsolidateBTc(pp, null),
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

  const momentumAPrep = usePreviousCandleFilterPrep({
  label: "MOMENTUM-A",
  canRun: candlePrepCanRun,
  sessionStartMs: previousUpexSessionStart,
  buildCandidates: () => {
    const candidates = new Map<string, {
      symbol: string; source: "binance" | "delta"; bc: number;
    }>();
    // Same BC as CON-A: PDay BC, or PPDay BC when PDay was Overlap-Above / Inside vs PPDay.
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance", bc: getConsolidateABc(row.prevCPR, row.ppCPR),
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta", bc: getConsolidateABc(row.prevCPR, row.ppCPR),
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
      symbol: string; source: "binance" | "delta"; bc: number; floor: number; s2: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance",
          bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
          floor: getPrevious15MBFloor(row.prevCPR),
          s2: row.prevCPR.s2,
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta",
          bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
          floor: getPrevious15MBFloor(row.prevCPR),
          s2: row.prevCPR.s2,
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
    // Same TC ceiling as CON-B: prevCPR.tc, or ppCPR.tc when previous
    // session was INCPR / Overlap-Below vs the day before (getConsolidateBTc).
    const candidates = new Map<string, {
      symbol: string; source: "binance" | "delta"; bc: number;
    }>();
    if (status === "done") {
      for (const row of allResults) {
        candidates.set(`binance:${row.symbol}`, {
          symbol: row.symbol, source: "binance",
          bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.set(`delta:${row.symbol}`, {
          symbol: row.symbol, source: "delta",
          bc: getConsolidateBTc(row.prevCPR, row.ppCPR),
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
    label: "P-VOLATILE-R1S1",
    canRun: candlePrepCanRun,
    sessionStartMs: previousUpexSessionStart,
    buildCandidates: () => {
      const candidates = new Map<string, InsideR1S1Candidate>();
      const push = (row: CPRResult, source: "binance" | "delta") => {
        const floor = getPrevious15MBFloor(row.prevCPR);
        const ceiling = getPrevious15MACeiling(row.prevCPR);
        candidates.set(`${source}:${row.symbol}`, {
          symbol: row.symbol,
          source,
          bc: floor,
          floor,
          ceiling,
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

  // Annotate scan rows with raw 15m flags only.
  // IMPORTANT: do NOT depend on allResults/deltaAllResults — live price refresh
  // replaces those arrays often and would re-map the full universe every tick.
  // Functional setState reads the latest rows when the included-symbol sets change.
  // (The Screener no longer shows CON-B failure labels — Backtest only.)
  useEffect(() => {
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
          const ma = previousUpexIncludedSymbols.has(key);
          const b = previous15MTCIncludedSymbols.has(key);
          const mb = previous15MMomentumIncludedSymbols.has(key);
          const ins = previousInsideR1S1IncludedSymbols.has(key);
          if (
            row.PD15MConsolidateAPass === a &&
            row.PD15MPPConsolidateAPass === ppa &&
            row.PD15MPPConsolidateBPass === ppb &&
            row.PD15MAboveBCPass === ma &&
            row.PD15MBelowTCPass === b &&
            row.PD15MMomentumBPass === mb &&
            row.PD15MInsideR1S1Pass === ins
          ) {
            return row;
          }
          changed = true;
          return {
            ...row,
            PD15MConsolidateAPass: a,
            PD15MPPConsolidateAPass: ppa,
            PD15MPPConsolidateBPass: ppb,
            PD15MAboveBCPass: ma,
            PD15MBelowTCPass: b,
            PD15MMomentumBPass: mb,
            PD15MInsideR1S1Pass: ins,
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
    previousUpexIncludedSymbols,
    previous15MTCIncludedSymbols,
    previous15MMomentumIncludedSymbols,
    previousInsideR1S1IncludedSymbols,
    setAllResults,
    setDeltaAllResults,
  ]);

  const resetConsolidateAMessage = consolidateAPrep.resetMessage;
  const resetMomentumAMessage = momentumAPrep.resetMessage;
  const resetConsolidateBMessage = consolidateBPrep.resetMessage;
  const resetMomentumBMessage = momentumBPrep.resetMessage;
  const resetInsideR1S1Message = insideR1S1Prep.resetMessage;

  /**
   * Exclusive P-filter bucket:
   *   CON-B → P-CONSOLIDATE-B
   *   MOM-B → P-MOMENTUM-B
   *   CON-A → P-CONSOLIDATE-A
   *   MOM-A → P-MOMENTUM-A
   *   INSIDE (R1/PH–S1/PL pass, and not CON-A/CON-B) → INSIDE-R1S1
   * INSIDE ignores BC/TC consolidate membership; those win first when true.
   */
  // Memoized on the five included-symbol sets so their identities only change
  // when a set changes. Screener lists these in many useMemo/useCallback dep
  // arrays; fresh functions every render forced those to recompute on every
  // live price tick.
  const candleBucket = useCallback(
    (row: CandleBucketRow): CandleBucket => {
      const key = `${row.source}:${row.symbol}`;
      if (previous15MTCIncludedSymbols.has(key)) return "consolidate-b";
      if (previous15MMomentumIncludedSymbols.has(key)) return "momentum-b";
      if (previousConsolidateAIncludedSymbols.has(key)) return "consolidate-a";
      if (previousUpexIncludedSymbols.has(key)) return "momentum-a";
      if (previousInsideR1S1IncludedSymbols.has(key)) return "inside-r1s1";
      return null;
    },
    [
      previousConsolidateAIncludedSymbols,
      previousUpexIncludedSymbols,
      previous15MTCIncludedSymbols,
      previous15MMomentumIncludedSymbols,
      previousInsideR1S1IncludedSymbols,
    ],
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
   * PP exclusive membership (same priority as P CON-B > CON-A):
   *   PP-B if in B set; PP-A only if in A set and not in B set.
   * Independent of exclusive P-buckets.
   */
  const hasPPConsolidateB = useCallback(
    (row: CandleBucketRow) =>
      previousPPConsolidateBIncludedSymbols.has(`${row.source}:${row.symbol}`),
    [previousPPConsolidateBIncludedSymbols],
  );
  const hasPPConsolidateA = useCallback(
    (row: CandleBucketRow) => {
      const key = `${row.source}:${row.symbol}`;
      return (
        previousPPConsolidateAIncludedSymbols.has(key) &&
        !previousPPConsolidateBIncludedSymbols.has(key)
      );
    },
    [previousPPConsolidateAIncludedSymbols, previousPPConsolidateBIncludedSymbols],
  );

  const hasPPMomentumB = useCallback(
    (row: CandleBucketRow) => {
      const key = `${row.source}:${row.symbol}`;
      return (
        previousPPMomentumBIncludedSymbols.has(key) &&
        !previousPPConsolidateBIncludedSymbols.has(key)
      );
    },
    [previousPPMomentumBIncludedSymbols, previousPPConsolidateBIncludedSymbols],
  );
  const hasPPMomentumA = useCallback(
    (row: CandleBucketRow) => {
      const key = `${row.source}:${row.symbol}`;
      return (
        previousPPMomentumAIncludedSymbols.has(key) &&
        !previousPPConsolidateAIncludedSymbols.has(key)
      );
    },
    [previousPPMomentumAIncludedSymbols, previousPPConsolidateAIncludedSymbols],
  );
  const hasMomentumA = useCallback(
    (row: CandleBucketRow) => candleBucket(row) === "momentum-a",
    [candleBucket],
  );
  const hasInsideR1S1 = useCallback(
    (row: CandleBucketRow) => candleBucket(row) === "inside-r1s1",
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
    candleBucket,
    hasConsolidateB,
    hasMomentumB,
    hasConsolidateA,
    hasPPConsolidateA,
    hasPPConsolidateB,
    hasPPMomentumA,
    hasPPMomentumB,
    hasMomentumA,
    hasInsideR1S1,
    resetConsolidateAMessage,
    resetPPConsolidateAMessage: ppConsolidateAPrep.resetMessage,
    resetPPConsolidateBMessage: ppConsolidateBPrep.resetMessage,
    resetPPMomentumAMessage: ppMomentumAPrep.resetMessage,
    resetPPMomentumBMessage: ppMomentumBPrep.resetMessage,
    resetMomentumAMessage,
    resetConsolidateBMessage,
    resetMomentumBMessage,
    resetInsideR1S1Message,
  };
}
