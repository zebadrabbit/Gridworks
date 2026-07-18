# Gridworks

A Satisfactory-themed grid idler in the visual style of Upload Labs: deposits are fixed
nodes you wire to miners, machines, containers, and power on a neon grid, and watch
resources flow. Bootstrap power comes from plant deposits feeding a biomass burner (the
HUB itself has no free power); ship items into the HUB to climb a 7-milestone ladder
that unlocks buildings and higher belt/pipe marks; splitters and mergers fan wires out
and back in with per-tick fair-share distribution.

`data/source/satisfactory_data.json` is the immutable source of truth for all items,
buildings, recipes, and resource weights (see `docs/SOURCE_OF_TRUTH.md`).

## Layout

```
index.html          app shell (served from repo root)
manage.sh           dev server control: start|stop|restart|status|logs|test
src/
  sim.js            pure game logic (no DOM): catalog, mapgen, ports, tick
  game.js           canvas rendering + input
  style.css         Upload-Labs-style dark theme
tests/
  test_sim.mjs      assert-based sim self-check
data/source/        source-of-truth JSON (immutable)
docs/               design specs, data policies
```

## Run

```bash
./manage.sh start        # serves http://localhost:8889 (8000/8888 taken; override: PORT=nnnn ./manage.sh start)
./manage.sh status       # is it up?
./manage.sh logs         # tail the server log
./manage.sh stop
```

No build step, no backend — the browser fetches the data JSON directly. Progress
autosaves to localStorage; "New Map" regenerates the world.

## Test

```bash
./manage.sh test         # runs node tests/test_sim.mjs
```

## Docs

- `docs/superpowers/specs/2026-07-18-iteration-2-design.md` — current design (deposit
  nodes, biomass bootstrap, milestones, belt/pipe marks, splitters/mergers)
- `docs/superpowers/specs/2026-07-15-grid-idler-rebuild.md` — current build design + deferred work
- `docs/DATA_PIPELINE.md`, `data/ENTITIES_CONTRACT.md` — data policies (predate the rebuild)
