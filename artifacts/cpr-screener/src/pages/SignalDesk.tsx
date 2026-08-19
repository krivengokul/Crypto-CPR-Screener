import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Radio, Search } from "lucide-react";

export interface SignalDeskSymbol {
  key: string;
  symbol: string;
  source: "binance" | "delta";
  currentPrice: number;
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
 * built from CPR levels instead of a trade setup. Support side
 * (S4→PIVOT) reads green, resistance side (PIVOT→R4) reads rose, matching
 * the green/rose convention used elsewhere in the app for R-levels vs
 * S-levels.
 *
 * Tick marks on the bar itself always show every available level (they're
 * just 1px lines, so they cost no layout space). The text labels below the
 * bar are what actually compete for room, so they adapt to the card's
 * width: the full ladder (S4/S3/S2/S1/PIVOT/R1/R2/R3/R4) shows on wider
 * cards (below the xl 3-column breakpoint, where cards have the most
 * room), and a reduced ladder — S1/S3/R1/R3 dropped, S2/R2 kept as the
 * inner anchors — shows at xl+ where 3-per-row cards get tight. S2/S3 are
 * only rendered as labels when the caller actually supplied them.
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
          className="absolute inset-y-0 left-0 rounded-l-full bg-emerald-500/50"
          style={{ width: `${pivotPct}%` }}
        />
        <div
          className="absolute inset-y-0 rounded-r-full bg-rose-500/50"
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
    </div>
  );
}

export default function SignalDesk({
  symbols,
  activePattern,
  activeLabel,
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
        <header className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              <Radio className="h-4 w-4" />
              Signal Desk
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Filtered market symbols
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              A live view of the symbols currently returned by the same CPR
              filter selected in the Screener.
            </p>
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

        <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Matching symbols
            </p>
            <p className="mt-2 text-2xl font-semibold">{symbols.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Binance
            </p>
            <p className="mt-2 text-2xl font-semibold text-blue-300">
              {binanceCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Delta
            </p>
            <p className="mt-2 text-2xl font-semibold text-violet-300">
              {deltaCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Active view
            </p>
            <p className="mt-2 truncate text-sm font-semibold">
              {activePattern ? activeLabel || activePattern : "All scanned"}
            </p>
          </div>
        </section>

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
              const isLong = index % 2 === 0;

              return (
                <article
                  key={item.key}
                  className="rounded-xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-emerald-400/50"
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
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

                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                      Live
                    </span>
                  </div>

                  <div className="rounded-lg bg-background/60 p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Current price
                    </p>
                    <p className="mt-1 font-mono text-2xl font-semibold">
                      {formatPrice(item.currentPrice)}
                    </p>
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
                    <span className="text-muted-foreground">CPR filter</span>
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
