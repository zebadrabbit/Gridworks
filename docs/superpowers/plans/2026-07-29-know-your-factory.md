# Know Your Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the per-node `status` the sim already computes as at-a-glance status lights, an alert list, and lifetime uptime/production counters, so a player alt-tabbing in for 60 seconds can tell whether the factory is healthy without panning the map.

**Architecture:** One pure function `lightOf(node, def)` in `sim.js` maps a node's `status` string plus its stored power `ratio` to `'red' | 'yellow' | 'green' | null`. `tick()` stores `node.ratio` (so the renderer never recomputes power networks) and accumulates four plain-number lifetime counters per node. `game.js` consumes `lightOf` in three places: the node's border/glow color, the inspector's status class and uptime line, and a HUD alert chip whose panel lists red machines and throttled power networks and pans the camera on click.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Canvas 2D for the world, plain DOM for HUD/panels. Tests are `node:assert`-based in `tests/test_sim.mjs`, run with `./manage.sh test`.

**Spec:** `docs/superpowers/specs/2026-07-29-know-your-factory-design.md`

## Global Constraints

- **Never edit `data/source/satisfactory_data.json` in place.** Nothing in this plan touches it. (`docs/SOURCE_OF_TRUTH.md`)
- **Do not invent items, recipes, or stats.** This feature adds no game content.
- **No new dependencies, no build step, no backend.** The app is `index.html` + `src/*` served statically.
- **`sim.js` stays DOM-free.** It is the only tested file; anything testable belongs there.
- **No new source files.** All changes land in `src/sim.js`, `src/game.js`, `src/style.css`, `index.html`, `tests/test_sim.mjs`, `CHANGELOG.md`. Splitting `game.js` is explicitly out of scope (revisit near 1000 lines).
- **White light is documented but unreachable.** Overclocking is not in this plan; do not add state for it.
- **Test command:** `./manage.sh test` (equivalently `node tests/test_sim.mjs`). It prints `all sim checks passed` and exits 0 on success.
- **Commit style:** conventional commits (`feat:`, `fix:`, `test:`, `docs:`), matching existing history.

---

### Task 1: `lightOf()` and stored power ratio in sim.js

Adds the single source of truth for "what color is this machine". Nothing renders it yet.

**Files:**
- Modify: `src/sim.js` (add constants + `lightOf` near the other exports; one line inside `tick()`)
- Test: `tests/test_sim.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export const THROTTLE_LIGHT = 0.95` — power ratio below which a running node lights yellow.
  - `export function lightOf(node, def)` → `'red' | 'yellow' | 'green' | null`. `node` needs only `.status` and optionally `.ratio`; `def` is `ctx.catalog[node.key]`. Returns `null` for node types that get no light (deposit, hub, elevator, logistic) and for unknown statuses.
  - `node.ratio` — number in `[0, 1]`, written by `tick()` for every node each tick. `1` for nodes that draw no power.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_sim.mjs`, immediately before the final `console.log('all sim checks passed');` line:

```js
// status lights: one pure mapping from status (+ power ratio) to a light color
{
  const mach = ctx.catalog.smelter;
  const mine = ctx.catalog['miner-mk1'];
  const gen = ctx.catalog['biomass-burner'];
  const box = ctx.catalog['storage-container'];

  assert.equal(lightOf({ status: 'no power' }, mach), 'red');
  assert.equal(lightOf({ status: 'no recipe' }, mach), 'red');
  assert.equal(lightOf({ status: 'no fuel' }, gen), 'red');
  assert.equal(lightOf({ status: 'no deposit' }, mine), 'red');

  assert.equal(lightOf({ status: 'waiting for input' }, mach), 'yellow');
  assert.equal(lightOf({ status: 'output full' }, mine), 'yellow');
  assert.equal(lightOf({ status: 'full' }, box), 'yellow');

  assert.equal(lightOf({ status: 'crafting' }, mach), 'green', 'missing ratio counts as full power');
  assert.equal(lightOf({ status: 'mining', ratio: 1 }, mine), 'green');
  assert.equal(lightOf({ status: 'generating' }, gen), 'green');
  assert.equal(lightOf({ status: 'storing' }, box), 'green');

  // brownout: the status string still says "crafting", the light must not say green
  assert.equal(lightOf({ status: 'crafting', ratio: 0.5 }, mach), 'yellow');
  assert.equal(lightOf({ status: 'crafting', ratio: THROTTLE_LIGHT }, mach), 'green', 'boundary is inclusive-green');
  assert.equal(lightOf({ status: 'crafting', ratio: THROTTLE_LIGHT - 0.01 }, mach), 'yellow');

  // unlit node types keep their per-type color
  assert.equal(lightOf({ status: 'ok' }, ctx.catalog.splitter), null, 'logistics get no light');
  assert.equal(lightOf({ status: 'ok' }, ctx.catalog['pipe-merger']), null);
  assert.equal(lightOf({ status: 'milestone: Part Assembly' }, ctx.catalog['the-hub']), null);
  assert.equal(lightOf({ status: 'phase 1: Platform' }, ctx.catalog['space-elevator']), null);
  assert.equal(lightOf({ status: 'growing' }, ctx.catalog.deposit), null);
  assert.equal(lightOf({ status: 'idle' }, mach), null, 'pre-first-tick status has no light');
}

// tick stores the power ratio on every node so the renderer never recomputes networks
{
  const s = newGame(45, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const d = addDeposit(s, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(s, 'miner-mk1', 10, 5, ctx);
  const b = addNode(s, 'biomass-burner', 10, 12, ctx);
  b.buf.wood = 50;
  addWire(s, d, 'out0', m, 'res0', ctx);
  addWire(s, b, 'pout', m, 'pin', ctx);
  tick(s, 0.1, ctx);
  assert.equal(m.ratio, 1, 'fully supplied miner runs at ratio 1');
  assert.equal(b.ratio, 1, 'a node that draws no power reports ratio 1');
}

// brownout: an oversubscribed network throttles, still reports "mining", lights yellow
{
  const s = newGame(47, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const d = addDeposit(s, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(s, 'miner-mk1', 10, 5, ctx);
  const hog = addNode(s, 'accelerator', 10, 10, ctx); // 500 MW idle draw
  const b = addNode(s, 'biomass-burner', 16, 10, ctx); // 30 MW
  b.buf.wood = 50;
  addWire(s, d, 'out0', m, 'res0', ctx);
  addWire(s, b, 'pout', m, 'pin', ctx);
  addWire(s, b, 'pout', hog, 'pin', ctx);
  tick(s, 0.1, ctx);
  assert.ok(m.ratio > 0 && m.ratio < 1, `browned-out miner has a partial ratio, got ${m.ratio}`);
  assert.equal(m.status, 'mining', 'the status string cannot express a brownout');
  assert.equal(lightOf(m, ctx.catalog['miner-mk1']), 'yellow', 'but the light can');
}
```

Extend the import on line 4 of `tests/test_sim.mjs` — add `lightOf` and `THROTTLE_LIGHT` to the existing named-import list:

```js
import { buildCtx, newGame, addNode, addWire, removeWire, addDeposit, setRecipe, tick, canConnect, portsOf, MILESTONES, isUnlocked, normalizeSave, START_UNLOCKED, simulateOffline, OFFLINE_CAP, ELEVATOR_PHASES, ELEVATOR_ITEMS, lightOf, THROTTLE_LIGHT } from '../src/sim.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./manage.sh test`
Expected: FAIL — `SyntaxError: The requested module '../src/sim.js' does not provide an export named 'lightOf'`

- [ ] **Step 3: Write minimal implementation**

In `src/sim.js`, add immediately above the `// ----------------------------------------------------------------------- tick` banner comment (just before `const BUF_CAP = 100;`):

```js
// ---------------------------------------------------------------- status light

// The status strings tick() already writes, mapped to a light color. Deposits, the HUB,
// the elevator and logistics get no light: their status is milestone/phase text or the
// unconditional 'ok', so a light there would be permanent noise.
const LIT_TYPES = new Set(['miner', 'machine', 'generator', 'store']);
const LIGHT_BY_STATUS = {
  'no power': 'red', 'no fuel': 'red', 'no recipe': 'red', 'no deposit': 'red',
  'waiting for input': 'yellow', 'output full': 'yellow', full: 'yellow',
  mining: 'green', crafting: 'green', generating: 'green', storing: 'green',
};
// A partially-supplied machine still reports 'crafting'; below this ratio it is visibly
// slowed and must not read as healthy.
export const THROTTLE_LIGHT = 0.95;

export function lightOf(node, def) {
  if (!LIT_TYPES.has(def.type)) return null;
  const light = LIGHT_BY_STATUS[node.status] ?? null;
  if (light !== 'green') return light;
  return (node.ratio ?? 1) < THROTTLE_LIGHT ? 'yellow' : 'green';
}
```

In `tick()`, store the ratio. Change:

```js
  for (const node of state.nodes) {
    const def = ctx.catalog[node.key];
    const r = ratioOf(node);
```

to:

```js
  for (const node of state.nodes) {
    const def = ctx.catalog[node.key];
    const r = ratioOf(node);
    node.ratio = r;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./manage.sh test`
Expected: PASS — prints `all sim checks passed`

- [ ] **Step 5: Commit**

```bash
git add src/sim.js tests/test_sim.mjs
git commit -m "feat(sim): lightOf() status-light mapping and stored power ratio"
```

---

### Task 2: Lifetime counters (`made`, `tGreen`, `tYellow`, `tRed`)

Per-node totals that persist through saves and accumulate through offline simulation for free, because they are plain numbers on the node object.

**Files:**
- Modify: `src/sim.js` (miner output line, machine product line, new second loop in `tick()`)
- Test: `tests/test_sim.mjs`

**Interfaces:**
- Consumes: `lightOf(node, def)` from Task 1.
- Produces:
  - `node.made` — number, total units produced. Written on miners (units mined) and machines (sum of product amounts per completed craft). Absent (`undefined`) on every other type, including generators.
  - `node.tGreen`, `node.tYellow`, `node.tRed` — numbers, seconds accumulated in each light state. Written for every node `lightOf` lights.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_sim.mjs`, immediately before the final `console.log('all sim checks passed');` line:

```js
// lifetime counters: production is conserved, and state-time accumulates the same
// whether the run happened live or through the coarse offline simulator
{
  const build = (seed) => {
    const s = newGame(seed, ctx);
    s.unlocked.buildings = Object.keys(ctx.catalog);
    s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
    const hubN = s.nodes[0];
    const d = addDeposit(s, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
    const m = addNode(s, 'miner-mk1', 10, 5, ctx);
    const sm = addNode(s, 'smelter', 14, 5, ctx);
    const b = addNode(s, 'biomass-burner', 10, 12, ctx);
    b.buf.wood = 200; // 0.3 wood/s -> lasts the whole run
    setRecipe(s, sm, 'iron-ingot', ctx);
    addWire(s, d, 'out0', m, 'res0', ctx);
    addWire(s, b, 'pout', m, 'pin', ctx);
    addWire(s, b, 'pout', sm, 'pin', ctx);
    addWire(s, m, 'out0', sm, 'in0', ctx);
    addWire(s, sm, 'out0', hubN, 'in0', ctx);
    return { s, m, sm };
  };

  const live = build(49);
  for (let i = 0; i < 3000; i++) tick(live.s, 0.1, ctx); // 300s

  // every ingot the smelter made is either shipped to the HUB or still in its buffer
  const shipped = live.s.shipped['iron-ingot'] ?? 0;
  const held = live.sm.buf['iron-ingot'] ?? 0;
  assert.ok(live.sm.made > 100, `smelter produced, got ${live.sm.made}`);
  assert.ok(Math.abs(live.sm.made - (shipped + held)) < 1e-6,
    `made ${live.sm.made} == shipped ${shipped} + held ${held}`);
  assert.ok(live.m.made > 100, `miner produced, got ${live.m.made}`);
  assert.equal(live.s.nodes.find((n) => n.key === 'biomass-burner').made, undefined,
    'generators produce no items and get no made counter');

  // 300s of green uptime, whether live or offline
  const total = (n) => (n.tGreen ?? 0) + (n.tYellow ?? 0) + (n.tRed ?? 0);
  assert.ok(Math.abs(total(live.m) - 300) < 1e-6, `all live time accounted, got ${total(live.m)}`);

  const away = build(49);
  assert.equal(simulateOffline(away.s, 300, ctx), 300);
  assert.ok(Math.abs(total(away.m) - 300) < 1e-6, `all offline time accounted, got ${total(away.m)}`);
  assert.ok(Math.abs((live.m.tGreen ?? 0) - (away.m.tGreen ?? 0)) < 0.6,
    `uptime matches within one offline step (${live.m.tGreen} vs ${away.m.tGreen})`);
  assert.ok(live.m.tGreen > 290, `miner ran green nearly the whole time, got ${live.m.tGreen}`);

  // counters are plain numbers: they survive a save round-trip untouched
  const rt = normalizeSave(JSON.parse(JSON.stringify(live.s)), ctx);
  const rtM = rt.nodes.find((n) => n.id === live.m.id);
  assert.equal(rtM.made, live.m.made, 'made survives save/normalize');
  assert.equal(rtM.tGreen, live.m.tGreen, 'tGreen survives save/normalize');
}

// a red node accumulates tRed, not tGreen
{
  const s = newGame(51, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const d = addDeposit(s, 'copper-ore', 'mineral', 'normal', 1, 30, 30);
  const dark = addNode(s, 'miner-mk1', 35, 30, ctx); // wired to ore, never powered
  addWire(s, d, 'out0', dark, 'res0', ctx);
  for (let i = 0; i < 100; i++) tick(s, 0.1, ctx); // 10s
  assert.equal(dark.status, 'no power');
  assert.ok(Math.abs(dark.tRed - 10) < 1e-6, `unpowered miner banks red time, got ${dark.tRed}`);
  assert.equal(dark.tGreen, undefined, 'never green, never allocated');
  assert.equal(dark.made, undefined, 'never produced');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./manage.sh test`
Expected: FAIL — `AssertionError` on `smelter produced, got undefined` (`live.sm.made > 100` where `made` is `undefined`)

- [ ] **Step 3: Write minimal implementation**

Three edits in `src/sim.js`, all inside `tick()`.

**3a — miner output.** Replace:

```js
      if (have >= BUF_CAP) { node.status = 'output full'; continue; }
      node.buf[res] = Math.min(BUF_CAP, have + (def.rate * node.depositMult / 60) * dt * r);
      node.status = 'mining';
```

with:

```js
      if (have >= BUF_CAP) { node.status = 'output full'; continue; }
      const mined = Math.min(BUF_CAP, have + (def.rate * node.depositMult / 60) * dt * r) - have;
      node.buf[res] = have + mined;
      node.made = (node.made ?? 0) + mined;
      node.status = 'mining';
```

**3b — machine output.** Replace:

```js
        if (recipe.products.every(([res]) => (node.buf[res] ?? 0) < BUF_CAP)) {
          for (const [res, amt] of recipe.products) node.buf[res] = (node.buf[res] ?? 0) + amt;
          node.progress = 0;
        } else { node.progress = 1; node.status = 'output full'; }
```

with:

```js
        if (recipe.products.every(([res]) => (node.buf[res] ?? 0) < BUF_CAP)) {
          for (const [res, amt] of recipe.products) {
            node.buf[res] = (node.buf[res] ?? 0) + amt;
            node.made = (node.made ?? 0) + amt;
          }
          node.progress = 0;
        } else { node.progress = 1; node.status = 'output full'; }
```

**3c — state-time accumulation.** The main node loop `continue`s out of most branches, so this cannot ride at the bottom of that loop. Add a second loop immediately after the main `for (const node of state.nodes) { ... }` loop closes — i.e. directly above the line `const byId = Object.fromEntries(state.nodes.map((n) => [n.id, n]));`:

```js
  // second pass: the main loop continues out of most branches, so state-time is banked
  // here, after every node's status for this tick is final
  for (const node of state.nodes) {
    const light = lightOf(node, ctx.catalog[node.key]);
    if (light === 'green') node.tGreen = (node.tGreen ?? 0) + dt;
    else if (light === 'yellow') node.tYellow = (node.tYellow ?? 0) + dt;
    else if (light === 'red') node.tRed = (node.tRed ?? 0) + dt;
  }

```

- [ ] **Step 4: Run test to verify it passes**

Run: `./manage.sh test`
Expected: PASS — prints `all sim checks passed`

- [ ] **Step 5: Commit**

```bash
git add src/sim.js tests/test_sim.mjs
git commit -m "feat(sim): lifetime made/uptime counters on miners, machines and generators"
```

---

### Task 3: Render the status light as the node's border glow

The visible half of the feature. A lit node's panel border and glow carry its state color instead of its per-type color; the on-node status text follows the same source of truth.

**Files:**
- Modify: `src/game.js:6-17` (add `LIGHT_COLOR`), `src/game.js:174-207` (`drawNode`)
- Test: browser (no test suite covers `game.js`)

**Interfaces:**
- Consumes: `S.lightOf(node, def)` from Task 1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the light palette**

In `src/game.js`, directly below the `TYPE_COLOR` object (which ends on line 11 with `};`), add:

```js
// status-light colors, matching .status.bad/.warn/.good in style.css.
// no white entry: overclocking, the only thing that would emit it, does not exist yet.
const LIGHT_COLOR = { red: '#ff7675', yellow: '#f4d03f', green: '#58d68d' };
```

- [ ] **Step 2: Tint the border and the status text**

In `drawNode`, replace:

```js
  const color = TYPE_COLOR[def.type] ?? '#4dd8ff';
```

with:

```js
  const light = S.lightOf(n, def);
  const color = LIGHT_COLOR[light] ?? TYPE_COLOR[def.type] ?? '#4dd8ff';
```

Then replace the hardcoded status-text check:

```js
  const bad = ['no power', 'no fuel', 'no recipe'].includes(n.status);
  cx.fillStyle = bad ? '#ff7675' : '#7a8aa0'; cx.font = '9px monospace';
```

with:

```js
  cx.fillStyle = light === 'red' ? LIGHT_COLOR.red : '#7a8aa0'; cx.font = '9px monospace';
```

This also fixes a latent gap: the old list omitted `no deposit`, so an unwired miner's status rendered grey.

Note the deposit branch returns before this point (`src/game.js:198`), so deposits are untouched. `color` is also used by the machine progress bar and stays consistent with the border by construction.

- [ ] **Step 3: Verify in the browser**

Run: `./manage.sh start` then open `http://localhost:8889`

Check, on a fresh map:
1. Place a miner with no deposit wired → border and status text render red (`#ff7675`).
2. Wire it to a deposit but give it no power → still red, status `no power`.
3. Power it with a biomass burner stocked with leaves → border turns green.
4. Let the miner's buffer fill to 100 with no belt out → border turns yellow, status `output full`.
5. Place an accelerator on the same burner network → the miner's border turns yellow while its status still reads `mining` (the brownout case).
6. A splitter and the HUB keep their existing colors (`#58d68d` and `#ff6b81`) regardless of state.

Then: `./manage.sh stop`

- [ ] **Step 4: Commit**

```bash
git add src/game.js
git commit -m "feat(ui): status-light border glow on machines"
```

---

### Task 4: Uptime and production in the inspector

**Files:**
- Modify: `src/game.js:543-549` (`refreshInspector`, the non-deposit node branch)
- Test: browser

**Interfaces:**
- Consumes: `S.lightOf` (Task 1), `node.made` / `node.tGreen` / `node.tYellow` / `node.tRed` (Task 2).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Derive the status class from the light**

In `refreshInspector`, replace:

```js
  const statusCls = ['no power', 'no fuel', 'no recipe'].includes(n.status) ? 'bad'
    : ['waiting for input', 'output full', 'full', 'idle'].includes(n.status) ? 'warn' : 'good';
  let html = `<h2>${def.name}</h2><div class="status ${statusCls}">${n.status}</div>`;
```

with:

```js
  const statusCls = { red: 'bad', yellow: 'warn', green: 'good' }[S.lightOf(n, def)] ?? '';
  let html = `<h2>${def.name}</h2><div class="status ${statusCls}">${n.status}</div>`;
  if (['miner', 'machine', 'generator'].includes(def.type)) {
    const lived = (n.tGreen ?? 0) + (n.tYellow ?? 0) + (n.tRed ?? 0);
    const uptime = lived > 0 ? `${Math.round(((n.tGreen ?? 0) / lived) * 100)}% uptime` : '—';
    const made = n.made != null ? ` · ${Math.floor(n.made).toLocaleString()} produced` : '';
    html += `<div class="dim">${uptime}${made}</div>`;
  }
```

Two behavior notes, both intended:
- A node placed this frame has `lived === 0`; it shows `—` rather than `NaN%`.
- The HUB and space elevator now get no status class (previously `good`), so their milestone/phase text renders in the default body color instead of green. They are not machines and their status is not health.

- [ ] **Step 2: Verify in the browser**

Run: `./manage.sh start` then open `http://localhost:8889`

Check:
1. Select a freshly placed smelter → inspector shows `— ` on the line under the status (no `NaN%`).
2. Give it ore and power, wait ~30s → the line reads something like `100% uptime · 12 produced`.
3. Cut its power for ~30s → uptime drops below 100%, `produced` stops climbing.
4. Select a biomass burner → uptime shows, no ` · produced` suffix.
5. Select a storage container → no uptime line at all.
6. Select the HUB → milestone status text still readable, just not green.

Then: `./manage.sh stop`

- [ ] **Step 3: Commit**

```bash
git add src/game.js
git commit -m "feat(ui): uptime and lifetime production in the inspector"
```

---

### Task 5: Alert chip, alert panel, and click-to-pan

The scan-free half: a `⚠ N` chip that tells you there is a problem, and a list that takes you to it. Ends the feature, so it also updates the CHANGELOG.

**Files:**
- Modify: `index.html:16-17` (chip button + panel div)
- Modify: `src/style.css` (append `#hud-alerts` and `#alerts` rules)
- Modify: `src/game.js` (new `alertList` / `refreshAlerts` / `panTo` near the other DOM-panel functions; wiring in `main()`)
- Modify: `CHANGELOG.md`
- Test: browser

**Interfaces:**
- Consumes: `S.lightOf` and `S.THROTTLE_LIGHT` (Task 1); `node._net` and `node.ratio` written by `tick()`.
- Produces: nothing.

- [ ] **Step 1: Add the markup**

In `index.html`, after the `<span id="hud-seed">🌱</span>` line and before `<span class="spacer"></span>`, add:

```html
  <button id="hud-alerts" title="problems in your factory" style="display:none"></button>
```

Then, after the `<aside id="milestone"></aside>` line, add:

```html
<div id="alerts"></div>
```

It is a `<div>`, not an `<aside>`: the `aside` rule in `style.css` forces `top:42px; bottom:0; width:220px`, which is wrong for a dropdown.

- [ ] **Step 2: Add the styles**

Append to `src/style.css`:

```css
#hud-alerts { color: #ff7675; border-color: #5c2323; background: #2c1212; }
#hud-alerts:hover { background: #451b1b; }

#alerts { position: fixed; top: 46px; width: 300px; max-height: 50vh; overflow-y: auto;
  background: rgba(10,13,20,.92); border: 1px solid #1d2733; border-radius: 6px;
  backdrop-filter: blur(4px); padding: 6px; z-index: 20; display: none; }
#alerts.open { display: block; }
#alerts .alert { padding: 5px 7px; border-radius: 4px; cursor: pointer; font-size: 12px;
  color: #ff7675; }
#alerts .alert.warn { color: #f4d03f; }
#alerts .alert:hover { background: #17324a; }
```

- [ ] **Step 3: Add the alert logic**

In `src/game.js`, add these three functions immediately after `updateMilestonePanel()` (which ends on line 609 with `}`) and before `function updateHud()`:

```js
// Red machines are listed one per node. A brownout is a property of a power network, so
// it is listed once per network — twelve entries for one cause is the noise this removes.
function alertList() {
  const out = [];
  const nets = {};
  for (const n of state.nodes) {
    const def = ctx.catalog[n.key];
    if (S.lightOf(n, def) === 'red') out.push({ id: n.id, text: `${def.name} — ${n.status}` });
    // ratio 0 means the network is dead, and those machines are already listed as red
    if (n._net != null && n.ratio > 0 && n.ratio < S.THROTTLE_LIGHT) (nets[n._net] ??= []).push(n);
  }
  for (const group of Object.values(nets)) {
    out.push({ id: group[0].id, warn: true,
      text: `${group.length} machines throttled — grid at ${Math.round(group[0].ratio * 100)}%` });
  }
  return out;
}

function panTo(id) {
  const n = state.nodes.find((q) => q.id === id);
  if (!n) return;
  const half = ctx.catalog[n.key].size / 2;
  cam.x = innerWidth / 2 - (n.x + half) * T * cam.z;
  cam.y = innerHeight / 2 - (n.y + half) * T * cam.z;
  select({ type: 'node', id });
}

function refreshAlerts() {
  const chip = document.getElementById('hud-alerts');
  const box = document.getElementById('alerts');
  const list = alertList();
  chip.textContent = `⚠ ${list.length}`;
  chip.style.display = list.length ? '' : 'none';
  if (!list.length) box.classList.remove('open');
  if (!box.classList.contains('open')) return;
  box.style.left = chip.getBoundingClientRect().left + 'px';
  box.innerHTML = '';
  for (const a of list) {
    const el = document.createElement('div');
    el.className = a.warn ? 'alert warn' : 'alert';
    el.textContent = a.text;
    el.onclick = () => panTo(a.id);
    box.appendChild(el);
  }
}
```

- [ ] **Step 4: Wire it up in `main()`**

In `src/game.js`, inside `main()`, replace:

```js
  setInterval(save, 5000);
  addEventListener('beforeunload', save);
  setInterval(updateBuffers, 400);
  setInterval(updateMilestonePanel, 400);
  updateMilestonePanel();
```

with:

```js
  document.getElementById('hud-alerts').onclick = () => {
    document.getElementById('alerts').classList.toggle('open');
    refreshAlerts();
  };

  setInterval(save, 5000);
  addEventListener('beforeunload', save);
  setInterval(updateBuffers, 400);
  setInterval(updateMilestonePanel, 400);
  setInterval(refreshAlerts, 400);
  updateMilestonePanel();
```

The chip refreshes on a 400ms interval rather than per-frame: it walks every node and rebuilds DOM, which has no business running at 60fps.

- [ ] **Step 5: Verify in the browser**

Run: `./manage.sh start` then open `http://localhost:8889`

Check:
1. Healthy factory → no chip in the HUD at all.
2. Place an unwired miner → chip appears reading `⚠ 1`.
3. Click the chip → panel opens under it, listing `Miner Mk.1 — no deposit` in red.
4. Pan the camera far away, then click that entry → camera centers on the miner and the miner is selected in the inspector.
5. Delete the miner → chip disappears and the panel closes on its own.
6. Build a burner powering a miner plus an accelerator → chip reads `⚠ 1` with a yellow entry like `2 machines throttled — grid at 5%`.
7. Cut that burner's fuel entirely → the entries become individual red `no power` rows, and no throttle row appears (dead networks are not double-counted).
8. Click the chip again → panel closes.

Then: `./manage.sh stop`

- [ ] **Step 6: Update the CHANGELOG**

Insert directly below the `# Changelog` heading in `CHANGELOG.md`:

```markdown
## 2026-07-29 — Know Your Factory

- **Status lights**: a new pure `lightOf()` in sim.js maps each node's existing status
  string plus its power ratio to red/yellow/green; `game.js` renders it as the node's
  border glow and status-text color. Deposits, the HUB, the elevator and logistics get
  no light (their status is milestone text or an unconditional `ok`). White is reserved
  for overclocking, which does not exist yet.
- **Brownouts are visible**: `tick()` now stores `node.ratio`, so a machine on an
  oversubscribed network lights yellow instead of reading as healthy green while
  silently running at a fraction of speed.
- **Alerts**: a `⚠ N` chip in the HUD counts red machines plus throttled networks;
  clicking opens a list, and clicking an entry pans the camera to the culprit and
  selects it. Throttled networks are one entry each, not one per machine.
- **Machine analytics**: miners, machines and generators bank lifetime `made` and
  green/yellow/red state-time; the inspector shows `84% uptime · 1,204 produced`.
  Plain numbers, so saves and offline simulation carry them with no special casing.
- Tests: `lightOf()` across every status and the throttle boundary, ratio storage,
  brownout detection, production conservation through a miner → smelter → HUB chain,
  and uptime accumulating identically live and offline.
```

- [ ] **Step 7: Commit**

```bash
git add index.html src/style.css src/game.js CHANGELOG.md
git commit -m "feat(ui): alert chip listing red machines and throttled power networks"
```

---

## Done when

- `./manage.sh test` passes.
- Every browser check in Tasks 3, 4 and 5 has been performed against a running dev server.
- `git status` is clean and the branch holds five commits.
