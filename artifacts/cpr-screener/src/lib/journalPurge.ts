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

/**
 * The Journal only stores Binance signals. Writers (auto-save, manual save)
 * check this so Delta / CoinDCX signals are never added to the Journal again.
 */
export function isJournalSource(source: string | undefined): boolean {
  return source === "binance";
}
