# Smart Splitter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every output of the existing Splitter / Pipe Splitter a rule — `any` (unclaimed), `item:<res>`, or `overflow` — set from the inspector, honoured by the transfer loop, persisted in the save.

**Architecture:** All logic lives in `src/sim.js`: `portsOf` derives `res` / `mode` / `excludes` per out-port from `node.filters`; the transfer loop runs non-overflow wires before overflow wires and shares a logistic buffer only among the sibling outputs eligible for that resource; `setFilter` reuses the wire-reconcile loop extracted from `setRecipe`. `game.js` adds three `<select>`s, a tooltip line and a help row.

**Tech Stack:** Vanilla ES modules, no build, no deps. Tests: `node tests/test_sim.mjs` → `all sim checks passed`; `node tests/test_fx.mjs` → `all fx checks passed`. Never `node --test`.

**Spec:** `docs/superpowers/specs/2026-08-24-smart-splitter-design.md`

## Global Constraints

- Branch `feat/smart-splitter` off `main`.
- No new building, no unlock, no cost. Mergers and 1-out logistics (poles) are untouched.
- `node.filters[i]` shapes exactly: absent / `{ mode: 'any' }` / `{ mode: 'item', res }` / `{ mode: 'overflow' }`.
- `any` means **unclaimed**: a resource claimed by a sibling `item` filter never leaves an `any` (or `overflow`) port.
- Overflow outputs receive only what non-overflow outputs could not take this tick; several overflow outputs share evenly.
- A rule change never touches `node.buf`. A save with no `filters` behaves exactly as today (existing even-split test must still pass).
- `hist` / `_net` / `hMade` remain the only keys stripped on save; `filters` saves as-is.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Ponytail: mark simplifications with `// ponytail:`.

## File map

| File | Responsibility |
|------|----------------|
| `src/sim.js` | `portsOf` out-port rules; `reconcileWires` + `setFilter`; transfer-loop ordering and eligible-share; `normalizeSave` filter sanitising. |
| `tests/test_sim.mjs` | New block: rule change, save round-trip, sorting, any-excludes, overflow-last, overflow-share. |
| `src/game.js` | Inspector selects; port tooltip rule; HELP row. |
| `CHANGELOG.md` | Entry. |

---

### Task 1: Rules on ports, `setFilter`, save sanitising

**Files:**
- Modify: `src/sim.js` — `portsOf` logistic branch (~line 416), `setRecipe` (~517), `normalizeSave` (~547)
- Test: `tests/test_sim.mjs` (append before the final `console.log`)

**Interfaces:**
- Produces: out-ports of multi-output logistics carry `mode` (`'any'|'item'|'overflow'`), `res` (item key or `null`), `excludes` (array of res claimed by sibling `item` ports; only on `any`/`overflow`). `export function setFilter(state, node, i, filter, ctx)`. `export function reconcileWires(state, node, ctx)`.

- [ ] **Step 1: Branch**

```bash
git checkout -b feat/smart-splitter main
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/test_sim.mjs` immediately before `console.log('all sim checks passed');`. Also add `setFilter` to the import list on line 4.

```js
// smart splitter: rules on ports, wire reconcile, save round-trip
{
  const s = newGame(21, ctx);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  s.unlocked.buildings = Object.keys(ctx.catalog);
  const sp = addNode(s, 'splitter', 10, 10, ctx);
  const smelter = addNode(s, 'smelter', 20, 10, ctx);
  setRecipe(s, smelter, ctx.recipesByCat[ctx.catalog.smelter.cat].find((r) => r.name === 'Iron Ingot').key_name, ctx);
  const ironIn = portsOf(smelter, ctx).find((p) => p.dir === 'in' && p.res === 'iron-ore');
  assert.ok(ironIn, 'smelter has an iron-ore input');

  // default: every out-port is any, unclaimed, no res
  const outs = () => portsOf(sp, ctx).filter((p) => p.dir === 'out');
  assert.deepEqual(outs().map((p) => p.mode), ['any', 'any', 'any']);
  assert.deepEqual(outs().map((p) => p.excludes), [[], [], []]);

  // item rule fixes res; siblings exclude it
  setFilter(s, sp, 0, { mode: 'item', res: 'copper-ore' }, ctx);
  assert.equal(outs()[0].res, 'copper-ore');
  assert.equal(outs()[0].mode, 'item');
  assert.deepEqual(outs()[1].excludes, ['copper-ore']);
  assert.equal(outs()[1].res, null);

  // overflow carries mode + excludes
  setFilter(s, sp, 2, { mode: 'overflow' }, ctx);
  assert.equal(outs()[2].mode, 'overflow');
  assert.deepEqual(outs()[2].excludes, ['copper-ore']);

  // a copper port cannot wire into an iron input; an any port can
  assert.equal(addWire(s, sp, 'out0', smelter, ironIn.id, ctx), null, 'item:copper -> iron input refused');
  const w = addWire(s, sp, 'out1', smelter, ironIn.id, ctx);
  assert.ok(w, 'any -> iron input allowed');

  // changing the wired port to item:copper drops the wire; to item:iron keeps it
  setFilter(s, sp, 1, { mode: 'item', res: 'copper-ore' }, ctx);
  assert.ok(!s.wires.some((q) => q.id === w.id), 'mismatched wire dropped on rule change');
  const w2 = addWire(s, sp, 'out2', smelter, ironIn.id, ctx);
  assert.ok(w2);
  setFilter(s, sp, 2, { mode: 'item', res: 'iron-ore' }, ctx);
  assert.ok(s.wires.some((q) => q.id === w2.id), 'matching wire kept on rule change');
  sp.buf['iron-ore'] = 5;
  setFilter(s, sp, 2, { mode: 'any' }, ctx);
  assert.equal(sp.buf['iron-ore'], 5, 'rule change never touches buf');

  // save round-trip; unknown res falls back to any; filters ignored on non-splitters
  const merger = addNode(s, 'merger', 30, 10, ctx);
  merger.filters = [{ mode: 'item', res: 'iron-ore' }];
  sp.filters[1] = { mode: 'item', res: 'not-a-thing' };
  const back = normalizeSave(JSON.parse(JSON.stringify(s)), ctx);
  const sp2 = back.nodes.find((n) => n.id === sp.id);
  assert.deepEqual(sp2.filters[0], { mode: 'item', res: 'copper-ore' });
  assert.deepEqual(sp2.filters[1], { mode: 'any' }, 'unknown res -> any');
  assert.equal(back.nodes.find((n) => n.id === merger.id).filters, undefined, 'filters stripped from a merger');
}
```

- [ ] **Step 3: Run to verify failure**

Run: `node tests/test_sim.mjs 2>/dev/null`
Expected: FAIL — `setFilter` is not exported (SyntaxError on import) .

- [ ] **Step 4: `portsOf` — rules on the logistic out-ports**

Replace the logistic branch in `portsOf`:

```js
  } else if (def.type === 'logistic') {
    for (let i = 0; i < def.nIn; i++) inP('in' + i, def.lkind, null, i);
    // Per-output rules (spec: smart splitter). `any` = anything no sibling claimed by item.
    const filters = def.nOut > 1 ? (node.filters ?? []) : [];
    const claimed = filters.filter((f) => f?.mode === 'item').map((f) => f.res);
    for (let i = 0; i < def.nOut; i++) {
      const f = filters[i] ?? { mode: 'any' };
      if (f.mode === 'item') ports.push({ id: 'out' + i, dir: 'out', kind: def.lkind, res: f.res, side: 'E', idx: i, mode: 'item' });
      else ports.push({ id: 'out' + i, dir: 'out', kind: def.lkind, res: null, side: 'E', idx: i, mode: f.mode,
                        excludes: def.nOut > 1 ? claimed : undefined });
    }
  }
```

Note: a 1-out logistic (pole) gets `mode: 'any'` and `excludes: undefined` — nothing downstream reads them.

- [ ] **Step 5: `reconcileWires` + `setFilter`; `setRecipe` calls the extracted loop**

Replace `setRecipe` with:

```js
export function setRecipe(state, node, recipeKey, ctx) {
  node.recipe = recipeKey;
  node.progress = 0;
  node.buf = {};
  reconcileWires(state, node, ctx);
}

// drop wires on `node` whose port no longer exists or no longer matches the far end
export function reconcileWires(state, node, ctx) {
  state.wires = state.wires.filter((w) => {
    for (const end of [w.a, w.b]) {
      if (end.n !== node.id) continue;
      const other = state.nodes.find((n) => n.id === (end === w.a ? w.b : w.a).n);
      const otherEnd = end === w.a ? w.b : w.a;
      if (!getPort(node, end.p, ctx)) return false;
      if (!canConnectExisting(node, end.p, other, otherEnd.p, ctx)) return false;
    }
    return true;
  });
}

// Splitter output rule. filter: { mode: 'any' } | { mode: 'item', res } | { mode: 'overflow' }.
// Never touches buf — a stuck item is the player's to see in the inspector.
export function setFilter(state, node, i, filter, ctx) {
  node.filters ??= [];
  node.filters[i] = filter;
  reconcileWires(state, node, ctx);
}
```

- [ ] **Step 6: `canConnect` — an `excludes` port refuses a destination fixed to a claimed res**

In `canConnect`, inside the non-power `else` block after the `src.res && dst.res` check, add:

```js
    if (src.excludes && dst.res && src.excludes.includes(dst.res)) return false;
```

And in `canConnectExisting`, after the `pa.res && pb.res` line, add:

```js
  const [sp, dp] = pa.dir === 'out' ? [pa, pb] : [pb, pa];
  if (sp.excludes && dp.res && sp.excludes.includes(dp.res)) return false;
```

- [ ] **Step 7: `normalizeSave` — sanitise `filters`**

After the `for (const n of s.nodes) { delete n._net; delete n._fog; }` line add:

```js
  for (const n of s.nodes) {
    const def = ctx.catalog[n.key];
    if (def.type !== 'logistic' || !(def.nOut > 1)) { delete n.filters; continue; }
    if (!Array.isArray(n.filters)) { delete n.filters; continue; }
    n.filters = n.filters.map((f) =>
      f?.mode === 'overflow' ? { mode: 'overflow' }
      : f?.mode === 'item' && ctx.names[f.res] ? { mode: 'item', res: f.res }
      : { mode: 'any' });
  }
```

- [ ] **Step 8: Run tests**

Run: `node tests/test_sim.mjs 2>/dev/null`
Expected: `all sim checks passed` (the existing even-split splitter test still passes: no `filters` → all `any`).

- [ ] **Step 9: Commit**

```bash
git add src/sim.js tests/test_sim.mjs
git commit -m "feat(sim): splitter output rules — any/item/overflow on ports, setFilter, save sanitising

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Transfer loop — excludes, eligible fair-share, overflow last

**Files:**
- Modify: `src/sim.js` transfer loop (from `const byId = Object.fromEntries(...)` to the end of the `for (const wire of state.wires)` loop, ~lines 764–806)
- Test: `tests/test_sim.mjs`

**Interfaces:**
- Consumes: port `mode` / `res` / `excludes` from Task 1.

- [ ] **Step 1: Write the failing tests**

Append before the final `console.log`:

```js
// smart splitter: routing
{
  const mk = () => {
    const s = newGame(22, ctx);
    s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
    s.unlocked.buildings = Object.keys(ctx.catalog); s.beltMark = ctx.belts.length - 1;
    const src = addNode(s, 'storage-container', 2, 10, ctx);
    const sp = addNode(s, 'splitter', 8, 10, ctx);
    const boxes = [0, 1, 2].map((i) => addNode(s, 'storage-container', 14, 6 + i * 4, ctx));
    assert.ok(addWire(s, src, 'out0', sp, 'in0', ctx));
    return { s, src, sp, boxes };
  };
  const wireAll = (s, sp, boxes) => boxes.forEach((b, i) => assert.ok(addWire(s, sp, 'out' + i, b, 'in0', ctx), 'wire out' + i));
  const run = (s, n = 600) => { for (let i = 0; i < n; i++) tick(s, 0.1, ctx); };
  const only = (b, res) => Object.entries(b.buf).filter(([, v]) => v > 1e-6).map(([k]) => k).join() === res;

  // sorting: item:iron / item:copper / any
  {
    const { s, src, sp, boxes } = mk();
    src.buf = { 'iron-ore': 300, 'copper-ore': 300, screw: 300 };
    setFilter(s, sp, 0, { mode: 'item', res: 'iron-ore' }, ctx);
    setFilter(s, sp, 1, { mode: 'item', res: 'copper-ore' }, ctx);
    wireAll(s, sp, boxes);
    run(s);
    assert.ok(only(boxes[0], 'iron-ore'), `box0 iron only: ${JSON.stringify(boxes[0].buf)}`);
    assert.ok(only(boxes[1], 'copper-ore'), `box1 copper only: ${JSON.stringify(boxes[1].buf)}`);
    assert.ok(only(boxes[2], 'screw'), `box2 screws only: ${JSON.stringify(boxes[2].buf)}`);
    assert.ok(boxes[0].buf['iron-ore'] > 50 && boxes[2].buf.screw > 50, 'real throughput on every output');
  }

  // any excludes claimed; two any outputs share the unclaimed resource evenly
  {
    const { s, src, sp, boxes } = mk();
    src.buf = { 'iron-ore': 300, 'copper-ore': 300 };
    setFilter(s, sp, 0, { mode: 'item', res: 'iron-ore' }, ctx);
    wireAll(s, sp, boxes);
    run(s);
    assert.ok(only(boxes[0], 'iron-ore'));
    assert.equal(boxes[1].buf['iron-ore'] ?? 0, 0, 'iron never leaves an any port');
    assert.equal(boxes[2].buf['iron-ore'] ?? 0, 0);
    const c1 = boxes[1].buf['copper-ore'], c2 = boxes[2].buf['copper-ore'];
    assert.ok(c1 > 50 && Math.abs(c1 - c2) < c1 * 0.05, `copper shared evenly ${c1} ${c2}`);
  }

  // overflow only when the others cannot take it
  {
    const { s, src, sp, boxes } = mk();
    src.buf = { 'iron-ore': 2000 };
    setFilter(s, sp, 1, { mode: 'overflow' }, ctx);
    setFilter(s, sp, 2, { mode: 'overflow' }, ctx);
    assert.ok(addWire(s, sp, 'out0', boxes[0], 'in0', ctx));
    assert.ok(addWire(s, sp, 'out1', boxes[1], 'in0', ctx));
    boxes[0].buf['iron-ore'] = ctx.catalog['storage-container'].cap - 20; // 20 of space left
    run(s, 50); // 5s at full belt rate (> 20 units) — box0 fills, then overflow takes over
    assert.ok(boxes[0].buf['iron-ore'] >= ctx.catalog['storage-container'].cap - 1e-6, 'primary filled first');
    assert.ok((boxes[1].buf['iron-ore'] ?? 0) > 0, 'overflow received the surplus');
    // and it received nothing while the primary still had room: total moved == 20 + overflow
    const belt = ctx.belts[s.beltMark].rate / 60 * 0.1 * 50;
    assert.ok(Math.abs((20 + boxes[1].buf['iron-ore']) - belt) < 1e-6, 'overflow got exactly what the primary could not');
  }

  // two overflow outputs share the surplus evenly
  {
    const { s, src, sp, boxes } = mk();
    src.buf = { 'iron-ore': 2000 };
    setFilter(s, sp, 1, { mode: 'overflow' }, ctx);
    setFilter(s, sp, 2, { mode: 'overflow' }, ctx);
    wireAll(s, sp, boxes);
    boxes[0].buf['iron-ore'] = ctx.catalog['storage-container'].cap; // primary already full
    run(s, 100);
    const o1 = boxes[1].buf['iron-ore'], o2 = boxes[2].buf['iron-ore'];
    assert.ok(o1 > 5 && Math.abs(o1 - o2) < 1e-6, `overflow shared evenly ${o1} ${o2}`);
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `node tests/test_sim.mjs 2>/dev/null`
Expected: FAIL on `box1 copper only` (today the `any` output also carries iron) or on `overflow got exactly...`.

- [ ] **Step 3: Rewrite the transfer loop**

Replace from `const byId = Object.fromEntries(...)` through the closing `}` of `for (const wire of state.wires) { ... }` with:

```js
  const byId = Object.fromEntries(state.nodes.map((n) => [n.id, n]));
  const outWires = {};
  for (const w of state.wires) if (w.kind === 'item' || w.kind === 'fluid') (outWires[w.a.n] ??= []).push(w);
  // snapshot logistic-node buffers so fair-share is computed against the pre-tick total,
  // not a live buffer that shrinks as earlier sibling wires in this same tick drain it
  const logisticBuf = {};
  for (const n of state.nodes) if (ctx.catalog[n.key].type === 'logistic') logisticBuf[n.id] = { ...n.buf };
  // Overflow outputs run after every other wire so they see only what nobody else could take.
  // ponytail: two passes over a sorted list, not an evaluation graph.
  const srcPortOf = (w) => { const s = byId[w.a.n]; return s && getPort(s, w.a.p, ctx); };
  const isOverflow = (w) => srcPortOf(w)?.mode === 'overflow';
  const ordered = [...state.wires.filter((w) => !isOverflow(w)), ...state.wires.filter(isOverflow)];
  // overflow wires share the buffer left after pass 1; snapshot it at the pass boundary
  let overflowBuf = null;
  // can this out-wire carry `res`? (fixed res, or an any/overflow port that hasn't excluded it)
  const carries = (w, res) => {
    const p = srcPortOf(w);
    if (!p) return false;
    if (p.res) return p.res === res;
    return !(p.excludes?.includes(res));
  };
  for (const wire of ordered) {
    wire.flow = 0;
    if (wire.kind === 'power') continue;
    const src = byId[wire.a.n], dst = byId[wire.b.n];
    if (!src || !dst) continue;
    const srcPort = getPort(src, wire.a.p, ctx);
    const dstPort = getPort(dst, wire.b.p, ctx);
    if (!srcPort || !dstPort) continue;
    if (srcPort.mode === 'overflow' && !overflowBuf) {
      overflowBuf = {};
      for (const n of state.nodes) if (ctx.catalog[n.key].type === 'logistic') overflowBuf[n.id] = { ...n.buf };
    }
    const res = srcPort.res ?? dstPort.res ??
      Object.keys(src.buf)
        .filter((k) => src.buf[k] > 1e-9 && kindOf(k, ctx) === wire.kind &&
          !(srcPort.excludes?.includes(k)) &&
          (!dstPort.accepts || dstPort.accepts.includes(k)))
        .reduce((best, k) => (best == null || src.buf[k] > src.buf[best] ? k : best), null);
    if (!res || (dstPort.res && dstPort.res !== res)) continue;
    if (srcPort.excludes?.includes(res)) continue;
    if (dstPort.accepts && !dstPort.accepts.includes(res)) continue;
    const rate = (wire.kind === 'fluid' ? ctx.pipes[wire.mark ?? 0].rate : ctx.belts[wire.mark ?? 0].rate) / 60;
    const dstDef = ctx.catalog[dst.key];
    const space = dstDef.type === 'hub' || dstDef.type === 'elevator' ? Infinity
      : dstDef.type === 'store' ? dstDef.cap - bufTotal(dst.buf)
      : BUF_CAP - (dst.buf[res] ?? 0);
    // ponytail: proportional split each tick, not whole-unit round-robin — same steady-state rates.
    // A logistic source shares among the sibling outputs that can actually carry `res`, in the
    // same pass (overflow siblings split what pass 1 left behind).
    let share;
    if (ctx.catalog[src.key].type === 'logistic') {
      const pass = srcPort.mode === 'overflow';
      const sibs = (outWires[src.id] ?? []).filter((w) => isOverflow(w) === pass && carries(w, res));
      const pool = pass ? overflowBuf[src.id]?.[res] : logisticBuf[src.id]?.[res];
      share = (pool ?? 0) / Math.max(1, sibs.length);
    } else share = src.buf[res] ?? 0;
    const amt = Math.min(rate * dt, share, Math.max(0, space), src.buf[res] ?? 0);
    if (amt <= 1e-9) continue;
    src.buf[res] -= amt;
    if (dstDef.type === 'hub') {
      state.shipped[res] = (state.shipped[res] ?? 0) + amt;
      state.msProgress[res] = (state.msProgress[res] ?? 0) + amt;
    } else if (dstDef.type === 'elevator') {
      state.shipped[res] = (state.shipped[res] ?? 0) + amt;
      state.elevator.progress[res] = (state.elevator.progress[res] ?? 0) + amt;
    } else dst.buf[res] = (dst.buf[res] ?? 0) + amt;
    wire.flow = amt / dt;
  }
```

Notes for the implementer: `src.buf[res] ?? 0` was added to the `min` so a logistic share computed from a snapshot can never overdraw the live buffer; `carries` and `isOverflow` call `getPort` per wire per tick — fine at this scale (`// ponytail`).

- [ ] **Step 4: Run tests**

Run: `node tests/test_sim.mjs 2>/dev/null`
Expected: `all sim checks passed`. If the `overflow got exactly` assertion is off by a tick's worth, the primary's `space` clamp is the cause: check that `boxes[0]` fills to exactly `cap` (the `space` term) and that overflow receives on the same tick the primary saturates.

Run: `node tests/test_fx.mjs 2>/dev/null` → `all fx checks passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim.js tests/test_sim.mjs
git commit -m "feat(sim): splitter routing honours rules — excludes, eligible fair-share, overflow after everything else

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Inspector selects, tooltip rule, help row, changelog

**Files:**
- Modify: `src/game.js` — `refreshInspector` node branch (after the recipe `<section>`, ~line 883), the `sel.onchange` block (~889), `updateTooltip` port branch (~527), `HELP` (~1050)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `S.setFilter`, port `mode` / `res`.

- [ ] **Step 1: Inspector selects**

In `refreshInspector`, directly after the `if (def.type === 'machine') { ... }` recipe block and before `html += \`<section id="bufs"></section>\`;`, add:

```js
  if (def.type === 'logistic' && def.nOut > 1) {
    // rule dropdowns: Any / Overflow / resources the factory currently has (this kind only)
    const have = new Set();
    for (const q of state.nodes) {
      for (const k of Object.keys(q.buf ?? {})) if (q.buf[k] > 1e-6) have.add(k);
      if (q.res) have.add(q.res);
      if (q.depositRes) have.add(q.depositRes);
    }
    for (const f of n.filters ?? []) if (f?.res) have.add(f.res);
    const items = [...have].filter((k) => ctx.names[k] && S.kindOf(k, ctx) === def.lkind)
      .sort((a, b) => ctx.names[a].localeCompare(ctx.names[b]));
    html += '<section>';
    for (let i = 0; i < def.nOut; i++) {
      const f = n.filters?.[i] ?? { mode: 'any' };
      const cur = f.mode === 'item' ? f.res : f.mode;
      html += `<label class="dim" for="filter${i}">Output ${i + 1}</label><select id="filter${i}" data-i="${i}">
        <option value="any" ${cur === 'any' ? 'selected' : ''}>Any</option>
        <option value="overflow" ${cur === 'overflow' ? 'selected' : ''}>Overflow</option>
        <option disabled>──────</option>
        ${items.map((k) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${ctx.names[k]}</option>`).join('')}
      </select>`;
    }
    html += '</section>';
  }
```

After the `const sel = box.querySelector('#recipe'); if (sel) { ... }` block, add:

```js
  for (const fs of box.querySelectorAll('select[data-i]')) {
    fs.onchange = () => {
      const v = fs.value;
      S.setFilter(state, n, +fs.dataset.i, v === 'any' || v === 'overflow' ? { mode: v } : { mode: 'item', res: v }, ctx);
      refreshInspector();
    };
  }
```

- [ ] **Step 2: Tooltip rule**

In `updateTooltip`'s port branch, after `if (p.res) html += ...; else if (p.accepts) html += ...;`, change the `if (p.res)` line so an item rule and overflow both read:

```js
    if (p.mode === 'overflow') html += `<div class="dim">overflow — only what the other outputs can't take</div>`;
    else if (p.res) html += `<div class="dim">${ctx.names[p.res] ?? p.res}</div>`;
    else if (p.accepts) html += `<div class="dim">accepts: ${p.accepts.map((r) => ctx.names[r] ?? r).join(', ')}</div>`;
```

- [ ] **Step 3: Help row**

In `HELP`, after the `['Recipes', ...]` entry add:

```js
  ['Splitter rules', 'select a splitter — each output can be Any, Overflow, or one item'],
```

- [ ] **Step 4: Verify**

Run: `node --check src/game.js && node tests/test_sim.mjs 2>/dev/null && node tests/test_fx.mjs 2>/dev/null`
Expected: both `passed` lines.

Browser (user): select a splitter → three dropdowns; set Output 1 to Iron Ore and confirm copper stops leaving it and its port tooltip names the item; set Output 3 to Overflow and confirm it only flows when the others are blocked; `?` card shows the row.

- [ ] **Step 5: Changelog + commit**

Insert above the top entry in `CHANGELOG.md`, matching its heading style:

```markdown
## 2026-08-24 — Smart splitter rules

- Every Splitter and Pipe Splitter output has a rule: **Any** (anything no sibling claimed),
  **Overflow** (only what the other outputs can't take; several overflows share evenly), or one
  **item**. Set from the inspector; port tooltips show the rule. No new building, no unlock.
- Splitters share a resource only among the outputs that can carry it, so a two-way sort doesn't
  waste a third of the flow on a port that would never take it.
- `node.filters` saves with the node; old saves behave exactly as before.
```

```bash
git add src/game.js CHANGELOG.md
git commit -m "feat(ui): splitter rule dropdowns, tooltip rule, help row; changelog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Then hand off to `superpowers:finishing-a-development-branch`.

---

## Self-review

- **Spec coverage:** Rules table + consequences → Tasks 1–2 (tests: sorting, any-excludes, overflow-last, overflow-share, buffer untouched); Ports → T1 step 4/6; Transfer loop ordering + eligible share → T2; `setFilter`/`reconcileWires` → T1 step 5; Save → T1 step 7 + test; Inspector/tooltip/help → T3; buffer trap deliberately unhandled (spec).
- **Placeholders:** none.
- **Type consistency:** `setFilter(state, node, i, filter, ctx)` used identically in tests and T3; port fields `mode`/`res`/`excludes` produced in T1 step 4 and read in T1 step 6, T2 (`carries`, `isOverflow`, picker filter) and T3 (tooltip); `reconcileWires` exported and used by both `setRecipe` and `setFilter`.
