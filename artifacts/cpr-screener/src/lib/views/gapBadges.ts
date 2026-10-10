import type { CPRResult } from "../cpr";
import type { GapBadgeLetter1, GapBadgeLetter2, GapBadgeLetterAB } from "./types";

export function buildGapBadgeLabel(
  letter1: GapBadgeLetter1,
  letter2: GapBadgeLetter2,
  letter3: GapBadgeLetterAB,
  letter4: GapBadgeLetterAB,
  gapWinsPrev: boolean,
  gapWinsToday: boolean
): string {
  const part3 = gapWinsPrev ? `Gap${letter3}` : letter3;
  const part4 = gapWinsToday ? `${letter4}Gap` : letter4;
  return `${letter1}${letter2}-${part3}${part4}`;
}

export function computeGapBadge(r: CPRResult): string {
  const letter1: GapBadgeLetter1 =
    r.RRSSGapCategory === "RRGap" ? "R" : r.RRSSGapCategory === "SSGap" ? "S" : "Q";
  const letter2: GapBadgeLetter2 =
    r.PDHPDLGapCategory === "HHGap" ? "H" : r.PDHPDLGapCategory === "LLGap" ? "L" : "Q";

  const prevSW = r.prevCPR.HLSwitch;
  const todaySW = r.todayCPR.HLSwitch;
  const letter3: GapBadgeLetterAB = prevSW === "HL-A" ? "A" : prevSW === "HL-B" ? "B" : "Q";
  const letter4: GapBadgeLetterAB = todaySW === "HL-A" ? "A" : todaySW === "HL-B" ? "B" : "Q";

  const gapWinsPrev = prevSW !== "HL-Q" && r.hlGapWinner === "prev";
  const gapWinsToday = todaySW !== "HL-Q" && r.hlGapWinner === "today";

  return buildGapBadgeLabel(letter1, letter2, letter3, letter4, gapWinsPrev, gapWinsToday);
}

export const ALL_GAP_BADGES: string[] = (() => {
  const letter1s: GapBadgeLetter1[] = ["R", "S", "Q"];
  const letter2s: GapBadgeLetter2[] = ["H", "L", "Q"];
  const abqs: GapBadgeLetterAB[] = ["A", "B", "Q"];
  const winners: Array<"prev" | "today" | "none"> = ["prev", "today", "none"];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const letter1 of letter1s) {
    for (const letter2 of letter2s) {
      for (const letter3 of abqs) {
        for (const letter4 of abqs) {
          for (const winner of winners) {
            const gapWinsPrev = letter3 !== "Q" && winner === "prev";
            const gapWinsToday = letter4 !== "Q" && winner === "today";
            const label = buildGapBadgeLabel(letter1, letter2, letter3, letter4, gapWinsPrev, gapWinsToday);
            if (!seen.has(label)) {
              seen.add(label);
              out.push(label);
            }
          }
        }
      }
    }
  }
  out.sort();
  return out;
})();

export function matchesGapBadge(r: CPRResult, badge: string): boolean {
  return computeGapBadge(r) === badge;
}

import {
  ALL_CANDLE_CHECKS,
  type CandleCheckCode,
  CANDLE_CHECK_OPTIONS,
  matchesCandleCheck,
  candleCheckToCategoryKey,
} from "./candleChecks.ts";

export {
  ALL_CANDLE_CHECKS,
  type CandleCheckCode,
  CANDLE_CHECK_OPTIONS,
  matchesCandleCheck,
  candleCheckToCategoryKey,
};

export const ENTRY_OPTIONS = [
  "R4",
  "R3",
  "R2",
  "R1",
  "PH",
  "TC",
  "Pivot",
  "BC",
  "PL",
  "S1",
  "S2",
  "S3",
  "S4",
];

export const TARGET_OPTIONS = [
  "PH",
  "R1",
  "R2",
  "R3",
  "R4",
  "PL",
  "S1",
  "S2",
  "S3",
  "S4",
];

export function parseComposedViewKey(
  key: string
): { patternKey: string; entry?: string; target?: string; gapBadge?: string; candleCheck?: string } {
  let rest = key;

  let entry: string | undefined;
  for (const opt of ENTRY_OPTIONS) {
    if (rest.startsWith(`${opt}-`)) {
      entry = opt;
      rest = rest.slice(opt.length + 1);
      break;
    }
  }

  let candleCheck: string | undefined;
  for (const code of ALL_CANDLE_CHECKS) {
    if (rest === code || rest.startsWith(`${code}-`)) {
      candleCheck = code;
      rest = rest === code ? "" : rest.slice(code.length + 1);
      break;
    }
  }

  let target: string | undefined;
  for (const opt of TARGET_OPTIONS) {
    if (rest.endsWith(`-${opt}`)) {
      target = opt;
      rest = rest.slice(0, -(opt.length + 1));
      break;
    }
  }

  let gapBadge: string | undefined;
  for (const badge of ALL_GAP_BADGES) {
    if (rest.endsWith(`-${badge}`)) {
      gapBadge = badge;
      rest = rest.slice(0, -(badge.length + 1));
      break;
    }
  }

  return { patternKey: rest, entry, target, gapBadge, candleCheck };
}

