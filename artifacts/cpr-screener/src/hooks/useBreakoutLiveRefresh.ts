import { useEffect } from "react";
import type { CPRResult, OHLC } from "@/lib/cpr";
import { analyzeBreakout, levelsFromCPR, type BreakoutResult } from "@/lib/breakout";

/** How often the momentum-breakout (BRK) badge is recomputed while a scan is "done". */
const BREAKOUT_POLL_MS = 60_000;
/** Max symbols re-checked per cycle (strongest 24h movers first) to keep API load low. */
const MAX_CANDIDATES = 150;
const CONCURRENCY = 6;

/**
 * Rows worth re-checking: price is above the lowest pivot level (a breakout
 * candle must have closed through one), or the row already carries a BRK
 * signal that needs to expire/refresh. Strongest 24h movers go first.
 */
function pickCandidates(results: CPRResult[]): CPRResult[] {
  const out = results.filter((r) => {
    if (!(r.currentPrice > 0)) return false;
    if (r.breakout?.signal) return true;
    const lv = Object.values(levelsFromCPR(r.todayCPR));
    return lv.length > 0 && r.currentPrice > Math.min(...lv);
  });
  out.sort((a, b) => {
    const sa = a.breakout?.signal ? 1 : 0;
    const sb = b.breakout?.signal ? 1 : 0;
    return sb - sa || b.change24h - a.change24h;
  });
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * Keeps the BRK badge live. The scan computes `breakout` once from closed 15m
 * candles; without this hook it would stay frozen until the next scan while
 * live prices keep moving. Every minute this re-fetches a short run of 15m
 * candles (INCLUDING the forming one) for the candidate rows and re-runs the
 * detector, so a volume spike through a level is flagged as it happens.
 */
export function useBreakoutLiveRefresh(
  status: "idle" | "scanning" | "done" | "error",
  allResultsRef: React.MutableRefObject<CPRResult[]>,
  setAllResults: React.Dispatch<React.SetStateAction<CPRResult[]>>,
  setFiltered: React.Dispatch<React.SetStateAction<CPRResult[]>>,
  fetchCandles: (symbol: string) => Promise<OHLC[] | null>,
  logPrefix: string
) {
  useEffect(() => {
    if (status !== "done") return;

    let cancelled = false;
    let running = false;

    const refresh = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (running || cancelled) return;
      running = true;

      try {
        const candidates = pickCandidates(allResultsRef.current);
        if (!candidates.length) return;

        const updates = new Map<string, BreakoutResult | undefined>();
        let next = 0;
        const worker = async () => {
          while (!cancelled) {
            const r = candidates[next++];
            if (!r) return;
            try {
              const candles = await fetchCandles(r.symbol);
              if (!candles) continue; // fetch failed: keep the previous badge
              updates.set(
                r.symbol,
                analyzeBreakout(candles, levelsFromCPR(r.todayCPR)) ?? undefined
              );
            } catch (e) {
              console.warn(`[${logPrefix}] breakout refresh failed for ${r.symbol}`, e);
            }
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));

        if (cancelled || updates.size === 0) return;
        const apply = (prev: CPRResult[]) =>
          prev.map((r) => (updates.has(r.symbol) ? { ...r, breakout: updates.get(r.symbol) } : r));
        setAllResults(apply);
        setFiltered(apply);
      } catch (err) {
        console.warn(`[${logPrefix}] breakout refresh cycle skipped:`, err);
      } finally {
        running = false;
      }
    };

    void refresh();
    const id = window.setInterval(() => void refresh(), BREAKOUT_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, allResultsRef, setAllResults, setFiltered, fetchCandles, logPrefix]);
}
