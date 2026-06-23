# Gridworks — Improvement TODO

Findings from reviewing the offline-generated prototype, in the order they were tackled.

## Done

### Bugs fixed
- [x] `backend/app.py` had no `/api/items` route, but `Engine.js` fetches it on init — game couldn't load. Added it.
- [x] `frontend/src/game/UI.js` didn't import PIXI and didn't `export` `BuildMenu` — `Engine.js`'s `import { BuildMenu } from './UI.js'` would throw at runtime. Fixed.
- [x] `BuildMenu` set `this.selectedType` on click but `GameEngine` read `this.selectedType_global` — build menu clicks never actually selected a building to place. Wired it through.
- [x] `Conveyor.update()` referenced `this.gridSize`, which `Conveyor` never sets (only the engine has it) — the belt-texture scroll offset was `NaN`. Now reads `this.engine.gridSize`.

### Tooling
- [x] Added `backend/requirements.txt` (Flask, flask-cors) — nothing pinned its deps before.
- [x] Added a real frontend build: Vite + React, `frontend/package.json`, `frontend/index.html`, `frontend/src/main.jsx`. `npm run build` and `npm run dev` both work now; previously there was no way to run the frontend at all.
- [x] Formatted all backend Python with `black`, all frontend JS with `prettier` (`frontend/.prettierrc.json`).

### Testing
- [x] Backend: `backend/test_suite.py` (unittest, 4 tests) — run via `python -m unittest test_suite` from `backend/`.
- [x] Frontend: replaced `tests/core_mechanics.js`, which re-implemented a copy of the `Building` class instead of testing the real one (so it could never catch a real regression). New suite at `frontend/src/game/Engine.test.js` (vitest, 5 tests) imports the actual `Building` class from `Engine.js` and mocks `pixi.js` via `frontend/src/test/pixiMock.js`. Run via `npm test` from `frontend/`.
- [x] Added `.github/workflows/ci.yml` running both suites (and the frontend build) on push/PR.

### Housekeeping
- [x] Merged `DEFERRED.md` and `docs/deferred_items.md` (they tracked the same unbuilt buildings/mechanics) into `docs/deferred_items.md`; deleted the root duplicate.
- [x] Deleted `docs/data1.0.json:Zone.Identifier`, a Windows download-metadata artifact, not project data.
- [x] Initialized git, added `.gitignore` (`node_modules/`, `.venv/`, `dist/`, `__pycache__/`, etc.).

## Still open (deliberately left alone)

- [ ] `npm audit` flags moderate/high vulns in `esbuild`/`vite`'s dev server (arbitrary request forwarding when the dev server is exposed). Dev-only, not in the production bundle. A fix requires a Vite 6 major bump — didn't do that opportunistically since it can change config semantics; bump deliberately later and re-run the suite.
- [ ] `a_star`'s open-set membership check (`if neighbor not in o_open_set`) compares against `(fscore, coord)` tuples, so it's always true and never actually dedupes. Not a correctness bug — `gscore` still gates relaxation — just pushes redundant heap entries. Harmless at current grid sizes; revisit if pathfinding becomes a hot path on a bigger map.
- [ ] `updatePower()` in `Engine.js` is O(buildings²) per tick, re-walked from every battery every frame with no caching. Fine at prototype scale; won't scale to a large factory. Rebuild as an incremental/cached graph if it becomes a bottleneck.
- [ ] `app.run(debug=True)` in `backend/app.py` is fine for local dev but must be turned off before any real deployment — Flask's debugger allows remote code execution if reachable.
- [ ] No persistence (save/load) — tracked already in `docs/deferred_items.md` under Mechanics.
- [ ] No `eslint` config for the frontend. Prettier handles formatting; didn't add a linter since no lint rules were requested and it's an easy follow-up if wanted.
