# Gridworks

A browser-based factory-builder prototype (Satisfactory-inspired): place
buildings on a grid, connect them with conveyors routed by A* pathfinding,
and run simple production recipes.

- **Backend** — Flask API serving building/recipe/item data and pathfinding (`backend/`).
- **Frontend** — React + PixiJS game client (`frontend/`).

## Status

Early prototype. The core loop (place buildings, route a conveyor between two
ports, smelter consumes ore and produces ingots) works; most content
(advanced buildings, power grid, save/load) is unbuilt. See
[`docs/deferred_items.md`](docs/deferred_items.md) for what's planned and
[`TODO.md`](TODO.md) for known issues and in-progress cleanup.

## Backend

```bash
cd backend
python -m venv ../.venv && ../.venv/bin/pip install -r requirements.txt
../.venv/bin/python app.py        # serves on http://localhost:5000
```

Run tests:

```bash
cd backend
python -m unittest test_suite -v
```

## Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, expects the backend on :5000
```

Run tests:

```bash
cd frontend
npm test
```

Build for production:

```bash
npm run build
```

## CI

`.github/workflows/ci.yml` runs the backend unittest suite and the frontend
vitest suite + build on every push and pull request.
