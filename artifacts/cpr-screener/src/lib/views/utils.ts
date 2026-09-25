import type { CPRLevels } from "../cpr";
import { pickOuterLevelPattern, classifyCPRPair } from "../cpr";

export function computePrevPattern(today: CPRLevels, prev: CPRLevels | undefined | null): string | null {
  if (!prev) return null;
  return pickOuterLevelPattern(classifyCPRPair(today, prev));
}
