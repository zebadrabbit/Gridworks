# Gridworks — Improvement TODO

Findings from reviewing the offline-generated prototype. Ordered by impact.

## Bugs (fixed in this pass)
- [x] `backend/app.py` had no `/api/items` route, but `Engine.js` fetches it on init — game couldn't load. Added it.
- [x] `frontend/src/game/UI.js` didn't import PIXI and didn't `export` `BuildMenu` — `Engine.js`'s `import { BuildMenu } from './UI.js'` would throw at runtime. Fixed.
- [x] `BuildMenu` set `this.selectedType` on click but `GameEngine` reads `this.selectedType_global` — build menu clicks never actually selected a building to place. Wired it through.

## Bugs (not fixed — need a decision)
- [ ] No `package.json` for the frontend at all. `App.js`/`Engine.js`/`UI.js` are React + PixiJS source with no build tooling, so nothing currently runs. Needs a bundler choice (Vite recommended over CRA — CRA is unmaintained) before the frontend can be installed/run/tested.
- [ ] `tests/core_mechanics.js` re-implements a copy of the `Building` class inline instead of importing the real one from `Engine.js`. It will keep passing even if the real `Engine.js` logic breaks. Once a bundler exists, point the test at the real module.
- [ ] `tests/mock_pixi.js` is an unused, half-finished stub (its own comments say "I'll just write test logic assuming Engine is available") — not wired into any runner. Either finish it or delete it.
- [ ] `Conveyor.update()` in `Engine.js` references `this.gridSize`, but `Conveyor` never stores `gridSize` on itself (only the engine does) — `offset` is computed against `undefined`, so the moving-belt-texture animation is silently broken (NaN). Should read `this.engine.gridSize`.
- [ ] `updatePower()` in `Engine.js` is O(buildings²) per tick and re-walks from every battery every frame with no caching — fine at prototype scale, will not scale to a real factory grid.

## Backend
- [ ] No `requirements.txt` existed (added: Flask, flask-cors). Pin versions as the project grows instead of trusting `pip install flask` floating.
- [ ] `app.run(debug=True)` is fine for local dev but must not ship if this is ever deployed — Flask's debugger allows remote code execution if exposed.
- [ ] `a_star`'s open-set membership check (`if neighbor not in o_open_set`) compares against `(fscore, coord)` tuples, so it's always true and never actually dedupes — not a correctness bug (gscore still gates relaxation) but it pushes redundant entries onto the heap. Harmless at current grid sizes; revisit if pathfinding becomes a hot path.

## Testing
- [x] Backend: `backend/test_suite.py` (unittest) — 4 tests, all passing. Run via `.venv/bin/python -m unittest test_suite` from `backend/`.
- [x] Frontend logic: `tests/core_mechanics.js` — 2 tests, all passing via plain `node tests/core_mechanics.js`. (See "not fixed" above — it tests a duplicate, not the real `Engine.js`.)
- [ ] No CI. Once there's a `package.json`, wire both suites into a GitHub Actions workflow.

## Process
- [ ] `DEFERRED.md` and `docs/deferred_items.md` overlap heavily (both track unbuilt buildings/mechanics) — worth merging into one file.
- [ ] `docs/data1.0.json:Zone.Identifier` is a Windows download-metadata artifact, not project data — safe to delete.
