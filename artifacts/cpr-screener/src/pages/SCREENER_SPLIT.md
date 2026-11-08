# Screener split

Target structure (issue: ~3k-line Screener complexity):

| Module | Role |
|--------|------|
| `hooks/useExchangeScan.ts` | Binance / Delta / CoinDCX scan + cache + live refresh |
| `hooks/usePreviousCandleFilters.ts` | CON/MOM A/B prep + exclusive `candleBucket` |
| `hooks/useReclaimFilters.ts` | RECLAIM-S / RECLAIM-R depths |
| `components/ScreenerToolbar.tsx` | Scan buttons, search, source tabs |
| `components/ScreenerResultsTable.tsx` | Table chrome |
| `pages/Screener.tsx` | Orchestrator: filters, `displayed`, counts, compose UI |

## Migration

1. Hooks are ready to call from Screener with the same return shapes as local state.
2. Toolbar / table are presentational — pass props from Screener.
3. Full cutover: replace local scan/prep/reclaim state with the three hooks, then swap JSX blocks for `<ScreenerToolbar />` / `<ScreenerResultsTable />`.

Keep behavior identical; do not change filter semantics while moving code.
