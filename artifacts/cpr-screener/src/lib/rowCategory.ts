import type { CPRResult } from "./cpr";

/**
 * Which top-level category a scanned row belongs to, read directly off its
 * own classification flags — the SAME flags the top-level "category" Views
 * gate on. These are mutually exclusive partitions computed upstream in
 * cpr.ts (R1AbovePR4/S1BelowPS4 are true complements of levelsabove/
 * levelsbelow, and touchCategory already applies the shared precedence
 * rule), so every row resolves to at most one category whether or not it
 * also matches a specific curated View. Shared by SignalDesk and the
 * Screener table row so the two never drift apart.
 */
export function getRowCategory(
  r: Pick<
    CPRResult,
    "LevelsAbove" | "R1AbovePR4" | "LevelsBelow" | "compressed" | "expanded" | "S1BelowPS4" | "touchCategory"
  >
): string {
  if (r.LevelsAbove) return "levelsabove";
  if (r.R1AbovePR4) return "R1AbovePR4";
  if (r.LevelsBelow) return "levelsbelow";
  if (r.compressed) return "compressed";
  if (r.expanded) return "expanded";
  if (r.S1BelowPS4) return "S1BelowPS4";
  if (r.touchCategory) return "touch";
  return "";
}

/** Friendly display names for registry navigation keys. */
export const CATEGORY_LABELS: Record<string, string> = {
  levelsabove: "Level Above",
  levelsbelow: "Level Below",
  compressed: "Compressed",
  expanded: "Expanded",
  R1AbovePR4: "Above Level4",
  S1BelowPS4: "Below Level4",
  touch: "Touch",
  copyViews: "Created Views",
};

/** Falls back to the raw key so a brand-new category never silently vanishes. */
export function getCategoryLabel(rawCategory: string): string {
  if (!rawCategory) return "";
  return CATEGORY_LABELS[rawCategory] ?? rawCategory;
}

/** Faint text colour per category, for the plain caption in the Screener row. */
export const CATEGORY_TEXT_COLORS: Record<string, string> = {
  levelsabove: "text-emerald-400/80",
  R1AbovePR4: "text-emerald-300/80",
  levelsbelow: "text-rose-400/80",
  S1BelowPS4: "text-rose-300/80",
  compressed: "text-amber-400/80",
  expanded: "text-sky-400/80",
  touch: "text-violet-400/80",
};

/** Compact labels for space-constrained spots (e.g. beside "/USDT" under the symbol). */
export const CATEGORY_SHORT_LABELS: Record<string, string> = {
  levelsabove: "Lvl Abv",
  levelsbelow: "Lvl Blw",
  compressed: "Cmprsd",
  expanded: "Expnd",
  R1AbovePR4: "Abv L4",
  S1BelowPS4: "Blw L4",
  touch: "Touch",
};

export function getCategoryShortLabel(rawCategory: string): string {
  if (!rawCategory) return "";
  return CATEGORY_SHORT_LABELS[rawCategory] ?? getCategoryLabel(rawCategory);
}
