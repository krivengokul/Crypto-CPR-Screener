import { useEffect, useRef, useState } from "react";
import type { CPRResult } from "@/lib/cpr";
import {
  currentSessionStartUtcMs,
  findSessionBoundaryMatches,
  type CPRBOCandidate,
} from "@/lib/15MCandleCheck";

export function useCPRBOFilter(opts: {
  status: string;
  deltaStatus: string;
  allResults: CPRResult[];
  deltaAllResults: CPRResult[];
}) {
  const { status, deltaStatus, allResults, deltaAllResults } = opts;
  const [enabled, setEnabled] = useState(false);
  const [pdhboEnabled, setPdhboEnabled] = useState(false);
  const [pdlboEnabled, setPdlboEnabled] = useState(false);
  const [matches, setMatches] = useState({ cprbo: new Set<string>(), pdhbo: new Set<string>(), pdlbo: new Set<string>() });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [scanWindow, setScanWindow] = useState(() => Date.now());
  const sessionRef = useRef(currentSessionStartUtcMs());
  const resultsSessionRef = useRef<number | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      const next = Date.now();
      setScanWindow((previous) => previous === next ? previous : next);
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sessionStart = currentSessionStartUtcMs();
    if (sessionStart !== sessionRef.current) {
      sessionRef.current = sessionStart;
      resultsSessionRef.current = null;
      runRef.current++;
      setEnabled(false);
      setPdhboEnabled(false);
      setPdlboEnabled(false);
      setMatches({ cprbo: new Set(), pdhbo: new Set(), pdlbo: new Set() });
      setReady(false);
      setMessage("");
    }

    if (status === "scanning" || deltaStatus === "scanning") {
      // Rescan any source that finishes after this in-progress scan.
      resultsSessionRef.current = null;
      return;
    }
    if (status !== "done" && deltaStatus !== "done") return;
    // Wait until today's first two candles have closed (00:30 UTC / 06:00 IST).
    if (scanWindow < sessionStart + 30 * 60 * 1000) return;
    if (resultsSessionRef.current === sessionStart) return;

    const candidates: CPRBOCandidate[] = [];
    if (status === "done") {
      for (const row of allResults) {
        candidates.push({
          symbol: row.symbol,
          source: "binance",
          tc: row.todayCPR.tc,
          bc: row.todayCPR.bc,
          prevHigh: row.todayCPR.prevHigh,
          prevLow: row.todayCPR.prevLow,
        });
      }
    }
    if (deltaStatus === "done") {
      for (const row of deltaAllResults) {
        candidates.push({
          symbol: row.symbol,
          source: "delta",
          tc: row.todayCPR.tc,
          bc: row.todayCPR.bc,
          prevHigh: row.todayCPR.prevHigh,
          prevLow: row.todayCPR.prevLow,
        });
      }
    }

    const run = ++runRef.current;
    resultsSessionRef.current = sessionStart;
    setProgress({ done: 0, total: candidates.length });
    void findSessionBoundaryMatches(candidates, sessionStart, (done, total) => {
      if (run === runRef.current) setProgress({ done, total });
    }).then(({ cprbo, pdhbo, pdlbo, unavailable }) => {
      if (run !== runRef.current) return;
      setMatches({ cprbo, pdhbo, pdlbo });
      setReady(true);
      setProgress(null);
      setMessage(unavailable > 0
        ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} skipped because none of the four boundary 15m candles were available.`
        : "");
    }).catch((cause: unknown) => {
      if (run !== runRef.current) return;
      setMatches({ cprbo: new Set(), pdhbo: new Set(), pdlbo: new Set() });
      setReady(true);
      setProgress(null);
      setMessage(cause instanceof Error ? `CPRBO scan failed: ${cause.message}` : "CPRBO scan failed.");
    });
    // The candidate lists are sampled when exchange scans complete; price ticks do not rerun this daily candle check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deltaStatus, scanWindow]);

  return {
    cprboFilter: enabled,
    setCprboFilter: setEnabled,
    pdhboFilter: pdhboEnabled,
    setPdhboFilter: setPdhboEnabled,
    pdlboFilter: pdlboEnabled,
    setPdlboFilter: setPdlboEnabled,
    cprboMatches: matches.cprbo,
    pdhboMatches: matches.pdhbo,
    pdlboMatches: matches.pdlbo,
    resetFilters: () => {
      setEnabled(false);
      setPdhboEnabled(false);
      setPdlboEnabled(false);
    },
    cprboProgress: progress,
    cprboReady: ready,
    cprboMessage: message,
  };
}
