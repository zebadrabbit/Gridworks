# Gridworks Resurrection — Phase 1: Frontend Node-Graph Shell

> **Historical** — this Flask + React resurrection path was abandoned when the codebase was
> lost; the 2026-07-16 static rebuild replaced it. Kept for reference only.

## Context

Gridworks is a Satisfactory-themed idle game in the style of Upload Labs (place nodes, wire
them together, watch resources flow, unlock more). The project stalled mid-migration: the
working tree has `docs/satisfactory_data.json`, `docs/source_of_truth.json`,
`docs/DATA_PIPELINE.md`, and `docs/SOURCE_OF_TRUTH.md` deleted, in favor of a new
`docs/satisfactory_data.v1.json`, but nothing in the codebase reads the new file yet —
`gridworks/source_of_truth.py` and the `tools/derive_*.py` pipeline still hardcode the old
path. The existing Python sim (`sim/`, `gridworks/`) and vanilla-JS frontend
(`static/js/`, `templates/`) are kept as reference/prior art, not extended further.

This resurrection redesigns the game in phases:

1. **Frontend node-graph shell** (this doc) — a sandbox canvas for placing machines and
   wiring ports, backed by a fresh read of `satisfactory_data.v1.json`. No simulation.
2. Idle-tick simulation core (production rates, offline progress, save format) — future doc.
3. End-to-end integration (wire the shell to the sim, persistence, power, unlocks) — future doc.

Each phase gets its own spec → plan → implementation cycle, committed incrementally so the
project can be picked up and resumed at any point.

## Goals (Phase 1)

- Stand up a modern frontend (React + TypeScript + Vite) with a connector-and-wire canvas,
  replacing `static/js`/`templates` as the long-term UI (old UI stays in place until parity).
- Serve `satisfactory_data.v1.json` through a new, minimal Flask endpoint — not by patching
  the legacy `gridworks/source_of_truth.py` pipeline, which carries milestone/derivation
  concerns this phase doesn't need.
- Let a user: see a palette of buildings/miners by category, drag one onto a canvas, see its
  ports, drag wires between compatible ports, and inspect a selected node's recipe.
- No simulation, no flow math, no persistence. Wires are visual only.

## Non-goals (deferred to later phases)

- Idle-tick simulation, offline progress, production rate math.
- Save/load, persistence of any kind.
- Power system, fuel gating, throttling.
- Milestones/unlock progression.
- Removing `static/js`/`templates`/`sim`/legacy `gridworks` modules — they stay as reference
  until the new stack reaches parity, then get removed in a later cleanup phase.

## Architecture

```
frontend/                     # new Vite + React + TS app
  src/
    api/catalog.ts            # fetch + types for /api/catalog/v1
    components/Palette.tsx
    components/Canvas.tsx     # React Flow wrapper
    components/Inspector.tsx
    App.tsx
  package.json / vite.config.ts / tsconfig.json

gridworks/web/routes/catalog_v1.py   # new Flask blueprint
  GET /api/catalog/v1 -> normalized catalog JSON

docs/satisfactory_data.v1.json       # source of truth, read directly (no derive step)
```

The existing `app.py`, `sim/`, legacy `gridworks/*.py`, `static/`, `templates/` are untouched
in this phase. The new Flask blueprint is registered alongside the existing routes so both
UIs can run side by side during the transition.

### Backend: catalog endpoint

`gridworks/web/routes/catalog_v1.py` loads `docs/satisfactory_data.v1.json` once (module-level
cache, reloadable via a `?refresh=1` query param for dev convenience) and returns a normalized
shape:

```json
{
  "items": [{ "key_name": "iron-ore", "name": "Iron Ore", "tier": -1 }],
  "fluids": [...],
  "recipes": [{ "key_name": "iron-ingot", "ingredients": [...], "products": [...] }],
  "buildings": [
    {
      "key_name": "constructor",
      "name": "Constructor",
      "category": "crafting1",
      "power": 4,
      "ports": [
        { "id": "in-0", "direction": "input", "kind": "item" },
        { "id": "out-0", "direction": "output", "kind": "item" },
        { "id": "power-in", "direction": "input", "kind": "power" }
      ]
    }
  ],
  "miners": [{ "key_name": "miner-mk1", "ports": [{ "id": "out-0", "direction": "output", "kind": "item" }, ...] }],
  "belts": [...],
  "pipes": [...],
  "resources": [...]
}
```

Port inference rules (fresh, minimal — not a port of the old derive pipeline):
- Buildings: one input + one output item port per recipe slot (most buildings: 1 in, 1 out;
  refineries/blenders/packagers may have 2 in); add a power-input port if `power > 0`.
- Miners: one output item port; add a power-input port if `power > 0`.
- Belts/pipes are edge types (link metadata: rate), not nodes — no ports.

### Frontend: canvas shell

- **React Flow** (`@xyflow/react`) provides the canvas: pan/zoom, draggable nodes, port
  handles, edge dragging, selection.
- `Palette`: grouped list (by `category`) of buildings/miners fetched from the catalog;
  drag-and-drop (HTML5 DnD or click-to-place) onto the canvas creates a React Flow node.
- `Canvas`: renders nodes with handles per the catalog's `ports` array; on edge-connect,
  validates `kind` (item/fluid/power) matches on both ends before accepting the edge —
  mismatches are rejected with a brief inline message, no other validation.
- `Inspector`: shows the selected node's recipe (ingredients → products) and base stats
  (power draw, category) read straight from the catalog payload already in memory.
- No client-side state persistence — refreshing the page resets the canvas. (Persistence is
  Phase 3's concern.)

### Testing

- Backend: `tests/test_catalog_v1_endpoint.py` — shape assertions (every building has a
  `ports` list, port count matches inference rules, item/recipe counts match the source JSON
  files' lengths).
- Frontend: Vitest + React Testing Library — palette renders all categories from a fixture
  catalog payload; dropping a palette item creates a node; connecting two compatible ports
  creates an edge; connecting incompatible ports is rejected.
- No e2e/browser automation in this phase.

## Documentation & commit discipline

Per the user's request, work proceeds in small, individually committed steps with docs
updated alongside code, so the project can be paused and resumed at any point:

- Each implementation step (scaffold frontend, add catalog endpoint, add palette, add canvas,
  add inspector, add tests) is its own commit with a clear message.
- `README.md` gets a new "Frontend (new)" section once the Vite app exists, with run
  instructions (`npm install && npm run dev`) alongside the existing Flask instructions.
- `CHANGELOG.md` gets an entry for this phase once it's functionally complete.
- This spec and its implementation plan live under `docs/superpowers/` so future sessions
  (including a cold resume) can find the roadmap and current phase without re-deriving it.

## Open questions for later phases (not blocking Phase 1)

- Exact idle-tick model (real-time accrual vs. discrete steps) — Phase 2.
- Whether `sim/`/legacy `gridworks/` modules are deleted outright or kept as a reference
  package — decide during the Phase 3 cleanup, once the new sim exists.
