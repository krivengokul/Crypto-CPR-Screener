import { useState } from "react";
import { Zap } from "lucide-react";
import {
  createBacktestView,
  deriveLevelCheckDefs,
  editBacktestView,
  findContainingNodeKey,
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
  normalizeCPRSizeKey,
  parseComposedViewKey,
  splitCandleCheck,
  joinCandleCheck,
  VIEWS,
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

function targetFromLabel(label: string | undefined, direction: "Up" | "Down"): string {
  const match = label?.trim().match(/^(PR4|PS4|PH|PL|[RSL]\d)\b/)?.[1];
  if (!match) return direction === "Down" ? "S4" : "R4";
  return match.startsWith("L") ? match.replace("L", "S") : match;
}

/**
 * Builds a row-specific View from the best registered classification available.
 * If no registered leaf matches, it uses the row's category and exact level signature.
 */
export default function ScreenerCreateViewControl({
  row,
  fallbackPatternKey,
  existingViewKey,
}: {
  row: CPRResultWithSource;
  fallbackPatternKey?: string;
  existingViewKey?: string;
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
  const existingView = existingViewKey ? getView(existingViewKey) : undefined;
  const [editingView] = useState(() =>
    existingView?.kind === "view" ? existingView : undefined,
  );
  const parsedViewKey = editingView ? parseComposedViewKey(editingView.key) : undefined;
  const initialDirection: "Up" | "Down" =
    editingView?.direction === "Down"
      ? "Down"
      : editingView?.direction === "Up"
        ? "Up"
        : getRowDirection(row, patternKey);
  const initialEntry = editingView?.entryLabel?.split(" ")[0];
  const initialStoploss = editingView?.stoplossLabel?.split(" ")[0];
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
  const [entry, setEntry] = useState(
    initialEntry && (ENTRY_OPTIONS as readonly string[]).includes(initialEntry)
      ? initialEntry
      : initialDirection === "Up" ? "TC" : "BC",
  );
  const [stoploss, setStoploss] = useState(
    initialStoploss && (STOPLOSS_OPTIONS as readonly string[]).includes(initialStoploss)
      ? initialStoploss
      : initialDirection === "Up" ? "S1" : "R1",
  );
  const [target, setTarget] = useState(
    editingView
      ? parsedViewKey?.target ?? targetFromLabel(editingView.targetLabel, initialDirection)
      : initialDirection === "Up" ? "R4" : "S4",
  );
  const [candleCheck, setCandleCheck] = useState(
    editingView?.candleCheck ??
      parsedViewKey?.candleCheck ??
      (editingView ? "" : initialCandleCheck),
  );
  const [gapBadge, setGapBadge] = useState(
    parsedViewKey?.gapBadge ?? (editingView ? "" : initialGapBadge),
  );
  const [prevSize, setPrevSize] = useState(
    normalizeCPRSizeKey(editingView?.prevCPRSize ?? parsedViewKey?.prevCPRSize) ??
      (editingView ? "" : initialPrevSize),
  );
  const [todaySize, setTodaySize] = useState(
    normalizeCPRSizeKey(editingView?.todayCPRSize ?? parsedViewKey?.todayCPRSize) ??
      (editingView ? "" : initialTodaySize),
  );
  const [label, setLabel] = useState(
    editingView?.label ?? `${genericSetup ? "Unclassified Setup" : patternLabel} — ${row.symbol}`,
  );
  const initialAttachKey =
    editingView?.parentKey ??
    (editingView ? findContainingNodeKey(editingView.key) : null) ??
    editingView?.conditionKey ??
    patternKey;
  const [attachKey, setAttachKey] = useState(initialAttachKey);
  const [requireFullMatch, setRequireFullMatch] = useState(
    editingView ? editingView.requireFullMatch === true : (!!row.prevCPR && !!row.todayCPR),
  );
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [copied, setCopied] = useState(false);

  const levelCheckDefs =
    row.prevCPR && row.todayCPR
      ? deriveLevelCheckDefs({ prevCPR: row.prevCPR, todayCPR: row.todayCPR } as CPRResult)
      : [];
  const joinedSize = joinCPRSize(prevSize, todaySize);
  const viewKey = [
    entry,
    candleCheck || undefined,
    joinedSize || undefined,
    (editingView ? attachKey : patternKey) || undefined,
    gapBadge || undefined,
    target,
  ]
    .filter(Boolean)
    .join("-");

  function openForm() {
    const direction = editingView?.direction ?? initialDirection;
    setDirection(direction);
    setEntry(
      initialEntry && (ENTRY_OPTIONS as readonly string[]).includes(initialEntry)
        ? initialEntry
        : direction === "Up" ? "TC" : "BC",
    );
    setStoploss(
      initialStoploss && (STOPLOSS_OPTIONS as readonly string[]).includes(initialStoploss)
        ? initialStoploss
        : direction === "Up" ? "S1" : "R1",
    );
    setTarget(
      editingView
        ? parsedViewKey?.target ?? targetFromLabel(editingView.targetLabel, direction)
        : direction === "Up" ? "R4" : "S4",
    );
    setCandleCheck(
      editingView?.candleCheck ??
        parsedViewKey?.candleCheck ??
        (editingView ? "" : initialCandleCheck),
    );
    setGapBadge(parsedViewKey?.gapBadge ?? (editingView ? "" : initialGapBadge));
    setPrevSize(
      normalizeCPRSizeKey(editingView?.prevCPRSize ?? parsedViewKey?.prevCPRSize) ??
        (editingView ? "" : initialPrevSize),
    );
    setTodaySize(
      normalizeCPRSizeKey(editingView?.todayCPRSize ?? parsedViewKey?.todayCPRSize) ??
        (editingView ? "" : initialTodaySize),
    );
    setLabel(editingView?.label ?? `${genericSetup ? "Unclassified Setup" : patternLabel} — ${row.symbol}`);
    setAttachKey(initialAttachKey);
    setRequireFullMatch(
      editingView
        ? editingView.requireFullMatch === true
        : (!!row.prevCPR && !!row.todayCPR),
    );
    setError("");
    setCommand("");
    setOpen(true);
  }

  function createView() {
    const attachPoint = editingView ? attachKey : patternKey;
    if (!attachPoint) {
      setError("This row has no registered pattern or category to build a View from.");
      return;
    }
    const trimmedLabel = label.trim() || viewKey;
    let finalKey = viewKey;
    const showSaveError = (reason: string | undefined) => {
      setError(
        reason === "duplicate-key"
          ? `A View with key "${viewKey}" already exists.`
          : reason === "invalid-gap-badge"
            ? `"${gapBadge}" is not a valid Gap Badge.`
            : reason === "invalid-candle-check"
              ? `"${candleCheck}" is not a valid Candle Check.`
              : reason === "invalid-target"
                ? `"${target}" is not valid for ${direction}.`
                : reason === "invalid-entry"
                  ? `"${entry}" is not a valid Entry.`
                  : `Could not ${editingView ? "edit" : "create"} a View from this row.`,
      );
    };
    if (editingView) {
      const result = editBacktestView(
          editingView.key,
          viewKey,
          trimmedLabel,
          direction,
          target,
          entry,
          attachPoint,
          gapBadge || undefined,
          levelCheckDefs,
          candleCheck || undefined,
          stoploss,
          requireFullMatch,
          prevSize || undefined,
          todaySize || undefined,
      );
      if (!result.ok) {
        showSaveError(result.reason);
        return;
      }
      finalKey = result.updated?.key ?? viewKey;
    } else {
      const result = createBacktestView(
          attachPoint,
          viewKey,
          trimmedLabel,
          direction,
          target,
          levelCheckDefs,
          attachPoint,
          gapBadge || undefined,
          entry,
          candleCheck || undefined,
          stoploss,
          requireFullMatch,
          prevSize || undefined,
          todaySize || undefined,
      );
      if (!result.ok) {
        showSaveError(result.reason);
        return;
      }
      finalKey = result.created?.key ?? viewKey;
    }

    const bytes = new TextEncoder().encode(JSON.stringify(levelCheckDefs));
    let binary = "";
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    const b64 = btoa(binary);
    const q = commandQuote;
    const viewArgs = `-f newKey=${q(finalKey)} -f newLabel=${q(trimmedLabel)} -f direction=${q(direction)} -f entry=${q(entry)} -f stoploss=${q(stoploss)} -f target=${q(target)} -f attachKey=${q(attachPoint)}${candleCheck ? ` -f candleCheck=${q(candleCheck)}` : ""}${gapBadge ? ` -f gapBadge=${q(gapBadge)}` : ""}${prevSize ? ` -f prevCPRSize=${q(prevSize)}` : ""}${todaySize ? ` -f todayCPRSize=${q(todaySize)}` : ""} -f requireFullMatch=${requireFullMatch ? "true" : "false"} -f levelCheckDefs=${b64}`;
    setCommand(
      editingView
        ? `gh workflow run editcopy-view.yml --repo krivengokul/Crypto-CPR-Screener -f sourceKey=${q(editingView.key)} -f isEdit=true ${viewArgs}`
        : `gh workflow run create-view.yml --repo krivengokul/Crypto-CPR-Screener -f patternKey=${q(attachPoint)} ${viewArgs}`,
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
  const attachPointOptions = VIEWS.filter((view) => view.kind !== "view");

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      {!open ? (
        <button
          type="button"
          onClick={openForm}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          title={editingView ? `Edit View "${editingView.label}"` : "Create a View with this row's CPR sizes, candle/gap badges, direction, and level signature"}
        >
          {editingView ? "Edit" : <><Zap className="h-2.5 w-2.5 text-amber-400" aria-hidden />Create View</>}
        </button>
      ) : (
        <div className="absolute left-0 top-full z-50 mt-1 flex w-[min(90vw,360px)] flex-col gap-1.5 rounded-md border border-border bg-popover p-2 text-left shadow-xl">
          <strong className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {editingView ? `Edit View · ${editingView.label}` : `Create View · ${patternLabel}`}
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
          {editingView && (
            <select
              className={controlClass}
              value={attachKey}
              onChange={(event) => setAttachKey(event.target.value)}
              disabled={disabled}
              title="View category / pattern"
            >
              {!attachPointOptions.some((view) => view.key === attachKey) && (
                <option value={attachKey}>{attachKey}</option>
              )}
              {attachPointOptions.map((view) => (
                <option key={view.key} value={view.key}>{view.label}</option>
              ))}
            </select>
          )}
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
              <span className="text-[10px] text-muted-foreground">
                {editingView ? "The View is updated in this session." : "The View is added in this session."} Run this command to save it permanently:
              </span>
              <code className="break-all whitespace-pre-wrap rounded bg-muted/40 p-1 text-[9px]">{command}</code>
              <button type="button" className="self-end rounded border border-border px-2 py-1 text-[10px]" onClick={copyCommand}>
                {copied ? "Copied" : "Copy command"}
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={requireFullMatch}
                onChange={(event) => setRequireFullMatch(event.target.checked)}
                disabled={disabled}
              />
              Exact Level Check ({levelCheckDefs.length}/13)
            </label>
            <div className="flex gap-1">
              <button type="button" className="rounded px-2 py-1 text-[10px] hover:bg-muted/40" onClick={() => setOpen(false)}>
                {command ? "Done" : "Cancel"}
              </button>
              {!command && (
                <button type="button" className="rounded bg-cyan-500/20 px-2 py-1 text-[10px] text-cyan-300" onClick={createView}>
                  {editingView ? "Save" : "Create View"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
