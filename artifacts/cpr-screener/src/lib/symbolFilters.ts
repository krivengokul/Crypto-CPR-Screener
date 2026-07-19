/**
 * Shared symbol-exclusion filters, applied at the symbol-fetch stage in both
 * binance.ts and delta.ts — BEFORE any klines/candles are fetched or
 * analyzeCPR runs on them. This keeps stablecoins and garbage-ticker symbols
 * out of "total scanned" counts entirely, rather than filtering them out of
 * results after the fact.
 */

/**
 * Known USD-pegged stablecoin base tickers. These trade in a ~$0.001-wide
 * band around $1.00, so their CPR is always Micro-width noise — never a
 * meaningful pattern. Maintain this list manually; new stablecoins list
 * occasionally, and hasNonAsciiChars below won't catch them since they're
 * plain ASCII tickers.
 */
export const STABLECOIN_BASES = new Set([
  "USDC", "USDE", "FDUSD", "TUSD", "DAI", "USDS", "USDP",
  "PYUSD", "USD1", "XUSD", "EURI", "AEUR", "BFUSD", "FRAX",
  "GUSD", "LUSD", "USDD", "RLUSD",
]);

/**
 * Strips the quote suffix off a raw exchange symbol to get the base ticker,
 * handling both Binance-style (no separator, e.g. "USDCUSDT") and
 * Delta-style (underscore-separated, e.g. "BTC_USDT") formats.
 */
function extractBase(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.includes("_")) {
    return upper.split("_")[0];
  }
  const suffixes = ["USDT", "BUSD", "USDC", "USD"];
  for (const suf of suffixes) {
    if (upper.length > suf.length && upper.endsWith(suf)) {
      return upper.slice(0, -suf.length);
    }
  }
  return upper;
}

export function isStablecoinSymbol(symbol: string): boolean {
  return STABLECOIN_BASES.has(extractBase(symbol));
}

/**
 * Flags symbols containing any non-ASCII character (e.g. "币安人生USDT") —
 * catches junk/scam-style tickers using non-Latin scripts, emoji, etc.,
 * regardless of what base ticker they'd otherwise extract to.
 */
export function hasNonAsciiChars(symbol: string): boolean {
  return /[^\x00-\x7F]/.test(symbol);
}

export function shouldExcludeSymbol(symbol: string): boolean {
  return isStablecoinSymbol(symbol) || hasNonAsciiChars(symbol);
}
