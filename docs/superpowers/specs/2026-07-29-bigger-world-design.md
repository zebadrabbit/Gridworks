# Bigger World: Remove Fog, Spread the Map, Dock the Minimap — Design

Date: 2026-07-29
Status: approved

Fog of war shipped in the world spec and did not survive contact with play. This spec removes
it, replaces the difficulty it was meant to create with a 9× larger map, and docks the minimap
into the inspector column with a collapse control.

## Why fog goes

Fog was aesthetic by requirement, but it was also meant to make the map feel like a frontier.
It does not, because revealing it is free: power poles are unlocked from the start, are 1×1,
cost no resources, and reveal a 24-tile radius each. Dragging any building across the map
reveals the whole path at zero cost too.

The whole-branch review predicted exactly this and it was logged as a Minor not worth machinery
to prevent — "fog is aesthetic and toggleable so nothing breaks, but the 'frontier' reading
does." That was an under-weighting: a concealment mechanic that costs nothing to defeat is not
atmosphere, it is a chore with a workaround. Play confirmed it within a session.

Two facts make removal preferable to defaulting it off:

- The toggle is display-only in `game.js`. The sim tracks `state.explored` and runs `revealAll`
  every tick regardless, so switching fog off still pays roughly 11% of an 8-hour offline
  catch-up and still writes the flag array into every save.
- A bigger map makes that worse. At 720×480 the chunk grid grows from 600 to 5,400 flags.

Removal also retires the `_fog` position cache and its two invalidation guards, which were
protecting against a permanently-black map — a failure mode that stops existing once fog does.

### What comes out

From `src/sim.js`: `state.explored`, `revealAll`, the `_fog` cache and both `delete n._fog`
sites, `CHUNK`, `CHUNK_W`, `CHUNK_H`, `chunkIndex`, `NODE_RADIUS`, the `revealAll` call in
`newGame`, the call in `tick`, and `normalizeSave`'s `explored` default and length repair.

From `src/game.js`: `hidden()`, `fogOn`, `FOG_KEY`, the 🌫 button wiring, the three `hidden()`
guards in `drawNode`, `nodeAt` and `portAt`, the `hidden()` guard in `mmHover`, and
`drawMinimap`'s explored-chunk layer — the minimap now draws every deposit unconditionally.

From `index.html`: the `#btn-fog` button. From `src/style.css`: the `#btn-fog.off` rule.

From `tests/test_sim.mjs`: the fog block, and `CHUNK`/`CHUNK_W`/`CHUNK_H`/`chunkIndex`/
`revealAll` from the import list.

`START_RADIUS` stays — it still defines the guaranteed-start band and has nothing to do with fog
now.

Saves written before this change carry a stale `explored` array. It is inert, but
`normalizeSave` should `delete s.explored` so it stops round-tripping and saves shrink on the
next write. That is a deletion, not a migration: nothing reads it.

## Distance costs effort, not resources

Worth stating plainly, because it bounds what a bigger map can achieve: **nothing in this sim
charges for distance.** Belts and pipes are rate-limited with no length term, so a 300-tile belt
carries exactly as much as a 3-tile belt, and power has no transmission loss. Wires cost no
resources to build.

So a larger map does not add mechanical difficulty. What it adds is logistics complexity and
player effort: more panning, more pole hops, longer chains to plan and route. That is the
intended effect here, and it is honest to name it rather than to imply the map size is a
difficulty knob. If distance should ever cost resources, that is a build-cost mechanic and a
separate spec.

## World size

`WORLD_W` 240 → **720**, `WORLD_H` 160 → **480**. Still 3:2, so the minimap needs no reshaping.

`HUB_X`, `HUB_Y` and `MAX_DIST` are already computed from the world dimensions, so the HUB
recentres to (358, 238), `MAX_DIST` becomes ~433, and `distT`, the tier bands and the hard floor
all rescale with no further change. Deposit count stays at 48.

Measured over 300 seeds per size:

| | 240×160 | 720×480 |
|---|---|---|
| tiles per deposit | 800 | 7,200 |
| nearest-neighbour spacing, median | 17 | 30 |
| nearest-neighbour spacing, p90 | 26 | 81 |
| hub → nearest non-starter deposit, median | 19 | 37 |
| deposits within `START_RADIUS` | 13.2 | 8.0 |
| uranium hard-floor distance | 87 | 260 |

An earlier draft of this design worried a 9× map would feel empty at 48 deposits. The
measurements say otherwise, and the reason is the tiering: each tier concentrates into its own
band rather than spreading uniformly, so the inner area stays reasonably dense — median spacing
widens only 1.8× — while the frontier genuinely opens up, with the p90 tripling. That is the
curve originally asked for: iron underfoot, uranium 260 tiles out. The nearest non-starter
deposit sits 37 tiles away, so there is no cliff after the guaranteed bundle.

`START_RADIUS` stays 40. It still defines the guaranteed-start band, and holding it constant
while the map grows is what keeps the opening tight.

`free()`'s 12-tile spacing rule stays. Median spacing is now 30 tiles, so the rule barely binds;
scaling it would be a change with no observable effect.

### `POS_FLOOR` may no longer be needed

`POS_FLOOR = 0.005` exists because tier 0 wanted roughly 24 deposits in a disc that fitted about
15, and without the floor the mean map fell from 48 deposits to 42.2. At 720×480 that disc has
9× the area, so the pressure should be gone.

Decision rule rather than a guess: measure deposit counts over at least 3,000 seeds with
`POS_FLOOR = 0`. If the count holds at 48 with no seed below the tests' asserted floor, remove
`POS_FLOOR` and the branch that applies it — tiering gets sharper and a tuned constant
disappears. If counts drop, keep it and record the measured numbers in the commit.

### Minimum zoom

Minimum zoom drops from 0.2 to **0.08**, so the whole 720-tile width fits a 1920px viewport for
orientation. Nodes are unreadable at that zoom; the minimap remains the real overview tool, and
this is only so panning out does not hit a wall mid-map.

## Minimap docked in the inspector

The minimap currently floats at `right: 260px; bottom: 10px`, which collides with the milestone
panel below roughly 880px of window width. Docking it into the inspector column removes that
whole class of collision.

### The structural trap

`refreshInspector()` rebuilds its panel with `box.innerHTML = html` on every selection change. A
canvas placed inside `#inspector` would therefore be destroyed and recreated on every click —
the same defect that made the Recipe dropdown close the instant it was opened, since `innerHTML`
replacement discards the live element.

So `#inspector` splits in two:

- `#inspector-body` — everything `refreshInspector` writes. Scrolls.
- `#inspector-map` — a static footer holding the minimap canvas and its collapse control.
  `refreshInspector` never touches it.

`#inspector` becomes a flex column (`display: flex; flex-direction: column`), with the body at
`flex: 1; overflow-y: auto` and the footer at `flex: none`. This replaces the `overflow-y: auto`
the shared `aside` rule applies, and it means the body cannot scroll underneath the footer —
which a bottom margin would not reliably guarantee.

### Size and hit-testing

The canvas grows to **228×152** — exactly 3:2, fitting the inspector's 230px content width. That
makes `MM_SCALE = 228 / 720 ≈ 0.317` px per tile, down from 0.75.

The consequence to watch: the tooltip's nearest-dot reach is 5 screen px, which is now `5 /
0.317 ≈ 15.8` world tiles rather than 6.7. Median deposit spacing is 30 tiles, so the reach
stays comfortably under half the typical gap and hit-testing does not become ambiguous. Dots
keep their fixed 3px size so they stay visible despite the finer scale.

### Collapse

A `[−]` in the footer header collapses the map to a single labelled row with a `[+]` to restore
it. State persists to its own `localStorage` key, matching the reasoning that made the fog
toggle a separate key: it is a display preference and must survive New Map and save import,
which anything inside the save would not.

## Testing

`tests/test_sim.mjs` changes:

- The fog block is deleted along with the feature.
- Deposit count still 48 on every seed at the new dimensions, and the guaranteed start bundle
  still places exactly `START_BUNDLE.length` deposits inside `START_RADIUS`.
- The abundance sweep still holds: each mineral's share tracks its JSON weight, `iron-ore` most
  common, `limestone` second.
- The tier-0 to tier-3 distance gap still exceeds 0.20, and no tier-3-or-4 resource lands inside
  the hard floor — now 260 tiles rather than 87.
- Seed determinism still holds.
- Existing tests place nodes at small fixed coordinates such as (5, 5) and (10, 5). The HUB moves
  from (118, 78) to (358, 238), so those remain clear of it — but every hardcoded coordinate must
  be re-checked rather than assumed, since a placement silently returning `null` is how an
  earlier task in this project wasted a round.

Minimap docking, the collapse control and its persistence, and the new minimum zoom are browser
checks.

## Out of scope

- Build costs for belts, pipes or poles. Distance costing resources is a separate mechanic.
- Square/orthogonal wire routing — already tracked separately.
- Scaling deposit count with map area. The count stays 48 deliberately; spreading the same
  quantity further is the point.
- Moving the milestone panel. With the minimap docked, nothing collides with it.
- Achievements, audio and eye-candy — the juice spec.
