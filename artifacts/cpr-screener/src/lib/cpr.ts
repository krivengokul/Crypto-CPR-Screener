export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
}

export interface CPRLevels {
  pivot: number;
  bc: number;
  tc: number;
  width: number;
  widthPct: number;
  // ADK Classic Pivot Support & Resistance levels
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
}

export interface CPRResult {
  symbol: string;
  todayCPR: CPRLevels;
  prevCPR: CPRLevels;
  compressionRatio: number;
  cprRising: boolean;
  cprFalling: boolean;
  cprNarrowing: boolean;
  passes: boolean;
  currentPrice: number;
  openPrice: number;
  change24h: number;
  quoteVolume: number;
}

function isValidCandle(c: OHLC): boolean {
  return (
    c.high > 0 &&
    c.low > 0 &&
    c.close > 0 &&
    c.high >= c.low &&
    !isNaN(c.high) &&
    !isNaN(c.low) &&
    !isNaN(c.close)
  );
}

export function calcCPR(candle: OHLC): CPRLevels {
  const h = candle.high;
  const l = candle.low;
  const c = candle.close;

  const pivot    = (h + l + c) / 3;
  const midpoint = (h + l) / 2;          // one CPR boundary
  const other    = 2 * pivot - midpoint; // other CPR boundary
  const bc       = Math.min(midpoint, other); // always the lower boundary
  const tc       = Math.max(midpoint, other); // always the upper boundary
  const width    = tc - bc;
  const widthPct = (width / pivot) * 100;
  const range    = h - l;

  return {
    pivot,
    bc,
    tc,
    width,
    widthPct,
    // ADK Classic Pivot Resistance (R1–R4)
    r1: 2 * pivot - l,
    r2: pivot + range,
    r3: h + 2 * (pivot - l),
    r4: h + 3 * (pivot - l),
    // ADK Classic Pivot Support (S1–S4)
    s1: 2 * pivot - h,
    s2: pivot - range,
    s3: l - 2 * (h - pivot),
    s4: l - 3 * (h - pivot),
  };
}

export function analyzeCPR(
  symbol: string,
  candles: OHLC[],
  currentPrice: number,
  change24h: number,
  quoteVolume: number
): CPRResult | null {
  if (candles.length < 2) return null;

  const prevCandle  = candles[candles.length - 2];
  const todayCandle = candles[candles.length - 1];

  // Reject candles with missing/zero/corrupt data
  if (!isValidCandle(prevCandle) || !isValidCandle(todayCandle)) return null;

  const prevCPR  = calcCPR(prevCandle);
  const todayCPR = calcCPR(todayCandle);

  // Require a minimum gap of 0.1% of pivot — filters out near-touching CPRs (noise)
  const minGap     = prevCPR.pivot * 0.001;
  const cprRising  = (todayCPR.bc - prevCPR.tc) >= minGap;
  const cprFalling = (prevCPR.bc  - todayCPR.tc) >= minGap;

  const compressionRatio = prevCPR.width > 0 ? (todayCPR.width / prevCPR.width) * 100 : 100;
  const cprNarrowing     = compressionRatio < 50;

  return {
    symbol,
    todayCPR,
    prevCPR,
    compressionRatio,
    cprRising,
    cprFalling,
    cprNarrowing,
    passes: cprRising && cprNarrowing,
    currentPrice,
    openPrice: todayCandle.open,
    change24h,
    quoteVolume,
  };
}
