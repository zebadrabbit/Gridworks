# Changelog

## Unreleased

### Fixed
- `Engine.js` treated `/api/buildings`, `/api/recipes`, and `/api/items`
  responses as bare arrays/maps, but the backend wraps each in an envelope
  (`{"buildings": {...}}`, `{"recipes": [...]}`, `{"items": {...}}`).
  `buildingsData[type]` and the recipe lookup were silently undefined for
  every building — fixed by unwrapping the envelope on fetch.
- Backend had no `/api/items` route even though the frontend fetched it on
  startup.
- `frontend/src/game/UI.js` never imported `pixi.js` or exported `BuildMenu`,
  so `Engine.js`'s import of it would throw at runtime.
- Build menu clicks set `BuildMenu.selectedType` but `GameEngine` read
  `selectedType_global` — clicking a building in the menu never selected it
  for placement.
- `Conveyor.update()` read `this.gridSize` (undefined on `Conveyor`) instead
  of `this.engine.gridSize`, making the belt scroll animation `NaN`.

### Added
- Frontend build tooling: Vite + React (`package.json`, `index.html`,
  `main.jsx`) — the frontend previously had no way to run or build at all.
- Real frontend test suite (`frontend/src/game/Engine.test.js`, vitest)
  exercising the actual `Building` class via a `pixi.js` mock
  (`frontend/src/test/pixiMock.js`).
- `backend/requirements.txt` (Flask, flask-cors).
- `.github/workflows/ci.yml`: backend unittest + frontend vitest/build on
  push and PR.
- `README.md`, this changelog, `TODO.md` tracking open issues.

### Changed
- Reformatted all backend Python with `black` and frontend JS with
  `prettier`.
- Merged the two duplicate deferred-items docs (`DEFERRED.md` and
  `docs/deferred_items.md`) into `docs/deferred_items.md`.

### Removed
- `tests/core_mechanics.js` and `tests/mock_pixi.js` — the former
  re-implemented a duplicate of the `Building` class instead of testing the
  real one, so it could pass while the actual engine logic was broken;
  superseded by `frontend/src/game/Engine.test.js`.
- `docs/data1.0.json:Zone.Identifier`, a Windows download-metadata artifact.

## 0.1.0 — initial import

Offline-generated prototype: Flask backend (buildings/recipes/items data,
A* pathfinding), React + PixiJS frontend (grid placement, conveyors,
production), unittest backend tests, and a standalone Node test script for
core game logic.
