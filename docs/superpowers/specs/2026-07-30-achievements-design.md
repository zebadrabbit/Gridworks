# Achievements: Derived Registry, HUD Chip — Design

Date: 2026-07-30
Status: approved

The first slice of the achievement system. It ships a registry, a derivation function, and a
HUD surface — with eleven achievements generated from the progression ladders that already
exist. The registry shape is the deliverable; the content is deliberately thin, because beta
testers are being asked to propose the rest.

This belongs to spec 3 of four (juice: eye-candy, audio, achievements). Specs 1 and 2 shipped.

## Achievements are derived, not stored

Both progression counters are **monotonic indices**: `state.unlocked.milestone` and
`state.elevator.phase` only ever increase. So "completed Coal Power" is exactly
`state.unlocked.milestone > 2` — a pure function of state the game already keeps.

That makes `earned(state)` a derivation rather than a record, which buys several things at once:

- **No new save state.** Nothing to default in `normalizeSave`, nothing to strip, nothing that
  can desync from reality.
- **Retroactive.** An existing save immediately shows the milestones it has already passed,
  with no migration.
- **Unlosable.** An achievement cannot be missed because the game was closed at the wrong moment
  or because a tick was skipped.

The alternative — latching each id into `state.achievements` when first earned — buys an
earned-at timestamp and the ability to express one-off feats. Neither is needed for anything in
the starting set, so it is not built. See the upgrade path below, which is a real expectation
rather than a hypothetical.

## The registry generates itself from the ladders

`MILESTONES` (7 entries) and `ELEVATOR_PHASES` (4 entries) already exist in `sim.js` with names
and costs. The achievements are generated from them rather than hand-written alongside them.

```js
export const ACHIEVEMENTS = [
  ...MILESTONES.map((m, i) => ({
    id: `milestone-${i}`, kind: 'milestone', name: m.name,
    desc: `Complete the ${m.name} milestone`,
    test: (s) => (s.unlocked?.milestone ?? 0) > i,
  })),
  ...ELEVATOR_PHASES.map((p, i) => ({
    id: `elevator-${i}`, kind: 'elevator', name: p.name,
    desc: `Ship Project Assembly phase ${i + 1}: ${p.name}`,
    test: (s) => (s.elevator?.phase ?? 0) > i,
  })),
];

export function earned(state) {
  return ACHIEVEMENTS.filter((a) => a.test(state)).map((a) => a.id);
}
```

Two reasons this is generated rather than listed:

- A hand-written parallel list would duplicate names that already exist and drift the moment a
  milestone is added, renamed or reordered. Generated, adding a rung adds its achievement
  automatically and the two can never disagree.
- Inventing achievement names would be inventing content, which `docs/SOURCE_OF_TRUTH.md`
  cautions against. Reusing the ladder's own names invents nothing.

Eleven to start. The fourth elevator achievement *is* the win condition, because
`elevator.phase >= ELEVATOR_PHASES.length` means Project Assembly is complete — no separate
victory entry is needed.

Adding a future achievement is one array entry carrying a predicate. That registry is the
system; there is no plugin architecture, no config file, and no registration API, because one
array entry is already the smallest possible unit of extension.

## Surface

A 🏆 chip in the HUD beside the existing ⚠ alert chip, reading `🏆 3/11`. Unlike the alert chip
it is **always visible**, because it is a progress counter rather than a problem count — hiding
it at zero would hide the fact that achievements exist at all.

Clicking it toggles a dropdown panel reusing the alerts panel's markup pattern and CSS, listing
all achievements with earned ones highlighted and locked ones dimmed.

**The two dropdowns are mutually exclusive.** `#alerts` anchors to its chip's left edge and the
achievements panel anchors to its own, so both being open at once would overlap along the top of
the screen. Opening either closes the other. This is one line in each toggle handler and avoids
a layout collision rather than trying to lay two panels out side by side.

Locked achievements show their description rather than being hidden or vague. For the milestone
half, that information is already readable elsewhere: every milestone grants at least one
building, and the palette labels each locked building with the milestone that unlocks it, so all
seven names are visible ahead of time — concealing them in the achievements panel would be false
mystery. The elevator half has no such precedent: phase names appear in the UI only for the
current phase, and only once a Space Elevator exists, so the achievements panel is the first and
only place a new player can read `Platform / Construction / Systems / Assembly`, including the
win. That reveal is accepted rather than avoided — the README already states four phases to win.

## The seeding gotcha

Newly-earned achievements toast, using the existing `toast()` helper. Detection diffs
`earned(state)` against a module-level `seen` Set in `game.js` — a session-lifetime UI concern,
deliberately not part of `state`, since persisting it would reintroduce exactly the save coupling
the derived design avoids.

That set **must be seeded at three points**: initial load, New Map, and save import — the same
three places `lastPhase` is already re-seeded in `game.js`. Missing any one of them means
importing a finished save fires eleven toasts at once, and starting a new map after a completed
run would toast nothing correctly.

Recomputation runs on the existing 400ms interval alongside the alert refresh, not per frame.
Eleven cheap predicates at 2.5 Hz is nothing, and per-frame would be pointless work.

## Testing

`tests/test_sim.mjs` gains:

- A fresh game earns nothing.
- `unlocked.milestone = 3` earns exactly the first three milestone achievements and no elevator
  ones.
- `elevator.phase = ELEVATOR_PHASES.length` earns all four elevator achievements.
- Ids are unique across the registry.
- `ACHIEVEMENTS.length === MILESTONES.length + ELEVATOR_PHASES.length`, so adding a rung to
  either ladder cannot silently skip its achievement.
- `earned()` is monotonic: raising either counter never shrinks the earned set.
- Every entry has a non-empty `id`, `name` and `desc`, so a malformed generated entry cannot
  reach the UI.

The chip, the dropdown, locked/earned styling, and the toast-on-earn are browser checks.

## Upgrade path, expected rather than hypothetical

Beta testers are being asked to propose achievements. Some proposals will not be derivable —
anything phrased as a one-off or a transient peak ("had fifty machines running at once",
"shipped a thousand items in an hour") has no monotonic state to read, because the condition can
become false again.

When the first such achievement is accepted, add `state.achievements` as an array of latched
ids, written when a predicate first passes, with a `normalizeSave` default. Derived achievements
keep working unchanged; the latch is only consulted for entries that declare they need it.

Recording this here so it is a known, costed step rather than a surprise, and so nobody
re-litigates the derived-versus-stored decision when it arrives.

## Out of scope

- Any achievement not generated from the existing ladders. The content set is deliberately
  eleven, pending tester proposals.
- Earned-at timestamps, achievement rarity, progress bars toward locked achievements, and
  notification history.
- Audio and eye-candy, which are the rest of spec 3.
- Steam or any external achievement integration. This is a static browser app with no backend.
