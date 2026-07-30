# Changelog

## 2026-07-29 — Bigger World

- **Fog of war removed.** It was meant to make the map feel like a frontier, but revealing it
  was free: power poles are unlocked from the start, cost nothing, and reveal a 24-tile radius
  each, and dragging any building across the map revealed the whole path. A concealment mechanic
  that costs nothing to defeat is a chore with a workaround, not atmosphere. Out with it go
  `state.explored`, `revealAll`, the `_fog` cache, the chunk grid and the 🌫 toggle — which also
  reclaims roughly 11% of an 8-hour offline catch-up, since the sim tracked explored chunks every
  tick whether fog was switched on or not.
- **The world is now 720×480** — nine times the area, with the same 48 deposits. Measured over
  300 seeds, median spacing between deposits goes from 17 to 30 tiles and the 90th percentile
  from 26 to 81, while the uranium hard floor moves from 87 tiles out to 260. Because each tier
  concentrates into its own band, the area around the HUB stays workable while the frontier
  genuinely opens up. Minimum zoom drops to 0.08 so the full map width fits on screen for
  orientation. Existing saves keep their original 240×160 layout — `genMap` only runs for a new
  map, so "New Map" is what gets you the bigger world.
- **The minimap is docked** into the bottom of the inspector column at 228×152, with a `−`/`+`
  collapse whose state persists. It previously floated bottom-right and overlapped the milestone
  panel below ~880px of window width; in the flow, that whole class of collision is gone.
- Tests: world dimensions and the recentred HUB, all 48 deposits still placing on every seed with
  the full starter bundle, deposits measurably further apart, and the hard floor at its new
  distance. The fog test block is deleted with the feature.

## 2026-07-29 — The World

- **Ore tiered by distance**: a resource→tier table in sim.js, ordered by when the existing
  milestone ladder first needs each resource. Each deposit picks its resource by the JSON's own
  weight, then picks *where* to sit from 40 candidate positions scored by how well each suits
  that resource's tier — so how *common* a resource is comes from the data and nothing else,
  while how *far out* it sits comes from its tier. `bauxite`, `sam`, `nitrogen-gas` and
  `uranium` additionally get a hard floor at 0.6 of map radius, so no seed can put uranium next
  to the HUB. Measured over 3,000 seeds, each mineral's share of the map tracks its JSON weight
  share within about two points.
- **Guaranteed playable start**: 2 iron, 1 copper, 1 limestone, 2 plant and 1 water are placed
  before the general scatter, inside the HUB's reveal radius — bounded a chunk tighter than that
  radius, because visibility is decided per chunk centre rather than per tile. They come out of
  the per-category budgets rather than adding to them, so maps hold 48 deposits.
- **`nitrogen-gas` can spawn**: it has been in the source JSON all along (category `water`,
  weight 40) and `water-extractor` already accepts it, but the water scatter hardcoded the
  resource, so it had never appeared in any game. The scatter now picks by category weight.
- **Fog of war**: purely aesthetic and toggleable (🌫 in the HUD, persisted to its own
  localStorage key so it survives New Map and import). Buildings you own reveal a 24-tile
  radius around them, tracked at 8-tile chunk granularity; the HUB reveals a larger radius,
  which is what makes the guaranteed start visible. Revealing is permanent — demolishing does
  not re-fog. Fogged deposits are neither drawn nor hit-tested, which cannot block anything,
  since placing a building next to a deposit reveals it first.
- **Minimap**: bottom-right, with explored chunks, deposits, the viewport rectangle, and
  click-drag to pan. Your buildings are drawn in their status-light colour and painted
  worst-last, so one red machine in a cluster of healthy ones is never hidden — which makes a
  problem 130 tiles away a red pixel you can see and click. Hovering any dot names it, reusing
  the existing tooltip.
- Tests: tier floor and start-bundle guarantees swept across 200 seeds each, a bias check that
  tier-3 really does spawn further out than tier-0, `nitrogen-gas` reachability, chunk maths,
  reveal monotonicity through both live and offline simulation, and `explored` surviving save
  normalization including repair of a wrong-length array.

## 2026-07-29 — Relay Poles

- **Power, Conveyor and Pipe Poles**: 1-tile relay nodes, one port in and one out, unlocked
  from the start. They exist because the camera cannot pan while a wire drag is held, so a
  cross-map run previously meant zooming out until both ports fit on screen; now it is built
  as per-screen hops. No new sim code was needed — the existing `logistic` type already models
  a 1-in/1-out passthrough, and power poles join networks for free because `canConnect` treats
  power wires as undirected and `powerNetworks` unions across any power wire regardless of node
  type. Poles draw and supply nothing, stay out of the supply/demand totals, and never raise
  an alert.
- Tests: a pole chain relays power to a distant machine with no loss and no effect on grid
  accounting; items and fluids are conserved across a pole at unchanged throughput; each pole
  rejects the wire kinds it does not carry.

## 2026-07-29 — Know Your Factory

- **Status lights**: a new pure `lightOf()` in sim.js maps each node's existing status
  string plus its power ratio to red/yellow/green; `game.js` renders it as the node's
  border glow and status-text color. Deposits, the HUB, the elevator and logistics get
  no light (their status is milestone text or an unconditional `ok`). White is reserved
  for overclocking, which does not exist yet.
- **Brownouts are visible**: `tick()` now stores `node.ratio`, so a machine on an
  oversubscribed network lights yellow instead of reading as healthy green while
  silently running at a fraction of speed.
- **Alerts**: a `⚠ N` chip in the HUD counts red machines plus throttled networks;
  clicking opens a list, and clicking an entry pans the camera to the culprit and
  selects it. Throttled networks are one entry each, not one per machine.
- **Machine analytics**: miners and machines bank lifetime `made`; miners, machines,
  generators and containers bank green/yellow/red state-time; the inspector shows
  `84% uptime · 1,204 produced`. Plain numbers, so saves and offline simulation carry
  them with no special casing.
- Tests: `lightOf()` across every status and the throttle boundary, ratio storage,
  brownout detection, production conservation through a miner → smelter → HUB chain,
  and uptime agreeing within one offline step live vs. offline.

## 2026-07-27 — Offline Progress, Space Elevator & QoL

- **Offline progress**: saves stamp `savedAt`; on load, away time (capped at 8h) is
  simulated in 0.5s steps by a new pure `simulateOffline()` in sim.js, with a
  welcome-back toast summarizing time simulated and items shipped while away.
- **Space Elevator end-goal**: unlocked by the final 'High Tech' milestone; a 4-tile
  sink node accepting only Project Assembly parts (smart plating, versatile
  framework, automated wiring, modular engine, adaptive control unit — all real JSON
  items). Ship 4 wiki-shaped phases (idle-scaled costs, tune freely) to win; the
  milestone panel tracks the active phase after the HUB ladder and toasts each phase
  and the victory.
- **QoL**: HUD shows the map seed; "New Map" prompts for a seed (blank = random,
  strings hashed) so maps are shareable; save export/import as JSON (imports run
  through `normalizeSave`, invalid files rejected); pause (⏸/Space) and sim-speed
  (1x/2x/4x) controls. New-map/import now rebuild the palette and milestone panel
  immediately (previously stale until the next milestone change).
- Tests: offline-vs-online equivalence and cap, seed determinism, elevator unlock/
  phases/accepts-filter/victory, project-part reachability post-ladder, elevator
  save normalization.

## 2026-07-27 — Repo review cleanup

- **Docs**: pre-rebuild Flask-era docs (`DATA_PIPELINE.md`, `ENTITIES_CONTRACT.md`, the
  2026-06-21 frontend-shell spec/plan) archived to `docs/history/` with historical
  headers; `docs/SOURCE_OF_TRUTH.md` rewritten for the static app; README gains
  prerequisites and Windows notes.
- **Tooling**: `manage.sh` probes `python3`/`python`/`py` (skipping the fake Windows
  Store python); GitHub Actions runs `tests/test_sim.mjs` on push/PR; MIT LICENSE added.
- `fix:` a machine parked at "output full" no longer counts as a power supplier — a
  nuclear plant with a full waste output previously generated 2500 MW forever on zero
  fuel.
- `fix:` save loading goes through a new pure `normalizeSave()` in sim.js: nodes/wires
  whose keys are missing from the catalog are dropped instead of crashing the app at
  first render, defaults are filled, and transient `_net` is no longer persisted. The
  wire-drag preview now honors the S-toggled default style.
- **Tests**: merger throughput + conservation, pipe-splitter even fluid split, coal
  generator dual-resource burn and exhaustion, power throttling ratio < 1, `setRecipe`
  wire-dropping, milestone-ladder reachability (recursive producibility check per
  milestone), and `normalizeSave`.

## 2026-07-18 — Wire Styles, Waypoints & Tooltips

- **Per-wire render styles**: belts and pipes render as noodle (bezier curves) by
  default or straight polylines; toggle the style for the selected wire or set the
  default for new wires with the `S` keybind. Styles persist in saves.
- **Waypoint editing on straight wires**: double-click on a straight wire to add a
  waypoint; drag the waypoint handle to move it; press `Delete` to remove a waypoint
  before the selected wire.
- **Hover tooltips for ports and wires**: display resource type and flow rate (items/s
  or mL/s) for ports under the cursor, and resource type with belt/pipe mark for wires
  under the cursor. Tooltips update in real time during simulation.
- Wires with no explicit style or waypoint data normalize to noodle render on load,
  preserving backward compatibility with older saves.

## 2026-07-18 — Iteration 2

- **Deposits as wireable nodes**: mineral/oil deposits render as fixed, undeletable
  nodes with a `resource` out port; water deposits get 2/3/4 out ports by purity.
  Miners are placed on free tiles and wired to a matching deposit (one deposit port
  per miner). Mapgen's pre-existing bug where deposits could block the hub's spawn
  tile is fixed.
- **Biomass bootstrap replaces free HUB power**: mapgen scatters plant deposits that
  emit `leaves`/`wood`; a new biomass burner (30 MW, no power draw, wiki fuel-MJ
  table) burns them to power the early chain. The HUB no longer grants free power —
  it's purely the milestone sink.
- **7-milestone HUB ladder**: shipping the active milestone's required items into the
  HUB unlocks buildings and belt/pipe marks in order, gating the palette (locked
  entries greyed with the unlocking milestone named) and shown in a milestone HUD
  panel. Progress and unlocks persist in the save.
- **Splitters and mergers**: 1-tile logistic nodes (item and fluid/pipe variants) doing
  per-tick proportional fair-share distribution across connected wires; unlocked from
  the start.
- **Belt/pipe marks**: all 6 belts and 2 pipes from the source JSON are selectable per
  wire via the inspector, defaulting to the highest unlocked mark.
- Save format bumped to `gridworks-save-v2` (iteration-1 saves are not migrated).
- `fix:` follow-up — inspector wire-mark dropdown now falls back to the highest
  catalog mark when a state is missing `beltMark`/`pipeMark`; milestone reward pushes
  are deduped and 'Coal Power' no longer re-grants pipe-splitter/pipe-merger (already
  start-unlocked).

## 2026-07-18 — Project layout + manage.sh

- Moved app code to `src/` (`sim.js`, `game.js`, `style.css`) and the sim test to
  `tests/`; `index.html` stays at the repo root.
- Added `./manage.sh` (start/stop/restart/status/logs/test) wrapping the
  `python3 -m http.server` dev server, with PID/log files and a `PORT` override.
- Removed the stale `requirements.txt` (leftover from the lost Flask backend).

## 2026-07-16 — Static rebuild

The previous codebase (Flask app, Python sim, React frontend) was lost; only docs and
`data/source/satisfactory_data.json` survived. Rebuilt from scratch as a static web app
(no backend, no build step): `index.html` + `style.css` + `sim.js` (pure logic) +
`game.js` (canvas UI), tested by `test_sim.mjs`.

- Neon Upload-Labs-style grid canvas with pan/zoom
- Seeded random map: mineral deposits (weighted by `resources[].weight`, with purity),
  crude oil, and water sources
- Palette placement of miners (snap to matching deposits), all 12 production buildings,
  coal/fuel generators, storage container, fluid buffer
- Port-to-port wiring: belts (marching ants when flowing), pipes, power
- 10 Hz idle sim: power networks with supply/demand throttling, recipe crafting from
  the source JSON, generators burning fuel, HUB item sink with 30 MW bootstrap power
- Autosave to localStorage; "New Map" reset

Everything below this line describes the lost codebase and is kept as history.

## Unreleased (pre-loss history)

### Frontend Shell (new)

- Added a new React + TypeScript + Vite frontend shell (`frontend/`) with a React Flow
  canvas for placing Satisfactory buildings/miners and wiring ports by kind (item/fluid/
  power). Backed by a new `GET /api/catalog/v1` Flask endpoint reading
  `data/source/satisfactory_data.v1.json` directly. No simulation or persistence yet — see
  `docs/superpowers/specs/2026-06-21-frontend-node-graph-shell-design.md` for the roadmap.

### Server Simulation Integration

- **Sim control bar**: Play/pause/stop buttons and speed selector (0.5x–5x) in the UI
- **Server sim loop**: Client-side `serverSim` controller sends periodic `/api/sim/step` requests and applies snapshot results
- **Snapshot sync**: Node inventories, statuses, and edge utilization update from server snapshots
- **Power HUD**: Live display of total supply, demand, and power ratio
- **Edge utilization rendering**: Link opacity and width modulate based on snapshot edge utilization
- **`nodeState` alias**: `/api/sim/step` accepts `nodeState` as an alias for `initial_inventories`
- **`include_inventories` param**: Returns full inventory state in the snapshot response
- **Snapshot-driven port metrics**: In running server-sim mode, inspector/state-report port rates now derive from `snapshot.edges[*].moved_this_step`
- **Downstream visibility fix**: Pass-through/downstream nodes now show active flow from server snapshots instead of appearing idle when local sim is off

### Resource Deposits and Miners

- **14 deposit entities** (`data/overlays/entities.deposits.json`): iron ore, copper ore, limestone, coal (impure/normal/pure), water, and wood
- **Deposit overlay loading**: `gridworks/entities.py` merges deposits into the entity contract
- **Deposit validation**: `gridworks/validate.py` validates `"deposit"` category (requires `output_rate_per_min`, one output port, no input ports)
- **Miner→deposit sim linking** (`sim/build_graph_from_layout.py`): miners at the same grid position as a deposit become source nodes with `rate = min(miner_base_rate, deposit_rate) / 60`
- **Random map generation** (`static/js/mapgen.js`): ~28 deposits scattered across a 2000x2000 tile world on fresh games
- **Deposit rendering**: Earthy brown panels for ore/wood deposits, blue panels for water; name and rate labels; no port dots
- **Immovable deposits**: Cannot be dragged or deleted; selectable for inspection
- **Miner snap-to-deposit**: Miners auto-snap to the nearest deposit (within 8 tiles) when placed
- **Save persistence**: `deposit: true` flag preserved through save/load cycle

### UI Improvements

- **Port dot overlap fix**: Connection dots moved from `inset=14` to `inset=0` (panel edge), clearing content at `x+20`

### Internal

- Refactored `app.py` entity loading into `gridworks/entities.py` module
- Added `gridworks/normalize.py` for port normalization
- Added `sim/capacity.py` and `sim/snapshot.py` modules
- Added `static/js/util.js` for shared utilities
