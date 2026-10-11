#!/usr/bin/env python3
"""Redraw the WW2 Battle Odds die icon at 1024x1024 (opaque RGB, no alpha)
for the iOS app icon. Geometry matches icons/icon-512.png, scaled 2x.

Usage: python3 ios/scripts/make_app_icon.py [output.png]
"""
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else "ios/WW2BattleOdds/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
SIZE, SS = 1024, 4                    # final size, supersampling factor
S = SIZE * SS
k = S / 512.0                         # source icon is 512px

RED, BLUE = (184, 65, 47), (47, 111, 184)
DARK, FACE = (20, 23, 28), (244, 241, 234)

img = Image.new("RGB", (S, S), BLUE)
d = ImageDraw.Draw(img)
d.polygon([(0, 0), (S, 0), (0, S)], fill=RED)          # red top-left half

x0, x1 = 122.5 * k, 389.5 * k                          # die outer edge
border, radius = 10 * k, 38 * k
d.rounded_rectangle([x0, x0, x1, x1], radius=radius, fill=DARK)
d.rounded_rectangle([x0 + border, x0 + border, x1 - border, x1 - border],
                    radius=radius - border, fill=FACE)
r = 22.5 * k
for cx, cy in [(184, 184), (328, 184), (256, 256), (184, 328), (328, 328)]:
    d.ellipse([cx * k - r, cy * k - r, cx * k + r, cy * k + r], fill=DARK)

img = img.resize((SIZE, SIZE), Image.LANCZOS).convert("RGB")
img.save(OUT, "PNG", optimize=True)
print("wrote", OUT, img.size, img.mode)
