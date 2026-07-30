# Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an achievement registry derived from the existing progression ladders, surfaced as a HUD chip and dropdown, with eleven achievements and no new save state.

**Architecture:** `sim.js` gains `ACHIEVEMENTS` — generated from `MILESTONES` and `ELEVATOR_PHASES` rather than hand-written — and `earned(state)`, a pure function over the two monotonic progression counters. `game.js` renders a 🏆 chip and dropdown modelled on the existing ⚠ alerts panel, and toasts newly-earned entries by diffing against a module-level `seen` Set seeded at load, New Map and import.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Plain DOM for HUD/panels. Tests are `node:assert` in `tests/test_sim.mjs`, run with `./manage.sh test`.

**Spec:** `docs/superpowers/specs/2026-07-30-achievements-design.md`

## Global Constraints

- **Never edit `data/source/satisfactory_data.json` in place.** (`docs/SOURCE_OF_TRUTH.md`)
- **Do not invent achievement names or content.** Names come from `MILESTONES` and `ELEVATOR_PHASES`; that is why the registry is generated. The content set is deliberately eleven, pending beta-tester proposals.
- **No new save state.** `earned(state)` is a pure derivation. Do not add `state.achievements`, do not touch `normalizeSave`. The stored-latch upgrade path is documented in the spec for when a non-derivable achievement arrives — it is explicitly not built now.
- **No new dependencies, no build step, no backend, no new source files.**
- **`sim.js` stays DOM-free.** It is the only tested file; anything testable belongs there.
- **`game.js` has no test suite by design.** Do not add one. Its changes are browser-verified.
- **Test command:** `./manage.sh test` (equivalently `node tests/test_sim.mjs`). Prints `all sim checks passed`, exits 0. The Node `MODULE_TYPELESS_PACKAGE_JSON` warning is pre-existing (no `package.json`) — do not chase it.
- **Commit style:** conventional commits, matching existing history.

---

### Task 1: The registry and `earned()`

Pure logic, fully tested. Nothing renders it yet.

**Files:**
- Modify: `src/sim.js` (add below `ELEVATOR_ITEMS`, before `validateMilestones`)
- Test: `tests/test_sim.mjs`

**Interfaces:**
- Consumes: `MILESTONES` and `ELEVATOR_PHASES`, both already exported from `sim.js`.
- Produces:
  - `export const ACHIEVEMENTS` — array of `{ id, kind, name, desc, test }`. `id` is a unique string, `kind` is `'milestone'` or `'elevator'`, `name` and `desc` are display strings, `test` is `(state) => boolean`. Length is `MILESTONES.length + ELEVATOR_PHASES.length` = 11.
  - `export function earned(state)` → array of earned `id` strings, in registry order.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_sim.mjs`, immediately before the final `console.log('all sim checks passed');`:

```js
// achievements: derived from the progression ladders, never stored
{
  assert.equal(ACHIEVEMENTS.length, MILESTONES.length + ELEVATOR_PHASES.length,
    'one achievement per ladder rung — adding a milestone must not silently skip its achievement');
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length, 'ids are unique');
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id && a.name && a.desc, `${a.id} has id, name and desc`);
    assert.ok(a.kind === 'milestone' || a.kind === 'elevator', `${a.id} has a known kind`);
    assert.equal(typeof a.test, 'function', `${a.id} has a predicate`);
  }

  // a fresh game has earned nothing
  const fresh = newGame(71, ctx);
  assert.deepEqual(earned(fresh), [], 'a new game earns nothing');

  // three milestones in earns exactly the first three, and no elevator achievements
  const mid = newGame(73, ctx);
  mid.unlocked.milestone = 3;
  const midEarned = earned(mid);
  assert.deepEqual(midEarned, ['milestone-0', 'milestone-1', 'milestone-2'],
    `milestone 3 earns exactly the first three, got ${midEarned}`);

  // finishing the elevator earns all four elevator achievements
  const done = newGame(75, ctx);
  done.unlocked.milestone = MILESTONES.length;
  done.elevator.phase = ELEVATOR_PHASES.length;
  const all = earned(done);
  assert.equal(all.length, ACHIEVEMENTS.length, 'a finished game earns everything');
  assert.ok(all.includes(`elevator-${ELEVATOR_PHASES.length - 1}`),
    'the final elevator phase is the win achievement');

  // monotonic: raising either counter never shrinks the earned set
  const s = newGame(77, ctx);
  let prev = earned(s).length;
  for (let m = 0; m <= MILESTONES.length; m++) {
    s.unlocked.milestone = m;
    const n = earned(s).length;
    assert.ok(n >= prev, `milestone ${m} did not shrink the earned set (${prev} -> ${n})`);
    prev = n;
  }
  for (let p = 0; p <= ELEVATOR_PHASES.length; p++) {
    s.elevator.phase = p;
    const n = earned(s).length;
    assert.ok(n >= prev, `phase ${p} did not shrink the earned set (${prev} -> ${n})`);
    prev = n;
  }

  // derived, not stored: nothing was written to the save
  assert.equal(s.achievements, undefined, 'earned() must not write state');
  const rt = normalizeSave(JSON.parse(JSON.stringify(s)), ctx);
  assert.deepEqual(earned(rt), earned(s), 'earned survives a save round-trip because it is derived');
}
```

Add `ACHIEVEMENTS` and `earned` to the named-import list on line 4 of `tests/test_sim.mjs`. Read the current line rather than assuming its contents — it has been edited several times.

- [ ] **Step 2: Run test to verify it fails**

Run: `./manage.sh test`
Expected: FAIL — `SyntaxError: The requested module '../src/sim.js' does not provide an export named 'ACHIEVEMENTS'`

- [ ] **Step 3: Write minimal implementation**

In `src/sim.js`, add immediately after the `export const ELEVATOR_ITEMS = ...` line and before `export function validateMilestones(ctx) {`:

```js
// ---------------------------------------------------------------- achievements

// Generated from the ladders above rather than hand-listed: a parallel list would duplicate
// names that already exist and drift the moment a rung is added, renamed or reordered, and
// inventing achievement names would be inventing content (docs/SOURCE_OF_TRUTH.md).
// Both progression counters are monotonic indices, so every achievement here is a pure
// function of state and nothing is stored in the save. A future non-derivable achievement —
// anything phrased as a transient peak — needs the latched `state.achievements` described in
// the design doc; derived entries keep working unchanged when it arrives.
export const ACHIEVEMENTS = [
  ...MILESTONES.map((m, i) => ({
    id: `milestone-${i}`, kind: 'milestone', name: m.name,
    desc: `Complete the ${m.name} milestone`,
    test: (s) => (s.unlocked?.milestone ?? 0) > i,
  })),
  ...ELEVATOR_PHASES.map((p, i) => ({
    id: `elevator-${i}`, kind: 'elevator', name: p.name,
    desc: `Ship Project Assembly phase ${i + 1}: ${p.name}`,
    test: (s) => (s.elevator?.phase ?? 0) > i,
  })),
];

export function earned(state) {
  return ACHIEVEMENTS.filter((a) => a.test(state)).map((a) => a.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./manage.sh test`
Expected: PASS — prints `all sim checks passed`

- [ ] **Step 5: Commit**

```bash
git add src/sim.js tests/test_sim.mjs
git commit -m "feat(sim): achievement registry derived from the progression ladders"
```

---

### Task 2: The HUD chip, dropdown and toasts

Finishes the feature, so it carries the CHANGELOG and README updates.

**Files:**
- Modify: `index.html` (chip button, panel div), `src/style.css` (shared panel rules), `src/game.js` (render, seed, toggle, interval)
- Modify: `CHANGELOG.md`, `README.md`
- Test: browser

**Interfaces:**
- Consumes: `S.ACHIEVEMENTS` and `S.earned(state)` from Task 1; the existing `toast()` helper.
- Produces: nothing.

- [ ] **Step 1: Add the markup**

In `index.html`, immediately after the `<button id="hud-alerts" ...>` line, add:

```html
  <button id="hud-achievements" title="achievements">🏆 0/0</button>
```

Note there is no `style="display:none"` — unlike the alert chip this one is always visible, because it is a progress counter rather than a problem count.

Then immediately after the `<div id="alerts"></div>` line, add:

```html
<div id="achievements"></div>
```

- [ ] **Step 2: Add the styles**

In `src/style.css`, the panel rules currently target `#alerts` alone. Widen them to cover both panels, and add the chip and row styling. Replace:

```css
#alerts { position: fixed; top: 46px; width: 300px; max-height: 50vh; overflow-y: auto;
  background: rgba(10,13,20,.92); border: 1px solid #1d2733; border-radius: 6px;
  backdrop-filter: blur(4px); padding: 6px; z-index: 20; display: none; }
#alerts.open { display: block; }
```

with:

```css
#alerts, #achievements { position: fixed; top: 46px; width: 300px; max-height: 50vh;
  overflow-y: auto; background: rgba(10,13,20,.92); border: 1px solid #1d2733;
  border-radius: 6px; backdrop-filter: blur(4px); padding: 6px; z-index: 20; display: none; }
#alerts.open, #achievements.open { display: block; }
```

Then append at the end of the file:

```css
#hud-achievements { color: #f4d03f; border-color: #5c5223; background: #2c2712; }
#hud-achievements:hover { background: #453b1b; }
#achievements .ach { padding: 5px 7px; border-radius: 4px; font-size: 12px; color: #58d68d; }
#achievements .ach.locked { color: #5b6b80; }
#achievements .ach small { display: block; color: #5b6b80; font-size: 11px; }
#achievements .ach.locked small { color: #46536b; }
```

- [ ] **Step 3: Add the render and seed functions**

In `src/game.js`, add immediately after `refreshAlerts()`:

```js
// Achievements are derived, so `seen` is a session-lifetime UI concern only — it exists to
// decide what is NEW since the page loaded, and deliberately never enters the save. It must be
// re-seeded whenever `state` is replaced, or a loaded or imported save toasts its whole history.
let seen = new Set();
function seedAchievements() { seen = new Set(S.earned(state)); }

function refreshAchievements() {
  const chip = document.getElementById('hud-achievements');
  const box = document.getElementById('achievements');
  const got = S.earned(state);
  chip.textContent = `🏆 ${got.length}/${S.ACHIEVEMENTS.length}`;
  for (const id of got) {
    if (seen.has(id)) continue;
    seen.add(id);
    toast(`🏆 ${S.ACHIEVEMENTS.find((a) => a.id === id).name}`);
  }
  if (!box.classList.contains('open')) return;
  box.style.left = Math.min(chip.getBoundingClientRect().left, innerWidth - 308) + 'px';
  // ponytail: same signature guard as the alert panel — skip the rebuild when nothing changed,
  // so a scrolled-open panel keeps its scrollTop across this 400ms tick.
  const sig = got.join('|');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  const set = new Set(got);
  for (const a of S.ACHIEVEMENTS) {
    const el = document.createElement('div');
    el.className = set.has(a.id) ? 'ach' : 'ach locked';
    el.innerHTML = `${set.has(a.id) ? '🏆' : '🔒'} ${a.name}<small>${a.desc}</small>`;
    box.appendChild(el);
  }
}
```

- [ ] **Step 4: Wire the toggle, with mutual exclusion**

In `main()`, the alerts chip currently has this handler:

```js
  document.getElementById('hud-alerts').onclick = () => {
    document.getElementById('alerts').classList.toggle('open');
    refreshAlerts();
  };
```

Replace it with both handlers, each closing the other panel:

```js
  const alertsBox = document.getElementById('alerts');
  const achBox = document.getElementById('achievements');
  // both panels anchor to their own chip along the top of the screen, so two open at once
  // would overlap — opening either closes the other
  document.getElementById('hud-alerts').onclick = () => {
    achBox.classList.remove('open');
    alertsBox.classList.toggle('open');
    refreshAlerts();
  };
  document.getElementById('hud-achievements').onclick = () => {
    alertsBox.classList.remove('open');
    achBox.classList.toggle('open');
    refreshAchievements();
  };
```

- [ ] **Step 5: Seed at the three points, and add the interval**

`seen` must be seeded wherever `state` is replaced. There are exactly three such places, and they are the same three where `lastPhase` is already re-seeded.

In `main()`, add `seedAchievements();` on the line **immediately after**:

```js
  state = load() ?? S.newGame((Math.random() * 1e9) | 0, ctx);
```

and therefore **before** the `const away = ...` offline-progress block that follows it. This
placement is deliberate and is the one real judgement call in this task.

`simulateOffline` can complete milestones while the player was away. Seeding *before* it means
`seen` holds the pre-offline set, so anything earned during the catch-up toasts on return —
alongside the existing "Welcome back — simulated 8h · shipped 1,204 items" toast, which is
exactly the moment it belongs to. Seeding *after* the block would silently swallow those earns.

In `startFresh`, add `seedAchievements();` immediately after the `lastPhase = state.elevator?.phase ?? 0;` line.

In the file-import handler, add `seedAchievements();` immediately after its `lastPhase = state.elevator?.phase ?? 0;` line.

Then add the interval beside the others:

```js
  setInterval(refreshAchievements, 400);
```

Missing any one of the three seed calls means a loaded or imported save toasts its entire achievement history at once.

- [ ] **Step 6: Verify in the browser**

Run: `./manage.sh start` then open `http://localhost:8889`

Check:
1. The 🏆 chip is visible in the HUD from the first frame, reading `🏆 0/11` on a new map. It stays visible at zero, unlike the ⚠ chip.
2. Click it — the panel opens listing 11 entries, all dimmed with 🔒 and their descriptions. Click again — it closes.
3. Open the achievements panel, then click the ⚠ chip (place an unwired miner first so it exists). The achievements panel closes as alerts opens. Then click 🏆 again — alerts closes. They are never both open.
4. Complete milestone 1 by shipping its cost to the HUB. A `🏆 Part Assembly` toast fires once, the chip reads `🏆 1/11`, and that row in the panel turns green with a 🏆.
5. Reload the page **immediately**, within 60 seconds so no offline progress is credited. **No toasts fire**, and the chip still reads `🏆 1/11`. This is the seeding check — a re-toast here means a seed call is missing.
5b. Separately, confirm the intended opposite: leave a factory running toward a milestone, close the tab for over a minute, and reopen. If the offline catch-up completes that milestone, its achievement **should** toast, next to the welcome-back toast. This is what seeding before the offline block buys.
6. Click New Map. The chip returns to `🏆 0/11` with no toasts.
7. Import a save that has progress. The chip jumps to that save's count with **no** toast storm.
8. Leave the panel open while a milestone completes — the row updates in place within 400ms and the panel does not jump its scroll position.

Then: `./manage.sh stop`

- [ ] **Step 7: Update the CHANGELOG**

Insert directly below the `# Changelog` heading in `CHANGELOG.md`:

```markdown
## 2026-07-30 — Achievements

- **Achievements**, derived rather than stored: both progression counters are monotonic indices,
  so `earned(state)` is a pure function of state the game already keeps. That means no new save
  field, nothing to desync, and existing saves show their earned achievements retroactively with
  no migration.
- The registry is **generated from `MILESTONES` and `ELEVATOR_PHASES`** rather than hand-listed,
  so adding a rung adds its achievement automatically and the two can never drift. Eleven to
  start — seven milestones and four Project Assembly phases, the last of which is the win.
- A 🏆 chip in the HUD shows `earned/total` and opens a panel listing every achievement, locked
  ones dimmed with their description. Newly earned ones toast. The chip is always visible, since
  it is a progress counter rather than a problem count, and it shares the alert panel's styling;
  opening either panel closes the other.
- Tests: registry length tracks the two ladders, ids unique, every entry well-formed, a fresh
  game earns nothing, a mid-run state earns exactly its prefix, a finished run earns everything,
  the earned set is monotonic as either counter rises, and it survives a save round-trip
  unchanged because nothing is written.
```

- [ ] **Step 8: Update the README**

Read `README.md`. In the opening paragraph, after the sentence ending "across a 720×480 world.", add:

```
Milestones and Project Assembly phases award achievements, tracked by a 🏆 counter in the HUD.
```

Then in the `## Docs` list, insert directly above the `2026-07-29-bigger-world-design.md` entry:

```
- `docs/superpowers/specs/2026-07-30-achievements-design.md` — derived achievement registry,
  HUD chip
```

- [ ] **Step 9: Commit**

```bash
git add index.html src/style.css src/game.js CHANGELOG.md README.md
git commit -m "feat(ui): achievement chip and panel with earn toasts"
```

---

## Done when

- `./manage.sh test` passes.
- Every browser check in Task 2 has been performed against a running dev server — particularly checks 5, 6 and 7, which are the only way to catch a missing seed call.
- `grep -n "state.achievements" src/` returns nothing: achievements must remain derived.
- `git status` is clean.
