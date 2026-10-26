/**
 * Friendly labels for Binance TradFi stock/index perps.
 * Binance uses ETF tickers (QQQ, SPY); users often know them as NSDQ100 / S&P500.
 */

export type TradFiDisplay = {
  /** Short secondary line, e.g. "Nasdaq-100" */
  name: string;
  /** Optional kind for styling/tooltips */
  kind: "index" | "stock" | "commodity" | "other";
};

/**
 * Map bare base or full SYMBOLUSDT → display info.
 * Lookup is case-insensitive; accepts "QQQ" or "QQQUSDT".
 */
const TRADFI_DISPLAY: Record<string, TradFiDisplay> = {
  // Index / ETF underlyings
  QQQ: { name: "Nasdaq-100", kind: "index" },
  SPY: { name: "S&P 500", kind: "index" },
  TQQQ: { name: "3× Nasdaq-100", kind: "index" },
  SQQQ: { name: "−3× Nasdaq-100", kind: "index" },
  SOXL: { name: "3× Semiconductors", kind: "index" },
  BITO: { name: "Bitcoin Strategy ETF", kind: "other" },
  // Commodities (Binance COM)
  CL: { name: "WTI Crude", kind: "commodity" },
  BZ: { name: "Brent Crude", kind: "commodity" },
  XAU: { name: "Gold", kind: "commodity" },
  XAG: { name: "Silver", kind: "commodity" },
  // Stocks
  TSLA: { name: "Tesla", kind: "stock" },
  NVDA: { name: "NVIDIA", kind: "stock" },
  AAPL: { name: "Apple", kind: "stock" },
  MSFT: { name: "Microsoft", kind: "stock" },
  AMZN: { name: "Amazon", kind: "stock" },
  META: { name: "Meta", kind: "stock" },
  GOOGL: { name: "Alphabet", kind: "stock" },
  NFLX: { name: "Netflix", kind: "stock" },
  AMD: { name: "AMD", kind: "stock" },
  INTC: { name: "Intel", kind: "stock" },
  ORCL: { name: "Oracle", kind: "stock" },
  TSM: { name: "TSMC", kind: "stock" },
  DELL: { name: "Dell", kind: "stock" },
  COIN: { name: "Coinbase", kind: "stock" },
  PLTR: { name: "Palantir", kind: "stock" },
  HOOD: { name: "Robinhood", kind: "stock" },
  BABA: { name: "Alibaba", kind: "stock" },
  SNDK: { name: "SanDisk", kind: "stock" },
  SPCX: { name: "SpaceX", kind: "stock" },
  CRM: { name: "Salesforce", kind: "stock" },
  AVGO: { name: "Broadcom", kind: "stock" },
  ARM: { name: "Arm", kind: "stock" },
  MSTR: { name: "MicroStrategy", kind: "stock" },
};

function toBase(symbol: string): string {
  const u = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const suf of ["USDT", "USDC", "BUSD", "USD"]) {
    if (u.length > suf.length && u.endsWith(suf)) return u.slice(0, -suf.length);
  }
  return u;
}

export function getTradFiDisplay(symbol: string): TradFiDisplay | null {
  const base = toBase(symbol);
  return TRADFI_DISPLAY[base] ?? null;
}

/** One-line subtitle under the ticker, e.g. "Nasdaq-100 · INDEX" */
export function formatTradFiSubtitle(symbol: string): string | null {
  const d = getTradFiDisplay(symbol);
  if (!d) return null;
  const kind =
    d.kind === "index"
      ? "INDEX"
      : d.kind === "commodity"
        ? "COM"
        : d.kind === "stock"
          ? "STOCK"
          : "";
  return kind ? `${d.name} · ${kind}` : d.name;
}
