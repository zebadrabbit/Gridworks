# Changelog

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
