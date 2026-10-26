const QUOTE = "USDT";
const PAIR_PREFIX = "B-";

export function toCoinDCXPair(symbol: string): string {
  const base = symbol.endsWith(QUOTE) ? symbol.slice(0, -QUOTE.length) : symbol;
  return `${PAIR_PREFIX}${base}_${QUOTE}`;
}

export function fromCoinDCXPair(pair: string): string | null {
  if (!pair.startsWith(PAIR_PREFIX) || !pair.endsWith(`_${QUOTE}`)) return null;
  const base = pair.slice(PAIR_PREFIX.length, -(QUOTE.length + 1));
  return base ? `${base}${QUOTE}` : null;
}
