# Wire Styles, Waypoints, and Tooltips — Design

Date: 2026-07-18
Status: approved

## Goal

Wires (belts / pipes / power) get two render styles — **noodle** (current bezier)
and **straight** (polyline with user-placed bend waypoints) — plus a keybind to
switch, waypoint editing, and hover tooltips on ports and wires.

## Wire model (sim.js)

Each wire gains two fields:

- `style`: `'noodle'` (default) or `'straight'`
- `pts`: array of `{x, y}` waypoints in world pixel coords, empty by default;
  only meaningful for `style === 'straight'`

Old saves normalize in the existing save-normalization path:
missing `style` → `'noodle'`, missing `pts` → `[]`. Both fields round-trip
through save/load.

Waypoints are render/routing only — they never affect flow simulation.

## Rendering (game.js)

- One shared `wirePath(w)` helper returns the point sequence for a wire:
  - straight: `[portA, ...w.pts, portB]`
  - noodle: sampled points along the current cubic bezier
- Both `drawWire` and `wireAt` (hit test) walk `wirePath`, replacing the
  duplicated bezier math in `strokeWirePath` / `bezPoint`.
- Marching-ants flow animation works unchanged on both styles (same dash
  technique on the stroked path).
- A selected straight wire renders a small square handle at each waypoint.

## Waypoint editing

All on the **selected** wire only:

- **Add:** double-click on the wire inserts a waypoint on the nearest segment
  at the click position.
- **Move:** mousedown on a handle starts a drag; waypoint follows the mouse.
- **Select handle:** click a handle to select that waypoint.
- **Delete:** `Delete`/`Backspace` with a waypoint selected removes the
  waypoint; with only the wire selected it deletes the wire (current behavior).
- Adding a waypoint to a noodle wire is a no-op (noodle has no waypoints);
  toggling a wire with waypoints back to noodle keeps `pts` but ignores them.

## Keybind

- `S` with a wire selected: toggle that wire's style.
- `S` with nothing selected: toggle the default style applied to newly
  created wires; current default shown in the hint bar.

## Tooltips

One floating DOM `div` positioned near the cursor, updated on `mousemove`:

- **Port hover:** port name/direction, kind (item/fluid/power/resource),
  bound resource if any.
- **Wire hover:** resource name, current flow per minute, belt/pipe mark name.
- Hidden while dragging, panning, placing a building, or drawing a wire.

## Testing

- `tests/test_sim.mjs`: new wires carry `style`/`pts` defaults; save/load
  round-trips them; old-save normalization fills missing fields.
- Interaction (double-click add, drag move, delete, keybind, tooltips)
  verified manually in the browser.

## Out of scope

- Orthogonal auto-routing (waypoints give manual control; a router is a
  subsystem this doesn't need).
- Waypoints on noodle wires.
- Grid-snapping of waypoints (free placement; snap can come later if it
  feels sloppy).
