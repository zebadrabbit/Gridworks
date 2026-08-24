# Juice: Effects Layer + Settings Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a presentation-only effects layer (flow capsules, status pulses, event bursts, day/night + shimmer + manta) and a ⚙ settings panel that owns all display preferences and takes the rarely-used buttons off the HUD.

**Architecture:** Two new ES modules. `src/settings.js` is one persisted object (`gw_settings`) with defaults and migration from the two old preference keys. `src/fx.js` owns transient visual state (pulses, particles, path caches) and exposes pure helpers plus draw calls; `game.js` gains call sites only. `sim.js` is untouched and nothing new enters the save.

**Tech Stack:** Vanilla ES modules, canvas 2D, localStorage. No build, no deps. Tests are plain `node:assert` scripts.

**Spec:** `docs/superpowers/specs/2026-08-24-juice-effects-settings-design.md`

## Global Constraints

- `src/sim.js` must not change. `tests/test_sim.mjs` must keep printing `all sim checks passed` (`node tests/test_sim.mjs`; never `node --test`).
- `fx.js` and `settings.js` must be importable in Node without a DOM: guard every `localStorage` / `document` access; pure helpers take plain numbers/arrays.
- Nothing from this spec is written into `state` or the save.
- Ponytail mode: mark deliberate simplifications with `// ponytail:`.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Work on branch `feat/juice-effects-settings` off `main`.
- Dev server: `./manage.sh status` → http://localhost:8889 (already running; no restart needed for static files).

## File map

| File | Responsibility |
|------|----------------|
| `src/settings.js` (new) | `DEFAULTS`, `settings`, `saveSettings()`, one-time migration of `gridworks-minimap` / `gridworks-tutorial`. |
| `src/fx.js` (new) | Pure helpers (`spacingFor`, `nightDepth`, `pathLengths`, `pointAt`), flow drawing, pulse + particle stores, `step`, ambient + overlay draws. Imports `settings` only. |
| `src/game.js` | Replace `MAP_KEY`/`TUT_KEY`/`ui.wireStyle` with `settings`; call `fx` from `draw`/`drawWire`/`drawNode`/`frame`/toast sites; settings panel wiring. |
| `index.html` | ⚙ button; `#settings` card containing effects checkboxes, wire style, replay tutorial, seed, Export/Import/New Map. Header trimmed. |
| `src/style.css` | `#settings` joins the dropdown rule; checkbox/radio rows. |
| `tests/test_fx.mjs` (new) | Asserts for the pure helpers and settings migration. |
| `CHANGELOG.md` | Entry. |

---

### Task 1: `settings.js` with migration, wired into `game.js`

**Files:**
- Create: `src/settings.js`
- Create: `tests/test_fx.mjs`
- Modify: `src/game.js:6-23` (prefs block), `:388`, `:560`, `:582`, `:720-727` (S key), `:1053`, `:1063`, `:1073`, `:1144`, `:1218-1228` (map toggle), `:1273`, `:1279`, `:1282`

**Interfaces:**
- Produces: `export const DEFAULTS`, `export const settings` (mutable object), `export function saveSettings()`, `export function loadSettings(storage)` (pure; returns the merged object and performs migration on the given storage — `storage` is any object with `getItem/setItem/removeItem`).

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/juice-effects-settings main
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_fx.mjs`:

```js
// node tests/test_fx.mjs — smallest checks that fail if fx/settings helpers break
import assert from 'node:assert/strict';

// 5-line localStorage stub so settings.js loads in Node.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { loadSettings, DEFAULTS } = await import('../src/settings.js');

// --- settings: migration from the two old keys
mem.clear();
mem.set('gridworks-minimap', '0');
mem.set('gridworks-tutorial', 'skip');
let s = loadSettings(globalThis.localStorage);
assert.equal(s.mapOpen, false, 'old minimap key migrates');
assert.equal(s.tutorial, 'skip', 'old tutorial key migrates');
assert.equal(mem.has('gridworks-minimap'), false, 'old minimap key removed');
assert.equal(mem.has('gridworks-tutorial'), false, 'old tutorial key removed');
assert.equal(s.flow, true, 'unset keys take defaults');

// --- settings: corrupt blob falls back to defaults
mem.clear();
mem.set('gw_settings', '{not json');
s = loadSettings(globalThis.localStorage);
assert.deepEqual(s, DEFAULTS, 'corrupt settings -> defaults');

// --- settings: saved blob wins over defaults, unknown keys dropped
mem.clear();
mem.set('gw_settings', JSON.stringify({ manta: false, bogus: 1 }));
s = loadSettings(globalThis.localStorage);
assert.equal(s.manta, false);
assert.equal('bogus' in s, false, 'unknown keys are not carried');

console.log('all fx checks passed');
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node tests/test_fx.mjs`
Expected: FAIL — `Cannot find module '../src/settings.js'`.

- [ ] **Step 4: Write `src/settings.js`**

```js
// settings.js — display preferences. One object, one localStorage key. Never part of the save:
// preferences must survive New Map and save import.
export const DEFAULTS = {
  flow: true, pulses: true, bursts: true, dayNight: true, manta: true,
  wireStyle: 'noodle',   // default style for new wires
  mapOpen: true,
  tutorial: null,        // null = never asked | 'go' = following along | 'skip' = dismissed
};
const KEY = 'gw_settings';
const OLD_MAP = 'gridworks-minimap', OLD_TUT = 'gridworks-tutorial';

// Pure over `storage` so it is testable in Node. Migrates the two pre-panel keys once.
export function loadSettings(storage) {
  let saved = {};
  try { saved = JSON.parse(storage.getItem(KEY) ?? '{}') ?? {}; } catch { saved = {}; }
  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (k in saved) s[k] = saved[k];
  const oldMap = storage.getItem(OLD_MAP), oldTut = storage.getItem(OLD_TUT);
  if (oldMap !== null) { s.mapOpen = oldMap !== '0'; storage.removeItem(OLD_MAP); }
  if (oldTut !== null) { s.tutorial = oldTut; storage.removeItem(OLD_TUT); }
  if (oldMap !== null || oldTut !== null) storage.setItem(KEY, JSON.stringify(s));
  return s;
}

const storage = globalThis.localStorage;
export const settings = storage ? loadSettings(storage) : { ...DEFAULTS };
export function saveSettings() { storage?.setItem(KEY, JSON.stringify(settings)); }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node tests/test_fx.mjs`
Expected: `all fx checks passed`

- [ ] **Step 6: Replace the old preference singletons in `game.js`**

At `src/game.js:3` add the import:

```js
import { settings, saveSettings } from './settings.js';
```

Replace lines 7–19 (the `MAP_KEY` … `setTut` block, including its comments) with:

```js
// Display preferences live in settings.js (one localStorage key), never in the save — they must
// survive New Map and save import. `tutorial` has three values, not a boolean: null = never
// asked, 'go' = accepted and still following along, 'skip' = dismissed for good.
const setTut = (v) => { settings.tutorial = v; saveSettings(); };
```

Line 23: `!mapOpen` → `!settings.mapOpen`.

Line 46–48 (`ui` literal): delete `wireStyle: 'noodle',`.

Line 388: `{ style: ui.wireStyle, pts: [] }` → `{ style: settings.wireStyle, pts: [] }`.
Line 560 and 582: `ui.wireStyle` → `settings.wireStyle`.

Lines 724–727 (S key with no wire selected):

```js
    } else {
      settings.wireStyle = settings.wireStyle === 'straight' ? 'noodle' : 'straight';
      saveSettings();
      ui.hint = `new wires: ${settings.wireStyle} · S to toggle`;
    }
```

Line 416: `if (!mapOpen) return;` → `if (!settings.mapOpen) return;`.
Line 1053: `tutState !== 'go'` → `settings.tutorial !== 'go'`.
Line 1144: `if (!tutState)` → `if (!settings.tutorial)`.
Line 1282: `if (tutState === 'go')` → `if (settings.tutorial === 'go')`.

Lines 1218–1228 (map toggle) become:

```js
  const mapBox = document.getElementById('inspector-map');
  const mapBtn = document.getElementById('btn-map');
  const syncMap = () => {
    mapBox.classList.toggle('collapsed', !settings.mapOpen);
    mapBtn.textContent = settings.mapOpen ? '−' : '+';
  };
  syncMap();
  mapBtn.onclick = () => {
    settings.mapOpen = !settings.mapOpen;
    saveSettings();
    syncMap();
  };
```

- [ ] **Step 7: Verify nothing references the removed names**

Run: `grep -n "mapOpen\b\|tutState\|MAP_KEY\|TUT_KEY\|ui\.wireStyle" src/game.js`
Expected: only `settings.mapOpen` hits; no `tutState`, `MAP_KEY`, `TUT_KEY`, `ui.wireStyle`.

Run: `node tests/test_sim.mjs && node tests/test_fx.mjs`
Expected: both pass.

Browser (user): reload — minimap collapse state and tutorial choice preserved from before; `S` toggles default style and survives reload.

- [ ] **Step 8: Commit**

```bash
git add src/settings.js tests/test_fx.mjs src/game.js
git commit -m "feat(settings): one gw_settings key; migrate minimap/tutorial prefs; wire style persists

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `fx.js` pure helpers + flow capsules replacing marching ants

**Files:**
- Create: `src/fx.js`
- Modify: `tests/test_fx.mjs`
- Modify: `src/game.js:347-372` (`drawWire`)

**Interfaces:**
- Consumes: `settings.flow`.
- Produces: `spacingFor(ratio) → px`, `pathLengths(pts) → { cum: number[], len: number }`, `pointAt(pts, cum, d) → { x, y, a }` (a = segment angle), `flow(cx, w, pts, ratio, speedMul, now, color)` draws capsules/bubbles.

- [ ] **Step 1: Add failing tests**

Append to `tests/test_fx.mjs` before the final `console.log`:

```js
const FX = await import('../src/fx.js');

// --- flow: spacing tracks capacity ratio
assert.equal(FX.spacingFor(0), 40);
assert.equal(FX.spacingFor(1), 10);
assert.equal(FX.spacingFor(2), 10, 'clamped above saturation');
assert.ok(FX.spacingFor(0.25) > FX.spacingFor(0.5) && FX.spacingFor(0.5) > FX.spacingFor(0.75), 'monotone');

// --- flow: path measurement and sampling
const path = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }];
const { cum, len } = FX.pathLengths(path);
assert.equal(len, 70);
assert.deepEqual(cum, [0, 30, 70]);
assert.deepEqual(FX.pointAt(path, cum, 15), { x: 15, y: 0, a: 0 });
const p = FX.pointAt(path, cum, 50);
assert.equal(p.x, 30); assert.equal(p.y, 20); assert.ok(Math.abs(p.a - Math.PI / 2) < 1e-9);
assert.equal(Math.floor(len / FX.spacingFor(1)), 7, 'capsule count at saturation');
```

- [ ] **Step 2: Run to verify failure**

Run: `node tests/test_fx.mjs`
Expected: FAIL — `Cannot find module '../src/fx.js'`.

- [ ] **Step 3: Write `src/fx.js` (helpers + flow)**

```js
// fx.js — presentation-only effects. Owns transient visual state; saves nothing; never touches
// sim state. Pure helpers take numbers/arrays so they run in Node without a DOM.
import { settings } from './settings.js';

// ------------------------------------------------------------------ flow capsules
// Spacing between shapes: 40px at a trickle, 10px at (or above) belt capacity.
export const spacingFor = (ratio) => 40 - 30 * Math.min(1, Math.max(0, ratio));

export function pathLengths(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { cum, len: cum[cum.length - 1] };
}

// Point at distance d along the polyline, with the segment angle.
export function pointAt(pts, cum, d) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) };
}

// ponytail: cache keyed by wire id + point count + endpoints; wires are re-sampled when moved.
const pathCache = new Map();
function measured(w, pts) {
  const key = `${pts.length}:${pts[0].x},${pts[0].y}:${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  const c = pathCache.get(w.id);
  if (c && c.key === key) return c;
  const m = { key, ...pathLengths(pts) };
  pathCache.set(w.id, m);
  return m;
}

export function flow(cx, w, pts, ratio, speedMul, now, color) {
  if (!settings.flow || !(ratio > 0)) return;
  const { cum, len } = measured(w, pts);
  const spacing = spacingFor(ratio);
  const count = Math.floor(len / spacing);
  if (count < 1) return;
  const offset = ((now / 40) * speedMul) % spacing;
  cx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const p = pointAt(pts, cum, (offset + i * spacing) % len);
    if (w.kind === 'fluid') {
      cx.beginPath(); cx.arc(p.x, p.y, 2, 0, Math.PI * 2); cx.fill();
    } else {
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a);
      cx.beginPath(); cx.roundRect(-3, -1.5, 6, 3, 1.5); cx.fill();
      cx.restore();
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node tests/test_fx.mjs`
Expected: `all fx checks passed`

- [ ] **Step 5: Replace marching ants in `drawWire`**

At `src/game.js:3` add `import * as FX from './fx.js';`.

Replace `src/game.js:359-366` (the `else { ... }` branch with the ants) with:

```js
  } else {
    cx.strokeStyle = color + '44';
    strokePts(pts);
    cx.shadowBlur = 0;
    const cap = (w.kind === 'fluid' ? ctx.pipes[w.mark ?? 0].rate : ctx.belts[w.mark ?? 0].rate) / 60;
    FX.flow(cx, w, pts, (w.flow ?? 0) / cap, 1 + (w.mark ?? 0) * 0.4, now, color);
  }
```

(The `cx.shadowBlur = 0;` that follows the if/else at line 367 stays.)

- [ ] **Step 6: Verify**

Run: `grep -n "setLineDash(\[7, 7\])\|marching" src/game.js` → Expected: no hits.
Run: `node tests/test_sim.mjs && node tests/test_fx.mjs` → both pass.

Browser (user): a miner→smelter belt shows capsules moving in the belt colour; a saturated belt is dense, a starved one sparse; pipes show bubbles; power wires unchanged; unchecking nothing yet (panel comes in Task 6).

- [ ] **Step 7: Commit**

```bash
git add src/fx.js tests/test_fx.mjs src/game.js
git commit -m "feat(fx): flow capsules with capacity-based density replace marching ants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Status pulses

**Files:**
- Modify: `src/fx.js` (append), `src/game.js:182-197` (`draw`), `:274-278` (`drawNode` head), `:984` (`seedAchievements`)

**Interfaces:**
- Consumes: `settings.pulses`, `LIGHT_COLOR` in game.js.
- Produces: `FX.pulse(rect, color, now)`, `FX.drawPulses(cx, now)`.

- [ ] **Step 1: Append to `src/fx.js`**

```js
// ------------------------------------------------------------------ status pulses
// One expanding ring per status *change*; a steady tile never animates.
const PULSE_MS = 500;
const pulses = [];
export function pulse(rect, color, now) {
  if (!settings.pulses) return;
  pulses.push({ ...rect, color, t0: now });
}
export function drawPulses(cx, now) {
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i], k = (now - p.t0) / PULSE_MS;
    if (k >= 1) { pulses.splice(i, 1); continue; }
    const grow = 8 * k;
    cx.globalAlpha = 1 - k;
    cx.strokeStyle = p.color; cx.lineWidth = 2;
    cx.beginPath(); cx.roundRect(p.x - grow, p.y - grow, p.w + 2 * grow, p.h + 2 * grow, 6 + grow); cx.stroke();
  }
  cx.globalAlpha = 1;
}
```

- [ ] **Step 2: Detect changes in `game.js`**

Above `function drawNode(n)` (line 274) add:

```js
// Last-seen light per node id, for pulses. Cleared whenever `state` is replaced so a loaded
// save does not fire a ring per node; a node's first frame sets without pulsing. Ids come from
// state.nextId and are never reused, so stale entries are harmless. // ponytail: never pruned
const lastLight = new Map();
```

Inside `drawNode`, right after `const light = S.lightOf(n, def);` (line 277):

```js
  const prev = lastLight.get(n.id);
  if (prev !== undefined && prev !== light) FX.pulse(r, LIGHT_COLOR[light] ?? TYPE_COLOR[def.type], drawNow);
  lastLight.set(n.id, light);
```

`draw(now)` needs `now` visible in `drawNode` without threading it through: at module scope near `lastLight` add `let drawNow = 0;`, and at the top of `draw(now)` add `drawNow = now;`.

In `draw(now)`, after `for (const n of state.nodes) drawNode(n);` add `FX.drawPulses(cx, now);`.

In `seedAchievements()` (line 984) — it is already the "state was replaced" hook — change to:

```js
function seedAchievements() { seen = new Set(S.earned(state)); lastLight.clear(); }
```

- [ ] **Step 3: Verify**

Run: `node tests/test_sim.mjs && node tests/test_fx.mjs` → pass.

Browser (user): delete a generator's wire — every machine that loses power flashes a red ring once; reconnect — green rings once; reload — no rings on load.

- [ ] **Step 4: Commit**

```bash
git add src/fx.js src/game.js
git commit -m "feat(fx): one-shot ring pulse when a node's status light changes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Event bursts

**Files:**
- Modify: `src/fx.js` (append), `src/game.js:998` (achievement toast), `:1297-1308` (`frame`), `draw`

**Interfaces:**
- Consumes: `settings.bursts`.
- Produces: `FX.burst(x, y, now)`, `FX.drawParticles(cx, now)`.

- [ ] **Step 1: Append to `src/fx.js`**

```js
// ------------------------------------------------------------------ event bursts
const MAX_PARTICLES = 200; // a save import that retro-toasts a dozen achievements cannot hitch
const particles = [];
export function burst(x, y, now) {
  if (!settings.bursts) return;
  const n = 12 + Math.floor(Math.random() * 9);
  for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 50;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: now, life: 600 + Math.random() * 300 });
  }
}
export function drawParticles(cx, now) {
  cx.fillStyle = '#4dd8ff';
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i], age = (now - p.t0) / 1000, k = age * 1000 / p.life;
    if (k >= 1) { particles.splice(i, 1); continue; }
    cx.globalAlpha = 1 - k;
    cx.fillRect(p.x + p.vx * age - 1, p.y + p.vy * age - 1, 2, 2);
  }
  cx.globalAlpha = 1;
}
```

- [ ] **Step 2: Call sites in `game.js`**

Add a helper above `seedAchievements` (near line 983):

```js
// World-space burst origin: the triggering node, else the HUB centre.
function burstAt(node) {
  const n = node ?? state.nodes.find((q) => q.key === 'the-hub');
  if (!n) return;
  const r = nodePx(n);
  FX.burst(r.x + r.w / 2, r.y + r.h / 2, performance.now());
}
```

Line 998, after the achievement `toast(...)`: add `burstAt();`.

In `frame()`:

```js
    if ((state.unlocked?.milestone ?? 0) !== lastMs) {
      if (lastMs !== -1) burstAt();   // -1 is the pre-first-frame sentinel, not an unlock
      lastMs = state.unlocked?.milestone ?? 0; buildPalette();
    }
```

and inside the `if (phase !== lastPhase)` block, after the `toast(...)`: add `burstAt(state.nodes.find((q) => q.key === 'space-elevator'));`.

In `draw(now)`, after `FX.drawPulses(cx, now);` add `FX.drawParticles(cx, now);`.

- [ ] **Step 3: Verify**

Run: `node tests/test_sim.mjs && node tests/test_fx.mjs` → pass.

Browser (user): earn an achievement / complete a milestone — a spray of dots from the HUB alongside the toast; import a save with many achievements — a single bounded spray, no hitch.

- [ ] **Step 4: Commit**

```bash
git add src/fx.js src/game.js
git commit -m "feat(fx): particle bursts on milestone, elevator phase, achievement and win

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Ambient layer — day/night, shimmer, manta

**Files:**
- Modify: `tests/test_fx.mjs`, `src/fx.js` (append), `src/game.js:182-221` (`draw`, `drawGrid`), `:223-232` (`panel`), `:280-290` (deposit branch), `:353` (wire shadowBlur)

**Interfaces:**
- Consumes: `settings.dayNight`, `settings.manta`, `S.WORLD_W/H`, `S.TILE`.
- Produces: `nightDepth(time) → 0..1`, `FX.manta(cx, time, worldW, worldH)`, `FX.shimmer(cx, x, y, w, h, now)`, `FX.nightTint(cx, w, h, n)`.

- [ ] **Step 1: Add failing test**

Append to `tests/test_fx.mjs` before the final `console.log`:

```js
// --- day/night curve: 10-minute cycle, 0 at noon, 1 at midnight, continuous at the wrap
assert.equal(FX.nightDepth(0), 0);
assert.ok(Math.abs(FX.nightDepth(300) - 1) < 1e-9);
assert.ok(Math.abs(FX.nightDepth(599.999) - FX.nightDepth(0)) < 1e-3, 'continuous across cycle boundary');
assert.ok(FX.nightDepth(150) > 0.4 && FX.nightDepth(150) < 0.6);
```

- [ ] **Step 2: Run to verify failure**

Run: `node tests/test_fx.mjs` → FAIL: `FX.nightDepth is not a function`.

- [ ] **Step 3: Append to `src/fx.js`**

```js
// ------------------------------------------------------------------ ambient
export const CYCLE = 600; // seconds of game time per day
export const nightDepth = (time) => (1 - Math.cos(2 * Math.PI * ((time % CYCLE) / CYCLE))) / 2;

// Dark, soft blob drifting under the world on a slow Lissajous path. Purely ambient.
export function manta(cx, time, worldW, worldH) {
  if (!settings.manta) return;
  const x = worldW / 2 + worldW * 0.42 * Math.sin(time / 97);
  const y = worldH / 2 + worldH * 0.42 * Math.sin(time / 151);
  const rx = 160, ry = 96; // ~10x6 tiles
  const g = cx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  cx.save(); cx.translate(x, y); cx.scale(1, ry / rx); cx.translate(-x, -y);
  cx.fillStyle = g; cx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
  cx.restore();
}

// Slow diagonal specular band across a deposit, ~4s period.
export function shimmer(cx, x, y, w, h, now) {
  if (!settings.dayNight) return;
  const k = (now / 4000) % 1;
  const g = cx.createLinearGradient(x - w + k * 2 * w, y, x + k * 2 * w, y + h);
  g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.15)'); g.addColorStop(0.55, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.beginPath(); cx.roundRect(x + 2, y + 2, w - 4, h - 4, 8); cx.fill();
}

// Screen-space tint over the world; text and tile fills are drawn later and stay untouched.
export function nightTint(cx, w, h, n) {
  if (n <= 0) return;
  cx.fillStyle = `rgba(4,6,20,${0.25 * n})`;
  cx.fillRect(0, 0, w, h);
}
```

- [ ] **Step 4: Run tests**

Run: `node tests/test_fx.mjs` → `all fx checks passed`.

- [ ] **Step 5: Wire into `game.js`**

Module scope near `drawNow`: `let night = 0;`

`draw(now)` becomes:

```js
function draw(now) {
  drawNow = now;
  night = settings.dayNight ? FX.nightDepth(state.time ?? 0) : 0;
  canvas.width = innerWidth; canvas.height = innerHeight;
  cx.fillStyle = '#0a0c12';
  cx.fillRect(0, 0, canvas.width, canvas.height);
  cx.save();
  cx.translate(cam.x, cam.y);
  cx.scale(cam.z, cam.z);

  FX.manta(cx, state.time ?? 0, S.WORLD_W * T, S.WORLD_H * T);
  drawGrid();
  cx.restore();
  FX.nightTint(cx, canvas.width, canvas.height, night);   // darkens background, manta and grid only
  cx.save();
  cx.translate(cam.x, cam.y);
  cx.scale(cam.z, cam.z);
  for (const w of state.wires) drawWire(w, now);
  if (ui.mode === 'wire' && ui.wireFrom) drawWirePreview();
  for (const n of state.nodes) drawNode(n);
  FX.drawPulses(cx, now);
  FX.drawParticles(cx, now);
  if (ui.mode === 'place' && ui.placeKey) drawGhost();
  cx.restore();
  drawMinimap();
}
```

`panel()` line 228: `cx.shadowColor = edge; cx.shadowBlur = glow * (1 + night);`

`drawWire` line 353: `cx.shadowBlur = (selected ? 10 : 5) * (1 + night);`

Deposit branch of `drawNode`: after the dashed stroke (`cx.stroke(); cx.setLineDash([]);` at line 285) add `FX.shimmer(cx, r.x, r.y, r.w, r.h, drawNow);`.

- [ ] **Step 6: Verify**

Run: `node tests/test_sim.mjs && node tests/test_fx.mjs` → pass.

Browser (user): at 4× speed watch ~2.5 real minutes — field dims slightly, machine and wire glows spread, labels stay readable; deposits show a slow sweep; a faint shadow drifts across the map at low zoom.

- [ ] **Step 7: Commit**

```bash
git add src/fx.js tests/test_fx.mjs src/game.js
git commit -m "feat(fx): game-time day/night tint with wider glows, deposit shimmer, drifting manta shadow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: ⚙ settings panel + HUD trim

**Files:**
- Modify: `index.html:12-28`, `src/style.css:15,89-92,108-111`, `src/game.js:700-702` (Escape), `:1236-1247` (`PANELS`), main() after the help handler (~`:1267`), `:1082` unchanged (seed span keeps its id)

**Interfaces:**
- Consumes: `settings`, `saveSettings`, `setTut`, existing `btn-reset`/`btn-export`/`btn-import`/`file-import` handlers (ids unchanged, so handlers are untouched).

- [ ] **Step 1: `index.html` header and panel**

Replace the `<header id="hud">…</header>` block with:

```html
<header id="hud">
  <span class="logo">GRID<b>WORKS</b></span>
  <span id="hud-power">⚡ 0 / 0 MW</span>
  <span id="hud-shipped">📦 0 shipped</span>
  <button id="hud-alerts" title="problems in your factory" style="display:none"></button>
  <button id="hud-achievements" title="achievements">🏆 0/0</button>
  <button id="hud-help" title="controls">?</button>
  <button id="hud-settings" title="settings">⚙</button>
  <span class="spacer"></span>
  <span id="hud-hint"></span>
  <button id="btn-pause" title="pause/resume (Space)">⏸</button>
  <button id="btn-speed" title="sim speed">1x</button>
</header>
```

After `<div id="help"></div>` add:

```html
<div id="settings">
  <h3>Effects</h3>
  <label><input type="checkbox" data-key="flow"> Flow shapes on belts and pipes</label>
  <label><input type="checkbox" data-key="pulses"> Status change pulses</label>
  <label><input type="checkbox" data-key="bursts"> Event bursts</label>
  <label><input type="checkbox" data-key="dayNight"> Day / night</label>
  <label><input type="checkbox" data-key="manta"> Manta</label>
  <h3>Wires</h3>
  <label><input type="radio" name="wireStyle" value="noodle"> Noodle</label>
  <label><input type="radio" name="wireStyle" value="straight"> Straight</label>
  <h3>Tutorial</h3>
  <button id="btn-tutorial">Replay tutorial</button>
  <h3>World</h3>
  <div class="row"><span id="hud-seed">🌱</span></div>
  <div class="row">
    <button id="btn-export" title="download save as JSON">Export</button>
    <button id="btn-import" title="load save from JSON">Import</button>
    <input type="file" id="file-import" accept=".json,application/json" style="display:none">
    <button id="btn-reset" class="danger">New Map</button>
  </div>
</div>
```

- [ ] **Step 2: `style.css`**

Line 15: `#hud-seed { color: #7bed9f; cursor: default; }` → `#hud-seed { color: #7bed9f; font-size: 12px; }`.

Lines 89 and 92: add `#settings` to both selectors:

```css
#alerts, #achievements, #help, #settings { position: fixed; top: 46px; width: 300px; max-height: 50vh;
```
```css
#alerts.open, #achievements.open, #help.open, #settings.open { display: block; }
```

After line 111 (`#help .key b …`) add:

```css
#hud-settings { color: #9fb0c3; }
#settings h3 { font-size: 11px; letter-spacing: 1px; color: #4dd8ff; margin: 6px 7px 2px; }
#settings label { display: flex; gap: 8px; align-items: center; padding: 3px 7px; font-size: 12px; color: #cfe8ff; cursor: pointer; }
#settings label:hover { background: #17324a; border-radius: 4px; }
#settings .row { display: flex; gap: 8px; padding: 4px 7px; }
#settings button { font-size: 12px; }
```

- [ ] **Step 3: `game.js` wiring**

Line 1239: `const PANELS = ['alerts', 'achievements', 'help', 'settings'];`

After the `hud-help` onclick block (ends ~line 1267) add:

```js
  const setBox = document.getElementById('settings');
  const syncSettings = () => {
    for (const el of setBox.querySelectorAll('input[data-key]')) el.checked = settings[el.dataset.key];
    for (const el of setBox.querySelectorAll('input[name=wireStyle]')) el.checked = settings.wireStyle === el.value;
  };
  setBox.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.key) settings[el.dataset.key] = el.checked;
    else if (el.name === 'wireStyle') settings.wireStyle = el.value;
    saveSettings();
  });
  document.getElementById('btn-tutorial').onclick = () => {
    setTut(null);
    setBox.classList.remove('open');
    offer.classList.add('open');
  };
  document.getElementById('hud-settings').onclick = () => {
    closeOthers('settings');
    syncSettings();
    setBox.classList.toggle('open');
    setBox.style.left =
      Math.min(document.getElementById('hud-settings').getBoundingClientRect().left, innerWidth - 308) + 'px';
  };
```

Line 702 (module-level Escape): 

```js
  if (e.key === 'Escape') { setMode('idle'); select(null); document.getElementById('settings').classList.remove('open'); }
```

The `S` key toggle (Task 1, line ~724) already writes `settings.wireStyle`; the panel re-syncs on open, so no extra hook.

`refreshHelp()` only positions `#help`; the settings card positions itself on click. // ponytail: no resize re-position for settings — it is opened and closed, not left up

- [ ] **Step 4: Verify**

Run: `grep -n "hud-seed\|btn-export\|btn-import\|btn-reset\|file-import" index.html src/game.js` → every id appears exactly once in `index.html` and its handler in `game.js` is unchanged.
Run: `node tests/test_sim.mjs && node tests/test_fx.mjs` → pass.

Browser (user): header reads `GRIDWORKS ⚡ 📦 (⚠) 🏆 ? ⚙ … ⏸ 1x`; ⚙ opens the card under the button, closes `?`/🏆 if open; unchecking Flow stops capsules immediately; Wire style radio matches `S`; Replay tutorial shows the offer card; seed shows; Export/Import/New Map work from the card; Escape closes it.

- [ ] **Step 5: Commit**

```bash
git add index.html src/style.css src/game.js
git commit -m "feat(ui): settings panel with effect toggles, wire style, replay tutorial; seed/export/import/new map leave the HUD

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Changelog + spec status

**Files:**
- Modify: `CHANGELOG.md` (top entry, follow the existing `2026-08-23 — Tile I/O layers` format)

- [ ] **Step 1: Add the entry**

Insert above the `2026-08-23 — Tile I/O layers` entry, matching its heading style:

```markdown
## 2026-08-24 — Juice: effects layer + settings panel

- Flow capsules (bubbles on pipes) replace marching ants; spacing tracks the belt's share of
  capacity, speed tracks its mark. A saturated belt reads as a train, a trickle as a blip.
- A node's status light change fires one expanding ring in the new colour; steady tiles never
  animate. Milestones, elevator phases, achievements and the win burst particles.
- Ten-minute game-time day/night: the field dims a little, glows widen, labels stay legible.
  Deposits shimmer. A faint manta shadow drifts under the world.
- ⚙ settings panel: five effect toggles, default wire style, replay tutorial, seed, Export /
  Import / New Map. All display preferences now live in one `gw_settings` key; the old minimap
  and tutorial keys migrate on first load. The HUD keeps only what you act on while playing.
- New `src/fx.js`, `src/settings.js`, `tests/test_fx.mjs` (`node tests/test_fx.mjs`). `sim.js`
  and the save format are unchanged.
```

- [ ] **Step 2: Run everything one last time**

Run: `node tests/test_sim.mjs && node tests/test_fx.mjs`
Expected: `all sim checks passed` then `all fx checks passed`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for juice effects + settings panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Then hand off to `superpowers:finishing-a-development-branch`.

---

## Self-review

- **Spec coverage:** §1 flow → Task 2; §2 pulses → Task 3; §3 bursts → Task 4 (milestone has no toast today — the burst hooks the same `lastMs` change `frame()` already detects); §4 ambient → Task 5 (shimmer follows `dayNight` as the spec says); §5 settings module + migration → Task 1; §6 panel + HUD → Task 6; testing list → Tasks 1, 2, 5 asserts + browser passes listed per task.
- **Placeholders:** none; every code step has its code.
- **Type consistency:** `FX.flow(cx, w, pts, ratio, speedMul, now, color)`, `FX.pulse(rect, color, now)`, `FX.burst(x, y, now)`, `FX.nightDepth(time)`, `FX.manta(cx, time, worldW, worldH)`, `FX.shimmer(cx, x, y, w, h, now)`, `FX.nightTint(cx, w, h, n)` used identically across tasks; `drawNow`/`night` declared in Task 3/5 before use; `settings.tutorial`/`setTut` from Task 1 used in Task 6.
