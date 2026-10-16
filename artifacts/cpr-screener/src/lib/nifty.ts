/**
 * NIFTY / NFO source (Shoonya) — scaffold only.
 *
 * Live Shoonya login + option-chain + 5m candles will plug in here once the
 * broker account/API is active. Until then we expose a fixed mock CE/PE list
 * so the NIFTY tab layout is testable.
 */

export type NiftyOptionType = "CE" | "PE";

export interface NiftyMockContract {
  /** Display / table symbol, e.g. NIFTY28OCT2524500CE */
  symbol: string;
  /** Underlying */
  underlying: "NIFTY";
  /** Expiry label (DDMMMYY style used on NSE) */
  expiry: string;
  strike: number;
  optionType: NiftyOptionType;
  /** Placeholder token until Shoonya instrument master is wired */
  token?: string;
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

/**
 * Mock nearest-week ATM ± strikes for UI layout only.
 * Strikes are illustrative; replace via Shoonya GetOptionChain when live.
 */
export const NIFTY_MOCK_CONTRACTS: readonly NiftyMockContract[] = [
  { symbol: "NIFTY28OCT2524000CE", underlying: "NIFTY", expiry: "28OCT25", strike: 24000, optionType: "CE" },
  { symbol: "NIFTY28OCT2524000PE", underlying: "NIFTY", expiry: "28OCT25", strike: 24000, optionType: "PE" },
  { symbol: "NIFTY28OCT2524500CE", underlying: "NIFTY", expiry: "28OCT25", strike: 24500, optionType: "CE" },
  { symbol: "NIFTY28OCT2524500PE", underlying: "NIFTY", expiry: "28OCT25", strike: 24500, optionType: "PE" },
  { symbol: "NIFTY28OCT2525000CE", underlying: "NIFTY", expiry: "28OCT25", strike: 25000, optionType: "CE" },
  { symbol: "NIFTY28OCT2525000PE", underlying: "NIFTY", expiry: "28OCT25", strike: 25000, optionType: "PE" },
  { symbol: "NIFTY28OCT2525500CE", underlying: "NIFTY", expiry: "28OCT25", strike: 25500, optionType: "CE" },
  { symbol: "NIFTY28OCT2525500PE", underlying: "NIFTY", expiry: "28OCT25", strike: 25500, optionType: "PE" },
  { symbol: "NIFTY28OCT2526000CE", underlying: "NIFTY", expiry: "28OCT25", strike: 26000, optionType: "CE" },
  { symbol: "NIFTY28OCT2526000PE", underlying: "NIFTY", expiry: "28OCT25", strike: 26000, optionType: "PE" },
  { symbol: "NIFTY28OCT2526500CE", underlying: "NIFTY", expiry: "28OCT25", strike: 26500, optionType: "CE" },
  { symbol: "NIFTY28OCT2526500PE", underlying: "NIFTY", expiry: "28OCT25", strike: 26500, optionType: "PE" },
  { symbol: "NIFTY28OCT2527000CE", underlying: "NIFTY", expiry: "28OCT25", strike: 27000, optionType: "CE" },
  { symbol: "NIFTY28OCT2527000PE", underlying: "NIFTY", expiry: "28OCT25", strike: 27000, optionType: "PE" },
  { symbol: "NIFTY28OCT2527500CE", underlying: "NIFTY", expiry: "28OCT25", strike: 27500, optionType: "CE" },
  { symbol: "NIFTY28OCT2527500PE", underlying: "NIFTY", expiry: "28OCT25", strike: 27500, optionType: "PE" },
  { symbol: "NIFTY28OCT2528000CE", underlying: "NIFTY", expiry: "28OCT25", strike: 28000, optionType: "CE" },
  { symbol: "NIFTY28OCT2528000PE", underlying: "NIFTY", expiry: "28OCT25", strike: 28000, optionType: "PE" },
  { symbol: "NIFTY28OCT2528500CE", underlying: "NIFTY", expiry: "28OCT25", strike: 28500, optionType: "CE" },
  { symbol: "NIFTY28OCT2528500PE", underlying: "NIFTY", expiry: "28OCT25", strike: 28500, optionType: "PE" },
];

export function getNiftyMockSymbols(): string[] {
  return NIFTY_MOCK_CONTRACTS.map((c) => c.symbol);
}

/** True until Shoonya session + option chain are wired. */
export function isNiftyApiConnected(): boolean {
  return false;
}

/**
 * Placeholder screener entry. Returns empty results; UI shows connect state.
 * Later: login → chain → daily OHLC → CPR rows.
 */
export async function runNiftyScreener(
  _onProgress?: (done: number, total: number, symbol: string) => void,
): Promise<never[]> {
  return [];
}
