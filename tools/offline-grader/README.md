# Offline outcome grader

Replays Views over past dates using the screener's own backtest code
(`src/lib/backtest.ts`) and writes one CSV row per signal: **features at signal
time + graded outcome** (`pass` / `fail` / `not-triggered`). This is the training
data for a signal ranker.

Binance's live API is blocked from US cloud servers (GitHub Actions: HTTP 451,
Cloudflare Workers: 403, Colab: 451), but Binance's public data files at
`data.binance.vision` are reachable, so candles come from those files.

No app code is changed: `shimFetch.ts` swaps `globalThis.fetch` so the app's
two kline requests are answered from local files.

## Run in Google Colab (free)
Open `grader_colab.ipynb` in Colab and run the cells top to bottom.
Data and results are kept in Drive (`MyDrive/cpr-grader`); the grader is resumable.

## Run locally
```
python tools/offline-grader/download_klines.py --out data --days 90 --top 50
npx tsx tools/offline-grader/run.ts --data data --out out --days 90
```
Needs Python 3 + `requests`, and Node 18+. No `npm install` required.

## Which Views
`views.json` lists the 20 time-window Views that are graded (edit freely; keys come
from `src/lib/views`).

## Output (`out/grades.csv`, `out/summary.json`)
- `result`: `pass` target hit, `fail` stop hit or target not reached, `not-triggered` entry never crossed.
  Hit rate = pass / (pass + fail); not-triggered rows are excluded, as in the Backtest panel.
- `f_*` columns: features known at signal time (CPR levels, band positions, pattern flags).
- `leak_*` columns: entry-day close / change, only known at the end of the signal day.
  **Never use them as model inputs.**
- Data lags about a day, so the newest gradable entry date is two days back.

## Self-test (no internet)
`bash tools/offline-grader/test/selftest.sh` runs the whole pipeline against a local mock
of the data host with synthetic candles.
