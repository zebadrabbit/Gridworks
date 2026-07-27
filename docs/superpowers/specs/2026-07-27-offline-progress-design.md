# Offline Progress — Design

Date: 2026-07-27
Status: approved

## Goal

The factory keeps producing while the tab is closed — the core idler hook. On return,
elapsed wall-clock time is simulated (capped) and a toast summarizes what happened.

## Model (sim.js)

- `save()` stamps `state.savedAt = Date.now()` (persisted; `normalizeSave` passes it
  through untouched — absent in old saves means no offline credit on first load).
- New pure `simulateOffline(state, seconds, ctx)`:
  - Clamps `seconds` to `OFFLINE_CAP` (8 h) and ticks the normal `tick()` in
    `OFFLINE_STEP` (0.5 s) increments; returns the seconds actually simulated.
  - 0.5 s steps are safe: wires/miners/generators are linear in `dt`, and machines
    start at most one craft per tick — the shortest recipe in the JSON is 2 s, so
    coarse stepping loses no throughput. Full cap = 57 600 ticks, well under a second
    of real time for typical factories.
- No new save-format fields beyond `savedAt`; no version bump needed.

## UI (game.js)

- After `load()`, if away time > 60 s: run `simulateOffline`, then show a toast —
  "Welcome back — simulated 2h 13m of offline progress" plus "shipped N items" when
  the HUB received anything while away. Toast is a fixed div that fades after ~8 s.
- Milestones can complete during offline sim; the existing palette rebuild on
  milestone change picks that up on the first frame.

## Testing

- `tests/test_sim.mjs`: an identical miner→container chain simulated 600 s offline
  (0.5 s steps) matches the same chain ticked live at 0.1 s within 5%; away time
  beyond `OFFLINE_CAP` is clamped; `savedAt` survives `normalizeSave`.
- Toast and away-time detection verified manually in the browser.

## Out of scope

- Offline rates differing from online rates (no "offline efficiency" penalty).
- Simulating map/plant regrowth differently offline — plants use the same tick.
- Catch-up animation or replay.
