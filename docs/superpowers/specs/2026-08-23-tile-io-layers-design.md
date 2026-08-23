# Tile I/O Layers: Labelled Ports, Glyphs, Product Line — Design

Date: 2026-08-23
Status: approved

Follow-on to the visual-language spec, which deliberately stopped at the HTML panels. Playtest
feedback: a tile reading `Smelter / crafting` with three identical green rings tells you the
machine is busy but not what it makes, what it eats, or which port is which. The reference card
(Upload Labs) reads top-to-bottom as **inputs → processing → outputs**, each port row carrying a
kind glyph, a name and a rate. This spec brings that reading to the canvas tile.

Pure readability; nothing in `sim.js` changes. Wires, ports and saves are untouched.

## The tile becomes three layers

`portsOf` already puts inputs on the west edge and outputs on the east. Today both are spread
over the full tile height, so an input and an output can share a row and the progress bar sits
at the bottom. The change is in `portPos` only:

- **Inputs** space over the **upper 55%** of the west edge (below the 18px header band).
- **Outputs** space over the **lower 55%** of the east edge.
- **Power** ports stay on the north edge, unchanged.
- The **progress bar** moves from the bottom to the band between the two groups
  (`r.y + r.h * 0.5`, centred).

Positions are derived at draw time, so existing saves and wires re-route themselves with no
migration. The 10% overlap between the two bands is deliberate: a 2-input/1-output machine still
reads as three distinct rows without the tile looking top-heavy.

## Every port gets a glyph

The port ring keeps its `KIND_COLOR` stroke. Inside it, instead of the plain dot, the kind glyph
is drawn: `ore` for `resource`, else `item` / `fluid` / `power`. `icons.js` grows one export,
`ICON_PATH[kind]`, the SVG `d` string for each glyph (same art as the inline SVGs; `wrap()` builds
the SVG from it so there is one source). The canvas draws it with `new Path2D(d)` scaled from the
16-unit viewBox to ~7px inside the 5px-radius ring, stroked in the kind colour. Input rings keep
a filled dot only on 1×1 logistics tiles, where the glyph would be unreadable.

## Attached ports get a label and a rate

Beside each port, inside the tile, at the port's row:

- **Name** — `ctx.names[res]` where `res` is `port.res`, or failing that the resource resolved
  from the attached wire (`S.getPort` on the far end — the same lookup `updateTooltip` already
  uses for wires). 8px monospace, `#cfe8ff`. Inputs left-aligned 9px in from the west edge,
  outputs right-aligned 9px in from the east edge. `maxWidth` is 45% of the tile width so the two
  columns can never touch.
- **Rate** — below the name, 8px, `#7a8aa0`: `${Math.round(flow * 60)}/min` from the attached
  wire's `flow` (summed if several wires share the port). A starved input reads `0/min`.
- **Unattached port** → glyph only. **1×1 logistics tiles** → glyph only. **Deposits** →
  unchanged (their own style).

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
