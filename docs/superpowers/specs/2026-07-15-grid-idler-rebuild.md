# Gridworks Rebuild — Static Grid Idler

## Context

The previous codebase (Flask `app.py`, `sim/`, `static/`, React `frontend/`) was lost; only
`docs/`, `data/ENTITIES_CONTRACT.md`, and `data/source/satisfactory_data.json` survive.
Rather than resurrect the Flask+React split, this rebuild is a single static web app —
no backend, no build step. `data/source/satisfactory_data.json` remains the immutable
source of truth, fetched directly by the browser.

## Look & feel

Upload Labs style: dark background, glowing grid lines, neon rounded panels per node,
port dots on panel edges, wires with animated marching ants when flow is active.

## Game model

- **World**: 120x80 tile grid, 32px tiles, pan/zoom canvas. Seeded mapgen scatters
  mineral/oil deposits (weighted by `resources[].weight`, purity impure/normal/pure =
  0.5x/1x/2x) and water patches. Deposits are immovable terrain.
- **Nodes**: miners (must sit on a matching deposit), production buildings (recipe chosen
  in inspector, from `recipes` filtered by building `category`), storage container,
  fluid buffer, generators, and the HUB (item sink + 30 MW free power — the bootstrap
  workaround for Satisfactory's biomass/hand-mining, which has no equivalent here).
- **Wires**: item (belt, 60/min), fluid (pipe, 300/min), power. Ports are derived per
  node: recipe ingredients → input ports, products → output ports, power draw → power-in.
  Kind-matched connections only.
- **Sim**: 10 Hz tick, always running (idler). Power networks via union-find over power
  wires; supply/demand ratio < 1 throttles everything on that network. Miners fill an
  output buffer, wires move items/fluids at wire rate, machines craft, generators burn
  fuel (coal gen 75 MW: 15 coal + 45 water /min; fuel gen 250 MW: 20 fuel/min — wiki
  stats, not in the JSON), HUB counts shipped items.
- **Persistence**: autosave to localStorage; Reset regenerates the map with a new seed.

## Files

- `index.html`, `style.css` — shell + panels (palette left, inspector right, HUD top)
- `sim.js` — pure logic: catalog build, mapgen, ports, connect rules, tick (node-testable)
- `game.js` — canvas rendering + input
- `test_sim.mjs` — assert-based sim self-check (`node test_sim.mjs`)

Run: `python3 -m http.server` from repo root, open http://localhost:8000.

## Deferred

Offline progress, belt/pipe mk upgrades, milestones/unlocks, overclocking, somersloops,
sound, minimap.

*(Since shipped: belt/pipe marks and milestones/unlocks in iteration 2 (2026-07-18);
offline progress on 2026-07-27 — see the specs of those dates.)*
