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
  if (r.S1BelowPS4) return "BPS4";
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
  BPS4: "Below Level4",
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
  BPS4: "text-rose-300/80",
  compressed: "text-amber-400/80",
  expanded: "text-sky-400/80",
  touch: "text-lime-300",
};

/**
 * Level Above + Narow-A (narrow CPR rising): fold into one symbol caption
 * "LEVEL N-ABOVE" and hide the separate Narow-A pattern badge.
 */
export function isLevelNarrowAbove(
  r: Pick<CPRResult, "LevelsAbove" | "narrowCPR" | "cprRising"> & {
    InsideCPR?: boolean;
    insideCPR?: boolean;
  },
): boolean {
  const inside = !!(r.InsideCPR || r.insideCPR);
  return (
    r.LevelsAbove === true &&
    r.narrowCPR === true &&
    !inside &&
    r.cprRising === true
  );
}

/**
 * Level Below + Narow-B (narrow CPR falling): fold into "LEVEL N-BELOW" (pink)
 * and hide the separate Narow-B pattern badge.
 */
export function isLevelNarrowBelow(
  r: Pick<CPRResult, "LevelsBelow" | "narrowCPR" | "cprFalling"> & {
    InsideCPR?: boolean;
    insideCPR?: boolean;
  },
): boolean {
  const inside = !!(r.InsideCPR || r.insideCPR);
  return (
    r.LevelsBelow === true &&
    r.narrowCPR === true &&
    !inside &&
    r.cprFalling === true
  );
}


/**
 * Level Above + Wide-A (wide CPR rising): fold into "LEVEL W-ABOVE" and hide Wide-A badge.
 */
export function isLevelWideAbove(
  r: Pick<CPRResult, "LevelsAbove" | "strWideCPR" | "cprRising"> & {
    InsideCPR?: boolean;
    insideCPR?: boolean;
    outCPR?: boolean;
  },
): boolean {
  const inside = !!(r.InsideCPR || r.insideCPR);
  const out = !!r.outCPR;
  return (
    r.LevelsAbove === true &&
    r.strWideCPR === true &&
    !inside &&
    !out &&
    r.cprRising === true
  );
}

/** Level4 Below + Wide-B: fold the badge into the "W-BELOW LEVEL4" caption. */
export function isLevelWideBelow(
  r: Pick<CPRResult, "S1BelowPS4" | "strWideCPR" | "cprFalling"> & {
    InsideCPR?: boolean;
    insideCPR?: boolean;
    outCPR?: boolean;
  },
): boolean {
  const inside = !!(r.InsideCPR || r.insideCPR);
  const out = !!r.outCPR;
  return (
    r.S1BelowPS4 === true &&
    r.strWideCPR === true &&
    !inside &&
    !out &&
    r.cprFalling === true
  );
}

/** Symbol-cell category line (Screener + Backtest). */
export function getSymbolCategoryCaption(
  r: Parameters<typeof getRowCategory>[0] &
    Pick<CPRResult, "narrowCPR" | "cprRising" | "cprFalling" | "strWideCPR" | "overlapLower"> & {
      outCPR?: boolean;
      InsideCPR?: boolean;
      insideCPR?: boolean;
    },
): {
  label: string;
  className: string;
  segments?: Array<{ label: string; className: string }>;
} | null {
  if (isLevelNarrowAbove(r)) {
    return {
      label: "LEVEL N-ABOVE",
      className: CATEGORY_TEXT_COLORS.levelsabove ?? "text-emerald-400/80",
    };
  }
  if (isLevelNarrowBelow(r)) {
    return {
      label: "LEVEL N-BELOW",
      className: "text-[#ff6bb5]",
    };
  }
  if (isLevelWideAbove(r)) {
    return {
      label: "LEVEL W-ABOVE",
      className: CATEGORY_TEXT_COLORS.levelsabove ?? "text-emerald-400/80",
    };
  }
  if (isLevelWideBelow(r)) {
    return {
      label: "W-BELOW LEVEL4",
      className: CATEGORY_TEXT_COLORS.BPS4 ?? "text-rose-300/80",
    };
  }
  if (r.overlapLower && r.touchCategory && r.narrowCPR) {
    return {
      label: "OVERLAP NARROW-B",
      className: CATEGORY_TEXT_COLORS.touch ?? "text-lime-300",
      segments: [
        { label: "OVERLAP", className: CATEGORY_TEXT_COLORS.touch ?? "text-lime-300" },
        { label: "NARROW-B", className: "text-[#ff6bb5]" },
      ],
    };
  }
  const category = getRowCategory(r);
  if (!category) return null;
  return {
    label: getCategoryLabel(category),
    className: CATEGORY_TEXT_COLORS[category] ?? "text-muted-foreground",
  };
}
