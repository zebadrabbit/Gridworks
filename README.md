# Gridworks

A Satisfactory-themed grid idler in the visual style of Upload Labs: place miners on
randomly scattered deposits, wire up machines, containers, and power on a neon grid,
and watch resources flow.

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

- `docs/superpowers/specs/2026-07-18-iteration-2-design.md` — next iteration design
- `docs/superpowers/specs/2026-07-15-grid-idler-rebuild.md` — current build design + deferred work
- `docs/DATA_PIPELINE.md`, `data/ENTITIES_CONTRACT.md` — data policies (predate the rebuild)
