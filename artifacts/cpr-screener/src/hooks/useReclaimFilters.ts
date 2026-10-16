/**
 * useReclaimFilters — RECLAIM-S / RECLAIM-R pierced-depth prep for the live Screener.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type { CPRResult } from "@/lib/cpr";
import {
  currentReclaimWindowMs,
  currentSessionStartUtcMs,
  findReclaimDepths,
  getReclaimStates,
  mayHavePiercedFirstLevel,
  reclaimLevelsFromCPR,
  type ReclaimCandidate,
  type ReclaimDepth,
} from "@/lib/15MCandleCheck";

export function useReclaimFilters(opts: {
  status: string;
  deltaStatus: string;
  allResults: CPRResult[];
  deltaAllResults: CPRResult[];
}) {
  const { status, deltaStatus, allResults, deltaAllResults } = opts;

  const [reclaimSFilter, setReclaimSFilter] = useState(false);
  const [reclaimRFilter, setReclaimRFilter] = useState(false);
  const [reclaimDepths, setReclaimDepths] = useState<Map<string, ReclaimDepth>>(() => new Map());
  const [reclaimProgress, setReclaimProgress] = useState<{ done: number; total: number } | null>(null);
  const [reclaimReady, setReclaimReady] = useState(false);
  const [reclaimMessage, setReclaimMessage] = useState("");
  const [reclaimWindow, setReclaimWindow] = useState(() => currentReclaimWindowMs());
  const reclaimDepthsRef = useRef<Map<string, ReclaimDepth>>(new Map());
  const reclaimSessionRef = useRef(currentSessionStartUtcMs());
  const reclaimRunRef = useRef(0);

  const resetReclaimUi = useCallback(() => {
    setReclaimSFilter(false);
    setReclaimRFilter(false);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const next = currentReclaimWindowMs();
      setReclaimWindow((prev) => (prev === next ? prev : next));
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sessionNow = currentSessionStartUtcMs();
    if (sessionNow !== reclaimSessionRef.current) {
      reclaimSessionRef.current = sessionNow;
      reclaimDepthsRef.current = new Map();
      setReclaimDepths(new Map());
      setReclaimReady(false);
      setReclaimMessage("");
    }

    if (status === "scanning" || deltaStatus === "scanning") return;
    if (status !== "done" && deltaStatus !== "done") return;

    const candidates: ReclaimCandidate[] = [];
    const pushRows = (rows: CPRResult[], source: "binance" | "delta") => {
      for (const row of rows) {
        const key = `${source}:${row.symbol}`;
        const prior = reclaimDepthsRef.current.get(key);
        if (prior && prior.sPierced >= 4 && prior.rPierced >= 4) continue;
        if (!mayHavePiercedFirstLevel(row)) continue;
        candidates.push({
          symbol: row.symbol,
          source,
          levels: reclaimLevelsFromCPR(row.todayCPR),
        });
      }
    };
    if (status === "done") pushRows(allResults, "binance");
    if (deltaStatus === "done") pushRows(deltaAllResults, "delta");

    const runId = ++reclaimRunRef.current;
    if (candidates.length === 0) {
      setReclaimReady(true);
      setReclaimProgress(null);
      setReclaimMessage("");
      return;
    }
    setReclaimProgress({ done: 0, total: candidates.length });
    void findReclaimDepths(
      candidates,
      (done, total) => {
        if (runId === reclaimRunRef.current) setReclaimProgress({ done, total });
      },
      reclaimWindow,
    )
      .then(({ depths, unavailable }) => {
        if (runId !== reclaimRunRef.current) return;
        for (const [key, depth] of depths) {
          const prior = reclaimDepthsRef.current.get(key);
          reclaimDepthsRef.current.set(key, {
            sPierced: Math.max(prior?.sPierced ?? 0, depth.sPierced),
            rPierced: Math.max(prior?.rPierced ?? 0, depth.rPierced),
          });
        }
        setReclaimDepths(new Map(reclaimDepthsRef.current));
        setReclaimReady(true);
        setReclaimProgress(null);
        setReclaimMessage(
          unavailable > 0
            ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} skipped by RECLAIM because no usable 15m candles were returned for the current IST session.`
            : "",
        );
      })
      .catch((cause: unknown) => {
        if (runId !== reclaimRunRef.current) return;
        setReclaimProgress(null);
        setReclaimMessage(
          cause instanceof Error
            ? `RECLAIM preparation failed: ${cause.message}`
            : "RECLAIM preparation failed.",
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deltaStatus, reclaimWindow]);

  const reclaimStatesFor = useCallback(
    (r: { symbol: string; source: string; currentPrice: number }) => {
      const key = `${r.source}:${r.symbol}`;
      const depth = reclaimDepths.get(key);
      if (!depth) return null;
      // getReclaimStates needs CPR levels — callers that only have price may
      // use depth maps directly; table path still uses getReclaimStates with full row.
      return depth;
    },
    [reclaimDepths],
  );

  return {
    reclaimSFilter,
    setReclaimSFilter,
    reclaimRFilter,
    setReclaimRFilter,
    reclaimDepths,
    reclaimProgress,
    reclaimReady,
    reclaimMessage,
    reclaimWindow,
    resetReclaimUi,
    reclaimStatesFor,
    getReclaimStates,
  };
}
