#!/usr/bin/env python3
"""WCAG 2.1 relative luminance and contrast. Used to fill in — and keep
honest — the ratios quoted in tokens.css and shown live on the brand page.

Gridworks is a dark-first system, so most of these are measured against
--g-void (#0A0C12). The paper column matters anyway: the mark ends up on a
white README, a slide and a store page whether or not the game has a light
mode, and neon cyan on white is the single easiest way to ship something
unreadable."""


def _srgb(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(hexstr):
    h = hexstr.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _srgb(r) + 0.7152 * _srgb(g) + 0.0722 * _srgb(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def grade(r, large=False):
    aa, aaa = (3.0, 4.5) if large else (4.5, 7.0)
    return "AAA" if r >= aaa else ("AA" if r >= aa else "fail")


if __name__ == "__main__":
    VOID, PAPER = "#0A0C12", "#EEF3F8"
    on_void = {
        "ink       ": "#CFD8E3", "ink-2     ": "#9FB0C3", "ink-3     ": "#7A8AA0",
        "ink-4     ": "#5B6B80",
        "cyan      ": "#4DD8FF", "cyan-bright": "#E8F6FF", "cyan-deep ": "#1C6E8C",
        "amber     ": "#F4D03F", "green     ": "#58D68D", "coral     ": "#FF7675",
        "line      ": "#1D2733", "line-2    ": "#23445C",
    }
    on_paper = {
        "ink       ": "#101720", "ink-2     ": "#41505F",
        "cyan      ": "#4DD8FF", "cyan-ink  ": "#0A6A88",
        "amber-ink ": "#7A5A00", "green-ink ": "#116B3C", "coral-ink ": "#B32B2B",
    }
    print("against void %s:" % VOID)
    for k, v in on_void.items():
        r = ratio(v, VOID)
        print("  %s %s  %6.2f:1   %s" % (k, v, r, grade(r)))
    print("against paper %s:" % PAPER)
    for k, v in on_paper.items():
        r = ratio(v, PAPER)
        print("  %s %s  %6.2f:1   %s" % (k, v, r, grade(r)))
    print("void  on cyan #4DD8FF: %.2f:1" % ratio(VOID, "#4DD8FF"))
    print("void  on amber #F4D03F: %.2f:1" % ratio(VOID, "#F4D03F"))
    print("void  on green #58D68D: %.2f:1" % ratio(VOID, "#58D68D"))
    print("void  on coral #FF7675: %.2f:1" % ratio(VOID, "#FF7675"))
    print("paper on cyan-ink #0A6A88: %.2f:1" % ratio(PAPER, "#0A6A88"))
