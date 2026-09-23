// Prints the default-settings figures the social card shows, as JSON.
// Used by scripts/make_og.py; rerun both after the data or model change.
import { tierWeights, speciesTotals, combinedReformShare, formatPainYears } from "../model.js";
const w = tierWeights({ ladder: 30 });
const s = speciesTotals(w);
const c = combinedReformShare(w);
console.log(JSON.stringify({
  total: formatPainYears(s.total),
  species: s.rows.map(r => ({ key: r.key, name: r.name, share: r.painYears / s.total })),
  combined: c.value, min: c.min, max: c.max,
}));
