import { useEffect, useRef, useState } from "react";
import type { CPRResult } from "@/lib/cpr";
import {
  currentReclaimWindowMs,
  currentSessionStartUtcMs,
  findCPRBOSymbols,
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
  const [symbols, setSymbols] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [scanWindow, setScanWindow] = useState(() => currentReclaimWindowMs());
  const sessionRef = useRef(currentSessionStartUtcMs());
  const resultsSessionRef = useRef<number | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      const next = currentReclaimWindowMs();
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
      setSymbols(new Set());
      setReady(false);
      setMessage("");
    }

    if (status === "scanning" || deltaStatus === "scanning") {
      // Rescan any source that finishes after this in-progress scan.
      resultsSessionRef.current = null;
      return;
    }
    if (status !== "done" && deltaStatus !== "done") return;
    // Wait until the first 00:00–00:15 UTC (05:30–05:45 IST) candle is final.
    if (scanWindow < sessionStart + 15 * 60 * 1000) return;
    if (resultsSessionRef.current === sessionStart) return;

    const candidates: CPRBOCandidate[] = [];
    if (status === "done") {
      for (const row of allResults) {
        candidates.push({
          symbol: row.symbol,
          source: "binance",
          tc: row.todayCPR.tc,
          bc: row.todayCPR.bc,
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
        });
      }
    }

    const run = ++runRef.current;
    resultsSessionRef.current = sessionStart;
    setProgress({ done: 0, total: candidates.length });
    void findCPRBOSymbols(candidates, sessionStart, (done, total) => {
      if (run === runRef.current) setProgress({ done, total });
    }).then(({ symbols: matches, unavailable }) => {
      if (run !== runRef.current) return;
      setSymbols(matches);
      setReady(true);
      setProgress(null);
      setMessage(unavailable > 0
        ? `${unavailable} symbol${unavailable === 1 ? "" : "s"} skipped because the first session 15m candle was unavailable.`
        : "");
    }).catch((cause: unknown) => {
      if (run !== runRef.current) return;
      setSymbols(new Set());
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
    cprboMatches: symbols,
    cprboProgress: progress,
    cprboReady: ready,
    cprboMessage: message,
  };
}
