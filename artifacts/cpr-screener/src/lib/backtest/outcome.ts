import { downloadAndCacheSymbol, getCandlesForDate } from './data';
import type { HistoricalSignal } from './runner';

export type Outcome = {
  result: 'WIN' | 'LOSS' | 'OPEN';
  exitPrice?: number;
  exitDate?: string;
  daysHeld?: number;
  returnPct?: number;
};

export async function checkOutcome(
  signal: HistoricalSignal,
  daysAhead = 5
): Promise<Outcome> {
  const candles = await downloadAndCacheSymbol(signal.symbol);
  const { future } = getCandlesForDate(candles, signal.signalDate, 0, daysAhead);

  if (future.length === 0) return { result: 'OPEN' };

  // Define TP/SL based on pattern — customize this
  const isBullish = signal.cprRising || signal.pattern.includes('Above') || signal.pattern === 'eXHiL4U234';
  const tpLevel = isBullish? signal.todayCPR.r4 : signal.todayCPR.s4; // U4 for bull, S4 for bear
  const slLevel = isBullish? signal.todayCPR.bc : signal.todayCPR.tc; // BC for bull, TC for bear
  const entry = signal.openPrice;

  for (let i = 0; i < future.length; i++) {
    const c = future[i];
    const date = new Date(c.openTime).toISOString().split('T')[0];

    if (isBullish) {
      if (c.high >= tpLevel) {
        return {
          result: 'WIN',
          exitPrice: tpLevel,
          exitDate: date,
          daysHeld: i + 1,
          returnPct: ((tpLevel - entry) / entry) * 100,
        };
      }
      if (c.low <= slLevel) {
        return {
          result: 'LOSS',
          exitPrice: slLevel,
          exitDate: date,
          daysHeld: i + 1,
          returnPct: ((slLevel - entry) / entry) * 100,
        };
      }
    } else {
      if (c.low <= tpLevel) {
        return {
          result: 'WIN',
          exitPrice: tpLevel,
          exitDate: date,
          daysHeld: i + 1,
          returnPct: ((entry - tpLevel) / entry) * 100,
        };
      }
      if (c.high >= slLevel) {
        return {
          result: 'LOSS',
          exitPrice: slLevel,
          exitDate: date,
          daysHeld: i + 1,
          returnPct: ((entry - slLevel) / entry) * 100,
        };
      }
    }
  }

  // Didn't hit TP/SL in N days
  const lastPrice = future[future.length - 1].close;
  return {
    result: 'OPEN',
    exitPrice: lastPrice,
    daysHeld: daysAhead,
    returnPct: ((lastPrice - entry) / entry) * 100 * (isBullish? 1 : -1),
  };
}
