import { useEffect, useRef } from "react";
import type { CPRResult } from "@/lib/cpr";
import { fetchCoinDCXLastPrices } from "@/lib/coinDCX";

// Missed-tick warning: ~3 × poll interval with no match → log once.
const MAX_MISSED_TICKS = 3;

// Log-only: large single-tick jumps are still applied (so a stale price can
// correct), but we want visibility when something looks wrong.
const SANITY_JUMP_RATIO = 0.5;

/** Poll cadence for live prices while a scan is "done". */
const LIVE_PRICE_POLL_MS = 40_000;

/**
 * Keeps the row's session high/low (todayHigh/todayLow) current between scans:
 * every live tick can only widen them. Lets a "Pass" stay latched if price
 * touches the target then retraces before the next full scan.
 */
function trackSessionExtremes(
  r: CPRResult,
  price: number
): { todayHigh: number; todayLow: number } {
  return {
    todayHigh:
      r.todayHigh !== undefined && Number.isFinite(r.todayHigh)
        ? Math.max(r.todayHigh, price)
        : price,
    todayLow:
      r.todayLow !== undefined && Number.isFinite(r.todayLow) && r.todayLow > 0
        ? Math.min(r.todayLow, price)
        : price,
  };
}

/**
 * Apply a price map to a results array. Returns the same array reference
 * when nothing changed (avoids a React re-render).
 */
function applyPrices(
  prev: CPRResult[],
  priceMap: Map<string, number>,
  opts: {
    missedTicks?: Map<string, number>;
    logPrefix?: string;
    fallbackChange?: (r: CPRResult, price: number) => number;
  } = {}
): CPRResult[] {
  const { missedTicks, logPrefix = "live-refresh", fallbackChange } = opts;
  let changed = false;

  const next = prev.map((r) => {
    const price = priceMap.get(r.symbol);
    if (price === undefined || !(price > 0)) {
      if (missedTicks) {
        const misses = (missedTicks.get(r.symbol) ?? 0) + 1;
        missedTicks.set(r.symbol, misses);
        if (misses === MAX_MISSED_TICKS) {
          console.warn(
            `[${logPrefix}] ${r.symbol} missing from ticker responses for ` +
              `${misses} consecutive ticks (~${misses * (LIVE_PRICE_POLL_MS / 1000)}s) — ` +
              `currentPrice is now stale (last known: ${r.currentPrice}).`
          );
        }
      }
      return r;
    }
    missedTicks?.delete(r.symbol);

    if (
      r.currentPrice > 0 &&
      Math.abs(price - r.currentPrice) / r.currentPrice > SANITY_JUMP_RATIO
    ) {
      console.warn(
        `[${logPrefix}] ${r.symbol} — large single-tick price jump ` +
          `(${r.currentPrice} → ${price}, >${SANITY_JUMP_RATIO * 100}%). Applying anyway.`
      );
    }

    // Skip object allocation when price (and thus extremes) are unchanged.
    if (price === r.currentPrice) return r;

    changed = true;
    const change24h =
      r.openPrice > 0
        ? ((price - r.openPrice) / r.openPrice) * 100
        : fallbackChange
          ? fallbackChange(r, price)
          : r.change24h;

    return {
      ...r,
      currentPrice: price,
      change24h,
      ...trackSessionExtremes(r, price),
    };
  });

  return changed ? next : prev;
}

async function safeFetchJson<T>(url: string, timeoutMs = 6000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Binance live prices while status === "done".
 * Uses lightweight /fapi/v1/ticker/price (not the heavy 24hr book).
 * Spot is only used as fallback for symbols missing from futures.
 */
export function useBinanceLiveRefresh(
  status: "idle" | "scanning" | "done" | "error",
  allResultsRef: React.MutableRefObject<CPRResult[]>,
  setAllResults: React.Dispatch<React.SetStateAction<CPRResult[]>>,
  setFiltered: React.Dispatch<React.SetStateAction<CPRResult[]>>
) {
  const missedTicksRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (status !== "done") return;

    let cancelled = false;
    let running = false;

    const refresh = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (running || cancelled) return;
      running = true;

      try {
        const results = allResultsRef.current;
        if (!results.length) return;

        const wanted = new Set(results.map((r) => r.symbol));

        // Primary: futures last price only (much smaller than ticker/24hr).
        type PriceRow = { symbol: string; price: string };
        const futuresRows =
          (await safeFetchJson<PriceRow[]>("https://fapi.binance.com/fapi/v1/ticker/price")) ?? [];

        const priceMap = new Map<string, number>();
        for (const t of futuresRows) {
          if (!wanted.has(t.symbol)) continue;
          const p = parseFloat(t.price);
          if (Number.isFinite(p) && p > 0) priceMap.set(t.symbol, p);
        }

        // Optional spot fallback only for symbols still missing.
        if (priceMap.size < wanted.size) {
          type MiniTicker = { symbol: string; lastPrice?: string; c?: string };
          const spot =
            (await safeFetchJson<MiniTicker[]>(
              "https://api.binance.com/api/v3/ticker/24hr?type=MINI"
            )) ??
            (await safeFetchJson<MiniTicker[]>(
              "https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI"
            )) ??
            [];
          for (const t of spot) {
            if (!wanted.has(t.symbol) || priceMap.has(t.symbol)) continue;
            const p = parseFloat(t.lastPrice ?? t.c ?? "");
            if (Number.isFinite(p) && p > 0) priceMap.set(t.symbol, p);
          }
        }

        if (priceMap.size === 0) return;

        const apply = (prev: CPRResult[]) =>
          applyPrices(prev, priceMap, {
            missedTicks: missedTicksRef.current,
            logPrefix: "binance-live-refresh",
          });

        if (cancelled) return;
        // Keep filtered in sync without re-running passesPattern (Screener
        // still holds a parallel filtered array for the table).
        setAllResults(apply);
        setFiltered(apply);
      } catch (err) {
        console.warn("[binance-live-refresh] refresh cycle skipped:", err);
      } finally {
        running = false;
      }
    };

    void refresh();
    const id = window.setInterval(() => void refresh(), LIVE_PRICE_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, allResultsRef, setAllResults, setFiltered]);
}

/**
 * Delta live prices while deltaStatus === "done".
 * Still one page of tickers; filtered to symbols currently in results.
 */
export function useDeltaLiveRefresh(
  deltaStatus: "idle" | "scanning" | "done" | "error",
  deltaAllResultsRef: React.MutableRefObject<CPRResult[]>,
  setDeltaAllResults: React.Dispatch<React.SetStateAction<CPRResult[]>>,
  setDeltaFiltered: React.Dispatch<React.SetStateAction<CPRResult[]>>
) {
  useEffect(() => {
    if (deltaStatus !== "done") return;

    let cancelled = false;
    let running = false;

    const refresh = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (running || cancelled) return;
      running = true;

      try {
        const results = deltaAllResultsRef.current;
        if (!results.length) return;

        const wanted = new Set(results.map((r) => r.symbol));
        const res = await fetch(
          "https://api.india.delta.exchange/v2/tickers?contract_types=perpetual_futures&page_size=500",
          { cache: "no-store" }
        );
        if (!res.ok) {
          console.error(
            `[delta-live-refresh] tickers ${res.status} ${res.statusText}`,
            await res.text().catch(() => "")
          );
          return;
        }
        const data = await res.json();
        const tickers: Array<{
          symbol: string;
          mark_price: string;
          ltp_change_24h: string;
        }> = (data.result ?? []) as Array<{
          symbol: string;
          mark_price: string;
          ltp_change_24h: string;
        }>;

        const priceMap = new Map<string, number>();
        const changeFallback = new Map<string, number>();
        for (const t of tickers) {
          if (!wanted.has(t.symbol)) continue;
          const price = parseFloat(t.mark_price);
          if (price > 0) {
            priceMap.set(t.symbol, price);
            const ch = parseFloat(t.ltp_change_24h);
            if (Number.isFinite(ch)) changeFallback.set(t.symbol, ch);
          }
        }
        if (priceMap.size === 0) return;

        const apply = (prev: CPRResult[]) =>
          applyPrices(prev, priceMap, {
            logPrefix: "delta-live-refresh",
            fallbackChange: (r) => changeFallback.get(r.symbol) ?? r.change24h,
          });

        if (cancelled) return;
        setDeltaAllResults(apply);
        setDeltaFiltered(apply);
      } catch (err) {
        console.warn("[delta-live-refresh] refresh cycle skipped:", err);
      } finally {
        running = false;
      }
    };

    void refresh();
    const id = window.setInterval(() => void refresh(), LIVE_PRICE_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deltaStatus, deltaAllResultsRef, setDeltaAllResults, setDeltaFiltered]);
}

/**
 * CoinDCX live prices while status === "done".
 */
export function useCoinDCXLiveRefresh(
  status: "idle" | "scanning" | "done" | "error",
  coindcxAllResultsRef: React.MutableRefObject<CPRResult[]>,
  setCoinDCXAllResults: React.Dispatch<React.SetStateAction<CPRResult[]>>,
  setCoinDCXFiltered: React.Dispatch<React.SetStateAction<CPRResult[]>>
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
        const results = coindcxAllResultsRef.current;
        if (!results.length) return;

        // Single attempt; next poll is the retry.
        const raw = await fetchCoinDCXLastPrices(1);
        if (raw.size === 0) return;

        const wanted = new Set(results.map((r) => r.symbol));
        const priceMap = new Map<string, number>();
        raw.forEach((price, symbol) => {
          if (wanted.has(symbol) && price > 0) priceMap.set(symbol, price);
        });
        if (priceMap.size === 0) return;

        const apply = (prev: CPRResult[]) =>
          applyPrices(prev, priceMap, { logPrefix: "coindcx-live-refresh" });

        if (cancelled) return;
        setCoinDCXAllResults(apply);
        setCoinDCXFiltered(apply);
      } catch (err) {
        console.warn("[coindcx-live-refresh] refresh cycle skipped:", err);
      } finally {
        running = false;
      }
    };

    void refresh();
    const id = window.setInterval(() => void refresh(), LIVE_PRICE_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, coindcxAllResultsRef, setCoinDCXAllResults, setCoinDCXFiltered]);
}
