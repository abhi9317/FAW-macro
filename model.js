// model.js — pure engine. No DOM, no React, no globals.
import { PAIN_TRACKS, STUDY_PERIODS, WELFARE_RANGES, SPECIES,
         COUNTRIES, COUNTRY_COLS, REFORM_DEFS, WORKBOOK_RATES } from "./data.js";

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
 *  because their study period comes from the BOTEC template rather than being
 *  an author assumption, and their track covers the whole life. */
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
      key: s.key, name: s.name, alive: s.alive, fraction, provenance,
      multiple: fractions[s.key].multiple, anchor: fractions[s.key].anchor,
      welfareRange, wrProxy: s.wrProxy ?? null,
      painYears: s.alive * fraction * welfareRange,
    });
  }
  return { rows, total: rows.reduce((a, r) => a + r.painYears, 0) };
}

/** Country columns 2-7 are workbook DALYs, already multiplied by a per-animal
 *  rate (WORKBOOK_RATES) - NOT head counts. Rescale them by the ratio of this
 *  model's rate to the workbook's. Columns 8-9 (cattle, sheep) ARE head counts
 *  and are multiplied directly. Shrimp is absent: the source table has no
 *  shrimp column, so shrimp is a global block in the species view only. */
export function countryTotals(weights, opts = {}) {
  const { welfareRanges = {}, multiples = {}, includeFish = true } = opts;
  const fractions = speciesPainFractions(weights, multiples);
  const scale = {};
  for (const s of SPECIES) {
    if (s.key === "shrimp") continue;
    const rate = fractions[s.key].fraction * resolveWelfareRange(s, welfareRanges);
    scale[s.key] = WORKBOOK_RATES[s.key] ? rate / WORKBOOK_RATES[s.key] : rate;
  }
  const rows = COUNTRIES.map(row => {
    let painYears = 0;
    for (const [key, col] of Object.entries(COUNTRY_COLS)) {
      if (key === "fish" && !includeFish) continue;
      painYears += row[col] * (scale[key] ?? 0);
    }
    return { name: row[0], geo: row[1], painYears };
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

export function reformTable(weights, opts = {}) {
  const { rows } = speciesTotals(weights, opts);
  const bySpecies = Object.fromEntries(rows.map(r => [r.key, r.painYears]));
  return REFORM_DEFS.map(def => {
    const reduction = reformReduction(def, weights);
    const share = componentShare(def, weights);
    return {
      key: def.key, label: def.label, species: def.species, reduction,
      componentShare: share,
      shareOfSpeciesPain: reduction * share,
      robustness: def.fixedReduction !== undefined
        ? null : reformRobustness(def),
      provenance: def.provenance,
      painYearsAverted: (bySpecies[def.species] ?? 0) * share * reduction,
    };
  });
}

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
