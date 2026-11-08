import { useEffect } from "react";
import type { CPRResult, OHLC } from "@/lib/cpr";
import {
  analyzeBreakout,
  analyzeBreakdown,
  analyzeStrongBar,
  levelsFromCPR,
  levelsFromCPRDown,
  type BreakoutResult,
  type StrongBarResult,
} from "@/lib/breakout";

/** How often BRK / BRKDN / BIG badges are recomputed while a scan is "done". */
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const BREAKOUT_POLL_MS = 60_000;
/** Max symbols re-checked per cycle (strongest |24h| movers first). */
const MAX_CANDIDATES = 150;
const CONCURRENCY = 6;

/**
 * Rows worth re-checking, in priority order: already signaling (BRK / BRKDN /
 * BIG, so stale badges expire), then price outside the nearest upside/downside
 * pivot band, then everything else. Within a group the strongest |24h| movers
 * go first, and the list is capped at MAX_CANDIDATES. (A BIG bar can happen
 * anywhere, so in-band rows fill whatever slots the first two groups leave.)
 */
function pickCandidates(results: CPRResult[]): CPRResult[] {
  const rank = (r: CPRResult): number => {
    if (r.breakout?.signal || r.breakdown?.signal || r.strongBar?.signal) return 0;
    const up = Object.values(levelsFromCPR(r.todayCPR));
    const down = Object.values(levelsFromCPRDown(r.todayCPR));
    if (up.length > 0 && r.currentPrice > Math.min(...up)) return 1;
    if (down.length > 0 && r.currentPrice < Math.max(...down)) return 1;
    return 2;
  };
  const out = results.filter((r) => r.currentPrice > 0);
  out.sort((a, b) => rank(a) - rank(b) || Math.abs(b.change24h) - Math.abs(a.change24h));
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * Keeps BRK, BRKDN and BIG↑/BIG↓ badges live (scan computes them once from
 * closed 15m; this re-fetches every minute). BRK/BRKDN include the forming
 * candle; BIG uses CLOSED candles only, like the scan.
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
          { breakout?: BreakoutResult; breakdown?: BreakoutResult; strongBar?: StrongBarResult }
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
                strongBar:
                  analyzeStrongBar(
                    candles.filter((c) => c.openTime + FIFTEEN_MIN_MS <= Date.now()),
                  ) ?? undefined,
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
            return { ...r, breakout: u.breakout, breakdown: u.breakdown, strongBar: u.strongBar };
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
