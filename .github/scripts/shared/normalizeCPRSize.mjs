const CPR_SIZE_KEYS = new Set([
  "micro",
  "tiny",
  "mini",
  "small",
  "medium",
  "large",
  "mega",
  "giant",
]);

/** Validate a CPR size value (optionally p/t prefixed) and return the canonical key. */
export function normalizeCPRSize(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const suffix = raw.slice(1).toLowerCase();
  const normalized = /^[pt]/i.test(raw) && CPR_SIZE_KEYS.has(suffix)
    ? suffix
    : raw.toLowerCase();
  if (!CPR_SIZE_KEYS.has(normalized)) {
    throw new Error('Unknown CPR size "' + raw + '". Expected one of: ' + Array.from(CPR_SIZE_KEYS).join(", ") + ".");
  }
  return normalized;
}
