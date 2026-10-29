/**
 * Signal Desk only works with Binance and NIFTY. Delta / CoinDCX rows are
 * dropped before any card, count, focus or Journal sync is built from them.
 */
export function isDeskSource(source: string | undefined): boolean {
  return source === "binance" || source === "nifty";
}
