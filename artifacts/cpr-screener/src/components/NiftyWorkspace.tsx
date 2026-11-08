import { useMemo, useState } from "react";
import {
  buildMockChain,
  DEFAULT_NIFTY_FILTERS,
  getAtmStrike,
  getUnderlyingSpot,
  isNiftyApiConnected,
  NIFTY_ATM_BAND_OPTIONS,
  NIFTY_MOCK_EXPIRIES,
  NIFTY_SESSION,
  NIFTY_UNDERLYINGS,
  type NiftyChainFilters,
  type NiftyContract,
  type NiftySideFilter,
  type NiftyUnderlying,
} from "@/lib/nifty";

function Chip({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-semibold border transition ${
        disabled
          ? "opacity-35 cursor-not-allowed text-slate-500 border-transparent"
          : active
            ? "bg-amber-500/20 text-amber-200 border-amber-500/50"
            : "text-slate-400 hover:text-slate-200 border-[#2a3a28] bg-[#0d140d]"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * NIFTY options workspace: Underlying → Expiry → ATM± → CE/PE → contract rows.
 * Mock chain until Shoonya is connected; same hierarchy will drive live CPR Views.
 */
export default function NiftyWorkspace() {
  const [filters, setFilters] = useState<NiftyChainFilters>(DEFAULT_NIFTY_FILTERS);
  const connected = isNiftyApiConnected();

  const contracts = useMemo(() => buildMockChain(filters), [filters]);
  const spot = getUnderlyingSpot(filters.underlying);
  const atm = getAtmStrike(filters.underlying);

  const setUnderlying = (id: NiftyUnderlying) =>
    setFilters((f) => ({ ...f, underlying: id }));
  const setExpiry = (expiry: string) => setFilters((f) => ({ ...f, expiry }));
  const setAtmBand = (atmBand: number) => setFilters((f) => ({ ...f, atmBand }));
  const setSide = (side: NiftySideFilter) => setFilters((f) => ({ ...f, side }));

  const ceCount = contracts.filter((c) => c.optionType === "CE").length;
  const peCount = contracts.filter((c) => c.optionType === "PE").length;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-[#121a12] px-4 py-4 mb-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-200 tracking-wide">
            NIFTY mode · Options workspace
          </h3>
          <p className="mt-1 text-xs text-slate-400 max-w-2xl">
            {connected
              ? "Shoonya connected — chain filters feed the same CPR Views as crypto."
              : "Account / API not connected. Filters below use a mock chain so you can test the hierarchy; live quotes and CPR appear after Shoonya login."}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Session {String(NIFTY_SESSION.openHourIST).padStart(2, "0")}:
            {String(NIFTY_SESSION.openMinuteIST).padStart(2, "0")}–
            {String(NIFTY_SESSION.closeHourIST).padStart(2, "0")}:
            {String(NIFTY_SESSION.closeMinuteIST).padStart(2, "0")} IST
            {" · "}5m candles{" · "}
            <span className="text-slate-400">
              Spot ~{spot.toLocaleString("en-IN")} · ATM {atm}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${
              connected
                ? "border-emerald-500/40 text-emerald-300"
                : "border-amber-500/40 text-amber-300/90"
            }`}
          >
            {connected ? "API live" : "Mock chain"}
          </span>
          <button
            type="button"
            disabled={connected}
            className="text-xs px-3 py-1 rounded border border-amber-500/50 text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40"
            title="Wire Shoonya OAuth when account is active"
          >
            {connected ? "Connected" : "Connect Shoonya"}
          </button>
        </div>
      </div>

      {/* 1. Underlying */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">1 · Underlying</p>
        <div className="flex flex-wrap gap-1.5">
          {NIFTY_UNDERLYINGS.map((u) => (
            <Chip
              key={u.id}
              active={filters.underlying === u.id}
              disabled={!u.enabled}
              title={u.enabled ? undefined : "Coming later"}
              onClick={() => u.enabled && setUnderlying(u.id)}
            >
              {u.label}
              {!u.enabled && " · soon"}
            </Chip>
          ))}
        </div>
      </div>

      {/* 2. Expiry */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">2 · Expiry</p>
        <div className="flex flex-wrap gap-1.5">
          {NIFTY_MOCK_EXPIRIES.map((e) => (
            <Chip
              key={e.id}
              active={filters.expiry === e.id}
              onClick={() => setExpiry(e.id)}
            >
              {e.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* 3. ATM band */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
          3 · Strike band (ATM ± N)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {NIFTY_ATM_BAND_OPTIONS.map((n) => (
            <Chip
              key={n}
              active={filters.atmBand === n}
              onClick={() => setAtmBand(n)}
            >
              ±{n}
            </Chip>
          ))}
        </div>
      </div>

      {/* 4. Side */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">4 · Side</p>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["both", "CE + PE"],
            ["CE", "Calls only"],
            ["PE", "Puts only"],
          ] as const).map(([id, label]) => (
            <Chip
              key={id}
              active={filters.side === id}
              onClick={() => setSide(id)}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {/* 5. Contracts */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            5 · Contracts ({contracts.length})
            <span className="text-slate-600 normal-case tracking-normal ml-2">
              CE {ceCount} · PE {peCount}
            </span>
          </p>
          <p className="text-[10px] text-slate-600">
            Same Views engine will score these rows after OHLC is wired
          </p>
        </div>

        <div className="rounded-lg border border-[#1e2e1c] overflow-hidden">
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-[#0d140d] text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Symbol</th>
                  <th className="text-left font-medium px-2 py-2">Expiry</th>
                  <th className="text-right font-medium px-2 py-2">Strike</th>
                  <th className="text-center font-medium px-2 py-2">Side</th>
                  <th className="text-right font-medium px-3 py-2">vs ATM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2818]">
                {contracts.map((c: NiftyContract) => {
                  const vs = c.strike - atm;
                  return (
                    <tr key={c.symbol} className="hover:bg-[#152015]/80">
                      <td className="px-3 py-1.5 font-mono text-slate-200">{c.symbol}</td>
                      <td className="px-2 py-1.5 text-slate-400">{c.expiry}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                        {c.strike.toLocaleString("en-IN")}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span
                          className={
                            c.optionType === "CE"
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }
                        >
                          {c.optionType}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                        {vs === 0 ? "ATM" : vs > 0 ? `+${vs}` : `${vs}`}
                      </td>
                    </tr>
                  );
                })}
                {contracts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      No contracts for this filter set
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
