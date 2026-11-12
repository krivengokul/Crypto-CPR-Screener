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

/** Accept legacy Ultra values but only serialize the canonical Giant key. */
export function normalizeCPRSize(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const suffix = raw.slice(1);
  const normalizedSuffix = suffix.toLowerCase() === "ultra" ? "giant" : suffix.toLowerCase();
  const unprefixed = /^[pt]/i.test(raw) && CPR_SIZE_KEYS.has(normalizedSuffix)
    ? suffix
    : raw;
  const normalized = unprefixed.toLowerCase() === "ultra"
    ? "giant"
    : unprefixed.toLowerCase();
  if (!CPR_SIZE_KEYS.has(normalized)) {
    throw new Error('Unknown CPR size "' + raw + '". Expected one of: ' + Array.from(CPR_SIZE_KEYS).join(", ") + ".");
  }
  return normalized;
}

/** Normalize only complete CPR-size segments in a composed View key. */
export function normalizeComposedCPRSizeKey(key) {
  return String(key ?? "").replace(/(^|[-+])([pt]?)(ultra)(?=$|[-+])/gi, (_match, separator, prefix) => {
    return separator + (prefix.toLowerCase() === "p" ? "p" : "") + "Giant";
  });
}
