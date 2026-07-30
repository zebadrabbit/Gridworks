# Gridworks

A Satisfactory-themed grid idler in the visual style of Upload Labs: deposits are fixed
nodes you wire to miners, machines, containers, and power on a neon grid, and watch
resources flow. Bootstrap power comes from plant deposits feeding a biomass burner (the
HUB itself has no free power); ship items into the HUB to climb a 7-milestone ladder
that unlocks buildings and higher belt/pipe marks; splitters and mergers fan wires out
and back in with per-tick fair-share distribution. The ladder ends at the Space
Elevator: ship Project Assembly parts through 4 phases to win. Progress keeps
accruing while the tab is closed (offline progress, capped at 8h). Every node's
status lights red/yellow/green, a `⚠ N` HUD chip lists what needs attention and
pans the camera there on click, and the inspector tracks each machine's lifetime
uptime and production. Ore is tiered by distance from the HUB — iron and limestone
at your feet, uranium out past the horizon — with a guaranteed playable start, and a
minimap tracks your factory's health across a map that fog reveals as you build into it.

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

## Prerequisites

- **Serving the game**: any static file server. `manage.sh` uses Python's
  (`python3`, `python`, or `py` — whichever exists) and needs a bash shell
  (Git Bash works on Windows).
- **Tests**: [Node.js](https://nodejs.org) (any recent version). CI runs them on
  every push, so a local install is optional.

## Run

```bash
./manage.sh start        # serves http://localhost:8889 (8000/8888 taken; override: PORT=nnnn ./manage.sh start)
./manage.sh status       # is it up?
./manage.sh logs         # tail the server log
./manage.sh stop
```

Windows without bash: run `python -m http.server 8889` from the repo root and open
http://localhost:8889.

No build step, no backend — the browser fetches the data JSON directly. Progress
autosaves to localStorage; "New Map" regenerates the world.

## Test

```bash
./manage.sh test         # runs node tests/test_sim.mjs
```

Tests also run in CI (GitHub Actions) on every push and pull request.

## Docs

- `docs/superpowers/specs/2026-07-29-the-world-design.md` — tiered ore, fog of war,
  minimap
- `docs/superpowers/specs/2026-07-29-know-your-factory-design.md` — status lights,
  alerts, machine analytics
- `docs/superpowers/specs/2026-07-27-*.md` — offline progress, QoL (seed/save/pause),
  space elevator end-goal
- `docs/superpowers/specs/2026-07-18-iteration-2-design.md` — current design (deposit
  nodes, biomass bootstrap, milestones, belt/pipe marks, splitters/mergers)
- `docs/superpowers/specs/2026-07-15-grid-idler-rebuild.md` — current build design + deferred work
- `docs/SOURCE_OF_TRUTH.md` — data policy (immutable source JSON, hardcoded wiki stats)
- `docs/history/` — docs for the lost pre-rebuild Flask codebase, kept for reference
