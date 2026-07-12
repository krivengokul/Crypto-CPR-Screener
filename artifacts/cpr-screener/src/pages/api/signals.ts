import type { NextApiRequest, NextApiResponse } from 'next';
import { runScreenerForDate } from '@/lib/backtest/runner';
import { checkOutcome } from '@/lib/backtest/outcome';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { date, pattern = 'eXHiL4U234' } = req.query;

  if (!date || typeof date!== 'string') {
    return res.status(400).json({ error: 'date required: YYYY-MM-DD' });
  }

  // For MVP: hardcode top 100 symbols. Later fetch from Binance
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']; // add more

  try {
    const signals = await runScreenerForDate(date, symbols, pattern as string);

    // Check outcomes in parallel
    const withOutcomes = await Promise.all(
      signals.map(async (s) => ({
       ...s,
        outcome: await checkOutcome(s, 5),
      }))
    );

    res.status(200).json({ date, pattern, signals: withOutcomes });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
