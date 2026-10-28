import { VIEWS } from "./registry.ts";
import { stripDisambiguationSuffixes } from "./gapBadges.ts";
import type { LevelCheckCondition } from "./types.ts";

/** Normalize 13/13 MATCH flag (missing/undefined = off). */
export function isRequireFullMatchOn(v?: boolean): boolean {
  return v === true;
}

/**
 * Compare two sets of Level Check conditions for structural equality.
 * Order-independent: conditions are normalized by key, subject, and sorted bandKeys.
 */
export function areLevelCheckDefsEqual(
  a?: LevelCheckCondition[] | null,
  b?: LevelCheckCondition[] | null,
): boolean {
  const listA = a ?? [];
  const listB = b ?? [];
  if (listA.length === 0 && listB.length === 0) return true;
  if (listA.length !== listB.length) return false;

  const sig = (c: LevelCheckCondition) => {
    const b0 = String(c.bandKeys?.[0] ?? "");
    const b1 = String(c.bandKeys?.[1] ?? "");
    const bSorted = [b0, b1].sort().join("-");
    return `${c.key}:${c.subject}:${bSorted}`;
  };

  const setA = listA.map(sig).sort();
  const setB = listB.map(sig).sort();
  return setA.every((s, i) => s === setB[i]);
}

/**
 * Disambiguates or detects duplicates when creating, copying, or editing a View.
 *
 * Duplicate rule:
 * A duplicate occurs only when an existing View in the same structural family has:
 *   1. The SAME 13/13 MATCH setting (requireFullMatch on/off), AND
 *   2. The SAME Level Check conditions (areLevelCheckDefsEqual).
 *
 * If either differs:
 *   - Opposite MATCH setting: disambiguates via `-13` (MATCH on) or `-ANY` (MATCH off).
 *   - Different Level Check defs (different ladder geometry): disambiguates via `-LC2`, `-LC3`, etc.
 */
export function resolveCreateViewKey(
  baseKey: string,
  requireFullMatch?: boolean,
  ignoreKey?: string,
  levelCheckDefs?: LevelCheckCondition[],
): { key: string; conflict: boolean } {
  const raw = (baseKey || "").trim();
  if (!raw) return { key: raw, conflict: true };
  const base = stripDisambiguationSuffixes(raw);
  if (!base) return { key: raw, conflict: true };
  const fm = isRequireFullMatchOn(requireFullMatch);

  const findOther = (k: string) =>
    VIEWS.find((v) => v.key === k && (!ignoreKey || v.key !== ignoreKey));

  // Find all existing views belonging to this structural base family
  const familyViews = VIEWS.filter((v) => {
    if (ignoreKey && v.key === ignoreKey) return false;
    return stripDisambiguationSuffixes(v.key) === base;
  });

  // Check if an exact duplicate already exists (same MATCH setting + same levelCheckDefs)
  const exactDuplicate = familyViews.find(
    (v) =>
      isRequireFullMatchOn(v.requireFullMatch) === fm &&
      areLevelCheckDefsEqual(v.levelCheckDefs, levelCheckDefs),
  );
  if (exactDuplicate) {
    return { key: exactDuplicate.key, conflict: true };
  }

  // Not an exact duplicate: find a clean, unique disambiguated key.
  const existingBase = findOther(base);
  let preferred: string;
  if (existingBase && isRequireFullMatchOn(existingBase.requireFullMatch) !== fm) {
    preferred = fm ? `${base}-13` : `${base}-ANY`;
  } else {
    preferred = base;
  }

  if (!findOther(preferred)) {
    return { key: preferred, conflict: false };
  }

  let index = 2;
  while (true) {
    const candidate = `${preferred}-LC${index}`;
    if (!findOther(candidate)) {
      return { key: candidate, conflict: false };
    }
    index++;
  }
}
