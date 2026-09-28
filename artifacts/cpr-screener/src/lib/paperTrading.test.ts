import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGrossReturnPct,
  summarizePaperTrades,
  type PaperTradeRecord,
} from "./paperTrading.ts";
import { evaluateSignalCandles } from "./signalOutcome.ts";

function trade(overrides: Partial<PaperTradeRecord> = {}): PaperTradeRecord {
  return {
    direction: "Up",
    entry: 100,
    exitPrice: 110,
    status: "PASS",
    ...overrides,
  };
}

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
