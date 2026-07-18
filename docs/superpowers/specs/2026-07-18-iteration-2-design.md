# Gridworks Iteration 2 — Deposit Nodes, Biomass Bootstrap, Milestones

## Context

Evolves the 2026-07-15 static rebuild (`sim.js` pure logic, `game.js` canvas UI, no
backend/build step). `data/source/satisfactory_data.json` stays the immutable source of
truth; building stats absent from it (biomass burner, milestone tiers) come from
https://satisfactory.fandom.com/wiki/Category:Production_buildings and are hardcoded in
`EXTRA_DEFS`-style constants with a comment citing the wiki. Upload Labs aesthetic is
unchanged: dark grid, neon node panels, port dots, animated wires.

## 1. Deposits become nodes

Deposits stop being snap-on terrain and render as fixed, undeletable Upload-Labs-style
nodes with out ports:

- **Mineral / crude-oil deposits**: one out port (kind `resource`, res = the deposit's
  resource).
- **Water deposits**: out port count scales with purity — impure 2, normal 3, pure 4.

Miners (`miner-mk1/2/3`, `oil-pump`, `water-extractor`) are placed on any free tiles and
gain a `resource`-kind in port. A resource wire may only connect a deposit out port to a
miner whose `minerCat` matches the deposit category, one wire per deposit port, one
deposit wire per miner. Mining rate = miner `base_rate` × purity mult (0.5/1/2). The
miner keeps its existing item/fluid out port. Old snap-to-deposit placement rules are
removed; saves from iteration 1 are not migrated (localStorage save version bump →
new map).

## 2. Bootstrap: plants → biomass burners

- Mapgen scatters **plant nodes** (a new deposit category, ~8 per map) that emit
  `leaves` and `wood` from a single out port at a slow fixed rate (item-kind port, wired
  straight to belts — no miner needed; plants are self-harvesting here since there is no
  hand-gathering).
- New **biomass burner** building (wiki: 30 MW, no power draw). One item in port; burns
  `leaves` / `wood` / `mycelia` / `biomass` / `solid-biofuel` at each fuel's energy rate
  (wiki MJ values, hardcoded). Since it draws no power, it is the true bootstrap.
- The HUB loses its free 30 MW and becomes purely the milestone/sink node.
- Existing biomass recipes in the JSON (`biomass-from-leaves`, `-wood`, `-mycelia`,
  `solid-biofuel`) make constructors the upgrade path.

## 3. HUB milestones

No milestones exist in the JSON, so a hand-rolled tier list ships in `sim.js` (shaped
after the wiki's early tiers; every item key validated against the JSON at load, bad
keys throw). Ship the required items into the HUB to complete the **active** milestone
(one at a time, in order); completion unlocks buildings, recipes (by category or key),
and belt/pipe marks. Fresh game starts unlocked: `miner-mk1`, `smelter`, `constructor`,
`biomass-burner`, `storage-container`, belt mk1, power wire. Locked palette entries are
greyed with the unlocking milestone named. Unlocks persist in the save.

## 4. Belt / pipe tiers

All 6 belts and 2 pipes from the JSON. New wires default to the highest unlocked mark;
the inspector shows a wire's mark and allows changing it among unlocked marks. Wire
rendering hints the mark (brighter/faster ants at higher marks).

## 5. Splitters and mergers

1-tile nodes, no power draw: **splitter** (1 in → 3 out) and **merger** (3 in → 1 out),
each in item and fluid variants (fluid = pipe junction). Splitter distributes evenly
among connected outs (round-robin on whole units for items, proportional for fluids);
merger drains connected ins evenly. Unlocked from the start.

## Sim / files

Same architecture: `sim.js` grows deposit-node ports, plant emission, burner fuel table,
milestone check in the HUB branch of `tick`, splitter/merger node type, per-wire rates.
`game.js` grows deposit/plant/splitter rendering, locked-palette state, milestone HUD
panel, wire-mark inspector row. `test_sim.mjs` extends: deposit→miner wiring rule,
burner powers a machine, milestone completes and unlocks, splitter splits 60 → 3×20.

## Deferred

Vehicles/trains/drones, space elevator (candidate end-goal), enemies → alien-protein
node (the JSON already has `alien-protein` + `biomass-from-alien-protein` when we want
it), overclocking, offline progress, somersloops, nuclear waste, sound, minimap.
