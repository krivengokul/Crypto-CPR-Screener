import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeBreakout } from "./breakout.ts";

const T0 = 1_700_000_000_000;
const candle = (i: number, open: number, close: number, volume: number) => ({
  openTime: T0 + i * 15 * 60 * 1000,
  open,
  high: Math.max(open, close) * 1.001,
  low: Math.min(open, close) * 0.999,
  close,
  volume,
});

/** 40 choppy (NOT squeezed) candles around 100, avg volume 100. */
function chop(): ReturnType<typeof candle>[] {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const up = i % 2 === 0;
    out.push(candle(i, up ? 99 : 101.5, up ? 101.5 : 99.5, 100));
  }
  return out;
}

test("volume spike through a level flags BRK even without a squeeze", () => {
  const c = chop();
  c.push(candle(40, 100, 104, 600)); // 6x volume, closes through 102
  const r = analyzeBreakout(c, { R1: 102 });
  assert.equal(r?.signal, true);
  assert.equal(r?.barsAgo, 0);
  assert.deepEqual(r?.levelsCleared, ["R1"]);
  assert.ok((r?.relVol ?? 0) >= 4);
});

test("big move on normal volume is not a breakout", () => {
  const c = chop();
  c.push(candle(40, 100, 104, 150));
  assert.equal(analyzeBreakout(c, { R1: 102 })?.signal, false);
});

test("volume spike that clears no level and no range high is ignored", () => {
  const c = chop();
  c.push(candle(40, 100, 101, 600)); // below 102 level and below range high
  assert.equal(analyzeBreakout(c, { R1: 102 })?.signal, false);
});

test("breakout that already ran more than 30% is dropped; failed breakout is dropped", () => {
  const ran = chop();
  ran.push(candle(40, 100, 104, 600), candle(41, 104, 140, 300));
  assert.equal(analyzeBreakout(ran, { R1: 102 })?.signal, false);

  const failed = chop();
  failed.push(candle(40, 100, 104, 600), candle(41, 104, 98, 200));
  assert.equal(analyzeBreakout(failed, { R1: 102 })?.signal, false);
});

test("too few candles returns null", () => {
  assert.equal(analyzeBreakout([candle(0, 1, 2, 1)], { R1: 1 }), null);
});
