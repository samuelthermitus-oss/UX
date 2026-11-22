# Builds every app icon, splash screen and the in-app logo from assets/logo-source.png (the SecPrep logo).
# Usage: python3 scripts/icons-from-logo.py   then: npm run assets
from PIL import Image, ImageDraw, ImageOps
import os
root = os.path.join(os.path.dirname(__file__), "..")
P = lambda *p: os.path.join(root, *p)
src = Image.open(P("assets", "logo-source.png")).convert("RGB")
w, h = src.size

# 1) Trim the white frame: find the rounded square's edges along the middle row and column.
def first_dark(line):
    for i, (r, g, b) in enumerate(line):
        if r + g + b < 380: return i
    return 0
px = src.load()
row = [px[x, h // 2] for x in range(w)]; col = [px[w // 2, y] for y in range(h)]
l, r = first_dark(row), w - 1 - first_dark(row[::-1]); t, b = first_dark(col), h - 1 - first_dark(col[::-1])
logo = src.crop((l, t, r + 1, b + 1)).resize((1024, 1024), Image.LANCZOS)
navy = logo.getpixel((512, 1000))  # background navy near the bottom center

# 2) Rounded-square mask from the logo itself (everything that is not near-white outside the shape).
mask = Image.new("L", logo.size, 255); lp = logo.load(); mp = mask.load()
for (sx, sy) in [(0, 0), (1023, 0), (0, 1023), (1023, 1023)]:
    stack = [(sx, sy)]; seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < 1024 and 0 <= y < 1024): continue
        seen.add((x, y)); r_, g_, b_ = lp[x, y]
        if r_ + g_ + b_ < 600: continue
        mp[x, y] = 0; stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
rounded = logo.convert("RGBA"); rounded.putalpha(mask)

# 3) Full-bleed icon: corners filled with the logo's navy (iOS and Android apply their own shape).
full = Image.new("RGB", (1024, 1024), navy); full.paste(logo, (0, 0), mask)
full.save(P("assets", "icon-only.png")); full.save(P("assets", "icon-dark.png"))
ImageOps.grayscale(full).convert("RGB").save(P("assets", "icon-tinted.png"))
Image.new("RGB", (1024, 1024), navy).save(P("assets", "icon-background.png"))
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)); small = rounded.resize((640, 640), Image.LANCZOS); fg.paste(small, (192, 192), small)
fg.save(P("assets", "icon-foreground.png"))

# 4) Splash screens (light: logo navy, dark: near-black) with the rounded logo in the middle.
for name, bg in [("splash.png", navy), ("splash-dark.png", (5, 10, 28))]:
    s = Image.new("RGB", (2732, 2732), bg); lg = rounded.resize((820, 820), Image.LANCZOS); s.paste(lg, (956, 956), lg); s.save(P("assets", name))

# 5) In-app logo (transparent corners).
os.makedirs(P("www", "img"), exist_ok=True); rounded.resize((512, 512), Image.LANCZOS).save(P("www", "img", "logo.png"))
print("icons, splash screens and www/img/logo.png written from logo-source.png")
