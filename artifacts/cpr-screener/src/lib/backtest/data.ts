import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data/candles');
const BINANCE_API = 'https://api.binance.com/api/v3/klines';

interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

// Get file path for symbol's full history
function getCachePath(symbol: string): string {
  return path.join(CACHE_DIR, `${symbol}_1d.json`);
}

// Download 1000 days of 1D candles from Binance and cache
export async function downloadAndCacheSymbol(symbol: string): Promise<Candle[]> {
  const cachePath = getCachePath(symbol);

  // Return cache if exists
  try {
    const data = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(data);
  } catch { /* cache miss, download */ }

  await fs.mkdir(CACHE_DIR, { recursive: true });

  const url = `${BINANCE_API}?symbol=${symbol}&interval=1d&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${symbol}: ${res.statusText}`);

  const raw: any[] = await res.json();
  const candles: Candle[] = raw.map(k => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    quoteVolume: parseFloat(k[7]),
  }));

  await fs.writeFile(cachePath, JSON.stringify(candles));
  return candles;
}

// Get specific date range from cached candles
export function getCandlesForDate(
  candles: Candle[],
  targetDate: string,
  daysBefore = 2,
  daysAfter = 5
): { prev2?: Candle; prev1?: Candle; today?: Candle; future: Candle[] } {
  const target = new Date(targetDate + 'T00:00:00Z').getTime();
  const dayMs = 86400000;

  const idx = candles.findIndex(c => c.openTime === target);
  if (idx === -1) return { future: [] };

  return {
    prev2: candles[idx - 2],
    prev1: candles[idx - 1],
    today: candles[idx],
    future: candles.slice(idx + 1, idx + 1 + daysAfter),
  };
}
