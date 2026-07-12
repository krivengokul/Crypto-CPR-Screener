import { runCPR, type CPRResult } from '@/lib/cpr';
import { passesPattern } from '@/components/ScreenerUtils';
import { downloadAndCacheSymbol, getCandlesForDate } from './data';

export interface HistoricalSignal extends CPRResult {
  signalDate: string;
  pattern: string;
}

export async function runScreenerForDate(
  targetDate: string,
  symbols: string[],
  pattern: string
): Promise<HistoricalSignal[]> {
  const results: HistoricalSignal[] = [];

  for (const symbol of symbols) {
    try {
      const candles = await downloadAndCacheSymbol(symbol);
      const { prev2, prev1, today } = getCandlesForDate(candles, targetDate, 2, 0);

      if (!prev2 ||!prev1 ||!today) continue;

      // Build candles array exactly like your live screener expects
      const historicalCandles = [
        {
          open: prev2.open,
          high: prev2.high,
          low: prev2.low,
          close: prev2.close,
          volume: prev2.volume,
          quoteVolume: prev2.quoteVolume,
          openTime: prev2.openTime,
        },
        {
          open: prev1.open,
          high: prev1.high,
          low: prev1.low,
          close: prev1.close,
          volume: prev1.volume,
          quoteVolume: prev1.quoteVolume,
          openTime: prev1.openTime,
        },
        {
          open: today.open,
          high: today.high,
          low: today.low,
          close: today.close,
          volume: today.volume,
          quoteVolume: today.quoteVolume,
          openTime: today.openTime,
        },
      ];

      const cprResult = runCPR(historicalCandles, symbol);
      if (!cprResult) continue;

      // Use your existing passesPattern logic
      if (passesPattern(cprResult, pattern)) {
        results.push({
         ...cprResult,
          signalDate: targetDate,
          pattern,
          openPrice: today.open, // entry = next day open
        });
      }
    } catch (e) {
      console.error(`Failed ${symbol}:`, e);
    }
  }

  return results;
}
