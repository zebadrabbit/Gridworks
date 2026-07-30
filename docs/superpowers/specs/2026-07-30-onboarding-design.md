# Onboarding: Guided First Factory & Keybind Card — Design

Date: 2026-07-30
Status: approved

The last of the four planned specs, and deliberately last: it teaches whatever the game has
become, and the world, the wiring gesture and the achievement ladder all changed after it was
scheduled.

## What is actually opaque

A new player must discover six dependencies before anything happens, four of them non-obvious:

1. **A plant deposit belted into a Biomass Burner is the power bootstrap.** Nothing runs without
   power, and nothing suggests that a deposit called *leaves* is what starts a factory.
2. **Deposits connect to miners by a `resource` port** — a distinct wire kind that only ever joins
   those two things, not a belt.
3. **A machine does nothing until a recipe is set**, in the inspector, on the right.
4. **The HUB is the sink.** Shipping into it is what scores milestones.
5. Miners, smelters and constructors each need their own power wire.
6. Machines must be belted to each other in order.

The game already teaches *controls* contextually — place mode says
`click to place X · shift = multi · esc = cancel`, wire mode says
`click a port to finish · click ground for a pole · right-drag to pan · esc = cancel`. What it has
never taught is the **loop** and these dependencies. Onboarding closes that gap, and documents
only the controls that have no contextual hint.

## Steps are outcomes, not scripted actions

Each goal is a single predicate over state the game already keeps, so the six dependencies
collapse into five goals. A miner having produced anything is simultaneously proof that it was
wired to a deposit *and* powered — two dependencies verified by one number:

| # | Goal | Predicate | What it forces the player to discover |
|---|---|---|---|
| 1 | Get power flowing | a `biomass-burner` with `tGreen > 0` | plant deposits are the bootstrap |
| 2 | Mine some ore | any `miner-*` with `made > 0` | the `resource` port, and that miners need power |
| 3 | Smelt it | a `smelter` with `made > 0` | recipes exist and live in the inspector |
| 4 | Make a part | a `constructor` with `made > 0` | parts come from chained machines |
| 5 | Ship it | `state.shipped` has any entry above zero | the HUB is the sink |

### Why counters, not `status`

An earlier draft tested live `status` — `'generating'`, `'mining'`, `'crafting'`. **That was wrong, and
the way it was wrong is worth recording.** `status` is not monotonic. A Miner Mk1 on a *pure*
deposit produces 120/min into a starting-tier belt carrying 60/min, so its buffer saturates and it
flips permanently to `'output full'`. No node then reports `'mining'`, and the panel regresses to
"mine some iron ore" while the player watches a working mine→smelt line. It is a stable steady
state, not a flicker, and roughly a quarter of deposits are pure.

The lifetime counters added by spec 1 are monotonic by construction: `made` on miners and
machines, `tGreen` on everything `lightOf` lights, generators included. Keying off those is what
keeps tutorial progress from regressing the way `status` does above.

Step 1 narrows to `biomass-burner` specifically because `tGreen` is tracked for miners and
machines too, so "any node with `tGreen > 0`" would be satisfied by the wrong thing. That
narrowing is safe: it is the only generator in `START_UNLOCKED`, and every other generator is
gated behind a milestone that itself requires shipping — which is step 5.

Outcome-based rather than scripted matters for three reasons. It never dictates *how*, so a player
who builds in a different order or adds extra machines is never told they are wrong. It cannot
wedge, because there is no expected next click to miss. And it needs no scripting engine — each
step is one predicate.

## Progress is derived

`sim.js` gains `TUTORIAL`, an ordered array of `{ id, goal, hint, test }`, and
`tutorialStep(state)` returning the first entry whose `test` fails, or `null` when all pass.

The current step is therefore **the first unsatisfied predicate** — there is no stored index and no
state machine. This is the same shape as `ACHIEVEMENTS`, which already proved the pattern: pure,
testable in the only tested file, and adding nothing to the save.

A player who completes a later goal early still sees the earlier one, which is correct: if you
somehow ship an item before your smelter runs, you skipped nothing you needed.

## One marker, in localStorage

The player's decision lives in its own `localStorage` key, not the save. It is a display
preference that must survive New Map — you should not be re-taught on your fifth world — which is
the same reasoning that put the fog toggle and the minimap collapse outside the save.

It holds **three** values, not a boolean: absent (never asked), `'go'` (accepted and still
following), `'skip'` (dismissed). A boolean cannot express this, because "accepted" and "never
asked" would be the same state — so reloading mid-tutorial would silently lose the panel, and a
later New Map would re-offer.

Nothing else is persisted. Progress is derived, so a reload mid-tutorial resumes exactly where the
factory actually is.

## The offer

On a world where the marker is absent, a small centred card:

> **New here?** I can walk you through building your first factory.
> **[ Show me ]  [ Skip ]**

Shown on first-ever load and after New Map. **Never over an existing save** — a returning player
with a running factory is not a new player, and interrupting them would be exactly the friction
this project avoids. **Show me** sets `'go'`; **Skip** sets `'skip'` and dismisses permanently.

## The panel

Once accepted, a dismissible card shows the current goal and its hint, updating as predicates
pass. It is **advisory and never blocking**: the player can ignore it, build ahead of it, or close
it at any point. Closing sets `'skip'`.

When the last goal passes the card congratulates, and sets `'skip'` as it renders so it appears
once rather than returning on every later load.

## The keybind card

A `?` chip in the HUD, always available, opening a panel listing the controls that have **no**
contextual hint:

- **Pan** — right-drag, middle-drag, ctrl-drag, or left-drag on empty ground
- **Zoom** — mouse wheel
- **Delete** — select, then `Del`
- **Pause** — `Space`, or the ⏸ button
- **Speed** — the `1x` button cycles 1× / 2× / 4×
- **Wire style** — `S` cycles the style, per-wire when a wire is selected
- **Recipes** — select a machine, then use the inspector's Recipe dropdown
- **Minimap** — click or drag to jump, hover a dot for detail, `−` to collapse

Place-mode and wire-mode controls are **deliberately excluded**. The HUD hint already teaches
those at the moment they matter, and duplicating them in a static card would rot the first time a
gesture changes — as the wire gesture just did.

## The dropdown group becomes three

`#alerts` and `#achievements` already anchor to their own chips along the top and are mutually
exclusive, because two open at once would overlap. The `?` panel joins that group, so the
exclusion becomes three-way: opening any one closes the other two.

That is worth stating because the existing implementation hard-codes a pair. Three panels want a
small helper rather than three copies of two `classList.remove` calls.

## Testing

`tests/test_sim.mjs` gains:

- Each of the five predicates against a synthetic state that satisfies it and one that does not.
- `tutorialStep` on a fresh game returns the first step, and on a fully-built state returns `null`.
- The steps are satisfied **in order** by a realistic build, walking a factory forward one goal at
  a time. Note this is the ordinary path, not a guarantee: a Constructor running
  `biomass-from-leaves` satisfies step 4 with no miner in existence, which is why the panel simply
  shows the earliest unsatisfied goal rather than assuming earlier ones passed.
- Each narrowing is pinned, because the code is correct but nothing else holds it correct: a
  Storage Container lights green on its first tick with no power at all, so step 1 must stay
  specific to the burner, and a Constructor can produce with no miner, so step 2 must stay
  specific to miners.
- Ids are unique and every entry has non-empty `goal` and `hint` text, so a malformed entry cannot
  reach the UI.

The offer card, the panel, the `?` chip, the three-way exclusion and the localStorage persistence
are browser checks.

## Out of scope

- Any tutorial beyond the first shipped item. Milestone 1 needs 100 plates and 100 rods, which is
  a long wait with a card on screen.
- Highlighting or arrows pointing at UI elements. Text goals with hints, no spotlight system.
- Forcing, gating or blocking any action. Advisory only.
- Re-offering onboarding to a player who skipped. One flag, one decision.
- Translating or externalising the copy. It is English strings in the source, like every other
  string in this project.
