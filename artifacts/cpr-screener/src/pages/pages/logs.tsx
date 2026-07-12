import { useState } from 'react';
import { Download, TrendingUp, TrendingDown, Clock } from 'lucide-react';

export default function LogsPage() {
  const [date, setDate] = useState('2024-03-15');
  const [pattern, setPattern] = useState('eXHiL4U234');
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<any[]>([]);

  const runQuery = async () => {
    setLoading(true);
    const res = await fetch(`/api/signals?date=${date}&pattern=${pattern}`);
    const data = await res.json();
    setSignals(data.signals || []);
    setLoading(false);
  };

  const exportCSV = () => {
    const rows = [
      ['Symbol', 'Pattern', 'Entry', 'TP', 'SL', 'Exit', 'Days', 'Result', 'Return%'],
     ...signals.map(s => [
        s.symbol, s.pattern, s.openPrice.toFixed(2), s.todayCPR.r4.toFixed(2),
        s.todayCPR.bc.toFixed(2), s.outcome.exitPrice?.toFixed(2) || '-',
        s.outcome.daysHeld || '-', s.outcome.result, s.outcome.returnPct?.toFixed(2) || '-'
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signals_${date}_${pattern}.csv`;
    a.click();
  };

  const wins = signals.filter(s => s.outcome.result === 'WIN').length;
  const losses = signals.filter(s => s.outcome.result === 'LOSS').length;
  const avgR = signals.reduce((sum, s) => sum + (s.outcome.returnPct || 0), 0) / signals.length;

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Historical Signals Log</h1>

        <div className="flex gap-3 mb-6">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-2 rounded border border-border bg-card"
          />
          <select
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            className="px-3 py-2 rounded border border-border bg-card"
          >
            <option>eXHiL4U234</option>
            <option>structure-bigabove</option>
            <option>structure-bigbelow</option>
            <option>littleabove</option>
          </select>
          <button
            onClick={runQuery}
            disabled={loading}
            className="px-4 py-2 rounded bg-primary text-white disabled:opacity-50"
          >
            {loading? 'Loading...' : 'Run'}
          </button>
          <button
            onClick={exportCSV}
            disabled={!signals.length}
            className="px-4 py-2 rounded border border-border flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>

        {!!signals.length && (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              {signals.length} signals | {wins} Wins {((wins/signals.length)*100).toFixed(0)}% |
              {losses} Loss | Avg: {avgR.toFixed(2)}%
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr className="text-left">
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Entry</th>
                    <th className="p-2">TP U4</th>
                    <th className="p-2">Exit</th>
                    <th className="p-2">Days</th>
                    <th className="p-2">Result</th>
                    <th className="p-2">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map(s => (
                    <tr key={s.symbol} className="border-t border-border">
                      <td className="p-2 font-mono">{s.symbol}</td>
                      <td className="p-2">{s.openPrice.toFixed(2)}</td>
                      <td className="p-2">{s.todayCPR.r4.toFixed(2)}</td>
                      <td className="p-2">{s.outcome.exitPrice?.toFixed(2) || '-'}</td>
                      <td className="p-2">{s.outcome.daysHeld || '-'}</td>
                      <td className="p-2">
                        {s.outcome.result === 'WIN' && <span className="text-green-400 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> WIN</span>}
                        {s.outcome.result === 'LOSS' && <span className="text-destructive flex items-center gap-1"><TrendingDown className="w-3 h-3" /> LOSS</span>}
                        {s.outcome.result === 'OPEN' && <span className="text-yellow-500 flex items-center gap-1"><Clock className="w-3 h-3" /> OPEN</span>}
                      </td>
                      <td className="p-2">{s.outcome.returnPct?.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
