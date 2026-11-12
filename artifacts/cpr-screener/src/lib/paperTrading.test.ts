import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGrossReturnPct,
  summarizePaperTrades,
  type PaperTradeRecord,
} from "./paperTrading.ts";
import { gradeTargetHit } from "./backtestOutcome.ts";
import { shouldHideTradfiCommodRow } from "./weekendMarketFilter.ts";
import {
  fetchDayExtremes,
  parseDayCandle,
  pickDayCandleLookups,
} from "./sessionExtremes.ts";
import type { OHLC } from "./cpr.ts";
import { analyzeCPR, getCompoundPatternForCprPair } from "./cpr.ts";
import {
  sessionR4OrS4Hit,
  sessionReachedR4OrS4,
  evaluateSignalCandles,
  livePriceCrossedBoundary,
  livePriceReachedTarget,
  effectiveSessionHigh,
  effectiveSessionLow,
  hasStickySessionPass,
  latchViewSessionPass,
  latchSessionR4OrS4,
  markStickySessionPass,
  entryTouchedThisSession,
} from "./signalOutcome.ts";
import { resolveSignalStatus } from "./signalStatus.ts";
import { getSymbolCategoryCaption, isLevelWideBelow } from "./rowCategory.ts";
import { fromCoinDCXPair, toCoinDCXPair } from "./coinDCXPair.ts";
import {
  findPD15MBelowSymbols,
  findPD15MBelowPass,
  findPD15MBelowTCSymbols,
  findPD15MMomentumBelowSymbols,
  loadPD15MMomentumBelowResults,
  loadPD15MTCBelowResults,
  previous15MMomentumCandidateCacheKey,
  savePD15MMomentumBelowResults,
  getPrevious15MACeiling,
  getPrevious15MBFloor,
  getPrevious15MAExtremeLow,
  passesPD15MBelowTCFilter,
  findPreviousUpexSymbols,
  findPreviousUpexPass,
  getUpexBc,
  getConsolidateABc,
  getConsolidateAPivot,
  getConsolidateBPivot,
  getConsolidateBTc,
  pruneLegacy15MResultCaches,
  passesPrevious15MBFilter,
  loadPrevious15MBResults,
  loadPreviousUpexResults,
  passesUpexFilter,
  previousUpexCandidateCacheKey,
  previousUpexSessionStartUtcMs,
  allBodiesThroughLevel,
  allCandlesThroughLevel,
  explainPD15MBelowTCFailure,
  explainUpexFailure,
  passesInsideR1S1Filter,
  formatPD15MBelowTCFailureNote,
  formatUpexFailureNote,
  savePreviousUpexResults,
  upexSessionStartUtcMs,
  countConsolidateZoneCandles,
  pickExclusiveConsolidateSide,
} from "./15MCandleCheck.ts";
import {
  matchesCandleCheck,
  ALL_CANDLE_CHECKS,
  CANDLE_CHECK_OPTIONS,
  PP_CANDLE_CHECK_OPTIONS,
  candleCheckFromRow,
  splitCandleCheck,
} from "./views/candleChecks.ts";
import {
  joinCPRSize,
  splitCPRSize,
  matchesCPRSize,
  getCPRSizeKey,
  isMicroOrTinyCPRSize,
} from "./views/cprSizes.ts";
import {
  parseComposedViewKey,
  stripDisambiguationSuffixes,
} from "./views/gapBadges.ts";
import {
  resolveCreateViewKey,
  resolveEditViewKey,
  areLevelCheckDefsEqual,
} from "./views/createViewKey.ts";
// The GitHub workflow scripts (createviewpatch.mjs / EditCopyViewpatch.mjs)
// resolve View keys with this module; it must agree with resolveCreateViewKey.
import { resolveViewKey as resolveViewKeyForWorkflow } from "../../../../.github/scripts/shared/resolveViewKey.mjs";
import type { LevelCheckCondition } from "./views/types.ts";
import { escapeTelegramHtml } from "./telegramHtml.ts";
import { pickLegacyExchangeSignalIds, isJournalSource } from "./journalPurge.ts";
import { isDeskSource } from "./deskSources.ts";
import { VIEWS } from "./views/registry.ts";

function trade(overrides: Partial<PaperTradeRecord> = {}): PaperTradeRecord {
  return {
    direction: "Up",
    entry: 100,
    exitPrice: 110,
    status: "PASS",
    ...overrides,
  };
}

test("previous compound pattern is reconstructed from the previous and prior CPRs", () => {
  const candles: OHLC[] = [
    { open: 100, high: 106, low: 98, close: 104, volume: 1, openTime: 0 },
    { open: 104, high: 108, low: 101, close: 102, volume: 1, openTime: 1 },
    { open: 102, high: 110, low: 100, close: 109, volume: 1, openTime: 2 },
  ];
  const result = analyzeCPR("TEST", candles, 109, 0, 1);
  assert.ok(result?.ppCPR);

  const previousPair = analyzeCPR(
    "TEST",
    [candles[0], candles[1]],
    candles[1].close,
    0,
    1,
  );
  assert.ok(previousPair);
  const expected = [
    previousPair.SSRRCategory.replace("RRSS-", ""),
    previousPair.HHLLCategory.replace("HHLL-", ""),
    previousPair.RRHHCategory.replace("RRHH-", ""),
    previousPair.SSLLCategory.replace("SSLL-", ""),
  ].join("-");

  assert.equal(
    getCompoundPatternForCprPair(result.prevCPR, result.ppCPR),
    expected,
  );
  assert.equal(getCompoundPatternForCprPair(result.prevCPR, null), null);
});

test("previous compound classifier can identify C-A-HA-AA", () => {
  const candles: OHLC[] = [
    {
      open: 23.123521090085514,
      high: 23.253315418287098,
      low: 22.606897008867453,
      close: 23.0838172184911,
      volume: 1,
      openTime: 0,
    },
    {
      open: 23.287549313394244,
      high: 23.446200789406106,
      low: 22.95520643943593,
      close: 23.033656870747567,
      volume: 1,
      openTime: 1,
    },
  ];
  const pair = analyzeCPR("TEST", candles, candles[1].close, 0, 1);
  assert.ok(pair);
  assert.equal(
    getCompoundPatternForCprPair(pair.todayCPR, pair.prevCPR),
    "C-A-HA-AA",
  );
});

test("calculates gross returns for long and short trades", () => {
  assert.equal(calculateGrossReturnPct(trade()), 10);
  assert.equal(
    calculateGrossReturnPct(trade({ direction: "Down", exitPrice: 80 })),
    20
  );
  assert.equal(
    calculateGrossReturnPct(trade({ status: "FAIL", exitPrice: 95 })),
    -5
  );
  assert.equal(
    calculateGrossReturnPct(
      trade({ direction: "SHORT", status: "FAIL", exitPrice: 105 })
    ),
    -5
  );
});

test("does not report returns for open, expired, invalid, or directionless trades", () => {
  assert.equal(calculateGrossReturnPct(trade({ status: "ACTIVE" })), null);
  assert.equal(calculateGrossReturnPct(trade({ status: "EXPIRED" })), null);
  assert.equal(calculateGrossReturnPct(trade({ entry: 0 })), null);
  assert.equal(calculateGrossReturnPct(trade({ exitPrice: 0 })), null);
  assert.equal(calculateGrossReturnPct(trade({ exitPrice: Number.NaN })), null);
  assert.equal(
    calculateGrossReturnPct(trade({ direction: "NEUTRAL" })),
    null
  );
});

test("summarizes statuses and averages only realized gross returns", () => {
  const summary = summarizePaperTrades([
    trade(),
    trade({ direction: "Down", exitPrice: 80 }),
    trade({ status: "FAIL", exitPrice: 95 }),
    trade({ status: "ACTIVE", exitPrice: undefined }),
    trade({ status: "EXPIRED" }),
  ]);

  assert.deepEqual(summary, {
    total: 5,
    pass: 2,
    fail: 1,
    active: 1,
    expired: 1,
    winRatePct: (2 / 3) * 100,
    averageGrossReturnPct: (10 + 20 - 5) / 3,
  });
});

test("uses null metrics when there are no resolved trades", () => {
  const summary = summarizePaperTrades([
    trade({ status: "ACTIVE" }),
    trade({ status: "EXPIRED" }),
  ]);

  assert.equal(summary.winRatePct, null);
  assert.equal(summary.averageGrossReturnPct, null);
});

test("resolves a short target when a candle low falls below TP", () => {
  const outcome = evaluateSignalCandles(
    { direction: "Down", entry: 4259.89, target: 4228.06, sl: 4283.08, timestamp: 1000 },
    [{ high: 4260, low: 4144.4 }],
    2000
  );

  assert.equal(outcome.status, "PASS");
  assert.equal(outcome.exitPrice, 4228.06);
  assert.match(outcome.outcomeNotes, /Target achieved/);
});

test("resolves the first reached boundary for a short signal", () => {
  const outcome = evaluateSignalCandles(
    { direction: "Down", entry: 100, target: 90, sl: 110, timestamp: 1000 },
    [{ high: 111, low: 89 }],
    2000
  );

  assert.equal(outcome.status, "FAIL");
  assert.equal(outcome.exitPrice, 110);
});

test("grades a touched S4 target as a pass for a Down view", () => {
  const candle: OHLC = {
    openTime: Date.parse("2026-09-23T00:00:00.000Z"),
    open: 0.058,
    high: 0.059,
    low: 0.04638,
    close: 0.04638,
    volume: 1,
  };

  assert.deepEqual(
    gradeTargetHit(false, 0.0544, "2026-09-23", candle, null),
    { result: "pass", hitDate: "2026-09-23", daysToHit: 0 }
  );
});

test("15M-A uses the 05:30 IST day boundary and ignores candles outside completed session data", () => {
  const now = Date.parse("2026-10-03T08:07:00.000Z");
  const start = upexSessionStartUtcMs(now);
  assert.equal(start, Date.parse("2026-10-03T00:00:00.000Z"));

  const candle = (openTime: number, open: number, close: number): OHLC => ({
    openTime,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1,
  });

  assert.equal(
    passesUpexFilter([{ ...candle(start + 15 * 60_000, 99, 99.5), high: 99.7 }], 100, start, now),
    false
  );
  assert.equal(
    passesUpexFilter([candle(start + 30 * 60_000, 99, 101)], 100, start, now),
    true
  );
  assert.equal(
    passesUpexFilter(
      [
        { ...candle(start, 99, 101), low: 95 },
        { ...candle(start + 15 * 60_000, 99, 98), low: 96 },
      ],
      100,
      start,
      now
    ),
    true
  );
  assert.equal(
    passesUpexFilter(
      [
        { ...candle(start, 99, 101), low: 97 },
        { ...candle(start + 15 * 60_000, 99, 98), low: 97 },
      ],
      100,
      start,
      now
    ),
    true
  );
  assert.equal(
    passesUpexFilter([candle(start - 15 * 60_000, 99, 99)], 100, start, now),
    null
  );
  assert.equal(
    passesUpexFilter([candle(now - 5 * 60_000, 99, 99)], 100, start, now),
    null
  );
});

test("15M-A uses previous day's BC only for today's Overlap Above rows", () => {
  assert.equal(getUpexBc(100, 90, true), 90);
  assert.equal(getUpexBc(100, 90, false), 100);
});

test("PD15M>BC checks the previous IST session and passes candles that are not fully below BC", () => {
  const now = Date.parse("2026-10-03T08:07:00.000Z");
  const end = upexSessionStartUtcMs(now);
  const start = previousUpexSessionStartUtcMs(now);
  assert.equal(start, Date.parse("2026-10-02T00:00:00.000Z"));
  assert.equal(end, Date.parse("2026-10-03T00:00:00.000Z"));

  // Between 00:00 and 05:30 IST (e.g. 02:00 AM IST on Oct 10 = 20:30 UTC on Oct 9),
  // session start must stay on Oct 9 00:00 UTC (not jump to the future Oct 10 00:00 UTC).
  const earlyMorningIst = Date.parse("2026-10-09T20:30:00.000Z");
  assert.equal(upexSessionStartUtcMs(earlyMorningIst), Date.parse("2026-10-09T00:00:00.000Z"));
  assert.equal(previousUpexSessionStartUtcMs(earlyMorningIst), Date.parse("2026-10-08T00:00:00.000Z"));

  const candle = (openTime: number, open: number, close: number): OHLC => ({
    openTime,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1,
  });

  assert.equal(
    passesUpexFilter([{ ...candle(start, 99, 99.5), high: 99.7 }], 100, start, end),
    false
  );
  assert.equal(
    passesUpexFilter([candle(start + 15 * 60_000, 99, 100)], 100, start, end),
    true
  );
  assert.equal(
    passesUpexFilter([candle(start + 30 * 60_000, 101, 99)], 100, start, end),
    true
  );
  assert.equal(
    passesUpexFilter(
      [
        { ...candle(start, 99, 101), low: 95 },
        { ...candle(start + 15 * 60_000, 99, 98), low: 96 },
      ],
      100,
      start,
      end
    ),
    true
  );
  assert.equal(
    passesUpexFilter(
      [
        { ...candle(start, 99, 101), low: 97 },
        { ...candle(start + 15 * 60_000, 99, 98), low: 97 },
      ],
      100,
      start,
      end
    ),
    true
  );
  assert.equal(
    passesUpexFilter(
      [
        { ...candle(start, 99, 101), low: 97 },
        { ...candle(start + 15 * 60_000, 99, 98), low: 97 },
        { ...candle(start + 30 * 60_000, 96, 95), low: 94 },
        { ...candle(start + 45 * 60_000, 93, 92), low: 91 },
      ],
      100,
      start,
      end
    ),
    false
  );
  assert.equal(
    passesUpexFilter([candle(end, 99, 99)], 100, start, end),
    null
  );
});

test("P-15M-B excludes a session only when a completed candle body is above BC", () => {
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const candle = (openTime: number, open: number, close: number): OHLC => ({
    openTime,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1,
  });

  assert.equal(
    passesPrevious15MBFilter(
      [candle(start, 99, 98), candle(start + 15 * 60_000, 101, 99)],
      100,
      start,
      now,
    ),
    true,
  );
  assert.equal(
    passesPrevious15MBFilter(
      [candle(start, 99, 98), candle(start + 15 * 60_000, 101, 102)],
      100,
      start,
      now,
    ),
    false,
  );
  assert.equal(
    passesPrevious15MBFilter([candle(start, 101, 99)], 100, start, now),
    true,
  );
  assert.equal(
    passesPrevious15MBFilter([candle(start, 100, 100)], 100, start, now),
    true,
  );
  assert.equal(
    passesPrevious15MBFilter([candle(now, 99, 98)], 100, start, now),
    null,
  );
});

test("PD-15M-Below-BC also fails when a candle body is wholly below the floor", () => {
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const candle = (openTime: number, open: number, close: number): OHLC => ({
    openTime,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1,
  });
  const bc = 100;
  const floor = 90;

  // Both open and close below the floor -> fails.
  assert.equal(
    passesPrevious15MBFilter([candle(start, 89, 88)], bc, start, now, floor),
    false,
  );
  // Only the wick dips below the floor (body straddles or sits above) -> passes.
  assert.equal(
    passesPrevious15MBFilter([candle(start, 91, 89)], bc, start, now, floor),
    true,
  );
  assert.equal(
    passesPrevious15MBFilter([candle(start, 89, 91)], bc, start, now, floor),
    true,
  );
  assert.equal(
    passesPrevious15MBFilter([{ ...candle(start, 95, 94), low: 80 }], bc, start, now, floor),
    true,
  );
  // A body exactly on the floor is not below it.
  assert.equal(
    passesPrevious15MBFilter([candle(start, 90, 90)], bc, start, now, floor),
    true,
  );
  // The BC rule still applies alongside the floor rule.
  assert.equal(
    passesPrevious15MBFilter([candle(start, 101, 102)], bc, start, now, floor),
    false,
  );
  assert.equal(
    passesPrevious15MBFilter(
      [candle(start, 95, 94), candle(start + 15 * 60_000, 96, 97)],
      bc,
      start,
      now,
      floor,
    ),
    true,
  );
  // Without a floor, candles below it are not checked.
  assert.equal(
    passesPrevious15MBFilter([candle(start, 89, 88)], bc, start, now),
    true,
  );
  // A non-finite floor can't be evaluated.
  assert.equal(
    passesPrevious15MBFilter([candle(start, 95, 94)], bc, start, now, Number.NaN),
    null,
  );
});

test("CONSOLIDATE-B floor mirrors the P-CONSOLIDATE-A wick reference rule", () => {
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const candle = (openTime: number, open: number, close: number): OHLC => ({
    openTime,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1,
  });
  const tc = 100;
  const floor = 90;

  // First body completely below floor fails immediately (gap on Candle 1).
  assert.equal(passesPD15MBelowTCFilter([{ ...candle(start, 89, 88), high: 89.5 }], tc, start, now, floor), false);
  // A body ending exactly at the floor does not establish a lower reference.
  assert.equal(passesPD15MBelowTCFilter([candle(start, 91, 90)], tc, start, now, floor), true);
  assert.equal(passesPD15MBelowTCFilter([candle(start, 90, 90)], tc, start, now, floor), true);
  const m = 15 * 60_000;
  // A subsequent candle whose body is in the floor may lower the reference; a later
  // body below that reference fails.
  assert.equal(
    passesPD15MBelowTCFilter(
      [
        { ...candle(start, 91, 89), low: 80 },
        { ...candle(start + m, 90.5, 89.5), low: 75 },
        candle(start + 2 * m, 88, 86),
      ],
      tc, start, now, floor,
    ),
    true,
  );
  assert.equal(
    passesPD15MBelowTCFilter(
      [
        { ...candle(start, 91, 89), low: 80 },
        { ...candle(start + m, 90.5, 89.5), low: 75 },
        { ...candle(start + 2 * m, 73, 74), high: 74.5 },
      ],
      tc, start, now, floor,
    ),
    false,
  );
  // The fresh-high-above-TC rule also applies alongside the floor rule.
  assert.equal(passesPD15MBelowTCFilter([{ ...candle(start, 101, 102), low: 100.5 }], tc, start, now, floor), false);
  // Without a floor or R2 input, only the TC rule applies.
  assert.equal(passesPD15MBelowTCFilter([candle(start, 89, 88)], tc, start, now), true);
  // A non-finite floor can't be evaluated.
  assert.equal(
    passesPD15MBelowTCFilter([candle(start, 95, 94)], tc, start, now, Number.NaN),
    null,
  );
});

test("CONSOLIDATE-B checks R2 and S2 wicks; MOMENTUM-B checks R2 only", () => {
  const start = Date.parse("2026-10-03T00:00:00.000Z");
  const now = start + 15 * 60_000;
  const candle = (low: number, high: number): OHLC => ({
    openTime: start,
    open: 100,
    high,
    low,
    close: 100,
    volume: 1,
  });
  const tc = 110;
  const floor = 80;
  const r2 = 130;
  const s2 = 70;

  // The R2 touch is also a TC/floor reference candle, but it still fails.
  const conR2Candle = candle(floor, r2);
  assert.equal(passesPD15MBelowTCFilter([conR2Candle], tc, start, now, floor, s2, r2), false);
  const conR2Failure = explainPD15MBelowTCFailure(
    [conR2Candle], tc, start, now, floor, s2, r2,
  );
  assert.equal(conR2Failure?.rule, "wickAtR2");
  assert.equal(conR2Failure?.previousLowestWick, floor);

  // The exact S2 touch is a floor-reference candle and fails CON-B.
  const conS2Candle = candle(s2, tc);
  assert.equal(passesPD15MBelowTCFilter([conS2Candle], tc, start, now, floor, s2, r2), false);
  assert.equal(
    explainPD15MBelowTCFailure([conS2Candle], tc, start, now, floor, s2, r2)?.rule,
    "wickAtS2",
  );

  // MOM-B has no S2 check, but its completed wick reaching R2 still fails.
  assert.equal(passesPD15MBelowTCFilter([candle(90, r2)], 100, start, now, undefined, s2, r2), false);
  assert.equal(passesPD15MBelowTCFilter([candle(s2, 100)], 100, start, now, undefined, s2, r2), true);
});

test("MOMENTUM-B is CONSOLIDATE-B without the PL/S1 floor check", async () => {
  const originalFetch = globalThis.fetch;
  const sessionStart = Date.parse("2026-10-01T00:00:00.000Z");
  const previousSession = sessionStart - 24 * 60 * 60 * 1000;
  globalThis.fetch = async () =>
    new Response(
      // open 89, high 89.5, low 87, close 88: candle wholly below a floor of 90
      // (wick does not reach it), well under TC 100, so no fresh high above TC.
      JSON.stringify([[previousSession, "89", "89.5", "87", "88", "1"]]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const candidate = { symbol: "MOMENTUMBTEST", source: "binance" as const, bc: 100, floor: 90 };
    // CONSOLIDATE-B (with the floor) excludes it...
    const consolidate = await findPD15MBelowTCSymbols([candidate], undefined, sessionStart);
    assert.equal(consolidate.included.has("binance:MOMENTUMBTEST"), false);
    // ...MOMENTUM-B ignores the floor and keeps it.
    const momentum = await findPD15MMomentumBelowSymbols([candidate], undefined, sessionStart);
    assert.equal(momentum.included.has("binance:MOMENTUMBTEST"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MOMENTUM-B keeps the fresh-high-above-TC rule", async () => {
  const originalFetch = globalThis.fetch;
  const sessionStart = Date.parse("2026-10-01T00:00:00.000Z");
  const previousSession = sessionStart - 24 * 60 * 60 * 1000;
  globalThis.fetch = async () =>
    new Response(
      // Whole body (101 -> 102) above TC 100 on the first candle: fails.
      JSON.stringify([[previousSession, "101", "103", "100.5", "102", "1"]]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const candidate = { symbol: "MOMENTUMBHIGH", source: "binance" as const, bc: 100 };
    const momentum = await findPD15MMomentumBelowSymbols([candidate], undefined, sessionStart);
    assert.equal(momentum.included.has("binance:MOMENTUMBHIGH"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MOMENTUM-B scan forwards the candidate R2 level", async () => {
  const originalFetch = globalThis.fetch;
  const sessionStart = Date.parse("2026-10-01T00:00:00.000Z");
  const previousSession = sessionStart - 24 * 60 * 60 * 1000;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([[previousSession, "100", "130", "99", "100", "1"]]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const candidate = {
      symbol: "MOMENTUMR2TEST",
      source: "binance" as const,
      bc: 110,
      r2: 130,
    };
    const momentum = await findPD15MMomentumBelowSymbols([candidate], undefined, sessionStart);
    assert.equal(momentum.included.has("binance:MOMENTUMR2TEST"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MOMENTUM-B results are cached separately from CONSOLIDATE-B", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  try {
    const sessionStart = Date.parse("2026-10-03T00:00:00.000Z");
    const candidate = { symbol: "BTCUSDT", source: "binance" as const, bc: 100 };
    const key = previous15MMomentumCandidateCacheKey(sessionStart, candidate);
    assert.notEqual(
      previous15MMomentumCandidateCacheKey(sessionStart, { ...candidate, r2: 130 }),
      key,
    );
    savePD15MMomentumBelowResults(sessionStart, new Map([[key, true]]));

    assert.deepEqual([...loadPD15MMomentumBelowResults(sessionStart)], [[key, true]]);
    assert.equal(loadPD15MMomentumBelowResults(sessionStart + 24 * 60 * 60 * 1000).size, 0);
    // CONSOLIDATE-B's cache never sees MOMENTUM-B's results.
    assert.equal(loadPD15MTCBelowResults(sessionStart).size, 0);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});

test("CONSOLIDATE-A ceiling is the higher of previous PH and R1", () => {
  assert.equal(getPrevious15MACeiling({ prevHigh: 110, r1: 105 }), 110);
  assert.equal(getPrevious15MACeiling({ prevHigh: 110, r1: 115 }), 115);
  assert.equal(getPrevious15MACeiling({ prevHigh: 110, r1: 110 }), 110);
});

test("passesUpexFilter with ceiling fails when a candle body is above ceiling", () => {
  const start = Date.parse("2026-10-06T00:00:00.000Z");
  const now = Date.parse("2026-10-06T06:00:00.000Z");
  const bc = 100;
  const ceiling = 110;
  const makeCandle = (openTime: number, open: number, close: number): OHLC => ({
    openTime,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1,
  });

  // Candle body completely above ceiling (112, 114) fails
  assert.equal(
    passesUpexFilter([makeCandle(start, 112, 114)], bc, start, now, ceiling),
    false
  );

  // Candle body within range (102, 105) with wick above ceiling passes
  assert.equal(
    passesUpexFilter([{ ...makeCandle(start, 102, 105), high: 115 }], bc, start, now, ceiling),
    true
  );

  // Candle body exactly on ceiling (105, 110) passes
  assert.equal(
    passesUpexFilter([makeCandle(start, 105, 110)], bc, start, now, ceiling),
    true
  );

  const m = 15 * 60_000;
  // Reference candle with body in ceiling (110) wicked up to 125; later body (112/114) is above the ceiling
  // but under that reference high -> passes.
  assert.equal(
    passesUpexFilter(
      [{ ...makeCandle(start, 108, 112), high: 125 }, makeCandle(start + m, 112, 114)],
      bc, start, now, ceiling,
    ),
    true
  );
  // Later body (126/128) is above the reference high of 125 -> fails.
  assert.equal(
    passesUpexFilter(
      [{ ...makeCandle(start, 108, 112), high: 125 }, { ...makeCandle(start + m, 126, 128), low: 125.5 }],
      bc, start, now, ceiling,
    ),
    false
  );
});

test("CONSOLIDATE-A and MOMENTUM-A fail on inclusive S2 wicks; only CON-A checks R2", () => {
  const start = Date.parse("2026-10-06T00:00:00.000Z");
  const now = start + 15 * 60_000;
  const candle = (low: number, high: number): OHLC => ({
    openTime: start,
    open: 100,
    high,
    low,
    close: 100,
    volume: 1,
  });
  const bc = 100;
  const ceiling = 120;
  const r2 = 130;
  const extremeLow = 80;

  assert.equal(
    passesUpexFilter([candle(100, r2)], bc, start, now, ceiling, r2, extremeLow),
    false,
  );
  // This candle also spans BC, so its floor-reference wick at the Extreme Low must fail CON-A.
  assert.equal(
    passesUpexFilter([candle(extremeLow, 100)], bc, start, now, ceiling, r2, extremeLow),
    false,
  );
  assert.equal(
    passesUpexFilter([candle(100, r2 - 0.1)], bc, start, now, ceiling, r2, extremeLow),
    true,
  );

  const r2Failure = explainUpexFailure([candle(100, r2)], bc, start, now, ceiling, r2, extremeLow);
  assert.equal(r2Failure?.rule, "wickAtR2");
  const extremeLowFailure = explainUpexFailure([candle(extremeLow, 100)], bc, start, now, ceiling, r2, extremeLow);
  assert.equal(extremeLowFailure?.rule, "wickAtExtremeLow");
  assert.equal(extremeLowFailure?.previousLowestWick, extremeLow);
  const momAExtremeLowFailure = explainUpexFailure(
    [candle(extremeLow, 100)], bc, start, now, undefined, undefined, extremeLow,
  );
  assert.equal(momAExtremeLowFailure?.rule, "wickAtExtremeLow");

  // MOMENTUM-A ignores R2 but shares CON-A's wick-based Extreme Low failure.
  assert.equal(
    passesUpexFilter([candle(extremeLow, r2)], bc, start, now, undefined, undefined, extremeLow),
    false,
  );
  assert.equal(
    passesUpexFilter([candle(100, r2)], bc, start, now, undefined, r2, 90),
    true,
  );
});

test("Extreme Low rule uses the higher of PL and S1 for CON-A and MOM-A", () => {
  assert.equal(getPrevious15MAExtremeLow({ prevLow: 90, s1: 95 }), 95);
  assert.equal(getPrevious15MAExtremeLow({ prevLow: 98, s1: 95 }), 98);
  // CON-B floor is the opposite pick (lower of the two).
  assert.equal(getPrevious15MBFloor({ prevLow: 90, s1: 95 }), 90);

  const start = Date.parse("2026-10-06T00:00:00.000Z");
  const now = Date.parse("2026-10-06T06:00:00.000Z");
  const mk = (low: number, high: number) => ({
    openTime: start, open: 100, high, low, close: 100, volume: 1,
  });
  const extremeLow = getPrevious15MAExtremeLow({ prevLow: 90, s1: 95 });
  // A wick down to 95 (S1) is far above S2 (say 70) but still fails the Extreme Low rule.
  assert.equal(passesUpexFilter([mk(95, 110)], 100, start, now, undefined, undefined, extremeLow), false);
  // Staying above the Extreme Low passes.
  assert.equal(passesUpexFilter([mk(95.5, 110)], 100, start, now, undefined, undefined, extremeLow), true);
  const failure = explainUpexFailure([mk(95, 110)], 100, start, now, undefined, undefined, extremeLow);
  assert.equal(failure?.rule, "wickAtExtremeLow");
  assert.equal(failure?.extremeLow, 95);
  const note = formatUpexFailureNote(failure!, undefined, "Pivot");
  assert.match(note.label, /Extreme Low/);
  assert.match(note.detail, /higher of PL\/S1/);
});

test("MOMENTUM-A and CONSOLIDATE-A use reference candle principle for Pivot floor", () => {
  const start = Date.parse("2026-10-06T00:00:00.000Z");
  const now = Date.parse("2026-10-06T06:00:00.000Z");
  const m = 15 * 60_000;
  const bc = 100;
  const ceiling = 120;
  const c = (
    i: number,
    open: number,
    high: number,
    low: number,
    close: number
  ): OHLC => ({ openTime: start + i * m, open, high, low, close, volume: 1 });
  const c0 = c(0, 101, 103, 98, 102);           // body above BC
  const c1 = c(1, 99, 102, 92, 101);            // body in BC, sets reference low = 92
  const c2 = c(2, 99.5, 101, 90, 100.5);        // body in BC, low 90 < 92 -> new reference low = 90
  const c3 = c(3, 98, 99.5, 89.5, 99);          // body below BC, body high 99 >= 90 -> passes
  const c4 = c(4, 88, 89.5, 87, 89);            // body below reference low 90 -> fails

  assert.equal(passesUpexFilter([c0, c1, c2, c3], bc, start, now, ceiling), true);
  assert.equal(passesUpexFilter([c0, c1, c2, c3, c4], bc, start, now, ceiling), false);
  // MOMENTUM-A uses the same Pivot reference-floor check.
  assert.equal(passesUpexFilter([c0, c1, c2, c3], bc, start, now), true);
  assert.equal(passesUpexFilter([c0, c1, c2, c3, c4], bc, start, now), false);
  // Candle 1 gap below Pivot fails immediately.
  assert.equal(passesUpexFilter([c(0, 98, 99, 97, 98.5)], bc, start, now), false);
});

test("MOMENTUM-A and CONSOLIDATE-A reference the Pivot, not BC, when the levels differ", () => {
  const start = Date.parse("2026-10-06T00:00:00.000Z");
  const now = Date.parse("2026-10-06T01:00:00.000Z");
  const candle = (openTime: number, open: number, high: number, low: number, close: number): OHLC => ({
    openTime, open, high, low, close, volume: 1,
  });
  const candleTouchingBCOnly = candle(start, 99, 103, 98, 100);
  // BC=100 is touched, but Pivot=105 is not. Below-Pivot price without a Pivot
  // reference candle must fail both MOM-A and CON-A.
  assert.equal(passesUpexFilter([candleTouchingBCOnly], 105, start, now), false);
  assert.equal(passesUpexFilter([candleTouchingBCOnly], 105, start, now, 120), false);
  // The same candle would pass if the old BC=100 floor were still used.
  assert.equal(passesUpexFilter([candleTouchingBCOnly], 100, start, now), true);
});

test("MOMENTUM-A / CONSOLIDATE-A Pivot floor: full-body-below-Pivot candles before reference candle are buffered", () => {
  // Regression test: earlier full-body-below-BC candles must be checked against
  // the first BC-spanning reference candle (Reference Candle Principle for floor).
  const start = Date.parse("2026-10-08T00:00:00.000Z");
  const now = start + 10 * 15 * 60_000;
  const m = 15 * 60_000;
  const bc = 100;
  const ceiling = 120;
  const c = (
    i: number,
    open: number,
    high: number,
    low: number,
    close: number,
  ): OHLC => ({ openTime: start + i * m, open, high, low, close, volume: 1 });

  // Scenario A: early full-body-below-BC candle, then BC-spanning candle whose low is ABOVE
  // the early candle's bodyHigh → early candle's body is below reference low → should fail.
  //   c0: body fully above BC (no issue)
  //   c1: body fully below BC, bodyHigh = 96 (buffered, no reference yet)
  //   c2: body in BC, low = 97 > 96 → refFloorLow = 97
  //     → retroactive check: c1 bodyHigh(96) < refFloorLow(97) → FAIL
  const cA0 = c(0, 102, 105, 101, 103);     // body above BC
  const cA1 = c(1, 93, 96, 91, 95);         // full body below BC, bodyHigh=95 (buffered)
  const cA2 = c(2, 98, 103, 97, 101);       // body in BC, low=97 → refFloorLow=97, retro-check: 95 < 97 → fail
  assert.equal(passesUpexFilter([cA0, cA1, cA2], bc, start, now), false);
  assert.equal(passesUpexFilter([cA0, cA1, cA2], bc, start, now, ceiling), false);

  // Scenario B: early full-body-below-BC candle, then BC-spanning candle whose low is BELOW
  // the early candle's bodyHigh → early candle passes retroactive check.
  //   c0: body above BC
  //   c1: body fully below BC, bodyHigh = 96 (buffered)
  //   c2: body in BC, low = 94 → refFloorLow = 94, retro-check: 96 >= 94 → passes
  const cB0 = c(0, 102, 105, 101, 103);
  const cB1 = c(1, 93, 96, 91, 95);         // full body below BC, bodyHigh=95 (buffered)
  const cB2 = c(2, 98, 103, 94, 101);       // body in BC, low=94 → refFloorLow=94, 95 >= 94 → passes
  assert.equal(passesUpexFilter([cB0, cB1, cB2], bc, start, now), true);
  assert.equal(passesUpexFilter([cB0, cB1, cB2], bc, start, now, ceiling), true);

  // Scenario C: no BC-spanning candle ever, but a full-body-below-BC candle exists → fail.
  const cC0 = c(0, 102, 105, 101, 103);     // body above BC
  const cC1 = c(1, 93, 96, 91, 95);         // full body below BC, bodyHigh=95, no ref candle → fail
  assert.equal(passesUpexFilter([cC0, cC1], bc, start, now), false);
  assert.equal(passesUpexFilter([cC0, cC1], bc, start, now, ceiling), false);
});

test("CONSOLIDATE-A ceiling check uses reference candle principle (PH / R1)", () => {
  const start = Date.parse("2026-10-07T00:00:00.000Z");
  const now = start + 8 * 15 * 60_000;
  const m = 15 * 60_000;
  const c = (
    i: number,
    open: number,
    high: number,
    low: number,
    close: number,
  ): OHLC => ({ openTime: start + i * m, open, high, low, close, volume: 1 });
  const ceiling = 120;
  const bc = 100;
  const c0 = c(0, 105, 108, 104, 106);          // body between BC and ceiling
  const c1 = c(1, 118, 122, 117, 121);          // body in ceiling (120), sets ref high = 122
  const c2 = c(2, 119, 125, 118, 121);          // body in ceiling, high 125 > 122 -> new ref high = 125
  const c3 = c(3, 121, 126, 120.5, 124);        // body above ceiling, but body low 121 <= 125 -> passes
  const c4 = c(4, 126, 128, 125.5, 127);        // body above ref high 125 -> fails CON-A

  assert.equal(passesUpexFilter([c0, c1, c2, c3], bc, start, now, ceiling), true);
  assert.equal(passesUpexFilter([c0, c1, c2, c3, c4], bc, start, now, ceiling), false);
  // MOMENTUM-A has NO ceiling check, so c4 passes MOM-A.
  assert.equal(passesUpexFilter([c0, c1, c2, c3, c4], bc, start, now), true);
  // Candle 1 gap above ceiling fails CON-A immediately.
  assert.equal(passesUpexFilter([c(0, 121, 123, 120.5, 122)], bc, start, now, ceiling), false);
});

test("PD-15M-Below-BC floor is the lower of previous PL and S1", () => {
  assert.equal(getPrevious15MBFloor({ prevLow: 90, s1: 95 }), 90);
  assert.equal(getPrevious15MBFloor({ prevLow: 90, s1: 85 }), 85);
  assert.equal(getPrevious15MBFloor({ prevLow: 90, s1: 90 }), 90);
});

test("historical PD15M>BC checks the session before the selected backtest date and caches passes", async () => {
  const originalFetch = globalThis.fetch;
  const entryDate = "2026-09-30";
  const sessionStart = Date.parse(`${entryDate}T00:00:00.000Z`);
  const expectedPreviousSession = sessionStart - 24 * 60 * 60 * 1000;
  let fetchCount = 0;

  globalThis.fetch = async (input) => {
    fetchCount++;
    const url = new URL(String(input));
    assert.equal(Number(url.searchParams.get("startTime")), expectedPreviousSession);
    assert.equal(Number(url.searchParams.get("endTime")), sessionStart);
    const symbol = url.searchParams.get("symbol");
    const candles = symbol === "PUEXPIVOTUSDT"
      ? [[expectedPreviousSession, "99", "103", "98", "100", "1"]]
      : symbol === "PUEXFAILUSDT"
      ? [
          [expectedPreviousSession, "90", "96", "89", "95", "1"],
          [expectedPreviousSession + 15 * 60_000, "88", "90", "86", "87", "1"],
          [expectedPreviousSession + 30 * 60_000, "85", "87", "83", "84", "1"],
        ]
      : symbol === "PUEXEMPTYUSDT"
        ? null
        : [[expectedPreviousSession, "101", "103", "100.5", "102", "1"]];
    return new Response(
      JSON.stringify(candles ?? []),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const candidate = { symbol: "PUEXTESTUSDT", source: "binance" as const, bc: 100 };
    assert.equal(await findPreviousUpexPass(candidate, sessionStart), true);
    assert.equal(await findPreviousUpexPass(candidate, sessionStart), true);
    assert.equal(
      await findPreviousUpexPass(
        { symbol: "PUEXPIVOTUSDT", source: "binance", bc: 100, referenceFloor: 105 },
        sessionStart,
      ),
      false,
    );
    assert.equal(
      await findPreviousUpexPass(
        { ...candidate, symbol: "PUEXFAILUSDT" },
        sessionStart,
      ),
      false,
    );
    assert.equal(
      await findPreviousUpexPass(
        { ...candidate, symbol: "PUEXEMPTYUSDT" },
        sessionStart,
      ),
      null,
    );
    assert.equal(fetchCount, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("historical P-15M-B fails only when a previous-session candle body is above BC", async () => {
  const originalFetch = globalThis.fetch;
  const entryDate = "2026-10-01";
  const sessionStart = Date.parse(`${entryDate}T00:00:00.000Z`);
  const expectedPreviousSession = sessionStart - 24 * 60 * 60 * 1000;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(Number(url.searchParams.get("startTime")), expectedPreviousSession);
    assert.equal(Number(url.searchParams.get("endTime")), sessionStart);
    const candle = url.searchParams.get("symbol") === "P15MBLOWUSDT"
      ? [expectedPreviousSession, "99", "100", "97", "98", "1"]
      : [expectedPreviousSession, "101", "103", "100.5", "102", "1"];
    return new Response(
      JSON.stringify([candle]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const candidate = { symbol: "P15MBLOWUSDT", source: "binance" as const, bc: 100 };
    assert.equal(await findPD15MBelowPass(candidate, sessionStart), true);
    assert.equal(
      await findPD15MBelowPass(
        { ...candidate, symbol: "P15MABOVEUSDT" },
        sessionStart,
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("historical PD-15M-Below-BC fails when a previous-session body is below the floor", async () => {
  const originalFetch = globalThis.fetch;
  const entryDate = "2026-10-01";
  const sessionStart = Date.parse(`${entryDate}T00:00:00.000Z`);
  const expectedPreviousSession = sessionStart - 24 * 60 * 60 * 1000;
  globalThis.fetch = async () =>
    new Response(
      // open 89, high 90, low 87, close 88 -> body wholly below 90, under BC 100
      JSON.stringify([[expectedPreviousSession, "89", "90", "87", "88", "1"]]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const candidate = { symbol: "PD15MFLOORUSDT", source: "binance" as const, bc: 100 };
    // Body is below a floor of 90 -> fail.
    assert.equal(
      await findPD15MBelowPass({ ...candidate, floor: 90 }, sessionStart),
      false,
    );
    // Same candles with a lower floor (e.g. S1 below PL) -> pass; also proves
    // the result isn't reused across different floors.
    assert.equal(
      await findPD15MBelowPass({ ...candidate, floor: 85 }, sessionStart),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PD15M>BC and P-15M-B share a previous-session candle request", async () => {
  const originalFetch = globalThis.fetch;
  const now = Date.parse("2026-10-04T00:00:00.000Z");
  const start = now - 24 * 60 * 60 * 1000;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(
      JSON.stringify([[start, "99", "99.5", "97", "98", "1"]]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const candidate = { symbol: "P15MSHAREDUSDT", source: "binance" as const, bc: 100 };
    const [above, below] = await Promise.all([
      findPreviousUpexSymbols([candidate], undefined, now),
      findPD15MBelowSymbols([candidate], undefined, now),
    ]);
    assert.equal(above.outcomes.get("binance:P15MSHAREDUSDT"), false);
    assert.equal(below.outcomes.get("binance:P15MSHAREDUSDT"), true);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("previous-session API failures are not cached and can be retried", async () => {
  const originalFetch = globalThis.fetch;
  const now = Date.parse("2026-10-06T00:00:00.000Z");
  const start = now - 24 * 60 * 60 * 1000;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    if (fetchCount === 1) return new Response("unavailable", { status: 400 });
    return new Response(
      JSON.stringify([[start, "99", "99.5", "97", "98", "1"]]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const candidate = { symbol: "P15MRETRYUSDT", source: "binance" as const, bc: 100 };
    const first = await findPreviousUpexSymbols([candidate], undefined, now);
    const second = await findPreviousUpexSymbols([candidate], undefined, now);
    assert.equal(first.outcomes.get("binance:P15MRETRYUSDT"), null);
    assert.equal(second.outcomes.get("binance:P15MRETRYUSDT"), false);
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PD15M>BC prepared results persist only for their matching session", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  try {
    const sessionStart = Date.parse("2026-10-03T00:00:00.000Z");
    const candidate = { symbol: "BTCUSDT", source: "binance" as const, bc: 100 };
    const results = new Map([
      [previousUpexCandidateCacheKey(sessionStart, candidate), true],
      [
        previousUpexCandidateCacheKey(sessionStart, {
          symbol: "ETHUSDT",
          source: "binance",
          bc: 200,
        }),
        null,
      ],
    ]);
    savePreviousUpexResults(sessionStart, results);

    assert.deepEqual(
      [...loadPreviousUpexResults(sessionStart)],
      [[previousUpexCandidateCacheKey(sessionStart, candidate), true]],
    );
    assert.equal(loadPreviousUpexResults(sessionStart + 24 * 60 * 60 * 1000).size, 0);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});

test("P-15M-B ignores cached results from the previous filter rule", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>([
    [
      "cpr_previous_15m_b_results_v1",
      JSON.stringify({
        sessionStart: Date.parse("2026-10-03T00:00:00.000Z"),
        results: { "BTCUSDT": true },
      }),
    ],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null },
  });

  try {
    assert.equal(loadPrevious15MBResults(Date.parse("2026-10-03T00:00:00.000Z")).size, 0);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});

test("PD-15M-Below-BC ignores cached results from before the floor check", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>([
    [
      "cpr_previous_15m_b_results_v2",
      JSON.stringify({
        sessionStart: Date.parse("2026-10-03T00:00:00.000Z"),
        results: { "2026-10-03|binance:BTCUSDT:100": true },
      }),
    ],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null },
  });

  try {
    assert.equal(loadPrevious15MBResults(Date.parse("2026-10-03T00:00:00.000Z")).size, 0);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});

test("CoinDCX futures pair conversion is shared by the screener and 15M-A", () => {
  assert.equal(toCoinDCXPair("BTCUSDT"), "B-BTC_USDT");
  assert.equal(fromCoinDCXPair("B-BTC_USDT"), "BTCUSDT");
  assert.equal(fromCoinDCXPair("BTC_USDT"), null);
});

test("live price beyond a short target resolves PASS when candle history is empty", () => {
  const outcome = evaluateSignalCandles(
    { direction: "Down", entry: 4254.94, target: 4218.31, sl: 4281.71, timestamp: 1000 },
    [{ high: 4135.51, low: 4135.51 }],
    2000
  );
  assert.equal(outcome.status, "PASS");
  assert.equal(outcome.exitPrice, 4218.31);
});

test("livePriceCrossedBoundary detects target and stop for both directions", () => {
  const short = { direction: "Down", target: 90, sl: 110 };
  assert.equal(livePriceCrossedBoundary(short, 89), true);
  assert.equal(livePriceCrossedBoundary(short, 111), true);
  assert.equal(livePriceCrossedBoundary(short, 100), false);
  const long = { direction: "Up", target: 110, sl: 90 };
  assert.equal(livePriceCrossedBoundary(long, 111), true);
  assert.equal(livePriceCrossedBoundary(long, 89), true);
  assert.equal(livePriceCrossedBoundary(long, 100), false);
  assert.equal(livePriceCrossedBoundary(long, undefined), false);
});

test("livePriceReachedTarget recognizes Up and Down target prices only", () => {
  assert.equal(livePriceReachedTarget("Up", 110, 110), true);
  assert.equal(livePriceReachedTarget("Up", 110, 111), true);
  assert.equal(livePriceReachedTarget("Up", 110, 109), false);
  assert.equal(livePriceReachedTarget("Down", 90, 90), true);
  assert.equal(livePriceReachedTarget("Down", 90, 89), true);
  assert.equal(livePriceReachedTarget("Down", 90, 91), false);
  assert.equal(livePriceReachedTarget("NEUTRAL", 100, 110), false);
  assert.equal(livePriceReachedTarget("Up", 100, undefined), false);
});

test("CONSOLIDATE-A bottom check uses PPDay BC when PDay overlaps above or is inside PPDay CPR", () => {
  const pp = { tc: 110, bc: 100 };
  // Overlap above: PDay BC within PPDay band, PDay TC above PPDay TC
  assert.equal(getConsolidateABc({ tc: 120, bc: 105 }, pp), 100);
  // Inside CPR: PDay band contained in PPDay band
  assert.equal(getConsolidateABc({ tc: 108, bc: 102 }, pp), 100);
  // Overlap below / out / above-gap: keep PDay BC
  assert.equal(getConsolidateABc({ tc: 105, bc: 95 }, pp), 95);
  assert.equal(getConsolidateABc({ tc: 120, bc: 95 }, pp), 95);
  assert.equal(getConsolidateABc({ tc: 130, bc: 115 }, pp), 115);
  // No PPDay data: fall back to PDay BC
  assert.equal(getConsolidateABc({ tc: 120, bc: 105 }, undefined), 105);
});

test("CONSOLIDATE-A and MOMENTUM-A use the matching Pivot reference when BC source is rewritten", () => {
  const pp = { tc: 110, bc: 100, pivot: 95 };
  assert.equal(getConsolidateAPivot({ tc: 120, bc: 105, pivot: 115 }, pp), 95);
  assert.equal(getConsolidateAPivot({ tc: 108, bc: 102, pivot: 106 }, pp), 95);
  assert.equal(getConsolidateAPivot({ tc: 105, bc: 95, pivot: 90 }, pp), 90);
  assert.equal(getConsolidateAPivot({ tc: 120, bc: 95, pivot: 90 }, pp), 90);
  assert.equal(getConsolidateAPivot({ tc: 130, bc: 115, pivot: 120 }, pp), 120);
  assert.equal(getConsolidateAPivot({ tc: 120, bc: 105, pivot: 103 }), 103);
});

test("CONSOLIDATE-B top check uses PPDay TC when PDay overlaps below or is inside PPDay CPR", () => {
  const pp = { tc: 110, bc: 100 };
  // Overlap below: PDay TC within PPDay band, PDay BC below PPDay BC
  assert.equal(getConsolidateBTc({ tc: 105, bc: 95 }, pp), 110);
  // Inside CPR
  assert.equal(getConsolidateBTc({ tc: 108, bc: 102 }, pp), 110);
  // Overlap above / out / gap-below: keep PDay TC
  assert.equal(getConsolidateBTc({ tc: 120, bc: 105 }, pp), 120);
  assert.equal(getConsolidateBTc({ tc: 120, bc: 95 }, pp), 120);
  assert.equal(getConsolidateBTc({ tc: 90, bc: 85 }, pp), 90);
  // No PPDay data: fall back to PDay TC
  assert.equal(getConsolidateBTc({ tc: 105, bc: 95 }, undefined), 105);
});

test("CONSOLIDATE-B and MOMENTUM-B use the matching Pivot-Ceiling reference when TC source is rewritten", () => {
  const pp = { tc: 110, bc: 100, pivot: 105 };
  // Overlap below / Inside: PPDay's Pivot, same source day as getConsolidateBTc
  assert.equal(getConsolidateBPivot({ tc: 105, bc: 95, pivot: 100 }, pp), 105);
  assert.equal(getConsolidateBPivot({ tc: 108, bc: 102, pivot: 106 }, pp), 105);
  // Overlap above / out / gap-below: PDay's own Pivot
  assert.equal(getConsolidateBPivot({ tc: 120, bc: 105, pivot: 113 }, pp), 113);
  assert.equal(getConsolidateBPivot({ tc: 120, bc: 95, pivot: 108 }, pp), 108);
  assert.equal(getConsolidateBPivot({ tc: 90, bc: 85, pivot: 88 }, pp), 88);
  // No PPDay data: fall back to PDay Pivot
  assert.equal(getConsolidateBPivot({ tc: 105, bc: 95, pivot: 100 }, undefined), 100);
});

test("Pivot-Ceiling reference failure note names the Pivot-Ceiling reference rule", () => {
  const note = formatPD15MBelowTCFailureNote(
    {
      rule: "freshHighAboveTC",
      openTime: "2026-10-02T03:00:00.000Z",
      candleNumber: 12,
      open: 112,
      close: 113,
      high: 114,
      low: 111,
      tc: 105,
      previousHighestWick: 108,
      previousHighestWickCandle: 4,
    } as Parameters<typeof formatPD15MBelowTCFailureNote>[0],
    "PDay Pivot",
  );
  assert.match(note.label, /Pivot-Ceiling reference/);
  assert.match(note.label, /PDay Pivot/);
  assert.match(note.detail, /Pivot-Ceiling reference rule/);
  assert.doesNotMatch(note.label + note.detail, /\bTC\b/);
});

test("CONSOLIDATE-B and MOMENTUM-B reference candle principle: upper side (TC rule)", () => {
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, high: number, low: number, close: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });
  const tc = 100;
  const floor = 80;
  const c1 = c(0, 101, 103, 100.5, 102);     // first body above TC -> fails immediately
  const c2 = c(1, 99, 105, 98, 101);         // body in TC, sets reference high = 105
  const c3 = c(2, 101, 104, 100.5, 102);     // body above TC but <= ref high 105 -> passes
  const c4 = c(3, 105.5, 107, 105.2, 106.5); // body above ref high 105 -> fails

  assert.equal(passesPD15MBelowTCFilter([c1], tc, start, now, floor), false);
  assert.equal(passesPD15MBelowTCFilter([c2, c3], tc, start, now, floor), true);
  assert.equal(passesPD15MBelowTCFilter([c2, c3, c4], tc, start, now, floor), false);
  // MOMENTUM-B (no floor) uses the same upper check.
  assert.equal(passesPD15MBelowTCFilter([c1], tc, start, now), false);
  assert.equal(passesPD15MBelowTCFilter([c2, c3], tc, start, now), true);
  assert.equal(passesPD15MBelowTCFilter([c2, c3, c4], tc, start, now), false);
});

test("BABY trending day setup: CON-B and MOM-B fail when price trends above TC reference high", () => {
  const start = Date.parse("2026-10-24T00:00:00.000Z");
  const now = Date.parse("2026-10-25T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, high: number, low: number, close: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });
  const tc = 0.013255;
  const floor = 0.012000;

  // Candle 1 starts around/below CPR
  const c1 = c(0, 0.013100, 0.013200, 0.013050, 0.013180);
  // Candle 2: body in TC -> initial reference
  const c2 = c(1, 0.013200, 0.013300, 0.013150, 0.013260);
  // Candle 3: body in TC, higher high -> updates reference high to 0.013400
  const c3 = c(2, 0.013250, 0.013400, 0.013210, 0.013280);
  // Candle 4: body in TC, higher high -> updates reference high to 0.013500
  const c4 = c(3, 0.013240, 0.013500, 0.013220, 0.013290);
  // Candle 5: body entirely above TC, body low 0.013320 <= ref high 0.013500 -> cannot be ref, passes
  const c5 = c(4, 0.013320, 0.013480, 0.013300, 0.013450);
  // Candle 6: whole candle (low 0.013510) above ref high 0.013500 -> CON-B and MOM-B fail!
  const c6 = c(5, 0.013520, 0.013700, 0.013510, 0.013650);

  // Candles 1-5 pass
  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4, c5], tc, start, now, floor), true);
  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4, c5], tc, start, now), true);

  // Candle 6 fails both CON-B and MOM-B
  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4, c5, c6], tc, start, now, floor), false);
  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4, c5, c6], tc, start, now), false);

  // Even with 20 continuous climbing candles where each opens below prior high, it remains failed
  const trendingCandles = [c1, c2, c3, c4, c5, c6];
  for (let i = 6; i < 26; i++) {
    const prev = trendingCandles[i - 1];
    trendingCandles.push(c(i, prev.close, prev.high + 0.0001, prev.close - 0.00005, prev.close + 0.00008));
  }
  assert.equal(passesPD15MBelowTCFilter(trendingCandles, tc, start, now, floor), false);
  assert.equal(passesPD15MBelowTCFilter(trendingCandles, tc, start, now), false);
});

test("CONSOLIDATE-B reference candle principle: lower side (floor rule)", () => {
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, high: number, low: number, close: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });
  const tc = 120;
  const floor = 90;
  const c1 = c(0, 94, 95, 92, 93);          // above floor
  const c2 = c(1, 89, 91, 87, 90.5);        // body in floor -> sets ref low 87
  const c3 = c(2, 89.5, 91, 85, 90.2);      // body in floor -> low 85 < 87 -> new ref low 85
  const c4 = c(3, 86, 88.5, 85.5, 87);      // body below floor, cannot be ref, body high 87 >= 85 -> fine
  const c5 = c(4, 82, 84.5, 81, 83);        // body below ref low 85 -> fails CON-B

  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4], tc, start, now, floor), true);
  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4, c5], tc, start, now, floor), false);
  // MOMENTUM-B has NO floor check, so it passes even when dropping below floor.
  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4, c5], tc, start, now), true);
  // Candle 1 gap below floor fails CON-B immediately.
  assert.equal(passesPD15MBelowTCFilter([c(0, 88, 89, 87, 88.5)], tc, start, now, floor), false);
});

test("pruneLegacy15MResultCaches removes only superseded cache versions", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const store: Record<string, string> = {
    cpr_previous_15m_tc_b_results_v1: "x",
    cpr_previous_15m_tc_b_results_v4: "x",
    cpr_previous_15m_tc_b_results_v5: "x",
    cpr_previous_15m_tc_b_results_v6: "x",
    cpr_previous_15m_tc_b_results_v7: "x",
    cpr_previous_15m_tc_b_results_v8: "x",
    cpr_previous_15m_tc_b_results_v9: "x",
    cpr_previous_15m_tc_b_results_v10: "x",
    cpr_previous_15m_tc_b_results_v11: "x",
    cpr_previous_15m_tc_b_results_v12: "x",
    cpr_previous_15m_tc_b_results_v13: "x",
    cpr_previous_15m_tc_b_results_v14: "x",
    cpr_previous_15m_tc_b_results_v15: "x",
    cpr_previous_15m_tc_b_results_v16: "keep",
    cpr_previous_15m_b_results_v1: "x",
    cpr_previous_15m_b_results_v3: "x",
    cpr_previous_15m_b_results_v4: "x",
    cpr_previous_15m_b_results_v5: "x",
    cpr_previous_15m_b_results_v6: "keep",
    cpr_previous_upex_results_v1: "x",
    cpr_previous_upex_results_v2: "x",
    cpr_previous_upex_results_v3: "x",
    cpr_previous_upex_results_v4: "x",
    cpr_previous_upex_results_v5: "x",
    cpr_previous_upex_results_v6: "x",
    cpr_previous_upex_results_v7: "x",
    cpr_previous_upex_results_v8: "x",
    cpr_previous_upex_results_v9: "x",
    cpr_previous_upex_results_v13: "x",
    cpr_previous_upex_results_v14: "x",
    cpr_previous_upex_results_v15: "x",
    cpr_previous_upex_results_v17: "x",
    cpr_previous_upex_results_v18: "keep",
    cpr_previous_15m_pp_momentum_a_results_v1: "x",
    cpr_previous_15m_pp_momentum_a_results_v2: "x",
    cpr_previous_15m_pp_momentum_a_results_v3: "x",
    cpr_previous_15m_pp_momentum_a_results_v4: "keep",
    cpr_previous_15m_pp_consolidate_b_results_v6: "x",
    cpr_previous_15m_pp_consolidate_b_results_v7: "x",
    cpr_previous_15m_pp_consolidate_b_results_v8: "keep",
    cpr_previous_15m_pp_momentum_b_results_v1: "x",
    cpr_previous_15m_pp_momentum_b_results_v2: "x",
    cpr_previous_15m_pp_momentum_b_results_v3: "keep",
    cpr_previous_15m_consolidate_a_results_v1: "x",
    cpr_previous_15m_consolidate_a_results_v2: "x",
    cpr_previous_15m_consolidate_a_results_v3: "x",
    cpr_previous_15m_consolidate_a_results_v4: "x",
    cpr_previous_15m_consolidate_a_results_v5: "x",
    cpr_previous_15m_consolidate_a_results_v6: "x",
    cpr_previous_15m_consolidate_a_results_v7: "x",
    cpr_previous_15m_consolidate_a_results_v8: "x",
    cpr_previous_15m_consolidate_a_results_v9: "x",
    cpr_previous_15m_consolidate_a_results_v10: "x",
    cpr_previous_15m_consolidate_a_results_v11: "x",
    cpr_previous_15m_consolidate_a_results_v15: "x",
    cpr_previous_15m_consolidate_a_results_v16: "x",
    cpr_previous_15m_consolidate_a_results_v17: "x",
    cpr_previous_15m_consolidate_a_results_v18: "x",
    cpr_previous_15m_consolidate_a_results_v19: "x",
    cpr_previous_15m_consolidate_a_results_v20: "x",
    cpr_previous_15m_consolidate_a_results_v21: "keep",
    cpr_previous_15m_pp_consolidate_a_results_v10: "x",
    cpr_previous_15m_pp_consolidate_a_results_v11: "x",
    cpr_previous_15m_pp_consolidate_a_results_v12: "x",
    cpr_previous_15m_pp_consolidate_a_results_v13: "keep",
    cpr_previous_15m_momentum_b_results_v1: "x",
    cpr_previous_15m_momentum_b_results_v2: "x",
    cpr_previous_15m_momentum_b_results_v3: "x",
    cpr_previous_15m_momentum_b_results_v4: "x",
    cpr_previous_15m_momentum_b_results_v5: "x",
    cpr_previous_15m_momentum_b_results_v6: "x",
    cpr_previous_15m_momentum_b_results_v7: "x",
    cpr_previous_15m_momentum_b_results_v8: "x",
    cpr_previous_15m_momentum_b_results_v9: "keep",
    "cpr_symbols_2026-10-09": "unrelated",
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new Proxy(store, {
      get: (t, prop) =>
        prop === "removeItem" ? (k: string) => { delete t[k]; } : t[prop as string],
    }),
  });
  try {
    assert.equal(pruneLegacy15MResultCaches(), 65);
    assert.deepEqual(Object.keys(store).sort(), [
      "cpr_previous_15m_b_results_v6",
      "cpr_previous_15m_consolidate_a_results_v21",
      "cpr_previous_15m_momentum_b_results_v9",
      "cpr_previous_15m_pp_consolidate_a_results_v13",
      "cpr_previous_15m_pp_consolidate_b_results_v8",
      "cpr_previous_15m_pp_momentum_a_results_v4",
      "cpr_previous_15m_pp_momentum_b_results_v3",
      "cpr_previous_15m_tc_b_results_v16",
      "cpr_previous_upex_results_v18",
      "cpr_symbols_2026-10-09",
    ]);
    // Running again is a no-op.
    assert.equal(pruneLegacy15MResultCaches(), 0);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});

test("reference candles use wick range: a wick-only touch of BC / TC / floor sets the reference", () => {
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const c = (open: number, close: number, low: number, high: number): OHLC => ({
    openTime: start, open, high, low, close, volume: 1,
  });
  // BC = 100. Body 99-99.5 is fully below BC, but the wick (high 100.2) touches it.
  assert.equal(passesUpexFilter([c(99, 99.5, 98, 100.2)], 100, start, now), true);
  // Wick stops short of BC (high 99.7): no reference, body fully below -> fails.
  assert.equal(passesUpexFilter([c(99, 99.5, 98, 99.7)], 100, start, now), false);
  // TC = 100. Body 101-102 is fully above TC, but the wick (low 99.8) touches it.
  assert.equal(passesPD15MBelowTCFilter([c(101, 102, 99.8, 103)], 100, start, now), true);
  // Wick stops short of TC (low 100.5): fresh high above TC -> fails.
  assert.equal(passesPD15MBelowTCFilter([c(101, 102, 100.5, 103)], 100, start, now), false);
  // CON-B floor = 90. Body 88-89 is fully below the floor, but the wick (high 90.3) touches it.
  assert.equal(passesPD15MBelowTCFilter([c(89, 88, 87, 90.3)], 100, start, now, 90), true);
  assert.equal(passesPD15MBelowTCFilter([c(89, 88, 87, 89.5)], 100, start, now, 90), false);
});

test("fail rules use the whole candle: only a candle entirely beyond the level AND the reference wick fails", () => {
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, close: number, low: number, high: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });
  // BC floor = 100, reference candle spans BC with low 98.
  const ref = c(0, 99.5, 100.5, 98, 101);
  // Body below the reference low, but the wick (high 98.4) is above it -> passes.
  assert.equal(passesUpexFilter([ref, c(1, 97, 97.5, 96, 98.4)], 100, start, now), true);
  // Whole candle (high 97.9) below the reference low 98 -> fails.
  assert.equal(passesUpexFilter([ref, c(1, 97, 97.5, 96, 97.9)], 100, start, now), false);
  // TC = 100, reference candle spans TC with high 102.
  const tcRef = c(0, 99.5, 100.5, 99, 102);
  // Body above the reference high, but the wick (low 101.5) dips below it -> passes.
  assert.equal(passesPD15MBelowTCFilter([tcRef, c(1, 103, 104, 101.5, 104.5)], 100, start, now), true);
  // Whole candle (low 102.1) above the reference high 102 -> fails.
  assert.equal(passesPD15MBelowTCFilter([tcRef, c(1, 103, 104, 102.1, 104.5)], 100, start, now), false);
});

test("diagnose wording describes the whole-candle rule and carries the candle's high/low", () => {
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, close: number, low: number, high: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });

  // CON-B / MOM-B ceiling: reference candle spans TC 100 with high 102; a later candle sits wholly above it.
  const tcFail = explainPD15MBelowTCFailure(
    [c(0, 99.5, 100.5, 99, 102), c(1, 103, 104, 102.1, 104.5)], 100, start, now,
  );
  assert.ok(tcFail && tcFail.rule === "freshHighAboveTC");
  assert.equal(tcFail.low, 102.1);
  assert.equal(tcFail.high, 104.5);
  const tcNote = formatPD15MBelowTCFailureNote(tcFail, "TC");
  assert.match(tcNote.detail, /sits entirely above TC 100/);
  assert.match(tcNote.detail, /low 102\.1 > earlier high 102/);
  assert.doesNotMatch(tcNote.detail, /body top/);

  // CON-B floor: reference candle touches floor 90 with low 85; a later candle sits wholly below it.
  const floorFail = explainPD15MBelowTCFailure(
    [c(0, 90.5, 91, 85, 92), c(1, 82, 83, 80, 84)], 120, start, now, 90,
  );
  assert.ok(floorFail && floorFail.rule === "floor");
  const floorNote = formatPD15MBelowTCFailureNote(floorFail, "TC");
  assert.match(floorNote.detail, /sits entirely below the PL\/S1 floor 90/);
  assert.match(floorNote.detail, /high 84 < low-wick reference 85/);

  // No candle ever touches the level: say so instead of quoting a missing reference.
  const noRef = explainPD15MBelowTCFailure([c(0, 103, 104, 102.1, 104.5)], 100, start, now);
  assert.ok(noRef);
  assert.match(formatPD15MBelowTCFailureNote(noRef, "TC").detail, /no candle touched TC/);

  // CON-A: candle wholly above the ceiling with a high-wick reference.
  const upexFail = explainUpexFailure(
    [c(0, 99.5, 100.5, 98, 101), c(1, 111, 112, 110.5, 113), c(2, 108, 109, 107.5, 110.2)],
    100, start, now, 110,
  );
  assert.ok(upexFail && upexFail.rule === "freshHighAboveCeiling");
  assert.equal(upexFail.low, 110.5);
  assert.match(formatUpexFailureNote(upexFail, "PH/R1").detail, /entirely above PH\/R1 110/);
});

test("allCandlesThroughLevel lists wick-range touches; allBodiesThroughLevel stays body-only", () => {
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, close: number, low: number, high: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });
  // Level 100. #1 body below but wick touches; #2 clear miss; #3 body spans.
  const candles = [c(0, 99, 99.5, 98, 100.2), c(1, 97, 97.5, 96, 98), c(2, 99.5, 100.5, 99, 101)];
  assert.deepEqual(allCandlesThroughLevel(candles, 100, start, now).map((x) => x.candleNumber), [1, 3]);
  assert.deepEqual(allBodiesThroughLevel(candles, 100, start, now).map((x) => x.candleNumber), [3]);
});

test("sessionExtremes: parseDayCandle only accepts a candle that opened during the current UTC day", () => {
  const now = Date.parse("2026-10-20T10:30:00.000Z");
  const dayStart = Date.parse("2026-10-20T00:00:00.000Z");
  const kline = (openTime: number, high: string, low: string) =>
    [openTime, "100", high, low, "101", "1", openTime + 86_399_999, "1", 1, "1", "1", "0"];
  assert.deepEqual(parseDayCandle([kline(dayStart, "104", "99")], now), { openTime: dayStart, high: 104, low: 99 });
  // Yesterday's candle (quiet symbol right after midnight) must never be used as today's.
  assert.equal(parseDayCandle([kline(dayStart - 86_400_000, "111", "95")], now), null);
  // Takes the last candle in the response.
  assert.equal(parseDayCandle([kline(dayStart - 86_400_000, "111", "95"), kline(dayStart, "104", "99")], now)?.high, 104);
  // Malformed / impossible values.
  assert.equal(parseDayCandle([], now), null);
  assert.equal(parseDayCandle(null, now), null);
  assert.equal(parseDayCandle([kline(dayStart, "98", "99")], now), null); // low > high
  assert.equal(parseDayCandle([kline(dayStart, "abc", "99")], now), null);
  assert.equal(parseDayCandle([kline(now + 60_000, "104", "99")], now), null); // opens in the future
});

test("sessionExtremes: only symbols whose rolling 24h extreme is beyond today's tracked range get a lookup", () => {
  const rows = [
    { symbol: "SPIKEUSDT", currentPrice: 102, todayHigh: 104, todayLow: 99 },   // rolling high 111 > 104
    { symbol: "QUIETUSDT", currentPrice: 50, todayHigh: 52, todayLow: 49 },      // rolling within today's range
    { symbol: "DIPUSDT", currentPrice: 20, todayHigh: 21, todayLow: 19.5 },      // rolling low 18 < 19.5
    { symbol: "NODATAUSDT", currentPrice: 7 },                                   // no todayHigh/Low yet
  ];
  const rollingHigh = new Map([["SPIKEUSDT", 111], ["QUIETUSDT", 52], ["DIPUSDT", 21], ["NODATAUSDT", 7]]);
  const rollingLow = new Map([["SPIKEUSDT", 99], ["QUIETUSDT", 49], ["DIPUSDT", 18], ["NODATAUSDT", 7]]);
  const picked = pickDayCandleLookups(rows, rollingHigh, rollingLow, new Map(), new Map());
  assert.deepEqual([...picked].sort(), ["DIPUSDT", "SPIKEUSDT"]);
  // A live price above today's tracked high counts too (tick moved past it).
  assert.deepEqual(
    pickDayCandleLookups([rows[1]], new Map([["QUIETUSDT", 55]]), new Map(), new Map([["QUIETUSDT", 53]]), new Map()),
    ["QUIETUSDT"],
  );
  // Never-checked first, then least recently checked; cap respected.
  const many = ["A", "B", "C", "D"].map((x) => ({ symbol: `${x}USDT`, currentPrice: 10, todayHigh: 10, todayLow: 10 }));
  const hi = new Map(many.map((r) => [r.symbol, 12]));
  const last = new Map([["AUSDT", 300], ["BUSDT", 100], ["CUSDT", 200]]); // D never checked
  assert.deepEqual(pickDayCandleLookups(many, hi, new Map(), new Map(), last, 3), ["DUSDT", "BUSDT", "CUSDT"]);
});

test("sessionExtremes: yesterday's spike (rolling high) does not become today's high; a real wick today does", async () => {
  const now = Date.parse("2026-10-20T10:30:00.000Z");
  const dayStart = Date.parse("2026-10-20T00:00:00.000Z");
  const kline = (high: string, low: string) => [[dayStart, "100", high, low, "102", "1", dayStart + 86_399_999, "1", 1, "1", "1", "0"]];
  const urls: string[] = [];
  const fetchJson = async (url: string) => {
    urls.push(url);
    if (url.includes("symbol=STEEMUSDT")) return kline("111", "99");      // today really printed 111
    if (url.includes("symbol=SPIKEUSDT")) return kline("104", "99");      // 24h ticker said 111, but that was yesterday
    if (url.includes("symbol=SPOTONLYUSDT")) return kline("5.5", "5.1");
    if (url.includes("symbol=BROKENUSDT")) throw new Error("network");
    return null;
  };
  const lastLookup = new Map<string, number>();
  const { dayHigh, dayLow } = await fetchDayExtremes({
    symbols: ["STEEMUSDT", "SPIKEUSDT", "SPOTONLYUSDT", "BROKENUSDT", "EMPTYUSDT"],
    spotSymbols: new Set(["SPOTONLYUSDT"]),
    nowMs: now,
    fetchJson,
    lastLookup,
  });
  assert.equal(dayHigh.get("STEEMUSDT"), 111);
  assert.equal(dayHigh.get("SPIKEUSDT"), 104); // NOT the 111 from the rolling 24h ticker
  assert.equal(dayLow.get("SPIKEUSDT"), 99);
  assert.equal(dayHigh.get("SPOTONLYUSDT"), 5.5);
  assert.equal(dayHigh.has("BROKENUSDT"), false); // a failed lookup yields no extremes and never throws
  assert.equal(dayHigh.has("EMPTYUSDT"), false);
  assert.equal(lastLookup.size, 5); // every attempt is recorded for round-robin fairness
  assert.ok(urls.find((u) => u.includes("SPOTONLYUSDT"))?.startsWith("https://api.binance.com/api/v3/klines"));
  assert.ok(urls.find((u) => u.includes("STEEMUSDT"))?.startsWith("https://fapi.binance.com/fapi/v1/klines"));
  assert.ok(urls.every((u) => u.includes("interval=1d") && u.includes("limit=1")));
});

test("Week toggle: ON hides TRADFI/COMMOD on weekends only; OFF always hides them; crypto is never hidden", () => {
  // Local-time constructors so getDay() matches regardless of the machine's timezone.
  const wednesday = new Date(2026, 9, 21, 12, 0, 0);
  const saturday = new Date(2026, 9, 24, 12, 0, 0);
  const sunday = new Date(2026, 9, 25, 12, 0, 0);
  for (const cls of ["TRADFI", "COMMOD"]) {
    // Week · on (hideOnWeekend = true)
    assert.equal(shouldHideTradfiCommodRow(cls, true, wednesday), false);
    assert.equal(shouldHideTradfiCommodRow(cls, true, saturday), true);
    assert.equal(shouldHideTradfiCommodRow(cls, true, sunday), true);
    // Week · off (hideOnWeekend = false): always hidden, any day
    assert.equal(shouldHideTradfiCommodRow(cls, false, wednesday), true);
    assert.equal(shouldHideTradfiCommodRow(cls, false, saturday), true);
  }
  for (const cls of ["CRYPTO", undefined, null, ""]) {
    assert.equal(shouldHideTradfiCommodRow(cls as string | undefined, true, saturday), false);
    assert.equal(shouldHideTradfiCommodRow(cls as string | undefined, false, wednesday), false);
  }
});

function withFakeLocalStorage(fn: () => void) {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

test("sticky session Pass is scoped to the exact symbol + View (no leak to other Views or symbols)", () => {
  withFakeLocalStorage(() => {
    assert.equal(hasStickySessionPass("STEEMUSDT", "VIEW_A"), false);
    markStickySessionPass("STEEMUSDT", "VIEW_A");
    assert.equal(hasStickySessionPass("STEEMUSDT", "VIEW_A"), true);
    assert.equal(hasStickySessionPass("STEEMUSDT", "VIEW_B"), false); // same symbol, other View
    assert.equal(hasStickySessionPass("BTCUSDT", "VIEW_A"), false);   // other symbol, same View
    // Without a View id there is nothing to scope to: never writes or reads a shared key.
    markStickySessionPass("STEEMUSDT", null);
    markStickySessionPass("STEEMUSDT", undefined);
    assert.equal(hasStickySessionPass("STEEMUSDT", null), false);
    assert.equal(hasStickySessionPass("STEEMUSDT", "VIEW_B"), false);
  });
});

test("a passed View stays Pass after a later rescan no longer sees the hit", () => {
  withFakeLocalStorage(() => {
    assert.equal(latchViewSessionPass("STEEMUSDT", "VIEW_A", true), true);
    assert.equal(latchViewSessionPass("STEEMUSDT", "VIEW_A", false), true);
    assert.equal(latchViewSessionPass("STEEMUSDT", "VIEW_B", false), false);
  });
});

test("latchSessionR4OrS4 merges R4+S4 only while live confirms; clears when live is null", () => {
  withFakeLocalStorage(() => {
    assert.equal(latchSessionR4OrS4("XMRUSDT", null), null);
    assert.equal(latchSessionR4OrS4("XMRUSDT", "S4"), "S4");
    // Live still confirms S4 → sticky may show S4.
    assert.equal(latchSessionR4OrS4("XMRUSDT", "S4"), "S4");
    // Other side tags while live still sees a hit → merge R4+S4.
    assert.equal(latchSessionR4OrS4("XMRUSDT", "R4"), "R4+S4");
    assert.equal(latchSessionR4OrS4("XMRUSDT", "R4+S4"), "R4+S4");
    // Live no longer confirms any touch → clear sticky (no false PASS from stale highs).
    assert.equal(latchSessionR4OrS4("XMRUSDT", null), null);
    assert.equal(latchSessionR4OrS4("BTCUSDT", null), null);
    assert.equal(hasStickySessionPass("XMRUSDT", "ANY_VIEW"), false);
  });
});

test("effective session extremes never sit on the wrong side of the last price; R4/S4 hit uses them", () => {
  assert.equal(effectiveSessionHigh(104, 111), 111);
  assert.equal(effectiveSessionHigh(104, 102), 104);
  assert.equal(effectiveSessionHigh(undefined, 102), 102);
  assert.equal(effectiveSessionHigh(undefined, undefined), undefined);
  assert.equal(effectiveSessionLow(99, 95), 95);
  assert.equal(effectiveSessionLow(99, 101), 99);
  assert.equal(effectiveSessionLow(0, 0), undefined);
  // Stored high lags the last price (missed tick): R4 still registers from the price.
  const cpr = { r4: 110, s4: 80 };
  assert.equal(sessionR4OrS4Hit({ currentPrice: 111, todayHigh: 104, todayLow: 99, todayCPR: cpr }), "R4");
  assert.equal(sessionR4OrS4Hit({ currentPrice: 100, todayHigh: 104, todayLow: 99, todayCPR: cpr }), null);
});

test("entryTouchedThisSession: live price OR the session extreme reaching the entry; garbage extremes ignored", () => {
  // Up entry 100: live price at/above, or session high at/above (then retraced).
  assert.equal(entryTouchedThisSession("Up", 100, 101, 102, 99), true);
  assert.equal(entryTouchedThisSession("Up", 100, 98, 103, 97), true);   // retraced below entry, high reached it
  assert.equal(entryTouchedThisSession("Up", 100, 98, 99.5, 97), false); // never got there
  assert.equal(entryTouchedThisSession("Up", 100, 98, undefined, undefined), false);
  // Down entry 100: mirrored with the session low.
  assert.equal(entryTouchedThisSession("Down", 100, 99, 101, 98), true);
  assert.equal(entryTouchedThisSession("Down", 100, 102, 104, 97), true); // bounced above entry, low reached it
  assert.equal(entryTouchedThisSession("Down", 100, 102, 104, 100.5), false);
  // Directions without an entry line count as touched (same as hasTouchedEntry).
  assert.equal(entryTouchedThisSession("LONG", 100, 50, undefined, undefined), true);
  // Untrustworthy session data must not fake an entry touch.
  assert.equal(entryTouchedThisSession("Down", 100, 102, 105, 0), false);    // low of 0
  assert.equal(entryTouchedThisSession("Down", 100, 102, 70, 75), false);    // inverted (stale) pair
  // A low far below the last price is normal (price rallied from it): the entry WAS touched.
  assert.equal(entryTouchedThisSession("Down", 100, 200, 205, 90), true);
  assert.equal(entryTouchedThisSession("Up", Number.NaN, 98, 150, 90), false);
});

test("resolveSignalStatus: entered trades stay entered after a retrace, so a stop-out is Fail not Ready", () => {
  const up = { direction: "Up", entry: 100, target: 110, stop: 95 };
  const down = { direction: "Down", entry: 100, target: 90, stop: 105 };
  // The reported gap: entered (high 103), then fell through the stop.
  assert.equal(resolveSignalStatus({ ...up, livePrice: 94, sessionHigh: 103, sessionLow: 94 }), "fail");
  assert.equal(resolveSignalStatus({ ...down, livePrice: 106, sessionHigh: 106, sessionLow: 97 }), "fail");
  // Entered, then retraced below the entry but above the stop: still Active, not Ready.
  assert.equal(resolveSignalStatus({ ...up, livePrice: 98, sessionHigh: 103, sessionLow: 97 }), "active");
  assert.equal(resolveSignalStatus({ ...down, livePrice: 102, sessionHigh: 103, sessionLow: 99 }), "active");
  // Never entered: a stop-level wick is not a failed trade.
  assert.equal(resolveSignalStatus({ ...up, livePrice: 97, sessionHigh: 99, sessionLow: 94 }), "ready");
  assert.equal(resolveSignalStatus({ ...up, livePrice: 98, sessionHigh: 99, sessionLow: 96 }), "ready");
  // Live price at/above entry with nothing else hit is Active.
  assert.equal(resolveSignalStatus({ ...up, livePrice: 102, sessionHigh: 104, sessionLow: 99 }), "active");
});

test("resolveSignalStatus: priority is Journal outcome > Pass (latched) > Fail > Active > Ready", () => {
  const up = { direction: "Up", entry: 100, target: 110, stop: 95 };
  const down = { direction: "Down", entry: 100, target: 90, stop: 105 };
  assert.equal(resolveSignalStatus({ ...up, livePrice: 94, sessionLow: 94, journalStatus: "PASS" }), "pass");
  assert.equal(resolveSignalStatus({ ...up, livePrice: 112, sessionHigh: 112, journalStatus: "FAIL" }), "fail");
  assert.equal(resolveSignalStatus({ ...up, livePrice: 100, journalStatus: "EXPIRED" }), "fail");
  // Target tagged then retraced: Pass, even with no entry touch and even if the stop is hit later.
  assert.equal(resolveSignalStatus({ ...up, livePrice: 99, sessionHigh: 111 }), "pass");
  assert.equal(resolveSignalStatus({ ...up, livePrice: 94, sessionHigh: 111, sessionLow: 94 }), "pass");
  assert.equal(resolveSignalStatus({ ...down, livePrice: 101, sessionLow: 89 }), "pass");
  assert.equal(resolveSignalStatus({ ...down, livePrice: 106, sessionLow: 89, sessionHigh: 106 }), "pass");
  // Journal ACTIVE counts as entered even with no price evidence.
  assert.equal(resolveSignalStatus({ ...up, livePrice: 94, journalStatus: "ACTIVE" }), "fail");
  assert.equal(resolveSignalStatus({ ...up, livePrice: 98, journalStatus: "ACTIVE" }), "active");
});

test("parseComposedViewKey parses candleCheck segment between entry and pattern", () => {
  // Target format: R1-CA-C-B-BB-LB-CL3U2-RH-GapAB-R4
  const parsed1 = parseComposedViewKey("R1-CA-C-B-BB-LB-CL3U2-RH-GapAB-R4");
  assert.equal(parsed1.entry, "R1");
  assert.equal(parsed1.candleCheck, "CA");
  assert.equal(parsed1.patternKey, "C-B-BB-LB-CL3U2");
  assert.equal(parsed1.gapBadge, "RH-GapAB");
  assert.equal(parsed1.target, "R4");

  // Without candleCheck (legacy/None format)
  const parsed2 = parseComposedViewKey("R1-C-B-BB-LB-CL3U2-RH-GapAB-R4");
  assert.equal(parsed2.entry, "R1");
  assert.equal(parsed2.candleCheck, undefined);
  assert.equal(parsed2.patternKey, "C-B-BB-LB-CL3U2");
  assert.equal(parsed2.gapBadge, "RH-GapAB");
  assert.equal(parsed2.target, "R4");

  // With candleCheck and without gapBadge
  const parsed3 = parseComposedViewKey("R1-MA-C-B-BB-LB-CL3U2-R4");
  assert.equal(parsed3.entry, "R1");
  assert.equal(parsed3.candleCheck, "MA");
  assert.equal(parsed3.patternKey, "C-B-BB-LB-CL3U2");
  assert.equal(parsed3.gapBadge, undefined);
  assert.equal(parsed3.target, "R4");

  // Other codes: CB and MB
  const parsedCB = parseComposedViewKey("TC-CB-A-A-AA-AA-S1");
  assert.equal(parsedCB.entry, "TC");
  assert.equal(parsedCB.candleCheck, "CB");
  assert.equal(parsedCB.patternKey, "A-A-AA-AA");
  assert.equal(parsedCB.target, "S1");

  const parsedMB = parseComposedViewKey("BC-MB-A-A-AA-AA-SL-GapAB-S4");
  assert.equal(parsedMB.entry, "BC");
  assert.equal(parsedMB.candleCheck, "MB");
  assert.equal(parsedMB.patternKey, "A-A-AA-AA");
  assert.equal(parsedMB.gapBadge, "SL-GapAB");
  assert.equal(parsedMB.target, "S4");

  // With PR4 as target
  const parsedPR4 = parseComposedViewKey("R1-CA-C-B-BB-LB-CL3U2-RH-GapAB-PR4");
  assert.equal(parsedPR4.entry, "R1");
  assert.equal(parsedPR4.candleCheck, "CA");
  assert.equal(parsedPR4.patternKey, "C-B-BB-LB-CL3U2");
  assert.equal(parsedPR4.gapBadge, "RH-GapAB");
  assert.equal(parsedPR4.target, "PR4");

  // With PS4 as target
  const parsedPS4 = parseComposedViewKey("S1-CB-A-A-AA-AA-PS4");
  assert.equal(parsedPS4.entry, "S1");
  assert.equal(parsedPS4.candleCheck, "CB");
  assert.equal(parsedPS4.patternKey, "A-A-AA-AA");
  assert.equal(parsedPS4.target, "PS4");
});

test("matchesCandleCheck validates CPRResult flags according to code", () => {
  const dummyCPR = {} as any;

  // CA: P-CONSOLIDATE-A requires PD15MConsolidateAPass === true
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MConsolidateAPass: true }, "CA"), true);
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MConsolidateAPass: false }, "CA"), false);
  assert.equal(matchesCandleCheck({ ...dummyCPR }, "CA"), false);

  // MA: P-MOMENTUM-A requires PD15MAboveBCPass === true && PD15MConsolidateAPass !== true
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MAboveBCPass: true, PD15MConsolidateAPass: false }, "MA"), true);
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MAboveBCPass: true, PD15MConsolidateAPass: true }, "MA"), false);
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MAboveBCPass: false }, "MA"), false);

  // CB: P-CONSOLIDATE-B requires PD15MBelowTCPass === true
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MBelowTCPass: true }, "CB"), true);
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MBelowTCPass: false }, "CB"), false);
  assert.equal(matchesCandleCheck({ ...dummyCPR }, "CB"), false);

  // MB: P-MOMENTUM-B requires PD15MMomentumBPass === true && PD15MBelowTCPass !== true
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MMomentumBPass: true, PD15MBelowTCPass: false }, "MB"), true);
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MMomentumBPass: true, PD15MBelowTCPass: true }, "MB"), false);
  assert.equal(matchesCandleCheck({ ...dummyCPR, PD15MMomentumBPass: false }, "MB"), false);

  // None / empty string
  assert.equal(matchesCandleCheck(dummyCPR, ""), true);
});

test("allBodiesThroughLevel detects all candle numbers whose body spans level", () => {
  const start = 0;
  const now = 4 * 15 * 60 * 1000; // 4 candles
  const makeCandle = (i: number, open: number, high: number, low: number, close: number): OHLC => ({
    openTime: i * 15 * 60 * 1000,
    open,
    high,
    low,
    close,
  });
  const c1 = makeCandle(0, 100, 105, 95, 102);  // body 100->102 (spans 101, spans 100) -> candle #1
  const c2 = makeCandle(1, 103, 106, 102, 105); // body 103->105 (does not span 101) -> candle #2
  const c3 = makeCandle(2, 102, 104, 99, 100);  // body 100->102 (spans 101) -> candle #3
  const c4 = makeCandle(3, 98, 101.5, 97, 101); // body 98->101 (spans 101) -> candle #4

  const matches101 = allBodiesThroughLevel([c1, c2, c3, c4], 101, start, now);
  assert.deepEqual(matches101.map((m) => m.candleNumber), [1, 3, 4]);

  const matchesNone = allBodiesThroughLevel([c1, c2, c3, c4], 110, start, now);
  assert.deepEqual(matchesNone, []);
});

test("CONSOLIDATE-B passes when candles before reference candle stay within reference candle high (GRAM 23 Oct case)", () => {
  const start = Date.parse("2026-10-22T00:00:00.000Z");
  const now = Date.parse("2026-10-23T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, high: number, low: number, close: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });
  const tc = 1.353;
  const floor = 1.328;

  // Candles 1-6: body fully above TC (1.353), but body <= candle 7 high (1.357)
  const c1 = c(0, 1.357, 1.360, 1.357, 1.357);
  const c2 = c(1, 1.357, 1.358, 1.355, 1.355);
  const c3 = c(2, 1.355, 1.356, 1.354, 1.355);
  const c4 = c(3, 1.355, 1.361, 1.355, 1.357);
  const c5 = c(4, 1.357, 1.357, 1.354, 1.356);
  const c6 = c(5, 1.356, 1.358, 1.355, 1.357);
  // Candle 7: body in TC (1.346 to 1.356 spans 1.353), high is 1.357
  const c7 = c(6, 1.356, 1.357, 1.339, 1.346);

  // Candles 1-7 pass because candles 1-6 bodyLow (1.355-1.357) <= candle 7 high (1.357)
  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4, c5, c6, c7], tc, start, now, floor), true);

  // If candle 1 had a full body above candle 7 high (e.g. open 1.359, close 1.358 -> bodyLow 1.358 > 1.357), it fails!
  const c1High = c(0, 1.359, 1.362, 1.358, 1.358);
  assert.equal(passesPD15MBelowTCFilter([c1High, c2, c3, c4, c5, c6, c7], tc, start, now, floor), false);

  // If no candle ever has body in TC, candles 1-6 fail
  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4, c5, c6], tc, start, now, floor), false);
});

test("stripDisambiguationSuffixes removes trailing -13, -ANY, and -LC suffixes", () => {
  assert.equal(stripDisambiguationSuffixes("R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4"), "R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4");
  assert.equal(stripDisambiguationSuffixes("R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4-13"), "R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4");
  assert.equal(stripDisambiguationSuffixes("R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4-ANY"), "R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4");
  assert.equal(stripDisambiguationSuffixes("R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4-LC2"), "R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4");
  assert.equal(stripDisambiguationSuffixes("R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4-13-LC2"), "R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4");
  assert.equal(stripDisambiguationSuffixes("R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4-ANY-LC3"), "R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4");
});

test("parseComposedViewKey parses disambiguated keys with suffixes", () => {
  const p1 = parseComposedViewKey("R1-MA-A-A-AA-AA-U3L4-RH-GapBB-R4-LC2");
  assert.equal(p1.entry, "R1");
  assert.equal(p1.candleCheck, "MA");
  assert.equal(p1.gapBadge, "RH-GapBB");
  assert.equal(p1.target, "R4");
  assert.equal(p1.patternKey, "A-A-AA-AA-U3L4");

  const p2 = parseComposedViewKey("TC-CB-A-A-AA-AA-S1-13-LC3");
  assert.equal(p2.entry, "TC");
  assert.equal(p2.candleCheck, "CB");
  assert.equal(p2.target, "S1");
  assert.equal(p2.patternKey, "A-A-AA-AA");
});

test("areLevelCheckDefsEqual compares Level Check condition sets correctly", () => {
  const cond1: LevelCheckCondition = { key: "r1", subject: "today", bandKeys: ["r1", "r2"] };
  const cond2: LevelCheckCondition = { key: "s1", subject: "previous", bandKeys: ["s1", "s2"] };
  const cond1RevBands: LevelCheckCondition = { key: "r1", subject: "today", bandKeys: ["r2", "r1"] };

  // Empty or undefined are equal
  assert.equal(areLevelCheckDefsEqual(undefined, undefined), true);
  assert.equal(areLevelCheckDefsEqual([], []), true);
  assert.equal(areLevelCheckDefsEqual(undefined, []), true);

  // Different counts
  assert.equal(areLevelCheckDefsEqual([cond1], []), false);

  // Same conditions in same order
  assert.equal(areLevelCheckDefsEqual([cond1, cond2], [cond1, cond2]), true);

  // Same conditions in different order
  assert.equal(areLevelCheckDefsEqual([cond1, cond2], [cond2, cond1]), true);

  // Band keys order-independent [r1, r2] vs [r2, r1]
  assert.equal(areLevelCheckDefsEqual([cond1], [cond1RevBands]), true);

  // Different band keys
  const condDiffBand: LevelCheckCondition = { key: "r1", subject: "today", bandKeys: ["r2", "r3"] };
  assert.equal(areLevelCheckDefsEqual([cond1], [condDiffBand]), false);
});

test("resolveCreateViewKey allows same code with different levelCheckDefs via -LC suffix", () => {
  const testKey = "TEST-SAMECODE-VIEW-R4";
  const condA: LevelCheckCondition[] = [{ key: "r1", subject: "today", bandKeys: ["r1", "r2"] }];
  const condB: LevelCheckCondition[] = [{ key: "r1", subject: "today", bandKeys: ["r2", "r3"] }];
  const condC: LevelCheckCondition[] = [{ key: "r1", subject: "today", bandKeys: ["r3", "r4"] }];

  // Clean up any test entries from previous runs if any
  const removeTestViews = () => {
    let i = VIEWS.findIndex((v) => v.key.startsWith(testKey));
    while (i !== -1) {
      VIEWS.splice(i, 1);
      i = VIEWS.findIndex((v) => v.key.startsWith(testKey));
    }
  };

  removeTestViews();

  try {
    // 1. First view with condA, requireFullMatch: true -> gets base key
    const res1 = resolveCreateViewKey(testKey, true, undefined, condA);
    assert.equal(res1.conflict, false);
    assert.equal(res1.key, testKey);

    // Register View 1
    VIEWS.push({
      key: res1.key,
      label: "Test 1",
      kind: "view",
      requireFullMatch: true,
      levelCheckDefs: condA,
    } as any);

    // 2. Duplicate attempt with identical condA and same requireFullMatch -> conflict!
    const resDup = resolveCreateViewKey(testKey, true, undefined, condA);
    assert.equal(resDup.conflict, true);
    assert.equal(resDup.key, testKey);

    // 3. Different Level Check conditions (condB) with same code + same 13/13 MATCH
    // -> MUST BE ALLOWED and disambiguated with -LC2!
    const res2 = resolveCreateViewKey(testKey, true, undefined, condB);
    assert.equal(res2.conflict, false);
    assert.equal(res2.key, `${testKey}-LC2`);

    // Register View 2
    VIEWS.push({
      key: res2.key,
      label: "Test 2",
      kind: "view",
      requireFullMatch: true,
      levelCheckDefs: condB,
    } as any);

    // 4. Duplicate of View 2 (condB) -> conflict on -LC2!
    const resDup2 = resolveCreateViewKey(testKey, true, undefined, condB);
    assert.equal(resDup2.conflict, true);
    assert.equal(resDup2.key, `${testKey}-LC2`);

    // 5. Third view with condC -> disambiguates to -LC3!
    const res3 = resolveCreateViewKey(testKey, true, undefined, condC);
    assert.equal(res3.conflict, false);
    assert.equal(res3.key, `${testKey}-LC3`);

    // 6. View with opposite MATCH (requireFullMatch: false) with condA -> gets -ANY
    const resAny = resolveCreateViewKey(testKey, false, undefined, condA);
    assert.equal(resAny.conflict, false);
    assert.equal(resAny.key, `${testKey}-ANY`);

    // 7. Editing View 2 (ignoreKey = TEST-SAMECODE-VIEW-R4-LC2) -> no conflict with itself
    const resEdit = resolveCreateViewKey(`${testKey}-LC2`, true, `${testKey}-LC2`, condB);
    assert.equal(resEdit.conflict, false);
  } finally {
    removeTestViews();
  }
});

// ---------------------------------------------------------------------------
// Edit View: duplicate check must run even when the key is unchanged
// ---------------------------------------------------------------------------

function withTestViews<T>(prefix: string, defs: Array<{ key: string; fm: boolean; lc?: LevelCheckCondition[] }>, fn: () => T): T {
  const remove = () => {
    let i = VIEWS.findIndex((v) => v.key.startsWith(prefix));
    while (i !== -1) {
      VIEWS.splice(i, 1);
      i = VIEWS.findIndex((v) => v.key.startsWith(prefix));
    }
  };
  remove();
  try {
    for (const d of defs) {
      VIEWS.push({ key: d.key, label: d.key, kind: "view", requireFullMatch: d.fm, levelCheckDefs: d.lc } as any);
    }
    return fn();
  } finally {
    remove();
  }
}

const LC_A: LevelCheckCondition[] = [{ key: "r1", subject: "today", bandKeys: ["r1", "r2"] }];
const LC_B: LevelCheckCondition[] = [{ key: "r1", subject: "today", bandKeys: ["r2", "r3"] }];
const LC_C: LevelCheckCondition[] = [{ key: "r1", subject: "today", bandKeys: ["r3", "r4"] }];

test("resolveEditViewKey: unchanged key that now duplicates a sibling is a conflict", () => {
  const P = "TEST-EDITKEY-R4";
  withTestViews(
    P,
    [
      { key: P, fm: true, lc: LC_A },
      { key: `${P}-LC2`, fm: true, lc: LC_B },
    ],
    () => {
      // Re-saving -LC2 unchanged: fine, key stays.
      const same = resolveEditViewKey(`${P}-LC2`, `${P}-LC2`, true, LC_B);
      assert.deepEqual(same, { key: `${P}-LC2`, conflict: false });

      // Edit re-derived its Level Check conditions and they now equal the base
      // View's (same MATCH): must be rejected even though the key did not move.
      const dup = resolveEditViewKey(`${P}-LC2`, `${P}-LC2`, true, LC_A);
      assert.equal(dup.conflict, true);
      assert.equal(dup.key, P);

      // Same conditions but different 13/13 MATCH is not a duplicate.
      const otherMatch = resolveEditViewKey(`${P}-LC2`, `${P}-LC2`, false, LC_A);
      assert.deepEqual(otherMatch, { key: `${P}-LC2`, conflict: false });
    },
  );
});

test("resolveEditViewKey: a View that keeps its key is never renumbered", () => {
  const P = "TEST-EDITKEY-NORENUM-R4";
  // -LC2 was deleted, leaving a gap; editing -LC3 must not become -LC2.
  withTestViews(
    P,
    [
      { key: P, fm: true, lc: LC_A },
      { key: `${P}-LC3`, fm: true, lc: LC_C },
    ],
    () => {
      const r = resolveEditViewKey(`${P}-LC3`, `${P}-LC3`, true, LC_C);
      assert.deepEqual(r, { key: `${P}-LC3`, conflict: false });
    },
  );
});

test("resolveEditViewKey: a changed key is disambiguated like create/copy", () => {
  const P = "TEST-EDITKEY-RENAME-R4";
  withTestViews(
    P,
    [
      { key: P, fm: true, lc: LC_A },
      { key: `${P}-LC2`, fm: true, lc: LC_B },
      { key: `${P}-OTHER`, fm: true, lc: LC_C },
    ],
    () => {
      // Editing -OTHER's key to the occupied base code with new conditions -> -LC3.
      const r = resolveEditViewKey(`${P}-OTHER`, P, true, LC_C);
      assert.deepEqual(r, { key: `${P}-LC3`, conflict: false });
      // ...and into an exact duplicate of -LC2 -> conflict reported on -LC2.
      const d = resolveEditViewKey(`${P}-OTHER`, P, true, LC_B);
      assert.equal(d.conflict, true);
      assert.equal(d.key, `${P}-LC2`);
    },
  );
});

// ---------------------------------------------------------------------------
// Workflow scripts must resolve to the same key as the app
// ---------------------------------------------------------------------------

test("workflow resolveViewKey matches resolveCreateViewKey across scenarios", () => {
  const P = "TEST-PARITY-R4";
  type D = { key: string; fm: boolean; lc?: LevelCheckCondition[] };
  const sets: Record<string, D[]> = {
    empty: [],
    base: [{ key: P, fm: true, lc: LC_A }],
    baseAndLc2: [
      { key: P, fm: true, lc: LC_A },
      { key: `${P}-LC2`, fm: true, lc: LC_B },
    ],
    // Opposite-MATCH sibling already taken at -13.
    oppositeTaken: [
      { key: P, fm: false, lc: LC_A },
      { key: `${P}-13`, fm: true, lc: LC_A },
    ],
    mixed: [
      { key: P, fm: true, lc: LC_A },
      { key: `${P}-ANY`, fm: false, lc: LC_A },
      { key: `${P}-LC2`, fm: true, lc: LC_B },
      { key: `${P}-ANY-LC2`, fm: false, lc: LC_B },
    ],
    // Base removed; only suffixed siblings remain.
    orphanLc2: [{ key: `${P}-LC2`, fm: true, lc: LC_B }],
  };
  const queries = [P, `${P}-LC2`, `${P}-13`, `${P}-ANY`];
  const defsOptions: Array<LevelCheckCondition[] | undefined> = [undefined, LC_A, LC_B, LC_C];
  let compared = 0;

  for (const [setName, defs] of Object.entries(sets)) {
    withTestViews(P, defs, () => {
      const scriptViews = defs.map((d) => ({ key: d.key, requireFullMatch: d.fm, levelCheckDefs: d.lc }));
      const ignoreOptions: Array<string | undefined> = [undefined, ...defs.map((d) => d.key)];
      for (const q of queries) {
        for (const fm of [true, false]) {
          for (const lc of defsOptions) {
            for (const ignore of ignoreOptions) {
              const app = resolveCreateViewKey(q, fm, ignore, lc);
              const wf = resolveViewKeyForWorkflow(q, {
                requireFullMatch: fm,
                levelCheckDefs: lc,
                ignoreKey: ignore,
                views: scriptViews,
              });
              assert.deepEqual(
                wf,
                app,
                `set=${setName} q=${q} fm=${fm} lc=${JSON.stringify(lc)} ignore=${ignore}`,
              );
              compared++;
            }
          }
        }
      }
    });
  }
  assert.ok(compared > 500);
});

test("workflow resolveViewKey: duplicate living at -LC2 is caught (family-wide check)", () => {
  const P = "TEST-WF-FAMILY-R4";
  const views = [
    { key: P, requireFullMatch: true, levelCheckDefs: LC_A },
    { key: `${P}-LC2`, requireFullMatch: true, levelCheckDefs: LC_B },
  ];
  // Asking for the base code with LC_B: base has different conditions, but
  // -LC2 already holds exactly this View. Used to create a second copy at -LC3.
  const r = resolveViewKeyForWorkflow(P, { requireFullMatch: true, levelCheckDefs: LC_B, views });
  assert.deepEqual(r, { key: `${P}-LC2`, conflict: true });
});

test("workflow resolveViewKey: opposite MATCH with -13 taken goes to -13-LC2", () => {
  const P = "TEST-WF-OPPOSITE-R4";
  const views = [
    { key: P, requireFullMatch: false, levelCheckDefs: LC_A },
    { key: `${P}-13`, requireFullMatch: true, levelCheckDefs: LC_A },
  ];
  const r = resolveViewKeyForWorkflow(P, { requireFullMatch: true, levelCheckDefs: LC_B, views });
  assert.deepEqual(r, { key: `${P}-13-LC2`, conflict: false });
});

test("escapeTelegramHtml escapes &, < and > so Telegram HTML mode never rejects a message", () => {
  assert.equal(escapeTelegramHtml("A&B <R1> 1:2.5"), "A&amp;B &lt;R1&gt; 1:2.5");
  // Plain values are untouched.
  assert.equal(escapeTelegramHtml("BTCUSDT"), "BTCUSDT");
  assert.equal(escapeTelegramHtml(67123.45), "67123.45");
  // Already-escaped input is escaped again (we only ever pass raw values).
  assert.equal(escapeTelegramHtml("&amp;"), "&amp;amp;");
  assert.equal(escapeTelegramHtml(undefined), "");
  assert.equal(escapeTelegramHtml(null), "");
});

test("pickLegacyExchangeSignalIds selects only Delta and CoinDCX records", () => {
  const rows = [
    { id: "a", source: "binance" },
    { id: "b", source: "delta" },
    { id: "c", source: "coindcx" },
    { id: "d" }, // missing source: never deleted
    { id: "e", source: "something-else" }, // unknown source: never deleted
    { id: "f", source: "delta" },
  ];
  assert.deepEqual(pickLegacyExchangeSignalIds(rows), ["b", "c", "f"]);
  assert.deepEqual(pickLegacyExchangeSignalIds([]), []);
  assert.deepEqual(pickLegacyExchangeSignalIds([{ id: "x", source: "binance" }]), []);
});

test("isJournalSource only accepts binance", () => {
  assert.equal(isJournalSource("binance"), true);
  assert.equal(isJournalSource("delta"), false);
  assert.equal(isJournalSource("coindcx"), false);
  assert.equal(isJournalSource(undefined), false);
  assert.equal(isJournalSource(""), false);
});

test("isDeskSource only accepts binance and nifty", () => {
  assert.equal(isDeskSource("binance"), true);
  assert.equal(isDeskSource("nifty"), true);
  assert.equal(isDeskSource("delta"), false);
  assert.equal(isDeskSource("coindcx"), false);
  assert.equal(isDeskSource(undefined), false);
});

test("parseComposedViewKey and matchesCandleCheck handle PP candle codes (single and combined)", () => {
  const pp = parseComposedViewKey("TC-PPCA-C-B-BB-LB-CL3U2-R4");
  assert.equal(pp.candleCheck, "PPCA");
  assert.equal(pp.patternKey, "C-B-BB-LB-CL3U2");
  assert.equal(pp.target, "R4");

  const both = parseComposedViewKey("TC-PPCB+CA-C-B-BB-LB-CL3U2-RH-GapAB-R4");
  assert.equal(both.entry, "TC");
  assert.equal(both.candleCheck, "PPCB+CA");
  assert.equal(both.patternKey, "C-B-BB-LB-CL3U2");
  assert.equal(both.gapBadge, "RH-GapAB");
  assert.equal(both.target, "R4");

  const r = { PD15MConsolidateAPass: true, PD15MPPConsolidateAPass: true } as unknown as Parameters<typeof matchesCandleCheck>[0];
  assert.equal(matchesCandleCheck(r, "PPCA"), true);
  assert.equal(matchesCandleCheck(r, "PPCB"), false);
  assert.equal(matchesCandleCheck(r, "PPCA+CA"), true);
  assert.equal(matchesCandleCheck(r, "PPCB+CA"), false);
});

test("PP-MOM-A / PP-MOM-B: dropdown, exclusivity vs PP-CON, combined codes and row priority", () => {
  assert.deepEqual(
    PP_CANDLE_CHECK_OPTIONS.map((o) => o.value),
    ["", "PPCA", "PPMA", "PPCB", "PPMB", "PPVR", "PPVA", "PPVB"],
  );
  assert.deepEqual(
    PP_CANDLE_CHECK_OPTIONS.map((o) => o.label),
    ["None", "PP-CON-A", "PP-MOM-A", "PP-CON-B", "PP-MOM-B", "PP-VOL-C", "PP-VOL-A", "PP-VOL-B"],
  );
  assert.deepEqual(
    CANDLE_CHECK_OPTIONS.map((o) => o.label),
    ["None", "P-CON-A", "P-MOM-A", "P-VOL-C", "P-VOL-A", "P-VOL-B", "P-CON-B", "P-MOM-B"],
  );
  const row = (f: Record<string, boolean>) => f as unknown as Parameters<typeof matchesCandleCheck>[0];

  // PPMB: PP-MOM-B passed and PP-CON-B did not.
  assert.equal(matchesCandleCheck(row({ PD15MPPMomentumBPass: true }), "PPMB"), true);
  assert.equal(matchesCandleCheck(row({ PD15MPPMomentumBPass: true, PD15MPPConsolidateBPass: true }), "PPMB"), false);
  // PPMA: PP-MOM-A passed and neither PP-CON side did.
  assert.equal(matchesCandleCheck(row({ PD15MPPMomentumAPass: true }), "PPMA"), true);
  assert.equal(matchesCandleCheck(row({ PD15MPPMomentumAPass: true, PD15MPPConsolidateAPass: true }), "PPMA"), false);
  assert.equal(matchesCandleCheck(row({ PD15MPPMomentumAPass: true, PD15MPPConsolidateBPass: true }), "PPMA"), false);
  // Combined PP + P segments must all pass.
  assert.equal(matchesCandleCheck(row({ PD15MPPMomentumBPass: true, PD15MConsolidateAPass: true }), "PPMB+CA"), true);
  assert.equal(matchesCandleCheck(row({ PD15MPPMomentumBPass: true }), "PPMB+CA"), false);
  assert.deepEqual(splitCandleCheck("PPMA+MB"), { pp: "PPMA", p: "MB" });
  assert.ok(ALL_CANDLE_CHECKS.includes("PPMA") && ALL_CANDLE_CHECKS.includes("PPMB"));

  // candleCheckFromRow priority: PPCB > PPMB > PPCA > PPMA. With no P-day flag set, P stays empty: a residual "P-VOLATILE ✗" badge means no exclusive P-pass, and binding VR would require INSIDE, so the new view would never match the row it was created from.
  assert.equal(candleCheckFromRow(row({ PD15MPPConsolidateBPass: true, PD15MPPMomentumBPass: true })), "PPCB");
  assert.equal(candleCheckFromRow(row({ PD15MPPMomentumBPass: true, PD15MPPConsolidateAPass: true })), "PPMB");
  assert.equal(candleCheckFromRow(row({ PD15MPPConsolidateAPass: true, PD15MPPMomentumAPass: true })), "PPCA");
  assert.equal(candleCheckFromRow(row({ PD15MPPMomentumAPass: true })), "PPMA");
  // A genuine P-day INSIDE pass still binds VR (alone and with a PP code).
  assert.equal(candleCheckFromRow(row({ PD15MInsideR1S1Pass: true })), "VR");
  assert.equal(candleCheckFromRow(row({ PD15MInsideR1S1Pass: true, PD15MPPConsolidateBPass: true })), "PPCB+VR");

  // PPVR: PP inside R1/PH-S1/PL, exclusive of PP-CON-A/B; lowest PP priority.
  assert.equal(matchesCandleCheck(row({ PD15MPPInsideR1S1Pass: true }), "PPVR"), true);
  assert.equal(matchesCandleCheck(row({ PD15MPPInsideR1S1Pass: true, PD15MPPConsolidateAPass: true }), "PPVR"), false);
  assert.equal(matchesCandleCheck(row({ PD15MPPInsideR1S1Pass: true, PD15MPPConsolidateBPass: true }), "PPVR"), false);
  assert.equal(matchesCandleCheck(row({ PD15MPPInsideR1S1Pass: true, PD15MConsolidateAPass: true }), "PPVR+CA"), true);
  assert.deepEqual(splitCandleCheck("PPVR+CB"), { pp: "PPVR", p: "CB" });
  assert.equal(candleCheckFromRow(row({ PD15MPPInsideR1S1Pass: true })), "PPVR");
  assert.equal(candleCheckFromRow(row({ PD15MPPInsideR1S1Pass: true, PD15MPPMomentumAPass: true })), "PPMA");

  // PPVA / PPVB: PP floor/ceiling check, exclusive of PP-CON, PP-MOM, PP-VR.
  assert.equal(matchesCandleCheck(row({ PD15MPPVolAPass: true }), "PPVA"), true);
  assert.equal(matchesCandleCheck(row({ PD15MPPVolAPass: true, PD15MPPConsolidateAPass: true }), "PPVA"), false);
  assert.equal(matchesCandleCheck(row({ PD15MPPVolBPass: true }), "PPVB"), true);
  assert.equal(matchesCandleCheck(row({ PD15MPPVolBPass: true, PD15MPPVolAPass: true }), "PPVB"), false);
  assert.equal(candleCheckFromRow(row({ PD15MPPVolAPass: true })), "PPVA");
  assert.equal(candleCheckFromRow(row({ PD15MPPVolBPass: true })), "PPVB");
  assert.equal(candleCheckFromRow(row({ PD15MPPVolBPass: true, PD15MPPVolAPass: true })), "PPVA");
  assert.equal(candleCheckFromRow(row({ PD15MPPVolAPass: true, PD15MPPInsideR1S1Pass: true })), "PPVR");
});

test("passesInsideR1S1Filter: wick through the band sets a reference, fails only when fully beyond it", () => {
  const MIN15 = 15 * 60 * 1000;
  const start = Date.UTC(2026, 9, 28);
  const now = start + 24 * 60 * MIN15 / 15; // end of a 24h session
  const floor = 90;
  const ceiling = 110;
  const mk = (i: number, open: number, high: number, low: number, close: number) => ({
    open, high, low, close, volume: 1, openTime: start + i * MIN15,
  });

  // All candles (wicks included) inside the band -> pass.
  assert.equal(
    passesInsideR1S1Filter([mk(0, 100, 105, 95, 102), mk(1, 102, 109, 91, 100)], floor, ceiling, start, now),
    true,
  );
  // A wick that pokes through the ceiling / floor spans the line: it is a reference candle, not a fail.
  assert.equal(passesInsideR1S1Filter([mk(0, 100, 111, 95, 102)], floor, ceiling, start, now), true);
  assert.equal(passesInsideR1S1Filter([mk(0, 100, 105, 89, 102)], floor, ceiling, start, now), true);
  // Fully above the ceiling (low > ceiling) with no ceiling reference candle -> fail.
  assert.equal(passesInsideR1S1Filter([mk(0, 112, 115, 111, 113)], floor, ceiling, start, now), false);
  // Fully below the floor (high < floor) with no floor reference candle -> fail.
  assert.equal(passesInsideR1S1Filter([mk(0, 86, 88, 84, 85)], floor, ceiling, start, now), false);
  // Reference wick high 115: a later candle fully above the ceiling but still under that wick passes...
  assert.equal(
    passesInsideR1S1Filter([mk(0, 100, 115, 95, 102), mk(1, 112, 114, 111, 113)], floor, ceiling, start, now),
    true,
  );
  // ...but one whose low is above the reference wick fails.
  assert.equal(
    passesInsideR1S1Filter([mk(0, 100, 115, 95, 102), mk(1, 118, 120, 116, 119)], floor, ceiling, start, now),
    false,
  );
  // Wick exactly on the boundary is still inside.
  assert.equal(
    passesInsideR1S1Filter([mk(0, 100, 110, 90, 102)], floor, ceiling, start, now),
    true,
  );
  // No usable completed candles / bad band -> null.
  assert.equal(passesInsideR1S1Filter([], floor, ceiling, start, now), null);
  assert.equal(passesInsideR1S1Filter([mk(0, 100, 105, 95, 102)], 120, 110, start, now), null);
});

test("sessionR4OrS4Hit: PASS when high/price reaches R4 or low/price reaches S4, no View needed", () => {
  const cpr = { r4: 120, s4: 80 };
  // Neither reached.
  assert.equal(sessionR4OrS4Hit({ currentPrice: 100, todayHigh: 110, todayLow: 90, todayCPR: cpr }), null);
  assert.equal(sessionReachedR4OrS4({ currentPrice: 100, todayHigh: 110, todayLow: 90, todayCPR: cpr }), false);
  // R4 via session high (price has since retraced).
  assert.equal(sessionR4OrS4Hit({ currentPrice: 100, todayHigh: 120, todayLow: 95, todayCPR: cpr }), "R4");
  // R4 via current price alone (no session high stored).
  assert.equal(sessionR4OrS4Hit({ currentPrice: 121, todayCPR: cpr }), "R4");
  // S4 via session low, and via price alone.
  assert.equal(sessionR4OrS4Hit({ currentPrice: 100, todayHigh: 105, todayLow: 79.5, todayCPR: cpr }), "S4");
  assert.equal(sessionR4OrS4Hit({ currentPrice: 80, todayCPR: cpr }), "S4");
  // Both extremes in one session.
  assert.equal(sessionR4OrS4Hit({ currentPrice: 100, todayHigh: 125, todayLow: 75, todayCPR: cpr }), "R4+S4");
  assert.equal(sessionReachedR4OrS4({ currentPrice: 100, todayHigh: 125, todayLow: 75, todayCPR: cpr }), true);
  // Exactly at the level counts (>= / <=).
  assert.equal(sessionR4OrS4Hit({ currentPrice: 120, todayCPR: cpr }), "R4");
  // Missing / non-finite data never passes.
  assert.equal(sessionR4OrS4Hit({ currentPrice: 150, todayCPR: null }), null);
  assert.equal(sessionR4OrS4Hit({ currentPrice: 150, todayCPR: {} }), null);
  assert.equal(sessionR4OrS4Hit({ currentPrice: NaN, todayHigh: NaN, todayLow: NaN, todayCPR: cpr }), null);
  assert.equal(sessionR4OrS4Hit({ todayCPR: { r4: NaN, s4: NaN }, currentPrice: 999 }), null);
});

test("Below Level4 Wide-B is folded into its category caption", () => {
  const row = {
    LevelsAbove: false,
    R1AbovePR4: false,
    LevelsBelow: false,
    compressed: false,
    expanded: false,
    S1BelowPS4: true,
    touchCategory: false,
    narrowCPR: false,
    cprRising: false,
    cprFalling: true,
    strWideCPR: true,
  };
  assert.equal(isLevelWideBelow(row), true);
  assert.equal(getSymbolCategoryCaption(row)?.label, "W-BELOW LEVEL4");
  assert.equal(
    getSymbolCategoryCaption({ ...row, strWideCPR: false })?.label,
    "Below Level4",
  );
});

test("CON-A vs CON-B exclusive side follows zone candle majority when both pass", () => {
  const MIN15 = 15 * 60 * 1000;
  const start = Date.UTC(2026, 9, 31);
  const now = start + 24 * 4 * MIN15;
  // BC 100, ceiling max(R1,PH) 120, TC 102, floor min(S1,PL) 80.
  const mk = (i: number, open: number, close: number) => ({
    open, close, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1,
    volume: 1, openTime: start + i * MIN15,
  });
  // Midpoints: 110, 112 (zone A only), 90 (zone B only), 101 (both: inside CPR).
  const candles = [mk(0, 109, 111), mk(1, 111, 113), mk(2, 89, 91), mk(3, 100, 102)];
  const z = countConsolidateZoneCandles(candles, 100, 120, 102, 80, start, now);
  assert.deepEqual(z, { zoneA: 3, zoneB: 2 });
  assert.equal(pickExclusiveConsolidateSide(true, true, z.zoneA, z.zoneB), "A");
  assert.equal(pickExclusiveConsolidateSide(true, true, 1, 4), "B");
  assert.equal(pickExclusiveConsolidateSide(true, true, 2, 2), "A"); // tie -> A
  assert.equal(pickExclusiveConsolidateSide(false, true, 5, 0), "B"); // only B passes
  assert.equal(pickExclusiveConsolidateSide(true, false, 0, 5), "A"); // only A passes
  assert.equal(pickExclusiveConsolidateSide(false, false, 3, 3), null);
  // Still-forming candle and non-finite levels are ignored.
  assert.deepEqual(countConsolidateZoneCandles([mk(95, 110, 110)], 100, 120, 102, 80, start, start + 95 * MIN15 + 1), { zoneA: 0, zoneB: 0 });
  assert.deepEqual(countConsolidateZoneCandles(candles, NaN, 120, 102, 80, start, now), { zoneA: 0, zoneB: 0 });
});

test("exclusive CON side stamped on the row drives matchesCandleCheck and candleCheckFromRow (P and PP)", () => {
  const row = (f: Record<string, unknown>) => f as unknown as Parameters<typeof matchesCandleCheck>[0];

  // P: both CON-A and CON-B pass.
  const bothB = row({ PD15MConsolidateAPass: true, PD15MBelowTCPass: true, PD15MConsolidateExclusive: "B" });
  assert.equal(matchesCandleCheck(bothB, "CB"), true);
  assert.equal(matchesCandleCheck(bothB, "CA"), false);
  assert.equal(candleCheckFromRow(bothB), "CB");
  const bothA = row({ PD15MConsolidateAPass: true, PD15MBelowTCPass: true, PD15MConsolidateExclusive: "A" });
  assert.equal(matchesCandleCheck(bothA, "CA"), true);
  assert.equal(matchesCandleCheck(bothA, "CB"), false);
  // Missing exclusive field (old cache / backtest row) falls back to CON-A.
  const bothMissing = row({ PD15MConsolidateAPass: true, PD15MBelowTCPass: true });
  assert.equal(matchesCandleCheck(bothMissing, "CA"), true);
  assert.equal(matchesCandleCheck(bothMissing, "CB"), false);
  assert.equal(candleCheckFromRow(bothMissing), "CA");
  // Only one side passing ignores the stamp.
  assert.equal(matchesCandleCheck(row({ PD15MBelowTCPass: true }), "CB"), true);
  assert.equal(matchesCandleCheck(row({ PD15MConsolidateAPass: true }), "CA"), true);

  // PP: same behaviour (matchesCandleCheck must agree with candleCheckFromRow).
  const ppBothB = row({ PD15MPPConsolidateAPass: true, PD15MPPConsolidateBPass: true, PD15MPPConsolidateExclusive: "B" });
  assert.equal(matchesCandleCheck(ppBothB, "PPCB"), true);
  assert.equal(matchesCandleCheck(ppBothB, "PPCA"), false);
  assert.equal(candleCheckFromRow(ppBothB), "PPCB");
  const ppBothA = row({ PD15MPPConsolidateAPass: true, PD15MPPConsolidateBPass: true, PD15MPPConsolidateExclusive: "A" });
  assert.equal(matchesCandleCheck(ppBothA, "PPCA"), true);
  assert.equal(matchesCandleCheck(ppBothA, "PPCB"), false);
  assert.equal(candleCheckFromRow(ppBothA), "PPCA");
  assert.equal(matchesCandleCheck(row({ PD15MPPConsolidateBPass: true }), "PPCB"), true);
  assert.equal(matchesCandleCheck(row({ PD15MPPConsolidateAPass: true }), "PPCA"), true);
  // Combined PP + P segments honour each side's own stamp.
  assert.equal(
    matchesCandleCheck(
      row({ ...ppBothB, ...bothB }),
      "PPCB+CB",
    ),
    true,
  );
});

test("sessionR4OrS4Hit: rejects garbage session extremes (0 low, inverted range) so no false S4 PASS", () => {
  const cpr = { r4: 120, s4: 80 };
  // todayLow = 0 (missing data) must not count as touching S4
  assert.equal(sessionR4OrS4Hit({ currentPrice: 100, todayHigh: 105, todayLow: 0, todayCPR: cpr }), null);
  // stale low far below price while price sits above (low > price*1.02 is invalid; here low<=px but inverted vs high)
  assert.equal(sessionR4OrS4Hit({ currentPrice: 100, todayHigh: 70, todayLow: 75, todayCPR: cpr }), null);
  // valid low at/below S4 still passes
  assert.equal(sessionR4OrS4Hit({ currentPrice: 100, todayHigh: 105, todayLow: 79, todayCPR: cpr }), "S4");
  // price at/below S4 passes even with no session extremes
  assert.equal(sessionR4OrS4Hit({ currentPrice: 79, todayCPR: cpr }), "S4");
});

test("pickExclusiveConsolidateSide: both pass → candles below pivot pick CON-B, above pick CON-A", () => {
  // Zone counts tied (all candles inside the CPR count in both zones): old rule always said A.
  assert.equal(pickExclusiveConsolidateSide(true, true, 96, 96), "A");
  assert.equal(pickExclusiveConsolidateSide(true, true, 96, 96, 30, 66), "B"); // more below pivot
  assert.equal(pickExclusiveConsolidateSide(true, true, 96, 96, 66, 30), "A"); // more above pivot
  // Equal above/below → fall back to zone counts, then A.
  assert.equal(pickExclusiveConsolidateSide(true, true, 40, 60, 48, 48), "B");
  assert.equal(pickExclusiveConsolidateSide(true, true, 60, 60, 48, 48), "A");
  // Pivot counts only matter when both pass.
  assert.equal(pickExclusiveConsolidateSide(true, false, 0, 0, 0, 96), "A");
  assert.equal(pickExclusiveConsolidateSide(false, true, 0, 0, 96, 0), "B");
});

test("countConsolidateZoneCandles: counts body midpoints above / below the pivot when supplied", () => {
  const start = 1_000_000;
  const step = 15 * 60 * 1000;
  const mk = (i: number, o: number, c: number) => ({
    openTime: start + i * step, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 1,
  });
  // CPR 98–102 around pivot 100. Mids: 101 (above), 99 (below), 100 (on pivot), 99.5 (below).
  const candles = [mk(0, 101, 101), mk(1, 99, 99), mk(2, 100, 100), mk(3, 99, 100)];
  const now = start + 10 * step;
  const z = countConsolidateZoneCandles(candles as never, 98, 110, 102, 90, start, now, 100);
  assert.equal(z.above, 1);
  assert.equal(z.below, 2);
  assert.equal(z.zoneA, 4);
  assert.equal(z.zoneB, 4);
  // No pivot → no above/below keys (unchanged shape).
  assert.deepEqual(countConsolidateZoneCandles(candles as never, 98, 110, 102, 90, start, now), { zoneA: 4, zoneB: 4 });
});

test("matchesCPRSize and getCPRSizeKey: classify and match CPR width categories", () => {
  assert.equal(getCPRSizeKey(0.05), "micro");
  assert.equal(getCPRSizeKey(0.10), "micro");
  assert.equal(getCPRSizeKey(0.15), "tiny");
  assert.equal(getCPRSizeKey(0.22), "tiny");
  assert.equal(getCPRSizeKey(0.35), "mini");
  assert.equal(getCPRSizeKey(0.60), "mini");
  assert.equal(getCPRSizeKey(0.85), "small");
  assert.equal(getCPRSizeKey(1.10), "small");
  assert.equal(getCPRSizeKey(1.50), "medium");
  assert.equal(getCPRSizeKey(2.00), "medium");
  assert.equal(getCPRSizeKey(3.50), "large");
  assert.equal(getCPRSizeKey(5.00), "large");
  assert.equal(getCPRSizeKey(7.50), "mega");
  assert.equal(getCPRSizeKey(10.00), "mega");
  assert.equal(getCPRSizeKey(15.00), "giant");

  const row = {
    prevCPR: { widthPct: 0.45 }, // mini
    todayCPR: { widthPct: 8.0 }, // mega
  } as unknown as Parameters<typeof matchesCPRSize>[0];

  assert.equal(matchesCPRSize(row, "mini", "mega"), true);
  assert.equal(matchesCPRSize(row, "pMini", "Mega"), true);
  assert.equal(matchesCPRSize(row, "mini", ""), true);
  assert.equal(matchesCPRSize(row, "", "mega"), true);
  assert.equal(matchesCPRSize(row, "", ""), true);
  assert.equal(matchesCPRSize(row, "micro", "mega"), false);
  assert.equal(matchesCPRSize(row, "mini", "small"), false);
});

test("Micro and Tiny CPR widths qualify for compact VOL-C badges", () => {
  assert.equal(isMicroOrTinyCPRSize(0.10), true);
  assert.equal(isMicroOrTinyCPRSize(0.1001), true);
  assert.equal(isMicroOrTinyCPRSize(0.22), true);
  assert.equal(isMicroOrTinyCPRSize(0.2201), false);
  assert.equal(isMicroOrTinyCPRSize(undefined), false);
});

test("joinCPRSize, splitCPRSize, and parseComposedViewKey handle CPR size segments", () => {
  assert.equal(joinCPRSize("mini", "mega"), "pMini+Mega");
  assert.equal(joinCPRSize("mini", ""), "pMini");
  assert.equal(joinCPRSize("", "mega"), "Mega");
  assert.equal(joinCPRSize("", ""), "");

  assert.deepEqual(splitCPRSize("pMini+Mega"), { prev: "mini", today: "mega" });
  assert.deepEqual(splitCPRSize("pMini"), { prev: "mini", today: undefined });
  assert.deepEqual(splitCPRSize("Mega"), { prev: undefined, today: "mega" });
  assert.deepEqual(splitCPRSize(""), {});

  const p1 = parseComposedViewKey("R1-CA-pMini+Mega-C-B-BB-AA-CL2U2-SH-GapAB-R4");
  assert.equal(p1.entry, "R1");
  assert.equal(p1.candleCheck, "CA");
  assert.equal(p1.prevCPRSize, "mini");
  assert.equal(p1.todayCPRSize, "mega");
  assert.equal(p1.patternKey, "C-B-BB-AA-CL2U2");
  assert.equal(p1.gapBadge, "SH-GapAB");
  assert.equal(p1.target, "R4");

  const p2 = parseComposedViewKey("TC-pMini-CU3L2-R1");
  assert.equal(p2.entry, "TC");
  assert.equal(p2.candleCheck, undefined);
  assert.equal(p2.prevCPRSize, "mini");
  assert.equal(p2.todayCPRSize, undefined);
  assert.equal(p2.patternKey, "CU3L2");
  assert.equal(p2.target, "R1");

  const p3 = parseComposedViewKey("BC-Mega-A-A-AA-AA-S4");
  assert.equal(p3.entry, "BC");
  assert.equal(p3.candleCheck, undefined);
  assert.equal(p3.prevCPRSize, undefined);
  assert.equal(p3.todayCPRSize, "mega");
  assert.equal(p3.patternKey, "A-A-AA-AA");
  assert.equal(p3.target, "S4");
});
