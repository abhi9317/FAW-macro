import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIN_TRACKS, SPECIES, COUNTRIES, WELFARE_RANGES } from "../data.js";

test("pain tracks are 4-element hour arrays", () => {
  for (const [k, v] of Object.entries(PAIN_TRACKS)) {
    assert.equal(v.length, 4, `${k} should have 4 tiers`);
    assert.ok(v.every(Number.isFinite), `${k} has a non-finite entry`);
  }
});

test("layers conventional cage matches the published figures", () => {
  assert.deepEqual(PAIN_TRACKS.layers_conventional_cage,
                   [0.05, 431.41, 4054.47, 6721.17]);
});

test("slaughter tracks were converted from seconds to hours", () => {
  // 1.19 s excruciating -> 1.19/3600 h; guards against a unit-conversion regression
  assert.ok(Math.abs(PAIN_TRACKS.slaughter_waterbath[0] - 1.19 / 3600) < 1e-12);
});

test("welfare ranges are the RP 50th percentiles", () => {
  assert.equal(WELFARE_RANGES.chicken, 0.327);
  assert.equal(WELFARE_RANGES.pig, 0.512);
  assert.equal(WELFARE_RANGES.shrimp, 0.029);
  assert.equal(WELFARE_RANGES.carp, 0.087);
});

test("nine species and 93 country rows", () => {
  assert.equal(SPECIES.length, 9);
  // 92 named countries + one "Other countries" residual row.
  assert.equal(COUNTRIES.length, 93);
  assert.equal(COUNTRIES.filter(r => r[0] === "Other countries").length, 1);
  assert.ok(COUNTRIES.every(r => r.length === 10), "each row has 10 columns");
});
