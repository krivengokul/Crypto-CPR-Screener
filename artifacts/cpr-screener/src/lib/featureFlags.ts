/**
 * Feature flags.
 *
 * COINDCX_ENABLED — CoinDCX scanning is paused to keep localStorage small and
 * the app fast (three full scan caches overran the ~5 MB quota). While false:
 * no CoinDCX scan runs (auto, hard-refresh, or the Scan button), the Screener's
 * CoinDCX button/tab are dimmed, its cached results are not loaded, and any
 * CoinDCX data already in localStorage is deleted on startup. Flip to true to
 * bring it all back — the next visit rescans CoinDCX from scratch.
 *
 * DELTA_ENABLED — Delta Exchange scanning is paused: most symbols duplicate
 * Binance USDT pairs and double the scan cost. Code paths remain; flip to true
 * to re-enable Scan Delta + the Delta tab.
 *
 * NIFTY source uses Shoonya (Finvasia) for NFO options. UI tab is always shown;
 * live API wiring comes later. Until then the tab shows an empty / mock state.
 */
export const COINDCX_ENABLED = false;

/** Delta Exchange — code kept, scans/UI deactivated until needed. */
export const DELTA_ENABLED = false;
