# Space Elevator End-Goal — Design

Date: 2026-07-27
Status: approved

## Goal

A win condition after the 7-milestone HUB ladder: build the Space Elevator and ship
Project Assembly parts through 4 phases. Completing phase 4 is "winning" (the game
keeps running — it's an idler).

## Model (sim.js)

- New `EXTRA_DEFS['space-elevator']`: type `elevator`, size 4, no power draw (as in
  the game/wiki). One item in port whose `accepts` is the union of all project-part
  keys, so only elevator parts can be belted in.
- Unlocked by milestone 7 ("High Tech") — added to its rewards.
- `ELEVATOR_PHASES` constant — phases shaped after the wiki's Project Assembly, all
  items validated against the JSON at load (same policy as `MILESTONES`); counts are
  idle-scaled guesses, tune freely:
  1. Platform: 50 smart-plating
  2. Construction: 100 smart-plating, 100 versatile-framework
  3. Systems: 200 versatile-framework, 100 automated-wiring, 50 modular-engine
  4. Assembly: 100 modular-engine, 50 adaptive-control-unit
  (All four parts craft in assembler/manufacturer, unlocked by milestone 6 — so the
  ladder stays reachable; verified by the existing reachability test pattern.)
- State: `state.elevator = { phase: 0, progress: {} }` (in `newGame`, defaulted by
  `normalizeSave` for older saves). Wires into an elevator node add to
  `state.elevator.progress` (sink semantics like the HUB — infinite space). When the
  active phase's costs are met, phase advances and progress clears. Phase 4 done →
  node status "Project Assembly complete".

## UI (game.js)

- Palette: new "Special" group holding the elevator (greyed until milestone 7 like
  any locked building).
- Milestone panel: after all HUB milestones, shows the active elevator phase with
  the same progress rows/bars; after phase 4, "🚀 Project Assembly complete".
- Toast on each phase completion; victory toast on finishing phase 4.
- Elevator renders as a standard neon panel (new purple type color).

## Testing

- `tests/test_sim.mjs`: elevator is locked at start and unlocked by the last
  milestone; belting phase-1 parts advances the phase; non-project items are
  rejected by `accepts`; completing all phases yields the complete status; elevator
  phase items are reachable with the buildings unlocked by milestone 7.

## Out of scope

- Post-victory prestige/reset mechanics.
- Multiple elevators contributing to the same phase pool is allowed implicitly
  (progress is global state, like HUB milestones) — not restricted.
