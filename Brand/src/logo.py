#!/usr/bin/env python3
"""Generate the Gridworks mark and wordmark, and print them as JSON.

    python3 logo.py > logo.json      # also writes ../brand/*.svg

The mark is a G built the way the game builds a factory: a run of wire between
named nodes, with a pad at every corner and a hub where the run terminates. It
is not a letterform with a circuit motif applied to it — the centreline below
IS the letter, and the letter IS the wiring diagram. That is the whole idea,
and it is why the mark survives reduction: a run of wire with pads on it is
still legible at 16 px, where an illustration of a factory would not be.

The wordmark is drawn on the same grid, by the same stroking code, from the
same nine-unit wire. Nine letters, no font: there is no geometric sans in this
pack's dependency set, and adding one would mean either a webfont fetch on a
game that boots offline or a licence to track. Constructing the letters costs
more to author and removes the question entirely.

Every glyph is a list of named points. Each point is one line, each is
adjustable on its own, and the framing normalises itself from the exact
bounding box of the built geometry — so moving a point cannot silently
decentre the mark or clip it in any downstream asset.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grid import Shape  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "brand")

# ---------------------------------------------------------------- the mark
#
# Drawn in a nominal 100-unit square and then normalised from its own extrema.
# The ring is a chamfered octagon: 45 degree corners rather than curves,
# because every wire the player draws in the game is orthogonal or diagonal and
# a circular logo would be the one round thing in the entire system.
MARK_W = 12.0          # wire weight
MARK_PAD = 9.0         # radius of a corner pad
MARK_HUB = 13.0        # radius of the terminal hub node

#   (74,26) ....... open aperture ....... (86,50)
#      /                                     |
#  (62,14)---(38,14)                     (86,62)
#     |                                     /
#  (14,38)                            (62,86)
#     |                                   |
#  (14,62)---(38,86)-----------------(62,86)
#
# Read as a G: the ring is broken at the upper right, and the crossbar runs
# inward from the right side to the hub just past centre.
MARK_RUN = [
    (74, 26),    # open terminal — the aperture of the G
    (62, 14),    # top-right chamfer
    (38, 14),    # top-left chamfer
    (14, 38),    # left, upper
    (14, 62),    # left, lower
    (38, 86),    # bottom-left chamfer
    (62, 86),    # bottom-right chamfer
    (86, 62),    # right, lower
    (86, 50),    # the knee the crossbar turns at
    (54, 50),    # the hub — where the run terminates
]
# Pads sit on every corner but not on the open terminal: a pad there would
# close the aperture visually and the G would read as an O.
MARK_PADS = MARK_RUN[1:]

# The interior lattice is the only thing in the mark that is decoration rather
# than structure, and it is the first thing to go — see the reduction ladder.
LATTICE_STEP = 24
LATTICE_W = 2.0


def build_mark():
    """Return (wire, pads, lattice, hub) as normalised Shapes in a 100x100 box.

    `wire` is the silhouette with flush joins — that is the simple mark, and it
    is deliberately smooth. An earlier draft baked the corner pads into it, so
    the one-colour mark came out with eight bumps around its edge and read as a
    cog rather than a G at 24 px and below. The pads are worth having; they are
    just a detail layer, and detail layers are the first thing a reduction
    throws away.
    """
    wire = Shape()
    wire.run(MARK_RUN, MARK_W, cap="round")
    # The terminal hub survives into the simple mark, at a size that reads as a
    # thickened terminal rather than a bump: it is where the run ends and, in
    # the game, where everything the player builds is ultimately going.
    wire.disc(MARK_RUN[-1][0], MARK_RUN[-1][1], MARK_HUB * 0.72)

    lattice = Shape()
    for i in range(1, 100 // LATTICE_STEP + 1):
        v = i * LATTICE_STEP
        lattice.segment((v, 20), (v, 80), LATTICE_W)
        lattice.segment((20, v), (80, v), LATTICE_W)

    # Normalise from the exact extrema of wire + pads — the widest the mark
    # ever gets — so no downstream asset can clip it. The lattice is decoration
    # and is excluded on purpose: it must not influence the framing, or turning
    # it off would move the mark.
    frame = Shape()
    frame.run(MARK_RUN, MARK_W, cap="round")
    for (px, py) in MARK_PADS[:-1]:
        frame.disc(px, py, MARK_PAD)
    frame.disc(*MARK_RUN[-1], MARK_HUB)
    x0, y0, x1, y1 = frame.bbox
    span = max(x1 - x0, y1 - y0)
    k = 100.0 / span
    ox = (100 - (x1 - x0) * k) / 2 - x0 * k
    oy = (100 - (y1 - y0) * k) / 2 - y0 * k

    def norm(sh):
        return sh.scaled(k, 0, 0).translated(ox, oy)

    # Two detail layers: the pads themselves (drawn in the wire colour, so they
    # read as solder pads swelling the run) and the lit cores on top.
    pads = Shape()
    cores = Shape()
    for (px, py) in MARK_PADS[:-1]:
        pads.disc(px, py, MARK_PAD)
        cores.disc(px, py, MARK_PAD * 0.46)
    pads.disc(*MARK_RUN[-1], MARK_HUB)
    hub = ((MARK_RUN[-1][0]) * k + ox, (MARK_RUN[-1][1]) * k + oy, MARK_HUB * 0.46 * k)
    return norm(wire), norm(pads), norm(cores), norm(lattice), hub


# ------------------------------------------------------------- the wordmark
#
# Cap height 64, baseline at y = 0, so the emitted paths drop straight into a
# text layout. Nine units of wire, 13 units of chamfer, one 46-unit box per
# letter (W and I take their own widths). Same stroking code as the mark.
CAP = 64.0
T_W = 9.0                 # letter wire weight
STD = 46.0                # standard glyph advance box
INSET = T_W / 2           # 4.5 — centrelines sit half a stroke inside the box
TOP, BOT = INSET, CAP - INSET
TRACK = 15.0              # letterspacing. Wide: the wordmark is tracked OPEN
WORD_GAP = 9.0            # extra air at the GRID | WORKS colour break

L, R = INSET, STD - INSET       # 4.5, 41.5
C = 13.0                        # chamfer

GLYPHS = {
    # each entry: (advance width, [ (points, closed), ... ])
    "G": (STD, [([(35, 11), (28.5, TOP), (17.5, TOP), (L, 17.5), (L, 46.5),
                  (17.5, BOT), (28.5, BOT), (R, 46.5), (R, 34), (25, 34)], False)]),
    "R": (STD, [([(L, TOP), (L, BOT)], False),
                ([(L, TOP), (30, TOP), (R, 16), (30, 31.5), (L, 31.5)], False),
                ([(24, 31.5), (R, BOT)], False)]),
    "I": (22.0, [([(11, TOP), (11, BOT)], False)]),
    "D": (STD, [([(L, TOP), (28.5, TOP), (R, 17.5), (R, 46.5),
                  (28.5, BOT), (L, BOT)], True)]),
    "W": (62.0, [([(L, TOP), (16, BOT), (31, 26), (46, BOT), (57.5, TOP)], False)]),
    "O": (STD, [([(L, 17.5), (17.5, TOP), (28.5, TOP), (R, 17.5),
                  (R, 46.5), (28.5, BOT), (17.5, BOT), (L, 46.5)], True)]),
    "K": (STD, [([(L, TOP), (L, BOT)], False),
                ([(R, TOP), (9, 32), (R, BOT)], False)]),
    "S": (STD, [([(R, 13), (33, TOP), (13, TOP), (L, 13), (L, 24), (12, 32),
                  (34, 32), (R, 40), (R, 51), (33, BOT), (13, BOT), (L, 51)], False)]),
}


def glyph(ch, dx):
    """One letter, stroked, shifted to its place on the baseline."""
    w, runs = GLYPHS[ch]
    sh = Shape()
    for pts, closed in runs:
        sh.run(pts, T_W, closed=closed, cap="round")
    return sh.translated(dx, -CAP), w


def build_word(text):
    """Return (Shape, advance width). Letters are placed on a running advance;
    nothing is kerned by eye — the tracking is wide enough that optical pairs
    do not arise, which is the point of a tracked-open wordmark."""
    out, x = Shape(), 0.0
    for i, ch in enumerate(text):
        g, w = glyph(ch, x)
        out.extend(g)
        x += w + (TRACK if i < len(text) - 1 else 0)
    return out, x


def build_wordmark():
    grid, wgrid = build_word("GRID")
    works, wworks = build_word("WORKS")
    offset = wgrid + TRACK + WORD_GAP
    works = works.translated(offset, 0)
    whole = Shape().extend(grid).extend(works)
    return {
        "d": whole.d(),
        "grid": grid.d(),
        "works": works.d(),
        "width": offset + wworks,
        "gridWidth": wgrid,
        "worksX": offset,
        "cap": CAP,
    }


# ------------------------------------------------------------------ output
PAL = {
    "void": "#0A0C12", "cyan": "#4DD8FF", "lit": "#E8F6FF",
    "deep": "#1C6E8C", "paper": "#EEF3F8", "cyanInk": "#0A6A88",
}


def svg_mark(size, fill, simple=False, detail=None, lattice=None, bg=None, pad=0):
    g = GEO
    box = 100
    total = box + pad * 2
    s = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
         'viewBox="0 0 %d %d" role="img" aria-label="Gridworks">' % (size, size, total, total)]
    if bg:
        s.append('<rect width="%d" height="%d" fill="%s"/>' % (total, total, bg))
    s.append('<g transform="translate(%s,%s)">' % (pad, pad))
    if not simple and lattice:
        s.append('<path d="%s" fill="%s" opacity="0.55"/>' % (g["lattice"], lattice))
    if not simple:
        s.append('<path d="%s" fill="%s"/>' % (g["pads"], fill))
    s.append('<path d="%s" fill="%s"/>' % (g["wire"], fill))
    if not simple:
        s.append('<path d="%s" fill="%s"/>' % (g["cores"], detail or PAL["lit"]))
        s.append('<circle cx="%s" cy="%s" r="%s" fill="%s"/>'
                 % (g["hub"]["cx"], g["hub"]["cy"], g["hub"]["r"], detail or PAL["lit"]))
    s.append("</g></svg>")
    return "\n".join(s)


def svg_wordmark(size, grid_fill, works_fill):
    w = WORD
    k = size / CAP
    width = w["width"] * k
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%.0f" height="%.0f" '
            'viewBox="0 0 %.2f %.2f" role="img" aria-label="Gridworks">'
            '<g transform="translate(0,%.2f) scale(%.4f)">'
            '<path d="%s" fill="%s"/><path d="%s" fill="%s"/></g></svg>'
            % (width, size * 1.02, width, size * 1.02, size, k,
               w["grid"], grid_fill, w["works"], works_fill))


def svg_lockup(size, grid_fill, works_fill, mark_fill, simple=False, detail=None,
               stacked=False):
    """size is the cap height of the wordmark; the mark is set to 1.55x that,
    which puts the mark's optical weight level with the letters."""
    ms = size * 1.55
    gap = size * 0.42
    k = size / CAP
    ww = WORD["width"] * k
    g = GEO
    def markg(x, y, s_):
        out = ['<g transform="translate(%.2f,%.2f) scale(%.4f)">' % (x, y, s_ / 100.0)]
        if not simple:
            out.append('<path d="%s" fill="%s"/>' % (g["pads"], mark_fill))
        out.append('<path d="%s" fill="%s"/>' % (g["wire"], mark_fill))
        if not simple:
            out.append('<path d="%s" fill="%s"/>' % (g["cores"], detail or PAL["lit"]))
            out.append('<circle cx="%s" cy="%s" r="%s" fill="%s"/>'
                       % (g["hub"]["cx"], g["hub"]["cy"], g["hub"]["r"], detail or PAL["lit"]))
        return "".join(out) + "</g>"

    if stacked:
        w = max(ms, ww)
        h = ms + gap * 1.1 + size
        body = (markg((w - ms) / 2, 0, ms)
                + '<g transform="translate(%.2f,%.2f) scale(%.4f)">'
                  '<path d="%s" fill="%s"/><path d="%s" fill="%s"/></g>'
                  % ((w - ww) / 2, ms + gap * 1.1 + size, k,
                     WORD["grid"], grid_fill, WORD["works"], works_fill))
    else:
        w = ms + gap + ww
        h = ms
        body = (markg(0, 0, ms)
                + '<g transform="translate(%.2f,%.2f) scale(%.4f)">'
                  '<path d="%s" fill="%s"/><path d="%s" fill="%s"/></g>'
                  % (ms + gap, ms * 0.5 + size * 0.5, k,
                     WORD["grid"], grid_fill, WORD["works"], works_fill))
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%.0f" height="%.0f" '
            'viewBox="0 0 %.2f %.2f" role="img" aria-label="Gridworks">%s</svg>'
            % (w, h, w, h, body))


wire, pads, cores, lattice, hub = build_mark()
GEO = {
    "wire": wire.d(),
    "pads": pads.d(),
    "cores": cores.d(),
    "lattice": lattice.d(),
    "hub": {"cx": round(hub[0], 3), "cy": round(hub[1], 3), "r": round(hub[2], 3)},
    "viewBox": "0 0 100 100",
    "wireWeight": MARK_W,
}
WORD = build_wordmark()

FILES = {
    "mark.svg": lambda: svg_mark(512, PAL["cyan"], lattice=PAL["deep"]),
    "mark-simple.svg": lambda: svg_mark(512, PAL["cyan"], simple=True),
    "mark-lit.svg": lambda: svg_mark(512, PAL["lit"], simple=True),
    "mark-void.svg": lambda: svg_mark(512, PAL["void"], simple=True),
    "mark-ink.svg": lambda: svg_mark(512, PAL["cyanInk"], simple=True),
    "mark-badge.svg": lambda: svg_mark(512, PAL["void"], simple=True, bg=PAL["cyan"], pad=16),
    "favicon.svg": lambda: svg_mark(64, PAL["cyan"], simple=True, bg=PAL["void"], pad=10),
    "avatar-512.svg": lambda: svg_mark(512, PAL["cyan"], bg=PAL["void"], pad=22,
                                       lattice=PAL["deep"]),
    "avatar-cyan-512.svg": lambda: svg_mark(512, PAL["void"], simple=True, bg=PAL["cyan"], pad=22),
    "avatar-paper-512.svg": lambda: svg_mark(512, PAL["cyanInk"], simple=True,
                                             bg=PAL["paper"], pad=22),
    "wordmark.svg": lambda: svg_wordmark(64, PAL["cyan"], PAL["lit"]),
    "wordmark-ink.svg": lambda: svg_wordmark(64, PAL["cyanInk"], PAL["void"]),
    "lockup.svg": lambda: svg_lockup(64, PAL["cyan"], PAL["lit"], PAL["cyan"]),
    "lockup-lit.svg": lambda: svg_lockup(64, PAL["lit"], PAL["lit"], PAL["lit"], simple=True),
    "lockup-ink.svg": lambda: svg_lockup(64, PAL["cyanInk"], PAL["void"], PAL["cyanInk"],
                                         simple=True),
    "lockup-stacked.svg": lambda: svg_lockup(64, PAL["cyan"], PAL["lit"], PAL["cyan"],
                                             stacked=True),
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, fn in FILES.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(fn())
    print(json.dumps({"geometry": GEO, "wordmark": WORD, "palette": PAL}, indent=1))
