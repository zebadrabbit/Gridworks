# Wire Styles, Waypoints, and Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-wire render style (noodle bezier vs straight polyline with user-editable waypoints), an `S` keybind to switch, waypoint add/move/delete on selected straight wires, and hover tooltips for ports and wires.

**Architecture:** Wires in sim state gain `style` and `pts` fields (persisted, normalized on load). game.js gets one shared `wirePath(w)` that returns the point sequence for any wire; drawing, hit-testing, and handle rendering all walk it, replacing the duplicated bezier math in `strokeWirePath`/`bezPoint`. Tooltips are a single floating DOM div updated on mousemove.

**Tech Stack:** Vanilla JS ES modules, canvas 2D. Tests: `node tests/test_sim.mjs` (assert-based, no framework). UI verified in browser.

**Spec:** `docs/superpowers/specs/2026-07-18-wire-styles-waypoints-tooltips-design.md`

## Global Constraints

- No new dependencies, no framework. Plain canvas + DOM.
- Waypoints never affect flow simulation — render/routing only.
- Old saves must keep loading: normalization happens in `load()` in `src/game.js` (the existing `??=` block) and defaults are set in `addWire` in `src/sim.js`.
- Run tests with `node tests/test_sim.mjs` from repo root; success prints `all sim checks passed`.
- Serve the game for browser checks with `./manage.sh` or `python3 -m http.server` from repo root, open `http://localhost:8000`.

---

### Task 1: Wire model fields in sim + save normalization

**Files:**
- Modify: `src/sim.js` (addWire, ~line 245)
- Modify: `src/game.js:503-517` (load normalization)
- Test: `tests/test_sim.mjs`

**Interfaces:**
- Produces: every wire object carries `style: 'noodle' | 'straight'` and `pts: Array<{x, y}>` (world pixel coords). Later tasks read/write `w.style` and `w.pts` directly.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_sim.mjs` right after the existing `addWire` assertions (the block asserting `miner.depositRes`), using the already-created `dep`/`miner` wire — or simplest, add at the end of the file before the final `console.log`:

```js
// wires carry render style + waypoints (persisted, sim-inert)
const anyWire = state.wires[0];
assert.equal(anyWire.style, 'noodle', 'new wires default to noodle style');
assert.deepEqual(anyWire.pts, [], 'new wires start with no waypoints');
anyWire.style = 'straight'; anyWire.pts = [{ x: 100, y: 200 }];
const rt = JSON.parse(JSON.stringify(state));
assert.equal(rt.wires[0].style, 'straight', 'style survives save round-trip');
assert.deepEqual(rt.wires[0].pts, [{ x: 100, y: 200 }], 'pts survive save round-trip');
```

Note: if `state.wires` is empty at that point in the file (earlier sections clear state), create a wire first exactly like the existing deposit/miner block does:

```js
const sw = addDeposit(state, 'iron-ore', 'mineral', 'pure', 2, 60, 60);
const sm = addNode(state, 'miner-mk1', 66, 60, ctx);
const wStyle = addWire(state, sw, 'out0', sm, 'res0', ctx);
assert.equal(wStyle.style, 'noodle', 'new wires default to noodle style');
assert.deepEqual(wStyle.pts, [], 'new wires start with no waypoints');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_sim.mjs`
Expected: AssertionError — `new wires default to noodle style` (style is `undefined`).

- [ ] **Step 3: Implement — sim.js addWire**

In `src/sim.js`, change the wire literal in `addWire` (~line 245):

```js
const wire = { id: state.nextId++, a, b, kind: pa.kind, flow: 0, style: 'noodle', pts: [] };
```

- [ ] **Step 4: Implement — game.js load normalization**

In `src/game.js` `load()` (lines 508-512), add after `s.shipped ??= {};`:

```js
for (const w of s.wires ?? []) { w.style ??= 'noodle'; w.pts ??= []; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tests/test_sim.mjs`
Expected: `all sim checks passed`

- [ ] **Step 6: Commit**

```bash
git add src/sim.js src/game.js tests/test_sim.mjs
git commit -m "feat: wires carry style + waypoint fields, normalized on load"
```

---

### Task 2: Shared wirePath + straight rendering + hit test

**Files:**
- Modify: `src/game.js` — replace `strokeWirePath` (200-206), `bezPoint` (79-87), update `drawWire` (208-231), `drawWirePreview` (233-243), `wireAt` (67-78)

**Interfaces:**
- Consumes: `w.style`, `w.pts` from Task 1; existing `wireEnds(w)` returning `[p1, p2]`.
- Produces:
  - `wirePath(p1, p2, w)` → `Array<{x, y}>` — full point sequence for a wire (endpoints included). Pass `w = null` for previews (noodle path).
  - `strokePts(pts)` — begins a path through the points and strokes it.
  - `distToPath(pts, wx, wy)` → number — min distance from a point to the polyline.
  Tasks 3 and 5 call `wirePath` and `distToPath`.

- [ ] **Step 1: Replace bezier helpers with shared path functions**

Delete `bezPoint` (lines 79-87) and `strokeWirePath` (lines 200-206). Add in their place (near line 79):

```js
function wirePath(p1, p2, w) {
  if (w?.style === 'straight') return [p1, ...w.pts, p2];
  // noodle: sample the cubic bezier
  const dx = Math.max(40, Math.abs(p2.x - p1.x) / 2);
  const c1 = { x: p1.x + dx, y: p1.y }, c2 = { x: p2.x - dx, y: p2.y };
  const pts = [];
  const N = 32; // ponytail: fixed sampling, plenty smooth at max zoom 2.5
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pts.push({
      x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
      y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
    });
  }
  return pts;
}

function strokePts(pts) {
  cx.beginPath();
  cx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i].x, pts[i].y);
  cx.stroke();
}

function distToPath(pts, wx, wy) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 ? Math.max(0, Math.min(1, ((wx - a.x) * vx + (wy - a.y) * vy) / len2)) : 0;
    best = Math.min(best, Math.hypot(a.x + t * vx - wx, a.y + t * vy - wy));
  }
  return best;
}
```

- [ ] **Step 2: Update wireAt to use the shared path**

Replace the body of `wireAt` (67-78):

```js
function wireAt(wx, wy) {
  for (const w of state.wires) {
    const ends = wireEnds(w);
    if (!ends) continue;
    if (distToPath(wirePath(ends[0], ends[1], w), wx, wy) < 7 / cam.z + 3) return w;
  }
  return null;
}
```

- [ ] **Step 3: Update drawWire and drawWirePreview**

In `drawWire`, compute the path once and replace every `strokeWirePath(p1, p2)` call with `strokePts(pts)`:

```js
function drawWire(w, now) {
  const ends = wireEnds(w);
  if (!ends) return;
  const pts = wirePath(ends[0], ends[1], w);
  const color = KIND_COLOR[w.kind];
  const selected = ui.sel?.type === 'wire' && ui.sel.id === w.id;
  cx.lineWidth = selected ? 3.5 : (w.kind === 'fluid' ? 3 : 2);
  cx.shadowColor = color; cx.shadowBlur = selected ? 10 : 5;
  if (w.kind === 'power') {
    cx.strokeStyle = color + 'cc';
    strokePts(pts);
  } else {
    cx.strokeStyle = color + '44';
    strokePts(pts);
    if (w.flow > 0) { // marching ants
      cx.strokeStyle = color;
      cx.setLineDash([7, 7]);
      cx.lineDashOffset = -(now / 40) * (1 + (w.mark ?? 0) * 0.4) % 14;
      strokePts(pts);
      cx.setLineDash([]);
    }
  }
  cx.shadowBlur = 0;
  if (selected && w.style === 'straight') {
    for (let i = 0; i < w.pts.length; i++) {
      const p = w.pts[i];
      const s = 5 / cam.z + 2;
      cx.fillStyle = ui.sel.wp === i ? '#ffffff' : color;
      cx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
}
```

In `drawWirePreview` (233-243), replace the `strokeWirePath(p1, ...)` call:

```js
strokePts(wirePath(p1, over ? portPos(over.node, over.port) : p2, null));
```

- [ ] **Step 4: Verify in browser**

Serve and open the game. Check: existing wires render identically (noodle), marching ants animate, clicking a wire still selects it, wire preview while dragging from a port still curves. In devtools console force one wire straight:
`gw.state.wires[0].style = 'straight'; gw.state.wires[0].pts = [{x: 2000, y: 1500}]`
— it should render as two line segments through that point, be clickable along both segments, and show a square handle when selected.

- [ ] **Step 5: Run sim tests (regression)**

Run: `node tests/test_sim.mjs`
Expected: `all sim checks passed`

- [ ] **Step 6: Commit**

```bash
git add src/game.js
git commit -m "feat: shared wirePath renders straight polyline wires + handles"
```

---

### Task 3: Waypoint editing (add / move / select / delete)

**Files:**
- Modify: `src/game.js` — mousedown handler (259-287), mousemove (289-298), mouseup (300-323), keydown (336-348), `select` (355); add a dblclick handler

**Interfaces:**
- Consumes: `wirePath`, `distToPath` from Task 2; `w.pts` from Task 1.
- Produces: selection shape `ui.sel = { type: 'wire', id, wp?: number }` where `wp` is the index of a selected waypoint. `ui.drag = { wp: { w, i } }` while dragging a handle.

- [ ] **Step 1: Handle hit-test helper**

Add near `wireAt`:

```js
function handleAt(wx, wy) {
  if (ui.sel?.type !== 'wire') return null;
  const w = state.wires.find((q) => q.id === ui.sel.id);
  if (!w || w.style !== 'straight') return null;
  for (let i = 0; i < w.pts.length; i++) {
    if (Math.hypot(w.pts[i].x - wx, w.pts[i].y - wy) < 8 / cam.z + 3) return { w, i };
  }
  return null;
}
```

- [ ] **Step 2: mousedown — grab handles before anything else**

In the canvas `mousedown` handler, immediately after the pan/place branches (i.e. right before `const port = portAt(w.x, w.y);` at line 274):

```js
const h = handleAt(w.x, w.y);
if (h) { ui.sel = { type: 'wire', id: h.w.id, wp: h.i }; ui.drag = { wp: h }; return; }
```

- [ ] **Step 3: mousemove — drag the waypoint**

In the `mousemove` handler, add a branch after the `ui.drag?.node` branch:

```js
} else if (ui.drag?.wp) {
  const { w, i } = ui.drag.wp;
  w.pts[i] = { x: ui.mouse.x, y: ui.mouse.y };
}
```

- [ ] **Step 4: dblclick — insert a waypoint on the selected straight wire**

Add after the contextmenu listener:

```js
canvas.addEventListener('dblclick', (e) => {
  const p = toWorld(e.offsetX, e.offsetY);
  const wire = wireAt(p.x, p.y);
  if (!wire || wire.style !== 'straight') return;
  const ends = wireEnds(wire);
  if (!ends) return;
  const pts = [ends[0], ...wire.pts, ends[1]];
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToPath([pts[i], pts[i + 1]], p.x, p.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  wire.pts.splice(best, 0, { x: p.x, y: p.y });
  select({ type: 'wire', id: wire.id, wp: best });
});
```

- [ ] **Step 5: keydown — delete waypoint before wire**

In the `keydown` handler, change the wire-delete branch:

```js
if (ui.sel.type === 'wire') {
  const w = state.wires.find((q) => q.id === ui.sel.id);
  if (w && ui.sel.wp != null && w.pts[ui.sel.wp]) {
    w.pts.splice(ui.sel.wp, 1);
    select({ type: 'wire', id: w.id });
    return;
  }
  S.removeWire(state, ui.sel.id);
}
```

(Keep the surrounding `select(null)` for the wire-removal case — the waypoint case returns early after re-selecting the wire.)

- [ ] **Step 6: Verify in browser**

Force a wire straight via console (as in Task 2). Then: double-click the wire → waypoint appears where clicked, selected (white handle). Drag it → wire bends follow. Click empty space, re-select wire, click handle, press Delete → waypoint gone, wire still there. Press Delete again → wire gone. Double-click a noodle wire → nothing happens.

- [ ] **Step 7: Run sim tests (regression), commit**

Run: `node tests/test_sim.mjs` → `all sim checks passed`

```bash
git add src/game.js
git commit -m "feat: add/move/delete waypoints on straight wires"
```

---

### Task 4: `S` keybind — toggle wire style / default style

**Files:**
- Modify: `src/game.js` — keydown handler (336-348), `ui` object (22-23), mouseup wire-creation (312-320), `updateHud` or hint display

**Interfaces:**
- Consumes: `w.style` from Task 1.
- Produces: `ui.wireStyle` — `'noodle' | 'straight'`, the style applied to newly created wires.

- [ ] **Step 1: Default style state**

Add `wireStyle: 'noodle'` to the `ui` literal (line 22):

```js
const ui = { mode: 'idle', placeKey: null, wireFrom: null, sel: null, hover: null,
  mouse: { x: 0, y: 0 }, drag: null, hint: '', wireStyle: 'noodle' };
```

- [ ] **Step 2: Apply default on wire creation**

In the `mouseup` handler where wires are created (line 317), capture the result and set the style:

```js
if (a) {
  const nw = S.addWire(state, a, from.port.id, over.node, over.port.id, ctx);
  if (nw) nw.style = ui.wireStyle;
}
```

- [ ] **Step 3: Keybind**

In the `keydown` handler, after the Delete branch:

```js
if (e.key === 's' || e.key === 'S') {
  if (ui.sel?.type === 'wire') {
    const w = state.wires.find((q) => q.id === ui.sel.id);
    if (w) { w.style = w.style === 'straight' ? 'noodle' : 'straight'; select({ type: 'wire', id: w.id }); }
  } else {
    ui.wireStyle = ui.wireStyle === 'straight' ? 'noodle' : 'straight';
    ui.hint = `new wires: ${ui.wireStyle} · S to toggle`;
  }
}
```

- [ ] **Step 4: Verify in browser**

Select a wire, press S → it straightens (single segment); press S again → noodle returns (waypoints, if any, are kept but ignored — re-toggle shows them again). With nothing selected press S → hint bar shows `new wires: straight · S to toggle`; draw a new wire → it renders straight.

- [ ] **Step 5: Run sim tests (regression), commit**

Run: `node tests/test_sim.mjs` → `all sim checks passed`

```bash
git add src/game.js
git commit -m "feat: S keybind toggles wire style (selected wire or new-wire default)"
```

---

### Task 5: Hover tooltips for ports and wires

**Files:**
- Modify: `src/game.js` — mousemove handler (289-298), plus a small tooltip section
- Modify: `src/style.css` — one rule

**Interfaces:**
- Consumes: `portAt`, `wireAt`, `wireEnds` from game.js; `S.getPort`, `ctx.names`, `ctx.belts`, `ctx.pipes`; `w.flow` (units/sec — display ×60 as per-minute).

- [ ] **Step 1: Tooltip element + CSS**

In `src/game.js`, near the top after the canvas setup (line 19):

```js
const tip = document.createElement('div');
tip.id = 'tooltip';
document.body.appendChild(tip);
```

In `src/style.css`, append:

```css
#tooltip {
  position: fixed; pointer-events: none; display: none; z-index: 30;
  background: rgba(14, 19, 29, 0.95); border: 1px solid #4dd8ff55; border-radius: 5px;
  padding: 5px 8px; font-size: 12px; color: #cfe8ff; max-width: 240px;
}
#tooltip .dim { color: #7f96ad; }
```

- [ ] **Step 2: Tooltip content + update on mousemove**

Add a function near the input section:

```js
function updateTooltip(e) {
  if (ui.drag || ui.mode !== 'idle') { tip.style.display = 'none'; return; }
  let html = '';
  const port = portAt(ui.mouse.x, ui.mouse.y);
  if (port) {
    const { node, port: p } = port;
    html = `<b>${p.dir === 'in' ? 'input' : 'output'}</b> · ${p.kind}`;
    if (p.res) html += `<div class="dim">${ctx.names[p.res] ?? p.res}</div>`;
    else if (p.accepts) html += `<div class="dim">accepts: ${p.accepts.map((r) => ctx.names[r] ?? r).join(', ')}</div>`;
    html += `<div class="dim">${ctx.catalog[node.key].name}</div>`;
  } else {
    const w = wireAt(ui.mouse.x, ui.mouse.y);
    if (w) {
      if (w.kind === 'power') {
        html = `<b>power line</b>`;
      } else {
        const a = state.nodes.find((n) => n.id === w.a.n);
        const b = state.nodes.find((n) => n.id === w.b.n);
        const res = (a && S.getPort(a, w.a.p, ctx)?.res) ?? (b && S.getPort(b, w.b.p, ctx)?.res);
        const markName = w.kind === 'fluid' ? ctx.pipes[w.mark ?? 0]?.name : ctx.belts[w.mark ?? 0]?.name;
        html = `<b>${res ? (ctx.names[res] ?? res) : 'idle'}</b> · ${Math.round(w.flow * 60)}/min`;
        if (markName) html += `<div class="dim">${markName}</div>`;
      }
    }
  }
  if (!html) { tip.style.display = 'none'; return; }
  tip.innerHTML = html;
  tip.style.display = 'block';
  tip.style.left = (e.clientX + 14) + 'px';
  tip.style.top = (e.clientY + 14) + 'px';
}
```

Call it at the end of the canvas `mousemove` handler: `updateTooltip(e);`

Note: verify the port objects from `S.portsOf` expose `res`/`accepts` (sim.js lines 178-183 build ports with `res`); if a field name differs, match sim.js — do not invent fields.

- [ ] **Step 3: Verify in browser**

Hover a miner's out port → tooltip shows `output · item`, resource, building name. Hover a flowing belt → resource name + `N/min` + belt mark. Hover a power wire → `power line`. Hover empty ground → no tooltip. Start dragging a node → tooltip hides. Wheel-zoom then hover again → hit targets still line up.

- [ ] **Step 4: Run sim tests (regression), commit**

Run: `node tests/test_sim.mjs` → `all sim checks passed`

```bash
git add src/game.js src/style.css
git commit -m "feat: hover tooltips for ports and wires"
```

---

### Task 6: Full playthrough check + docs

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:** none — verification and docs only.

- [ ] **Step 1: Browser end-to-end pass**

Fresh game (Reset): place miner, wire deposit → miner → hub. Toggle default style with S, draw a straight wire, double-click to bend it around a building, save-cycle (wait 5 s, reload page) → styles and waypoints persist. Load-normalization check: in console run `localStorage.setItem('gridworks-save-v2', JSON.stringify((() => { const s = JSON.parse(localStorage.getItem('gridworks-save-v2')); s.wires.forEach(w => { delete w.style; delete w.pts; }); return s; })()))`, reload → wires render as noodle, no console errors.

- [ ] **Step 2: Update CHANGELOG.md**

Add entries under a new heading following the file's existing format: wire styles (noodle/straight, S to toggle), waypoint editing (dblclick add, drag move, Delete remove), hover tooltips for ports and wires.

- [ ] **Step 3: Run sim tests one last time, commit**

Run: `node tests/test_sim.mjs` → `all sim checks passed`

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for wire styles, waypoints, tooltips"
```
