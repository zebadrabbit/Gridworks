# Visual Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-kind port icons, a live 60-second sparkline, and labelled meter bars in the inspector and canvas tooltip.

**Architecture:** `sim.js` gains one sampler at the end of `tick()` that pushes a number per node per second onto `node.hist` (live-only, stripped on save). A new `src/icons.js` holds six inline SVG strings plus two tiny HTML helpers. `game.js` draws the sparkline on a `<canvas>` in the inspector and the tooltip. The canvas tiles are untouched.

**Tech Stack:** Vanilla ES modules, no dependencies. Tests are a plain `assert` script: `node tests/test_sim.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-23-visual-language-design.md`

## Global Constraints

- No new dependencies. No icon sheets or image assets — icons are inline SVG strings.
- Icons are per-kind only: `item`, `fluid`, `power`, `ore`, `warn`, `idle`.
- History: one sample per second, 60 samples, never saved, ignored by `simulateOffline`.
- Canvas tiles do not change.
- Mark deliberate simplifications with a `// ponytail:` comment.
- Run `node tests/test_sim.mjs` before every commit; it must print `all sim checks passed`.

---

### Task 1: History sampler in the sim

**Files:**
- Modify: `src/sim.js` — end of `tick()` (currently ends with `state.time += dt;` near line 785)
- Modify: `src/game.js:967` — the save replacer
- Test: `tests/test_sim.mjs`

**Interfaces:**
- Produces: `node.hist: number[]` (≤ 60 entries, oldest first) on nodes of type `store`, `generator`, `miner`, `machine`, `hub`. Exported constant `HIST_LEN = 60`.
- Metric per type: store → `bufTotal/cap` (0–1); generator → `powerOut` if `status === 'generating'` else 0; miner/machine → `made` delta since the previous sample; hub → `state.power.supply - state.power.demand`.

- [ ] **Step 1: Write the failing test**

Append before the final `console.log` in `tests/test_sim.mjs`:

```js
// ---- history sampler: one sample per second, 60 max, live-only
{
  const s = newGame(7, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const box = addNode(s, 'storage-container', 10, 10, ctx);
  box.buf = { 'iron-ore': 1200 }; // half of cap 2400
  const h = s.nodes.find((n) => n.key === 'the-hub');
  for (let i = 0; i < 6; i++) tick(s, 0.5, ctx); // 3 seconds
  assert.equal(box.hist.length, 3, 'one sample per second');
  assert.ok(Math.abs(box.hist[0] - 0.5) < 1e-9, 'store samples fill ratio');
  assert.equal(h.hist.length, 3, 'hub samples too');
  assert.equal(h.hist[0], 0, 'hub net power is supply - demand');
  for (let i = 0; i < 200; i++) tick(s, 1, ctx);
  assert.equal(box.hist.length, HIST_LEN, 'ring caps at HIST_LEN');
  assert.equal(JSON.stringify(normalizeSave(JSON.parse(JSON.stringify(s)))).includes('"hist"'), true,
    'hist survives a plain clone (the save replacer in game.js strips it, not the sim)');
}
```

Add `HIST_LEN` to the import list at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_sim.mjs`
Expected: `SyntaxError: The requested module '../src/sim.js' does not provide an export named 'HIST_LEN'`

- [ ] **Step 3: Write minimal implementation**

In `src/sim.js`, next to `bufTotal` (line ~609):

```js
export const HIST_LEN = 60;

// One number per node per second for the inspector/tooltip sparkline. Live-only: game.js
// strips `hist` and `hMade` on save, so old saves simply start with an empty graph.
const HIST_TYPES = new Set(['store', 'generator', 'miner', 'machine', 'hub']);
function sampleHistory(state, ctx) {
  for (const node of state.nodes) {
    const def = ctx.catalog[node.key];
    if (!HIST_TYPES.has(def.type)) continue;
    let v;
    if (def.type === 'store') v = bufTotal(node.buf) / def.cap;
    else if (def.type === 'generator') v = node.status === 'generating' ? def.powerOut : 0;
    else if (def.type === 'hub') v = state.power.supply - state.power.demand;
    else { v = (node.made ?? 0) - (node.hMade ?? 0); node.hMade = node.made ?? 0; }
    (node.hist ??= []).push(v);
    if (node.hist.length > HIST_LEN) node.hist.shift();
  }
}
```

At the end of `tick()`, replace `state.time += dt;` with:

```js
  // sample when state.time crosses a whole second; dt is 0.5 live and coarse offline,
  // so "crosses" rather than "equals"
  if (Math.floor(state.time + dt) > Math.floor(state.time)) sampleHistory(state, ctx);
  state.time += dt;
```

Check `simulateOffline` (line ~577): it calls `tick` in a loop, so it would sample too. That is harmless (60 samples of offline state is a fine starting graph) — leave it, and add `// ponytail: offline ticks sample too; fine, it seeds the graph` above the loop.

In `src/game.js:967`, extend the replacer so `hist` and `hMade` never hit localStorage:

```js
  localStorage.setItem(SAVE_KEY, JSON.stringify(state, (k, v) => (k === '_net' || k === 'hist' || k === 'hMade' ? undefined : v)));
```

Also find the Export button handler (search `btn-export`) — if it stringifies `state` with its own replacer, apply the same three keys there.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_sim.mjs`
Expected: `all sim checks passed`

- [ ] **Step 5: Commit**

```bash
git add src/sim.js src/game.js tests/test_sim.mjs
git commit -m "feat(sim): per-second history ring for stores, generators, machines and the hub"
```

---

### Task 2: Icon and meter helpers

**Files:**
- Create: `src/icons.js`
- Modify: `src/style.css` — add `.ico` and meter colour classes

**Interfaces:**
- Produces: `icon(kind: 'item'|'fluid'|'power'|'ore'|'warn'|'idle'): string` (an inline `<svg>`), `meter(label: string, value: number, max: number, cls?: ''|'good'|'warn'|'bad'): string` (HTML using the existing `.ms-row` / `.ms-bar` classes).

- [ ] **Step 1: Write the module**

`src/icons.js`:

```js
// icons.js — six per-kind glyphs + the labelled meter bar. Inline SVG, currentColor, no assets.
// ponytail: per-kind only; per-resource overrides for headline resources if the panels read flat.
const wrap = (body) =>
  `<svg class="ico" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICON = {
  item: wrap('<rect x="3" y="3" width="10" height="10" rx="1.5"/>'),
  fluid: wrap('<path d="M8 2.5 C5 6 4 8 4 10 a4 4 0 0 0 8 0 c0-2-1-4-4-7.5z"/>'),
  power: wrap('<path d="M9 2 4 9h4l-1 5 5-7H8z"/>'),
  ore: wrap('<path d="M3 12 6 5l3 3 2-3 2 7z"/>'),
  warn: wrap('<path d="M8 2.5 14 13H2z"/><path d="M8 7v3M8 11.5v.1"/>'),
  idle: wrap('<circle cx="8" cy="8" r="4.5" stroke-dasharray="2 2"/>'),
};

export function icon(kind) { return ICON[kind] ?? ''; }

export function meter(label, value, max, cls = '') {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="ms-row"><span>${label}</span><span>${Math.round(value)}/${Math.round(max)}</span></div>
    <div class="ms-bar ${cls}"><i style="width:${pct}%"></i></div>`;
}
```

- [ ] **Step 2: Add styles**

Append to `src/style.css` after the `.ms-bar > i` rule:

```css
.ico { vertical-align: -2px; margin-right: 4px; color: #7f96ad; }
.ms-bar.good > i { background: #58d68d; }
.ms-bar.warn > i { background: #f5c542; }
.ms-bar.bad > i { background: #ff7675; }
```

- [ ] **Step 3: Smoke check in Node**

Run: `node -e "import('./src/icons.js').then(m => { console.log(m.icon('power').length > 50, m.meter('Power', 30, 75, 'warn').includes('width:40%')); })"`
Expected: `true true`

- [ ] **Step 4: Commit**

```bash
git add src/icons.js src/style.css
git commit -m "feat(ui): per-kind icon glyphs and meter helper"
```

---

### Task 3: Inspector — icons, sparkline, hub meter

**Files:**
- Modify: `src/game.js` — `refreshInspector` (~line 686) and `updateBuffers` (~line 761); imports at top

**Interfaces:**
- Consumes: `icon`, `meter` from `src/icons.js`; `S.kindOf(res, ctx)`; `node.hist` from Task 1.
- Produces: `drawSpark(canvas, hist, max)` used again by Task 4.

- [ ] **Step 1: Import and add `drawSpark`**

Top of `src/game.js`:

```js
import { icon, meter } from './icons.js';
```

Near `updateBuffers`, add:

```js
// One polyline, baseline at 0. Scales to `max` if given, else to the largest sample, so a
// 0–1 store graph and a 0–250 MW generator graph both fill the box.
function drawSpark(cv, hist, max) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  if (!hist?.length) return;
  const lo = Math.min(0, ...hist), hi = Math.max(max ?? 0, ...hist, lo + 1e-9);
  const x = (i) => (i / (S.HIST_LEN - 1)) * (W - 2) + 1;
  const y = (v) => H - 1 - ((v - lo) / (hi - lo)) * (H - 2);
  g.strokeStyle = '#4dd8ff'; g.lineWidth = 1.5; g.beginPath();
  hist.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.stroke();
  if (lo < 0) { g.strokeStyle = '#ff767588'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y(0)); g.lineTo(W, y(0)); g.stroke(); }
}
```

- [ ] **Step 2: Add the canvas and meter to `refreshInspector`**

In the node branch, right after the `html` line that adds `#uptime` (the `['miner','machine','generator']` block), add:

```js
  if (['store', 'generator', 'miner', 'machine', 'hub'].includes(def.type)) {
    html += `<canvas id="spark" width="220" height="40"></canvas>`;
  }
  if (def.type === 'hub') html += `<section id="pwr"></section>`;
```

- [ ] **Step 3: Render rows with icons, draw spark and meter in `updateBuffers`**

Replace the `render` arrow in `updateBuffers` with:

```js
  const render = (buf) => Object.entries(buf).filter(([, v]) => v > 0.05)
    .map(([k, v]) => `<div class="buf"><span>${icon(S.kindOf(k, ctx))}${ctx.names[k] ?? k}</span><span>${fmt(v)}</span></div>`)
    .join('') || '<div class="dim">empty</div>';
```

And at the end of `updateBuffers` append:

```js
  const spark = document.getElementById('spark');
  if (spark) {
    const def = ctx.catalog[n.key];
    drawSpark(spark, n.hist, def.type === 'store' ? 1 : def.type === 'generator' ? def.powerOut : undefined);
  }
  const pwr = document.getElementById('pwr');
  if (pwr) {
    const p = state.power ?? { supply: 0, demand: 0 };
    const cls = p.demand <= p.supply ? 'good' : p.supply > 0 ? 'warn' : 'bad';
    pwr.innerHTML = meter(`${icon('power')}Power`, p.demand, Math.max(p.supply, p.demand), cls);
  }
```

- [ ] **Step 4: Verify in the browser**

`./manage.sh start` (port 8889). Select a storage container — buffer rows show the square/drop glyph and a graph that climbs as it fills. Select the HUB — a Power meter with the bolt glyph, green when supply covers demand. Select a generator that has fuel — the graph is a flat line at `powerOut` and drops to 0 when fuel runs out. Run `node tests/test_sim.mjs`.

- [ ] **Step 5: Commit**

```bash
git add src/game.js
git commit -m "feat(ui): inspector icons, 60s sparkline, hub power meter"
```

---

### Task 4: Tooltip — port icon and node hover with sparkline

**Files:**
- Modify: `src/game.js` — `updateTooltip` (~line 419)

**Interfaces:**
- Consumes: `icon`, `drawSpark`, `nodeAt(x, y)` (search for the existing hit-test used by `mousedown` to select a node — reuse it, do not write a second one).

- [ ] **Step 1: Add the port icon**

In `updateTooltip`, change the port line to:

```js
    html = `<b>${icon(p.kind === 'resource' ? 'ore' : p.kind)}${p.dir === 'in' ? 'input' : 'output'}</b> · ${p.kind}`;
```

- [ ] **Step 2: Add node hover**

After the wire `else` branch (inside the outer `else`), so the order is port → wire → node:

```js
      else {
        const n = nodeAt(ui.mouse.x, ui.mouse.y);
        const def = n && ctx.catalog[n.key];
        if (n && def && def.type !== 'deposit') {
          const cls = { red: 'bad', yellow: 'warn', green: 'good' }[S.lightOf(n, def)] ?? '';
          html = `<b>${def.name}</b><div class="dim ${cls}">${n.status}</div>`;
          if (n.hist) html += `<canvas id="tip-spark" width="120" height="24"></canvas>`;
        }
      }
```

After `tip.innerHTML = html;` add:

```js
  const ts = tip.querySelector('#tip-spark');
  if (ts) {
    const n = nodeAt(ui.mouse.x, ui.mouse.y);
    const def = ctx.catalog[n.key];
    drawSpark(ts, n.hist, def.type === 'store' ? 1 : def.type === 'generator' ? def.powerOut : undefined);
  }
```

If `nodeAt` does not exist under that name, use whatever `mousedown` calls to resolve a click to a node (grep `state.nodes.find` near `canvas.addEventListener('mousedown'`) and bind it to a local `nodeAt` const rather than duplicating the hit-test.

- [ ] **Step 3: Verify in the browser**

Hover a port: glyph before `input`/`output`. Hover a machine body: name, status, and a tiny graph that updates as you hover (the tooltip rebuilds on every mousemove — if the graph flickers, it's because `innerHTML` replaces the canvas each move; that is acceptable at this size). Hover a deposit: no tooltip, as before. Run `node tests/test_sim.mjs`.

- [ ] **Step 4: Commit**

```bash
git add src/game.js
git commit -m "feat(ui): node hover tooltip with status and sparkline; port kind icons"
```

---

### Task 5: Changelog

**Files:**
- Modify: `CHANGELOG.md` — top entry

- [ ] **Step 1: Add the entry**

Follow the existing entry format at the top of the file; three bullets: per-kind icons in inspector and tooltip, 60s sparkline on stores/generators/machines/HUB, HUB power meter and node hover tooltip.

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for visual language"
```
