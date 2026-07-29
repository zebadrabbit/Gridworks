# Know Your Factory: Status Lights, Alerts & Machine Analytics — Design

Date: 2026-07-29
Status: approved

The 60-second-burst problem: you alt-tab into Gridworks, and there is no way to tell
whether the factory is healthy without panning the camera across a 240×160 world
reading 9px status text. Every node already computes a `status` string every tick
(`sim.js:436-500`); none of it is surfaced beyond that text. This spec surfaces it.

This is the first of four planned specs. The others — the world (ore tiered by
distance, fog of war, minimap), juice (eye-candy, audio, achievements), and
onboarding — are separate and come later. Onboarding comes last deliberately: the
world spec changes what there is to teach.

## Brownouts are the invisible failure

`ratioOf()` (`sim.js:421-427`) returns a *partial* power ratio. A machine on a network
supplying 40% of demand still reports `crafting` and still looks fine, while running at
40% speed. Networks are per-`_net`, and the HUD shows only the global supply/demand sum,
so one browned-out network among several is undetectable today. This is a silent
throughput loss with no symptom, and it is the main reason "green" cannot be treated as
binary below.

## Status lights

Each lit node's panel border and glow carry its state color, replacing the per-type
border color for those nodes only. Chosen over a corner dot because the border stays
readable when panned out — which is exactly when spotting a problem matters. Building
type is still identified by the name text on the node.

Implemented as `lightOf(node, def)` in `sim.js` — logic, not drawing, so the existing
node test suite covers it. `game.js` has no tests.

| Light | Statuses |
|---|---|
| red | `no power`, `no fuel`, `no recipe`, `no deposit` |
| yellow | `waiting for input`, `output full`, `full`, or `ratio < 0.95` |
| green | `mining`, `crafting`, `generating`, `storing` |
| white | reserved for overclocking — nothing emits it |

Deposits, the HUB and the space elevator get no light: they are not machines, and their
`status` strings are milestone/phase text, not health.

Splitters and mergers get no light either. Their status is the unconditional string
`ok` (`sim.js:500`), so a light on them would be permanently green — pure noise in a
scan-for-red workflow, and inconsistent with Satisfactory, where logistics buildings
have no status pole. They keep their per-type border color.

White is documented but unreachable. Overclocking is still on the deferred backlog; the
row exists so the color table is complete when it ships. No state is added for it.

`tick()` stores the computed power ratio as `node.ratio` so `lightOf` stays pure and the
renderer does not recompute power networks at 60fps. A missing `ratio` (freshly loaded
save, before the first tick) is treated as `1`.

## Alert list

A `⚠ N` chip in the HUD, where N counts red machines plus throttled networks. Clicking
toggles a panel anchored below the chip listing:

- each red machine, by name and status
- each throttled network as one entry — "12 machines throttled, grid at 42%" — not one
  entry per machine. A brownout is a network property; twelve entries for one cause is
  the noise this spec exists to remove.

Clicking an entry pans the camera to that node, reusing the centering math from `main()`.

Throttled networks are derived at render time by grouping nodes on `node._net` and
reading `node.ratio`. No new state: `_net` is stripped from saves but is always present
in memory after the first tick. Only nodes with `ratio > 0` count as throttled — a
dead network's machines are already listed individually as red `no power`, and
counting them twice is the noise this list exists to remove.

## Lifetime counters

Added in `tick()` on miners, machines and generators only:

- `made` — total units produced (miners: units mined; machines: sum of product amounts
  per completed craft). Generators produce no items and have no `made`.
- `tGreen`, `tYellow`, `tRed` — seconds accumulated in each light state.

Uptime is `tGreen / (tGreen + tYellow + tRed)`. The inspector shows
`84% uptime · 1,204 produced` beneath the existing status line. A node placed this
frame has a zero denominator; it shows `—` rather than `NaN%` until it has ticked once.

These are plain numbers on the node object, so `JSON.stringify` persists them and
`simulateOffline()` accumulates them through the same `tick()` with no special casing.

The main node loop in `tick()` uses `continue` extensively, so state-time accumulation
cannot sit at the bottom of that loop. It goes in a short second loop that reads
`node.status` and `node.ratio` after the first loop completes. `made` increments at the
two points where output is actually created (`sim.js:441` for miners, `sim.js:457` for
machines).

## Where the code goes

Everything in `game.js` except `lightOf()`, which goes in `sim.js` to be testable. This
takes `game.js` from 767 to roughly 890 lines.

The alternative — splitting the DOM panel code into a new `src/hud.js` first — is a
refactor this feature does not require. Revisit when `game.js` actually hurts, around
1000 lines.

## Testing

`tests/test_sim.mjs` gains:

- `lightOf()` returns the expected color for every status string in the table above,
  including the throttle case at `ratio = 0.5` and the boundary at `0.95`.
- Uptime counters accumulate identically online and offline: 60s of `tick()` and 60s
  through `simulateOffline()` produce the same `tGreen`/`tYellow`/`tRed`.
- `made` conservation: for a miner → machine → HUB chain, machine `made` equals shipped
  plus buffered product.
- Brownout detection: a network with supply below demand yields `0 < ratio < 1` and a
  yellow light on a machine that still reports `crafting`.

Chip, panel, click-to-pan and border colors verified in the browser.

## Out of scope

- Minimap — belongs with fog of war in the world spec, so it gets built once.
- Rate sparklines and history graphs. Lifetime counters were chosen over per-node ring
  buffers; a single factory-wide graph can layer on later without touching this design.
- Achievements, audio, eye-candy — the juice spec.
- Overclocking, and therefore any white light.
- Per-machine alert muting or acknowledgement. Add it if the list proves noisy in
  practice; hard blocks alone should keep it short.
