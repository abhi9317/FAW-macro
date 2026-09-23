// model.js — pure engine. No DOM, no React, no globals.
import { PAIN_TRACKS, STUDY_PERIODS, WELFARE_RANGES, WELFARE_RANGE_INTERVALS, SPECIES,
         COUNTRIES, COUNTRY_COLS, REFORM_DEFS, COUNTRY_TABLE_RATES } from "./data.js";

export const DEFAULT_LADDER = 30;

/** Tier weights relative to Disabling = 1, ordered [E, D, H, A].
 *  Pass { ladder } for the geometric chain, or all three ratios to break it. */
export function tierWeights({ ladder, eOverD, dOverH, hOverA } = {}) {
  if (eOverD !== undefined && dOverH !== undefined && hOverA !== undefined) {
    return [eOverD, 1, 1 / dOverH, 1 / (dOverH * hOverA)];
  }
  const r = ladder ?? DEFAULT_LADDER;
  return [r, 1, 1 / r, 1 / (r * r)];
}

/** Human-readable exchange rates: hours of each lower tier per hour of the
 *  tier above. Drives the live readout beside the slider. */
export function exchangeRates([wE, wD, wH, wA]) {
  return { eToD: wE / wD, eToH: wE / wH, eToA: wE / wA };
}

/** Collapse a [E, D, H, A] hour track into disabling-equivalent hours. */
export function disablingEquivalentHours(track, weights) {
  let total = 0;
  for (let i = 0; i < 4; i++) total += track[i] * weights[i];
  return total;
}

/** Share of an animal-year spent in disabling-equivalent pain. The study
 *  period is metadata of the pain track, not a free parameter: a total of
 *  N hours means nothing without the span it was measured over. */
export function painFractionFromTrack(deHours, studyPeriodDays) {
  return deHours / (studyPeriodDays * 24);
}

function measuredFraction(s, weights) {
  let de = disablingEquivalentHours(PAIN_TRACKS[s.track], weights);
  if (s.slaughterTrack) {
    de += disablingEquivalentHours(PAIN_TRACKS[s.slaughterTrack], weights);
  }
  return painFractionFromTrack(de, STUDY_PERIODS[s.period]);
}

/** The measured species that unmeasured ones are expressed against. Broilers,
 *  because their study period is a standard grow-out rather than an author
 *  reconstruction, and their track covers the whole life. */
export function anchorFraction(weights, anchorKey = "broilers") {
  return measuredFraction(SPECIES.find(x => x.key === anchorKey), weights);
}

export function speciesPainFractions(weights, multiples = {}) {
  const out = {};
  for (const s of SPECIES) {
    if (s.painSource === "track") {
      out[s.key] = { fraction: measuredFraction(s, weights),
                     provenance: "measured", multiple: null, anchor: null };
      continue;
    }
    const multiple = multiples[s.key] ?? s.multiple;
    out[s.key] = {
      fraction: multiple * anchorFraction(weights, s.anchor),
      provenance: s.painSource === "proxy" ? "proxied" : "assumption",
      multiple, anchor: s.anchor,
    };
  }
  return out;
}

function resolveWelfareRange(s, overrides = {}) {
  return overrides[s.key] !== undefined
    ? overrides[s.key]
    : WELFARE_RANGES[s.wrKey];
}

export function speciesTotals(weights, opts = {}) {
  const { welfareRanges = {}, multiples = {}, includeShrimp = true } = opts;
  const fractions = speciesPainFractions(weights, multiples);
  const rows = [];
  for (const s of SPECIES) {
    if (s.key === "shrimp" && !includeShrimp) continue;
    const { fraction, provenance } = fractions[s.key];
    const welfareRange = resolveWelfareRange(s, welfareRanges);
    rows.push({
      key: s.key, name: s.name, wrKey: s.wrKey, alive: s.alive, fraction, provenance,
      multiple: fractions[s.key].multiple, anchor: fractions[s.key].anchor,
      welfareRange, wrProxy: s.wrProxy ?? null,
      painYears: s.alive * fraction * welfareRange,
    });
  }
  return { rows, total: rows.reduce((a, r) => a + r.painYears, 0) };
}

/** Country columns 2-7 are DALY estimates, already multiplied by a per-animal
 *  rate (COUNTRY_TABLE_RATES) - NOT head counts. Rescale them by the ratio of
 *  this model's rate to the table's. Columns 8-9 (cattle, sheep) ARE head counts
 *  and are multiplied directly. Shrimp is absent: the source table has no
 *  shrimp column, so shrimp is a global block in the species view only. */
export function countryTotals(weights, opts = {}) {
  const { welfareRanges = {}, multiples = {}, includeFish = true } = opts;
  const fractions = speciesPainFractions(weights, multiples);
  const scale = {};
  for (const s of SPECIES) {
    if (s.key === "shrimp") continue;
    const rate = fractions[s.key].fraction * resolveWelfareRange(s, welfareRanges);
    scale[s.key] = COUNTRY_TABLE_RATES[s.key] ? rate / COUNTRY_TABLE_RATES[s.key] : rate;
  }
  const rows = COUNTRIES.map(row => {
    let painYears = 0;
    const bySpecies = {};
    for (const [key, col] of Object.entries(COUNTRY_COLS)) {
      if (key === "fish" && !includeFish) continue;
      bySpecies[key] = row[col] * (scale[key] ?? 0);
      painYears += bySpecies[key];
    }
    return { name: row[0], geo: row[1], painYears, bySpecies };
  }).sort((a, b) => b.painYears - a.painYears);
  return { rows, total: rows.reduce((a, r) => a + r.painYears, 0) };
}

/** Fractional reduction in disabling-equivalent pain from one reform.
 *  Three shapes: a fixed author assumption; a subtract-this-component reform
 *  (shrimp stunning removes the slaughter block from lifetime pain); or a
 *  baseline-to-reformed track pair. */
export function reformReduction(def, weights) {
  if (def.fixedReduction !== undefined) return def.fixedReduction;
  const base = disablingEquivalentHours(PAIN_TRACKS[def.from], weights);
  if (def.subtract) {
    return disablingEquivalentHours(PAIN_TRACKS[def.subtract], weights) / base;
  }
  return 1 - disablingEquivalentHours(PAIN_TRACKS[def.to], weights) / base;
}

/** The ladders sampled must cover the full slider range, or a row can display
 *  a range that excludes its own current value. */
export const ROBUSTNESS_LADDERS = [1, 2, 3, 5, 10, 30, 100, 300, 1000];

/** How far the reduction moves across the plausible ladder range. A narrow
 *  span means the result survives disagreement about pain tiers. */
export function reformRobustness(def, ladders = ROBUSTNESS_LADDERS) {
  const vals = ladders.map(l => reformReduction(def, tierWeights({ ladder: l })));
  const min = Math.min(...vals), max = Math.max(...vals);
  // Relative span, because an absolute span flatters reforms that are merely
  // small everywhere: shrimp stunning varies by 4pp, but that is 100% of its
  // own size, where cage-free varies by 5pp out of 64.
  return { min, max, relativeSpan: max > 0 ? (max - min) / max : 0 };
}

/** The share of a species' total pain that a reform's component accounts for.
 *  Whole-life reforms return ~1; a slaughter-moment reform returns the sliver
 *  of life that slaughter occupies. Without this, an 88.7% reduction of a
 *  30-second slaughter window would be credited against a 42-day life. */
export function componentShare(def, weights) {
  if (!def.component) return 1;
  const s = SPECIES.find(x => x.key === def.species);
  let total = disablingEquivalentHours(PAIN_TRACKS[s.track], weights);
  if (s.slaughterTrack) {
    total += disablingEquivalentHours(PAIN_TRACKS[s.slaughterTrack], weights);
  }
  return disablingEquivalentHours(PAIN_TRACKS[def.component], weights) / total;
}

/** Reforms that replace another reform's baseline rather than add to it.
 *  Furnished cages and cage-free both start from the conventional cage, so a
 *  combined total counts only cage-free. */
export const ALTERNATIVE_REFORMS = ["furnished"];

/** Pain years averted by each reform at one set of weights, plus the total
 *  they are a share of. Separated out so ranges can re-run it per ladder. */
function avertedAt(weights, opts) {
  const { rows, total } = speciesTotals(weights, opts);
  const bySpecies = Object.fromEntries(rows.map(r => [r.key, r.painYears]));
  const averted = {};
  for (const def of REFORM_DEFS) {
    averted[def.key] = (bySpecies[def.species] ?? 0) *
      componentShare(def, weights) * reformReduction(def, weights);
  }
  return { averted, total };
}

const combinedOf = averted => REFORM_DEFS
  .filter(d => !ALTERNATIVE_REFORMS.includes(d.key))
  .reduce((a, d) => a + averted[d.key], 0);

/** Seeded PRNG (mulberry32), so ranges are identical on every render and in
 *  tests rather than jittering as the reader drags a slider. */
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A welfare range at percentile p, through RP's published 5th, 50th and
 *  95th percentiles and held flat beyond them. The upper half interpolates on
 *  a log scale: the distributions are heavily right-skewed (shrimp's 95th is
 *  38x its median), and a straight line would put most of that tail's mass
 *  just above the median. The lower half is linear because several 5th
 *  percentiles are exactly 0. */
export function welfareRangeAt(wrKey, p) {
  const [lo, hi] = WELFARE_RANGE_INTERVALS[wrKey];
  const mid = WELFARE_RANGES[wrKey];
  if (p <= 0.05) return lo;
  if (p >= 0.95) return hi;
  return p < 0.5 ? lo + (mid - lo) * (p - 0.05) / 0.45
                 : mid * Math.pow(hi / mid, (p - 0.5) / 0.45);
}

export const UNCERTAINTY_SAMPLES = 2000;

/** 90% intervals for each reform's, and the combined, share of ALL
 *  farmed-animal pain. Each sample draws a tier ratio log-uniformly over the
 *  slider's range and one welfare-range percentile shared by every species:
 *  RP's intervals mostly reflect uncertainty about which theory of welfare is
 *  right, which moves all species together, so independent draws would
 *  overstate how far their ratios can drift apart. Welfare ranges the reader
 *  has set by hand are held at their set value.
 *  Depends only on opts, not the current tier weights, so dragging the tier
 *  slider does not re-run it. */
export function reformUncertainty(opts = {}, n = UNCERTAINTY_SAMPLES) {
  const rand = seededRandom(1);
  const logSpan = Math.log(LADDER_MAX / LADDER_MIN);
  const fixed = opts.welfareRanges ?? {};
  const perReform = Object.fromEntries(REFORM_DEFS.map(d => [d.key, []]));
  const combined = [];
  for (let i = 0; i < n; i++) {
    const ladder = LADDER_MIN * Math.exp(rand() * logSpan);
    const p = rand();
    const welfareRanges = {};
    for (const s of SPECIES) {
      welfareRanges[s.key] = fixed[s.key] ?? welfareRangeAt(s.wrKey, p);
    }
    const { averted, total } = avertedAt(tierWeights({ ladder }), { ...opts, welfareRanges });
    if (!(total > 0)) continue;
    for (const d of REFORM_DEFS) perReform[d.key].push(averted[d.key] / total);
    combined.push(combinedOf(averted) / total);
  }
  const interval = vals => {
    if (!vals.length) return { min: 0, max: 0 };
    vals.sort((a, b) => a - b);
    const at = q => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))];
    return { min: at(0.05), max: at(0.95) };
  };
  return {
    perReform: Object.fromEntries(Object.entries(perReform)
      .map(([k, v]) => [k, interval(v)])),
    combined: interval(combined),
  };
}

/** The share of all farmed-animal pain that every reform together would
 *  remove at full adoption, at the current settings, with its 90% interval. */
export function combinedReformShare(weights, opts = {},
                                    uncertainty = reformUncertainty(opts)) {
  const { averted, total } = avertedAt(weights, opts);
  return { value: total > 0 ? combinedOf(averted) / total : 0,
           ...uncertainty.combined };
}

export function reformTable(weights, opts = {},
                            uncertainty = reformUncertainty(opts)) {
  const { rows, total } = speciesTotals(weights, opts);
  const bySpecies = Object.fromEntries(rows.map(r => [r.key, r.painYears]));
  return REFORM_DEFS.map(def => {
    const reduction = reformReduction(def, weights);
    const share = componentShare(def, weights);
    const painYearsAverted = (bySpecies[def.species] ?? 0) * share * reduction;
    return {
      key: def.key, label: def.label, species: def.species, reduction,
      componentShare: share,
      shareOfSpeciesPain: reduction * share,
      shareOfTotal: { value: total > 0 ? painYearsAverted / total : 0,
                      ...uncertainty.perReform[def.key] },
      robustness: def.fixedReduction !== undefined
        ? null : reformRobustness(def),
      provenance: def.provenance,
      painYearsAverted,
    };
  });
}

export const HOURS_PER_YEAR = 24 * 365;

export const LADDER_MIN = 1;
export const LADDER_MAX = 1000;

export const DEFAULT_STATE = Object.freeze({
  ladder: DEFAULT_LADDER, advanced: false,
  eOverD: DEFAULT_LADDER, dOverH: DEFAULT_LADDER, hOverA: DEFAULT_LADDER,
  welfareRanges: {}, multiples: {},
  includeShrimp: true, includeFish: true,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isEmpty = o => Object.keys(o).length === 0;

export function encodeState(s) {
  const p = new URLSearchParams();
  if (s.ladder !== DEFAULT_STATE.ladder) p.set("ladder", String(s.ladder));
  if (s.advanced) {
    p.set("adv", "1");
    p.set("ed", String(s.eOverD));
    p.set("dh", String(s.dOverH));
    p.set("ha", String(s.hOverA));
  }
  if (!isEmpty(s.welfareRanges)) p.set("wr", JSON.stringify(s.welfareRanges));
  if (!isEmpty(s.multiples)) p.set("mult", JSON.stringify(s.multiples));
  if (!s.includeShrimp) p.set("shrimp", "0");
  if (!s.includeFish) p.set("fish", "0");
  return p.toString();
}

export function decodeState(hash) {
  const out = {
    ...DEFAULT_STATE, welfareRanges: {}, multiples: {},
  };
  try {
    const p = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
    const num = (key, fallback) => {
      // An empty value ("ladder=") must fall back, not parse: Number("") is 0,
      // which is finite, and would silently clamp the ladder to its minimum.
      const raw = p.get(key);
      if (raw === null || raw.trim() === "") return fallback;
      const v = Number(raw);
      return Number.isFinite(v) ? v : fallback;
    };
    out.ladder = clamp(num("ladder", DEFAULT_STATE.ladder), LADDER_MIN, LADDER_MAX);
    out.advanced = p.get("adv") === "1";
    out.eOverD = clamp(num("ed", out.ladder), LADDER_MIN, LADDER_MAX);
    out.dOverH = clamp(num("dh", out.ladder), LADDER_MIN, LADDER_MAX);
    out.hOverA = clamp(num("ha", out.ladder), LADDER_MIN, LADDER_MAX);
    if (!out.advanced) {
      out.eOverD = out.dOverH = out.hOverA = out.ladder;
    }
    for (const [key, field] of [["wr", "welfareRanges"], ["mult", "multiples"]]) {
      if (!p.has(key)) continue;
      const parsed = JSON.parse(p.get(key));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (Number.isFinite(Number(v))) out[field][k] = Number(v);
        }
      }
    }
    out.includeShrimp = p.get("shrimp") !== "0";
    out.includeFish = p.get("fish") !== "0";
  } catch {
    return { ...DEFAULT_STATE, welfareRanges: {}, multiples: {} };
  }
  return out;
}

export function formatPainYears(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "bn";
  if (a >= 1e6) return Math.round(n / 1e6) + "M";
  if (a >= 1e3) return Math.round(n / 1e3) + "k";
  return String(Math.round(n));
}

export const formatPercent = (n, dp = 0) => (n * 100).toFixed(dp) + "%";
