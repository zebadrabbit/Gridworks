# Frontend Node-Graph Shell Implementation Plan

> **Historical** — this Flask + React resurrection path was abandoned when the codebase was
> lost; the 2026-07-16 static rebuild replaced it. Kept for reference only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a new React + TypeScript + Vite frontend with a connector-and-wire canvas (React Flow) for placing Satisfactory buildings/miners and wiring their ports, backed by a new Flask endpoint that serves `docs/satisfactory_data.v1.json` directly. No simulation, no persistence — visual sandbox only.

**Architecture:** A new `gridworks/web/routes/catalog_v1.py` module loads and normalizes `docs/satisfactory_data.v1.json` (adding inferred `ports` to buildings/miners) and is wired into `app.py`'s existing `create_app()` via `@app.get` routes, following the codebase's existing inline-route style. A new `frontend/` Vite app fetches that endpoint once, renders a category-grouped palette, and uses React Flow for the canvas — dragging a palette entry creates a node with handles per its `ports`; dragging between compatible-kind handles creates an edge; selecting a node shows its recipe in an inspector panel.

**Tech Stack:** Python 3.12 / Flask 2.3–4 (existing), pytest (existing). New: Node 20, React 18, TypeScript 5, Vite 5, `@xyflow/react`, Vitest, React Testing Library.

## Global Constraints

- Source of truth for game data is `docs/satisfactory_data.v1.json` — read it directly, do not extend `gridworks/source_of_truth.py` or the `tools/derive_*.py` pipeline (those target the deleted `docs/satisfactory_data.json` and carry milestone/derivation concerns out of scope here).
- Existing `app.py`, `sim/`, `static/`, `templates/` are untouched in this phase — the new catalog route is additive, registered alongside existing routes in `create_app()`.
- No simulation, flow math, power math, or persistence in this phase — wires are visual only.
- Every implementation task ends in its own commit (per user request: small, resumable, documented steps).
- Backend route style: inline `@app.get(...)` closures inside `create_app()`, matching `app.py`'s existing pattern (see `app.py:48-59`) — not Flask Blueprints.

---

## Task 1: Catalog normalizer module

**Files:**
- Create: `gridworks/web/catalog_v1.py`
- Test: `tests/test_catalog_v1_normalize.py`

**Interfaces:**
- Consumes: `docs/satisfactory_data.v1.json` (raw dict with keys `belts`, `pipes`, `buildings`, `miners`, `items`, `fluids`, `recipes`, `resources`).
- Produces: `load_catalog_v1(path: pathlib.Path) -> dict` — returns the normalized payload described below. Later tasks (the Flask route) call this function directly.

Port inference rules (apply in `load_catalog_v1`):
- Buildings with `category` in `{"refining", "blending", "packaging"}` get 2 item-input ports; all other buildings get 1 item-input port. Every building gets exactly 1 item-output port (sufficient for this phase; multi-product recipes are not modeled yet).
- Every building/miner with `power > 0` (strictly greater than zero) gets exactly 1 power-input port. `power == 0` (e.g. `accelerator`, `nuclear-power-plant` in the current data) gets none.
- Miners get exactly 1 item-output port, plus a power-input port if `power > 0`.
- Port `id` values are deterministic: `"item-in-0"`, `"item-in-1"`, `"item-out-0"`, `"power-in-0"`.
- Belts/pipes/items/fluids/recipes/resources pass through unchanged from the source JSON (no ports — they aren't graph nodes in this phase).

```python
# gridworks/web/catalog_v1.py
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

TWO_INPUT_CATEGORIES = {"refining", "blending", "packaging"}


def _item_input_ports(category: str) -> list[dict[str, str]]:
    count = 2 if category in TWO_INPUT_CATEGORIES else 1
    return [{"id": f"item-in-{i}", "direction": "input", "kind": "item"} for i in range(count)]


def _ports_for_building(building: dict[str, Any]) -> list[dict[str, str]]:
    ports = list(_item_input_ports(building.get("category", "")))
    ports.append({"id": "item-out-0", "direction": "output", "kind": "item"})
    if building.get("power", 0) > 0:
        ports.append({"id": "power-in-0", "direction": "input", "kind": "power"})
    return ports


def _ports_for_miner(miner: dict[str, Any]) -> list[dict[str, str]]:
    ports = [{"id": "item-out-0", "direction": "output", "kind": "item"}]
    if miner.get("power", 0) > 0:
        ports.append({"id": "power-in-0", "direction": "input", "kind": "power"})
    return ports


def load_catalog_v1(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))

    buildings = [
        {**b, "ports": _ports_for_building(b)} for b in raw.get("buildings", [])
    ]
    miners = [
        {**m, "ports": _ports_for_miner(m)} for m in raw.get("miners", [])
    ]

    return {
        "items": raw.get("items", []),
        "fluids": raw.get("fluids", []),
        "recipes": raw.get("recipes", []),
        "buildings": buildings,
        "miners": miners,
        "belts": raw.get("belts", []),
        "pipes": raw.get("pipes", []),
        "resources": raw.get("resources", []),
    }
```

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_catalog_v1_normalize.py
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from gridworks.web.catalog_v1 import load_catalog_v1

FIXTURE = {
    "belts": [{"name": "Conveyor Belt", "key_name": "belt1", "rate": 60}],
    "pipes": [],
    "buildings": [
        {"name": "Constructor", "key_name": "constructor", "category": "crafting1", "power": 4},
        {"name": "Refinery", "key_name": "oil-refinery", "category": "refining", "power": 30},
        {"name": "Accelerator", "key_name": "accelerator", "category": "accelerating", "power": 0},
    ],
    "miners": [
        {"name": "Miner MK1", "key_name": "miner-mk1", "category": "mineral", "base_rate": 60, "power": 5},
    ],
    "items": [{"name": "Iron Ore", "key_name": "iron-ore", "tier": -1}],
    "fluids": [],
    "recipes": [{"name": "Iron Ingot", "key_name": "iron-ingot", "category": "smelting1", "time": 2,
                 "ingredients": [["iron-ore", 1]], "products": [["iron-ingot", 1]]}],
    "resources": [{"key_name": "iron-ore", "category": "mineral", "priority": 1, "weight": 307}],
}


class TestLoadCatalogV1(unittest.TestCase):
    def setUp(self):
        self.tmpdir = TemporaryDirectory()
        self.path = Path(self.tmpdir.name) / "data.json"
        self.path.write_text(json.dumps(FIXTURE), encoding="utf-8")

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_pass_through_sections_unchanged(self):
        catalog = load_catalog_v1(self.path)
        self.assertEqual(catalog["items"], FIXTURE["items"])
        self.assertEqual(catalog["recipes"], FIXTURE["recipes"])
        self.assertEqual(catalog["resources"], FIXTURE["resources"])
        self.assertEqual(catalog["belts"], FIXTURE["belts"])

    def test_single_input_building_gets_one_input_one_output_one_power(self):
        catalog = load_catalog_v1(self.path)
        constructor = next(b for b in catalog["buildings"] if b["key_name"] == "constructor")
        ports = constructor["ports"]
        self.assertEqual(
            ports,
            [
                {"id": "item-in-0", "direction": "input", "kind": "item"},
                {"id": "item-out-0", "direction": "output", "kind": "item"},
                {"id": "power-in-0", "direction": "input", "kind": "power"},
            ],
        )

    def test_refining_category_gets_two_inputs(self):
        catalog = load_catalog_v1(self.path)
        refinery = next(b for b in catalog["buildings"] if b["key_name"] == "oil-refinery")
        input_ports = [p for p in refinery["ports"] if p["direction"] == "input" and p["kind"] == "item"]
        self.assertEqual(len(input_ports), 2)
        self.assertEqual([p["id"] for p in input_ports], ["item-in-0", "item-in-1"])

    def test_zero_power_building_has_no_power_port(self):
        catalog = load_catalog_v1(self.path)
        accelerator = next(b for b in catalog["buildings"] if b["key_name"] == "accelerator")
        power_ports = [p for p in accelerator["ports"] if p["kind"] == "power"]
        self.assertEqual(power_ports, [])

    def test_miner_gets_one_output_and_power_port(self):
        catalog = load_catalog_v1(self.path)
        miner = next(m for m in catalog["miners"] if m["key_name"] == "miner-mk1")
        self.assertEqual(
            miner["ports"],
            [
                {"id": "item-out-0", "direction": "output", "kind": "item"},
                {"id": "power-in-0", "direction": "input", "kind": "power"},
            ],
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_catalog_v1_normalize.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'gridworks.web.catalog_v1'`

- [ ] **Step 3: Create `gridworks/web/catalog_v1.py` with the implementation shown above**

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_catalog_v1_normalize.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add gridworks/web/catalog_v1.py tests/test_catalog_v1_normalize.py
git commit -m "feat: add satisfactory_data.v1 catalog normalizer with port inference"
```

---

## Task 2: Flask catalog endpoint

**Files:**
- Modify: `app.py` (add route registration inside `create_app()`, near the other `@app.get` routes at `app.py:48-58`)
- Test: `tests/test_catalog_v1_endpoint.py`

**Interfaces:**
- Consumes: `load_catalog_v1` from Task 1 (`gridworks.web.catalog_v1`).
- Produces: `GET /api/catalog/v1` — JSON body matching `load_catalog_v1`'s return shape. Frontend (Task 3+) fetches this exact path.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_catalog_v1_endpoint.py
import unittest

from app import create_app


class TestCatalogV1Endpoint(unittest.TestCase):
    def test_returns_buildings_with_ports(self):
        app = create_app()
        client = app.test_client()

        res = client.get("/api/catalog/v1")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()

        self.assertIn("buildings", body)
        self.assertIn("miners", body)
        constructor = next(b for b in body["buildings"] if b["key_name"] == "constructor")
        self.assertIn("ports", constructor)
        self.assertTrue(len(constructor["ports"]) >= 2)

    def test_recipe_and_item_counts_match_source_file(self):
        import json
        from pathlib import Path

        raw = json.loads(Path("docs/satisfactory_data.v1.json").read_text(encoding="utf-8"))

        app = create_app()
        client = app.test_client()
        body = client.get("/api/catalog/v1").get_json()

        self.assertEqual(len(body["items"]), len(raw["items"]))
        self.assertEqual(len(body["recipes"]), len(raw["recipes"]))
        self.assertEqual(len(body["buildings"]), len(raw["buildings"]))
        self.assertEqual(len(body["miners"]), len(raw["miners"]))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_catalog_v1_endpoint.py -v`
Expected: FAIL with 404 (route does not exist) — `self.assertEqual(res.status_code, 200)` fails, actual 404.

- [ ] **Step 3: Add the route to `app.py`**

Add this import near the other `gridworks`/`sim` imports at the top of `app.py` (after the existing `from gridworks.entities import (...)` block, before `from sim.snapshot import snapshot_from_graph`):

```python
from pathlib import Path

from gridworks.web.catalog_v1 import load_catalog_v1

SATISFACTORY_DATA_V1_PATH = Path("docs/satisfactory_data.v1.json")
```

Add this route inside `create_app()`, directly after the existing `@app.get("/api/entities")` block (`app.py:52-57`):

```python
    @app.get("/api/catalog/v1")
    def api_catalog_v1():
        if not SATISFACTORY_DATA_V1_PATH.exists():
            return jsonify({"error": "satisfactory_data.v1.json not found"}), 500
        catalog = load_catalog_v1(SATISFACTORY_DATA_V1_PATH)
        return jsonify(catalog)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_catalog_v1_endpoint.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add app.py tests/test_catalog_v1_endpoint.py
git commit -m "feat: serve satisfactory_data.v1 catalog at GET /api/catalog/v1"
```

---

## Task 3: Scaffold the Vite + React + TypeScript frontend

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/vitest.setup.ts`

**Interfaces:**
- Produces: a buildable, testable Vite app shell. `App.tsx` exports a default `App` component rendering a placeholder `<h1>Gridworks</h1>` — later tasks replace its contents with `Palette`/`Canvas`/`Inspector`.

- [ ] **Step 1: Scaffold the Vite project**

Run from the repo root:

```bash
npm create vite@latest frontend -- --template react-ts
```

When prompted, accept defaults. This creates `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, and supporting files.

- [ ] **Step 2: Install dependencies plus test tooling**

```bash
cd frontend
npm install
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
cd ..
```

- [ ] **Step 3: Add Vitest config**

Edit `frontend/vite.config.ts` to add a `test` block (merge into the existing `defineConfig` call):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    globals: true,
  },
})
```

Create `frontend/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom'
```

Add a `test` script to `frontend/package.json`'s `"scripts"` block:

```json
"test": "vitest run"
```

- [ ] **Step 4: Replace `frontend/src/App.tsx` with a minimal placeholder**

```tsx
function App() {
  return <h1>Gridworks</h1>
}

export default App
```

- [ ] **Step 5: Write the failing test**

```tsx
// frontend/src/App.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the Gridworks heading', () => {
    render(<App />)
    expect(screen.getByText('Gridworks')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: 1 passed (it should pass immediately since `App.tsx` already matches; this confirms the test harness itself works end-to-end before later tasks add real logic)

- [ ] **Step 7: Verify the dev build runs**

Run: `cd frontend && npm run build`
Expected: exits 0, produces `frontend/dist/`

- [ ] **Step 8: Add `frontend/node_modules` and `frontend/dist` to `.gitignore`**

Append to the repo-root `.gitignore`:

```
frontend/node_modules
frontend/dist
```

- [ ] **Step 9: Commit**

```bash
git add frontend .gitignore
git commit -m "feat: scaffold Vite + React + TypeScript frontend shell"
```

---

## Task 4: Catalog fetch client + types

**Files:**
- Create: `frontend/src/api/catalog.ts`, `frontend/src/api/catalog.test.ts`

**Interfaces:**
- Consumes: `GET /api/catalog/v1` (Task 2's exact response shape).
- Produces: `export type Port = { id: string; direction: 'input' | 'output'; kind: 'item' | 'fluid' | 'power' }`, `export type Building = { key_name: string; name: string; category: string; power: number; ports: Port[] }`, `export type Miner = { key_name: string; name: string; category: string; power: number; ports: Port[] }`, `export type Catalog = { items: unknown[]; fluids: unknown[]; recipes: Recipe[]; buildings: Building[]; miners: Miner[]; belts: unknown[]; pipes: unknown[]; resources: unknown[] }`, `export type Recipe = { key_name: string; name: string; category: string; time: number; ingredients: [string, number][]; products: [string, number][] }`, `export async function fetchCatalog(): Promise<Catalog>`. `Palette`/`Canvas`/`Inspector` (Tasks 5-7) import these types and `fetchCatalog`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/api/catalog.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { fetchCatalog } from './catalog'

describe('fetchCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches and returns the parsed catalog JSON', async () => {
    const mockCatalog = { items: [], fluids: [], recipes: [], buildings: [], miners: [], belts: [], pipes: [], resources: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCatalog,
    }))

    const result = await fetchCatalog()

    expect(fetch).toHaveBeenCalledWith('/api/catalog/v1')
    expect(result).toEqual(mockCatalog)
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    await expect(fetchCatalog()).rejects.toThrow('catalog fetch failed: 500')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- catalog.test.ts`
Expected: FAIL — `frontend/src/api/catalog.ts` does not exist

- [ ] **Step 3: Implement `frontend/src/api/catalog.ts`**

```ts
export type Port = {
  id: string
  direction: 'input' | 'output'
  kind: 'item' | 'fluid' | 'power'
}

export type Building = {
  key_name: string
  name: string
  category: string
  power: number
  ports: Port[]
}

export type Miner = {
  key_name: string
  name: string
  category: string
  power: number
  ports: Port[]
}

export type Recipe = {
  key_name: string
  name: string
  category: string
  time: number
  ingredients: [string, number][]
  products: [string, number][]
}

export type Catalog = {
  items: unknown[]
  fluids: unknown[]
  recipes: Recipe[]
  buildings: Building[]
  miners: Miner[]
  belts: unknown[]
  pipes: unknown[]
  resources: unknown[]
}

export async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch('/api/catalog/v1')
  if (!res.ok) {
    throw new Error(`catalog fetch failed: ${res.status}`)
  }
  return res.json() as Promise<Catalog>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- catalog.test.ts`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/catalog.ts frontend/src/api/catalog.test.ts
git commit -m "feat: add catalog fetch client and types"
```

---

## Task 5: Install React Flow and add Canvas with palette-driven node creation

**Files:**
- Create: `frontend/src/components/Canvas.tsx`, `frontend/src/components/Canvas.test.tsx`, `frontend/src/components/Palette.tsx`, `frontend/src/components/Palette.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `Catalog`, `Building`, `Miner`, `Port` from `frontend/src/api/catalog.ts` (Task 4).
- Produces: `export function Palette(props: { catalog: Catalog; onSelect: (entry: Building | Miner) => void }): JSX.Element` — renders entries grouped by `category`, calls `onSelect` on click. `export function Canvas(props: { catalog: Catalog }): JSX.Element` — owns React Flow node/edge state; exposes no further API in this phase (Task 6 reads selection via a callback added then). `App.tsx` (Task 7) composes `Palette` and `Canvas` together.

- [ ] **Step 1: Install React Flow**

```bash
cd frontend && npm install @xyflow/react
```

- [ ] **Step 2: Write the failing Palette test**

```tsx
// frontend/src/components/Palette.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Palette } from './Palette'
import type { Catalog } from '../api/catalog'

const catalog: Catalog = {
  items: [], fluids: [], recipes: [], belts: [], pipes: [], resources: [],
  buildings: [
    { key_name: 'constructor', name: 'Constructor', category: 'crafting1', power: 4, ports: [] },
    { key_name: 'smelter', name: 'Smelter', category: 'smelting1', power: 4, ports: [] },
  ],
  miners: [
    { key_name: 'miner-mk1', name: 'Miner MK1', category: 'mineral', power: 5, ports: [] },
  ],
}

describe('Palette', () => {
  it('renders every building and miner name grouped by category', () => {
    render(<Palette catalog={catalog} onSelect={() => {}} />)
    expect(screen.getByText('Constructor')).toBeInTheDocument()
    expect(screen.getByText('Smelter')).toBeInTheDocument()
    expect(screen.getByText('Miner MK1')).toBeInTheDocument()
    expect(screen.getByText('crafting1')).toBeInTheDocument()
    expect(screen.getByText('mineral')).toBeInTheDocument()
  })

  it('calls onSelect with the clicked entry', () => {
    const onSelect = vi.fn()
    render(<Palette catalog={catalog} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Constructor'))
    expect(onSelect).toHaveBeenCalledWith(catalog.buildings[0])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- Palette.test.tsx`
Expected: FAIL — `frontend/src/components/Palette.tsx` does not exist

- [ ] **Step 4: Implement `frontend/src/components/Palette.tsx`**

```tsx
import type { Building, Catalog, Miner } from '../api/catalog'

type Entry = Building | Miner

export function Palette(props: { catalog: Catalog; onSelect: (entry: Entry) => void }) {
  const { catalog, onSelect } = props
  const entries: Entry[] = [...catalog.buildings, ...catalog.miners]
  const byCategory = new Map<string, Entry[]>()
  for (const entry of entries) {
    const group = byCategory.get(entry.category) ?? []
    group.push(entry)
    byCategory.set(entry.category, group)
  }

  return (
    <div className="palette">
      {[...byCategory.entries()].map(([category, group]) => (
        <div key={category} className="palette-group">
          <h3>{category}</h3>
          <ul>
            {group.map((entry) => (
              <li key={entry.key_name}>
                <button type="button" onClick={() => onSelect(entry)}>
                  {entry.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- Palette.test.tsx`
Expected: 2 passed

- [ ] **Step 6: Write the failing Canvas test**

```tsx
// frontend/src/components/Canvas.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Canvas } from './Canvas'
import type { Catalog } from '../api/catalog'

const catalog: Catalog = {
  items: [], fluids: [], recipes: [], belts: [], pipes: [], resources: [],
  buildings: [
    {
      key_name: 'constructor', name: 'Constructor', category: 'crafting1', power: 4,
      ports: [
        { id: 'item-in-0', direction: 'input', kind: 'item' },
        { id: 'item-out-0', direction: 'output', kind: 'item' },
      ],
    },
  ],
  miners: [],
}

describe('Canvas', () => {
  it('renders an empty canvas with a button to place the first building', () => {
    render(<Canvas catalog={catalog} />)
    expect(screen.getByTestId('canvas-root')).toBeInTheDocument()
  })

  it('adds a node when placeNode is invoked via the exposed test hook', () => {
    render(<Canvas catalog={catalog} />)
    fireEvent.click(screen.getByTestId('debug-place-constructor'))
    expect(screen.getByText('Constructor')).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd frontend && npm test -- Canvas.test.tsx`
Expected: FAIL — `frontend/src/components/Canvas.tsx` does not exist

- [ ] **Step 8: Implement `frontend/src/components/Canvas.tsx`**

```tsx
import { useCallback, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  addEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Building, Catalog, Miner, Port } from '../api/catalog'

type Entry = Building | Miner

function portsAsHandles(ports: Port[]) {
  return ports.map((port, i) => (
    <Handle
      key={port.id}
      id={port.id}
      type={port.direction === 'input' ? 'target' : 'source'}
      position={port.direction === 'input' ? Position.Left : Position.Right}
      style={{ top: 16 + i * 16 }}
      data-kind={port.kind}
    />
  ))
}

function EntityNode({ data }: { data: { entry: Entry } }) {
  return (
    <div className="entity-node">
      <strong>{data.entry.name}</strong>
      {portsAsHandles(data.entry.ports)}
    </div>
  )
}

const nodeTypes = { entity: EntityNode }

function portKind(ports: Port[], portId: string | null | undefined): string | undefined {
  return ports.find((p) => p.id === portId)?.kind
}

export function Canvas(props: { catalog: Catalog }) {
  const { catalog } = props
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [nextId, setNextId] = useState(0)

  const placeNode = useCallback(
    (entry: Entry) => {
      const id = `node-${nextId}`
      setNextId((n) => n + 1)
      setNodes((nds) => [
        ...nds,
        { id, type: 'entity', position: { x: 80 + nds.length * 40, y: 80 + nds.length * 40 }, data: { entry } },
      ])
    },
    [nextId],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return
      const sourceKind = portKind((sourceNode.data.entry as Entry).ports, connection.sourceHandle)
      const targetKind = portKind((targetNode.data.entry as Entry).ports, connection.targetHandle)
      if (sourceKind !== targetKind) return
      setEdges((eds) => addEdge(connection, eds))
    },
    [nodes],
  )

  return (
    <div data-testid="canvas-root" style={{ width: '100%', height: '100%' }}>
      <button
        type="button"
        data-testid="debug-place-constructor"
        style={{ display: 'none' }}
        onClick={() => placeNode(catalog.buildings[0])}
      >
        debug place
      </button>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onConnect={onConnect} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd frontend && npm test -- Canvas.test.tsx`
Expected: 2 passed

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components
git commit -m "feat: add Palette and React Flow Canvas with port-kind-validated wiring"
```

---

## Task 6: Wire Palette into Canvas, add Inspector, compose in App

**Files:**
- Create: `frontend/src/components/Inspector.tsx`, `frontend/src/components/Inspector.test.tsx`
- Modify: `frontend/src/components/Canvas.tsx` (replace the hidden debug button with real palette-driven placement and add selection tracking), `frontend/src/components/Canvas.test.tsx` (replace the debug-button test with a real palette-click test), `frontend/src/App.tsx`, `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `Palette` (Task 5), `fetchCatalog` (Task 4), `Recipe` type (Task 4).
- Produces: `export function Inspector(props: { entry: Building | Miner | null; recipes: Recipe[] }): JSX.Element` — shown by `App` alongside `Canvas`. `Canvas` now accepts `onSelectionChange?: (entry: Entry | null) => void` and calls it on node click; it renders `Palette` internally instead of exposing a debug button.

- [ ] **Step 1: Update `Canvas.test.tsx` to drive placement through the palette instead of the debug button**

Replace the second test in `frontend/src/components/Canvas.test.tsx` (the `debug-place-constructor` one) with:

```tsx
  it('adds a node when a palette entry is clicked', () => {
    render(<Canvas catalog={catalog} />)
    fireEvent.click(screen.getByText('Constructor'))
    expect(screen.getAllByText('Constructor')).toHaveLength(2) // palette button + node label
  })

  it('reports the clicked node via onSelectionChange', () => {
    const onSelectionChange = vi.fn()
    render(<Canvas catalog={catalog} onSelectionChange={onSelectionChange} />)
    fireEvent.click(screen.getByText('Constructor'))
    fireEvent.click(screen.getByText('Constructor', { selector: 'strong' }))
    expect(onSelectionChange).toHaveBeenCalledWith(catalog.buildings[0])
  })
```

Add `vi` to the existing `vitest` import line at the top of the file (`import { describe, expect, it, vi } from 'vitest'`), and remove the now-unused first debug-button test entirely.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Canvas.test.tsx`
Expected: FAIL — `Palette` is not rendered inside `Canvas` yet, and `onSelectionChange` prop is unused

- [ ] **Step 3: Update `Canvas.tsx` to render `Palette` and track selection**

Replace the `placeNode`-button block and `Canvas` function body in `frontend/src/components/Canvas.tsx`:

```tsx
import { Palette } from './Palette'

// ... (keep portsAsHandles, EntityNode, nodeTypes, portKind as-is)

export function Canvas(props: { catalog: Catalog; onSelectionChange?: (entry: Entry | null) => void }) {
  const { catalog, onSelectionChange } = props
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [nextId, setNextId] = useState(0)

  const placeNode = useCallback(
    (entry: Entry) => {
      const id = `node-${nextId}`
      setNextId((n) => n + 1)
      setNodes((nds) => [
        ...nds,
        { id, type: 'entity', position: { x: 80 + nds.length * 40, y: 80 + nds.length * 40 }, data: { entry } },
      ])
    },
    [nextId],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return
      const sourceKind = portKind((sourceNode.data.entry as Entry).ports, connection.sourceHandle)
      const targetKind = portKind((targetNode.data.entry as Entry).ports, connection.targetHandle)
      if (sourceKind !== targetKind) return
      setEdges((eds) => addEdge(connection, eds))
    },
    [nodes],
  )

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      onSelectionChange?.(node.data.entry as Entry)
    },
    [onSelectionChange],
  )

  return (
    <div data-testid="canvas-root" style={{ display: 'flex', width: '100%', height: '100%' }}>
      <Palette catalog={catalog} onSelect={placeNode} />
      <div style={{ flex: 1 }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onConnect={onConnect} onNodeClick={onNodeClick} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- Canvas.test.tsx`
Expected: 2 passed

- [ ] **Step 5: Write the failing Inspector test**

```tsx
// frontend/src/components/Inspector.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Inspector } from './Inspector'
import type { Building, Recipe } from '../api/catalog'

const recipes: Recipe[] = [
  { key_name: 'iron-ingot', name: 'Iron Ingot', category: 'smelting1', time: 2, ingredients: [['iron-ore', 1]], products: [['iron-ingot', 1]] },
]

const smelter: Building = { key_name: 'smelter', name: 'Smelter', category: 'smelting1', power: 4, ports: [] }

describe('Inspector', () => {
  it('shows a placeholder when nothing is selected', () => {
    render(<Inspector entry={null} recipes={recipes} />)
    expect(screen.getByText('No selection')).toBeInTheDocument()
  })

  it('shows the selected entry name and its matching recipes by category', () => {
    render(<Inspector entry={smelter} recipes={recipes} />)
    expect(screen.getByText('Smelter')).toBeInTheDocument()
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument()
    expect(screen.getByText('iron-ore x1 -> iron-ingot x1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm test -- Inspector.test.tsx`
Expected: FAIL — `frontend/src/components/Inspector.tsx` does not exist

- [ ] **Step 7: Implement `frontend/src/components/Inspector.tsx`**

```tsx
import type { Building, Miner, Recipe } from '../api/catalog'

export function Inspector(props: { entry: Building | Miner | null; recipes: Recipe[] }) {
  const { entry, recipes } = props
  if (!entry) {
    return <div className="inspector">No selection</div>
  }

  const matching = recipes.filter((r) => r.category === entry.category)

  return (
    <div className="inspector">
      <h2>{entry.name}</h2>
      <p>Power: {entry.power} MW</p>
      <h3>Recipes</h3>
      <ul>
        {matching.map((recipe) => (
          <li key={recipe.key_name}>
            <strong>{recipe.name}</strong>
            <div>
              {recipe.ingredients.map(([k, n]) => `${k} x${n}`).join(' + ')} -&gt;{' '}
              {recipe.products.map(([k, n]) => `${k} x${n}`).join(' + ')}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npm test -- Inspector.test.tsx`
Expected: 2 passed

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components
git commit -m "feat: wire Palette into Canvas and add recipe Inspector"
```

---

## Task 7: Compose App with live catalog fetch

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `fetchCatalog` (Task 4), `Canvas` (Task 6), `Inspector` (Task 6).
- Produces: final `App` component — the deliverable of this phase. No further consumers.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/App.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the catalog and renders the canvas once loaded', async () => {
    const mockCatalog = {
      items: [], fluids: [], recipes: [], belts: [], pipes: [], resources: [],
      buildings: [{ key_name: 'constructor', name: 'Constructor', category: 'crafting1', power: 4, ports: [] }],
      miners: [],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => mockCatalog }))

    render(<App />)

    expect(screen.getByText('Loading catalog...')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Constructor')).toBeInTheDocument())
    expect(screen.getByText('No selection')).toBeInTheDocument()
  })

  it('shows an error message when the catalog fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    render(<App />)

    await waitFor(() => expect(screen.getByText(/Failed to load catalog/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- App.test.tsx`
Expected: FAIL — current `App.tsx` only renders a static `<h1>Gridworks</h1>`

- [ ] **Step 3: Implement `frontend/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { fetchCatalog, type Catalog, type Building, type Miner } from './api/catalog'
import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Building | Miner | null>(null)

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) {
    return <div>Failed to load catalog: {error}</div>
  }

  if (!catalog) {
    return <div>Loading catalog...</div>
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <div style={{ flex: 1 }}>
        <Canvas catalog={catalog} onSelectionChange={setSelected} />
      </div>
      <div style={{ width: 280 }}>
        <Inspector entry={selected} recipes={catalog.recipes} />
      </div>
    </div>
  )
}

export default App
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- App.test.tsx`
Expected: 2 passed

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests across all files pass

- [ ] **Step 6: Run the full backend test suite**

Run: `python3 -m pytest tests/test_catalog_v1_normalize.py tests/test_catalog_v1_endpoint.py -v`
Expected: all pass

- [ ] **Step 7: Manual smoke test**

```bash
nohup python3 app.py > /tmp/gridworks_server.log 2>&1 & disown
cd frontend && npm run dev
```

Open the Vite dev server URL (typically `http://localhost:5173`), confirm: the palette lists buildings/miners grouped by category, clicking an entry places a node on the canvas with visible port handles, dragging between two same-kind ports creates a wire, clicking a node shows its recipes in the inspector. Then stop both processes:

```bash
pkill -f 'python3 app.py'
# stop the Vite dev server with Ctrl-C in its terminal, or:
pkill -f 'vite'
```

Note: the Vite dev server proxies `/api/catalog/v1` to Flask only if configured to — if the fetch fails with a CORS/connection error during this smoke test, add a proxy block to `frontend/vite.config.ts`:

```ts
server: {
  proxy: { '/api': 'http://127.0.0.1:5000' },
},
```

and restart `npm run dev`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/vite.config.ts
git commit -m "feat: compose App with live catalog fetch, canvas, and inspector"
```

---

## Task 8: Documentation

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks — this is the final task.

- [ ] **Step 1: Add a "Frontend (new)" section to `README.md`**

Insert after the existing "Open:" section (after the `http://127.0.0.1:5000` bullet block) in `README.md`:

```markdown
## Frontend (new)

A new React + TypeScript + Vite frontend lives in `frontend/`. It is the long-term
replacement for `static/js`/`templates`, built incrementally — see
`docs/superpowers/specs/2026-06-21-frontend-node-graph-shell-design.md` for the phased plan.

Setup:

```bash
cd frontend
npm install
```

Run (with the Flask backend also running, see above):

```bash
cd frontend
npm run dev
```

Open the URL Vite prints (typically http://localhost:5173). It fetches
`GET /api/catalog/v1` from the Flask backend, so the Flask server must be running.

Test:

```bash
cd frontend
npm test
```
```

- [ ] **Step 2: Add a CHANGELOG entry**

Add an entry at the top of `CHANGELOG.md` (check the file's existing format first and match it):

```markdown
## Unreleased

- Added a new React + TypeScript + Vite frontend shell (`frontend/`) with a React Flow
  canvas for placing Satisfactory buildings/miners and wiring ports by kind (item/fluid/
  power). Backed by a new `GET /api/catalog/v1` Flask endpoint reading
  `docs/satisfactory_data.v1.json` directly. No simulation or persistence yet — see
  `docs/superpowers/specs/2026-06-21-frontend-node-graph-shell-design.md` for the roadmap.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document new frontend setup and Phase 1 changelog entry"
```
