/**
 * The Signals Journal is Binance-only. This picks the saved records that should
 * be permanently deleted by the one-time cleanup: Delta and CoinDCX only.
 * Binance records — and anything with an unknown/missing source — are never
 * selected, so an unexpected row can't be deleted by mistake.
 */
export function pickLegacyExchangeSignalIds(
  signals: ReadonlyArray<{ id: string; source?: string }>,
): string[] {
  return signals
    .filter((s) => s.source === "delta" || s.source === "coindcx")
    .map((s) => s.id);
}

/** localStorage flag: set after the cleanup succeeded in this browser. */
export const LEGACY_EXCHANGE_PURGE_FLAG = "cpr_journal_legacy_exchange_purged_v1";
