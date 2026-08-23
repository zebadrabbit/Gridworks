# Tile I/O Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canvas tiles read as inputs → processing → outputs, with a kind glyph in every port ring, a name + rate beside every attached port, and the product named in the status line.

**Architecture:** All rendering changes live in `drawNode` / `portPos` in `src/game.js`; `src/icons.js` exposes the glyph path strings so the canvas can stroke the same art via `Path2D`. `sim.js` is untouched — port ids, sides, wires and saves are unchanged; only the derived pixel positions move.

**Tech Stack:** Vanilla ES modules, Canvas 2D, no dependencies. Tests: `node tests/test_sim.mjs` (plain assert script; this plan adds no sim logic, so it only guards regressions).

**Spec:** `docs/superpowers/specs/2026-08-23-tile-io-layers-design.md`

## Global Constraints

- No new dependencies. No changes to `src/sim.js`.
- Inputs occupy the upper 55% of the west edge below an 18px header; outputs the lower 55% of the east edge; power ports stay on the north edge.
- Progress bar is centred vertically at `r.y + r.h * 0.5`.
- Glyph per kind: `resource → ore`, otherwise the port's kind. Labels 8px monospace; name `#cfe8ff`, rate `#7a8aa0`; `maxWidth` = 45% of tile width.
- Unattached ports, 1×1 logistics tiles and deposits get no labels.
- Mark deliberate simplifications with `// ponytail:`.
- `node tests/test_sim.mjs` must print `all sim checks passed` before every commit.

---

### Task 1: Glyph paths exported from icons.js

**Files:**
- Modify: `src/icons.js`

**Interfaces:**
- Produces: `export const ICON_PATH = { item, fluid, power, ore }` — SVG path `d` strings in a 16×16 box. The existing `icon(kind)` output must be byte-identical to before for these four kinds.

- [ ] **Step 1: Capture the current output**

Run: `node -e "import('./src/icons.js').then(m => console.log(['item','fluid','power','ore'].map(m.icon).join('\n')))" > /tmp/claude-1000/-home-winter-work-Gridworks/b269e72b-5c77-4f0f-998b-65b29461fa87/scratchpad/icons-before.txt`

- [ ] **Step 2: Refactor**

Replace the `ICON` block in `src/icons.js` with:

```js
// Path data is exported too: the canvas tile strokes the same shapes via Path2D.
export const ICON_PATH = {
  item: 'M4.5 3h7a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7A1.5 1.5 0 0 1 4.5 3z',
  fluid: 'M8 2.5 C5 6 4 8 4 10 a4 4 0 0 0 8 0 c0-2-1-4-4-7.5z',
  power: 'M9 2 4 9h4l-1 5 5-7H8z',
  ore: 'M3 12 6 5l3 3 2-3 2 7z',
};

const ICON = {
  item: wrap('<rect x="3" y="3" width="10" height="10" rx="1.5"/>'),
  fluid: wrap(`<path d="${ICON_PATH.fluid}"/>`),
  power: wrap(`<path d="${ICON_PATH.power}"/>`),
  ore: wrap(`<path d="${ICON_PATH.ore}"/>`),
  warn: wrap('<path d="M8 2.5 14 13H2z"/><path d="M8 7v3M8 11.5v.1"/>'),
  idle: wrap('<circle cx="8" cy="8" r="4.5" stroke-dasharray="2 2"/>'),
};
```

`item` keeps its `<rect>` in the SVG (so the HTML output is unchanged) and gets an equivalent rounded-rect path for the canvas.

- [ ] **Step 3: Verify output unchanged**

Run: `node -e "import('./src/icons.js').then(m => console.log(['item','fluid','power','ore'].map(m.icon).join('\n')))" | diff - /tmp/claude-1000/-home-winter-work-Gridworks/b269e72b-5c77-4f0f-998b-65b29461fa87/scratchpad/icons-before.txt && echo SAME`
Expected: `SAME`. Also: `node -e "import('./src/icons.js').then(m => console.log(Object.keys(m.ICON_PATH).length))"` → `4`.

- [ ] **Step 4: Commit**

```bash
node tests/test_sim.mjs
git add src/icons.js
git commit -m "feat(ui): export icon path data for canvas glyphs"
```

---

### Task 2: Layered port positions and centred progress bar

**Files:**
- Modify: `src/game.js` — `portPos` (~line 59), `drawNode` progress bar block (~line 240)

**Interfaces:**
- Consumes: `S.portsOf(node, ctx)` → ports with `side: 'W'|'E'|'N'`, `dir`.
- Produces: `portPos(node, port)` with the new band layout. Every caller (hit-testing, wire drawing) picks it up automatically.

- [ ] **Step 1: Replace `portPos`**

```js
// Tile reads top-to-bottom as inputs → processing → outputs: inputs are spaced over the upper
// band of the west edge, outputs over the lower band of the east edge. The bands overlap by
// 10% so a 2-in/1-out machine still looks like three rows rather than a top-heavy tile.
const HEADER = 18;
function portPos(node, port) {
  const r = nodePx(node);
  const sibs = S.portsOf(node, ctx).filter((p) => p.side === port.side);
  const i = sibs.findIndex((p) => p.id === port.id);
  const t = (i + 1) / (sibs.length + 1);
  if (port.side === 'N') return { x: r.x + t * r.w, y: r.y };
  const body = r.h - HEADER;
  if (port.side === 'W') return { x: r.x, y: r.y + HEADER + t * body * 0.55 };
  return { x: r.x + r.w, y: r.y + HEADER + body * 0.45 + t * body * 0.55 }; // E
}
```

- [ ] **Step 2: Move the progress bar**

In `drawNode`, change the machine progress block to:

```js
  if (def.type === 'machine' && n.recipe) {
    const by = r.y + r.h * 0.5 - 2;
    cx.fillStyle = '#152232';
    cx.fillRect(r.x + 8, by, r.w - 16, 5);
    cx.fillStyle = color;
    cx.fillRect(r.x + 8, by, (r.w - 16) * Math.min(1, n.progress), 5);
  }
```

- [ ] **Step 3: Check 1×1 tiles**

`T` is `S.TILE`; a 1×1 pole is `T` px tall. With `HEADER = 18` the body is `T - 18`. Run `node -e "import('./src/sim.js').then(m => console.log(m.TILE))"` and confirm `T - 18 > 8` so a single port still lands inside the tile. If `TILE` is too small for that, clamp: `const body = Math.max(r.h - HEADER, r.h * 0.5);` and note the clamp with a `// ponytail:` comment.

- [ ] **Step 4: Commit**

```bash
node tests/test_sim.mjs
git add src/game.js
git commit -m "feat(ui): layer tile ports — inputs upper-left, outputs lower-right, bar centred"
```

---

### Task 3: Glyphs in port rings

**Files:**
- Modify: `src/game.js` — both port-drawing loops in `drawNode` (deposit branch and main branch); imports

**Interfaces:**
- Consumes: `ICON_PATH` from `./icons.js`.
- Produces: `drawPort(node, port, def)` used by both loops.

- [ ] **Step 1: Import and add the helper**

Extend the icons import: `import { icon, meter, ICON_PATH } from './icons.js';`

Above `drawNode` add:

```js
const GLYPH = {};
for (const [k, d] of Object.entries(ICON_PATH)) GLYPH[k] = new Path2D(d);
const glyphKind = (port) => (port.kind === 'resource' ? 'ore' : port.kind);

// Ring in the kind colour; the kind glyph inside it, scaled from the 16-unit icon box to ~7px.
// 1x1 logistics tiles keep the old filled dot for inputs — a 7px glyph is unreadable there.
function drawPort(node, port, def) {
  const p = portPos(node, port);
  const col = KIND_COLOR[port.kind];
  cx.beginPath(); cx.arc(p.x, p.y, 5, 0, 7);
  cx.fillStyle = '#0a0c12'; cx.fill();
  cx.lineWidth = 2; cx.strokeStyle = col;
  cx.shadowColor = col; cx.shadowBlur = 6;
  cx.stroke(); cx.shadowBlur = 0;
  if (def.type === 'logistic') {
    if (port.dir === 'in') { cx.beginPath(); cx.arc(p.x, p.y, 2, 0, 7); cx.fillStyle = col; cx.fill(); }
    return;
  }
  const g = GLYPH[glyphKind(port)];
  if (!g) return;
  cx.save();
  cx.translate(p.x - 3.5, p.y - 3.5); cx.scale(7 / 16, 7 / 16);
  cx.lineWidth = 2.2; cx.strokeStyle = col; cx.stroke(g);
  cx.restore();
}
```

- [ ] **Step 2: Use it in both loops**

Replace the body of each `for (const port of S.portsOf(n, ctx)) { ... }` loop in `drawNode` (deposit branch and main branch) with `drawPort(n, port, def);`. The two loops were verbatim duplicates; this is the dedupe.

- [ ] **Step 3: Commit**

```bash
node --check src/game.js && node tests/test_sim.mjs
git add src/game.js
git commit -m "feat(ui): kind glyphs inside port rings"
```

---

### Task 4: Port labels, rates, and the product line

**Files:**
- Modify: `src/game.js` — `drawNode` main branch

**Interfaces:**
- Consumes: `S.getPort(node, portId, ctx)`, `state.wires` (`{a:{n,p}, b:{n,p}, flow, kind}`), `ctx.names`, `ctx.recipeByKey`.

- [ ] **Step 1: Add a per-port wire lookup**

Above `drawNode`:

```js
// Attached wires for a port: the far port's resource (for unpinned ports like a container's
// out0) and the summed flow. Called per visible port per frame; state.wires is small.
// ponytail: linear scan; index by node id if wire counts ever make this show in a profile.
function portLink(node, port) {
  let res = port.res ?? null, flow = 0, attached = false;
  for (const w of state.wires) {
    const end = w.a.n === node.id && w.a.p === port.id ? w.b : w.b.n === node.id && w.b.p === port.id ? w.a : null;
    if (!end) continue;
    attached = true; flow += w.flow ?? 0;
    if (!res) { const far = state.nodes.find((q) => q.id === end.n); res = (far && S.getPort(far, end.p, ctx)?.res) ?? null; }
  }
  return { res, flow, attached };
}
```

- [ ] **Step 2: Draw labels in the main branch**

After the `drawPort` loop in the main (non-deposit) branch, add:

```js
  if (def.type !== 'logistic') {
    const maxW = r.w * 0.45;
    cx.font = '8px monospace';
    for (const port of S.portsOf(n, ctx)) {
      if (port.side === 'N') continue;
      const { res, flow, attached } = portLink(n, port);
      if (!attached) continue;
      const p = portPos(n, port);
      const left = port.side === 'W';
      cx.textAlign = left ? 'left' : 'right';
      const x = left ? r.x + 9 : r.x + r.w - 9;
      cx.fillStyle = '#cfe8ff';
      cx.fillText(res ? (ctx.names[res] ?? res) : port.kind, x, p.y - 1, maxW);
      cx.fillStyle = '#7a8aa0';
      cx.fillText(`${Math.round(flow * 60)}/min`, x, p.y + 8, maxW);
    }
  }
```

- [ ] **Step 3: Product line**

Change the status line draw to:

```js
  const product = def.type === 'machine' && n.recipe && light === 'green'
    ? ctx.recipeByKey[n.recipe]?.products?.[0]?.[0] : null;
  cx.fillStyle = light === 'red' ? LIGHT_COLOR.red : '#7a8aa0'; cx.font = '9px monospace';
  cx.textAlign = 'center';
  cx.fillText(product ? `→ ${ctx.names[product] ?? product}` : n.status, r.x + r.w / 2, r.y + 25, r.w - 8);
```

(`textAlign` is reset to `center` explicitly because the label loop leaves it left/right.) Check `ctx.recipeByKey[...].products` is `[[key, amt], ...]` — `sim.js:398-399` iterates it as `[res]`, confirming the shape.

- [ ] **Step 4: Commit**

```bash
node --check src/game.js && node tests/test_sim.mjs
git add src/game.js
git commit -m "feat(ui): port names and rates on tiles; status line names the product"
```

---

### Task 5: Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add `## 2026-08-23 — Tile I/O layers`** above the visual-language entry, matching the existing style: three bullets — layered layout (inputs upper-left, bar centre, outputs lower-right; wires re-route, no save change), kind glyphs in every port ring, name + `/min` beside attached ports and `→ Product` in the status line.

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for tile I/O layers"
```
