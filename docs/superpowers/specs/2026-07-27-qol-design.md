# QoL: Seed, Save Export/Import, Pause & Speed — Design

Date: 2026-07-27
Status: approved

## Seed display & entry

- HUD shows the current map seed (`🌱 <seed>`), so maps can be shared.
- "New Map" keeps its confirm, then prompts for a seed: blank = random; digits are
  used as-is (uint32); any other string is FNV-1a-hashed to a uint32. Cancel aborts.
- Fixes a latent bug: the new-map handler now rebuilds the palette and milestone
  panel (previously stale unlock state could linger until the next milestone change).

## Save export / import

- HUD "Export" downloads the current save as `gridworks-save-<seed>-<ts>.json`
  (autosaves first, so the file matches the live state).
- HUD "Import" opens a file picker; the file is parsed and run through
  `normalizeSave()` — invalid files alert and change nothing. On success the state
  is swapped in, autosaved, and palette/milestone panels rebuild.
- Import stamps a fresh `savedAt` via the immediate autosave, so importing an old
  file does not trigger offline credit.

## Pause & speed

- HUD pause button (⏸/▶) and speed button cycling 1x → 2x → 4x. `Space` toggles
  pause. Session-only (not persisted).
- Implementation: the frame loop multiplies elapsed real time by the speed factor
  (0 when paused) before accumulating fixed 0.1s ticks. Rendering continues while
  paused. Pause does not suppress offline credit if the tab closes while paused —
  it is a UI convenience, not a time freezer.

## Testing

- `tests/test_sim.mjs`: `newGame` determinism — same seed produces an identical
  deposit layout, different seed differs (backs the seed-sharing feature).
- Buttons, prompt flow, export/import round-trip, pause/speed verified in browser.
