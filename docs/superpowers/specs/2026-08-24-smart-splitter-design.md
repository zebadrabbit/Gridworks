# Smart Splitter: Per-Output Rules — Design

Date: 2026-08-24
Status: approved

Today's splitter is dumb: measured 2026-07-30, 120 iron / 60 copper / 30 screws in gives all three
outputs the same proportional mix. This spec gives every output a rule, on the **existing**
Splitter and Pipe Splitter — no new building, no unlock. Every splitter is smart.

Satisfactory's five filter modes are reduced to three. `Any` here means *unclaimed* (see below),
which absorbs `Any undefined`; `None` is an unwired port. Overflow keeps its wiki semantics.

## Rules

Each output `i` of a `logistic` node with `nOut > 1` has `node.filters[i]`, one of:

| mode | meaning |
|------|---------|
| `{ mode: 'any' }` (default, absent) | carries anything **no sibling output has claimed by Item** |
| `{ mode: 'item', res }` | carries only `res` |
| `{ mode: 'overflow' }` | carries only what the non-overflow outputs could not take **this tick** |

Consequences the player can rely on:

- Iron / copper / everything-else sorting is three dropdowns: `item:iron-ore`, `item:copper-ore`,
  `any`. Copper never leaks out of the `any` port.
- Two `item:iron-ore` outputs share iron evenly; an item claimed by nobody goes to the `any`
  outputs evenly, as today.
- An `overflow` output sees traffic only while the others are blocked (destination full, no wire,
  or filter mismatch). Several overflow outputs share the surplus evenly.
- **The buffer trap exists**, as in the reference: an item that no output can carry (e.g. screws
  arrive, outputs are `item:iron`, `item:copper`, and the third is unwired) sits in the buffer
  until a rule changes or the splitter is deleted. The inspector already shows the buffer, so it
  is visible; nothing is engineered around it.

Mergers are untouched. Nothing in this spec applies to a 1-out logistic node (poles).

## Sim

### Ports

`portsOf` gives each out-port of a multi-output logistic node:

- `res`: the Item resource, else `null`. A fixed `res` means `canConnect`'s existing rule keeps
  an `item:copper` port from wiring into an iron smelter, and the transfer loop's existing
  `srcPort.res` precedence carries it.
- `mode`: `'any' | 'item' | 'overflow'`.
- `excludes` (mode `any` and `overflow` only): the set of resources claimed by sibling Item
  ports. The transfer loop's resource picker skips these, and a wire whose destination port has
  a fixed `res` in `excludes` moves nothing.

### Transfer loop

Two changes, both inside the existing per-wire loop:

1. **Ordering.** Wires are processed in two passes: every wire whose source port is not
   `overflow`, then the overflow ones. Same code path; the loop runs over
   `[...normal, ...overflow]`. Overflow wires see the buffer *after* the normal outputs have
   taken their share, which is the whole definition of overflow.
2. **Fair share per resource.** Today a logistic source shares `logisticBuf[res] / outWires.length`.
   That becomes `logisticBuf[res] / (number of sibling out-wires eligible for res)`, where
   eligible means the port's `res` equals `res` or (mode `any`) `res` is not in `excludes`. So a
   two-way split with one Item output doesn't waste a third of the flow on an output that will
   never take it. Overflow wires share what is left of the pre-tick snapshot after the
   non-overflow outputs took their share (`snapshot − taken`, never a live re-read, so the result
   does not depend on wire order) among the overflow siblings.

`kindOf` and `dstPort.accepts` checks are unchanged. Belt rate caps are unchanged.

### Setting a rule

`setFilter(state, node, i, filter, ctx)` (sim, exported): writes `node.filters[i]`, then
reconciles wires exactly as `setRecipe` does — any wire on this node whose ports no longer
`canConnectExisting` is dropped. That reconcile loop is extracted from `setRecipe` into
`reconcileWires(state, node, ctx)` and both call it. A rule change never touches `node.buf`.

### Save

`node.filters` is a plain array and saves as-is. `normalizeSave` drops a filter whose `res` is
not a known resource (falls back to `any`) and ignores `filters` on nodes that are not
multi-output logistics. Old saves have no `filters` → all `any` → identical behaviour to today.

## UI

**Inspector** — a splitter (item or pipe) shows one `<select>` per output, labelled
`Output 1/2/3` top-to-bottom to match the port order on the tile. Options: `Any`, `Overflow`,
then a divider, then resources. The resource list is **what the factory currently has**: every
key present in any node's `buf`, every deposit's `res`, and every miner's `depositRes`, plus the
port's current selection so a rule never vanishes from its own dropdown. Fluid splitters list
only fluids, item splitters only items (`kindOf`). Changing a select calls `S.setFilter` and
refreshes the inspector. Same `onchange`/`refreshInspector` shape as the recipe select.

**Tile / tooltip** — 1×1 tiles have no room for labels. The port tooltip (already shows
`output · item`) gains the rule: `output · item · iron ore` / `· overflow`. Port ring colour is
unchanged.

**Help card** — one row: `Splitter rules — select a splitter; each output can be Any, Overflow,
or one item`.

## Testing

`tests/test_sim.mjs` gains one block, built with the existing helpers (`newGame`, `addNode`,
`addWire`, `tick`, `portsOf`):

- **Sorting:** a container holding iron+copper+screws → splitter with `item:iron`, `item:copper`,
  `any` → three containers. After ticking, container 1 has only iron, 2 only copper, 3 only
  screws.
- **Any excludes claimed:** with outputs `item:iron`, `any`, `any`: copper reaches only the two
  `any` containers, iron reaches only the first, and the two `any` containers hold equal copper
  (fair share by eligible count).
- **Overflow is last:** outputs `any` → container A (cap reached), `overflow` → container B.
  While A has space B receives nothing; once A is full B receives the flow.
- **Two overflows share evenly.**
- **Rule change drops mismatched wires:** an `any` port wired into an iron smelter input; set it
  to `item:copper` → the wire is gone; set it to `item:iron` from `any` → the wire stays.
- **Save round-trip:** `filters` survives `JSON.stringify` → `normalizeSave`; an unknown `res`
  becomes `any`.
- Existing assertions unchanged; a splitter with no `filters` still splits evenly.

Inspector selects, tooltip text and the help row are browser checks by the user.

## Not in scope

- A separate Smart Splitter building, unlocks, or build cost.
- `None` and a literal Satisfactory `Any`.
- Programmable splitters (multiple items per output) — chain splitters, as the wiki says.
- Buffer recovery on deletion; discrete-item buffers.
- Merger rules.
