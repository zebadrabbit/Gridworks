# Wiring Ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a cross-map wire one continuous gesture — click a port, pan freely, click to drop relay poles, click the target — and add orthogonal wire routing.

**Architecture:** Wire mode becomes modal: `mouseup` no longer exits it. A single resolver handles both a pointer release and a subsequent click identically, so existing press-drag-release muscle memory is untouched while the same gesture extended past a target keeps going. Right-drag panning mid-wire then works for free, because `mousedown`'s pan branch already precedes the port branch and never consults `ui.mode`. Square routing is a third `wire.style` value.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Canvas 2D, plain DOM. Tests are `node:assert` in `tests/test_sim.mjs`, run with `./manage.sh test`.

**Spec:** `docs/superpowers/specs/2026-07-30-wiring-ergonomics-design.md`

## Global Constraints

- **Never edit `data/source/satisfactory_data.json` in place.** (`docs/SOURCE_OF_TRUTH.md`)
- **Do not invent items, recipes, or stats.** This feature adds no game content; the three pole types already exist.
- **No new dependencies, no build step, no backend, no new source files.**
- **`sim.js` stays DOM-free.** It is the only tested file.
- **`game.js` has no test suite by design.** Do not add one. Its changes are browser-verified.
- **No new save state.** `wire.style` already exists and is already persisted.
- **Power pole marks, connection limits, stacked poles and Smart Splitters are out of scope** — all backlogged separately.
- **Test command:** `./manage.sh test`. Prints `all sim checks passed`, exits 0. The Node `MODULE_TYPELESS_PACKAGE_JSON` warning is pre-existing (no `package.json`) — do not chase it.
- **Commit style:** conventional commits, matching existing history.

---

### Task 1: Modal wire mode and pole chaining

**Files:**
- Modify: `src/game.js` (`mousedown`, `mouseup`, one new resolver function)
- Test: `tests/test_sim.mjs` (the sim-side contract the chain relies on)

**Interfaces:**
- Consumes: `S.addNode`, `S.addWire`, `S.canPlace`, `S.canConnect`, `S.portsOf`, all already exported.
- Produces: `resolveWireClick(w)` in `game.js`, called only from the `mouseup` handler.

- [ ] **Step 1: Write the failing test**

The interaction lives in `game.js`, which has no test suite — but the sim-side contract a chain depends on is testable, and if it were wrong the feature could not work at all. Append to `tests/test_sim.mjs`, immediately before the final `console.log('all sim checks passed');`:

```js
// wiring: the pole kinds a chain places, and that a chained run actually carries goods
{
  // every wire kind that can be drawn maps to a pole that exists and carries that kind
  const POLE_FOR = { power: 'power-pole', item: 'conveyor-pole', fluid: 'pipe-pole' };
  for (const [kind, key] of Object.entries(POLE_FOR)) {
    const def = ctx.catalog[key];
    assert.ok(def, `${key} exists in the catalog`);
    assert.equal(def.size, 1, `${key} is a 1-tile relay`);
    const ports = portsOf({ key, x: 0, y: 0 }, ctx);
    assert.equal(ports.length, 2, `${key} has exactly one in and one out`);
    for (const p of ports) assert.equal(p.kind, kind, `${key} port ${p.id} carries ${kind}`);
    assert.ok(ports.some((p) => p.dir === 'in') && ports.some((p) => p.dir === 'out'),
      `${key} has both directions`);
  }

  // a chained item run carries goods end to end through two poles
  const s = newGame(81, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const src = addNode(s, 'storage-container', 5, 5, ctx);
  src.buf['iron-ore'] = 300;
  const p1 = addNode(s, 'conveyor-pole', 12, 5, ctx);
  const p2 = addNode(s, 'conveyor-pole', 18, 5, ctx);
  const dst = addNode(s, 'storage-container', 24, 5, ctx);
  assert.ok(addWire(s, src, 'out0', p1, 'in0', ctx), 'source into first pole');
  assert.ok(addWire(s, p1, 'out0', p2, 'in0', ctx), 'pole chains to pole');
  assert.ok(addWire(s, p2, 'out0', dst, 'in0', ctx), 'last pole into destination');
  for (let i = 0; i < 1200; i++) tick(s, 0.1, ctx); // 120s
  const got = dst.buf['iron-ore'] ?? 0;
  assert.ok(got > 100, `a two-pole chain carries goods, got ${got}`);
  const total = (src.buf['iron-ore'] ?? 0) + (p1.buf['iron-ore'] ?? 0)
    + (p2.buf['iron-ore'] ?? 0) + got;
  assert.ok(Math.abs(total - 300) < 1, `items conserved through the chain, got ${total}`);

  // a power chain reaches a distant machine, which is what a power-pole run is for
  const ps = newGame(83, ctx);
  ps.unlocked.buildings = Object.keys(ctx.catalog);
  ps.nodes = ps.nodes.filter((n) => n.key === 'the-hub'); ps.wires = [];
  const dep = addDeposit(ps, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(ps, 'miner-mk1', 10, 5, ctx);
  const gen = addNode(ps, 'biomass-burner', 60, 60, ctx);
  gen.buf.wood = 50;
  const q1 = addNode(ps, 'power-pole', 30, 30, ctx);
  const q2 = addNode(ps, 'power-pole', 45, 45, ctx);
  assert.ok(addWire(ps, dep, 'out0', m, 'res0', ctx));
  assert.ok(addWire(ps, gen, 'pout', q1, 'in0', ctx));
  assert.ok(addWire(ps, q1, 'out0', q2, 'in0', ctx));
  assert.ok(addWire(ps, q2, 'out0', m, 'pin', ctx));
  tick(ps, 0.1, ctx);
  assert.equal(m.status, 'mining', 'power reaches the miner through a two-pole chain');
}
```

Read line 4 of `tests/test_sim.mjs` before editing and add only the names it is missing. `portsOf`, `newGame`, `addNode`, `addWire`, `addDeposit` and `tick` are all already imported.

- [ ] **Step 2: Run the tests**

Run: `./manage.sh test`
Expected: **PASS**. This block asserts an existing contract rather than new behaviour — the poles and the wiring rules already work. It exists so that a later change to pole ports or the transfer loop cannot silently break chaining, which the browser-only interaction code could never catch.

If it FAILS, stop and report: something about the poles is not what this feature assumes, and the plan needs revisiting before any `game.js` change.

- [ ] **Step 3: Add the resolver**

In `src/game.js`, add immediately above the `canvas.addEventListener('mousedown', ...)` registration:

```js
// A pointer release and a subsequent click resolve identically against whatever is under the
// cursor: a compatible port finishes the wire, buildable ground drops a relay pole and keeps the
// chain going, anything else is ignored. One rule means the existing press-drag-release gesture
// is untouched, and the same gesture extended past a target simply continues.
const POLE_FOR = { power: 'power-pole', item: 'conveyor-pole', fluid: 'pipe-pole' };

function resolveWireClick(w) {
  const from = ui.wireFrom;
  const a = state.nodes.find((q) => q.id === from.node.id);
  if (!a) { setMode('idle'); return; }

  const over = portAt(w.x, w.y);
  if (over) {
    if (S.canConnect(a, from.port.id, over.node, over.port.id, state, ctx)) {
      const nw = S.addWire(state, a, from.port.id, over.node, over.port.id, ctx);
      if (nw) nw.style = ui.wireStyle;
      setMode('idle');
    }
    return; // an incompatible port is ignored; the chain stays live
  }

  const key = POLE_FOR[from.port.kind];
  if (!key) return;
  const gx = Math.round(w.x / T - 0.5), gy = Math.round(w.y / T - 0.5); // poles are 1x1
  const chk = S.canPlace(state, key, gx, gy, ctx);
  if (!chk.ok) { ui.hint = chk.reason ?? ''; return; }
  const pole = S.addNode(state, key, chk.snap.x, chk.snap.y, ctx);
  if (!pole) return;

  // connect to whichever pole port accepts the current end, and continue from the other. Chosen
  // by compatibility rather than by fixed id because a wire can be drawn backwards, from a
  // machine's input toward its source.
  const ports = S.portsOf(pole, ctx);
  const into = ports.find((p) => S.canConnect(a, from.port.id, pole, p.id, state, ctx));
  if (!into) { S.removeNode(state, pole.id); return; }
  const nw = S.addWire(state, a, from.port.id, pole, into.id, ctx);
  if (nw) nw.style = ui.wireStyle;
  ui.wireFrom = { node: pole, port: ports.find((p) => p.id !== into.id) ?? into };
}
```

`S.removeNode` is used in the rollback path. `game.js` imports with `import * as S`, so every `sim.js` export is already reachable — no import line changes are needed anywhere in this task.

- [ ] **Step 4: Guard `mousedown` so wire mode short-circuits**

Without this, a click on empty ground mid-chain falls through to `select(null)` and starts a pan drag, deselecting whatever was selected. In `mousedown`, immediately after the `ui.mode === 'place'` block and before the `handleAt` line, add:

```js
  // in wire mode, mouseup does the work — swallow the press so it cannot fall through to
  // selection or to starting a pan drag
  if (ui.mode === 'wire' && ui.wireFrom) return;
```

- [ ] **Step 5: Make `mouseup` resolve instead of exit**

In the `mouseup` handler, replace this block:

```js
  if (ui.mode === 'wire' && ui.wireFrom) {
    const over = portAt(ui.mouse.x, ui.mouse.y);
    if (over) {
      const from = ui.wireFrom;
      const a = state.nodes.find((q) => q.id === from.node.id);
      if (a) {
        const nw = S.addWire(state, a, from.port.id, over.node, over.port.id, ctx);
        if (nw) nw.style = ui.wireStyle;
      }
    }
    setMode('idle');
  }
```

with:

```js
  // `!ui.drag?.pan` matters: a right-drag pan also fires mouseup, and without the check a pan
  // that ends over open ground would drop a pole where the player only meant to scroll
  if (ui.mode === 'wire' && ui.wireFrom && !ui.drag?.pan) resolveWireClick(ui.mouse);
```

Note `setMode('idle')` is no longer called unconditionally — that is the whole modal change. `Escape` still exits, via the existing keydown handler.

- [ ] **Step 5b: Stop wire mode from resurrecting the dropdown bug**

The same `mouseup` handler computes:

```js
  const fromCanvas = !!ui.drag || (ui.mode === 'wire' && !!ui.wireFrom);
```

and calls `refreshInspector()` when it is true. Until now `ui.mode` returned to `'idle'` on the first `mouseup`, so that clause was momentary. **Modal wire mode makes it persistent**, which means every click anywhere — including inside the inspector — would rebuild the inspector while a chain is live. That is exactly the defect that made the Recipe dropdown close the instant it was pressed: `box.innerHTML = html` discards the live `<select>`.

Narrow the condition to drags only:

```js
  const fromCanvas = !!ui.drag;
```

and have `resolveWireClick` refresh precisely when it changes something. Add `refreshInspector();` as the last statement of both success paths in `resolveWireClick` — after `setMode('idle')` in the completed-wire branch, and after the `ui.wireFrom = ...` reassignment in the pole branch. Do not refresh on the ignored paths.

This is more precise than the old blanket refresh, not merely equivalent: a mouseup that neither dragged nor wired now leaves the inspector alone.

- [ ] **Step 6: Verify in the browser**

Run: `./manage.sh start` then open `http://localhost:8889`

Check:
1. **Short wire unchanged.** Press a miner's output port, drag to an adjacent container's input, release. The wire is created and wire mode exits — exactly as before, one gesture.
2. **Release on open ground starts a chain.** Press an output port, drag to empty ground, release. A pole appears, connected, and the preview line now follows the cursor from that pole.
3. **Clicks continue the chain.** Click three more times on open ground — three more poles, each wired to the last.
4. **Panning mid-chain.** With a chain live, right-drag to pan a long way across the map. No pole is placed by the pan. Then click — a pole appears at the new location, still connected.
5. **Finishing.** Click a compatible input port. The wire completes and wire mode exits.
6. **Incompatible target is ignored.** Mid-chain, click a port of the wrong kind — nothing happens and the chain stays live.
7. **Blocked ground is ignored, with a reason.** Mid-chain, click on top of an existing building — no pole, and the HUD hint says why.
8. **Escape cancels.** Mid-chain, press Escape. Wire mode exits, and the poles already placed remain (they are real buildings).
9. **All three kinds.** Repeat check 2 for a power wire and a fluid wire — a Power Pole and a Pipe Pole respectively.
10. **Selection is not disturbed.** Select a machine, start a chain, click empty ground a few times. The inspector still shows the machine, not "Nothing selected" — this is what the `mousedown` guard protects.
11. **The Recipe dropdown still works mid-chain.** Select a constructor, start a wire chain from some other building, then — without cancelling — click the inspector's Recipe dropdown. It must open and stay open. If it snaps shut, Step 5b was missed and the modal change has resurrected a previously-fixed bug.

Then: `./manage.sh stop`

- [ ] **Step 7: Commit**

```bash
git add src/game.js tests/test_sim.mjs
git commit -m "feat(ui): modal wire mode with pole chaining"
```

---

### Task 2: Documentation

Square routing was cut after playtesting — see the spec — so this task carries only the docs for
what actually shipped, plus one cosmetic fix the task review deferred here.

**Files:**
- Modify: `src/game.js` (clear a stale hint)
- Modify: `CHANGELOG.md`, `README.md`
- Test: browser

**Interfaces:**
- Consumes: the modal wire mode and pole chaining from Task 1.
- Produces: nothing.

- [ ] **Step 1: Clear the stale hint**

`resolveWireClick` sets `ui.hint = chk.reason ?? ''` when a pole cannot be placed on blocked
ground, but nothing clears it on a later successful hop. Unlike place mode, where `drawGhost()`
recomputes the hint every frame, wire mode never recomputes it — so a "blocked" message lingers in
the HUD until the chain ends.

Add `ui.hint = '';` as the first statement of both success paths in `resolveWireClick`: in the
completed-wire branch before `setMode('idle')`, and in the pole branch before the
`ui.wireFrom = ...` reassignment.

- [ ] **Step 2: Run the tests**

Run: `./manage.sh test`
Expected: PASS — `all sim checks passed`. This is a regression guard only; the change is in
`game.js`, which has no test suite by design.

- [ ] **Step 3: Update the CHANGELOG**

Insert directly below the `# Changelog` heading in `CHANGELOG.md`:

```markdown
## 2026-07-30 — Wiring Ergonomics

- **Wire mode is modal.** Releasing the pointer no longer ends a wire: a release and a subsequent
  click resolve identically — a compatible port finishes it, buildable ground drops a relay pole
  and continues the chain, anything else is ignored, and Escape cancels. Short wires are unchanged
  (press, drag, release), and the same gesture extended past a target simply keeps going.
- **Relay poles are placed while wiring**, picked from the wire's own kind — power, conveyor or
  pipe — so a long run no longer means a trip back to the palette for every hop.
- **Panning works mid-wire**, which is what makes cross-map runs possible at all. It needed no new
  input handling: `mousedown` already checked for a pan drag before checking for a port, and the
  old press-hold gesture was the only thing preventing it.
- Tests: the wire-kind to pole-kind mapping is total and every pole carries its kind on both
  ports; a two-pole item chain conserves goods end to end; a two-pole power chain reaches a
  distant miner.
```

Do **not** mention square routing — it was cut before implementation and no `'square'` style
exists.

- [ ] **Step 4: Update the README**

Read `README.md`. In the opening paragraph, find the sentence describing wiring and add after it:

```
Long runs are drawn in one gesture — click a port, pan, and click to drop relay poles along the
way.
```

Then in the `## Docs` list, insert directly above the `2026-07-30-achievements-design.md` entry:

```
- `docs/superpowers/specs/2026-07-30-wiring-ergonomics-design.md` — modal wire mode, pole
  chaining
```

- [ ] **Step 5: Verify in the browser**

Run: `./manage.sh start` then open `http://localhost:8889`

Check: start a chain, click on top of an existing building so the hint reads a blocked reason,
then click open ground to place a pole successfully. The hint must clear rather than keep showing
the stale message.

Then: `./manage.sh stop`

- [ ] **Step 6: Commit**

```bash
git add src/game.js CHANGELOG.md README.md
git commit -m "docs: wiring ergonomics changelog and readme"
```

---

## Done when

- `./manage.sh test` passes.
- Every browser check in both tasks has been performed against a running dev server — checks 1, 4, 10 and 11 of Task 1 especially, since they cover the regressions the modal change could cause.
- `git status` is clean.
