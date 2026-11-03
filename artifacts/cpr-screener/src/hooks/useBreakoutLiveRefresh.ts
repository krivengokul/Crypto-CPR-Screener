import { useEffect } from "react";
import type { CPRResult, OHLC } from "@/lib/cpr";
import {
  analyzeBreakout,
  analyzeBreakdown,
  levelsFromCPR,
  levelsFromCPRDown,
  type BreakoutResult,
} from "@/lib/breakout";

/** How often BRK / BRKDN badges are recomputed while a scan is "done". */
const BREAKOUT_POLL_MS = 60_000;
/** Max symbols re-checked per cycle (strongest |24h| movers first). */
const MAX_CANDIDATES = 150;
const CONCURRENCY = 6;

/**
 * Rows worth re-checking for BRK or BRKDN: already signaling, or price is
 * outside the nearest upside/downside pivot band.
 */
function pickCandidates(results: CPRResult[]): CPRResult[] {
  const out = results.filter((r) => {
    if (!(r.currentPrice > 0)) return false;
    if (r.breakout?.signal || r.breakdown?.signal) return true;
    const up = Object.values(levelsFromCPR(r.todayCPR));
    const down = Object.values(levelsFromCPRDown(r.todayCPR));
    if (up.length > 0 && r.currentPrice > Math.min(...up)) return true;
    if (down.length > 0 && r.currentPrice < Math.max(...down)) return true;
    return false;
  });
  out.sort((a, b) => {
    const sa = a.breakout?.signal || a.breakdown?.signal ? 1 : 0;
    const sb = b.breakout?.signal || b.breakdown?.signal ? 1 : 0;
    return sb - sa || Math.abs(b.change24h) - Math.abs(a.change24h);
  });
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * Keeps BRK and BRKDN badges live (scan computes them once from closed 15m;
 * this re-fetches including the forming candle every minute).
 */
export function useBreakoutLiveRefresh(
  status: "idle" | "scanning" | "done" | "error",
  allResultsRef: React.MutableRefObject<CPRResult[]>,
  setAllResults: React.Dispatch<React.SetStateAction<CPRResult[]>>,
  setFiltered: React.Dispatch<React.SetStateAction<CPRResult[]>>,
  fetchCandles: (symbol: string) => Promise<OHLC[] | null>,
  logPrefix: string,
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

        const updates = new Map<
          string,
          { breakout?: BreakoutResult; breakdown?: BreakoutResult }
        >();
        let next = 0;
        const worker = async () => {
          while (!cancelled) {
            const r = candidates[next++];
            if (!r) return;
            try {
              const candles = await fetchCandles(r.symbol);
              if (!candles) continue;
              updates.set(r.symbol, {
                breakout: analyzeBreakout(candles, levelsFromCPR(r.todayCPR)) ?? undefined,
                breakdown:
                  analyzeBreakdown(candles, levelsFromCPRDown(r.todayCPR)) ?? undefined,
              });
            } catch (e) {
              console.warn(`[${logPrefix}] breakout refresh failed for ${r.symbol}`, e);
            }
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));

        if (cancelled || updates.size === 0) return;
        const apply = (prev: CPRResult[]) =>
          prev.map((r) => {
            const u = updates.get(r.symbol);
            if (!u) return r;
            return { ...r, breakout: u.breakout, breakdown: u.breakdown };
          });
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
