import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type { CPRResult } from "@/lib/cpr";
import { playR1CrossAlert } from "@/lib/alertSound";
import { getChartUrl, openChartInNewTab } from "@/pages/ScreenerUtils";
import { toast } from "@/hooks/use-toast";

const FIRED_KEY = "cpr-r1-cross-fired";
const MAX_LISTED = 4;

type Source = "binance" | "delta" | "coindcx";
type Cross = { symbol: string; source: Source; price: number; r1: number };

const utcDay = () => new Date().toISOString().slice(0, 10);

function loadFired(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { day?: string; keys?: string[] };
    if (parsed.day !== utcDay() || !Array.isArray(parsed.keys)) return new Set();
    return new Set(parsed.keys);
  } catch {
    return new Set();
  }
}

function saveFired(keys: Set<string>) {
  try {
    sessionStorage.setItem(FIRED_KEY, JSON.stringify({ day: utcDay(), keys: [...keys] }));
  } catch { /* in-memory only */ }
}

/**
 * Screener-only alert: when a scanned coin's live price crosses from below to
 * at/above today's R1, play a distinct chime and show a distinct toast.
 * Deliberately NOT wired to Telegram or the Journal. Fires once per symbol per
 * UTC day; the first price seen for a symbol is only a baseline.
 */
export function useR1CrossAlert(
  binanceResults: CPRResult[],
  deltaResults: CPRResult[],
  coindcxResults: CPRResult[],
) {
  const lastSeen = useRef(new Map<string, { price: number; r1: number }>());
  const fired = useRef<Set<string>>(loadFired());
  const firedDay = useRef(utcDay());

  useEffect(() => {
    const today = utcDay();
    if (today !== firedDay.current) {
      firedDay.current = today;
      fired.current.clear();
      saveFired(fired.current);
    }

    const crosses: Cross[] = [];
    const scan = (rows: CPRResult[], source: Source) => {
      for (const r of rows) {
        const r1 = r.todayCPR?.r1;
        const price = r.currentPrice;
        if (!Number.isFinite(r1) || !(r1 > 0) || !Number.isFinite(price) || !(price > 0)) continue;
        const key = `${source}:${r.symbol.toUpperCase()}`;
        const prev = lastSeen.current.get(key);
        lastSeen.current.set(key, { price, r1 });
        // Need a prior price against the same R1 (a new day/scan can change R1).
        if (!prev || prev.r1 !== r1) continue;
        if (fired.current.has(key)) continue;
        if (prev.price < r1 && price >= r1) {
          fired.current.add(key);
          crosses.push({ symbol: r.symbol, source, price, r1 });
        }
      }
    };
    scan(binanceResults, "binance");
    scan(deltaResults, "delta");
    scan(coindcxResults, "coindcx");

    if (crosses.length === 0) return;
    saveFired(fired.current);
    playR1CrossAlert();

    // The toast system shows one toast at a time, so batch this tick's crosses.
    const listed = crosses.slice(0, MAX_LISTED);
    const extra = crosses.length - listed.length;
    toast({
      title: crosses.length === 1 ? "R1 breakout — price above R1" : `R1 breakout — ${crosses.length} coins above R1`,
      description: (
        <div className="space-y-0.5 text-sm leading-snug">
          {listed.map((c) => (
            <div
              key={`${c.source}:${c.symbol}`}
              data-r1-row
              className="cursor-pointer rounded px-0.5 hover:bg-slate-700/40"
              title={`Open ${c.symbol} chart`}
              onClick={(e: ReactMouseEvent) => {
                e.stopPropagation();
                openChartInNewTab(getChartUrl(c.symbol, c.source));
              }}
            >
              <span className="font-semibold text-sky-300">{c.symbol}</span>{" "}
              <span className="text-slate-400">({c.source})</span>{" "}
              <span className="text-slate-400">R1</span>{" "}
              <span className="font-mono text-slate-100">{c.r1.toPrecision(6)}</span>
              {"  "}
              <span className="text-slate-400">Price</span>{" "}
              <span className="font-mono text-slate-100">{c.price.toPrecision(6)}</span>
            </div>
          ))}
          {extra > 0 && <div className="text-slate-400">+{extra} more</div>}
        </div>
      ),
      duration: 10_000,
      className: "cursor-pointer border-sky-500/60",
      onClick: (e: ReactMouseEvent) => {
        const el = e.target as HTMLElement | null;
        if (el?.closest?.("[toast-close], [data-radix-toast-close], [data-r1-row]")) return;
        // Coin rows open their own chart; a bare click only opens the chart
        // when the toast lists a single coin.
        if (listed.length === 1) openChartInNewTab(getChartUrl(listed[0].symbol, listed[0].source));
      },
    });
  }, [binanceResults, deltaResults, coindcxResults]);
}
