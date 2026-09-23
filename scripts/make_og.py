#!/usr/bin/env python3
"""Draw og.png, the 1200x630 social-card image, at default settings.
Run: node scripts/og_figures.mjs | python3 scripts/make_og.py
Needs Pillow and macOS's bundled Avenir Next."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
fig = json.load(sys.stdin)
W, H, PAD = 1200, 630, 72
INK, TEXT, MUTED, ACCENT = "#09201f", "#d3d9d4", "#9aa5a0", "#7fb398"
# Dark-mode species colours from index.html; the three smallest share grey.
COL = {"fish": "#3987e5", "broilers": "#d95926", "layers": "#199e70",
       "shrimp": "#c98500", "pigs": "#d55181", "ducks": "#008300"}
OTHER = "#6f7b77"
AV = "/System/Library/Fonts/Avenir Next.ttc"
font = lambda size, idx: ImageFont.truetype(AV, size, index=idx)
DEMI, MED, REG = 2, 5, 7

img = Image.new("RGB", (W, H), INK)
d = ImageDraw.Draw(img)
d.text((PAD, PAD), "The scale of farmed-animal suffering", font=font(26, DEMI), fill=ACCENT)

# Headline, wrapped by hand: the total is the one coloured word.
hf = font(66, DEMI)
y = PAD + 58
parts = [("Farmed animals endure ", TEXT), (fig["total"], ACCENT)]
x = PAD
for t, c in parts:
    d.text((x, y), t, font=hf, fill=c); x += d.textlength(t, font=hf)
d.text((PAD, y + 80), "welfare-adjusted pain years,", font=hf, fill=TEXT)
d.text((PAD, y + 160), "every year.", font=hf, fill=TEXT)

# Species stack, fixed order, 3px gaps; last segment rounded at the far end.
order = ["fish", "broilers", "layers", "shrimp", "pigs", "ducks"]
share = {s["key"]: s["share"] for s in fig["species"]}
segs = [(k, share[k], COL[k]) for k in order if k in share]
segs.append(("other", 1 - sum(v for _, v, _ in segs), OTHER))
bx, by, bw, bh, gap = PAD, 420, W - 2 * PAD, 34, 3
usable = bw - gap * (len(segs) - 1)
x = bx
for i, (k, v, c) in enumerate(segs):
    w = max(2, round(v * usable))
    if i == len(segs) - 1:
        w = bx + bw - x
        d.rounded_rectangle([x, by, x + w, by + bh], radius=6, fill=c)
        d.rectangle([x, by, x + 6, by + bh], fill=c)
    else:
        d.rectangle([x, by, x + w, by + bh], fill=c)
    x += w + gap

# Legend for the three biggest; the rest are on the page.
lf = font(24, MED)
top = sorted(fig["species"], key=lambda s: -s["share"])[:3]
x = PAD
for s in top:
    d.rounded_rectangle([x, by + 58, x + 18, by + 76], radius=3, fill=COL.get(s["key"], OTHER))
    label = f'{s["name"]} {round(s["share"] * 100)}%'
    d.text((x + 28, by + 50), label, font=lf, fill=TEXT)
    x += 28 + d.textlength(label, font=lf) + 36

pct = lambda v: f"{round(v * 100)}%"
d.text((PAD, H - PAD - 26),
       f"Today's welfare reforms, fully implemented, would remove {pct(fig['combined'])} "
       f"(90% range {pct(fig['min'])}–{pct(fig['max'])}).",
       font=font(24, REG), fill=MUTED)
img.save(ROOT / "og.png", optimize=True)
print("wrote", ROOT / "og.png")
