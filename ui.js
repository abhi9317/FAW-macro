// ui.js — React rendering. All arithmetic lives in model.js.
import {
  DEFAULT_STATE, encodeState, decodeState, tierWeights, exchangeRates,
  speciesTotals, countryTotals, reformTable, combinedReformShare, reformUncertainty, anchorFraction, ALTERNATIVE_REFORMS,
  formatPainYears, formatPercent, LADDER_MIN, LADDER_MAX, HOURS_PER_YEAR,
} from "./model.js";
import { PAIN_TRACKS, SPECIES, WELFARE_RANGES, WELFARE_RANGE_INTERVALS } from "./data.js";

const SPECIES_NAME = Object.fromEntries(SPECIES.map(s => [s.key, s.name]));

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

// Species colours follow the species, never its rank, so a reader learns the
// key once. Six hues (validated for colour-blind separation in stack order
// against both panel surfaces); the three smallest species share "other".
const HUED_SPECIES = ["fish", "broilers", "layers", "shrimp", "pigs", "ducks"];
const speciesColor = key =>
  `var(--sp-${HUED_SPECIES.includes(key) ? key : "other"})`;

const Swatch = ({ color }) => h("i", { "aria-hidden": true, style: {
  display: "inline-block", width: ".7rem", height: ".7rem", borderRadius: ".15rem",
  background: color, flex: "none" } });

/** A 100% stacked bar. Segments are separated by a 2px surface gap; the
 *  hovered or focused one is described in the readout line below it. */
function StackBar({ segments, total, label, children }) {
  const [hover, setHover] = useState(null);
  const seg = segments.find(x => x.key === hover);
  return h("div", null,
    h("div", { className: "stack", role: "img", "aria-label": label },
      ...segments.filter(x => x.value > 0).map(x => h("div", {
        key: x.key, tabIndex: 0, title: x.detail,
        onMouseEnter: () => setHover(x.key), onFocus: () => setHover(x.key),
        onMouseLeave: () => setHover(null), onBlur: () => setHover(null),
        onClick: () => setHover(x.key),
        style: { flexGrow: x.value / total, background: x.color,
                 opacity: hover && hover !== x.key ? 0.55 : 1 } }))),
    children,
    h("div", { "aria-live": "polite", className: "num", style: { minHeight: "1.2rem",
        fontSize: ".75rem", color: "var(--muted)", marginTop: ".35rem" } },
      seg ? seg.detail : ""));
}

const Legend = ({ items }) =>
  h("div", { style: { display: "flex", flexWrap: "wrap", gap: ".3rem 1rem",
                      marginTop: ".55rem", fontSize: ".82rem" } },
    ...items.map(i => h("span", { key: i.key, style: { display: "inline-flex",
        alignItems: "center", gap: ".35rem" } },
      h(Swatch, { color: i.color }), i.name,
      i.value != null ? h("span", { className: "num", style: { color: "var(--muted)" } },
        i.value) : null)));

/** Bar plus a 90%-interval whisker, on a shared scale. */
function RangeBar({ value, min, max, scaleMax, color }) {
  const pct = v => Math.max(0, Math.min(100, (v / scaleMax) * 100)) + "%";
  return h("div", { className: "bar", style: { position: "relative", overflow: "visible" } },
    h("i", { style: { width: pct(value), background: color, borderRadius: "0 .25rem .25rem 0" } }),
    h("span", { "aria-hidden": true, className: "whisker",
                style: { left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` } }));
}

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

// RP species the page actually uses, and which page species borrow each.
const WR_PLOT = [
  { wrKey: "pig", name: "Pigs", uses: "pigs, cattle, sheep" },
  { wrKey: "chicken", name: "Chickens", uses: "broilers, layers, ducks, turkeys" },
  { wrKey: "carp", name: "Carp", uses: "farmed fish" },
  { wrKey: "shrimp", name: "Shrimp", uses: "shrimp" },
];
const WR_AXIS_MAX = 1.2;

function WelfareRangePlot({ rows }) {
  const [hover, setHover] = useState(null);
  const at = v => (Math.min(v, WR_AXIS_MAX) / WR_AXIS_MAX) * 100 + "%";
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const plotRows = WR_PLOT.map(p => {
    const [lo, hi] = WELFARE_RANGE_INTERVALS[p.wrKey];
    const mid = WELFARE_RANGES[p.wrKey];
    // Reader-set values for any species borrowing this range, if they differ.
    const set = [...new Set(rows.filter(r => r.wrKey === p.wrKey && r.welfareRange !== mid)
                                .map(r => r.welfareRange))];
    return { ...p, lo, hi, mid, set,
             detail: `${p.name}: median ${mid.toFixed(3)}, 90% interval ` +
                     `${lo.toFixed(3)}–${hi.toFixed(3)} · used for ${p.uses}` };
  });
  const hovered = plotRows.find(r => r.wrKey === hover);
  return h("div", { className: "panel", style: { marginBottom: "1rem" } },
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: ".3rem 1rem",
                        fontSize: ".75rem", color: "var(--muted)", marginBottom: ".6rem" } },
      h("span", { style: { display: "inline-flex", alignItems: "center", gap: ".35rem" } },
        h("span", { className: "wr-dot", style: { position: "static", margin: 0 } }),
        "median"),
      h("span", { style: { display: "inline-flex", alignItems: "center", gap: ".35rem" } },
        h("span", { className: "wr-line", style: { position: "static", display: "inline-block",
                                                   width: "1.4rem", margin: 0 } }),
        "90% interval (5th–95th percentile)"),
      plotRows.some(r => r.set.length)
        ? h("span", { style: { display: "inline-flex", alignItems: "center", gap: ".35rem" } },
            h("span", { className: "wr-set", style: { position: "static", margin: 0 } }),
            "your setting")
        : null),
    ...plotRows.map(r => h("div", { key: r.wrKey, tabIndex: 0, title: r.detail,
        onMouseEnter: () => setHover(r.wrKey), onMouseLeave: () => setHover(null),
        onFocus: () => setHover(r.wrKey), onBlur: () => setHover(null),
        onClick: () => setHover(r.wrKey),
        style: { display: "grid", gridTemplateColumns: "5.5rem 1fr", gap: ".8rem",
                 alignItems: "center", padding: ".45rem 0", cursor: "default" } },
      h("div", null,
        h("div", { style: { fontSize: ".9rem", fontWeight: 500 } }, r.name),
        h("div", { className: "num", style: { fontSize: ".75rem", color: "var(--muted)" } },
          r.mid.toFixed(3))),
      h("div", { className: "wr-track" },
        ...ticks.map(t => h("span", { key: t, className: "wr-grid" + (t === 1 ? " human" : ""),
                                      style: { left: at(t) } })),
        h("span", { className: "wr-line", style: { left: at(r.lo),
                    width: `calc(${at(r.hi)} - ${at(r.lo)})` } }),
        h("span", { className: "wr-dot", style: { left: at(r.mid) } }),
        ...r.set.map(v => h("span", { key: v, className: "wr-set", style: { left: at(v) } }))))),
    // Axis: same grid columns so ticks sit under the plot, not the labels.
    h("div", { style: { display: "grid", gridTemplateColumns: "5.5rem 1fr", gap: ".8rem" } },
      h("span"),
      h("div", { className: "num", style: { position: "relative", height: "1.1rem",
                                            fontSize: ".7rem", color: "var(--muted)" } },
        ...[0, 0.5, 1].map(t => h("span", { key: t, style: { position: "absolute", left: at(t),
            transform: t === 0 ? "none" : "translateX(-50%)", whiteSpace: "nowrap" } },
          t === 1 ? "1 (human)" : String(t))))),
    h("div", { "aria-live": "polite", className: "num", style: { minHeight: "1.2rem",
        fontSize: ".75rem", color: "var(--muted)", marginTop: ".4rem" } },
      hovered ? hovered.detail : ""));
}

function SpeciesAssumptions({ state, set, rows }) {
  // Open by default only when the reader (or a shared link) has changed
  // something here, so custom settings are never hidden.
  const [open, setOpen] = useState(() =>
    Object.keys(state.welfareRanges).length > 0 || Object.keys(state.multiples).length > 0);
  return h(Fragment, null,
    h("h3", { style: { fontFamily: "var(--disp)", fontSize: "1.15rem", fontWeight: 600,
                       margin: "2rem 0 .4rem" } }, "Welfare ranges"),
    h("p", { style: { marginTop: 0, fontSize: ".95rem" } },
      "A ", h("strong", null, "welfare range"), " is how intensely an animal can ",
      "suffer compared with a human, where ", h("strong", { className: "num" }, "1.0"),
      " is a human. At ", h("strong", { className: "num" }, "0.33"), ", an hour of a ",
      "chicken's disabling pain counts as a third of an hour of a human's. ",
      "Rethink Priorities' estimates are very uncertain, and not evenly so. ",
      "Shrimp's median is low, but its 90% interval reaches past a human's:"),
    h(WelfareRangePlot, { rows }),
    h("button", { onClick: () => setOpen(!open), "aria-expanded": open,
        style: { cursor: "pointer", fontFamily: "var(--mono)", fontSize: ".8rem",
          padding: ".4rem .8rem", borderRadius: ".3rem", border: "1px solid var(--rule)",
          background: "none", color: "var(--ink)", marginBottom: ".8rem" } },
      (open ? "▾ " : "▸ ") + "Adjust welfare ranges and species assumptions"),
    !open ? null : h("div", { className: "panel" },
    ...rows.map(r => h("div", { key: r.key, style: {
        display: "grid", gridTemplateColumns: "minmax(5.5rem,1fr) minmax(0,2fr) auto",
        gap: ".8rem", alignItems: "center", padding: ".6rem 0",
        borderBottom: "1px solid var(--rule)" } },
      h("div", null,
        h("div", { style: { fontSize: ".95rem", fontWeight: 500 } }, r.name),
        h("div", { style: { fontSize: ".75rem", color: "var(--muted)" } },
          r.wrProxy ? "range borrowed from " + r.wrProxy : " ")),
      h("div", null,
        h("div", { style: { display: "flex", alignItems: "baseline", gap: ".5rem" } },
          h("span", { className: "num", style: { fontSize: "1.3rem", fontWeight: 700,
                                                 color: "var(--accent)" } },
            r.welfareRange.toFixed(3)),
          h("span", { style: { fontSize: ".78rem", color: "var(--muted)" } },
            "welfare range (human = 1)")),
        h("div", { className: "num", style: { fontSize: ".72rem", color: "var(--muted)" } },
          "RP 90% interval " + WELFARE_RANGE_INTERVALS[r.wrKey].map(v => v.toFixed(3)).join("–")),
        h(Slider, { value: r.welfareRange, min: 0, max: 0.6, step: 0.001,
                    label: r.name + " welfare range",
                    onChange: v => set({ welfareRanges:
                      { ...state.welfareRanges, [r.key]: v } } ) }),
        h("div", { className: "num", style: { fontSize: ".75rem", color: "var(--muted)" } },
          "≈ " + Math.round(r.fraction * HOURS_PER_YEAR).toLocaleString() +
          " hours of disabling-level pain per year alive"),
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
      h(Tag, { kind: r.provenance })))));
}

const HEN_TIERS = ["Excruciating", "Disabling", "Hurtful", "Annoying"];
// Ordinal: one hue, most intense = strongest contrast with the surface.
const TIER_COLOR = ["var(--tier-e)", "var(--tier-d)", "var(--tier-h)", "var(--tier-a)"];

function WorkedHen({ weights }) {
  const track = PAIN_TRACKS.layers_conventional_cage;
  const de = track.map((h, i) => h * weights[i]);
  const total = de.reduce((a, b) => a + b, 0);
  const rawTotal = track.reduce((a, b) => a + b, 0);
  const w = n => n >= 1 ? n.toFixed(n >= 10 ? 0 : 1) : "1/" + Math.round(1 / n);
  const hrs = v => v < 1 ? v.toFixed(2) : Math.round(v).toLocaleString();
  // One scale for both bars, so the weighted bar's shortness IS the point.
  const scale = Math.max(rawTotal, total);
  const segs = vals => HEN_TIERS.map((name, i) => ({
    key: name, name, value: vals[i], color: TIER_COLOR[i],
    detail: name + " · " + hrs(vals[i]) + " h" }));
  const barLabel = (text, value) => h("div", { style: { display: "flex",
      justifyContent: "space-between", gap: ".6rem", fontSize: ".82rem",
      marginBottom: ".3rem" } },
    h("span", null, text),
    h("strong", { className: "num" }, Math.round(value).toLocaleString() + " h"));

  return h("div", { className: "panel", style: { marginBottom: "1rem" } },
    h("div", { style: { fontSize: ".9rem", marginBottom: ".9rem" } },
      "Over her life, one caged laying hen spends ", h("span", { className: "num" },
        Math.round(rawTotal).toLocaleString()), " hours in some kind of pain. ",
      "Those hours are not equally bad, so each is weighted by its intensity:"),
    barLabel("Hours in pain", rawTotal),
    h(StackBar, { segments: segs(track), total: scale,
                  label: `Raw hours in pain: ${Math.round(rawTotal)}` }),
    barLabel("Weighted by intensity (disabling-equivalent)", total),
    h(StackBar, { segments: segs(de), total: scale,
                  label: `Weighted hours: ${Math.round(total)}` }),
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
            h("td", { style: { padding: ".25rem .4rem" } },
              h("span", { style: { display: "inline-flex", alignItems: "center",
                                   gap: ".4rem" } }, h(Swatch, { color: TIER_COLOR[i] }), name)),
            h("td", { className: "num", style: { textAlign: "right", padding: ".25rem .4rem" } },
              track[i] < 1 ? track[i].toFixed(2) : Math.round(track[i]).toLocaleString()),
            h("td", { className: "num", style: { textAlign: "right", padding: ".25rem .4rem",
              color: "var(--muted)" } }, w(weights[i])),
            h("td", { className: "num", style: { textAlign: "right", padding: ".25rem .4rem" } },
              de[i] < 1 ? de[i].toFixed(2) : Math.round(de[i]).toLocaleString())))))),
    h("p", { style: { fontSize: ".86rem", marginTop: ".7rem", marginBottom: 0 } },
      "Weighted by intensity, her whole life of pain comes to ",
      h("strong", { className: "num" }, Math.round(total).toLocaleString()),
      " disabling-equivalent hours — about ",
      h("strong", { className: "num" }, Math.round(total / 24).toLocaleString()),
      " days of disabling-level pain. ",
      "That is a ", h("em", null, "level"), ", not a saving: it is how bad her ",
      "life is before anything is done about it. What a reform removes from it ",
      "is a separate number, in section 03."));
}


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
      ...rows.map(r => h("div", { key: r.key, className: "sp-row" },
        h("span", { className: "sp-name" }, r.name),
        h("div", { className: "sp-bar" },
          h(Bar, { value: r.painYears, max, color: speciesColor(r.key) })),
        h("span", { className: "num sp-pct" },
          formatPercent(shareOf(r.painYears, species.total), 1)),
        h("span", { className: "sp-tag" }, h(Tag, { kind: r.provenance }))))));
}

function CountryBreakdown({ row }) {
  const parts = Object.entries(row.bySpecies)
    .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...parts.map(([, v]) => v), 1);
  return h("div", { style: { margin: ".2rem 0 .7rem", padding: ".6rem .8rem",
      background: "var(--paper)", borderRadius: ".4rem" } },
    h("div", { style: { fontSize: ".78rem", color: "var(--muted)",
                        marginBottom: ".35rem" } },
      "Where " + row.name + "'s suffering comes from"),
    ...parts.map(([key, v], i) => h("div", { key, style: {
        display: "grid", gridTemplateColumns: "minmax(6rem,9rem) 1fr 3.5rem",
        gap: ".6rem", alignItems: "center", padding: ".12rem 0" } },
      h("span", { style: { fontSize: ".82rem" } }, SPECIES_NAME[key] ?? key),
      h(Bar, { value: v, max, color: speciesColor(key) }),
      h("span", { className: "num", style: { fontSize: ".75rem", textAlign: "right" } },
        formatPercent(shareOf(v, row.painYears), 1)))));
}

function CountrySection({ countries, state, set }) {
  const rows = countries.rows.slice(0, 14);
  const max = Math.max(...rows.map(r => r.painYears), 1);
  const [open, setOpen] = useState(null);
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
    h("p", { style: { marginTop: 0, fontSize: ".85rem", color: "var(--muted)" } },
      "Click a country to see which species its suffering comes from."),
    h("div", { className: "panel scroll-x" },
      ...rows.map(r => h(Fragment, { key: r.name },
        h("button", { onClick: () => setOpen(open === r.name ? null : r.name),
            "aria-expanded": open === r.name,
            style: { display: "grid", gridTemplateColumns: "1rem minmax(7rem,10rem) 1fr 3.5rem",
              gap: ".6rem", alignItems: "center", padding: ".25rem 0", width: "100%",
              background: "none", border: 0, cursor: "pointer", textAlign: "left",
              color: "inherit", font: "inherit" } },
          h("span", { className: "num", style: { fontSize: ".7rem", color: "var(--muted)" } },
            open === r.name ? "▾" : "▸"),
          h("span", { style: { fontSize: ".88rem",
            color: r.name === "Other countries" ? "var(--muted)" : "var(--ink)" } }, r.name),
          h(Bar, { value: r.painYears, max, color: "var(--accent)" }),
          h("span", { className: "num", style: { fontSize: ".78rem", textAlign: "right" } },
            formatPercent(shareOf(r.painYears, countries.total), 1))),
        open === r.name ? h(CountryBreakdown, { row: r }) : null))),
    h("p", { style: { fontSize: ".82rem", color: "var(--muted)", fontStyle: "italic" } },
      "Shrimp is not split by country in the source data, so it appears in the ",
      "species view only."));
}

const rangeText = ({ min, max }) =>
  formatPercent(min, 1) + "–" + formatPercent(max, 1);

function ReformSection({ reforms }) {
  const rows = [...reforms].sort((a, b) => b.shareOfTotal.value - a.shareOfTotal.value);
  const scaleMax = Math.max(...rows.map(r => r.shareOfTotal.max),
                            ...rows.map(r => r.shareOfTotal.value), 1e-9);

  return h(Section, { n: "03", kicker: "What reforms reduce",
      heading: `The biggest single reform removes ` +
               `${formatPercent(rows[0].shareOfTotal.value, 0)} of it.` },
    h("p", { style: { marginTop: 0, fontSize: ".95rem", color: "var(--muted)" } },
      "Each figure is the share of ", h("strong", { style: { color: "var(--ink)" } },
        "all farmed-animal pain hours"),
      " that a reform would remove if adopted everywhere, at the settings above. ",
      "The range is a 90% interval over the two big unknowns: how much worse ",
      "each pain tier is (anywhere from 1x to 1000x), and Rethink Priorities' ",
      "uncertainty about every welfare range."),
    h("div", { className: "panel" },
      h("div", { style: { display: "flex", alignItems: "center", gap: ".45rem",
          fontSize: ".75rem", color: "var(--muted)", marginBottom: ".3rem" } },
        h("span", { className: "whisker-key", "aria-hidden": true }),
        "line = 90% range; bar colour = species"),
      ...rows.map(r => h("div", { key: r.key, style: {
          padding: ".55rem 0", borderBottom: "1px solid var(--rule)" } },
        h("div", { style: { display: "flex", justifyContent: "space-between",
                            gap: ".6rem", fontSize: ".88rem" } },
          h("span", null, r.label),
          h("strong", { className: "num" }, formatPercent(r.shareOfTotal.value, 2))),
        h(RangeBar, { ...r.shareOfTotal, scaleMax, color: speciesColor(r.species) }),
        h("div", { style: { display: "flex", justifyContent: "space-between",
                            gap: ".6rem", marginTop: ".25rem", flexWrap: "wrap" } },
          h("span", { className: "num", style: { fontSize: ".75rem",
              color: "var(--muted)" } },
            "90% range " + rangeText(r.shareOfTotal)),
          h(Tag, { kind: r.provenance }))))),
    h("p", { style: { fontSize: ".82rem", color: "var(--muted)", fontStyle: "italic" } },
      "Cage-free and furnished cage are alternatives to the same baseline, not ",
      "additions to each other."));
}

const SHORT_REFORM = { bcc: "Broilers: BCC", cagefree: "Hens: cage-free" };

function RemovedChart({ combined, reforms }) {
  // Only broilers' and layers' reforms get their own hue: every other reform
  // is under 1.5% and folds into one grey segment, which also keeps pigs'
  // pink away from the hens' aqua (too close for deuteranopes in dark mode).
  const counted = reforms.filter(r => !ALTERNATIVE_REFORMS.includes(r.key));
  const own = ["bcc", "cagefree"];
  const named = counted.filter(r => own.includes(r.key))
    .sort((a, b) => b.shareOfTotal.value - a.shareOfTotal.value);
  const rest = counted.filter(r => !own.includes(r.key));
  const restValue = rest.reduce((a, r) => a + r.shareOfTotal.value, 0);
  const pct = v => formatPercent(v, 1);
  const segments = [
    ...named.map(r => ({ key: r.key, name: SHORT_REFORM[r.key] ?? r.label,
      value: r.shareOfTotal.value, color: speciesColor(r.species),
      detail: r.label + " · " + pct(r.shareOfTotal.value) })),
    { key: "rest", name: "Other reforms", value: restValue, color: "var(--sp-other)",
      detail: "Pigs, fish and shrimp reforms and CO₂ stunning · " + pct(restValue) },
    { key: "left", name: "Not removed", value: Math.max(0, 1 - combined.value),
      color: "var(--paper)", detail: "Not removed by any reform · " +
        pct(Math.max(0, 1 - combined.value)) },
  ];
  const at = v => Math.max(0, Math.min(100, v * 100)) + "%";
  return h("div", { className: "panel", style: { marginBottom: "1rem" } },
    h("div", { style: { display: "flex", alignItems: "baseline", gap: ".6rem",
                        flexWrap: "wrap", marginBottom: ".6rem" } },
      h("span", { className: "num", style: { fontSize: "2.4rem", fontWeight: 700,
                                             lineHeight: 1 } },
        formatPercent(combined.value, 0)),
      h("span", { style: { fontSize: ".85rem", color: "var(--muted)" } },
        "of farmed-animal suffering removed · 90% range ",
        h("span", { className: "num", style: { color: "var(--ink)" } },
          formatPercent(combined.min, 0) + "–" + formatPercent(combined.max, 0)))),
    h(StackBar, { segments, total: 1,
        label: `Reforms remove ${formatPercent(combined.value, 0)} of the total, ` +
               `90% range ${formatPercent(combined.min, 0)} to ${formatPercent(combined.max, 0)}` },
      // The interval as a bracket under the bar, on the same 0-100% scale.
      h("div", { "aria-hidden": true, style: { position: "relative", height: ".7rem" } },
        h("span", { className: "bracket",
                    style: { left: at(combined.min),
                             width: `calc(${at(combined.max)} - ${at(combined.min)})` } }),
        h("span", { className: "bracket-tick", style: { left: at(combined.value) } })),
      h(Legend, { items: segments.map(x => ({ key: x.key, name: x.name,
                                              color: x.color, value: pct(x.value) })) })));
}

function BottomLine({ combined, species, reforms }) {
  const fish = species.rows.find(r => r.key === "fish");
  return h(Section, { n: "04", kicker: "The bottom line",
      heading: `Fully implemented, today's reforms would remove ` +
               `${formatPercent(combined.value, 0)} of it.` },
    h(RemovedChart, { combined, reforms }),
    h("p", { style: { fontSize: ".95rem" } },
      "That counts every reform above at full, worldwide adoption — cage-free ",
      "rather than furnished cages for hens, since the two replace the same ",
      "cages. The other ", h("strong", null, formatPercent(1 - combined.value, 0)),
      " remains, partly because reforms improve conditions rather than end ",
      "suffering, and partly because much of it has no reform here at all. ",
      fish && fish.painYears > 0
        ? h(Fragment, null, "The largest untouched block is farmed fish: ",
            h("strong", null, formatPercent(shareOf(fish.painYears, species.total), 0)),
            " of the total, with stunning at slaughter as the only reform counted. ")
        : null,
      "The ", formatPercent(combined.value, 0), " uses the settings above; the ",
      "range also covers tier ratios and welfare ranges you haven't picked."));
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
      link("https://docs.google.com/document/d/1xUvMKRkEOJQcc6V7VJqcLLGAJ2SsdZno0jTIUb61D8k/edit?usp=sharing",
           "50th-percentile estimates"),
      ", with their 5th and 95th percentiles driving the reform ranges. Populations are standing stock across 92 countries plus a residual row."),
    h("p", null, h("strong", { style: { color: "var(--warm)" } },
        "Farmed fish are " +
        formatPercent(shareOf(species.rows.find(r => r.key === "fish")?.painYears ?? 0,
                              species.total), 0) +
        " of this total, and none of it is measured."),
      " No source here covers fish pain. Their figure is whatever multiple of a ",
      "broiler you set above — currently ",
      h("span", { className: "num" }, (fish?.multiple ?? 0).toFixed(2) + "x"),
      ", an author assumption. Replacing it with a real fish pain track would be the single ",
      "biggest improvement to this model."),
    h("p", null, "Because of that, ", h("strong", null, "which species suffers ",
      "most is not a result of this page"), " — it turns on the fish ",
      "multiple. Move it and the ordering changes."),
    h("p", null, h("strong", { style: { color: "var(--warm)" } },
        formatPercent(shareOf(soft, species.total), 0) + " of this total is not measured."),
      " Species with no pain track of their own take a stated multiple of the ",
      "broiler, which is measured at ",
      h("span", { className: "num" }, Math.round(anchor * HOURS_PER_YEAR).toLocaleString()),
      " disabling-equivalent hours per year alive. ",
      "Ducks and turkeys take the broiler track at 1.00x; cattle and sheep ",
      "take a fixed 0.081x, an author assumption. This is the weakest joint ",
      "in the model."),
    h("p", null, "The Welfare Footprint tracks and the shrimp analysis were ",
      "built by different teams using different methods. Treating their hours ",
      "as directly comparable is an assumption of this page, not of either ",
      "source. The broiler study period is a 42-day conventional grow-out; ",
      "the 150-day shrimp period comes from Rethink Priorities' own ",
      "penaeid-ongrowing scope. The 546-day laying-hen period is 420 days of lay ",
      "plus 126 of rearing: the 420 is recovered from the study itself, whose ",
      "deprivation totals resolve into exact daily rates only at that length ",
      "(movement restriction 10.000 h/day, foraging 6.667). The track records ",
      "no rearing-phase harms, so a pullet's 126 days are counted here as ",
      "pain-free, which understates the total."),
    h("p", null, h("strong", { style: { color: "var(--warm)" } },
        "The measured figures are closer to a floor than a full count."),
      " A pain track only includes the harms its authors chose to analyse; ",
      "anything outside that list — an unstudied disease, chronic stress, fear ",
      "that was never scored — counts here as zero hours. The hen track also ",
      "stops before depopulation, transport and slaughter. And the tracks ",
      "record only pain, never positive experiences, so a reform that adds good ",
      "moments to a life, such as room to dustbathe in a cage-free barn, is ",
      "credited only for the pain it removes."),
    h("p", null, "One point is worth stating plainly. The Welfare Footprint track ",
      "does price behavioural deprivation, and prices it as the dominant harm ",
      "of a cage: being unable to nest, forage, dustbathe, roost or move ",
      "accounts for ", h("strong", null, "75%"), " of a caged hen's ",
      "disabling-equivalent total, and deprivation of nest building alone for ",
      "three quarters of every Disabling hour in the study. How bad a cage ",
      "looks here therefore turns less on what counts than on how much it ",
      "counts for: four fifths of her painful hours are deprivation, recorded mostly ",
      "as Hurtful and Annoying, which the default ratio divides by 30 and 900. ",
      "Whether constant mild deprivation is worth that much less than acute ",
      "pain is a real disagreement, and the ratio above is where you settle ",
      "it — not a question this page has answered for you."),
    h("p", null, "Reform ranges are 90% intervals from ",
      h("span", { className: "num" }, "2,000"), " draws. Each draw picks a tier ratio ",
      "evenly on a log scale from 1x to 1000x, and one percentile of Rethink ",
      "Priorities' welfare-range distributions shared by every species — their ",
      "uncertainty is mostly about which theory of welfare is right, which moves ",
      "all species together. Between the published 5th, 50th and 95th ",
      "percentiles the distributions are interpolated linearly. Welfare ranges ",
      "you set by hand are held fixed. Uncertainty in the pain tracks themselves, ",
      "and in the fish and pig multiples, is not sampled. Insects, wild animals ",
      "and fur farming are excluded."));
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
  // The sampled intervals depend on everything but the tier ratio, so dragging
  // the tier slider re-uses them instead of re-running 2,000 draws.
  const uncertainty = useMemo(() => reformUncertainty(opts),
    [state.welfareRanges, state.multiples, state.includeShrimp, state.includeFish]);
  const reforms = useMemo(() => reformTable(weights, opts, uncertainty),
    [weights, state, uncertainty]);
  const combined = useMemo(() => combinedReformShare(weights, opts, uncertainty),
    [weights, state, uncertainty]);

  return h(Fragment, null,
    h(Hero, { total: species.total, species, countries, combined }),
    h(Section, { n: "00", kicker: "Assumptions",
                 heading: "The two things you can change" },
      h("button", { onClick: reset, style: { marginBottom: ".8rem", cursor: "pointer",
          fontFamily: "var(--mono)", fontSize: ".8rem", padding: ".4rem .8rem",
          borderRadius: ".3rem", border: "1px solid var(--rule)",
          background: "none", color: "var(--warm)" } }, "Reset assumptions"),
      h("h3", { style: { fontFamily: "var(--disp)", fontSize: "1.15rem", fontWeight: 600,
                         margin: "1rem 0 .4rem" } }, "How pain intensities compare"),
      // The total swings 35x across the plausible range of r, so this control
      // opens the assumptions rather than sitting below the worked example.
      h(TierControl, { state, set }),
      h(WorkedHen, { weights }),
      h(SpeciesAssumptions, { state, set, rows: species.rows })),
    h(SpeciesSection, { species, state, set }),
    h(CountrySection, { countries, state, set }),
    h(ReformSection, { reforms }),
    h(BottomLine, { combined, species, reforms }),
    h(Provenance, { anchor: anchorFraction(weights), species }));
}

function Summary({ species, countries, combined }) {
  const top = (rows, total, n) => rows
    .filter(r => r.name !== "Other countries").slice(0, n)
    .map(r => ({ name: r.name, share: shareOf(r.painYears, total) }));
  const co = top(countries.rows, countries.total, 3);
  const label = text => h("div", { className: "num", style: { fontSize: ".68rem",
      letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)",
      marginBottom: ".3rem" } }, text);
  const col = (title, items, note) => h("div", { style: { flex: "1 1 12rem" } },
    label(title),
    ...items.map(i => h("div", { key: i.name, style: { display: "flex",
        justifyContent: "space-between", gap: ".6rem", fontSize: ".92rem" } },
      h("span", null, i.name),
      h("strong", { className: "num" }, formatPercent(i.share, 0)))),
    note ? h("div", { style: { fontSize: ".72rem", color: "var(--muted)",
                               marginTop: ".2rem" } }, note) : null);
  return h("div", { className: "panel", style: { display: "flex", flexWrap: "wrap",
      gap: "1.2rem 2rem", marginBlock: "1.2rem" } },
    col("Biggest countries", co, "excludes shrimp, which has no country split"),
    h("div", { style: { flex: "1 1 12rem" } },
      label("Reforms, fully implemented"),
      h("div", { className: "num", style: { fontSize: "1.6rem", fontWeight: 700,
                                            color: "var(--warm)", lineHeight: 1.1 } },
        formatPercent(combined.value, 0)),
      h("div", { style: { fontSize: ".8rem", color: "var(--muted)" } },
        "of the total removed (90% range " + formatPercent(combined.min, 0) + "–" +
        formatPercent(combined.max, 0) + ")")));
}

function SpeciesStack({ species }) {
  const byKey = Object.fromEntries(species.rows.map(r => [r.key, r]));
  const others = species.rows.filter(r => !HUED_SPECIES.includes(r.key));
  const otherValue = others.reduce((a, r) => a + r.painYears, 0);
  const share = v => formatPercent(shareOf(v, species.total), 0);
  // Fixed species order, not size order: adjacency is what the colour-blind
  // check was run on, and a slider must not repaint or reshuffle the stack.
  const segments = [
    ...HUED_SPECIES.filter(k => byKey[k]).map(k => ({
      key: k, name: byKey[k].name, value: byKey[k].painYears, color: speciesColor(k),
      detail: byKey[k].name + " · " + share(byKey[k].painYears) + " · " +
              formatPainYears(byKey[k].painYears) + " pain years" })),
    { key: "other", name: others.map(r => r.name.split(" ")[0]).join(", "),
      value: otherValue, color: speciesColor("other"),
      detail: others.map(r => r.name).join(", ") + " · " + share(otherValue) },
  ];
  return h("div", { style: { margin: "1.4rem 0 1.2rem" } },
    h(StackBar, { segments, total: species.total,
                  label: "Share of the total by species: " +
                    segments.map(x => x.name + " " + share(x.value)).join(", ") },
      h(Legend, { items: segments.map(x => ({ key: x.key, name: x.name,
                                              color: x.color, value: share(x.value) })) })));
}

function Hero({ total, species, countries, combined }) {
  return h("header", { style: { paddingTop: "3.5rem" } },
    h("div", { className: "num", style: { fontSize: ".7rem", letterSpacing: ".2em",
        textTransform: "uppercase", color: "var(--accent)", marginBottom: "1rem" } },
      "The scale of farmed-animal suffering"),
    h("h1", null,
      "Farmed animals endure ",
      h("span", { style: { color: "var(--accent)" } }, formatPainYears(total)),
      " welfare-adjusted pain years, every year."),
    h(SpeciesStack, { species }),
    h("p", { style: { color: "var(--muted)", maxWidth: "38rem" } },
      "One welfare-adjusted pain year is one year of disabling-level pain at ",
      "human-equivalent intensity. Every figure below comes from one line: ",
      h("strong", { style: { color: "var(--ink)" } },
        "animals alive x intensity-weighted hours of pain x welfare range"),
      ". Change either assumption and the whole page re-settles."),
    h(Summary, { species, countries, combined }));
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
