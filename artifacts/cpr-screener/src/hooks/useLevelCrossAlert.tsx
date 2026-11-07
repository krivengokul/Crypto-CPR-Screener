import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type { CPRResult } from "@/lib/cpr";
import { playR1CrossAlert, playS1CrossAlert } from "@/lib/alertSound";
import { getChartUrl, openChartInNewTab } from "@/pages/ScreenerUtils";
import { toast } from "@/hooks/use-toast";

const FIRED_KEY = "cpr-r1-cross-fired";
const MAX_LISTED = 4;

type Source = "binance" | "delta" | "coindcx";
type Cross = {
  symbol: string;
  source: Source;
  /** Exclusive PP label already on the row, e.g. "PP-MOM-A". */
  ppLabel: string;
};
type Kind = "R1" | "S1";

/** Row handed to the PP resolver — the hook always attaches its exchange `source`. */
export type LevelCrossRow = CPRResult & { source: string };

/**
 * Resolve exclusive PP badge text for level-cross toasts.
 * Same priority as Screener: PP-CON-B > PP-MOM-B > PP-CON-A > PP-MOM-A > PP-VOL-C > PP-VOL-A > PP-VOL-B.
 */
export type GetPPLabel = (row: LevelCrossRow) => string | null;

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
  } catch {
    /* in-memory only */
  }
}

/** One batched toast — no header, no price/level; body only + PP label. */
function showCrossToast(kind: Kind, crosses: Cross[]) {
  const isR1 = kind === "R1";
  const listed = crosses.slice(0, MAX_LISTED);
  const extra = crosses.length - listed.length;
  // Capital C: "Crossed R1" / "Crossed S1"
  const verb = isR1 ? "Crossed R1" : "Crossed S1";
  const symbolColor = isR1 ? "text-emerald-400" : "text-[#ff6bb5]";
  const borderClass = isR1
    ? "cursor-default border border-emerald-500/70 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
    : "cursor-default border border-pink-500/50";

  toast({
    // No "R1 cross (PP)" header — description is the full message.
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
            <span className="text-slate-300"> {verb} </span>
            <span className="font-mono text-[11px] font-semibold text-fuchsia-300">
              ({c.ppLabel})
            </span>
          </div>
        ))}
        {extra > 0 && (
          <div className="text-slate-400 text-[12px]">+{extra} more</div>
        )}
      </div>
    ),
    duration: 10_000,
    className: borderClass,
    onClick: (e: ReactMouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[toast-close], [data-radix-toast-close], [data-r1-row]")) return;
      const first = crosses[0];
      if (first) openChartInNewTab(getChartUrl(first.symbol, first.source));
    },
  });
}

/**
 * R1 / S1 cross toasts — only for symbols that currently carry an exclusive PP- badge.
 * No price/level values in the message; format: "SYMBOL crossed R1 (PP-MOM-A)".
 *
 * @param getPPLabel return e.g. "PP-CON-B" or null to skip the symbol.
 */
export function useLevelCrossAlert(
  binanceResults: CPRResult[] | null | undefined,
  deltaResults: CPRResult[] | null | undefined,
  coindcxResults: CPRResult[] | null | undefined,
  getPPLabel?: GetPPLabel,
) {
  const fired = useRef<Set<string>>(loadFired());
  const lastPrice = useRef<Map<string, number>>(new Map());
  // Keep latest resolver without re-subscribing the effect on every render.
  const getPPLabelRef = useRef<GetPPLabel | undefined>(getPPLabel);
  getPPLabelRef.current = getPPLabel;

  useEffect(() => {
    const pools: { rows: CPRResult[]; source: Source }[] = [];
    if (binanceResults?.length) pools.push({ rows: binanceResults, source: "binance" });
    if (deltaResults?.length) pools.push({ rows: deltaResults, source: "delta" });
    if (coindcxResults?.length) pools.push({ rows: coindcxResults, source: "coindcx" });
    if (pools.length === 0) return;

    const resolvePP = getPPLabelRef.current;
    // Without a PP resolver, skip all toasts (PP-only policy).
    if (!resolvePP) return;

    const r1Crosses: Cross[] = [];
    const s1Crosses: Cross[] = [];

    for (const { rows, source } of pools) {
      for (const r of rows) {
        const price = r.currentPrice;
        const r1 = r.todayCPR?.r1;
        const s1 = r.todayCPR?.s1;
        if (!Number.isFinite(price) || !Number.isFinite(r1) || !Number.isFinite(s1)) continue;

        const key = `${source}:${r.symbol}`;
        const prev = lastPrice.current.get(key);
        lastPrice.current.set(key, price);

        // Need a prior tick to detect a cross.
        if (prev === undefined || !Number.isFinite(prev)) continue;

        const ppLabel = resolvePP({ ...r, source });
        if (!ppLabel) continue;

        const fireKeyR1 = `${key}:R1:${utcDay()}`;
        const fireKeyS1 = `${key}:S1:${utcDay()}`;

        // R1 breakout: was below, now at/above.
        if (prev < r1! && price >= r1! && !fired.current.has(fireKeyR1)) {
          fired.current.add(fireKeyR1);
          r1Crosses.push({ symbol: r.symbol, source, ppLabel });
        }
        // S1 breakdown: was above, now at/below.
        if (prev > s1! && price <= s1! && !fired.current.has(fireKeyS1)) {
          fired.current.add(fireKeyS1);
          s1Crosses.push({ symbol: r.symbol, source, ppLabel });
        }
      }
    }

    if (r1Crosses.length === 0 && s1Crosses.length === 0) return;
    saveFired(fired.current);

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
