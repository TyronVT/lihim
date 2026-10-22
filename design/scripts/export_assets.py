#!/usr/bin/env python3
"""Export every Lihim brand asset from design/source/icons.png.

Run from anywhere:  python3 -I design/scripts/export_assets.py

Everything is derived from two inputs so the exports stay reproducible:
  * design/source/icons.png  -- the 2x2 illustrated icon sheet (Mark, Verified, Poll, Group)
  * the Glyph geometry below -- a hand-drawn flat silhouette traced from the Mark

Requires Pillow (with WebP + FreeType) and numpy. No network access.
"""

from __future__ import annotations

import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "design" / "source" / "icons.png"
FONTS = ROOT / "design" / "fonts"
WEB = ROOT / "apps" / "web"
APP = WEB / "app"
PUBLIC = WEB / "public"

INK_950 = (0x0A, 0x0B, 0x0D)
INK_600 = (0x64, 0x65, 0x6A)
INK_300 = (0xB5, 0xB4, 0xB8)
TEXT_1 = (0xEC, 0xEC, 0xEE)
TEXT_2 = (0xA3, 0xA3, 0xA8)

# Figure bounding boxes in the 1254x1254 sheet, measured as pixels brighter than the
# background (bg max channel <= 15, std ~0.5). Inclusive (x0, y0, x1, y1).
FIGURES = {
    "mark": (190, 188, 528, 556),
    "verified": (746, 206, 1034, 534),
    "poll": (210, 711, 512, 1054),
    "group": (725, 694, 1053, 1054),
}

# Background is near-black; anything at or below this (max channel) counts as bg
# for the flood fill. Edge pixels between BG_LO and BG_HI get a partial alpha ramp.
BG_LO, BG_HI = 15, 30
# Flood-fill ceiling per figure. It sits above the bg grain (max 15). Group also needs
# to swallow the faint contact shadows (lum 17-24) drawn in the head/body gaps; the
# others can't go that high because their shadow sides fade to ~20 at the rim.
PASSABLE_MAX = {"mark": 18, "verified": 18, "poll": 18, "group": 24}
BG_RGB = (10.1, 11.0, 12.5)  # mean of the sheet's empty corners
EDGE_BAND = 2  # px either side of the flood-fill boundary treated as anti-aliased rim


def _shifts(r: int):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy * dy + dx * dx <= r * r and (dy or dx):
                yield dy, dx


def _dilate(mask: np.ndarray, r: int) -> np.ndarray:
    out = mask.copy()
    for dy, dx in _shifts(r):
        out |= np.roll(mask, (dy, dx), axis=(0, 1))
    return out


def _erode(mask: np.ndarray, r: int) -> np.ndarray:
    return ~_dilate(~mask, r)


def _components(mask: np.ndarray):
    """4-connected components of mask, yielded as (ys, xs) index arrays."""
    seen = np.zeros_like(mask)
    h, w = mask.shape
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]:
            continue
        seen[sy, sx] = True
        q = deque([(sy, sx)])
        ys, xs = [], []
        while q:
            y, x = q.popleft()
            ys.append(y)
            xs.append(x)
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        yield np.array(ys), np.array(xs)


def _propagate(rgb: np.ndarray, known: np.ndarray, steps: int) -> np.ndarray:
    """Fill unknown pixels with the mean colour of known neighbours, growing outward."""
    col = np.where(known[..., None], rgb, 0.0)
    have = known.copy()
    for _ in range(steps):
        acc = np.zeros_like(col)
        cnt = np.zeros(have.shape, dtype=np.float32)
        for dy, dx in _shifts(1):
            acc += np.roll(np.where(have[..., None], col, 0.0), (dy, dx), axis=(0, 1))
            cnt += np.roll(have, (dy, dx), axis=(0, 1))
        grow = ~have & (cnt > 0)
        col[grow] = acc[grow] / cnt[grow][:, None]
        have |= grow
    return col


# --------------------------------------------------------------------------- #
# Illustration extraction
# --------------------------------------------------------------------------- #

def extract_figure(sheet: Image.Image, name: str, pad: int = 24) -> tuple[Image.Image, tuple[float, float, int]]:
    """Cut one figure out of the sheet with a transparent background.

    The background is removed by flood-filling from the crop border only, so dark
    regions *enclosed* by the figure (the Mark's face void, the shield's star, the
    ballot slot) stay opaque ink instead of punching holes through the art.
    Returns the RGBA crop and (bbox centre x, bbox centre y, bbox height) in crop coords.
    """
    x0, y0, x1, y1 = FIGURES[name]
    box = (x0 - pad, y0 - pad, x1 + 1 + pad, y1 + 1 + pad)
    rgb = np.asarray(sheet.crop(box).convert("RGB"))
    lum = rgb.max(axis=2).astype(np.int16)
    h, w = lum.shape

    passable = lum <= PASSABLE_MAX[name]
    outside = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x] and not outside[y, x]:
                outside[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x] and not outside[y, x]:
                outside[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and passable[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                q.append((ny, nx))

    # Tiny bg pockets pinched off right at the silhouette (e.g. where a head nearly
    # touches a body in Group) are background, not designed voids; release them so
    # they don't show as dark specks on light tiles. Real voids are hundreds of px.
    near_outside = _dilate(outside, EDGE_BAND + 2)
    for comp in _components(passable & ~outside):
        if len(comp[0]) < 100 and near_outside[comp].any():
            outside[comp] = True

    # The art's anti-aliased rim is a mix of figure colour and the near-black bg. Left
    # as-is it becomes a dark halo on anything lighter than ink-950, so un-mix it:
    # estimate the pure figure colour F from the solid core just inside the rim, then
    # alpha = projection of (pixel - bg) onto (F - bg).
    interior = ~outside
    core = _erode(interior, EDGE_BAND)
    band = _dilate(interior, EDGE_BAND) & ~core
    f = rgb.astype(np.float32)
    fig_col = _propagate(f, core, 2 * EDGE_BAND + 1)
    bg = np.array(BG_RGB, dtype=np.float32)
    diff = fig_col - bg
    denom = (diff**2).sum(axis=2)
    unmixed = np.clip(((f - bg) * diff).sum(axis=2) / np.maximum(denom, 1.0), 0.0, 1.0)
    # Where the figure itself is nearly bg-dark (deep shadow sides) the projection is
    # meaningless; fall back to a brightness ramp there.
    ramp = np.clip((lum - BG_LO) / (BG_HI - BG_LO), 0.0, 1.0)
    edge_alpha = np.where(denom > 15.0**2, unmixed, np.where(interior, 1.0, ramp))

    alpha = np.where(core, 1.0, np.where(band, edge_alpha, 0.0))
    # Slight feather on the rim only; the solid interior and enclosed voids stay opaque.
    soft = np.asarray(Image.fromarray((alpha * 255).round().astype(np.uint8), "L")
                      .filter(ImageFilter.GaussianBlur(0.5))).astype(np.float32) / 255
    alpha = np.where(core, 1.0, np.where(band, soft, 0.0))
    colour = np.where(band[..., None], fig_col, f)

    rgba = np.dstack([colour.round().clip(0, 255).astype(np.uint8), (alpha * 255).round().astype(np.uint8)])
    cx = (x0 + x1) / 2 - box[0]
    cy = (y0 + y1) / 2 - box[1]
    return Image.fromarray(rgba, "RGBA"), (cx, cy, y1 - y0 + 1)


def scale_rgba(img: Image.Image, factor: float) -> Image.Image:
    """Resize with premultiplied alpha so transparent bg colour can't bleed into edges."""
    w, h = img.size
    size = (max(1, round(w * factor)), max(1, round(h * factor)))
    return img.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def place(fig: Image.Image, geom: tuple[float, float, int], canvas: int, height_frac: float,
          shift_up_frac: float = 0.0, bg: tuple[int, int, int] | None = INK_950,
          center: tuple[float, float] | None = None) -> Image.Image:
    """Scale a figure so its bbox height is height_frac of the canvas and centre it."""
    cx, cy, fh = geom
    k = canvas * height_frac / fh
    scaled = scale_rgba(fig, k)
    target_x, target_y = center if center else (canvas / 2, canvas / 2)
    target_y -= canvas * shift_up_frac
    ox = round(target_x - cx * k)
    oy = round(target_y - cy * k)
    base = Image.new("RGBA", (canvas, canvas), (*bg, 255) if bg else (0, 0, 0, 0))
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(scaled, (ox, oy))
    out = Image.alpha_composite(base, layer)
    return out.convert("RGB") if bg else out


# --------------------------------------------------------------------------- #
# Glyph: flat silhouette traced from the Mark, 64x64 units
# --------------------------------------------------------------------------- #
# Traced from the Mark's outline (source rows mapped at ~0.147 units/px, apex at y=5),
# then simplified: symmetric, rim widened (void narrowed ~10%) and the face-void tip
# lifted so the hood rim and cape survive at 16 px; eyes enlarged ~1.25x and tilted
# less than the illustration so they read as calm, not slanted.

Pt = tuple[float, float]
Seg = tuple[Pt, Pt, Pt]  # cubic: c1, c2, end


def _mirror(segs: list[Seg], start: Pt, axis: float = 32.0) -> list[Seg]:
    """Mirror a right-half path (start -> ... -> end on the axis) into the left half, reversed."""
    pts = [start] + [p for s in segs for p in s]
    m = [(2 * axis - x, y) for x, y in pts]
    # Reverse the cubic chain so the left half continues from the bottom back up to the top.
    rev: list[Seg] = []
    for i in range(len(segs) - 1, -1, -1):
        p0 = m[3 * i]
        c1, c2 = m[3 * i + 1], m[3 * i + 2]
        rev.append((c2, c1, p0))
    return rev


# Outer silhouette, right half: apex -> hood widest -> neck notch -> cape widest -> bottom centre.
_SIL_RIGHT_START: Pt = (32.0, 5.0)
_SIL_RIGHT: list[Seg] = [
    ((37.0, 6.0), (53.6, 18.0), (54.2, 32.0)),
    ((54.2, 35.5), (51.0, 40.0), (47.3, 41.4)),
    ((51.0, 42.5), (56.8, 46.0), (56.8, 50.8)),
    ((56.8, 56.0), (38.0, 59.2), (32.0, 59.2)),
]
SILHOUETTE = (_SIL_RIGHT_START, _SIL_RIGHT + _mirror(_SIL_RIGHT, _SIL_RIGHT_START))

# Face void: rounded hood opening on top, curved V down into the cape.
VOID = ((15.5, 32.0), [
    ((17.0, 26.0), (24.5, 22.0), (32.0, 22.0)),
    ((39.5, 22.0), (47.0, 26.0), (48.5, 32.0)),
    ((44.0, 38.0), (35.0, 47.0), (32.0, 54.5)),
    ((29.0, 47.0), (20.0, 38.0), (15.5, 32.0)),
])

EYE_W, EYE_TOP, EYE_BOTTOM, EYE_TILT_DEG = 9.0, 1.9, 2.5, 8.0
EYE_CENTRES = ((25.0, 33.0), (39.0, 33.0))


def _eye(cx: float, cy: float, tilt_deg: float) -> tuple[Pt, list[Seg]]:
    """Almond: flatter top lid, fuller lower lid, outer corner raised by tilt_deg."""
    hw = EYE_W / 2
    k = 4 / 3  # cubic control offset that puts the mid-point at the requested bulge
    local = [(-hw, 0.0),
             (-hw / 2, -EYE_TOP * k), (hw / 2, -EYE_TOP * k), (hw, 0.0),
             (hw / 2, EYE_BOTTOM * k), (-hw / 2, EYE_BOTTOM * k), (-hw, 0.0)]
    t = math.radians(tilt_deg)
    pts = [(cx + x * math.cos(t) - y * math.sin(t), cy + x * math.sin(t) + y * math.cos(t)) for x, y in local]
    return pts[0], [(pts[1], pts[2], pts[3]), (pts[4], pts[5], pts[6])]


EYES = [_eye(*EYE_CENTRES[0], EYE_TILT_DEG), _eye(*EYE_CENTRES[1], -EYE_TILT_DEG)]


def _d(path: tuple[Pt, list[Seg]]) -> str:
    f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
    start, segs = path
    out = [f"M{f(start[0])} {f(start[1])}"]
    for (a, b, c) in segs:
        out.append(f"C{f(a[0])} {f(a[1])} {f(b[0])} {f(b[1])} {f(c[0])} {f(c[1])}")
    return "".join(out) + "Z"


def _hex(c: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*c)


def glyph_svg() -> str:
    eyes = "".join(_d(e) for e in EYES)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n'
        f'  <rect width="64" height="64" fill="{_hex(INK_950)}"/>\n'
        f'  <path fill="{_hex(INK_600)}" d="{_d(SILHOUETTE)}"/>\n'
        f'  <path fill="{_hex(INK_950)}" d="{_d(VOID)}"/>\n'
        f'  <path fill="{_hex(INK_300)}" d="{eyes}"/>\n'
        "</svg>\n"
    )


def glyph_mono_svg() -> str:
    # evenodd: silhouette filled, face void cut out, eyes left standing inside the void.
    d = _d(SILHOUETTE) + _d(VOID) + "".join(_d(e) for e in EYES)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n'
        f'  <path fill="#FFFFFF" fill-rule="evenodd" d="{d}"/>\n'
        "</svg>\n"
    )


def _flatten(path: tuple[Pt, list[Seg]], scale: float, steps: int = 48) -> list[Pt]:
    start, segs = path
    pts = [start]
    p0 = start
    for c1, c2, p3 in segs:
        for i in range(1, steps + 1):
            t = i / steps
            mt = 1 - t
            x = mt**3 * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t**3 * p3[0]
            y = mt**3 * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t**3 * p3[1]
            pts.append((x, y))
        p0 = p3
    return [(x * scale, y * scale) for x, y in pts]


def render_glyph(size: int, mono: bool = False, ss: int = 16) -> Image.Image:
    """Rasterise the same geometry as the SVG: draw at ss x size, box-downsample."""
    big = size * ss
    s = big / 64
    if mono:
        mask = Image.new("L", (big, big), 0)
        d = ImageDraw.Draw(mask)
        d.polygon(_flatten(SILHOUETTE, s), fill=255)
        d.polygon(_flatten(VOID, s), fill=0)
        for e in EYES:
            d.polygon(_flatten(e, s), fill=255)
        alpha = mask.reduce(ss)
        out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
        out.putalpha(alpha)
        return out
    img = Image.new("RGB", (big, big), INK_950)
    d = ImageDraw.Draw(img)
    d.polygon(_flatten(SILHOUETTE, s), fill=INK_600)
    d.polygon(_flatten(VOID, s), fill=INK_950)
    for e in EYES:
        d.polygon(_flatten(e, s), fill=INK_300)
    return img.reduce(ss)


# --------------------------------------------------------------------------- #
# OG image, grain
# --------------------------------------------------------------------------- #

def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = FONTS / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    # Fallback keeps the script runnable without the bundled Geist; output will differ.
    print(f"  ! {path.name} missing, falling back to Helvetica")
    return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)


def _draw_tracked(draw: ImageDraw.ImageDraw, xy: Pt, text: str, font: ImageFont.FreeTypeFont,
                  fill: tuple[int, int, int], tracking_em: float) -> float:
    """Draw text with letter-spacing (Pillow has none). Pair widths keep kern-table kerning."""
    x, y = xy
    extra = tracking_em * font.size
    for i, ch in enumerate(text):
        draw.text((x, y), ch, font=font, fill=fill, anchor="ls")
        if i + 1 < len(text):
            x += font.getlength(text[i:i + 2]) - font.getlength(text[i + 1]) + extra
        else:
            x += font.getlength(ch)
    return x


def _ink_left(font: ImageFont.FreeTypeFont, ch: str) -> int:
    """Left side bearing in px, measured from a render (Pillow's getbbox clamps it to 0)."""
    pad = font.size
    probe = Image.new("L", (font.size * 3, font.size * 3), 0)
    ImageDraw.Draw(probe).text((pad, 2 * pad), ch, font=font, fill=255, anchor="ls")
    return probe.getbbox()[0] - pad


def tracked_width(text: str, font: ImageFont.FreeTypeFont, tracking_em: float) -> float:
    return font.getlength(text) + tracking_em * font.size * (len(text) - 1)


def make_og(mark: Image.Image, geom: tuple[float, float, int]) -> Image.Image:
    W, H = 1200, 630
    mark_h = 330
    # Lockup rules (design spec, Wordmark): gap = 0.4 x Mark height, cap height ~= 40% of Mark height.
    gap = round(0.4 * mark_h)
    word = _font("Geist-SemiBold.ttf", 100)
    cap_ratio = (word.getbbox("H", anchor="ls")[3] - word.getbbox("H", anchor="ls")[1]) / 100
    word = _font("Geist-SemiBold.ttf", round(0.4 * mark_h / cap_ratio))
    tag = _font("Geist-Regular.ttf", 40)
    tracking = -0.015
    lines = ["Prove you belong.", "Never say who you are."]

    cx, cy, fh = geom
    k = mark_h / fh
    mark_w = (FIGURES["mark"][2] - FIGURES["mark"][0] + 1) * k
    word_w = tracked_width("Lihim", word, tracking)
    text_w = max(word_w, *(tag.getlength(t) for t in lines))
    total = mark_w + gap + text_w
    left = (W - total) / 2

    # Mark: centred vertically with the usual ~3% optical lift.
    img = Image.new("RGBA", (W, H), (*INK_950, 255))
    scaled = scale_rgba(mark, k)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    mark_cx = left + mark_w / 2
    mark_cy = H / 2 - 0.03 * mark_h
    layer.paste(scaled, (round(mark_cx - cx * k), round(mark_cy - cy * k)))
    img = Image.alpha_composite(img, layer).convert("RGB")

    # Text block (cap height + gap + two tagline lines) centred on the Mark's centre line.
    draw = ImageDraw.Draw(img)
    cap_h = 0.4 * mark_h
    line_gap = 56
    tag_block = 40 + line_gap * (len(lines) - 1)
    first_gap = 64
    block_h = cap_h + first_gap + tag_block
    top = mark_cy - block_h / 2
    tx = left + mark_w + gap
    # Cancel each font's left side bearing so the L stem and tagline share one edge.
    _draw_tracked(draw, (tx - _ink_left(word, "L"), top + cap_h), "Lihim", word, TEXT_1, tracking)
    for i, line in enumerate(lines):
        lsb = _ink_left(tag, line[0])
        draw.text((tx - lsb, top + cap_h + first_gap + 30 + i * line_gap), line, font=tag, fill=TEXT_2, anchor="ls")
    return img


def make_grain(size: int = 128, seed: int = 1307) -> Image.Image:
    """Tileable white alpha-noise. Independent per-pixel noise tiles seamlessly by construction.

    Three alpha levels in a 2-bit palette keep it well under 4 KB; at the intended 3%
    layer opacity the quantisation is invisible.
    """
    rng = np.random.default_rng(seed)
    idx = rng.choice(3, size=(size, size), p=[0.6, 0.25, 0.15]).astype(np.uint8)
    img = Image.fromarray(idx, "P")
    img.putpalette([255, 255, 255] * 3)
    img.info["transparency"] = bytes([0, 128, 255])
    return img


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main() -> None:
    sheet = Image.open(SOURCE)
    assert sheet.size == (1254, 1254), f"unexpected source size {sheet.size}"
    for d in (APP, PUBLIC / "icons", PUBLIC / "illustrations", ROOT / "design" / "source"):
        d.mkdir(parents=True, exist_ok=True)

    figs = {name: extract_figure(sheet, name) for name in FIGURES}
    mark, mgeom = figs["mark"]

    # App icons: full Mark, opaque ink-950, ~64% height, lifted ~3% (cape base reads low).
    place(mark, mgeom, 180, 0.64, 0.03).save(APP / "apple-icon.png", optimize=True)
    place(mark, mgeom, 192, 0.64, 0.03).save(PUBLIC / "icons" / "icon-192.png", optimize=True)
    place(mark, mgeom, 512, 0.64, 0.03).save(PUBLIC / "icons" / "icon-512.png", optimize=True)
    # Maskable: 52% so the whole figure stays inside the central 80% circle / 66dp safe zone.
    place(mark, mgeom, 512, 0.52, 0.03).save(PUBLIC / "icons" / "maskable-512.png", optimize=True)

    # Hero illustrations: one shared scale for all four so their relative sizes match the
    # sheet (the tallest figure fills 90% of the tile); transparent, grain kept.
    tallest = max(g[2] for _, g in figs.values())
    for name, (fig, geom) in figs.items():
        for mult in (2, 3):
            px = 160 * mult
            frac = 0.90 * geom[2] / tallest
            out = place(fig, geom, px, frac, 0.0, bg=None)
            out.save(PUBLIC / "illustrations" / f"{name}@{mult}x.webp", quality=90, method=6, alpha_quality=100)

    # Glyph: SVG is what browsers use; ICO/badge are rasterised from the identical geometry.
    (APP / "icon.svg").write_text(glyph_svg())
    (ROOT / "design" / "source" / "glyph-mono.svg").write_text(glyph_mono_svg())
    # Next.js decodes ICO frames as PNG and requires RGBA; an opaque RGB frame fails the build.
    ico = [render_glyph(s).convert("RGBA") for s in (16, 32, 48)]
    ico[2].save(APP / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
    render_glyph(96, mono=True).save(PUBLIC / "icons" / "badge-96.png", optimize=True)

    make_og(mark, mgeom).save(PUBLIC / "og.png", optimize=True)
    make_grain().save(PUBLIC / "grain.png", optimize=True, bits=2)

    for p in sorted([APP / "apple-icon.png", APP / "icon.svg", APP / "favicon.ico", PUBLIC / "og.png",
                     PUBLIC / "grain.png", ROOT / "design" / "source" / "glyph-mono.svg",
                     *sorted((PUBLIC / "icons").glob("*.png")), *sorted((PUBLIC / "illustrations").glob("*.webp"))]):
        print(f"  {p.relative_to(ROOT)}  {p.stat().st_size:,} B")


if __name__ == "__main__":
    main()
