/**
 * shimFetch — serves Binance futures klines from local files, so the app's
 * own backtest code can run where Binance's live API is blocked (GitHub
 * Actions, Google Colab, ...).
 *
 * The app code is NOT modified. The runner replaces `globalThis.fetch` with
 * this shim; the only URL it answers is
 *   https://fapi.binance.com/fapi/v1/klines?symbol=…&interval=…
 *       [&limit=…][&startTime=…][&endTime=…]
 * with the same JSON shape Binance returns. Any other URL gets a 404 and is
 * counted, so an unexpected network dependency shows up in the final report
 * instead of silently going to the real network.
 *
 * File layout (written by download_klines.py):
 *   <dataDir>/klines/<SYMBOL>/<interval>.csv
 * Each line is a raw Binance kline row, no header, sorted by open time:
 *   openTime,open,high,low,close,volume,closeTime,quoteVolume,count,
 *   takerBuyBase,takerBuyQuote,ignore
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Row = (string | number)[];

const KLINES_PREFIX = "https://fapi.binance.com/fapi/v1/klines";

export interface ShimStats {
  klineRequests: number;
  unknownSymbol: Set<string>;
  blockedUrls: Map<string, number>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function installKlineShim(dataDir: string) {
  const cache = new Map<string, Row[] | null>();
  const stats: ShimStats = {
    klineRequests: 0,
    unknownSymbol: new Set(),
    blockedUrls: new Map(),
  };

  function load(symbol: string, interval: string): Row[] | null {
    const key = `${symbol}/${interval}`;
    if (cache.has(key)) return cache.get(key)!;
    const file = join(dataDir, "klines", symbol, `${interval}.csv`);
    let rows: Row[] | null = null;
    if (existsSync(file)) {
      rows = readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => {
          const p = l.split(",");
          // Binance's JSON puts prices/volumes as strings, times as numbers.
          return [
            Number(p[0]), p[1], p[2], p[3], p[4], p[5],
            Number(p[6]), p[7], Number(p[8]), p[9], p[10], p[11] ?? "0",
          ];
        });
    }
    cache.set(key, rows);
    return rows;
  }

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(KLINES_PREFIX)) {
      const host = new URL(url).host;
      stats.blockedUrls.set(host, (stats.blockedUrls.get(host) ?? 0) + 1);
      return json({ code: -1, msg: "offline-grader: network disabled" }, 404);
    }
    stats.klineRequests++;
    const q = new URL(url).searchParams;
    const symbol = q.get("symbol") ?? "";
    const interval = q.get("interval") ?? "";
    const rows = load(symbol, interval);
    if (!rows) {
      stats.unknownSymbol.add(`${symbol}/${interval}`);
      return json({ code: -1121, msg: "Invalid symbol." }, 400);
    }
    const limit = Math.min(Number(q.get("limit") ?? 500) || 500, 1500);
    const start = q.get("startTime");
    const end = q.get("endTime");
    let out: Row[];
    if (start !== null || end !== null) {
      const s = start !== null ? Number(start) : -Infinity;
      const e = end !== null ? Number(end) : Infinity;
      out = rows.filter((r) => (r[0] as number) >= s && (r[0] as number) <= e).slice(0, limit);
    } else {
      // No time bounds: Binance returns the MOST RECENT `limit` candles.
      out = rows.slice(-limit);
    }
    return json(out);
  }) as typeof fetch;

  return { stats, restore: () => { globalThis.fetch = realFetch; }, load };
}
