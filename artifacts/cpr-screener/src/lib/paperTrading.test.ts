import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGrossReturnPct,
  summarizePaperTrades,
  type PaperTradeRecord,
} from "./paperTrading.ts";
import { gradeTargetHit } from "./backtestOutcome.ts";
import type { OHLC } from "./cpr.ts";
import { analyzeCPR, getCompoundPatternForCprPair } from "./cpr.ts";
import {
  evaluateSignalCandles,
  livePriceCrossedBoundary,
  livePriceReachedTarget,
} from "./signalOutcome.ts";
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
  passesPD15MBelowTCFilter,
  findPreviousUpexSymbols,
  findPreviousUpexPass,
  getUpexBc,
  getConsolidateABc,
  getConsolidateBTc,
  pruneLegacy15MResultCaches,
  passesPrevious15MBFilter,
  loadPrevious15MBResults,
  loadPreviousUpexResults,
  passesUpexFilter,
  previousUpexCandidateCacheKey,
  previousUpexSessionStartUtcMs,
  savePreviousUpexResults,
  upexSessionStartUtcMs,
} from "./15MCandleCheck.ts";
import {
  matchesCandleCheck,
  ALL_CANDLE_CHECKS,
  CANDLE_CHECK_OPTIONS,
} from "./views/candleChecks.ts";
import { parseComposedViewKey } from "./views/gapBadges.ts";

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
    passesUpexFilter([candle(start + 15 * 60_000, 99, 99.5)], 100, start, now),
    true
  );
  assert.equal(
    passesUpexFilter([candle(start + 30 * 60_000, 99, 101)], 100, start, now),
    true
  );
  assert.equal(
    passesUpexFilter(
      [
        { ...candle(start, 101, 102), low: 95 },
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
        { ...candle(start, 101, 102), low: 99 },
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
    passesUpexFilter([candle(start, 99, 99.5)], 100, start, end),
    true
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
        { ...candle(start, 101, 102), low: 95 },
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
        { ...candle(start, 101, 102), low: 99 },
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
        { ...candle(start, 101, 102), low: 99 },
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

  // The first body entering below the floor establishes a wick reference.
  // Without a later body breaking that reference, the session passes.
  assert.equal(passesPD15MBelowTCFilter([candle(start, 89, 88)], tc, start, now, floor), true);
  // A body ending exactly at the floor does not establish a lower reference.
  assert.equal(passesPD15MBelowTCFilter([candle(start, 91, 90)], tc, start, now, floor), true);
  assert.equal(passesPD15MBelowTCFilter([candle(start, 90, 90)], tc, start, now, floor), true);
  const m = 15 * 60_000;
  // The next candle may lower the first candle's low-wick reference; a later
  // body below that reference fails.
  assert.equal(
    passesPD15MBelowTCFilter(
      [
        { ...candle(start, 91, 89), low: 80 },
        { ...candle(start + m, 89, 88), low: 75 },
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
        { ...candle(start + m, 89, 88), low: 75 },
        candle(start + 2 * m, 74, 76),
      ],
      tc, start, now, floor,
    ),
    false,
  );
  // The fresh-high-above-TC rule also applies alongside the floor rule.
  assert.equal(passesPD15MBelowTCFilter([candle(start, 101, 102)], tc, start, now, floor), false);
  // Without a floor only the TC rule applies.
  assert.equal(passesPD15MBelowTCFilter([candle(start, 89, 88)], tc, start, now), true);
  // A non-finite floor can't be evaluated.
  assert.equal(
    passesPD15MBelowTCFilter([candle(start, 95, 94)], tc, start, now, Number.NaN),
    null,
  );
});

test("MOMENTUM-B is CONSOLIDATE-B without the PL/S1 floor check", async () => {
  const originalFetch = globalThis.fetch;
  const sessionStart = Date.parse("2026-10-01T00:00:00.000Z");
  const previousSession = sessionStart - 24 * 60 * 60 * 1000;
  globalThis.fetch = async () =>
    new Response(
      // open 89, high 90, low 87, close 88: body wholly below a floor of 90,
      // well under TC 100, so no fresh high above TC.
      JSON.stringify([[previousSession, "89", "90", "87", "88", "1"]]),
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

  // Wick condition (mirror of the BC rule): a body above the ceiling only fails
  // when it is also higher than the highest wick of every earlier candle.
  const m = 15 * 60_000;
  // Earlier candle wicked up to 125; later body (112/114) is above the ceiling
  // but under that earlier high -> not a fresh high -> passes.
  assert.equal(
    passesUpexFilter(
      [{ ...makeCandle(start, 105, 106), high: 125 }, makeCandle(start + m, 112, 114)],
      bc, start, now, ceiling,
    ),
    true
  );
  // Later body (126/128) is above the earlier high of 125 -> fresh high -> fails.
  assert.equal(
    passesUpexFilter(
      [{ ...makeCandle(start, 105, 106), high: 125 }, makeCandle(start + m, 126, 128)],
      bc, start, now, ceiling,
    ),
    false
  );
});

test("MOMENTUM-A and CONSOLIDATE-A use one immediate lower-wick reference", () => {
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
  const beforeBreak = c(0, 101, 103, 95, 102);
  const breaksBelowBc = c(1, 94, 96, 92, 93);
  const immediateLowerWick = c(2, 94, 96, 90, 93);
  const staysAboveReference = c(3, 91, 94, 90.5, 92);
  const breaksReference = c(4, 89, 91, 88, 90);

  assert.equal(
    passesUpexFilter(
      [beforeBreak, breaksBelowBc, immediateLowerWick, staysAboveReference],
      bc, start, now, ceiling,
    ),
    true,
  );
  assert.equal(
    passesUpexFilter(
      [beforeBreak, breaksBelowBc, immediateLowerWick, staysAboveReference, breaksReference],
      bc, start, now, ceiling,
    ),
    false,
  );
  // MOMENTUM-A uses the same immediate-next-candle confirmation.
  assert.equal(
    passesUpexFilter(
      [beforeBreak, breaksBelowBc, immediateLowerWick, staysAboveReference],
      bc, start, now,
    ),
    true,
  );
  assert.equal(
    passesUpexFilter(
      [beforeBreak, breaksBelowBc, immediateLowerWick, staysAboveReference, breaksReference],
      bc, start, now,
    ),
    false,
  );
  // Without a lower wick on the immediate next candle, the BC-break candle
  // remains the reference for all later body checks.
  assert.equal(
    passesUpexFilter(
      [beforeBreak, breaksBelowBc, c(2, 94, 96, 92, 93)],
      bc, start, now,
    ),
    true,
  );
  assert.equal(
    passesUpexFilter(
      [beforeBreak, breaksBelowBc, c(2, 94, 96, 92, 93), c(3, 91, 93, 89, 90)],
      bc, start, now,
    ),
    false,
  );
});

test("CONSOLIDATE-A freezes the reference after one immediate-next-available-candle confirmation", () => {
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
  const candles = [
    c(0, 101, 105, 100, 102),
    c(1, 101, 102, 96, 99),     // part of body below BC; reference low is 96
    c(2, 99, 101, 94, 100),     // next available lower wick; new reference is 94
    c(3, 97, 98, 92, 96),       // later wick below reference does not reset it
    c(4, 93.5, 96, 92, 95),     // part of body below reference: fails
  ];

  assert.equal(passesUpexFilter(candles.slice(0, 4), 100, start, now, 120), true);
  assert.equal(passesUpexFilter(candles, 100, start, now, 120), false);
  // "Next" means the next available candle, even if the feed has a time gap.
  assert.equal(
    passesUpexFilter(
      [
        candles[0],
        candles[1],
        { ...candles[2], openTime: start + 4 * m },
        { ...c(3, 95, 97, 92, 96), openTime: start + 5 * m },
      ],
      100,
      start,
      now,
      120,
    ),
    true,
  );
  // Either body endpoint below BC establishes the initial reference.
  assert.equal(
    passesUpexFilter(
      [
        candles[0],
        c(1, 101, 103, 90, 99.5),
        c(2, 99, 100, 95, 99),
        c(3, 101, 103, 88, 89.5),
      ],
      100,
      start,
      now,
      120,
    ),
    false,
  );
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
    const candles = symbol === "PUEXFAILUSDT"
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
    assert.equal(fetchCount, 3);
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
      JSON.stringify([[start, "99", "100", "97", "98", "1"]]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const candidate = { symbol: "P15MSHAREDUSDT", source: "binance" as const, bc: 100 };
    const [above, below] = await Promise.all([
      findPreviousUpexSymbols([candidate], undefined, now),
      findPD15MBelowSymbols([candidate], undefined, now),
    ]);
    assert.equal(above.outcomes.get("binance:P15MSHAREDUSDT"), true);
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
      JSON.stringify([[start, "99", "100", "97", "98", "1"]]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const candidate = { symbol: "P15MRETRYUSDT", source: "binance" as const, bc: 100 };
    const first = await findPreviousUpexSymbols([candidate], undefined, now);
    const second = await findPreviousUpexSymbols([candidate], undefined, now);
    assert.equal(first.outcomes.get("binance:P15MRETRYUSDT"), null);
    assert.equal(second.outcomes.get("binance:P15MRETRYUSDT"), true);
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

test("CONSOLIDATE-B upper TC check mirrors the P-CONSOLIDATE-A ceiling rule", () => {
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, high: number, low: number, close: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });
  const tc = 100;
  const floor = 80;
  const c1 = c(0, 101, 103, 100, 102);       // first body above TC -> fails
  const c2 = c(1, 97, 105, 96, 98);          // body below TC, wick sets high reference
  const c3 = c(2, 101, 104, 100, 102);       // body above TC but under prior wick -> passes
  const c4 = c(3, 105, 107, 104, 106);       // fresh body high above TC -> fails

  assert.equal(passesPD15MBelowTCFilter([c1], tc, start, now, floor), false);
  assert.equal(passesPD15MBelowTCFilter([c2, c3], tc, start, now, floor), true);
  assert.equal(passesPD15MBelowTCFilter([c2, c3, c4], tc, start, now, floor), false);
  // MOMENTUM-B (no floor) uses the same upper check.
  assert.equal(passesPD15MBelowTCFilter([c1], tc, start, now), false);
});

test("CONSOLIDATE-B fresh high needs the WHOLE body at/above the earlier highest wick", () => {
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, high: number, low: number, close: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });
  const tc = 0.4773;
  const c1 = c(0, 0.4770, 0.4785, 0.4765, 0.4771); // body under TC, wick high 0.4785
  const c3 = c(1, 0.4784, 0.4795, 0.4780, 0.4792); // body above TC, open under prior wick -> not a fresh high
  const c4 = c(2, 0.4796, 0.4800, 0.4795, 0.4799); // whole body above every earlier wick -> fails
  assert.equal(passesPD15MBelowTCFilter([c1, c3], tc, start, now), true);
  assert.equal(passesPD15MBelowTCFilter([c1, c3, c4], tc, start, now), false);
});

test("CONSOLIDATE-B floor check mirrors the P-CONSOLIDATE-A lower wick rule", () => {
  const start = Date.parse("2026-10-02T00:00:00.000Z");
  const now = Date.parse("2026-10-03T00:00:00.000Z");
  const m = 15 * 60_000;
  const c = (i: number, open: number, high: number, low: number, close: number): OHLC => ({
    openTime: start + i * m, open, high, low, close, volume: 1,
  });
  const tc = 120;
  const floor = 90;
  const c1 = c(0, 94, 95, 92, 93);          // above floor
  const c2 = c(1, 89, 90, 87, 88);          // body enters below; low 87 is reference
  const c3 = c(2, 88, 89, 85, 86);          // next low 85 resets reference
  const c4 = c(3, 87, 87.5, 85.5, 86.5);    // body low 86 stays above reference
  const c5 = c(4, 83, 83.5, 81, 82);        // body low 82 breaks reference -> fails

  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4], tc, start, now, floor), true);
  assert.equal(passesPD15MBelowTCFilter([c1, c2, c3, c4, c5], tc, start, now, floor), false);
});

test("pruneLegacy15MResultCaches removes only superseded cache versions", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const store: Record<string, string> = {
    cpr_previous_15m_tc_b_results_v1: "x",
    cpr_previous_15m_tc_b_results_v4: "x",
    cpr_previous_15m_tc_b_results_v5: "x",
    cpr_previous_15m_tc_b_results_v6: "keep",
    cpr_previous_15m_b_results_v1: "x",
    cpr_previous_15m_b_results_v3: "keep",
    cpr_previous_upex_results_v1: "x",
    cpr_previous_upex_results_v2: "x",
    cpr_previous_upex_results_v3: "x",
    cpr_previous_upex_results_v4: "x",
    cpr_previous_upex_results_v5: "keep",
    cpr_previous_15m_consolidate_a_results_v1: "x",
    cpr_previous_15m_consolidate_a_results_v2: "x",
    cpr_previous_15m_consolidate_a_results_v3: "x",
    cpr_previous_15m_consolidate_a_results_v4: "x",
    cpr_previous_15m_consolidate_a_results_v5: "x",
    cpr_previous_15m_consolidate_a_results_v6: "keep",
    cpr_previous_15m_momentum_b_results_v1: "keep",
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
    assert.equal(pruneLegacy15MResultCaches(), 13);
    assert.deepEqual(Object.keys(store).sort(), [
      "cpr_previous_15m_b_results_v3",
      "cpr_previous_15m_consolidate_a_results_v6",
      "cpr_previous_15m_momentum_b_results_v1",
      "cpr_previous_15m_tc_b_results_v6",
      "cpr_previous_upex_results_v5",
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
