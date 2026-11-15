import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeNlFilterSpec,
  hasNlFilterEffect,
  describeNlFilterSpec,
  NL_PATTERN_CODES,
} from "./nlFilter.ts";

test("keeps valid enum values", () => {
  const spec = sanitizeNlFilterSpec({
    classFilter: "CRYPTO",
    pdhPdlFilter: "above",
    strongBar: "up",
    status: "active",
    breakout: "brk",
  });
  assert.deepEqual(spec, {
    classFilter: "CRYPTO",
    pdhPdlFilter: "above",
    strongBar: "up",
    status: "active",
    breakout: "brk",
  });
});

test("drops values outside the vocabulary", () => {
  const spec = sanitizeNlFilterSpec({
    classFilter: "FOREX",
    pdhPdlFilter: "moon",
    strongBar: "sideways",
    status: "winning",
    breakout: "yes",
    patternCode: "NOTACODE",
  });
  assert.deepEqual(spec, {});
  assert.equal(hasNlFilterEffect(spec), false);
});

test("pattern codes match case-insensitively and normalize", () => {
  assert.equal(sanitizeNlFilterSpec({ patternCode: " cl4u3 " }).patternCode, "CL4U3");
  assert.equal(sanitizeNlFilterSpec({ patternCode: "outcpr" }).patternCode, "OutCPR");
  assert.equal(new Set(NL_PATTERN_CODES).size, NL_PATTERN_CODES.length);
});

test("search keeps only symbol characters and is length-capped", () => {
  assert.equal(sanitizeNlFilterSpec({ search: "BTC<script>" }).search, "BTCscript");
  assert.equal(sanitizeNlFilterSpec({ search: "A".repeat(100) }).search?.length, 20);
  assert.equal(sanitizeNlFilterSpec({ search: "!!!" }).search, undefined);
});

test("reclaim S and R are mutually exclusive", () => {
  assert.deepEqual(sanitizeNlFilterSpec({ reclaimS: true, reclaimR: true }), {});
  assert.deepEqual(sanitizeNlFilterSpec({ reclaimS: true }), { reclaimS: true });
  assert.deepEqual(sanitizeNlFilterSpec({ reclaimR: true }), { reclaimR: true });
});

test("garbage input never throws", () => {
  for (const bad of [null, undefined, 42, "text", [], { classFilter: {} }]) {
    assert.doesNotThrow(() => sanitizeNlFilterSpec(bad));
  }
});

test("describe and effect", () => {
  const spec = sanitizeNlFilterSpec({ reset: true, classFilter: "COMMOD", strongBar: "down" });
  assert.equal(hasNlFilterEffect(spec), true);
  assert.equal(describeNlFilterSpec(spec), "Reset, then COMMOD · strong down bar");
  assert.equal(describeNlFilterSpec({ reset: true }), "Reset filters");
  const onlyUnsupported = sanitizeNlFilterSpec({ unsupported: "Can't do volume." });
  assert.equal(hasNlFilterEffect(onlyUnsupported), false);
});
