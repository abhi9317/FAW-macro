# The scale of farmed-animal suffering

An interactive page estimating how much suffering farmed animals experience
each year, and how much welfare reforms reduce it — where the reader sets the
two assumptions that drive the answer: species welfare ranges, and how pain
intensities trade off against each other.

**Live:** https://abhi9317.github.io/FAW-macro/

## Running locally

ES modules need a server; opening the file directly will not work.

```bash
python3 -m http.server 8127
```

Then open http://localhost:8127/

## Tests

```bash
node --test
```

The model (`model.js`) is pure arithmetic with no DOM access, tested against
the figures in `docs/superpowers/specs/`.

## Files

| File | Contents |
|---|---|
| `index.html` | Shell, styles, theme tokens |
| `data.js` | Generated constants — do not edit by hand |
| `model.js` | The engine |
| `ui.js` | React rendering |
| `scripts/extract_data.py` | Regenerates `data.js` |

## Refreshing the data

```bash
pip install openpyxl
python3 scripts/extract_data.py
node --test
```

Sources are pinned in `data/`. Re-download them first if the upstream sheets
have changed.

## Deploying

Settings → Pages → Source: "Deploy from a branch" → `main` / `/ (root)`.
