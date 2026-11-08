import { useState } from "react";
import {
  createBacktestView,
  deriveLevelCheckDefs,
} from "@/lib/backtest";
import {
  ALL_GAP_BADGES,
  CANDLE_CHECK_OPTIONS,
  ENTRY_OPTIONS,
  PP_CANDLE_CHECK_OPTIONS,
  PREV_CPR_SIZE_OPTIONS,
  STOPLOSS_OPTIONS,
  TODAY_CPR_SIZE_OPTIONS,
  candleCheckFromRow,
  computeGapBadge,
  getView,
  joinCPRSize,
  splitCandleCheck,
  joinCandleCheck,
} from "@/lib/views";
import type { CPRResult } from "@/lib/cpr";
import {
  getRowDirection,
  getMatchingSignals,
  getWidthCategory,
  type CPRResultWithSource,
} from "./ScreenerUtils";
import { getRowCategory } from "@/lib/rowCategory";

const UP_TARGETS = ["PH", "R1", "R2", "R3", "R4", "PR4"];
const DOWN_TARGETS = ["PL", "S1", "S2", "S3", "S4", "PS4"];

function commandQuote(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

/**
 * Builds a row-specific View from the best registered classification available.
 * If no registered leaf matches, it uses the row's category and exact level signature.
 */
export default function ScreenerCreateViewControl({
  row,
  fallbackPatternKey,
}: {
  row: CPRResultWithSource;
  fallbackPatternKey?: string;
}) {
  const matchingPattern = getMatchingSignals(row).find(
    (signal) => getView(signal.id)?.kind === "view",
  );
  const categoryKey = getRowCategory(row);
  const fallbackKey = fallbackPatternKey && getView(fallbackPatternKey)
    ? fallbackPatternKey
    : "";
  const patternKey = matchingPattern?.id ?? (categoryKey || fallbackKey);
  const patternLabel =
    matchingPattern?.label ??
    (getView(categoryKey)?.label ||
      getView(fallbackKey)?.label ||
      categoryKey ||
      "Unclassified setup");
  const genericSetup = !matchingPattern && getView(patternKey)?.kind === "category";
  const initialDirection = getRowDirection(row, patternKey);
  const computedGapBadge = computeGapBadge(row);
  const initialGapBadge = ALL_GAP_BADGES.includes(computedGapBadge)
    ? computedGapBadge
    : "";
  const initialCandleCheck = candleCheckFromRow(row);
  const initialPrevSize = row.prevCPR
    ? getWidthCategory(row.prevCPR.widthPct).key
    : "";
  const initialTodaySize = row.todayCPR
    ? getWidthCategory(row.todayCPR.widthPct).key
    : "";

  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"Up" | "Down">(initialDirection);
  const [entry, setEntry] = useState(initialDirection === "Up" ? "TC" : "BC");
  const [stoploss, setStoploss] = useState(initialDirection === "Up" ? "S1" : "R1");
  const [target, setTarget] = useState(initialDirection === "Up" ? "R4" : "S4");
  const [candleCheck, setCandleCheck] = useState(initialCandleCheck);
  const [gapBadge, setGapBadge] = useState(initialGapBadge);
  const [prevSize, setPrevSize] = useState(initialPrevSize);
  const [todaySize, setTodaySize] = useState(initialTodaySize);
  const [label, setLabel] = useState(
    `${genericSetup ? "Unclassified Setup" : patternLabel} — ${row.symbol}`,
  );
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [copied, setCopied] = useState(false);

  const levelCheckDefs =
    row.prevCPR && row.todayCPR
      ? deriveLevelCheckDefs({ prevCPR: row.prevCPR, todayCPR: row.todayCPR } as CPRResult)
      : [];
  const requireFullMatch = levelCheckDefs.length > 0;
  const joinedSize = joinCPRSize(prevSize, todaySize);
  const viewKey = [
    entry,
    candleCheck || undefined,
    joinedSize || undefined,
    patternKey || undefined,
    gapBadge || undefined,
    target,
  ]
    .filter(Boolean)
    .join("-");

  function openForm() {
    setDirection(initialDirection);
    setEntry(initialDirection === "Up" ? "TC" : "BC");
    setStoploss(initialDirection === "Up" ? "S1" : "R1");
    setTarget(initialDirection === "Up" ? "R4" : "S4");
    setCandleCheck(initialCandleCheck);
    setGapBadge(initialGapBadge);
    setPrevSize(initialPrevSize);
    setTodaySize(initialTodaySize);
    setLabel(`${genericSetup ? "Unclassified Setup" : patternLabel} — ${row.symbol}`);
    setError("");
    setCommand("");
    setOpen(true);
  }

  function createView() {
    if (!patternKey) {
      setError("This row has no registered pattern or category to build a View from.");
      return;
    }
    const trimmedLabel = label.trim() || viewKey;
    const result = createBacktestView(
      patternKey,
      viewKey,
      trimmedLabel,
      direction,
      target,
      levelCheckDefs,
      patternKey,
      gapBadge || undefined,
      entry,
      candleCheck || undefined,
      stoploss,
      requireFullMatch,
      prevSize || undefined,
      todaySize || undefined,
    );
    if (!result.ok) {
      setError(
        result.reason === "duplicate-key"
          ? `A View with key "${viewKey}" already exists.`
          : result.reason === "invalid-gap-badge"
            ? `"${gapBadge}" is not a valid Gap Badge.`
            : result.reason === "invalid-candle-check"
              ? `"${candleCheck}" is not a valid Candle Check.`
              : result.reason === "invalid-target"
                ? `"${target}" is not valid for ${direction}.`
                : result.reason === "invalid-entry"
                  ? `"${entry}" is not a valid Entry.`
                  : "Could not create a View from this row.",
      );
      return;
    }

    const bytes = new TextEncoder().encode(JSON.stringify(levelCheckDefs));
    let binary = "";
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    const b64 = btoa(binary);
    const q = commandQuote;
    setCommand(
      `gh workflow run create-view.yml --repo krivengokul/Crypto-CPR-Screener -f patternKey=${q(patternKey)} -f newKey=${q(result.created?.key ?? viewKey)} -f newLabel=${q(trimmedLabel)} -f direction=${q(direction)} -f entry=${q(entry)} -f stoploss=${q(stoploss)} -f target=${q(target)} -f attachKey=${q(patternKey)}${candleCheck ? ` -f candleCheck=${q(candleCheck)}` : ""}${gapBadge ? ` -f gapBadge=${q(gapBadge)}` : ""}${prevSize ? ` -f prevCPRSize=${q(prevSize)}` : ""}${todaySize ? ` -f todayCPRSize=${q(todaySize)}` : ""} -f requireFullMatch=${requireFullMatch ? "true" : "false"} -f levelCheckDefs=${b64}`,
    );
    setError("");
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard access failed; select and copy the command above.");
    }
  }

  const controlClass =
    "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground";
  const disabled = !!command;

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      {!open ? (
        <button
          type="button"
          onClick={openForm}
          className="whitespace-nowrap rounded border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          title="Create a View with this row's CPR sizes, candle/gap badges, direction, and level signature"
        >
          Create View
        </button>
      ) : (
        <div className="absolute left-0 top-full z-50 mt-1 flex w-[min(90vw,360px)] flex-col gap-1.5 rounded-md border border-border bg-popover p-2 text-left shadow-xl">
          <strong className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Create View · {patternLabel}
          </strong>
          <span className="text-[10px] text-muted-foreground">
            {genericSetup
              ? "Unclassified setup: uses the row category and exact level signature."
              : `Registered pattern: ${matchingPattern?.label ?? patternLabel}.`}
          </span>
          <div className="flex gap-1">
            <select
              className={controlClass}
              value={direction}
              onChange={(event) => {
                const next = event.target.value as "Up" | "Down";
                setDirection(next);
                setEntry(next === "Up" ? "TC" : "BC");
                setStoploss(next === "Up" ? "S1" : "R1");
                setTarget(next === "Up" ? "R4" : "S4");
              }}
              disabled={disabled}
            >
              <option value="Up">Up</option>
              <option value="Down">Down</option>
            </select>
            <select className={controlClass} value={entry} onChange={(e) => setEntry(e.target.value)} disabled={disabled}>
              {ENTRY_OPTIONS.map((option) => <option key={option} value={option}>Entry {option}</option>)}
            </select>
            <select className={controlClass} value={target} onChange={(e) => setTarget(e.target.value)} disabled={disabled}>
              {(direction === "Up" ? UP_TARGETS : DOWN_TARGETS).map((value) => <option key={value} value={value}>Target {value}</option>)}
            </select>
          </div>
          <div className="flex gap-1">
            <select
              className={controlClass}
              value={splitCandleCheck(candleCheck).pp}
              onChange={(e) => setCandleCheck(joinCandleCheck(e.target.value, splitCandleCheck(candleCheck).p))}
              disabled={disabled}
              title="Previous-previous session candle badge"
            >
              {PP_CANDLE_CHECK_OPTIONS.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
            </select>
            <select
              className={controlClass}
              value={splitCandleCheck(candleCheck).p}
              onChange={(e) => setCandleCheck(joinCandleCheck(splitCandleCheck(candleCheck).pp, e.target.value))}
              disabled={disabled}
              title="Previous session candle badge"
            >
              {CANDLE_CHECK_OPTIONS.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <input className={controlClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="View name" disabled={disabled} />
          <div className="flex gap-1">
            <select className={controlClass} value={stoploss} onChange={(e) => setStoploss(e.target.value)} disabled={disabled}>
              {STOPLOSS_OPTIONS.map((option) => <option key={option} value={option}>Stoploss {option}</option>)}
            </select>
            <select className={controlClass} value={gapBadge} onChange={(e) => setGapBadge(e.target.value)} disabled={disabled}>
              <option value="">Any Gap Badge</option>
              {ALL_GAP_BADGES.map((badge) => <option key={badge} value={badge}>{badge}</option>)}
            </select>
          </div>
          <div className="flex gap-1">
            <select className={controlClass} value={prevSize} onChange={(e) => setPrevSize(e.target.value)} disabled={disabled}>
              {PREV_CPR_SIZE_OPTIONS.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
            </select>
            <select className={controlClass} value={todaySize} onChange={(e) => setTodaySize(e.target.value)} disabled={disabled}>
              {TODAY_CPR_SIZE_OPTIONS.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <input className={`${controlClass} font-mono`} value={viewKey} readOnly title="Generated View key" />
          {error && <span className="text-[10px] text-destructive">{error}</span>}
          {command && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">The View is added in this session. Run this command to save it permanently:</span>
              <code className="break-all whitespace-pre-wrap rounded bg-muted/40 p-1 text-[9px]">{command}</code>
              <button type="button" className="self-end rounded border border-border px-2 py-1 text-[10px]" onClick={copyCommand}>
                {copied ? "Copied" : "Copy command"}
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input type="checkbox" checked={requireFullMatch} readOnly />
              Exact Level Check ({levelCheckDefs.length}/13)
            </label>
            <div className="flex gap-1">
              <button type="button" className="rounded px-2 py-1 text-[10px] hover:bg-muted/40" onClick={() => setOpen(false)}>
                {command ? "Done" : "Cancel"}
              </button>
              {!command && (
                <button type="button" className="rounded bg-cyan-500/20 px-2 py-1 text-[10px] text-cyan-300" onClick={createView}>
                  Create View
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
