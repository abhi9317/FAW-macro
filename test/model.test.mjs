import { test } from "node:test";
import assert from "node:assert/strict";
import { tierWeights, exchangeRates, disablingEquivalentHours,
         DEFAULT_LADDER, painFractionFromTrack, anchorFraction,
         speciesPainFractions, speciesTotals, countryTotals,
         reformReduction, componentShare, reformRobustness,
         ROBUSTNESS_LADDERS, LADDER_MIN, LADDER_MAX,
         reformTable, DEFAULT_STATE, encodeState, decodeState,
         formatPainYears, formatPercent, combinedReformShare,
         reformUncertainty, welfareRangeAt } from "../model.js";
import { PAIN_TRACKS, REFORM_DEFS, SPECIES } from "../data.js";

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) < tol, `expected ${b}, got ${a}`);

test("default ladder is 30", () => assert.equal(DEFAULT_LADDER, 30));

test("ladder weights are [r, 1, 1/r, 1/r^2] with disabling pinned at 1", () => {
  const w = tierWeights({ ladder: 30 });
  near(w[0], 30); near(w[1], 1); near(w[2], 1 / 30); near(w[3], 1 / 900);
});

test("independent ratios override the ladder", () => {
  const w = tierWeights({ eOverD: 100, dOverH: 10, hOverA: 5 });
  near(w[0], 100); near(w[1], 1); near(w[2], 1 / 10); near(w[3], 1 / 50);
});

test("exchange rates express everything in hours of disabling", () => {
  const r = exchangeRates(tierWeights({ ladder: 30 }));
  near(r.eToD, 30); near(r.eToH, 900); near(r.eToA, 27000);
});

test("disabling-equivalent hours for a caged layer at r=30", () => {
  near(disablingEquivalentHours(
        PAIN_TRACKS.layers_conventional_cage, tierWeights({ ladder: 30 })),
       575.526967, 1e-4);
});

test("disabling-equivalent hours for a conventional broiler at r=30", () => {
  near(disablingEquivalentHours(
        PAIN_TRACKS.broiler_conventional, tierWeights({ ladder: 30 })),
       62.002411, 1e-4);
});

test("ladder of 1 reduces to raw summed hours", () => {
  const t = PAIN_TRACKS.layers_conventional_cage;
  near(disablingEquivalentHours(t, tierWeights({ ladder: 1 })),
       t.reduce((a, b) => a + b, 0), 1e-9);
});

test("pain fraction is DE hours over the study period in hours", () => {
  near(painFractionFromTrack(575.526967, 546), 0.04391995, 1e-8);
});

test("the anchor is the broiler's measured fraction, farm plus slaughter", () => {
  near(anchorFraction(tierWeights({ ladder: 30 })), 0.06153993, 1e-8);
});

test("measured species use their own track, not the anchor", () => {
  const f = speciesPainFractions(tierWeights({ ladder: 30 }));
  near(f.broilers.fraction, 0.06153993, 1e-8);
  near(f.layers.fraction,   0.04391995, 1e-8);
  near(f.shrimp.fraction,   0.00890122, 1e-8);
  for (const k of ["broilers", "layers", "shrimp"]) {
    assert.equal(f[k].provenance, "measured");
  }
});

test("proxied and assumed species are multiples of the broiler anchor", () => {
  const f = speciesPainFractions(tierWeights({ ladder: 30 }));
  near(f.fish.fraction,    0.02461597, 1e-8);  // 0.40 x broiler
  near(f.pigs.fraction,    0.03076996, 1e-8);  // 0.50 x broiler
  near(f.ducks.fraction,   0.06153993, 1e-8);  // 1.00 x broiler
  near(f.cattle.fraction,  0.00499704, 1e-8);  // 0.0812 x broiler
  assert.equal(f.fish.provenance,   "assumption");
  assert.equal(f.pigs.provenance,   "assumption");
  assert.equal(f.ducks.provenance,  "proxied");
  assert.equal(f.cattle.provenance, "proxied");
});

test("layers and broilers measure differently from their own tracks", () => {
  // If these ever converge, the tracks have been mis-parsed.
  const f = speciesPainFractions(tierWeights({ ladder: 30 }));
  const ratio = f.broilers.fraction / f.layers.fraction;
  assert.ok(ratio > 1.3 && ratio < 1.5, `expected ~1.41x, got ${ratio}`);
});

test("every multiple scales with r, so no assumption drifts", () => {
  for (const ladder of [3, 30, 100]) {
    const f = speciesPainFractions(tierWeights({ ladder }));
    near(f.fish.fraction   / f.broilers.fraction, 0.40,   1e-9);
    near(f.cattle.fraction / f.broilers.fraction, 0.0812, 1e-9);
  }
});

test("a reader-set multiple replaces the default", () => {
  const f = speciesPainFractions(tierWeights({ ladder: 30 }), { fish: 1.0 });
  near(f.fish.fraction, 0.06153993, 1e-8);
  assert.equal(f.fish.provenance, "assumption");
});

const W30 = tierWeights({ ladder: 30 });

test("species totals at r=30 match the spec table (millions)", () => {
  const { rows, total } = speciesTotals(W30);
  const m = Object.fromEntries(rows.map(r => [r.key, r.painYears / 1e6]));
  near(m.fish,     243.23, 0.01);
  near(m.broilers, 214.39, 0.01);
  near(m.layers,   117.06, 0.01);
  near(m.shrimp,    59.37, 0.01);
  near(m.ducks,     25.51, 0.01);
  near(m.pigs,      15.28, 0.01);
  near(m.sheep,      6.27, 0.01);
  near(m.turkeys,    4.66, 0.01);
  near(m.cattle,     4.57, 0.01);
  near(total / 1e6, 690.34, 0.05);
});

test("the species ranking is conditional on the fish multiple, not a finding", () => {
  // At the default 0.40x broiler, fish lead. Lower the multiple and broilers do.
  // The page must never present either ordering as a result.
  const top = mult => {
    const rows = speciesTotals(W30, { multiples: mult }).rows
      .sort((a, b) => b.painYears - a.painYears);
    return rows[0].key;
  };
  assert.equal(top({}),            "fish");
  assert.equal(top({ fish: 0.2 }), "broilers");
});

test("excluding shrimp removes exactly the shrimp contribution", () => {
  const all = speciesTotals(W30);
  const none = speciesTotals(W30, { includeShrimp: false });
  const shrimp = all.rows.find(r => r.key === "shrimp").painYears;
  near(all.total - none.total, shrimp, 1);
  assert.ok(!none.rows.some(r => r.key === "shrimp"));
});

test("measured species are unaffected by a reader-set multiple", () => {
  const base = speciesTotals(W30);
  const moved = speciesTotals(W30, { multiples: { fish: 1.0 } });
  const g = (o, k) => o.rows.find(r => r.key === k).painYears;
  near(g(moved, "fish") / g(base, "fish"), 2.5, 1e-9);   // 0.40 -> 1.00
  near(g(moved, "broilers"), g(base, "broilers"), 1e-6);
  near(g(moved, "layers"),   g(base, "layers"),   1e-6);
});

test("a welfare-range override moves only that species", () => {
  const base = speciesTotals(W30);
  const bumped = speciesTotals(W30, { welfareRanges: { fish: 0.174 } });
  const b = k => base.rows.find(r => r.key === k).painYears;
  const u = k => bumped.rows.find(r => r.key === k).painYears;
  near(u("fish") / b("fish"), 2.0, 1e-9);
  near(u("pigs"), b("pigs"), 1e-6);
});

test("proxy species are flagged with the species they borrow from", () => {
  const rows = speciesTotals(W30).rows;
  assert.equal(rows.find(r => r.key === "ducks").wrProxy, "chicken");
  assert.equal(rows.find(r => r.key === "layers").wrProxy, null);
});

test("country totals reconcile exactly with species totals, less shrimp", () => {
  // The country table has no shrimp column, so shrimp is the only legitimate
  // difference. Anything else means the columns are being misread.
  const sp = speciesTotals(W30);
  const shrimp = sp.rows.find(r => r.key === "shrimp").painYears;
  near(countryTotals(W30).total, sp.total - shrimp, 1e4);
});

test("China leads the country table", () => {
  assert.equal(countryTotals(W30).rows[0].name, "China");
});

test("excluding fish removes exactly the fish block and re-sorts", () => {
  // Must assert what it names. The earlier version only checked the rows were
  // finite and would have passed with includeFish filtering deleted entirely.
  const all = countryTotals(W30), noFish = countryTotals(W30, { includeFish: false });
  const fish = speciesTotals(W30).rows.find(r => r.key === "fish").painYears;
  near(all.total - noFish.total, fish, 1e4);
  assert.equal(all.rows[1].name, "India");            // 2nd on aquaculture
  assert.equal(noFish.rows[1].name, "United States"); // 2nd on land animals
});

const def = k => REFORM_DEFS.find(d => d.key === k);

test("reform reductions at r=30 match the spec table", () => {
  near(reformReduction(def("cagefree"),  W30), 0.621892, 1e-5);
  near(reformReduction(def("bcc"),       W30), 0.577325, 1e-5);
  near(reformReduction(def("stunning"),  W30), 0.887100, 1e-5);
});

test("fixed-reduction reforms ignore the tier weights entirely", () => {
  near(reformReduction(def("pigcrates"), W30), 0.50, 1e-12);
  near(reformReduction(def("pigcrates"), tierWeights({ ladder: 3 })), 0.50, 1e-12);
  near(reformReduction(def("fishstun"),  W30), 0.0058, 1e-12);
});

test("shrimp stunning is the slaughter share of lifetime pain", () => {
  const v = reformReduction(def("shrimpstun"), W30);
  assert.ok(v > 0 && v < 0.02, `expected a sub-2% share, got ${v}`);
});

test("cage-free is robust across the plausible ladder range", () => {
  // Sampled across the full slider range (ladders 1-1000), not the narrower
  // [3,10,30,100] this test originally assumed — that narrower sample is
  // exactly the bug Important Finding 2 fixed, since it could understate a
  // reform's true range at slider settings the page itself allows.
  const { min, max } = reformRobustness(def("cagefree"));
  assert.ok(min > 0.55 && max < 0.68, `expected roughly 59-65%, got ${min}-${max}`);
});

test("stunning is highly sensitive to the ladder", () => {
  const { min, max } = reformRobustness(def("stunning"));
  assert.ok(max - min > 0.30, `expected a wide swing, got ${min}-${max}`);
});

test("cage-free is more robust than every other measured reform", () => {
  const span = k => {
    const { min, max } = reformRobustness(def(k));
    return max - min;
  };
  for (const k of ["furnished", "bcc", "stunning"]) {
    assert.ok(span("cagefree") < span(k), `cagefree should beat ${k}`);
  }
});

test("robustness sampling spans the full slider range", () => {
  // A row must never display a range that excludes its own current value. That
  // happens whenever the sampled ladders are narrower than what the slider
  // allows - the defect this guards against, which shipped once already.
  assert.equal(Math.min(...ROBUSTNESS_LADDERS), LADDER_MIN);
  assert.equal(Math.max(...ROBUSTNESS_LADDERS), LADDER_MAX);
  assert.ok(ROBUSTNESS_LADDERS.length >= 5,
    "too few samples to characterise a reform's range");
});

test("component share distinguishes whole-life from slaughter-moment reforms", () => {
  near(componentShare(def("cagefree"), W30), 1.0, 1e-9);   // whole-life track
  near(componentShare(def("bcc"), W30),      0.999519, 1e-5);
  near(componentShare(def("stunning"), W30), 0.000481, 1e-6);
});

test("stunning averts far less than its headline reduction suggests", () => {
  const t = reformTable(W30);
  const stun = t.find(r => r.key === "stunning");
  near(stun.reduction, 0.887100, 1e-5);          // of slaughter pain
  near(stun.shareOfSpeciesPain, 0.000427, 1e-6); // of all broiler pain
  const broilers = speciesTotals(W30).rows.find(r => r.key === "broilers");
  assert.ok(stun.painYearsAverted < broilers.painYears * 0.001,
    "stunning must not be credited with a share of farm pain");
});

test("BCC acts on the farm track, which is essentially all broiler pain", () => {
  const bcc = reformTable(W30).find(r => r.key === "bcc");
  near(bcc.shareOfSpeciesPain, 0.577048, 1e-5);
});

test("reform table carries provenance and averted pain years", () => {
  const t = reformTable(W30);
  const cf = t.find(r => r.key === "cagefree");
  assert.equal(cf.provenance, "measured");
  assert.ok(cf.painYearsAverted > 0);
  assert.equal(t.find(r => r.key === "pigcrates").provenance, "assumption");
});

test("defaults round-trip", () => {
  assert.deepEqual(decodeState(encodeState(DEFAULT_STATE)), DEFAULT_STATE);
});

test("a modified simple state round-trips", () => {
  // When advanced is false the three ratios ARE the ladder - that invariant is
  // what the single slider maintains, so a test state must respect it.
  const s = { ...DEFAULT_STATE, ladder: 12.5,
              eOverD: 12.5, dOverH: 12.5, hOverA: 12.5, includeShrimp: false,
              welfareRanges: { fish: 0.2 }, multiples: { fish: 0.7 } };
  assert.deepEqual(decodeState(encodeState(s)), s);
});

test("an advanced state round-trips with independent ratios", () => {
  const s = { ...DEFAULT_STATE, advanced: true, eOverD: 100, dOverH: 8, hOverA: 3 };
  assert.deepEqual(decodeState(encodeState(s)), s);
});

test("defaults encode to an empty hash so clean URLs stay clean", () => {
  assert.equal(encodeState(DEFAULT_STATE), "");
});

test("malformed hashes fall back to defaults without throwing", () => {
  for (const bad of ["", "#", "nonsense", "ladder=", "ladder=abc",
                     "%%%", "wr=notjson", "mult=[1,2]"]) {
    assert.deepEqual(decodeState(bad), DEFAULT_STATE);
  }
});

test("an out-of-range ladder is clamped, not rejected", () => {
  assert.equal(decodeState("ladder=99999").ladder, 1000);
  assert.equal(decodeState("ladder=0").ladder, 1);
});

test("a leading hash is tolerated", () => {
  assert.equal(decodeState("#ladder=12").ladder, 12);
});

test("pain years use a compact human scale", () => {
  assert.equal(formatPainYears(705_279_717), "705M");
  assert.equal(formatPainYears(1_240_000_000), "1.24bn");
  assert.equal(formatPainYears(63_465_700), "63M");
  assert.equal(formatPainYears(4_200), "4k");
  assert.equal(formatPainYears(0), "0");
});

test("percentages round to the requested places", () => {
  assert.equal(formatPercent(0.621892, 1), "62.2%");
  assert.equal(formatPercent(0.621892, 0), "62%");
  assert.equal(formatPercent(0.0058, 2), "0.58%");
});

test("each reform's share of total pain carries an ordered 90% interval", () => {
  for (const r of reformTable(tierWeights({ ladder: 30 }))) {
    const { min, max } = r.shareOfTotal;
    assert.ok(min >= 0 && min <= max, r.key);
  }
});

test("welfare ranges pass through RP's 5th, 50th and 95th percentiles", () => {
  assert.equal(welfareRangeAt("chicken", 0.01), 0.002);
  near(welfareRangeAt("chicken", 0.5), 0.327);
  near(welfareRangeAt("chicken", 0.95), 0.856);
  assert.equal(welfareRangeAt("shrimp", 0.99), 1.095);
  // Log-scale upper half: the midpoint between 50th and 95th is geometric.
  near(welfareRangeAt("shrimp", 0.725), Math.sqrt(0.029 * 1.095));
});

test("combined reform interval at defaults, across tier ratios and welfare ranges", () => {
  const c = combinedReformShare(tierWeights({ ladder: 30 }));
  near(c.min, 0.049, 5e-3);
  near(c.max, 0.375, 5e-3);
});

test("the sampled interval is deterministic", () => {
  assert.deepEqual(reformUncertainty({}), reformUncertainty({}));
});

test("hand-set welfare ranges are held fixed, leaving only tier-ratio spread", () => {
  const welfareRanges = Object.fromEntries(SPECIES.map(s => [s.key, 0.1]));
  const { combined } = reformUncertainty({ welfareRanges });
  const free = reformUncertainty({}).combined;
  assert.ok(combined.max - combined.min < free.max - free.min);
});

test("combined reforms skip furnished cages, the alternative to cage-free", () => {
  const w = tierWeights({ ladder: 30 });
  const t = speciesTotals(w).total;
  const sum = reformTable(w).filter(r => r.key !== "furnished")
    .reduce((a, r) => a + r.painYearsAverted, 0);
  const c = combinedReformShare(w);
  near(c.value, sum / t);
  near(c.value, 0.2985, 1e-3);
});

test("a country's species split sums to its total", () => {
  for (const row of countryTotals(tierWeights({ ladder: 30 })).rows) {
    near(Object.values(row.bySpecies).reduce((a, b) => a + b, 0), row.painYears, 1e-3);
  }
});
