#!/usr/bin/env python3
"""Generates the PWA raster icons from the Termini.ks mark.

The mark is simple geometry (four rounded squares in a 64-unit viewBox — see
public/favicon.svg and src/components/Logo.tsx), so it is drawn directly at
each target resolution rather than rasterising the SVG. That keeps every size
crisp instead of resampling one bitmap down.

Run:  python3 scripts/generate-pwa-icons.py
Output: public/icons/*.png, public/favicon.ico

Sizing rationale
----------------
"any" icons        mark ink ~76% of canvas — displayed essentially as-is.
"maskable" icon    mark ink ~55% of canvas. Android's safe zone is a centred
                   circle of diameter 80% of the canvas; the largest square
                   that fits inside it has a side of 0.8/sqrt(2) ~= 56.6% of
                   the canvas. Staying at 55% keeps the whole mark inside the
                   safe zone under a circular *or* squircle mask.
apple-touch-icon   mark ink ~68%. iOS applies its own superellipse mask and
                   ignores transparency, so the canvas is painted opaque.
"""

from pathlib import Path

from PIL import Image, ImageDraw

TEAL = "#0f6e62"  # --primary
GOLD = "#f2a900"  # --gold, the "booked" quadrant
BACKGROUND = "#ffffff"  # matches manifest background_color

# The mark in its native 64-unit viewBox: (x, y, w, h, fill), corner radius 8.
VIEWBOX = 64.0
SQUARES = [
    (3, 3, 26, 26, TEAL),
    (3, 35, 26, 26, TEAL),
    (35, 35, 26, 26, TEAL),
    (35, 3, 26, 26, GOLD),
]
CORNER_RADIUS = 8
# The drawn ink spans units 3..61, i.e. 58 of the 64 viewBox units.
INK_SPAN = 58.0

SUPERSAMPLE = 4

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"
FAVICON_PATH = Path(__file__).resolve().parent.parent / "public" / "favicon.ico"


def render(size: int, ink_fraction: float, background: str | None) -> Image.Image:
    """Draws the mark at `size` px with its ink occupying `ink_fraction` of the canvas."""
    hi = size * SUPERSAMPLE
    mode = "RGB" if background else "RGBA"
    fill = background if background else (0, 0, 0, 0)
    img = Image.new(mode, (hi, hi), fill)
    draw = ImageDraw.Draw(img)

    # Scale so the *ink* (58 units), not the full viewBox, hits the target fraction.
    scale = (ink_fraction * hi) / INK_SPAN
    drawn_span = INK_SPAN * scale
    # Offset so the ink block is centred: the ink starts 3 units into the viewBox.
    origin = (hi - drawn_span) / 2.0 - 3 * scale

    for x, y, w, h, colour in SQUARES:
        x0 = origin + x * scale
        y0 = origin + y * scale
        draw.rounded_rectangle(
            [(x0, y0), (x0 + w * scale, y0 + h * scale)],
            radius=CORNER_RADIUS * scale,
            fill=colour,
        )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    targets = [
        # (filename, size, ink fraction, background)
        ("icon-192.png", 192, 0.76, BACKGROUND),
        ("icon-512.png", 512, 0.76, BACKGROUND),
        # Extra breathing room so a circular/squircle mask never bites the mark.
        ("icon-512-maskable.png", 512, 0.55, BACKGROUND),
        ("icon-192-maskable.png", 192, 0.55, BACKGROUND),
        # iOS ignores the manifest and composites on black if transparent.
        ("apple-touch-icon.png", 180, 0.68, BACKGROUND),
    ]

    for name, size, ink, background in targets:
        img = render(size, ink, background)
        img.save(OUT_DIR / name, "PNG", optimize=True)
        print(f"wrote {OUT_DIR / name}  ({size}x{size}, ink {ink:.0%})")

    # Multi-resolution .ico for legacy browser chrome / bookmarks.
    ico_sizes = [16, 32, 48]
    base = render(64, 0.86, BACKGROUND)
    base.save(FAVICON_PATH, "ICO", sizes=[(s, s) for s in ico_sizes])
    print(f"wrote {FAVICON_PATH}  ({', '.join(f'{s}x{s}' for s in ico_sizes)})")


if __name__ == "__main__":
    main()
