/**
 * NIFTY / NFO source (Shoonya) — chain workspace model.
 *
 * Hierarchy: Underlying → Expiry → ATM ± N → CE/PE → contracts.
 * Live Shoonya login + option-chain + 5m candles plug in later; mocks
 * keep the workspace UI testable offline.
 */

export type NiftyUnderlying = "NIFTY" | "BANKNIFTY" | "FINNIFTY";

export type NiftyOptionType = "CE" | "PE";

export type NiftySideFilter = "both" | "CE" | "PE";

export interface NiftyContract {
  symbol: string;
  underlying: NiftyUnderlying;
  expiry: string;
  strike: number;
  optionType: NiftyOptionType;
  token?: string;
}

export interface NiftyChainFilters {
  underlying: NiftyUnderlying;
  expiry: string;
  /** Number of strikes each side of ATM (e.g. 5 → 11 strikes if step matches). */
  atmBand: number;
  side: NiftySideFilter;
}

/** Intraday bar size for this source (ms). Crypto stays on 15m. */
export const NIFTY_CANDLE_INTERVAL_MS = 5 * 60 * 1000;

/** NSE F&O regular session (IST). */
export const NIFTY_SESSION = {
  openHourIST: 9,
  openMinuteIST: 15,
  closeHourIST: 15,
  closeMinuteIST: 30,
} as const;

export const NIFTY_UNDERLYINGS: readonly {
  id: NiftyUnderlying;
  label: string;
  enabled: boolean;
  /** Mock spot used for ATM until live quote is wired */
  mockSpot: number;
  strikeStep: number;
}[] = [
  { id: "NIFTY", label: "NIFTY", enabled: true, mockSpot: 25950, strikeStep: 50 },
  { id: "BANKNIFTY", label: "BANKNIFTY", enabled: false, mockSpot: 55800, strikeStep: 100 },
  { id: "FINNIFTY", label: "FINNIFTY", enabled: false, mockSpot: 24500, strikeStep: 50 },
];

/** Mock expiries: this week + next week (labels only until chain API). */
export const NIFTY_MOCK_EXPIRIES: readonly {
  id: string;
  label: string;
  kind: "this_week" | "next_week" | "monthly";
}[] = [
  { id: "28OCT25", label: "28 Oct (This week)", kind: "this_week" },
  { id: "04NOV25", label: "04 Nov (Next week)", kind: "next_week" },
];

export const NIFTY_ATM_BAND_OPTIONS = [3, 5, 8, 10, 15] as const;

export const DEFAULT_NIFTY_FILTERS: NiftyChainFilters = {
  underlying: "NIFTY",
  expiry: NIFTY_MOCK_EXPIRIES[0].id,
  atmBand: 5,
  side: "both",
};

function nearestStrike(spot: number, step: number): number {
  return Math.round(spot / step) * step;
}

function buildSymbol(
  underlying: NiftyUnderlying,
  expiry: string,
  strike: number,
  optionType: NiftyOptionType,
): string {
  return `${underlying}${expiry}${strike}${optionType}`;
}

/**
 * Build a mock option chain for the selected filters.
 * Replace with Shoonya GetOptionChain when API is live.
 */
export function buildMockChain(filters: NiftyChainFilters): NiftyContract[] {
  const meta = NIFTY_UNDERLYINGS.find((u) => u.id === filters.underlying);
  if (!meta || !meta.enabled) return [];

  const atm = nearestStrike(meta.mockSpot, meta.strikeStep);
  const contracts: NiftyContract[] = [];
  for (let i = -filters.atmBand; i <= filters.atmBand; i++) {
    const strike = atm + i * meta.strikeStep;
    if (strike <= 0) continue;
    for (const optionType of ["CE", "PE"] as const) {
      if (filters.side !== "both" && filters.side !== optionType) continue;
      contracts.push({
        symbol: buildSymbol(filters.underlying, filters.expiry, strike, optionType),
        underlying: filters.underlying,
        expiry: filters.expiry,
        strike,
        optionType,
      });
    }
  }
  return contracts;
}

export function filterContracts(
  all: readonly NiftyContract[],
  filters: NiftyChainFilters,
): NiftyContract[] {
  const meta = NIFTY_UNDERLYINGS.find((u) => u.id === filters.underlying);
  const atm = meta ? nearestStrike(meta.mockSpot, meta.strikeStep) : 0;
  const lo = atm - filters.atmBand * (meta?.strikeStep ?? 50);
  const hi = atm + filters.atmBand * (meta?.strikeStep ?? 50);

  return all.filter((c) => {
    if (c.underlying !== filters.underlying) return false;
    if (c.expiry !== filters.expiry) return false;
    if (filters.side !== "both" && c.optionType !== filters.side) return false;
    if (c.strike < lo || c.strike > hi) return false;
    return true;
  });
}

/** @deprecated use buildMockChain — kept for older imports */
export const NIFTY_MOCK_CONTRACTS: readonly NiftyContract[] = buildMockChain(DEFAULT_NIFTY_FILTERS);

export function getNiftyMockSymbols(): string[] {
  return buildMockChain(DEFAULT_NIFTY_FILTERS).map((c) => c.symbol);
}

export function isNiftyApiConnected(): boolean {
  return false;
}

export function getUnderlyingSpot(underlying: NiftyUnderlying): number {
  return NIFTY_UNDERLYINGS.find((u) => u.id === underlying)?.mockSpot ?? 0;
}

export function getAtmStrike(underlying: NiftyUnderlying): number {
  const meta = NIFTY_UNDERLYINGS.find((u) => u.id === underlying);
  if (!meta) return 0;
  return nearestStrike(meta.mockSpot, meta.strikeStep);
}

/**
 * Placeholder screener. Later: chain → daily OHLC → same CPR Views.
 */
export async function runNiftyScreener(
  _filters?: NiftyChainFilters,
  _onProgress?: (done: number, total: number, symbol: string) => void,
): Promise<never[]> {
  return [];
}
