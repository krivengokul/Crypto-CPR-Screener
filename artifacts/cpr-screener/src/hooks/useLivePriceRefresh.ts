import { useEffect } from "react";
import type { CPRResult } from "@/lib/cpr";

/**
 * Refreshes Binance live prices every 15s while status === "done".
 * USDⓈ-M perpetual prices take precedence over spot so the displayed price
 * stays aligned with the BINANCE:<SYMBOL>.P TradingView chart.
 */
export function useBinanceLiveRefresh(
  status: "idle" | "scanning" | "done" | "error",
  allResultsRef: React.MutableRefObject<CPRResult[]>,
  setAllResults: React.Dispatch<React.SetStateAction<CPRResult[]>>,
  setFiltered: React.Dispatch<React.SetStateAction<CPRResult[]>>
) {
  useEffect(() => {
    if (status !== "done") return;
    const refresh = async () => {
      const results = allResultsRef.current;
      if (!results.length) {
        console.debug("[binance-live-refresh] tick — no results in ref yet, skipping");
        return;
      }
      try {
        const priceMap = new Map<string, { price: number; change: number }>();
        const [spotRes, futuresRes] = await Promise.all([
          fetch("https://api.binance.com/api/v3/ticker/24hr?type=MINI"),
          fetch("https://fapi.binance.com/fapi/v1/ticker/24hr"),
        ]);
        if (!spotRes.ok && !futuresRes.ok) {
          console.error(
            `[binance-live-refresh] ticker/24hr failed: spot ${spotRes.status}, futures ${futuresRes.status}`
          );
          return;
        }
        type LiveTicker = { symbol: string; lastPrice: string; openPrice: string };
        const [spotTickers, futuresTickers]: [LiveTicker[], LiveTicker[]] = await Promise.all([
          spotRes.ok ? spotRes.json() : Promise.resolve([]),
          futuresRes.ok ? futuresRes.json() : Promise.resolve([]),
        ]);
        // Only keep symbols we actually need — the response covers every
        // Binance symbol, not just the ones currently in `results`.
        const wanted = new Set(results.map((r) => r.symbol));
        const addTickers = (tickers: LiveTicker[]) => tickers.forEach((t) => {
          if (!wanted.has(t.symbol)) return;
          const price = parseFloat(t.lastPrice);
          const open  = parseFloat(t.openPrice);
          if (!Number.isFinite(price) || price <= 0) return;
          priceMap.set(t.symbol, { price, change: open > 0 ? ((price - open) / open) * 100 : 0 });
        });
        // Match binance.ts: spot is fallback; perpetual overwrites collisions.
        addTickers(spotTickers);
        addTickers(futuresTickers);
        // Use r.openPrice (the 5:30 AM IST baseline) for % calc
        const apply = (prev: CPRResult[]): CPRResult[] =>
          prev.map((r) => {
            const live = priceMap.get(r.symbol);
            if (!live) return r;
            const change24h = r.openPrice > 0
              ? ((live.price - r.openPrice) / r.openPrice) * 100
              : live.change; // fallback
            return { ...r, currentPrice: live.price, change24h };
          });
        setAllResults((p) => apply(p));
        setFiltered((p) => apply(p));
      } catch (err) {
        console.error("[binance-live-refresh] refresh cycle threw", err);
      }
    };
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [status, allResultsRef, setAllResults, setFiltered]);
}

/**
 * Refreshes Delta Exchange live prices every 15s while deltaStatus === "done".
 * Behavior is unchanged from the original inline effect in Screener.tsx —
 * this is a mechanical extraction only.
 */
export function useDeltaLiveRefresh(
  deltaStatus: "idle" | "scanning" | "done" | "error",
  deltaAllResultsRef: React.MutableRefObject<CPRResult[]>,
  setDeltaAllResults: React.Dispatch<React.SetStateAction<CPRResult[]>>,
  setDeltaFiltered: React.Dispatch<React.SetStateAction<CPRResult[]>>
) {
  useEffect(() => {
    if (deltaStatus !== "done") return;
    const refresh = async () => {
      const results = deltaAllResultsRef.current;
      if (!results.length) {
        console.debug("[delta-live-refresh] tick — no results in ref yet, skipping");
        return;
      }
      try {
        const res = await fetch(
          "https://api.india.delta.exchange/v2/tickers?contract_types=perpetual_futures&page_size=500",
          { cache: "no-store" }
        );
        if (!res.ok) {
          console.error(`[delta-live-refresh] tickers ${res.status} ${res.statusText}`, await res.text().catch(() => ""));
          return;
        }
        const data = await res.json();
        const tickers: Array<{ symbol: string; mark_price: string; ltp_change_24h: string }> =
          (data.result ?? []) as Array<{ symbol: string; mark_price: string; ltp_change_24h: string }>;
        const priceMap = new Map(tickers.map((t) => [t.symbol, t]));
        const apply = (prev: CPRResult[]): CPRResult[] =>
          prev.map((r) => {
            const t = priceMap.get(r.symbol);
            if (!t) return r;
            const price = parseFloat(t.mark_price);
            if (price <= 0) return r;
            const change24h = r.openPrice > 0
              ? ((price - r.openPrice) / r.openPrice) * 100
              : parseFloat(t.ltp_change_24h); // fallback
            return { ...r, currentPrice: price, change24h };
          });
        setDeltaAllResults((p) => apply(p));
        setDeltaFiltered((p) => apply(p));
      } catch (err) {
        console.error("[delta-live-refresh] refresh cycle threw", err);
      }
    };
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [deltaStatus, deltaAllResultsRef, setDeltaAllResults, setDeltaFiltered]);
}
