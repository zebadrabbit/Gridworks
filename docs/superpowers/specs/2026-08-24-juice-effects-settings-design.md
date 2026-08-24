# Juice: Effects Layer + Settings Panel — Design

Date: 2026-08-24
Status: approved

The remainder of spec 3 (juice). Achievements shipped 2026-07-30; audio stays blocked on
assets. This spec covers **eye-candy** — flow shapes on wires, status pulses, event bursts, an
ambient day/night + shimmer + manta layer — and the **settings panel** the world spec punted
here, which also takes the rarely-used buttons off the HUD.

Everything here is presentation. `sim.js` is untouched; nothing new is saved into the game
state. A "Factory Score" progression idea raised in the same brainstorm is its own spec
(Trello, Next Up) and is not part of this.

## Two new modules

- **`src/fx.js`** owns all transient visual state — pulses, particles, the manta position,
  per-wire path caches — and exposes `flow`, `pulse`, `burst`, `ambient` and `overlay` draw
  calls. It reads `settings` for its toggles and saves nothing. `game.js` gains call sites,
  not logic; this keeps the 1300-line file from growing more.
- **`src/settings.js`** is one object under one localStorage key, `gw_settings`, with
  defaults and a `saveSettings()`. It absorbs the two existing preference singletons
  (`MAP_KEY`, `TUT_KEY`) so preferences live in one place.

## 1. Flow shapes replace marching ants

Marching ants show *that* a wire moves, not *how much*. They are removed; `drawWire` calls
`fx.flow(w, pts, now)` instead.

- Short **capsules** (item wires, ~6px long) or round **bubbles** (fluid wires) ride the path
  in the wire's `KIND_COLOR`. Power wires are unchanged.
- **Speed** scales with mark exactly as the ants did: `1 + (mark ?? 0) * 0.4`.
- **Density** is the fraction of capacity in use:
  `ratio = w.flow / (rate(mark) / 60)` where `rate` is `ctx.belts[mark].rate` or
  `ctx.pipes[mark].rate`. Spacing interpolates from 40px at `ratio → 0` to 10px at
  `ratio ≥ 1`. A saturated belt reads as a solid train; a trickle as the occasional blip. Not
  1:1 with items, by design.
- `w.flow === 0` draws nothing moving — same as today.
- `fx` caches each wire's cumulative segment lengths keyed by wire id + point count + endpoint
  coords, so a path is measured once, not per frame. Capsules are placed at
  `(offset + i * spacing) % len` for `i < floor(len / spacing)`.

## 2. Status pulses

`drawNode` already computes `S.lightOf(n, def)` each frame. `game.js` keeps
`lastLight: Map<nodeId, light>`; when the value differs from the previous frame it calls
`fx.pulse(node, light)`.

- One ring per change: starts on the tile rect, expands 8px and fades over 500ms, stroked in
  the **new** light's colour. Green→red fires a red ring; red→green a green one.
- The first frame after `state` is replaced (load, import, New Map) seeds the map silently, so
  a loaded save does not fire a pulse per node. Nodes that vanish are dropped from the map.
- A steady tile never animates. There is no continuous pulse.

## 3. Event bursts

Big events only, and every one already calls `toast()`: milestone unlock, elevator phase
complete, achievement earned, win. Each of those call sites adds `fx.burst(x, y)`.

- Origin is the HUB centre for milestones, phases and the win; the triggering node when the
  event has one (achievements that key off a node use the HUB too — the registry is derived
  and has no node reference).
- A burst spawns 12–20 particles: position, velocity (random direction, 40–90px/s), life
  600–900ms; drawn as 2px dots in the HUD accent colour, fading with life.
- Live particles are capped at 200 — a save import that retro-toasts a dozen achievements
  cannot hitch the frame.

## 4. Ambient layer

Drawn by `fx.ambient(cx, cam, state, now)` immediately after the background fill and before
the grid; `fx.overlay(...)` after everything for the night tint.

**Day/night.** `phase = (state.time % 600) / 600` — a 10-minute game-time cycle. It pauses
with the sim, runs faster at 2×/4×, and offline progress simply lands you somewhere in the
cycle. Night depth `n = (1 − cos(2π·phase)) / 2`, smooth and continuous. Effect of `n`:

- Background and grid lines darken by up to 25% (`n = 1`). Nothing goes black.
- Glows widen: `panel()`'s `shadowBlur`, the green-light glow and wire `shadowBlur` scale by
  `1 + n`. A green factory glows at night; that is the reward.
- Tile fills, text and labels are untouched, so the I/O layer labels stay legible.

**Shimmer.** Deposits get a slow diagonal specular sweep: a narrow white gradient band at
~15% alpha crossing the tile every ~4s. One `createLinearGradient` per deposit per frame.

**Manta.** One soft dark blob — a radial gradient roughly 10×6 tiles, 12% alpha at the
centre, 0 at the edge — drifts across the whole world on a slow Lissajous path
(`x = cx + A·sin(t/τ₁)`, `y = cy + B·sin(t/τ₂)`, periods of a few minutes, driven by
`state.time`). Purely ambient: no hit-testing, no tooltip, no reaction to the camera or the
factory. A subtle shadow underneath everything is the point — new players notice the shadow
first. Sounds and an easter egg are for when audio exists.

## 5. Settings module

```js
export const DEFAULTS = {
  flow: true, pulses: true, bursts: true, dayNight: true, manta: true,
  wireStyle: 'noodle', mapOpen: true, tutorial: null,   // null | 'go' | 'skip'
};
export const settings = { ...DEFAULTS, ...load() };
export function saveSettings() { localStorage.setItem('gw_settings', JSON.stringify(settings)); }
```

- **Migration:** on first load, if the old `MAP_KEY` / `TUT_KEY` entries exist their values
  are copied into `settings` and the old keys removed. Runs once; a corrupt `gw_settings`
  falls back to defaults.
- `fx` reads `settings.<flag>` at the top of each effect. Off means nothing is drawn — `flow`
  off leaves the plain solid wire (the ants do not come back). Shimmer follows `dayNight`;
  it is not worth its own switch.
- `wireStyle` replaces the module-level default that `S` toggled with nothing selected; `S`
  now writes `settings.wireStyle` and saves.

## 6. Panel and HUD

A ⚙ button in the HUD toggles `#settings`, a card styled like `#help`; Escape or ⚙ closes.
Contents, top to bottom:

- **Effects** — five checkboxes: Flow shapes, Status pulses, Event bursts, Day/night, Manta.
- **Wires** — default style radio: Noodle / Straight.
- **Tutorial** — "Replay tutorial" button: sets `settings.tutorial = null` and shows the offer
  card on the next fresh world.
- **World** — seed (text), Export, Import, New Map. These move out of the header; their
  handlers are unchanged.

HUD after: `⚡ power · 📦 shipped · ⚠ alerts · 🏆 · ? · ⚙ · hint · ⏸ · speed`. Only things
acted on while playing stay on the play field.

## Testing

`sim.js` does not change, so `tests/test_sim.mjs` does not change. The pure pieces of the new
modules get one assert each in a new `tests/test_fx.mjs`, run the same way (`node tests/test_fx.mjs`):

- Capsule spacing: `ratio 0 → 40px`, `ratio ≥ 1 → 10px`, monotone between.
- Capsule count for a known path length and spacing.
- Day/night curve: `n(0) = 0`, `n(0.5) = 1`, continuous across the cycle boundary.
- Settings migration: old `MAP_KEY`/`TUT_KEY` values land in `settings` and the old keys are
  gone; a corrupt `gw_settings` yields defaults. (A 5-line `localStorage` stub in the test.)

Rendering is a browser pass by the user: a saturated belt beside a trickle, a machine losing
power (red ring), a milestone unlock (burst), the tint and glow spread at night, the manta
crossing, and the ⚙ panel with the header trimmed.

## Not in scope

- Audio, the manta easter egg — blocked on assets.
- Factory Score progression — own spec.
- Reduced-motion auto-detection; the five checkboxes cover it.
- Any effect that carries information the sim does not already expose.
- Sparklines on tiles.
