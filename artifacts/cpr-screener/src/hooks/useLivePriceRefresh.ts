import { useEffect } from "react";
import type { CPRResult } from "@/lib/cpr";

/**
 * Refreshes Binance live prices every 30s while status === "done".
 * Behavior is unchanged from the original inline effect in Screener.tsx —
 * this is a mechanical extraction only.
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
      if (!results.length) return;
      try {
        const symbols = results.map((r) => r.symbol);
        const chunks: string[][] = [];
        for (let i = 0; i < symbols.length; i += 100) chunks.push(symbols.slice(i, i + 100));
        const priceMap = new Map<string, { price: number; change: number }>();
        await Promise.all(
          chunks.map(async (chunk) => {
            const res = await fetch(
              `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(chunk))}&type=MINI`
            );
            if (!res.ok) return;
            const tickers: Array<{ symbol: string; lastPrice: string; openPrice: string }> = await res.json();
            tickers.forEach((t) => {
              const price = parseFloat(t.lastPrice);
              const open  = parseFloat(t.openPrice);
              priceMap.set(t.symbol, { price, change: open > 0 ? ((price - open) / open) * 100 : 0 });
            });
          })
        );
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
      } catch { /* silent */ }
    };
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [status, allResultsRef, setAllResults, setFiltered]);
}

/**
 * Refreshes Delta Exchange live prices every 30s while deltaStatus === "done".
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
      if (!results.length) return;
      try {
        const res = await fetch(
          "https://api.india.delta.exchange/v2/tickers?contract_types=perpetual_futures&page_size=500",
          { cache: "no-store" }
        );
        if (!res.ok) return;
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
      } catch { /* silent */ }
    };
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [deltaStatus, deltaAllResultsRef, setDeltaAllResults, setDeltaFiltered]);
}
