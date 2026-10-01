/**
 * Feature flags.
 *
 * COINDCX_ENABLED — CoinDCX scanning is paused to keep localStorage small and
 * the app fast (three full scan caches overran the ~5 MB quota). While false:
 * no CoinDCX scan runs (auto, hard-refresh, or the Scan button), the Screener's
 * CoinDCX button/tab are dimmed, its cached results are not loaded, and any
 * CoinDCX data already in localStorage is deleted on startup. Flip to true to
 * bring it all back — the next visit rescans CoinDCX from scratch.
 */
export const COINDCX_ENABLED = false;
