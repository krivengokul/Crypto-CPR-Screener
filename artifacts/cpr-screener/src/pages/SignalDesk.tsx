import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Radio, Search } from "lucide-react";

export interface SignalDeskSymbol {
  key: string;
  symbol: string;
  source: "binance" | "delta";
  currentPrice: number;
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