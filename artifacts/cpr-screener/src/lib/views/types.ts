import type {
  CPRResult,
  CPRLevels,
  SSRRCategory,
  HHLLCategory,
  SSLLCategory,
  RRHHCategory,
} from "../cpr";

export type LevelCheckKey =
  | "r4" | "r3" | "r2" | "prevHigh" | "r1" | "tc" | "pivot" | "bc"
  | "prevLow" | "s1" | "s2" | "s3" | "s4";

export interface LevelCheckCondition {
  key: LevelCheckKey;
  subject: "today" | "previous";
  bandKeys: [LevelCheckKey, LevelCheckKey];
}

export interface ViewDef {
  /** Unique key — matches the current pattern-key strings exactly. */
  key: string;
  label: string;
  parentKey?: string;
  kind: "category" | "pattern" | "view";
  standalone?: boolean;
  condition?: (r: CPRResult) => boolean;
  conditionKey?: string;
  direction?: "Up" | "Down";
  getTarget?: (r: CPRResult) => number;
  targetLabel?: string;
  getEntry?: (r: CPRResult) => number;
  entryLabel?: string;
  getStoploss?: (r: CPRResult) => number;
  stoplossLabel?: string;
  showInLeftNav?: boolean;
  order?: number;
  levelCheckDefs?: LevelCheckCondition[];
}

export interface ViewTreeNode {
  key: string;
  label: string;
  kind: "category" | "pattern" | "view";
  order?: number | undefined;
  children: ViewTreeNode[];
  viewDef?: ViewDef;
}

export type GapBadgeLetter1 = "R" | "S" | "Q";
export type GapBadgeLetter2 = "H" | "L" | "Q";
export type GapBadgeLetterAB = "A" | "B" | "Q";

export type SSRRLetter = "A" | "B" | "C" | "E";
export type HHLLLetter = "A" | "B" | "C" | "E";
export type RRHHSuffix = "AA" | "OA" | "BB" | "OB" | "C" | "E" | "RA" | "HA";
export type SSLLSuffix = "AA" | "OA" | "BB" | "OB" | "C" | "E" | "SB" | "LB";

export interface CompoundCombo {
  ssrr: SSRRLetter;
  hhll: HHLLLetter;
  rrhh: RRHHSuffix;
  ssll: SSLLSuffix;
  label?: string;
}
