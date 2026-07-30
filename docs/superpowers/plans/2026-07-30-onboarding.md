# Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walk a new player from an empty world to their first shipped item with five outcome-based goals, and document the controls that have no contextual hint.

**Architecture:** `sim.js` gains `TUTORIAL` — an ordered array of `{id, goal, hint, test}` — and `tutorialStep(state)`, returning the first entry whose predicate fails or `null` when all pass. Predicates key off the **monotonic lifetime counters** `made` and `tGreen` rather than live `status`, because `status` regresses under backpressure and would send the panel backwards. Progress is therefore derived from the factory itself, exactly like `ACHIEVEMENTS`, with nothing in the save. `game.js` adds an offer card, an advisory progress panel, and a `?` keybind panel, plus one boolean in `localStorage` recording that onboarding was completed or skipped.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Plain DOM for panels. Tests are `node:assert` in `tests/test_sim.mjs`, run with `./manage.sh test`.

**Spec:** `docs/superpowers/specs/2026-07-30-onboarding-design.md`

## Global Constraints

- **Never edit `data/source/satisfactory_data.json` in place.** (`docs/SOURCE_OF_TRUTH.md`)
- **Do not invent game content.** Onboarding adds copy, not mechanics.
- **No new save state.** `tutorialStep(state)` is a pure derivation. Do not add anything to `state`, do not touch `normalizeSave`.
- **No new dependencies, no build step, no backend, no new source files.**
- **`sim.js` stays DOM-free.** It is the only tested file.
- **`game.js` has no test suite by design.** Do not add one.
- **Advisory only.** Onboarding must never block, gate, force or disable any action.
- **Test command:** `./manage.sh test`. Prints `all sim checks passed`, exits 0. The Node `MODULE_TYPELESS_PACKAGE_JSON` warning is pre-existing (no `package.json`) — do not chase it.
- **Commit style:** conventional commits, matching existing history.

---

### Task 1: The `TUTORIAL` registry and `tutorialStep()`

Pure logic, fully tested. Nothing renders it yet.

**Files:**
- Modify: `src/sim.js` (add below `ACHIEVEMENTS` / `earned`)
- Test: `tests/test_sim.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export const TUTORIAL` — ordered array of `{ id, goal, hint, test }`. `id` unique string, `goal` and `hint` display strings, `test` is `(state) => boolean`. Five entries.
  - `export function tutorialStep(state)` → the first entry whose `test` returns false, or `null` if every test passes.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_sim.mjs`, immediately before the final `console.log('all sim checks passed');`:

```js
// onboarding: five outcome-based goals, derived from the factory rather than stored
{
  assert.equal(TUTORIAL.length, 5, 'five goals: power, mine, smelt, craft, ship');
  assert.equal(new Set(TUTORIAL.map((t) => t.id)).size, TUTORIAL.length, 'ids are unique');
  for (const t of TUTORIAL) {
    assert.ok(t.id && t.goal && t.hint, `${t.id} has id, goal and hint`);
    assert.equal(typeof t.test, 'function', `${t.id} has a predicate`);
  }

  // a fresh game is on the first step
  const fresh = newGame(91, ctx);
  assert.equal(tutorialStep(fresh)?.id, TUTORIAL[0].id, 'a new game starts at the first goal');

  // each predicate is satisfied by a state built for it, and not by an empty one
  const empty = { nodes: [], shipped: {} };
  for (const t of TUTORIAL) {
    assert.equal(t.test(empty), false, `${t.id} is not satisfied by an empty world`);
  }
  assert.ok(TUTORIAL[0].test({ nodes: [{ key: 'biomass-burner', status: 'generating' }], shipped: {} }),
    'step 1 passes on a generating generator');
  assert.ok(TUTORIAL[1].test({ nodes: [{ key: 'miner-mk1', status: 'mining' }], shipped: {} }),
    'step 2 passes on a mining miner');
  assert.ok(TUTORIAL[2].test({ nodes: [{ key: 'smelter', status: 'crafting' }], shipped: {} }),
    'step 3 passes on a crafting smelter');
  assert.ok(TUTORIAL[3].test({ nodes: [{ key: 'constructor', status: 'crafting' }], shipped: {} }),
    'step 4 passes on a crafting constructor');
  assert.ok(TUTORIAL[4].test({ nodes: [], shipped: { 'iron-plate': 3 } }),
    'step 5 passes once something has shipped');

  // a crafting smelter must not satisfy the constructor step, and vice versa
  assert.equal(TUTORIAL[3].test({ nodes: [{ key: 'smelter', status: 'crafting' }], shipped: {} }), false,
    'step 4 is specific to the constructor');
  assert.equal(TUTORIAL[2].test({ nodes: [{ key: 'constructor', status: 'crafting' }], shipped: {} }), false,
    'step 3 is specific to the smelter');
  // a zero entry in shipped must not count
  assert.equal(TUTORIAL[4].test({ nodes: [], shipped: { 'iron-plate': 0 } }), false,
    'a zero shipped entry does not satisfy step 5');

  // fully built: every step passes and there is nothing left to do
  const done = {
    nodes: [
      { key: 'biomass-burner', status: 'generating' },
      { key: 'miner-mk1', status: 'mining' },
      { key: 'smelter', status: 'crafting' },
      { key: 'constructor', status: 'crafting' },
    ],
    shipped: { 'iron-plate': 12 },
  };
  assert.equal(tutorialStep(done), null, 'a finished first factory has no remaining goal');

  // the sequence is causal, not arbitrary: a real build satisfies the steps in order
  const s = newGame(93, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const hub = s.nodes[0];
  const plant = addDeposit(s, 'leaves', 'plant', 'normal', 1, 5, 20);
  const dep = addDeposit(s, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const burner = addNode(s, 'biomass-burner', 10, 20, ctx);
  burner.buf.wood = 200;
  addWire(s, plant, 'out0', burner, 'in0', ctx);
  tick(s, 0.1, ctx);
  assert.equal(tutorialStep(s)?.id, TUTORIAL[1].id, 'power done, now on the mining goal');

  const miner = addNode(s, 'miner-mk1', 10, 5, ctx);
  addWire(s, dep, 'out0', miner, 'res0', ctx);
  addWire(s, burner, 'pout', miner, 'pin', ctx);
  tick(s, 0.1, ctx);
  assert.equal(tutorialStep(s)?.id, TUTORIAL[2].id, 'mining done, now on the smelting goal');

  const sm = addNode(s, 'smelter', 16, 5, ctx);
  setRecipe(s, sm, 'iron-ingot', ctx);
  addWire(s, miner, 'out0', sm, 'in0', ctx);
  addWire(s, burner, 'pout', sm, 'pin', ctx);
  for (let i = 0; i < 100; i++) tick(s, 0.1, ctx);
  assert.equal(tutorialStep(s)?.id, TUTORIAL[3].id, 'smelting done, now on the crafting goal');
}
```

Add `TUTORIAL` and `tutorialStep` to the named-import list on line 4 of `tests/test_sim.mjs`. Read the current line before editing — it has been extended many times. `newGame`, `addNode`, `addWire`, `addDeposit`, `setRecipe` and `tick` are all already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `./manage.sh test`
Expected: FAIL — `SyntaxError: The requested module '../src/sim.js' does not provide an export named 'TUTORIAL'`

- [ ] **Step 3: Write minimal implementation**

In `src/sim.js`, add immediately after the `earned` function and before the next section banner:

```js
// ------------------------------------------------------------------ onboarding

// Goals are OUTCOMES, not scripted actions, because node `status` already encodes whole
// dependency chains — a miner reporting 'mining' proves it is both wired to a deposit and
// powered. That makes each step one predicate, never dictates how the player gets there, and
// cannot wedge if they build in a different order. Progress is derived like ACHIEVEMENTS:
// the current step is simply the first unsatisfied one, so nothing is stored in the save.
const has = (s, key, status) =>
  (s.nodes ?? []).some((n) => n.key === key && n.status === status);

export const TUTORIAL = [
  {
    id: 'power',
    goal: 'Get power flowing',
    hint: 'Nothing runs without power. Find a plant deposit, belt it into a Biomass Burner, and it will start generating.',
    test: (s) => (s.nodes ?? []).some((n) => n.status === 'generating'),
  },
  {
    id: 'mine',
    goal: 'Mine some iron ore',
    hint: 'Place a Miner near an iron deposit, wire the deposit to the miner\'s resource port, then run a power line to it.',
    test: (s) => (s.nodes ?? []).some((n) => n.status === 'mining'),
  },
  {
    id: 'smelt',
    goal: 'Smelt the ore into ingots',
    hint: 'Place a Smelter, select it, and choose Iron Ingot in the Recipe dropdown on the right. Belt ore in, and give it power.',
    test: (s) => has(s, 'smelter', 'crafting'),
  },
  {
    id: 'craft',
    goal: 'Craft a part',
    hint: 'Place a Constructor, pick a recipe such as Iron Plate, and belt ingots into it from the smelter.',
    test: (s) => has(s, 'constructor', 'crafting'),
  },
  {
    id: 'ship',
    goal: 'Ship it to the HUB',
    hint: 'Belt the finished parts into the HUB. Shipping is what completes milestones and unlocks new buildings.',
    test: (s) => Object.values(s.shipped ?? {}).some((v) => v > 0),
  },
];

// the first unsatisfied goal, or null once the first factory is complete
export function tutorialStep(state) {
  return TUTORIAL.find((t) => !t.test(state)) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./manage.sh test`
Expected: PASS — prints `all sim checks passed`

- [ ] **Step 5: Commit**

```bash
git add src/sim.js tests/test_sim.mjs
git commit -m "feat(sim): outcome-based onboarding goals derived from factory state"
```

---

### Task 2: The offer card and progress panel

**Files:**
- Modify: `index.html`, `src/style.css`, `src/game.js`
- Test: browser

**Interfaces:**
- Consumes: `S.TUTORIAL`, `S.tutorialStep(state)` from Task 1.
- Produces: `TUT_KEY`, `tutState` and `setTut` in `game.js`, plus `refreshTutorial()`. Task 3 does not depend on these.

- [ ] **Step 1: Add the markup**

In `index.html`, immediately after the `<div id="achievements"></div>` line, add:

```html
<div id="tutorial"></div>
<div id="tut-offer">
  <h3>New here?</h3>
  <p>I can walk you through building your first factory.</p>
  <div class="row"><button id="tut-yes">Show me</button><button id="tut-no">Skip</button></div>
</div>
```

- [ ] **Step 2: Add the styles**

Append to `src/style.css`:

```css
#tutorial { position: fixed; left: 230px; top: 52px; width: 260px;
  background: rgba(10,13,20,.94); border: 1px solid #23445c; border-radius: 6px;
  backdrop-filter: blur(4px); padding: 10px; z-index: 25; display: none; }
#tutorial.open { display: block; }
#tutorial h3 { font-size: 12px; letter-spacing: 1px; color: #4dd8ff; margin-bottom: 4px; }
#tutorial p { font-size: 12px; color: #9fb0c3; margin-bottom: 8px; }
#tutorial .step { font-size: 11px; color: #5b6b80; margin-bottom: 6px; }
#tutorial button { font-size: 11px; padding: 2px 8px; }

#tut-offer { position: fixed; left: 50%; top: 40%; transform: translate(-50%, -50%);
  width: 320px; background: rgba(10,13,20,.96); border: 1px solid #4dd8ff88;
  border-radius: 8px; box-shadow: 0 0 20px #4dd8ff33; padding: 16px; z-index: 50;
  display: none; text-align: center; }
#tut-offer.open { display: block; }
#tut-offer h3 { font-size: 16px; color: #4dd8ff; margin-bottom: 6px; }
#tut-offer p { font-size: 13px; color: #cfe8ff; margin-bottom: 12px; }
#tut-offer .row { display: flex; gap: 10px; justify-content: center; }
```

`#tutorial` sits at `left: 230px` — just right of the palette — and `top: 52px`, below the HUD. It does not collide with the milestone panel, which is anchored to the bottom.

- [ ] **Step 3: Add the state and render**

In `src/game.js`, add beside the other `localStorage` preference keys near the top:

```js
// A display preference, not game state: it must survive New Map, or a returning player would be
// re-taught on every world. Progress itself is derived, so nothing else needs persisting.
// Three values, not a boolean: absent = never asked, 'go' = accepted and still following along,
// 'skip' = dismissed for good. Without the middle value, reloading mid-tutorial would silently
// lose the panel and a later New Map would re-offer, because "accepted" and "never asked" would
// be the same state.
const TUT_KEY = 'gridworks-tutorial';
let tutState = localStorage.getItem(TUT_KEY); // null | 'go' | 'skip'
const setTut = (v) => { tutState = v; localStorage.setItem(TUT_KEY, v); };
```

Then add, next to `refreshAchievements`:

```js
function refreshTutorial() {
  const box = document.getElementById('tutorial');
  if (tutState !== 'go' || !box.classList.contains('open')) return;
  const step = S.tutorialStep(state);
  const n = S.TUTORIAL.length;
  const sig = step ? step.id : 'done';
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  if (!step) {
    box.innerHTML = `<h3>First factory complete</h3>
      <p>That is the whole loop — mine, smelt, craft, ship. Keep shipping to climb the milestones.</p>
      <button id="tut-close">Close</button>`;
  } else {
    const i = S.TUTORIAL.indexOf(step) + 1;
    box.innerHTML = `<h3>${step.goal}</h3>
      <div class="step">Step ${i} of ${n}</div>
      <p>${step.hint}</p>
      <button id="tut-close">Close</button>`;
  }
  box.querySelector('#tut-close').onclick = () => {
    box.classList.remove('open');
    setTut('skip');
  };
}
```

- [ ] **Step 4: Wire the offer and the interval**

In `main()`, beside the other button wiring, add:

```js
  const tutBox = document.getElementById('tutorial');
  const offer = document.getElementById('tut-offer');
  document.getElementById('tut-yes').onclick = () => {
    offer.classList.remove('open');
    setTut('go');
    tutBox.classList.add('open');
    refreshTutorial();
  };
  document.getElementById('tut-no').onclick = () => {
    offer.classList.remove('open');
    setTut('skip');
  };
  // offered on a fresh world only — never over an existing factory, which would be an
  // interruption rather than an introduction
  const offerTutorial = () => { if (!tutState) offer.classList.add('open'); };
  // someone who accepted and then reloaded is still mid-tutorial: reopen rather than re-offer
  if (tutState === 'go') { tutBox.classList.add('open'); refreshTutorial(); }
```

Then add the interval beside the others:

```js
  setInterval(refreshTutorial, 400);
```

And call `offerTutorial();` in exactly two places: once in `main()` when there was no save, and once inside `startFresh`, after its existing `setMode('idle'); select(null);`.

To make the no-save case unambiguous, restructure the load line as:

```js
  const loaded = load();
  state = loaded ?? S.newGame((Math.random() * 1e9) | 0, ctx);
  seedAchievements();
  if (!loaded) offerTutorial();
```

`startFresh` needs no tutorial handling beyond that call. If `tutState` is `'go'`, the panel simply stays open and tracks the new world — every predicate fails again on an empty map, so it resets to step 1 on its own. If it is `'skip'`, `offerTutorial` does nothing. Only a player who has never been asked gets the offer, which is exactly right.

- [ ] **Step 5: Verify in the browser**

Run: `./manage.sh start` then open `http://localhost:8889`

Check:
1. With a save present, reload — **no offer card appears**. This is the "never interrupt an existing factory" rule.
2. Click New Map. The offer card appears centred.
3. Click **Skip**. It closes and never returns, including after another New Map and after a reload.
4. Clear the `gridworks-tutorial` key in devtools, New Map again, click **Show me**. The offer closes and the goal panel appears at the left, below the palette's top, reading "Get power flowing · Step 1 of 5".
5. Belt a plant deposit into a Biomass Burner. Within 400ms the panel advances to "Mine some iron ore · Step 2 of 5".
6. Work through mining, smelting and crafting — the panel advances each time without you touching it.
7. Ship a part to the HUB. The panel shows the completion message.
8. Click **Close** at any point. The panel closes and does not return on reload or New Map.
9. Confirm the panel never blocks anything: with it open, place buildings, wire, pan and open the inspector normally.
10. **Reload mid-tutorial.** Accept the offer, build the burner so it advances to step 2, then reload the page. The panel must **reopen at step 2** — not disappear, and not re-offer. This is what the three-value key exists for; a boolean would lose it.
11. **New Map mid-tutorial.** Accept, build the burner so the panel reaches step 2, then click New Map. The panel should **stay open and fall back to step 1**, because the new world satisfies nothing. No second offer card.

Then: `./manage.sh stop`

- [ ] **Step 6: Commit**

```bash
git add index.html src/style.css src/game.js
git commit -m "feat(ui): onboarding offer and guided goal panel"
```

---

### Task 3: The keybind card

Finishes the feature, so it carries the CHANGELOG and README updates.

**Files:**
- Modify: `index.html`, `src/style.css`, `src/game.js`
- Modify: `CHANGELOG.md`, `README.md`
- Test: browser

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: nothing.

- [ ] **Step 1: Add the chip and panel**

In `index.html`, immediately after the `<button id="hud-achievements" ...>` line, add:

```html
  <button id="hud-help" title="controls">?</button>
```

and immediately after the `<div id="tutorial"></div>` line, add:

```html
<div id="help"></div>
```

- [ ] **Step 2: Extend the shared panel styles to three**

In `src/style.css`, the panel rule currently reads `#alerts, #achievements { ... }` with a matching `.open` rule. Add `#help` to both selectors so all three share one definition rather than duplicating it, and append:

```css
#hud-help { color: #9fb0c3; }
#help .key { display: flex; justify-content: space-between; gap: 12px;
  padding: 4px 7px; font-size: 12px; color: #cfe8ff; }
#help .key b { color: #4dd8ff; font-weight: 600; white-space: nowrap; }
```

- [ ] **Step 3: Populate the panel**

In `src/game.js`, add next to `refreshAchievements`:

```js
// Only the controls with no contextual hint. Place mode and wire mode already announce
// themselves in the HUD hint line at the moment they matter, and duplicating them in a static
// card would rot the first time a gesture changes — as the wire gesture just did.
const HELP = [
  ['Pan', 'right-drag, middle-drag, or drag empty ground'],
  ['Zoom', 'mouse wheel'],
  ['Delete', 'select, then Del'],
  ['Pause', 'Space, or the ⏸ button'],
  ['Speed', 'the 1x button cycles 1x / 2x / 4x'],
  ['Wire style', 'S — per-wire when a wire is selected'],
  ['Recipes', 'select a machine, then the Recipe dropdown'],
  ['Minimap', 'click or drag to jump, hover for detail, − to collapse'],
];

function buildHelp() {
  const box = document.getElementById('help');
  if (box.dataset.built) return;
  box.dataset.built = '1';
  box.innerHTML = HELP.map(([k, v]) => `<div class="key"><b>${k}</b><span>${v}</span></div>`).join('');
}
```

- [ ] **Step 4: Make the dropdown exclusion three-way**

`main()` currently hard-codes a pair of panels that close each other. Replace that pairwise logic with a small helper so three panels do not need six `classList.remove` calls. The existing handlers for `hud-alerts` and `hud-achievements` must keep their current `dataset.sig` behaviour — the alerts panel resets its signature on close, the achievements panel deliberately does not.

```js
  const PANELS = ['alerts', 'achievements', 'help'];
  const closeOthers = (keep) => {
    for (const id of PANELS) {
      if (id === keep) continue;
      const el = document.getElementById(id);
      el.classList.remove('open');
      if (id === 'alerts') el.dataset.sig = ''; // force a rebuild on reopen
    }
  };
```

Then each chip handler calls `closeOthers('<its own id>')` before toggling its own panel, and the `?` handler additionally calls `buildHelp()`:

```js
  document.getElementById('hud-help').onclick = () => {
    closeOthers('help');
    buildHelp();
    document.getElementById('help').classList.toggle('open');
    document.getElementById('help').style.left =
      Math.min(document.getElementById('hud-help').getBoundingClientRect().left, innerWidth - 308) + 'px';
  };
```

Rewrite the two existing handlers to use `closeOthers` as well, preserving their signature behaviour exactly.

- [ ] **Step 5: Verify in the browser**

Run: `./manage.sh start` then open `http://localhost:8889`

Check:
1. The `?` chip is visible in the HUD and opens a panel listing eight controls.
2. Open `?`, then click 🏆 — help closes, achievements opens. Then click ⚠ (place an unwired miner first so it exists) — achievements closes, alerts opens. Then `?` again — alerts closes. **Never two open at once, in any order.**
3. The alerts panel still rebuilds correctly when reopened after being closed by either other chip.
4. The help panel anchors under its own chip and is not clipped at the right edge on a narrow window.
5. Every control the card lists actually works as described — particularly `S` for wire style and the minimap's `−`.

Then: `./manage.sh stop`

- [ ] **Step 6: Update the CHANGELOG**

Insert directly below the `# Changelog` heading in `CHANGELOG.md`:

```markdown
## 2026-07-30 — Onboarding

- **A guided first factory.** On a fresh world, an offer card asks whether you want a walkthrough;
  accepting shows an advisory panel with five goals — get power, mine ore, smelt it, craft a part,
  ship it to the HUB. Each goal is an *outcome* checked against the factory itself rather than a
  scripted action, so it never dictates how you get there and cannot wedge if you build in a
  different order. It never blocks anything, and Skip or Close dismisses it for good.
- Progress is **derived, not stored**: the current goal is simply the first unsatisfied predicate,
  so nothing enters the save and a reload resumes wherever the factory actually is. Only a single
  completed-or-skipped flag persists, in its own localStorage key so it survives New Map.
- **A `?` card documents the controls that have no contextual hint** — pan, zoom, delete, pause,
  speed, wire style, recipes and the minimap. Place-mode and wire-mode gestures are deliberately
  left out, because the HUD hint already teaches those at the moment they matter.
- Tests: the five predicates against states that satisfy them and states that do not, specificity
  between the smelter and constructor goals, a zero shipped entry not counting, and a realistic
  build satisfying the goals in causal order.
```

- [ ] **Step 7: Update the README**

Read `README.md`. In the opening paragraph, add after the sentence describing the milestone ladder:

```
New games offer a short guided walkthrough to the first shipped item, and a ? card lists the
controls.
```

Then in the `## Docs` list, insert directly above the `2026-07-30-wiring-ergonomics-design.md` entry:

```
- `docs/superpowers/specs/2026-07-30-onboarding-design.md` — guided first factory, keybind card
```

- [ ] **Step 8: Commit**

```bash
git add index.html src/style.css src/game.js CHANGELOG.md README.md
git commit -m "feat(ui): keybind card and three-way panel exclusion"
```

---

## Done when

- `./manage.sh test` passes.
- Every browser check in Tasks 2 and 3 has been performed against a running dev server — Task 2 check 1 especially, since offering onboarding over an existing factory is the one failure that would annoy a returning player.
- `grep -n "state.tutorial" src/` returns nothing: progress must remain derived.
- `git status` is clean.
