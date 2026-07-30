# Wiring Ergonomics: Pole Chaining & Square Routing — Design

Date: 2026-07-30
Status: approved

Building a long run today is unpleasant in a way that has a single root cause: **you cannot pan
while drawing a wire.** `mousemove` only pans when `ui.drag.pan` is set, and starting a wire sets
`ui.mode = 'wire'` instead — so a run longer than the viewport means zooming out until both ports
fit on screen, at which point the ports are too small to aim at. Relay poles were shipped as the
workaround, but placing each one means returning to the palette, clicking the pole, clicking the
ground, then starting a fresh wire.

This spec makes a long run one continuous gesture, and adds orthogonal wire routing.

## One resolution rule

Wire drawing today is **press-hold-release**: `mousedown` on a port sets `ui.mode = 'wire'`, and
`mouseup` completes the wire and exits wire mode. That model is what makes pole chaining
impossible — a click cannot happen mid-gesture, because the button is already held.

Wire mode becomes **modal**: `mouseup` no longer exits it. A pointer release and a subsequent
left-click then resolve **identically**, against whatever is under the cursor:

| Under the cursor | Result |
|---|---|
| A port that `canConnect` accepts | Wire completes, mode returns to idle |
| Empty ground where a pole fits | Place a pole, connect to it, continue the chain |
| Anything else | Ignored; wire mode stays live |

`Escape` cancels, as it already does.

Making release and click resolve the same way is the design's load-bearing choice. It means the
existing muscle memory is preserved exactly — press a port, drag to a target, release, done — and
the same gesture extended past a target simply keeps going. There is no mode to learn and no
second rule to remember.

The cost is that releasing early on open ground places a pole you may not have wanted. That is
accepted: poles are 1×1, cost no resources, and are removed with `Del`. The alternative — release
and click behaving differently — is a worse thing to learn than an occasional stray pole.

## Placing poles mid-chain

The pole's kind comes from the wire being drawn: `power` → Power Pole, `item` → Conveyor Pole,
`fluid` → Pipe Pole. All three already exist as 1×1 buildings, unlocked from the start.

Placement runs the same `canPlace` check as normal building placement. If the tile is blocked the
click is ignored and the existing hint line reports why, so a mis-aimed click never silently does
nothing unexplained.

On success the chain connects to whichever of the pole's two ports is compatible with the current
`wireFrom` — the opposite direction — and continues from the other one. Selecting by
compatibility rather than by fixed port id matters because a wire can legitimately be drawn
backwards, from a machine's input toward its source; `addWire` already normalises which end is
stored as the source. Power poles are undirected, so either port works and the choice is
arbitrary but consistent.

## Panning falls out for free

`mousedown` checks for a pan drag **before** it checks for a port, and that check does not consult
`ui.mode`:

```js
if (e.button === 1 || e.button === 2 || e.ctrlKey) { ui.drag = { pan: true, ... }; return; }
```

So once the left button is no longer held, right-drag panning already works mid-wire. A run can
cross the entire 720×480 map: click a port, pan, click to drop a pole, pan again, click the
target.

This is the whole reason the modal change is worth its blast radius. No edge-panning, no keyboard
panning, no new input mechanic — the capability is already in the code and the old gesture was the
only thing preventing it.

## Square routing

`wire.style` is already persisted and already carries `'straight'` and `'noodle'`. A third value,
`'square'`, emits axis-aligned segments between each pair of points.

`distToPath` already handles arbitrary polylines, so hit-testing and the waypoint machinery need
no changes at all. The `S` key currently toggles between two styles and becomes a three-way cycle.

## Testing

The testable surface is small, because this feature lives almost entirely in `game.js` input
handling, which has no test suite by design.

`tests/test_sim.mjs` gains:

- The wire-kind → pole-kind mapping is total and correct: every wire kind that can be drawn maps
  to a pole that exists in the catalog and carries that kind on both of its ports.
- Chain topology: given a source, a pole and a destination, wiring source → pole → destination
  produces two wires whose endpoints connect as expected, and resources flow end to end. This is
  what a chained placement builds, verified without needing the input layer.

Everything else is a browser check: click-to-start, release-and-click equivalence, chaining
several poles in one gesture, right-drag panning mid-wire, `Escape` mid-chain, a blocked
placement reporting its reason, the three-way style cycle, and confirming that a plain two-port
wire still takes exactly one press-drag-release.

## Out of scope

- **Power pole marks and connection limits.** Power ports currently accept unlimited wires; adding
  per-mark limits is a progression mechanic rather than a drawing one, and it would change what
  drag-to-place ought to place. Backlogged.
- **Stacked poles.** Rejected: logistic nodes share one buffer, so a 3-in/3-out node merges its
  inputs rather than carrying three lanes. Real lanes need per-lane buffers in `tick()`'s transfer
  loop, which is a sim-model change and not a new building.
- **Smart Splitters.** A separate feature, backlogged with its filter semantics recorded.
- Undo. There is none today, and a stray pole is one `Del` away.
- Auto-routing or pathfinding. Square routing lays out segments between points the player chose;
  it does not choose the points.
