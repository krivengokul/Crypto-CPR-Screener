import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type { CPRResult } from "@/lib/cpr";
import { playR1CrossAlert, playS1CrossAlert } from "@/lib/alertSound";
import { getChartUrl, openChartInNewTab } from "@/pages/ScreenerUtils";
import { toast } from "@/hooks/use-toast";

const FIRED_KEY = "cpr-r1-cross-fired";
const MAX_LISTED = 4;

type Source = "binance" | "delta" | "coindcx";
type Cross = { symbol: string; source: Source; price: number; level: number };
type Kind = "R1" | "S1";

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

/** One batched toast for this tick's crosses of a level (R1 breakout / S1 breakdown). */
function showCrossToast(kind: Kind, crosses: Cross[]) {
  const isR1 = kind === "R1";
  const listed = crosses.slice(0, MAX_LISTED);
  const extra = crosses.length - listed.length;
  const word = isR1 ? "Breakout" : "Breakdown";
  const verb = isR1 ? "Above" : "Below";
  const symbolColor = isR1 ? "text-sky-300" : "text-[#ff6bb5]";

  toast({
    title:
      crosses.length === 1
        ? `${kind} ${word} — Price ${verb} ${kind}`
        : `${kind} ${word} — ${crosses.length} coins ${verb} ${kind}`,
    description: (
      <div className="space-y-0.5 text-[13px] leading-snug">
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
            <span className={`font-semibold ${symbolColor}`}>{c.symbol}</span>
            <span className="font-mono text-white">({c.price.toPrecision(6)})</span>
            {" "}
            <span className="text-slate-400">{verb} {kind}</span>
            <span className="font-mono text-slate-100">({c.level.toPrecision(6)})</span>
          </div>
        ))}
        {extra > 0 && <div className="text-slate-400">+{extra} more</div>}
      </div>
    ),
    duration: 10_000,
    className: `cursor-pointer ${isR1 ? "border-sky-500/60" : "border-pink-500/60"}`,
    onClick: (e: ReactMouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[toast-close], [data-radix-toast-close], [data-r1-row]")) return;
      // Coin rows open their own chart; a bare click only opens the chart
      // when the toast lists a single coin.
      if (listed.length === 1) openChartInNewTab(getChartUrl(listed[0].symbol, listed[0].source));
    },
  });
}

/**
 * Screener-only alerts (no Telegram, no Journal):
 *  - price crosses from below to at/above today's R1  → "R1 Breakout" toast + rising chime
 *  - price crosses from above to at/below today's S1  → "S1 Breakdown" toast + falling chime
 * Each fires once per symbol per UTC day per level; the first price seen for a
 * symbol is only a baseline.
 */
export function useLevelCrossAlert(
  binanceResults: CPRResult[],
  deltaResults: CPRResult[],
  coindcxResults: CPRResult[],
) {
  const lastSeen = useRef(new Map<string, { price: number; r1: number; s1: number }>());
  const fired = useRef<Set<string>>(loadFired());
  const firedDay = useRef(utcDay());

  useEffect(() => {
    const today = utcDay();
    if (today !== firedDay.current) {
      firedDay.current = today;
      fired.current.clear();
      saveFired(fired.current);
    }

    const r1Crosses: Cross[] = [];
    const s1Crosses: Cross[] = [];
    const scan = (rows: CPRResult[], source: Source) => {
      for (const r of rows) {
        const r1 = r.todayCPR?.r1;
        const s1 = r.todayCPR?.s1;
        const price = r.currentPrice;
        if (!Number.isFinite(price) || !(price > 0)) continue;
        const hasR1 = Number.isFinite(r1) && r1 > 0;
        const hasS1 = Number.isFinite(s1) && s1 > 0;
        if (!hasR1 && !hasS1) continue;
        const key = `${source}:${r.symbol.toUpperCase()}`;
        const prev = lastSeen.current.get(key);
        lastSeen.current.set(key, { price, r1: hasR1 ? r1 : 0, s1: hasS1 ? s1 : 0 });
        if (!prev) continue;

        // R1 key stays the bare symbol key (compatible with earlier sessions).
        if (hasR1 && prev.r1 === r1 && !fired.current.has(key) && prev.price < r1 && price >= r1) {
          fired.current.add(key);
          r1Crosses.push({ symbol: r.symbol, source, price, level: r1 });
        }
        const s1Key = `${key}:S1`;
        if (hasS1 && prev.s1 === s1 && !fired.current.has(s1Key) && prev.price > s1 && price <= s1) {
          fired.current.add(s1Key);
          s1Crosses.push({ symbol: r.symbol, source, price, level: s1 });
        }
      }
    };
    scan(binanceResults, "binance");
    scan(deltaResults, "delta");
    scan(coindcxResults, "coindcx");

    if (r1Crosses.length === 0 && s1Crosses.length === 0) return;
    saveFired(fired.current);

    // The toast system shows one toast at a time, so each level gets one batched toast.
    if (r1Crosses.length > 0) {
      playR1CrossAlert();
      showCrossToast("R1", r1Crosses);
    }
    if (s1Crosses.length > 0) {
      playS1CrossAlert();
      showCrossToast("S1", s1Crosses);
    }
  }, [binanceResults, deltaResults, coindcxResults]);
}
