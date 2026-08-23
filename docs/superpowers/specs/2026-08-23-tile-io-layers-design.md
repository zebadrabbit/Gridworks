# Tile I/O Layers: Labelled Ports, Glyphs, Product Line — Design

Date: 2026-08-23
Status: approved

Follow-on to the visual-language spec, which deliberately stopped at the HTML panels. Playtest
feedback: a tile reading `Smelter / crafting` with three identical green rings tells you the
machine is busy but not what it makes, what it eats, or which port is which. The reference card
(Upload Labs) reads top-to-bottom as **inputs → processing → outputs**, each port row carrying a
kind glyph, a name and a rate. This spec brings that reading to the canvas tile.

Pure readability; nothing in `sim.js` changes. Wires, ports and saves are untouched.

## The tile becomes three layers — when it can

`portsOf` already puts inputs on the west edge and outputs on the east. Ports now live in the
band between the header text (28px: name at 14, status at 25) and the progress bar (which stays
at the bottom, `r.h − 12`), so nothing overlaps the text.

- A side with **exactly one port** — every smelter, constructor, miner and container — puts it in
  the layered position: input in the **upper half** of that band, output in the **lower half**,
  with a 6px gutter between the halves. That is the inputs → processing → outputs read.
- A side with **two or more ports** spreads them evenly over the **whole band**. The halves
  cannot hold two 10px rings plus labels on a 96px tile; this was measured, not guessed
  (a 4-input manufacturer lands at 10px pitch over the full band, rings touching).
- **1×1 logistics tiles and deposits** keep the original full-tile spread — they have no header
  text or bar to dodge, and a 1×1 body is too short for anything else.
- **Power** ports stay on the north edge.

`portAt` picks the **nearest** port within reach rather than the first one found, so a 10px pitch
is still clickable at the default zoom. Positions are derived at draw time; saves and wires are
untouched.

## Every port gets a glyph

The port ring keeps its `KIND_COLOR` stroke. Inside it, instead of the plain dot, the kind glyph
is drawn: `ore` for `resource`, else `item` / `fluid` / `power`. `icons.js` grows one export,
`ICON_PATH[kind]`, the SVG `d` string for each glyph (same art as the inline SVGs; `wrap()` builds
the SVG from it so there is one source). The canvas draws it with `new Path2D(d)` scaled from the
16-unit viewBox to ~7px inside the 5px-radius ring, stroked in the kind colour. 1×1 logistics tiles keep the
plain filled input dot; a 7px glyph is unreadable there.

## Attached ports get a label and a rate

Beside each port, inside the tile, at the port's row:

- One line, `Name n/min` — `ctx.names[res]` where `res` is `port.res`, or failing that the
  resource resolved from the attached wire (`S.getPort` on the far end — the same lookup
  `updateTooltip` already uses for wires), then the summed `flow * 60` of the attached wires. A
  starved input reads `0/min`. 8px monospace, `#cfe8ff`, baseline 3px below the port centre.
  Inputs left-aligned 9px in from the west edge, outputs right-aligned 9px in from the east edge.
  `maxWidth` is `r.w/2 − 11`, which leaves a 4px gutter between the columns at any tile size, so
  they cannot overlap even when an input row and an output row share a y.
- Labels are drawn only on **3×3 tiles**: a 2×2 tile leaves 21px per column and canvas
  `maxWidth` condenses rather than clips, which is unreadable. A side whose rows are closer than
  10px gets no labels either (not reachable with the current catalog, kept as a guard).
- **Unattached port** → glyph only. **1×1 logistics tiles** → plain dot, no glyph, no label.
  **Deposits** → unchanged (their own style).

Text is drawn at every zoom, like the existing name and status; no gating.

## The status line names the product

For a machine with a recipe and a green light, the status line becomes `→ ${product name}`
(first product; a second product is visible on its output row). Yellow and red statuses
(`no power`, `output full`, `starved` …) keep replacing the line as they do now — the colour
rule is unchanged.

## Not in scope

- Sparklines on tiles.
- Reordering ports; recipe slot order is already the row order.
- Any change to wire routing, hit-testing radius, or port ids.
- Per-resource icons (per-kind only, as before).
