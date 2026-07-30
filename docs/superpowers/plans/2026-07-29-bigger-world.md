# Bigger World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete fog of war, grow the world to 720×480 so the same 48 deposits spread nine times further, and dock the minimap into the inspector column with a collapse control.

**Architecture:** Three sequential changes. Fog removal is one atomic deletion spanning `sim.js`, `game.js`, `index.html`, `style.css` and the tests — it cannot be split, because deleting `chunkIndex` from `sim.js` without removing its `game.js` callers leaves the app broken. World size is two constants plus a measurement, since `HUB_X`, `HUB_Y` and `MAX_DIST` already derive from them. The minimap dock splits `#inspector` into a rebuilt body and a static footer so `innerHTML` replacement cannot destroy the canvas.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Canvas 2D, plain DOM for HUD/panels. Tests are `node:assert` in `tests/test_sim.mjs`, run with `./manage.sh test`.

**Spec:** `docs/superpowers/specs/2026-07-29-bigger-world-design.md`

## Global Constraints

- **Never edit `data/source/satisfactory_data.json` in place.** (`docs/SOURCE_OF_TRUTH.md`)
- **Do not invent items, recipes, or stats.** This feature adds no game content.
- **No new dependencies, no build step, no backend, no new source files.**
- **`sim.js` stays DOM-free.** It is the only tested file; anything testable belongs there.
- **`game.js` has no test suite by design.** Do not add one. Its changes are browser-verified.
- **Nothing charges for distance.** Belts and pipes are rate-limited with no length term, power has no transmission loss, and placement costs no resources. This is deliberate — Gridworks is an idle incremental first. Do not add build costs, resource sinks or upkeep.
- **Deposit count stays 48.** Spreading the same quantity further is the point; do not scale count with area.
- **Test command:** `./manage.sh test` (equivalently `node tests/test_sim.mjs`). Prints `all sim checks passed`, exits 0. The Node `MODULE_TYPELESS_PACKAGE_JSON` warning is pre-existing (no `package.json`) — do not chase it.
- **Commit style:** conventional commits, matching existing history.

---

### Task 1: Remove fog of war

One atomic deletion. The app is broken at any intermediate point, so all files land in one commit.

**Files:**
- Modify: `src/sim.js`, `src/game.js`, `index.html`, `src/style.css`, `tests/test_sim.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `START_RADIUS` survives and keeps its meaning (the guaranteed-start band). `CHUNK`, `CHUNK_W`, `CHUNK_H`, `chunkIndex`, `NODE_RADIUS`, `revealAll` and `state.explored` cease to exist — later tasks must not reference them.

- [ ] **Step 1: Delete the fog block from the tests**

In `tests/test_sim.mjs`, delete the entire `{ ... }` block that begins with the comment `// fog of war: explored chunks accumulate around owned buildings and never un-reveal`. It ends with the closing brace before the next top-level comment.

Then remove `CHUNK`, `CHUNK_W`, `CHUNK_H`, `chunkIndex` and `revealAll` from the named-import list on line 4. Leave every other name, including `START_RADIUS`, `MAX_DIST`, `distT`, `tierOf`, `tierFactor` and `START_BUNDLE`.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `./manage.sh test`
Expected: FAIL — `ReferenceError: revealAll is not defined` or similar, because `src/sim.js` still exports it and other assertions may still reference removed names. If it passes instead, you missed a reference; grep the test file for `explored`, `chunkIndex`, `CHUNK` and `revealAll` before continuing.

- [ ] **Step 3: Delete fog from `src/sim.js`**

Remove, in order:

1. The whole `// ---- fog` section: `CHUNK`, `CHUNK_W`, `CHUNK_H`, `NODE_RADIUS`, `chunkIndex`, and `revealAll` with its comment block (currently around lines 165–216).
2. The `revealAll(state, ctx);` call in `newGame` and its trailing comment.
3. The `revealAll(state, ctx);` call in `tick`.
4. In `normalizeSave`, the `explored` default/repair block:

```js
  if (!Array.isArray(s.explored) || s.explored.length !== CHUNK_W * CHUNK_H) {
    s.explored = new Array(CHUNK_W * CHUNK_H).fill(0);
  }
```

replaced by a deletion so stale arrays stop round-tripping:

```js
  delete s.explored; // fog is gone; drop the array old saves still carry
```

5. In `normalizeSave`, change `for (const n of s.nodes) { delete n._net; delete n._fog; }` back to `for (const n of s.nodes) delete n._net;`.

**Then the consequence grep misses if you only follow the spec.** The starter placement guard currently reads:

```js
      // The bound is START_RADIUS - CHUNK, not START_RADIUS: visibility is decided by whether
      // a chunk's CENTRE is within reach (see revealAll), and a tile can sit up to ~CHUNK/2
      // tiles from its own chunk centre, so a starter at 39 could land in a chunk centred at 44.
      if (distT(x, y) * MAX_DIST > START_RADIUS - CHUNK) continue;
```

`CHUNK` no longer exists, and the margin only existed for chunk-centre visibility. Replace all four lines with:

```js
      // x and y are rounded independently, so the integer point can sit further out than `rad`
      // — re-check on the rounded coordinates, which is where the bound has to hold.
      if (distT(x, y) * MAX_DIST > START_RADIUS) continue;
```

This is exact rather than approximate: `distT` is evaluated on the already-rounded coordinates, so no margin is needed.

- [ ] **Step 4: Delete fog from `src/game.js`**

Remove:
1. `const FOG_KEY = 'gridworks-fog';` and `let fogOn = ...`.
2. The `hidden` arrow function and its comment.
3. The `if (hidden(node)) continue;` line in `portAt`.
4. The `if (hidden(state.nodes[i])) continue;` line in `nodeAt`.
5. The `if (hidden(n)) return;` line in `drawNode`'s deposit branch.
6. The `if (hidden(n)) continue;` line in `mmHover`.
7. In `drawMinimap`, the explored-chunk loop — from the `// explored chunks lift out of the background` comment through the closing brace of its `for` loop, plus the `mcx.fillStyle = 'rgba(77,216,255,0.07)';` line that feeds it. The minimap now draws only deposits, buildings and the viewport rectangle.
8. In `drawMinimap`'s deposit pass, change `if (def.type !== 'deposit' || hidden(n)) continue;` to `if (def.type !== 'deposit') continue;`.
9. The `S.revealAll(state, ctx);` line after the `state = load() ?? S.newGame(...)` line.
10. The whole fog-button block in `main()`: `const fogBtn = ...` through its `onclick` handler.

- [ ] **Step 5: Delete fog from `index.html` and `src/style.css`**

In `index.html`, delete the line `  <button id="btn-fog" title="toggle fog of war">🌫</button>`.

In `src/style.css`, delete the rule `#btn-fog.off { opacity: .45; }`.

- [ ] **Step 6: Run the tests**

Run: `./manage.sh test`
Expected: PASS — `all sim checks passed`.

Then confirm nothing dangles: `grep -rn "explored\|revealAll\|_fog\|chunkIndex\|NODE_RADIUS\|CHUNK\|fogOn\|FOG_KEY\|btn-fog" src/ tests/ index.html` must return nothing.

- [ ] **Step 7: Commit**

```bash
git add src/sim.js src/game.js index.html src/style.css tests/test_sim.mjs
git commit -m "feat: remove fog of war"
```

---

### Task 2: Grow the world to 720×480

**Files:**
- Modify: `src/sim.js:3-4` (the two dimension constants), `src/game.js` (minimum zoom)
- Test: `tests/test_sim.mjs`

**Interfaces:**
- Consumes: fog is gone (Task 1), so no chunk grid rescales.
- Produces: `WORLD_W = 720`, `WORLD_H = 480`. `HUB_X` becomes 358, `HUB_Y` 238, `MAX_DIST` ~432.7. `START_RADIUS` stays 40.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_sim.mjs`, immediately before the final `console.log('all sim checks passed');`:

```js
// the world is 720x480: same 48 deposits, spread nine times further
{
  assert.equal(WORLD_W, 720);
  assert.equal(WORLD_H, 480);
  assert.equal(WORLD_W / WORLD_H, 1.5, 'stays 3:2 so the minimap needs no reshaping');
  assert.equal(HUB_X, 358, 'hub recentres with the world');
  assert.equal(HUB_Y, 238);
  assert.ok(MAX_DIST > 430 && MAX_DIST < 435, `MAX_DIST rescales, got ${MAX_DIST}`);
  assert.equal(START_RADIUS, 40, 'the start band stays tight while the map grows');

  // deposits still all place, and spread further apart than on the old map
  const nn = [];
  for (let seed = 6000; seed < 6100; seed++) {
    const deps = genMap(seed, ctx);
    assert.equal(deps.length, 48, `seed ${seed} placed ${deps.length} deposits, expected 48`);
    assert.equal(deps.filter((d) => d.start).length, START_BUNDLE.length,
      `seed ${seed} placed the wrong number of starters`);
    for (const a of deps) {
      let m = Infinity;
      for (const b of deps) if (b !== a) m = Math.min(m, Math.hypot(a.x - b.x, a.y - b.y));
      nn.push(m);
    }
  }
  const median = nn.sort((a, b) => a - b)[Math.floor(nn.length / 2)];
  assert.ok(median > 24, `deposits spread out: median nearest-neighbour ${median}, expected > 24`);

  // the hard floor is now a long way out
  assert.ok(0.6 * MAX_DIST > 250, `uranium floor is ~260 tiles, got ${(0.6 * MAX_DIST).toFixed(0)}`);
}
```

Add `WORLD_W` and `WORLD_H` to the named-import list on line 4.

- [ ] **Step 2: Run the test to verify it fails**

Run: `./manage.sh test`
Expected: FAIL — `AssertionError: Expected values to be strictly equal: 240 !== 720`

- [ ] **Step 3: Change the dimensions**

In `src/sim.js`, lines 3–4:

```js
export const WORLD_W = 720;
export const WORLD_H = 480;
```

Nothing else in `sim.js` needs touching: `HUB_X`, `HUB_Y` and `MAX_DIST` are all computed from these.

- [ ] **Step 4: Run the test to verify it passes**

Run: `./manage.sh test`
Expected: PASS — `all sim checks passed`.

If the abundance sweep or the tier-gap assertion now fails, **stop and report it** rather than adjusting the assertion. A distribution shifting under a 9× area change is a real finding.

- [ ] **Step 5: Decide `POS_FLOOR` by measurement**

`POS_FLOOR = 0.005` exists because tier 0 wanted ~24 deposits in a disc that fitted ~15; at zero, the mean map fell from 48 deposits to 42.2. The disc now has 9× the area, so the pressure may be gone.

Write a throwaway script (do not commit it) that runs `genMap` over at least 3,000 seeds with `POS_FLOOR = 0` and reports the mean, minimum and maximum deposit count, plus the tier-0 and tier-3 mean `t`.

Decision rule:
- **If the minimum stays at 48**, remove `POS_FLOOR` and the `+ POS_FLOOR` term, and delete the constant and the paragraph of its comment that explains the 42.2 measurement. Report the tier-0/tier-3 means before and after, since tiering should get sharper.
- **If any seed drops below 48**, keep `POS_FLOOR` and update its comment with the newly measured numbers so the constant's justification matches the current world size.

Either way, report the measured figures. Do not decide by reasoning.

- [ ] **Step 6: Lower the minimum zoom**

In `src/game.js`, the wheel handler clamps zoom:

```js
  const z = Math.min(2.5, Math.max(0.2, cam.z * f));
```

Change `0.2` to `0.08`, so the full 720-tile width fits a 1920px viewport (720 × 32 × 0.08 = 1843px). Add a short comment noting the minimap is the real overview tool and this only stops panning out hitting a wall mid-map.

- [ ] **Step 7: Run the tests and commit**

Run: `./manage.sh test`
Expected: PASS.

```bash
git add src/sim.js src/game.js tests/test_sim.mjs
git commit -m "feat: grow the world to 720x480"
```

---

### Task 3: Dock the minimap in the inspector

Finishes the feature, so it carries the CHANGELOG and README updates.

**Files:**
- Modify: `index.html` (inspector markup, minimap canvas moves and resizes), `src/style.css` (inspector flex column, minimap and collapse rules), `src/game.js` (`MM_SCALE`, `refreshInspector` target, collapse wiring)
- Modify: `CHANGELOG.md`, `README.md`
- Test: browser

**Interfaces:**
- Consumes: fog gone (Task 1), `WORLD_W = 720` (Task 2).
- Produces: nothing.

- [ ] **Step 1: Restructure the markup**

In `index.html`, replace:

```html
<aside id="inspector"><div class="dim">Nothing selected</div></aside>
```

with:

```html
<aside id="inspector">
  <div id="inspector-body"><div class="dim">Nothing selected</div></div>
  <div id="inspector-map">
    <div class="map-head"><span>Map</span><button id="btn-map">−</button></div>
    <canvas id="minimap" width="228" height="152"></canvas>
  </div>
</aside>
```

and delete the now-orphaned `<canvas id="minimap" width="180" height="120"></canvas>` line further down.

228×152 is exactly 3:2 and fits the inspector's 230px content width.

- [ ] **Step 2: Restyle**

In `src/style.css`, change the `#inspector` rule from:

```css
#inspector { right: 0; width: 250px; border-left: 1px solid #1d2733; }
```

to:

```css
#inspector { right: 0; width: 250px; border-left: 1px solid #1d2733;
  display: flex; flex-direction: column; overflow-y: hidden; }
#inspector-body { flex: 1; overflow-y: auto; }
#inspector-map { flex: none; padding-top: 8px; border-top: 1px solid #1d2733; }
#inspector-map .map-head { display: flex; justify-content: space-between;
  align-items: center; font-size: 10px; text-transform: uppercase;
  letter-spacing: 2px; color: #5b6b80; margin-bottom: 6px; }
#inspector-map .map-head button { padding: 0 6px; font-size: 12px; line-height: 1.2; }
#inspector-map.collapsed #minimap { display: none; }
```

The `overflow-y: hidden` overrides the shared `aside` rule so only the body scrolls — that is what keeps inspector content from sliding under the docked map.

Then replace the whole `#minimap` rule with:

```css
#minimap { display: block; width: 228px; height: 152px;
  background: rgba(10,13,20,.92); outline: 1px solid #1d2733; cursor: crosshair; }
```

It no longer needs `position`, `right`, `bottom` or `z-index` — it is in the flow now, which is what removes the collision with the milestone panel. Keep `outline` rather than `border`: with `box-sizing: border-box` a border would shrink the content box below the 228×152 bitmap and skew `mmToWorld`.

- [ ] **Step 3: Point `refreshInspector` at the body**

In `src/game.js`, `refreshInspector` currently starts:

```js
function refreshInspector() {
  const box = document.getElementById('inspector');
```

Change the id to `inspector-body`:

```js
function refreshInspector() {
  const box = document.getElementById('inspector-body');
```

This is the change that protects the canvas: `box.innerHTML = html` now replaces only the body, so the docked canvas survives every selection change. Without it, clicking any node destroys the minimap — the same defect that made the Recipe dropdown close the instant it was opened.

- [ ] **Step 4: Rescale the minimap**

In `src/game.js`, change:

```js
const MM_SCALE = 180 / S.WORLD_W; // 0.75 px per tile; 240x160 world -> 180x120 canvas
```

to:

```js
const MM_SCALE = 228 / S.WORLD_W; // ~0.317 px per tile; 720x480 world -> 228x152 canvas
```

Everything downstream derives from `MM_SCALE`, so no other drawing or coordinate maths changes. Note the tooltip's 5-screen-px reach is now `5 / 0.317 ≈ 15.8` world tiles; median deposit spacing is ~30, so it stays under half the typical gap.

- [ ] **Step 5: Wire the collapse control**

In `src/game.js`, add beside the other module-level constants:

```js
// display preference, so it lives in its own key rather than the save — it must survive
// New Map and save import, which anything stored inside the save would not
const MAP_KEY = 'gridworks-minimap';
let mapOpen = localStorage.getItem(MAP_KEY) !== '0';
```

Then in `main()`, beside the other button wiring:

```js
  const mapBox = document.getElementById('inspector-map');
  const mapBtn = document.getElementById('btn-map');
  const syncMap = () => {
    mapBox.classList.toggle('collapsed', !mapOpen);
    mapBtn.textContent = mapOpen ? '−' : '+';
  };
  syncMap();
  mapBtn.onclick = () => {
    mapOpen = !mapOpen;
    localStorage.setItem(MAP_KEY, mapOpen ? '1' : '0');
    syncMap();
  };
```

Finally, skip the draw work when collapsed. At the top of `drawMinimap`:

```js
  if (!mapOpen) return;
```

- [ ] **Step 6: Verify in the browser**

Run: `./manage.sh start` then open `http://localhost:8889`

Check:
1. The minimap sits at the bottom of the right-hand inspector column, full column width, with a "MAP" header and a `−` button. Nothing floats over the milestone panel bottom-left.
2. **Select a machine, then select a different one.** The minimap must not flicker, blank, or disappear. This is the `innerHTML` trap — if it vanishes, Step 3 was missed.
3. Select a node with many buffer entries. The inspector body scrolls; the minimap stays pinned at the bottom and is never scrolled under.
4. Click `−`. The canvas hides, leaving the "MAP" row with a `+`. Click `+` — it returns. Reload the page: the collapsed state persisted. Click New Map and import a save — still persisted.
5. Click the minimap's far bottom-right corner, then its far top-left. The camera centres accurately at both, with no drift at the far corner.
6. Hover a building dot — tooltip gives name, status and uptime. Hover a deposit — resource, category, purity. At the finer scale dots are small; confirm hovering still feels reliable.
7. Zoom all the way out. You should see most or all of the 720×480 world, and the minimap's viewport rectangle should nearly fill the minimap.
8. Confirm every deposit is visible from the first frame on a New Map — there is no fog any more, and no 🌫 button in the HUD.

Then: `./manage.sh stop`

- [ ] **Step 7: Update the CHANGELOG**

Insert directly below the `# Changelog` heading in `CHANGELOG.md`:

```markdown
## 2026-07-29 — Bigger World

- **Fog of war removed.** It was meant to make the map feel like a frontier, but revealing it
  was free: power poles are unlocked from the start, cost nothing, and reveal a 24-tile radius
  each, and dragging any building across the map revealed the whole path. A concealment mechanic
  that costs nothing to defeat is a chore with a workaround, not atmosphere. Out with it go
  `state.explored`, `revealAll`, the `_fog` cache, the chunk grid and the 🌫 toggle — which also
  reclaims roughly 11% of an 8-hour offline catch-up, since the sim tracked explored chunks every
  tick whether fog was switched on or not.
- **The world is now 720×480** — nine times the area, with the same 48 deposits. Measured over
  300 seeds, median spacing between deposits goes from 17 to 30 tiles and the 90th percentile
  from 26 to 81, while the uranium hard floor moves from 87 tiles out to 260. Because each tier
  concentrates into its own band, the area around the HUB stays workable while the frontier
  genuinely opens up. Minimum zoom drops to 0.08 so the whole map fits on screen for orientation.
- **The minimap is docked** into the bottom of the inspector column at 228×152, with a `−`/`+`
  collapse whose state persists. It previously floated bottom-right and overlapped the milestone
  panel below ~880px of window width; in the flow, that whole class of collision is gone.
- Tests: world dimensions and the recentred HUB, all 48 deposits still placing on every seed with
  the full starter bundle, deposits measurably further apart, and the hard floor at its new
  distance. The fog test block is deleted with the feature.
```

- [ ] **Step 8: Update the README**

Read `README.md`. In the opening paragraph, replace this sentence:

```
Ore is tiered by distance from the HUB — iron and limestone
at your feet, uranium out past the horizon — with a guaranteed playable start, and a
minimap tracks your factory's health across a map that fog reveals as you build into it.
```

with:

```
Ore is tiered by distance from the HUB — iron and limestone
at your feet, uranium 260 tiles out — with a guaranteed playable start, and a minimap docked in
the inspector tracks your factory's health across a 720×480 world.
```

Then in the `## Docs` list, insert directly above the `2026-07-29-the-world-design.md` entry:

```
- `docs/superpowers/specs/2026-07-29-bigger-world-design.md` — fog removed, 720×480 map,
  docked minimap
```

- [ ] **Step 9: Commit**

```bash
git add index.html src/style.css src/game.js CHANGELOG.md README.md
git commit -m "feat(ui): dock the minimap in the inspector with a collapse control"
```

---

## Done when

- `./manage.sh test` passes.
- Every browser check in Task 3 has been performed against a running dev server.
- `grep -rn "revealAll\|chunkIndex\|fogOn\|btn-fog\|NODE_RADIUS\|CHUNK" src/ tests/ index.html`
  returns nothing. Note this pattern deliberately omits `explored` and `_fog`: `normalizeSave`
  keeps `delete s.explored` and `delete n._fog` on purpose, to strip the dead data that saves
  written while fog existed still carry. An earlier draft of this section grepped for those two
  as well, which made it unsatisfiable against the plan's own instructions.
- `git status` is clean. Commit count is whatever the fix rounds produced — do not treat a fixed
  number as an acceptance criterion.
