#!/usr/bin/env python3
"""Stroke geometry for the Gridworks mark and wordmark.

Everything in this brand — the mark, every letter of the wordmark — is a
*centreline* stroked to a filled outline. That is the whole idea: the game is
nodes joined by wires, so the identity is drawn the same way, as runs between
points rather than as shapes.

Why filled outlines rather than SVG `stroke`: a stroked path scales its line
weight with the element, but it also depends on `stroke-width`,
`vector-effect` and the renderer's join and cap handling, and it rasterises
differently on a canvas than in a browser's own painter. A filled path is the
same pixels everywhere, can be pasted into a font, and survives being handed
to a printer. The cost is that the union has to be built here.

The union is built with the nonzero fill rule: every subpath below is emitted
in the same winding direction, so overlapping quads and discs merge into one
solid form with no seams and no boolean library. `_ccw()` enforces that — it
is the one invariant this module has, and breaking it shows up immediately as
holes at every junction.

No dependencies. Pure Python, pure arithmetic.
"""
import math

# Bezier circle constant: the control-point offset that approximates a quarter
# arc to within ~0.02% of the radius.
KAPPA = 0.5522847498307936


def _fmt(v):
    """Trim float noise. Three decimals is well under a pixel at any size the
    mark is ever drawn, and keeps the emitted JSON readable."""
    s = "%.3f" % v
    s = s.rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def _ccw(pts):
    """Return the polygon wound consistently. Signed area in SVG coordinates
    (y down), so 'positive' here is visually clockwise — the name is a lie of
    convention, but what matters is only that every subpath agrees."""
    a = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return pts if a >= 0 else pts[::-1]


class Shape:
    """A set of subpaths that union under the nonzero rule, plus the exact
    bounding box of what has been added so far."""

    def __init__(self):
        self.subpaths = []          # list of d-string fragments
        self.x0 = self.y0 = float("inf")
        self.x1 = self.y1 = float("-inf")

    # -- bookkeeping -------------------------------------------------------
    def _grow(self, x0, y0, x1, y1):
        self.x0, self.y0 = min(self.x0, x0), min(self.y0, y0)
        self.x1, self.y1 = max(self.x1, x1), max(self.y1, y1)

    @property
    def bbox(self):
        return (self.x0, self.y0, self.x1, self.y1)

    # -- primitives --------------------------------------------------------
    def polygon(self, pts):
        pts = _ccw(list(pts))
        d = "M " + " L ".join("%s %s" % (_fmt(x), _fmt(y)) for x, y in pts) + " Z"
        self.subpaths.append(d)
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        self._grow(min(xs), min(ys), max(xs), max(ys))
        return self

    def disc(self, cx, cy, r):
        """A circle as four cubic arcs, wound to match `polygon`'s direction.
        The anchor square is (r,0),(0,r),(-r,0),(0,-r) traced in +angle order,
        which in y-down coordinates has positive signed area — the same sign
        `_ccw` normalises polygons to."""
        k = KAPPA * r
        d = ("M %s %s " % (_fmt(cx + r), _fmt(cy))
             + "C %s %s %s %s %s %s " % (_fmt(cx + r), _fmt(cy + k), _fmt(cx + k), _fmt(cy + r), _fmt(cx), _fmt(cy + r))
             + "C %s %s %s %s %s %s " % (_fmt(cx - k), _fmt(cy + r), _fmt(cx - r), _fmt(cy + k), _fmt(cx - r), _fmt(cy))
             + "C %s %s %s %s %s %s " % (_fmt(cx - r), _fmt(cy - k), _fmt(cx - k), _fmt(cy - r), _fmt(cx), _fmt(cy - r))
             + "C %s %s %s %s %s %s Z" % (_fmt(cx + k), _fmt(cy - r), _fmt(cx + r), _fmt(cy - k), _fmt(cx + r), _fmt(cy)))
        self.subpaths.append(d)
        self._grow(cx - r, cy - r, cx + r, cy + r)
        return self

    def square(self, cx, cy, half):
        return self.polygon([(cx - half, cy - half), (cx + half, cy - half),
                             (cx + half, cy + half), (cx - half, cy + half)])

    # -- strokes -----------------------------------------------------------
    def segment(self, p0, p1, w, extend=0.0):
        """One run of wire as a quad. `extend` pushes both ends outward along
        the run — used for butt-capped ends that need to reach an exact edge."""
        (x0, y0), (x1, y1) = p0, p1
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        if L == 0:
            return self
        ux, uy = dx / L, dy / L
        if extend:
            x0 -= ux * extend; y0 -= uy * extend
            x1 += ux * extend; y1 += uy * extend
        nx, ny = -uy * w / 2, ux * w / 2
        return self.polygon([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny),
                             (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)])

    def run(self, pts, w, closed=False, cap="round", node=None, end_node=False):
        """Stroke a polyline.

        Joins are discs rather than mitres. That is not a shortcut — a mitred
        45 degree join on a nine-unit stroke throws a spike three units past
        the corner, which at 16 px is the difference between a letter and a
        smudge. Discs also happen to be the right motif: every corner of every
        run in this identity is a node, exactly as on the game's grid.

        `node` overrides the join radius so the mark can carry visible pads
        while the wordmark's joins stay flush at w/2; `end_node` extends that
        to the two open ends. `cap="butt"` leaves the ends square instead.
        """
        r = node if node is not None else w / 2
        n = len(pts)
        for i in range(n if closed else n - 1):
            self.segment(pts[i], pts[(i + 1) % n], w)
        for i in range(n):
            is_end = (not closed) and i in (0, n - 1)
            if is_end and cap == "butt":
                continue
            rr = r if (not is_end or end_node) else w / 2
            self.disc(pts[i][0], pts[i][1], rr)
        return self

    # -- output ------------------------------------------------------------
    def d(self):
        return " ".join(self.subpaths)

    def translated(self, dx, dy):
        """A copy shifted by (dx, dy). Cheaper and more exact than wrapping the
        path in a transform, and it keeps the emitted geometry self-describing:
        every number in logo.json is a final coordinate."""
        out = Shape()
        for sp in self.subpaths:
            out.subpaths.append(_shift_d(sp, dx, dy))
        if self.subpaths:
            out._grow(self.x0 + dx, self.y0 + dy, self.x1 + dx, self.y1 + dy)
        return out

    def scaled(self, k, ox=0.0, oy=0.0):
        out = Shape()
        for sp in self.subpaths:
            out.subpaths.append(_scale_d(sp, k, ox, oy))
        if self.subpaths:
            out._grow((self.x0 - ox) * k + ox, (self.y0 - oy) * k + oy,
                      (self.x1 - ox) * k + ox, (self.y1 - oy) * k + oy)
        return out

    def extend(self, other):
        self.subpaths.extend(other.subpaths)
        if other.subpaths:
            self._grow(*other.bbox)
        return self


def _map_d(d, fn):
    """Rewrite every coordinate pair in a d-string. The strings this module
    emits only ever contain M / L / C / Z with plain numbers, so a token walk
    is exact here — this is not a general SVG path parser and must not be
    used as one."""
    out, nums = [], []
    for tok in d.split():
        if tok in ("M", "L", "C", "Z"):
            out.append(tok)
        else:
            nums.append(float(tok))
            out.append(None)
    # pair the numbers up in order and substitute back
    pairs = [fn(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]
    flat = [v for p in pairs for v in p]
    it = iter(flat)
    return " ".join(t if t is not None else _fmt(next(it)) for t in out)


def _shift_d(d, dx, dy):
    return _map_d(d, lambda x, y: (x + dx, y + dy))


def _scale_d(d, k, ox, oy):
    return _map_d(d, lambda x, y: ((x - ox) * k + ox, (y - oy) * k + oy))
