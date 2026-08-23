# Visual Language: Port Icons, Sparklines, Meters — Design

Date: 2026-08-23
Status: approved

Borrowed from a node-graph idle game's card UI: a small glyph badge on every input/output row, a
live line graph inside the card for anything that accumulates, and thin labelled meter bars for
bounded quantities. Gridworks gets the same vocabulary, confined to the HTML surfaces (inspector
and tooltip). The canvas tiles do not change.

Pure readability; no new friction. Queued after the onboarding branch lands.

## Icons are per-kind, not per-resource

There are 151 resources. A per-resource icon sheet is days of art for a panel most players
glance at. The reference screenshots do the same thing: the glyph is the *category* (video,
research, heat) and the specific name stays as text.

`src/icons.js` exports six inline SVG strings, 16×16, stroked in `currentColor` in the Brand
line style:

| key | used for |
|-----|----------|
| `item` | belt-carried resources, item ports, item stores |
| `fluid` | pipe-carried resources, fluid ports, fluid buffers |
| `power` | power ports, generators, the HUB power row |
| `ore` | deposits and the miner's `res` port |
| `warn` | red/yellow status lines |
| `idle` | a port with no wire |

`icon(kind)` returns the string. Nothing else. Per-resource overrides for the headline resources
are the upgrade path if the panels still read flat.

## History is a 60-sample ring per node, live-only

`tick()` accumulates `dt` and every 1s pushes one sample onto `node.hist` (plain array, `shift()`
past 60). The metric depends on the node type:

| type | sample |
|------|--------|
| `store` | `bufTotal(buf) / cap` (0–1) |
| `generator` | `supplying ? powerOut : 0` — a starved generator dips |
| `miner`, `machine` | units output in the last second |
| `hub` | `state.power.supply − state.power.demand` (the global total `tick()` already computes; the HUB draws nothing so it belongs to no net) |

`hist` is created lazily, stripped on save, and ignored by `simulateOffline`. Old saves load
unchanged and the graph simply starts empty. One test in `test_sim.mjs`: tick 3s, expect three
samples with the right values.

A one-sample-per-minute long buffer for "what happened while I was away" is not built; the
offline-progress spec already reports that textually.

## Meter bars reuse the milestone bar

`meter(label, value, max, cls)` returns a label row plus the existing `.ms-bar` markup. Same
height, same radius, colour by class (`good` / `warn` / `bad`). No new CSS beyond the colour
variants.

## Where it shows

**Inspector** (`refreshInspector`, `updateBuffers`)
- Every buffer row in `#bufs` gets `icon(kindOf(res))` before the resource name.
- `store`, `generator`, `miner`, `machine`, `hub` get a `<canvas width=220 height=40>` under the
  status line, drawn from `hist` by one `drawSpark(canvas, hist, max)`.
- The HUB additionally gets `meter('Power', supply, demand)`, class from `lightOf`.
- Redraw rides the existing `updateBuffers()` cadence.

**Tooltip** (`updateTooltip`, canvas only)
- Port hover: kind icon before the `input · item` line.
- Node hover (new — nodes currently tooltip only on the minimap): name, status, and a
  120×24 sparkline. Same `#tooltip` element, same offset rules.

## Not in scope

- Per-resource icons.
- Rendering icons, graphs, or meters on the canvas tiles. The tiles are 1–4 T wide and would need
  a minimum zoom or a larger footprint to fit them; revisit once the inspector version has earned
  it.
- Long-window history.
- Minimap tooltip changes.
