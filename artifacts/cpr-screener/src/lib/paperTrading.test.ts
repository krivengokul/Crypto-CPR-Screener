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
  matchesCprAboveLevelStatus,
  matchesCprAboveOverlapStatus,
} from "./views/p15MAbove.ts";

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
    false
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
    false
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

test("PD-15M-Below-TC also fails when a candle body is wholly below the floor", () => {
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

  // Body wholly below the floor -> fails.
  assert.equal(passesPD15MBelowTCFilter([candle(start, 89, 88)], tc, start, now, floor), false);
  // Only a wick below the floor, or a body on the floor -> passes.
  assert.equal(passesPD15MBelowTCFilter([candle(start, 91, 89)], tc, start, now, floor), true);
  assert.equal(passesPD15MBelowTCFilter([candle(start, 90, 90)], tc, start, now, floor), true);
  // Wick condition (mirror of the TC rule): a body below the floor only fails
  // when it is also lower than the lowest wick of every earlier candle.
  const m = 15 * 60_000;
  // Earlier candle wicked down to 80; later body (86/85) is below the floor but
  // above that earlier low -> not a fresh low -> passes.
  assert.equal(
    passesPD15MBelowTCFilter(
      [{ ...candle(start, 95, 94), low: 80 }, candle(start + m, 86, 85)],
      tc, start, now, floor,
    ),
    true,
  );
  // Later body (79/78) is under the earlier low of 80 -> fresh low -> fails.
  assert.equal(
    passesPD15MBelowTCFilter(
      [{ ...candle(start, 95, 94), low: 80 }, candle(start + m, 79, 78)],
      tc, start, now, floor,
    ),
    false,
  );
  // The fresh-high-above-TC rule still applies alongside the floor rule.
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

test("PD-15M-Below-BC floor is the lower of previous PL and S1", () => {
  assert.equal(getPrevious15MBFloor({ prevLow: 90, s1: 95 }), 90);
  assert.equal(getPrevious15MBFloor({ prevLow: 90, s1: 85 }), 85);
  assert.equal(getPrevious15MBFloor({ prevLow: 90, s1: 90 }), 90);
});

test("PD15M>BC CPR ABOVE groups the four requested CPR status variants", () => {
  const base = {
    narrowCPR: false,
    InsideCPR: false,
    strWideCPR: false,
    outCPR: false,
    cprRising: false,
    overlapHigher: false,
  };

  assert.equal(
    matchesCprAboveLevelStatus({ ...base, narrowCPR: true, cprRising: true }),
    true
  );
  assert.equal(
    matchesCprAboveLevelStatus({ ...base, strWideCPR: true, cprRising: true }),
    true
  );
  assert.equal(
    matchesCprAboveOverlapStatus({ ...base, narrowCPR: true, overlapHigher: true }),
    true
  );
  assert.equal(
    matchesCprAboveOverlapStatus({ ...base, strWideCPR: true, overlapHigher: true }),
    true
  );
  assert.equal(
    matchesCprAboveLevelStatus({ ...base, narrowCPR: true, InsideCPR: true, cprRising: true }),
    false
  );
  assert.equal(
    matchesCprAboveLevelStatus({ ...base, strWideCPR: true, outCPR: true, cprRising: true }),
    false
  );
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
    const candle = symbol === "PUEXFAILUSDT"
      ? [expectedPreviousSession, "90", "96", "89", "95", "1"]
      : symbol === "PUEXEMPTYUSDT"
        ? null
        : [expectedPreviousSession, "101", "103", "100.5", "102", "1"];
    return new Response(
      JSON.stringify(candle ? [candle] : []),
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
      JSON.stringify([[start, "99", "100", "97", "98", "1"]]),
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
