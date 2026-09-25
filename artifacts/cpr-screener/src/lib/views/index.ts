import { VIEWS } from "./registry";
import { CATEGORY_VIEWS } from "./categories/categories";
import { COMPOUND_VIEWS, PIVOT_PATTERNS } from "./categories/compound";
import { LEVELSABOVE_VIEWS } from "./categories/levelsAbove";
import { LEVELSBELOW_VIEWS } from "./categories/levelsBelow";
import { COMPRESSED_VIEWS } from "./categories/compressed";
import { EXPANDED_VIEWS } from "./categories/expanded";
import { R1ABOVEPR4_S1BELOWPS4_VIEWS } from "./categories/r4s4";
import { COPY_VIEWS } from "./categories/copyViews";
import { MISC_VIEWS, OUTER_LEVEL_PATTERNS } from "./categories/misc";
import {
  OVERLAP_ABOVE_TOUCH_VIEWS,
  INSIDE_CPR_TOUCH_VIEWS,
  OUTCPR_TOUCH_VIEWS,
  OVERLAP_BELOW_TOUCH_VIEWS,
} from "./categories/touchcpr";

// Populate VIEWS in the exact original declaration order
VIEWS.push(
  ...CATEGORY_VIEWS,
  ...COMPOUND_VIEWS,
  ...LEVELSABOVE_VIEWS,
  ...LEVELSBELOW_VIEWS
);

// Apply B-B-BB-BB patch (mirrors original views.ts line 2243)
{
  const bbbb = VIEWS.find((v) => v.key === "B-B-BB-BB");
  if (bbbb) {
    bbbb.direction = "Down";
    bbbb.targetLabel = "L2 (today's S2)";
    bbbb.getTarget = (r) => r.todayCPR.s2;
    bbbb.entryLabel = "BC (today's BC)";
    bbbb.getEntry = (r) => r.todayCPR.bc;
    bbbb.stoplossLabel = "R1 (today's R1)";
    bbbb.getStoploss = (r) => r.todayCPR.r1;
  }
}

VIEWS.push(
  ...COMPRESSED_VIEWS,
  ...EXPANDED_VIEWS,
  ...R1ABOVEPR4_S1BELOWPS4_VIEWS,
  ...COPY_VIEWS,
  ...MISC_VIEWS,
  ...OVERLAP_ABOVE_TOUCH_VIEWS,
  ...INSIDE_CPR_TOUCH_VIEWS,
  ...OUTCPR_TOUCH_VIEWS,
  ...OVERLAP_BELOW_TOUCH_VIEWS,
  ...OUTER_LEVEL_PATTERNS
);

// Re-export everything for backward compatibility
export * from "./types";
export * from "./gapBadges";
export * from "./registry";
export * from "./categories/categories";
export * from "./categories/compound";
export * from "./categories/levelsAbove";
export * from "./categories/levelsBelow";
export * from "./categories/compressed";
export * from "./categories/expanded";
export * from "./categories/r4s4";
export * from "./categories/copyViews";
export * from "./categories/misc";
export * from "./categories/touchcpr";
