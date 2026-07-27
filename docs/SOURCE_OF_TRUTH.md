# Source of Truth Policy (Gridworks)

`data/source/satisfactory_data.json` is the **immutable source of truth** for all
gameplay content: items, fluids, resources (with map-gen weights), recipes, miners,
buildings, belts, and pipes. The browser fetches it directly at startup
(`game.js` → `buildCtx()` in `src/sim.js`); there is no backend, build step, or
derivation pipeline.

## Rules

- **Never edit `data/source/satisfactory_data.json` in place.** If the dataset ever
  needs to change, add a versioned snapshot (e.g. `satisfactory_data.v2.json`) and
  update the fetch path deliberately — with save-compatibility in mind (`normalizeSave`
  drops entities whose keys no longer exist in the catalog).
- Do not invent items, recipes, or stats. UI screenshots or visual references are not
  permission to add example content.

## Stats not present in the JSON

Some gameplay stats have no equivalent in the source JSON and are hardcoded in
`src/sim.js` with a comment citing their origin:

- `EXTRA_DEFS` — storage container, fluid buffer, coal/fuel/biomass generators, the
  HUB, deposits, splitters/mergers. Generator and burner-fuel numbers come from the
  Satisfactory wiki (satisfactory.fandom.com); plant-deposit emission rates are
  invented for idle pacing.
- `MILESTONES` — a hand-rolled 7-milestone ladder shaped after the wiki's early tiers;
  costs are idle-scaled guesses and free to tune. Every item/building key is validated
  against the JSON at load (`validateMilestones`) and bad keys throw.
- `ELEVATOR_PHASES` — the Space Elevator's 4 Project Assembly phases, shaped after the
  wiki; counts are idle-scaled guesses, validated at load like milestones.
- `DRAW_OVERRIDE` — power draw for buildings whose JSON lists `power: 0` but which
  draw variable power in-game.

When adding stats of this kind, keep them in `sim.js` constants with a source comment —
do not patch the JSON.

## History

The pre-2026-07-16 Flask codebase had a derivation pipeline (`data/derived/`,
`data/entities.json`, `/api/*`); those policies are archived in `docs/history/`.
