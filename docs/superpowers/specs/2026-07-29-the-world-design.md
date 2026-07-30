# The World: Tiered Ore, Fog of War & Minimap — Design

Date: 2026-07-29
Status: approved

Today `genMap` scatters every deposit uniform-randomly with no distance term
(`sim.js:158-159`), so uranium is as likely to spawn beside the HUB as 140 tiles out. The map
has no sense of frontier: everything is visible from turn one, and moving outward buys you
nothing but belt length. This spec gives distance meaning, gives the map atmosphere, and gives
you a way to navigate what you have built.

This is the second of four planned specs. Spec 1 (know your factory — status lights, alerts,
machine analytics) shipped. Spec 3 is juice (eye-candy, audio, achievements) and spec 4 is
onboarding, deliberately last because this spec changes what there is to teach.

## Distance is the difficulty, not ignorance

An earlier draft of this design had ore tiering and fog propping each other up: tiering would
only matter if fog stopped you seeing where the good ore was. That was wrong, and the fog
requirement below (aesthetic, toggleable off) makes it plainly wrong.

Tiering's teeth are the **cost of distance**. Uranium 130 tiles out is expensive because belts,
pipes, power and poles have to physically reach it — which is true whether or not you can see
it, and true with fog switched off. Fog is atmosphere layered on top. The two features are
independent, and this spec keeps them independent: nothing in world generation reads
`state.explored`, and nothing in the fog layer reads the tier table.

They do share one constant. `START_RADIUS = 40` tiles is both the HUB's reveal radius and the
band the guaranteed starters spawn in. That is a shared number, not a dependency — world
generation never asks what has been explored, and with fog switched off `START_RADIUS` still
governs where the starters go.

## Fog default-on fights the opaque start

Reveal is driven by owned buildings, and at `t = 0` you own only the HUB. Taken naively that
means a new game shows zero deposits, which is strictly worse than today — and "opaque start"
is a listed problem this project wants to fix, not deepen.

The resolution collapses two features into one rule: the HUB reveals a generous radius, and
world generation *guarantees a viable start inside it*. The starting view is therefore always
playable, and the fog beyond it reads as frontier rather than as a blindfold.

## World generation

All of this lives in `sim.js` and is covered by `tests/test_sim.mjs`.

### Tier table

Five tiers, as a `sim.js` constant. The ordering is derived from when the existing `MILESTONES`
ladder actually needs each resource — not invented, and not a new balance pass.

| Tier | Resources | First needed by |
|---|---|---|
| 0 | `iron-ore`, `limestone`, `leaves` | MS1 Part Assembly; plants are the power bootstrap |
| 1 | `copper-ore`, `coal`, `water` | MS2 Screws & Wire, MS3 Coal Power |
| 2 | `caterium-ore`, `raw-quartz`, `sulfur`, `crude-oil` | MS5 Oil Processing through MS7 High Tech |
| 3 | `bauxite`, `sam`, `nitrogen-gas` | MS7 High Tech, blender recipes |
| 4 | `uranium` | MS7 / nuclear |

### Soft weighting

Distance is Euclidean from the HUB's centre — `(HUB_X + 2, HUB_Y + 2) = (120, 80)`, since the
HUB is a 4-tile building — normalized as `t = dist / 141` into `[0, 1]`, clamped at 1.

Each resource keeps its **real weight from the source JSON** — `iron-ore 307`, `limestone 233`,
`coal 141`, `copper-ore 123`, `caterium-ore 50`, `raw-quartz 45`, `bauxite 41`, `sulfur 36`,
`sam 34`, `uranium 7` — attenuated by how close `t` is to its tier's ideal band:

```
tierIdeal(i) = i / 4                      // tiers 0..4 -> t of 0, 0.25, 0.5, 0.75, 1.0
falloff(t, i) = max(0, 1 - |t - tierIdeal(i)| / 0.35)
effectiveWeight(res, t) = weight(res) * falloff(t, tierOf(res))
```

The `0.35` band width is wide enough that adjacent tiers overlap, so boundaries are soft rather
than visible rings, and narrow enough that tier 0 and tier 4 never compete. Both constants are
tunable; they are pinned here so two implementers produce the same curve.

Weights are attenuated, never replaced, so the relative abundance the data already encodes
survives and seeds stay varied. An early lucky caterium is still possible; that is the point of
soft weighting over hard bands.

### Hard floor on the top tiers

`uranium`, `sam` and `nitrogen-gas` get a minimum `t` of 0.6 (~85 tiles). No seed can place
them near the HUB. This is the specific complaint that motivated the spec, and a soft
probability curve alone would not close it — "vanishingly unlikely" still means some seed does
it.

### Guaranteed start

Starter deposits are placed **first**, before anything else is scattered: 2 `iron-ore`, 1
`copper-ore`, 1 `limestone`, 2 plant and 1 real `water` — seven deposits, at seeded positions
between the HUB footprint and `START_RADIUS`. They respect the existing `free()` spacing rule,
so the usable band is roughly 9 to 40 tiles from centre.

These seven **count against their category's existing budget** rather than adding to it: the
mineral scatter drops from 28 to 24, plant from 8 to 6, water from 7 to 6. Map totals stay at
48 deposits, so the existing `>= 30` deposit-count assertion and the general feel of map density
are both unchanged.

Placing them first rather than rejection-sampling and re-rolling means generation always
succeeds and stays deterministic per seed. Rejection sampling can fail; a guarantee cannot.

### The `nitrogen-gas` fix

`nitrogen-gas` exists in the source JSON with category `water` and weight 40, and
`water-extractor` has `minerCat: 'water'`, so it is already extractable. It has nevertheless
never spawned in any game, because `scatter(7, () => 'water', 'water')` hardcodes the resource
and ignores the category.

The water scatter becomes a weighted pick across the `water` category (`water 100`,
`nitrogen-gas 40`), with nitrogen's tier-3 floor keeping it far out. The existing assertion
that a `water`-*category* deposit exists still holds; a new assertion pins a real `water`
resource near the HUB, because coal generators need it from MS3.

## Fog of war

Fog is **aesthetic**. It gates nothing, and it can be switched off.

### State

`state.explored` is a flat array of 600 zero/one values: 8-tile chunks over the 240×160 world,
so 30 × 20. Direct indexing, no `Set` mirror, so there is no dual representation to desync.
About 1.2 KB of JSON. `normalizeSave` fills it for saves written before this spec.

### Reveal

`revealAll(state, ctx)` lives in `sim.js` and runs from `tick()`.

Running it in the tick loop sounds like a hot-path mistake. It is roughly 48 nodes × ~50
chunks of idempotent index writes at 10 Hz, which is nothing, and it buys the property that
matters: there is no call site to forget. Placing, dragging, deleting, loading a save and
crediting offline progress all reveal correctly for free, because they all go through `tick()`.
A `ponytail:` comment names the ceiling — revisit if node counts reach the thousands, at which
point reveal-on-change with per-node bookkeeping becomes worth its complexity.

Regular nodes reveal `NODE_RADIUS = 24` tiles. The HUB reveals `START_RADIUS = 40`, which is
what makes the guaranteed start visible. A chunk counts as revealed when its centre falls within
the radius of any owned node.

### Rendering

A deposit in an unexplored chunk is not drawn and not hit-tested. The grid, the world border
and your own buildings are never fogged.

Not hit-testing hidden deposits looks like fog gating something, but it cannot gate anything in
practice: wiring a miner to a deposit requires placing the miner next to it, and placing it
reveals the chunk. The alternative — invisible but clickable — is worse, because it lets you
wire to something you cannot see.

## Minimap

A second small canvas, bottom-right at `right: 260px` so it clears the 250px inspector, sized
180×120 for the 3:2 world. It draws the world border, explored chunks, deposits within explored
chunks, the HUB, and the current viewport rectangle. Click and drag pans the camera.

Player nodes are drawn in their **status-light colour**, reusing `lightOf` from spec 1. A red
machine 130 tiles away becomes a red pixel you can see and click, which is what finally closes
the "can't find the problem" loop that spec 1 opened: spec 1 made problems visible on the node
and countable in the HUD, and this makes them locatable on the world.

### Clusters, and why draw order matters

People build in clusters, and at 0.75 px per tile a ten-machine cluster is about 15×15 px, so
its dots overlap. Draw order therefore decides what you see: if a healthy neighbour paints over
a broken machine, the one pixel that mattered is gone and colouring by status has bought
nothing.

So dots are drawn **worst-last**: green, then yellow, then red on top. A single red machine in a
cluster of nine healthy ones is always visible. Tooltip tie-breaks the same way — when several
dots are within range, it describes the worst-lit one, for the same reason.

This is the deliberate trade for not showing building type, and it follows the priority that a
machine being off or stuck matters more than knowing which machine it is. Whether that holds up
is a question only play will answer; revisit after the spec ships rather than guessing now. If
type identity turns out to matter, the cheap move is shape rather than colour — a different dot
shape per building type, keeping status on the colour channel.

### Hover tooltip

Colouring by status costs the ability to tell *what* a dot is. A hover tooltip buys it back, and
costs almost nothing: `#tooltip` and its CSS already exist for canvas ports and wires, so the
minimap needs a mousemove handler feeding the same element, not a second tooltip system.

At 180×120 for a 240×160 world the scale is 0.75 px per tile, so even a 4-tile HUB is only 3 px
and dots are effectively sub-pixel. Hit-testing therefore picks the **nearest** node or revealed
deposit within 5 px of the cursor, rather than testing containment — containment would make most
dots unhittable.

Contents:

- a building: its name, its status, and its uptime line, reusing `uptimeText()` from spec 1
- a revealed deposit: resource name, category and purity — useful for scouting where to expand
- nothing at all when no dot is within range

Fogged deposits are not drawn, so they are not hit-tested and cannot be revealed by hovering.

The tooltip is suppressed while dragging the minimap to pan, matching how the canvas tooltip
hides during a drag. It is otherwise shown regardless of `ui.mode` — scouting the map while in
place mode is exactly when it is most wanted, so this deliberately differs from the canvas
tooltip's `ui.mode !== 'idle'` early return.

The minimap redraws inside the main `draw()` loop rather than on an interval, so the viewport
rectangle does not lag while panning. That is ~700 small `fillRect` calls per frame, well
within canvas budget.

The minimap is always visible. A hide toggle is not included; add one if it proves to be in
the way.

## Fog toggle

A 🌫 button beside pause and speed, backed by its own `localStorage` key, default on.

It gets its own key rather than living in the save because it is a display preference, not game
state: it should survive New Map and save import, which anything inside the save would not.
This differs deliberately from `ui.paused` and `ui.speed`, which are session-only by design.

With fog off, every deposit renders and every minimap chunk lights. `state.explored` keeps
accumulating underneath, so switching fog back on is still correct rather than resetting
progress.

There is no settings panel yet, and this spec does not add one. Spec 3 will want audio and
effects toggles; fog folds into a panel then.

## Testing

`tests/test_sim.mjs` gains:

- **Tier floor sweep:** across ~200 seeds, no `uranium`, `sam` or `nitrogen-gas` deposit ever
  lands inside `t < 0.6`.
- **Guaranteed start sweep:** across the same seeds, every map has the full start bundle within
  the HUB reveal radius.
- **Tiering actually biases:** pooled across the sweep, the mean `t` of tier-0 deposits is at
  least 0.20 lower than that of tier-3. A floor test alone would pass on a map that ignored
  tiers entirely for everything below the floor, so this is the assertion that proves the
  weighting works. The threshold is deliberately loose — it must catch "tiering does nothing",
  not pin the exact curve, or every future tuning change breaks the test.
- **`nitrogen-gas` can spawn** at all, over enough seeds — the regression that motivated it.
- **Chunk math:** a node at a known position reveals exactly the expected chunk indices.
- **Reveal is monotone:** ticking never un-reveals a chunk, including through
  `simulateOffline()`.
- **`explored` survives** a `JSON.stringify` → `normalizeSave` round-trip, and a save written
  without it gets a valid default.
- Existing assertions still hold: seed determinism, and at least 30 deposits per map.

Minimap rendering, click-to-pan, the hover tooltip, the fog toggle and the toggle's persistence
are browser checks. The tooltip's nearest-dot search stays in `game.js` rather than being pushed
into `sim.js` to gain coverage — it is screen-space cursor math with no game meaning, and moving
it would put pixel geometry in the pure-logic module purely to satisfy a test.

## Out of scope

- A settings panel. Spec 3.
- Hiding or resizing the minimap.
- Fog affecting placement, throughput or any sim behaviour. It is aesthetic by requirement.
- Re-fogging. Revealed is permanent.
- Terrain, biomes, elevation or anything that makes distance cost more than belt length.
- Power poles and square wire routing — already tracked separately, and orthogonal to this.
