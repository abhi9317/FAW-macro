// ui.js — React rendering. All arithmetic lives in model.js.
import {
  DEFAULT_STATE, encodeState, decodeState, tierWeights, exchangeRates,
  speciesTotals, countryTotals, reformTable, anchorFraction,
  formatPainYears, formatPercent, LADDER_MIN, LADDER_MAX,
} from "./model.js";
import { STUDY_PERIODS, PAIN_TRACKS } from "./data.js";

// Null-safe share: several sliders can legally drive a total to zero
// (e.g. every welfare range set to 0), and a bare division would render
// NaN% in headings and panels across every section.
const shareOf = (a, b) => (b > 0 ? a / b : 0);

const { createElement: h, useState, useMemo, useEffect, Fragment } = React;

const Tag = ({ kind }) => h("span", {
  className: "tag tag-" + (kind === "measured" ? "measured"
            : kind === "proxied" ? "proxied" : "author"),
}, kind);

const Bar = ({ value, max, color }) =>
  h("div", { className: "bar" },
    h("i", { style: { width: Math.max(0, Math.min(100, (value / max) * 100)) + "%",
                      background: color } }));

const Slider = ({ value, min, max, step, onChange, label }) =>
  h("input", { type: "range", value, min, max, step, "aria-label": label,
               onChange: e => onChange(parseFloat(e.target.value)) });

const Section = ({ n, kicker, heading, children }) =>
  h("section", { style: { paddingTop: "3rem" } },
    h("div", { className: "num", style: { fontSize: ".7rem", letterSpacing: ".15em",
        textTransform: "uppercase", color: "var(--accent)", marginBottom: ".4rem" } },
      n + " · " + kicker),
    h("h2", null, heading),
    children);

function TierControl({ state, set }) {
  const w = tierWeights(state.advanced
    ? { eOverD: state.eOverD, dOverH: state.dOverH, hOverA: state.hOverA }
    : { ladder: state.ladder });
  const r = exchangeRates(w);
  const fmt = n => n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(n < 10 ? 1 : 0);

  return h("div", { className: "panel", style: { marginBlock: "1rem" } },
    h("div", { className: "num", style: { fontSize: ".95rem", lineHeight: 1.7,
                                          marginBottom: ".8rem" } },
      h("strong", null, "1 hour Excruciating"), " = ",
      h("strong", { style: { color: "var(--accent)" } }, fmt(r.eToD)), " hours Disabling = ",
      h("strong", { style: { color: "var(--accent)" } }, fmt(r.eToH)), " hours Hurtful = ",
      h("strong", { style: { color: "var(--accent)" } }, fmt(r.eToA)), " hours Annoying"),
    state.advanced
      ? h(Fragment, null, ...[
          ["eOverD", "Excruciating : Disabling"],
          ["dOverH", "Disabling : Hurtful"],
          ["hOverA", "Hurtful : Annoying"],
        ].map(([k, label]) =>
          h("label", { key: k, style: { display: "block", marginBottom: ".5rem" } },
            h("span", { style: { fontSize: ".85rem", color: "var(--muted)" } },
              label + " — " + state[k].toFixed(1) + "x"),
            h(Slider, { value: state[k], min: LADDER_MIN, max: LADDER_MAX, step: 0.5,
                        label, onChange: v => set({ [k]: v }) }))))
      : h("label", null,
          h("span", { style: { fontSize: ".85rem", color: "var(--muted)" } },
            "Each tier is " + state.ladder.toFixed(1) + "x worse than the one below"),
          h(Slider, { value: state.ladder, min: LADDER_MIN, max: LADDER_MAX, step: 0.5,
                      label: "Pain tier ratio",
                      onChange: v => set({ ladder: v, eOverD: v, dOverH: v, hOverA: v }) })),
    h("button", { onClick: () => set({ advanced: !state.advanced }),
                  style: { marginTop: ".6rem", fontSize: ".8rem", cursor: "pointer",
                           background: "none", border: "1px solid var(--rule)",
                           borderRadius: ".3rem", padding: ".25rem .6rem",
                           color: "var(--ink)", fontFamily: "var(--mono)" } },
      state.advanced ? "Use a single ratio" : "Set each ratio separately"));
}

function SpeciesAssumptions({ state, set, rows }) {
  return h("div", { className: "panel" },
    ...rows.map(r => h("div", { key: r.key, style: {
        display: "grid", gridTemplateColumns: "minmax(7rem,1fr) 1fr auto",
        gap: ".6rem", alignItems: "center", padding: ".45rem 0",
        borderBottom: "1px solid var(--rule)" } },
      h("div", null,
        h("div", { style: { fontSize: ".92rem" } }, r.name),
        h("div", { style: { fontSize: ".72rem", color: "var(--muted)" } },
          r.wrProxy ? "welfare range proxied from " + r.wrProxy : " ")),
      h("div", null,
        h(Slider, { value: r.welfareRange, min: 0, max: 0.6, step: 0.001,
                    label: r.name + " welfare range",
                    onChange: v => set({ welfareRanges:
                      { ...state.welfareRanges, [r.key]: v } } ) }),
        h("div", { className: "num", style: { fontSize: ".72rem", color: "var(--muted)" } },
          "welfare range " + r.welfareRange.toFixed(3) +
          " · " + formatPercent(r.fraction, 2) + " of life in pain" +
          (STUDY_PERIODS[r.key] ? " · " + STUDY_PERIODS[r.key] + "d study period" : "")),
        // Reader-settable multiple, for species with no pain track of their own.
        r.provenance === "assumption"
          ? h("div", { style: { marginTop: ".4rem" } },
              h("div", { style: { fontSize: ".72rem", color: "var(--muted)" } },
                "How bad is a " + r.name.toLowerCase().replace(/s$/, "") +
                "'s life relative to a broiler's?"),
              h(Slider, { value: r.multiple, min: 0, max: 2, step: 0.01,
                          label: r.name + " severity relative to a broiler",
                          onChange: v => set({ multiples:
                            { ...state.multiples, [r.key]: v } } ) }),
              h("div", { className: "num", style: { fontSize: ".72rem",
                  color: "var(--warm)" } }, r.multiple.toFixed(2) + "x a broiler"))
          : r.provenance === "proxied"
            ? h("div", { className: "num", style: { fontSize: ".72rem",
                color: "var(--muted)", marginTop: ".2rem" } },
                r.multiple.toFixed(r.multiple < 0.1 ? 3 : 2) + "x a broiler (fixed)")
            : null),
      h(Tag, { kind: r.provenance }))));
}

const HEN_TIERS = ["Excruciating", "Disabling", "Hurtful", "Annoying"];

function WorkedHen({ weights }) {
  const track = PAIN_TRACKS.layers_conventional_cage;
  const lifeHours = STUDY_PERIODS.layers * 24;
  const de = track.map((h, i) => h * weights[i]);
  const total = de.reduce((a, b) => a + b, 0);
  const rawTotal = track.reduce((a, b) => a + b, 0);
  const w = n => n >= 1 ? n.toFixed(n >= 10 ? 0 : 1) : "1/" + Math.round(1 / n);

  return h("div", { className: "panel", style: { marginBottom: "1rem" } },
    h("div", { style: { fontSize: ".9rem", marginBottom: ".7rem" } },
      "One caged laying hen lives ", h("span", { className: "num" },
        lifeHours.toLocaleString()), " hours. She is in some kind of pain for ",
      h("span", { className: "num" }, Math.round(rawTotal).toLocaleString()),
      " of them — ", formatPercent(rawTotal / lifeHours, 0),
      " of her life. Those hours are not equally bad:"),
    h("div", { className: "scroll-x" },
      h("table", { style: { width: "100%", borderCollapse: "collapse",
                            fontSize: ".82rem" } },
        h("thead", null, h("tr", null, ...["Intensity", "Raw hours", "Worth",
            "Disabling-equivalent"].map((c, i) =>
          h("th", { key: c, style: { textAlign: i ? "right" : "left",
              fontWeight: 500, color: "var(--muted)", padding: ".25rem .4rem",
              borderBottom: "1px solid var(--rule)" } }, c)))),
        h("tbody", null, ...HEN_TIERS.map((name, i) =>
          h("tr", { key: name },
            h("td", { style: { padding: ".25rem .4rem" } }, name),
            h("td", { className: "num", style: { textAlign: "right", padding: ".25rem .4rem" } },
              track[i] < 1 ? track[i].toFixed(2) : Math.round(track[i]).toLocaleString()),
            h("td", { className: "num", style: { textAlign: "right", padding: ".25rem .4rem",
              color: "var(--muted)" } }, w(weights[i])),
            h("td", { className: "num", style: { textAlign: "right", padding: ".25rem .4rem" } },
              de[i] < 1 ? de[i].toFixed(2) : Math.round(de[i]).toLocaleString())))))),
    h("p", { style: { fontSize: ".86rem", marginTop: ".7rem", marginBottom: 0 } },
      "Her whole life of pain comes to ", h("strong", { className: "num" },
        Math.round(total).toLocaleString()), " disabling-equivalent hours — ",
      h("strong", null, formatPercent(total / lifeHours, 2)), " of her life. ",
      "That is a ", h("em", null, "level"), ", not a saving: it is how bad her ",
      "life is before anything is done about it. What a reform removes from it ",
      "is a separate number, in section 03."));
}

const rampColor = (i, n) =>
  `color-mix(in srgb, var(--accent) ${100 - (i / Math.max(1, n - 1)) * 100}%, var(--warm))`;

function SpeciesSection({ species, state, set }) {
  const rows = [...species.rows].sort((a, b) => b.painYears - a.painYears);
  const max = Math.max(...rows.map(r => r.painYears), 1);
  const chickens = rows.filter(r => r.key === "layers" || r.key === "broilers")
                       .reduce((a, r) => a + r.painYears, 0);
  return h(Section, { n: "01", kicker: "By species",
      heading: `Chickens carry ${formatPercent(shareOf(chickens, species.total), 0)} of it.` },
    h("div", { style: { display: "flex", gap: ".5rem", marginBottom: ".8rem" } },
      ...[[true, "With shrimp"], [false, "Without shrimp"]].map(([v, label]) =>
        h("button", { key: label, onClick: () => set({ includeShrimp: v }),
          style: { cursor: "pointer", fontFamily: "var(--mono)", fontSize: ".75rem",
            padding: ".3rem .7rem", borderRadius: ".3rem",
            border: "1px solid " + (state.includeShrimp === v ? "var(--accent)" : "var(--rule)"),
            background: state.includeShrimp === v ? "var(--accent)" : "transparent",
            color: state.includeShrimp === v ? "var(--paper)" : "var(--ink)" } }, label))),
    h("div", { className: "panel" },
      ...rows.map((r, i) => h("div", { key: r.key, style: {
          display: "grid", gridTemplateColumns: "minmax(6rem,9rem) 1fr auto auto",
          gap: ".6rem", alignItems: "center", padding: ".3rem 0" } },
        h("span", { style: { fontSize: ".9rem" } }, r.name),
        h(Bar, { value: r.painYears, max, color: rampColor(i, rows.length) }),
        h("span", { className: "num", style: { fontSize: ".78rem" } },
          formatPercent(shareOf(r.painYears, species.total), 1)),
        h(Tag, { kind: r.provenance })))));
}

function CountrySection({ countries, state, set }) {
  const rows = countries.rows.slice(0, 14);
  const max = Math.max(...rows.map(r => r.painYears), 1);
  return h(Section, { n: "02", kicker: "By country",
      heading: `${countries.rows[0].name} alone is ` +
               `${formatPercent(shareOf(countries.rows[0].painYears, countries.total), 0)}.` },
    h("div", { style: { display: "flex", gap: ".5rem", marginBottom: ".8rem" } },
      ...[[true, "With fish"], [false, "Without fish"]].map(([v, label]) =>
        h("button", { key: label, onClick: () => set({ includeFish: v }),
          style: { cursor: "pointer", fontFamily: "var(--mono)", fontSize: ".75rem",
            padding: ".3rem .7rem", borderRadius: ".3rem",
            border: "1px solid " + (state.includeFish === v ? "var(--accent)" : "var(--rule)"),
            background: state.includeFish === v ? "var(--accent)" : "transparent",
            color: state.includeFish === v ? "var(--paper)" : "var(--ink)" } }, label))),
    h("div", { className: "panel scroll-x" },
      ...rows.map(r => h("div", { key: r.name, style: {
          display: "grid", gridTemplateColumns: "minmax(7rem,10rem) 1fr 3.5rem",
          gap: ".6rem", alignItems: "center", padding: ".25rem 0" } },
        h("span", { style: { fontSize: ".88rem",
          color: r.name === "Other countries" ? "var(--muted)" : "var(--ink)" } }, r.name),
        h(Bar, { value: r.painYears, max, color: "var(--accent)" }),
        h("span", { className: "num", style: { fontSize: ".78rem", textAlign: "right" } },
          formatPercent(shareOf(r.painYears, countries.total), 1))))),
    h("p", { style: { fontSize: ".82rem", color: "var(--muted)", fontStyle: "italic" } },
      "Shrimp is not split by country in the source data, so it appears in the ",
      "species view only."));
}

function ReformSection({ reforms, species }) {
  const rows = [...reforms].sort((a, b) => b.painYearsAverted - a.painYearsAverted);
  const max = Math.max(...rows.map(r => r.painYearsAverted), 1);
  const measured = rows.filter(r => r.robustness);
  const tightest = measured.reduce((b, r) =>
    r.robustness.relativeSpan < b.robustness.relativeSpan ? r : b, measured[0]);
  const illustrative = rows.reduce((a, b) =>
    (b.reduction - b.shareOfSpeciesPain) > (a.reduction - a.shareOfSpeciesPain) ? b : a,
    rows[0]);

  return h(Section, { n: "03", kicker: "What reforms reduce",
      heading: "The deepest cut is not the biggest win." },
    h("p", { style: { marginTop: 0, fontSize: ".95rem", color: "var(--muted)" } },
      "Bars show how much of all farmed-animal suffering each reform would remove ",
      "at full adoption — not how deeply it cuts. A reform can cut nearly all ",
      "of the pain it touches and still barely register, if what it touches is a ",
      "small part of a life."),
    h("div", { className: "panel" },
      ...rows.map(r => h("div", { key: r.key, style: {
          padding: ".55rem 0", borderBottom: "1px solid var(--rule)" } },
        h("div", { style: { display: "flex", justifyContent: "space-between",
                            gap: ".6rem", fontSize: ".88rem" } },
          h("span", null, r.label),
          h("span", { className: "num" },
            formatPercent(shareOf(r.painYearsAverted, species.total), 2))),
        h(Bar, { value: r.painYearsAverted, max, color: "var(--warm)" }),
        h("div", { style: { display: "flex", justifyContent: "space-between",
                            gap: ".6rem", marginTop: ".25rem", flexWrap: "wrap" } },
          h("span", { className: "num", style: { fontSize: ".72rem",
              color: "var(--muted)" } },
            "cuts " + formatPercent(r.reduction, 1) + " of the pain it touches" +
            (r.robustness
              ? " · " + formatPercent(r.robustness.min, 1) + "–" +
                formatPercent(r.robustness.max, 1) + " across plausible tier ratios"
              : " · fixed, no pain-track data")),
          h(Tag, { kind: r.provenance }))))),
    h("p", { style: { marginTop: "1rem", fontSize: ".95rem" } },
      h("strong", { style: { color: "var(--warm)" } }, illustrative.label),
      " is the clearest case: it removes ",
      h("strong", null, formatPercent(illustrative.reduction, 1)),
      " of the pain it touches, but only ",
      h("strong", null, formatPercent(shareOf(illustrative.painYearsAverted,
                                              species.total), 2)),
      " of all farmed-animal suffering. The gap is the point — what it ",
      "touches is a small slice of the animal's life."),
    h("p", { style: { fontSize: ".95rem" } },
      h("strong", { style: { color: "var(--accent)" } }, tightest.label),
      " is the sturdiest: ", formatPercent(tightest.robustness.min, 1), " to ",
      formatPercent(tightest.robustness.max, 1),
      " across the whole plausible range of tier ratios. You can reject the ",
      "default weights entirely and still not dislodge it. Reforms with a wider ",
      "range depend far more on what you believe about how pain intensities ",
      "compare — drag the ratio above and watch which numbers hold."),
    h("p", { style: { fontSize: ".82rem", color: "var(--muted)", fontStyle: "italic" } },
      "Cage-free and furnished cage are alternatives to the same baseline, not ",
      "additions to each other."));
}

function Provenance({ anchor, species }) {
  const soft = species.rows
    .filter(r => r.provenance !== "measured")
    .reduce((a, r) => a + r.painYears, 0);
  const fish = species.rows.find(r => r.key === "fish");
  const link = (href, text) =>
    h("a", { href, target: "_blank", rel: "noopener noreferrer",
             style: { color: "var(--accent)" } }, text);
  return h("footer", { style: { marginTop: "4rem", paddingTop: "1.2rem",
      borderTop: "1px solid var(--rule)", fontSize: ".85rem",
      color: "var(--muted)", lineHeight: 1.7 } },
    h("div", { className: "num", style: { textTransform: "uppercase",
        letterSpacing: ".12em", marginBottom: ".6rem",
        color: "var(--ink)" } }, "Provenance"),
    h("p", null, "Hours of pain by intensity come from the ",
      link("https://welfarefootprint.org/", "Welfare Footprint Project"),
      " for laying hens and broilers, and from Rethink Priorities' ",
      link("https://rethinkpriorities.github.io/quantifying_shrimp_pain/",
           "Quantifying shrimp pain"),
      " for shrimp. Welfare ranges are Rethink Priorities' ",
      link("https://rethinkpriorities.org/research-area/welfare-range-estimates/",
           "50th-percentile estimates"),
      ". Populations are standing stock across 92 countries plus a residual row."),
    h("p", null, h("strong", { style: { color: "var(--warm)" } },
        "Farmed fish are " +
        formatPercent(shareOf(species.rows.find(r => r.key === "fish")?.painYears ?? 0,
                              species.total), 0) +
        " of this total, and none of it is measured."),
      " No source here covers fish pain. Their figure is whatever multiple of a ",
      "broiler you set above — currently ",
      h("span", { className: "num" }, (fish?.multiple ?? 0).toFixed(2) + "x"),
      ", defaulting to the ratio implied by the source workbook's welfare ",
      "scores. Replacing it with a real fish pain track would be the single ",
      "biggest improvement to this model."),
    h("p", null, "Because of that, ", h("strong", null, "which species suffers ",
      "most is not a result of this page"), " — it turns on the fish ",
      "multiple. Move it and the ordering changes."),
    h("p", null, h("strong", { style: { color: "var(--warm)" } },
        formatPercent(shareOf(soft, species.total), 0) + " of this total is not measured."),
      " Species with no pain track of their own take a stated multiple of the ",
      "broiler, which is measured at ",
      h("span", { className: "num" }, formatPercent(anchor, 2)),
      " of an animal-year. There is deliberately no single calibration ",
      "constant: layers and broilers both score −1.0 in the source workbook ",
      "yet measure 4.38% and 6.15%, and shrimp implies 1.78% — a 3.5x ",
      "spread, so a constant fitted to any one of them would be arbitrary. ",
      "Ducks and turkeys take the broiler track at 1.00x; cattle and sheep, ",
      "which sit at 0 in the workbook, take a fixed 0.081x, an author ",
      "assumption. This is the weakest joint in the model."),
    h("p", null, "The Welfare Footprint tracks and the shrimp analysis were ",
      "built by different teams using different methods. Treating their hours ",
      "as directly comparable is an assumption of this page, not of either ",
      "source. The 42-day broiler study period comes from the same grant ",
      "BOTEC template these figures are used alongside; the 150-day shrimp ",
      "period comes from Rethink Priorities' own penaeid-ongrowing scope, ",
      "not that template. The 546-day laying-hen period is 420 days of lay ",
      "plus 126 of rearing: the 420 is recovered from the study itself, whose ",
      "deprivation totals resolve into exact daily rates only at that length ",
      "(movement restriction 10.000 h/day, foraging 6.667). The track records ",
      "no rearing-phase harms, so a pullet's 126 days are counted here as ",
      "pain-free, which understates the total. ",
      "The default tier ratio of 30 lands the cage-free and ",
      "broiler reforms ",
      "within a few points of the percentages that template already uses, ",
      "which is a sanity check rather than a justification."),
    h("p", null, "One limit is worth stating plainly. Even counting an hour of ",
      "Annoying pain as equal to an hour of Excruciating pain, a caged hen's ",
      "measured pain reaches only 85% of her life — so the source ",
      "workbook's score of −1.0 is unreachable from this data under any ",
      "tier weighting — and the reason is worth being precise about, because ",
      "it is not that the data ignores anything. The Welfare Footprint track ",
      "does price behavioural deprivation, and prices it as the dominant harm ",
      "of a cage: being unable to nest, forage, dustbathe, roost or move ",
      "accounts for ", h("strong", null, "75%"), " of a caged hen's ",
      "disabling-equivalent total, and deprivation of nest building alone for ",
      "three quarters of every Disabling hour in the study. What separates ",
      "4.4% from −1.0 is therefore not what counts, but how much it counts ",
      "for: four fifths of her painful hours are deprivation, recorded mostly ",
      "as Hurtful and Annoying, which the default ratio divides by 30 and 900. ",
      "Whether constant mild deprivation is worth that much less than acute ",
      "pain is a real disagreement, and the ratio above is where you settle ",
      "it — not a question this page has answered for you."),
    h("p", null, "Uncertainty intervals are published by both sources and are ",
      "not shown here. Insects, wild animals and fur farming are excluded."));
}

function App() {
  const [state, setState] = useState(() => decodeState(location.hash));
  const set = patch => setState(s => ({ ...s, ...patch }));
  const reset = () => setState({ ...DEFAULT_STATE, welfareRanges: {}, multiples: {} });

  useEffect(() => {
    const encoded = encodeState(state);
    const next = encoded ? "#" + encoded : location.pathname + location.search;
    history.replaceState(null, "", next);
  }, [state]);

  const weights = useMemo(() => tierWeights(state.advanced
    ? { eOverD: state.eOverD, dOverH: state.dOverH, hOverA: state.hOverA }
    : { ladder: state.ladder }), [state]);

  const opts = {
    welfareRanges: state.welfareRanges, multiples: state.multiples,
    includeShrimp: state.includeShrimp, includeFish: state.includeFish,
  };
  const species = useMemo(() => speciesTotals(weights, opts), [weights, state]);
  const countries = useMemo(() => countryTotals(weights, opts), [weights, state]);
  const reforms = useMemo(() => reformTable(weights, opts), [weights, state]);

  return h(Fragment, null,
    h(Hero, { total: species.total, reset },
      // The total swings 35x across the plausible range of r, so the control
      // sits WITH the headline. Burying it below would overstate confidence.
      h(TierControl, { state, set })),
    h(Section, { n: "00", kicker: "Assumptions",
                 heading: "The two things you can change" },
      h(WorkedHen, { weights }),
      h(SpeciesAssumptions, { state, set, rows: species.rows })),
    h(SpeciesSection, { species, state, set }),
    h(CountrySection, { countries, state, set }),
    h(ReformSection, { reforms, species }),
    h(Provenance, { anchor: anchorFraction(weights), species }));
}

function Hero({ total, reset, children }) {
  return h("header", { style: { paddingTop: "3.5rem" } },
    h("div", { className: "num", style: { fontSize: ".7rem", letterSpacing: ".2em",
        textTransform: "uppercase", color: "var(--accent)", marginBottom: "1rem" } },
      "The scale of farmed-animal suffering"),
    h("h1", null,
      "Farmed animals endure ",
      h("span", { style: { color: "var(--accent)" } }, formatPainYears(total)),
      " welfare-adjusted pain years, every year."),
    h("p", { style: { color: "var(--muted)", maxWidth: "38rem" } },
      "One welfare-adjusted pain year is one year of disabling-level pain at ",
      "human-equivalent intensity. Every figure below comes from one line: ",
      h("strong", { style: { color: "var(--ink)" } },
        "animals alive x share of life in pain x welfare range"),
      ". Change either assumption and the whole page re-settles."),
    h("button", { onClick: reset, style: { marginTop: "1rem", cursor: "pointer",
        fontFamily: "var(--mono)", fontSize: ".8rem", padding: ".4rem .8rem",
        borderRadius: ".3rem", border: "1px solid var(--rule)",
        background: "none", color: "var(--warm)" } }, "Reset assumptions"),
    children);
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
