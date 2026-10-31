# Gridworks — brand and social pack

Neon on void, wires on a grid. Every built page is one self-contained file: no
build step needed to *use* one, no webfonts, no network requests — the same
constraint the game runs under. Open any `.html` in a browser.

## What's here

| File | What it is |
|---|---|
| `brand-system.html` | The system itself — marks, reduction ladder, clear space, palette with live WCAG contrast checks, type scale, the grid module, do/don't. **Read this first.** |
| `social-pack.html` | Eleven cards at exact platform sizes, each with SVG and PNG export. |
| `brand/*.svg` | Mark, wordmark, lockups, avatar and favicon as standalone vector files. |
| `github/*.png` | Social preview, README hero, and the catalogue figure. |
| `social/*.png` | Avatars and banners for X, Bluesky, LinkedIn, Discord, Instagram. |
| `favicon/*` | The favicon ladder, `site.webmanifest`, and a `<head>` snippet to paste. |
| `templates/`, `src/`, `build.py` | The sources. `python3 build.py` regenerates both pages. |
| `src/grid.py` | Stroke geometry: centrelines to filled outlines, no dependencies. |
| `src/logo.py` | Generates the mark and all nine letters. The identity lives here. |
| `src/gen_arch.py` | Measures `../src/sim.js` and `../data/source/` and writes `src/arch.json`. The catalogue figure starts here. |
| `render_pngs.py` | Re-renders every PNG from `social-pack.html`, headlessly and size-checked. |

## Rebuilding

```sh
cd Brand
python3 src/logo.py > src/logo.json     # the marks (also writes brand/*.svg)
python3 build.py                        # templates/ + src/ -> the two pages
python3 render_pngs.py                  # the pages -> github/, social/, favicon/
```

`build.py` runs the first step and the measurement pass for you, so in practice
it is `python3 build.py && python3 render_pngs.py`.

That is the whole chain, and every step of it is in the repo: the mark is
constructed from named points, the catalogue measures itself out of `sim.js`,
the pages inline both, and the PNGs are pictures of the pages. Nothing in
`github/` or `social/` is drawn by hand.

`build.py` inlines `src/tokens.css`, `src/logo.json`, `src/arch.json` and
`src/contrast.js` into `templates/{brand,social}.html`, replacing the
`/*__TOKENS__*/`, `/*__LOGO__*/`, `/*__ARCH__*/` and `/*__CONTRAST__*/`
markers. If a generator fails it keeps the last good JSON and says so rather
than failing the build — the geometry and the catalogue only change when the
project does, and a brand rebuild should not be blocked by a moved checkout.

**Nothing in this pack has a third-party dependency.** No `fonttools`, no
`shapely`, no `pillow`, no npm. Python 3 and a Chromium-family browser for the
PNG pass, and that is the whole list.

## The mark

A G built the way the game builds a factory: a run of wire between named nodes,
with a pad at every corner and a hub where the run terminates. The letterform is
not decorated with a circuit motif — the wiring *is* the letter. That is why it
reduces: a run of wire with a terminal on it is still a G at 16 px, where an
illustration of a factory would be a smudge.

`src/logo.py` holds the mark as ten named points and lets `src/grid.py` stroke
them. Corners are chamfered at 45°, never curved, because every wire the player
draws is orthogonal or diagonal and a circular logo would be the one round thing
in the entire system. The framing normalises itself from the exact bounding box
of the built geometry, so moving a point cannot silently decentre the mark or
clip it in a downstream asset.

Joins are **discs, not mitres**. That is not a shortcut: a mitred 45° join on a
nine-unit stroke throws a spike three units past the corner, which at 16 px is
the difference between a letter and a smudge. Discs also happen to be the right
motif — every corner of every run in this identity is a node, exactly as on the
game's grid.

> An earlier draft baked the corner pads into the silhouette itself, so the
> one-colour mark came out with eight bumps around its edge and read as a cog
> rather than a G at 24 px and below. The pads are worth having. They are just a
> detail layer, and detail layers are the first thing a reduction throws away.

### The wordmark

Nine letters, no font. There is no geometric sans in this pack's dependency set,
and adding one would mean either a webfont fetch on a game that boots offline or
a licence to track — so `GRIDWORKS` is constructed by the same stroking code as
the mark, from the same wire, on the same grid. Each glyph is a list of points;
each point is one line and adjustable on its own.

`GRID` and `WORKS` are emitted as separate paths so the two-tone split from the
HUD (`GRID` in cyan, `WORKS` in the bright tint) survives into every asset. The
tracking is deliberately wide — this is a wordmark that is set open, not tight,
and nothing in it is kerned by eye.

### Reduction

The full mark carries three detail layers: the interior lattice, the swollen
corner pads, and the lit cores on top of them. Below roughly 24 px all three
stop resolving and start reading as noise, so anything smaller uses the **simple
mark** — one colour, silhouette only. `brand/favicon.svg` already does. Minimum
size for the full mark is 20 px.

Clear space is **0.30 × the mark's height** on every side.

## Colour

The palette is lifted from the game's own `src/style.css` rather than invented
alongside it, so the brand and the thing it is a brand for cannot drift.

Cyan `#4DD8FF` is the brand, and on the void it is not merely a graphic colour:
at 11.71:1 it is a perfectly good colour for body text, which is the opposite of
the usual neon problem. The trap runs the other way. Put the same cyan on a
white README, a slide or a store page and it measures **1.50:1** — below the 3:1
floor for even large display type. It is not dim, it is invisible. Use
`--g-cyan-ink` `#0A6A88` whenever cyan has to sit on a light ground, and the
`-ink` variants of the three status colours with it.

Every ratio quoted in `src/tokens.css` is computed by `src/contrast.py`, and
`brand-system.html` recomputes all of them in the browser on load. That is not
decoration — it is the only way a colour that gets nudged shows up as a red cell
rather than as a stale comment.

**One place this kit does not follow the app.** The game sets its 10 px
uppercase section labels in `#5B6B80`, which measures 3.59:1 against the void —
fine as a rule, a divider or a disabled state, and below AA as the smallest type
on screen. `tokens.css` keeps that value as `--g-ink-4` and marks it large-only;
`--g-ink-3` `#7A8AA0` (5.56:1) is the smallest permitted text colour. Changing
the game to match is a one-line edit in `src/style.css` if you want the two to
agree.

## The grid

`--g-tile` is `TILE` from `src/sim.js` — 32 px, one world tile. Every spacing
value in `tokens.css` is a division of it, so a brand layout and a factory
layout are on the same grid, and the background of every social card is the
world grid at the world's own tile size.

## Where the catalogue figure comes from

`github/catalogue-1280x720.png` is captioned **MEASURED, NOT DRAWN**, and it is.
`src/gen_arch.py` reads `../src/sim.js` and
`../data/source/satisfactory_data.json` and writes what it finds to
`src/arch.json`.

The sim is *parsed*, not executed. `sim.js` exports live closures
(`ACHIEVEMENTS[].test`, the tutorial predicates), and running a game's rules
engine to draw its own logo would be a strange dependency to take on — a brand
build should not need a JS runtime. So `gen_arch.py` carries a small tolerant
reader for JS literals. It understands objects, arrays, strings, numbers and
bare identifier keys, and it **refuses** anything it does not understand rather
than guessing: a parser that silently coerced whatever it found would let the
figure drift from the source, and the figure's entire claim is that it cannot.

Measured at the last build:

```text
12 buildings · 5 miner marks · 272 recipes · 136 items · 15 fluids · 13 resources
7 milestones -> 18 unlockable buildings · 4 Project Assembly phases · 11 achievements
belt Mk.5 · pipe Mk.1 · 720×480 world at 32px tiles
```

Add a milestone to `MILESTONES`, run `python3 build.py && python3
render_pngs.py`, and the ladder in the figure grows a rung on its own.
**Regenerate after any change to the ladders or the source JSON**, or the figure
quietly starts lying — which is the exact failure the caption is there to rule
out.

## Rendering notes

`render_pngs.py` rasterises on a canvas *inside* the page — the same path the
page's own "PNG @1×" buttons use — and reads the finished image back as a data
URL. That is deliberate, and worth not undoing:

> The obvious approach, pointing the browser's `--screenshot` at the page with
> `--window-size` set to the card, is broken on any current Chrome or Edge.
> `--headless=new` emulates a real browser window, so the viewport comes out
> ~87 px shorter than asked for and every card renders at its correct width
> with a band of page background along the bottom edge. Old headless, which did
> not do this, no longer exists. A canvas has none of that ambiguity — it is
> exactly as many pixels as you ask for.

The script exits non-zero if any output comes out the wrong size. A silently
mis-sized asset is worse than a missing one: it gets committed and only shows up
later as a blurry banner.

**Render the whole set, not one card.** This pack's body copy is a system font
stack, on purpose — so glyph rasterisation differs between browser engines and
font sets, and a single re-rendered card will not quite match its siblings. One
launch renders them all, so this is the default.

## Before you publish

1. **GitHub social preview** — `github/social-preview-1280x640.png` → repo
   Settings → General → Social preview.
2. **README hero** — `github/hero-1280x400.png` at the top of the repository
   README.
3. **Catalogue figure** — `github/catalogue-1280x720.png` belongs next to the
   README's opening description, which currently spends a long paragraph
   listing counts the figure shows at a glance.
4. **Favicons** — DONE: `favicon/` lives at the repo root and `index.html` links it with relative paths. Originally: copy `favicon/` to the repo root and paste
   `favicon/head-snippet.html` into `index.html`'s `<head>`, replacing the
   inline `⚡` emoji `data:` icon. An emoji favicon renders as whatever glyph
   the user's OS happens to have, which is a different picture on every platform
   and no picture at all on some Linux desktops.
5. **The HUD lockup** — DONE 2026-10-18: `index.html` now uses `brand/wordmark.svg` at 20 px. Originally it set its logo as
   `<span class="logo">GRID<b>WORKS</b></span>` in the system font. That is the
   same two-tone split the wordmark uses, so it already reads as the brand;
   swapping in `brand/wordmark.svg` at 20 px would make it exact. Either is
   defensible — the inline version costs nothing and survives a missing file.
6. **Avatars** — `social/avatar-512x512.png` for dark contexts,
   `social/avatar-cyan-512x512.png` where it needs to pop,
   `social/discord-icon-512x512.png` for Discord (it crops to a circle; the mark
   is already inset for that).
7. **Banner safe areas** — on X the avatar covers the lower-left of
   `x-banner-1500x500`; the lockup is placed clear of it. Check LinkedIn's
   current crop before using `linkedin-banner-1128x191`, it changes.

## Copy

The lines used across the pack, so they stay consistent:

- *A grid idler about wiring a factory together.*
- *Click a port, pan, click again. The run draws itself.*
- *Wire it up. Walk away. It keeps going.*
- *Ship it to the HUB, climb the ladder.*
- *deposits · wires · milestones · one very long belt*
- *runs in a browser tab · keeps running when the tab is closed*

Gridworks is a game about patient machinery, so the voice is flat and
mechanical — short sentences, verbs first, no exclamation marks and no hype
about scale. It is Satisfactory-*themed*, not Satisfactory: the pack never uses
Coffee Stain's marks, logos or artwork, and the copy should not imply an
affiliation either. Item and building names come from the source JSON, which
`docs/SOURCE_OF_TRUTH.md` already governs; the brand does not invent new ones.

Licence: same as the project (MIT). The mark and all nine letters are original
geometry generated by `src/logo.py`; no third-party marks, artwork or typefaces
are used anywhere in this pack.
