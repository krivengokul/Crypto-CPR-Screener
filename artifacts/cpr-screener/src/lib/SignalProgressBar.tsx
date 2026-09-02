import React from "react";
import { fmt } from "../lib/ScreenerUtils";

interface SignalProgressBarProps {
  price: number;
  pivot: number;
  s1: number;
  s2: number;
  s3?: number;
  s4: number;
  r1: number;
  r2: number;
  r3?: number;
  r4: number;
}

export default function SignalProgressBar({
  price,
  pivot,
  s1,
  s2,
  s3,
  s4,
  r1,
  r2,
  r3,
  r4,
}: SignalProgressBarProps) {
  // Ensure valid min/max boundaries
  const minVal = s4 || pivot * 0.95;
  const maxVal = r4 || pivot * 1.05;
  const range = maxVal - minVal || 1;

  const getPercent = (val: number) => {
    return Math.max(0, Math.min(100, ((val - minVal) / range) * 100));
  };

  const pricePct = getPercent(price);
  const pivotPct = getPercent(pivot);
  const s2Pct = getPercent(s2);
  const r2Pct = getPercent(r2);

  // Dynamic context calculations below the bar (matching image: e.g. "1.42% above S1   0.23% to PIVOT")
  let leftText = "";
  let rightText = "";
  let leftColor = "text-rose-400";
  let rightColor = "text-emerald-400";

  if (price < pivot) {
    const toPivotPct = Math.abs(((pivot - price) / price) * 100).toFixed(2);
    rightText = `${toPivotPct}% to PIVOT`;
    rightColor = "text-emerald-400";

    // Determine closest support below or equal to current price
    if (price >= s1) {
      const diff = Math.abs(((price - s1) / (s1 || 1)) * 100).toFixed(2);
      leftText = `${diff}% above S1`;
    } else if (price >= s2) {
      const diff = Math.abs(((price - s2) / (s2 || 1)) * 100).toFixed(2);
      leftText = `${diff}% above S2`;
    } else if (s3 && price >= s3) {
      const diff = Math.abs(((price - s3) / (s3 || 1)) * 100).toFixed(2);
      leftText = `${diff}% above S3`;
    } else {
      const diff = Math.abs(((price - s4) / (s4 || 1)) * 100).toFixed(2);
      leftText = `${diff}% above S4`;
    }
    leftColor = "text-rose-400";
  } else {
    const abovePivotPct = Math.abs(((price - pivot) / (pivot || 1)) * 100).toFixed(2);
    leftText = `${abovePivotPct}% above PIVOT`;
    leftColor = "text-rose-400";

    // Determine closest resistance above or equal to current price
    if (price <= r1) {
      const diff = Math.abs(((r1 - price) / (price || 1)) * 100).toFixed(2);
      rightText = `${diff}% to R1`;
    } else if (price <= r2) {
      const diff = Math.abs(((r2 - price) / (price || 1)) * 100).toFixed(2);
      rightText = `${diff}% to R2`;
    } else if (r3 && price <= r3) {
      const diff = Math.abs(((r3 - price) / (price || 1)) * 100).toFixed(2);
      rightText = `${diff}% to R3`;
    } else {
      const diff = Math.abs(((r4 - price) / (price || 1)) * 100).toFixed(2);
      rightText = `${diff}% to R4`;
    }
    rightColor = "text-emerald-400";
  }

  return (
    <div className="w-full select-none py-1.5 mb-2.5">
      {/* Live price callout above bar */}
      <div className="relative w-full h-5 mb-0.5">
        <div
          className="absolute -top-0.5 flex flex-col items-center transition-all duration-300 pointer-events-none"
          style={{
            left: `${pricePct}%`,
            transform: "translateX(-50%)",
          }}
        >
          <span className="font-mono text-[11px] font-bold text-[#f59e0b] tracking-tight whitespace-nowrap drop-shadow-sm">
            {fmt(price)}
          </span>
        </div>
      </div>

      {/* Progress Track: S4 -> PIVOT (Red Family) & PIVOT -> R4 (Green Family) */}
      <div className="relative w-full h-2 rounded-full overflow-visible flex items-center">
        {/* Left Side: S4 to PIVOT (Red / Crimson family) */}
        <div
          className="h-full bg-[#881337] rounded-l-full relative"
          style={{ width: `${pivotPct}%` }}
        >
          {/* S2 tick notch */}
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-black/40"
            style={{ left: `${(s2Pct / (pivotPct || 1)) * 100}%` }}
          />
        </div>

        {/* Right Side: PIVOT to R4 (Green / Emerald family) */}
        <div
          className="h-full bg-[#065f46] rounded-r-full relative flex-1"
        >
          {/* R2 tick notch */}
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-black/40"
            style={{
              left: `${((r2Pct - pivotPct) / (100 - pivotPct || 1)) * 100}%`,
            }}
          />
        </div>

        {/* S4 left tick */}
        <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-black/50" />

        {/* Pivot Center Division Tick */}
        <div
          className="absolute top-0 bottom-0 w-[1.5px] bg-black/60 z-10"
          style={{ left: `${pivotPct}%` }}
        />

        {/* R4 right tick */}
        <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-black/50" />

        {/* Live Price Needle / Indicator */}
        <div
          className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-[#f97316] z-20 shadow-sm shadow-orange-500 transition-all duration-300"
          style={{
            left: `${pricePct}%`,
            transform: "translateX(-50%)",
          }}
        />
      </div>

      {/* Labels below the bar (S4, S2, PIVOT, R2, R4 with price numbers) */}
      <div className="relative w-full h-8 mt-1 font-mono text-[9px] text-slate-400">
        {/* S4 Label */}
        <div className="absolute left-0 top-0 text-left">
          <div className="font-semibold text-slate-400 text-[9px]">S4</div>
          <div className="text-[8.5px] text-slate-300">{fmt(s4)}</div>
        </div>

        {/* S2 Label */}
        <div
          className="absolute top-0 -translate-x-1/2 text-center"
          style={{ left: `${s2Pct}%` }}
        >
          <div className="font-semibold text-slate-400 text-[9px]">S2</div>
          <div className="text-[8.5px] text-slate-300">{fmt(s2)}</div>
        </div>

        {/* PIVOT Label */}
        <div
          className="absolute top-0 -translate-x-1/2 text-center"
          style={{ left: `${pivotPct}%` }}
        >
          <div className="font-bold text-slate-300 text-[9px]">PIVOT</div>
          <div className="text-[8.5px] text-slate-200">{fmt(pivot)}</div>
        </div>

        {/* R2 Label */}
        <div
          className="absolute top-0 -translate-x-1/2 text-center"
          style={{ left: `${r2Pct}%` }}
        >
          <div className="font-semibold text-slate-400 text-[9px]">R2</div>
          <div className="text-[8.5px] text-slate-300">{fmt(r2)}</div>
        </div>

        {/* R4 Label */}
        <div className="absolute right-0 top-0 text-right">
          <div className="font-semibold text-slate-400 text-[9px]">R4</div>
          <div className="text-[8.5px] text-slate-300">{fmt(r4)}</div>
        </div>
      </div>

      {/* Bottom context summary (e.g. 1.42% above S1   0.23% to PIVOT) */}
      <div className="flex items-center justify-center gap-3 text-[11px] font-mono mt-0.5">
        <span className={leftColor}>{leftText}</span>
        <span className={rightColor}>{rightText}</span>
      </div>
    </div>
  );
}