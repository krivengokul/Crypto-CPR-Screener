import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Radio, Search } from "lucide-react";
import { pivotcategories, Views } from "@/lib/ViewsSidebar";

/**
 * Flat id → label lookup covering every view in the tree — both the
 * top-level `pivotcategories` entries and every nested `Views` sub-item.
 * Built locally from ViewsSidebar's existing exports so no changes are
 * needed there.
 */
const VIEW_LABEL_BY_ID: Record<string, string> = {
  ...Object.fromEntries(pivotcategories.map((p) => [p.id, p.label])),
  ...Object.fromEntries(
    Object.values(Views).flatMap((subs) => subs.map((s) => [s.id, s.label] as const)),
  ),
};

/**
 * Ids of nested `Views` sub-items only — excludes the top-level
 * `pivotcategories` (parent section) ids. Used by the chip strip so it
 * surfaces individual views, not their parent category.
 */
const SUBVIEW_IDS: ReadonlySet<string> = new Set<string>(
  Object.values(Views).flatMap((subs) => subs.map((s) => s.id)),
);

export interface SignalDeskSymbol {
  key: string;
  symbol: string;
  source: "binance" | "delta";
  currentPrice: number;
  /** 24h price change, as a percent (e.g. 3.2 for +3.2%, -1.4 for -1.4%). Omit to hide the change badge. */
  change24h?: number;
  /** Bullish/bearish call for this row — see getRowDirection in ScreenerUtils.tsx. Drives the header icon/color; falls back to an alternating pattern when omitted. */
  direction?: "up" | "down";
  /** Today's CPR S4/R4 band, used to draw the level range bar. Omit to hide the bar for this symbol. */
  s4?: number;
  s3?: number;
  s2?: number;
  s1?: number;
  pivot?: number;
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
}

interface SignalDeskProps {
  symbols: SignalDeskSymbol[];
  activePattern: string;
  activeLabel: string;
  /** Pattern id → matching-symbol count, e.g. App's patternCounts. Drives the chip strip — only views with a count > 0 get a chip. Omit to hide the strip. */
  counts?: Record<string, number>;
  /** Called with a view id when its chip is clicked — wire to the same handler passed to ViewsSidebar's onSelect so both surfaces stay in sync. */
  onSelectPattern?: (id: string) => void;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (Math.abs(value) >= 1) return value.toFixed(4);
  return value.toFixed(8);
}

function displaySymbol(symbol: string): string {
  return symbol.replace(/[_-]?(USDT|USDC|USD|BUSD)$/i, "");
}

/**
 * LevelRangeBar — S4 → R4 horizontal band with tick marks at every CPR
 * level (S4/S3/S2/S1/PIVOT/R1/R2/R3/R4) and an orange "NOW" marker at the
 * current price, mirroring the drishtisignals.in TP2/TP1/ENTRY/SL bar but
 * built from CPR levels instead of a trade setup. CHANGED: support side
 * (S4→PIVOT) now reads rose, resistance side (PIVOT→R4) now reads green —
 * inverted from the green/rose-by-S/R convention used elsewhere in the
 * app, per request.
 *
 * Tick marks on the bar itself always show every available level (they're
 * just 1px lines, so they cost no layout space). The text labels below the
 * bar are what actually compete for room, so they adapt to the card's
 * width: the full ladder (S4/S3/S2/S1/PIVOT/R1/R2/R3/R4) shows on wider
 * cards (below the xl 3-column breakpoint, where cards have the most
 * room), and a reduced ladder — S1/S3/R1/R3 dropped, S2/R2 kept as the
 * inner anchors — shows at xl+ where 3-per-row cards get tight. S2/S3 are
 * only rendered as labels when the caller actually supplied them.
 *
 * Below the labels, an "X% to next level" line shows the gap to the
 * nearest tick above and below the live price, in either direction —
 * quick context on how much room is left before the price crosses the
 * next level.
 */
function LevelRangeBar({
  s4,
  s3,
  s2,
  s1,
  pivot,
  r1,
  r2,
  r3,
  r4,
  current,
}: {
  s4: number;
  s3?: number;
  s2?: number;
  s1: number;
  pivot: number;
  r1: number;
  r2?: number;
  r3?: number;
  r4: number;
  current: number;
}) {
  const span = r4 - s4;
  if (!Number.isFinite(span) || span <= 0) return null;

  const pct = (value: number) => {
    const clamped = Math.min(Math.max(value, s4), r4);
    return ((clamped - s4) / span) * 100;
  };

  type Tick = { label: string; value: number };
  const allTicks: Tick[] = [
    { label: "S4", value: s4 },
    ...(s3 != null ? [{ label: "S3", value: s3 }] : []),
    ...(s2 != null ? [{ label: "S2", value: s2 }] : []),
    { label: "S1", value: s1 },
    { label: "PIVOT", value: pivot },
    { label: "R1", value: r1 },
    ...(r2 != null ? [{ label: "R2", value: r2 }] : []),
    ...(r3 != null ? [{ label: "R3", value: r3 }] : []),
    { label: "R4", value: r4 },
  ];

  // Reduced ladder for narrow (xl 3-column) cards: drop S1/S3/R1/R3, keep
  // S2/R2 in their place alongside the S4/PIVOT/R4 anchors. Falls back to
  // S1/R1 when S2/R2 weren't supplied, so the bar never goes anchor-only.
  const reducedTicks: Tick[] = [
    { label: "S4", value: s4 },
    s2 != null ? { label: "S2", value: s2 } : { label: "S1", value: s1 },
    { label: "PIVOT", value: pivot },
    r2 != null ? { label: "R2", value: r2 } : { label: "R1", value: r1 },
    { label: "R4", value: r4 },
  ];

  const nowPct = pct(current);
  const pivotPct = pct(pivot);

  // Nearest tick above/below the live price, for the "X% to next level"
  // microcopy under the bar — tells someone at a glance how much room is
  // left before the next level, in either direction.
  const nextAbove = allTicks
    .filter((t) => t.value > current)
    .sort((a, b) => a.value - b.value)[0];
  const nextBelow = allTicks
    .filter((t) => t.value < current)
    .sort((a, b) => b.value - a.value)[0];

  const renderLabels = (ticks: Tick[]) =>
    ticks.map((tick) => (
      <div
        key={tick.label}
        className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-center"
        style={{ left: `${pct(tick.value)}%` }}
      >
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          {tick.label}
        </p>
        <p className="font-mono text-[10px] text-foreground/80">
          {formatPrice(tick.value)}
        </p>
      </div>
    ));

  return (
    <div className="mt-4">
      <div className="relative mb-1 h-4">
        <div
          className="absolute -translate-x-1/2 whitespace-nowrap text-center"
          style={{ left: `${nowPct}%` }}
        >
          <p className="font-mono text-[11px] font-semibold text-orange-400">
            {formatPrice(current)}
          </p>
        </div>
      </div>
      <div className="relative h-1.5 rounded-full bg-background/80">
        <div
          className="absolute inset-y-0 left-0 rounded-l-full bg-rose-500/50"
          style={{ width: `${pivotPct}%` }}
        />
        <div
          className="absolute inset-y-0 rounded-r-full bg-emerald-500/50"
          style={{ left: `${pivotPct}%`, right: 0 }}
        />
        {allTicks.map((tick) => (
          <span
            key={tick.label}
            className="absolute top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-border"
            style={{ left: `${pct(tick.value)}%` }}
          />
        ))}
        <span
          className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-400"
          style={{ left: `${nowPct}%` }}
        />
      </div>
      <div className="relative mt-1 hidden h-8 xl:block">
        {renderLabels(reducedTicks)}
      </div>
      <div className="relative mt-1 h-8 xl:hidden">
        {renderLabels(allTicks)}
      </div>
      {(nextBelow || nextAbove) && (
        <div className="mt-1 flex items-center justify-center gap-3 text-[10px] font-medium text-muted-foreground">
          {nextBelow && (
            <span>
              <span className="text-rose-400/80">
                {(((current - nextBelow.value) / current) * 100).toFixed(2)}%
              </span>{" "}
              above {nextBelow.label}
            </span>
          )}
          {nextAbove && (
            <span>
              <span className="text-emerald-400/80">
                {(((nextAbove.value - current) / current) * 100).toFixed(2)}%
              </span>{" "}
              to {nextAbove.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ViewChipStrip — a wrapping row of pill buttons (no horizontal scroll —
 * it flows onto additional lines once it runs out of width), one per
 * nested View (not top-level categories) that currently has ≥1 matching
 * symbol (per `counts`). Clicking a chip fires `onSelect` with that view's
 * id, mirroring what clicking the same view in the left ViewsSidebar does.
 * The active view (matching `activePattern`) gets the filled emerald
 * treatment; the rest are outlined/muted. Renders nothing when there are
 * no active (count > 0) views to show.
 */
function ViewChipStrip({
  counts,
  activePattern,
  onSelect,
}: {
  counts: Record<string, number>;
  activePattern: string;
  onSelect?: (id: string) => void;
}) {
  const chips = useMemo(
    () =>
      Object.entries(counts)
        .filter(([id, count]) => count > 0 && SUBVIEW_IDS.has(id))
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ id, count, label: VIEW_LABEL_BY_ID[id] ?? id })),
    [counts],
  );

  if (chips.length === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {chips.map((chip) => {
        const isActive = chip.id === activePattern;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onSelect?.(chip.id)}
            className={[
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition",
              isActive
                ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
                : "border-border bg-card text-muted-foreground hover:border-emerald-400/40 hover:text-foreground",
            ].join(" ")}
          >
            <span>{chip.label}</span>
            <span
              className={[
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                isActive ? "bg-emerald-400/20 text-emerald-200" : "bg-background/60 text-foreground/70",
              ].join(" ")}
            >
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function SignalDesk({
  symbols,
  activePattern,
  activeLabel,
  counts,
  onSelectPattern,
}: SignalDeskProps) {
  const [search, setSearch] = useState("");

  const visibleSymbols = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return symbols;
    return symbols.filter((item) =>
      item.symbol.toLowerCase().includes(needle),
    );
  }, [search, symbols]);

  const binanceCount = symbols.filter((item) => item.source === "binance").length;
  const deltaCount = symbols.filter((item) => item.source === "delta").length;

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-6 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                <Radio className="h-4 w-4" />
                Signal Desk
              </span>
              <span className="text-sm leading-6 text-muted-foreground">
                A live views of the symbols from the Screener.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Matching symbols
                </p>
                <p className="mt-1 text-lg font-semibold">{symbols.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Binance
                </p>
                <p className="mt-1 text-lg font-semibold text-blue-300">
                  {binanceCount}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Delta
                </p>
                <p className="mt-1 text-lg font-semibold text-violet-300">
                  {deltaCount}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Active view
                </p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {activePattern ? activeLabel || activePattern : "All scanned"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Scanner results connected
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Symbols update with the active view
            </p>
          </div>
        </header>

        {counts && (
          <ViewChipStrip counts={counts} activePattern={activePattern} onSelect={onSelectPattern} />
        )}

        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Current signal universe</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a different filter in the sidebar to refresh this list.
            </p>
          </div>

          <label className="relative block w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search symbol"
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-400"
            />
          </label>
        </div>

        {visibleSymbols.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <p className="font-medium">No matching symbols</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Run a scan or choose another view from the sidebar.
            </p>
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSymbols.map((item, index) => {
              // Bullish/bearish call for this row — see getRowDirection in
              // ScreenerUtils.tsx. Falls back to the old alternating
              // placeholder only if a caller doesn't supply direction.
              const isLong = item.direction ? item.direction === "up" : index % 2 === 0;

              return (
                <article
                  key={item.key}
                  className={[
                    "rounded-xl border border-l-4 bg-card p-5 transition hover:-translate-y-0.5",
                    isLong
                      ? "border-border border-l-emerald-400/70 hover:border-emerald-400/50"
                      : "border-border border-l-rose-400/70 hover:border-rose-400/50",
                  ].join(" ")}
                >
                  <div className="mb-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={[
                          "flex h-10 w-10 items-center justify-center rounded-lg",
                          isLong
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-rose-500/10 text-rose-400",
                        ].join(" ")}
                      >
                        {isLong ? (
                          <ArrowUpRight className="h-5 w-5" />
                        ) : (
                          <ArrowDownRight className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold">
                          {displaySymbol(item.symbol)}
                        </h3>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          {item.source}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <p className="font-mono text-base font-semibold text-foreground">
                        {formatPrice(item.currentPrice)}
                      </p>
                      {item.change24h != null && (
                        <span
                          className={[
                            "text-[11px] font-semibold",
                            item.change24h >= 0 ? "text-emerald-400" : "text-rose-400",
                          ].join(" ")}
                        >
                          {item.change24h >= 0 ? "+" : ""}
                          {item.change24h.toFixed(2)}%
                        </span>
                      )}
                    </div>

                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      </span>
                      Live
                    </span>
                  </div>

                  {item.s4 != null && item.s1 != null && item.pivot != null && item.r1 != null && item.r4 != null && (
                    <LevelRangeBar
                      s4={item.s4}
                      s3={item.s3}
                      s2={item.s2}
                      s1={item.s1}
                      pivot={item.pivot}
                      r1={item.r1}
                      r2={item.r2}
                      r3={item.r3}
                      r4={item.r4}
                      current={item.currentPrice}
                    />
                  )}

                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">
                      {SUBVIEW_IDS.has(activePattern) ? "View" : "Category"}
                    </span>
                    <span className="max-w-[65%] truncate font-medium text-foreground">
                      {activeLabel || activePattern || "All scanned"}
                    </span>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
