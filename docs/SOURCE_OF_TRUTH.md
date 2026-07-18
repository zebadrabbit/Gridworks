# Source of Truth Policy (Gridworks)

Gridworks has a strict source-of-truth policy for gameplay/runtime content.

## Raw Satisfactory dataset (pipeline source of truth)

- The derivation tools read from the path configured in `data/source/source_of_truth.json`.
- The configured file should be a versioned snapshot like `data/source/satisfactory_data.v1.json`.
- Never overwrite an existing version in-place; create `data/source/satisfactory_data.v2.json` and update `data/source/source_of_truth.json`.

Fallback: if the config file is missing/invalid, tools default to `data/source/satisfactory_data.json` (legacy default; do not edit in-place).

## Authored data file (not used by this pipeline)

`data/entities.json` is **human-owned content** but is not used for the satisfactory-derived runtime pipeline.

## Rules

- Do not add, remove, or modify `tiers`, `items`, `entities`, `resources`, or `recipes` in `data/entities.json` unless a prompt explicitly instructs the exact content changes.
- UI screenshots or visual references are **not** permission to invent example entities.
- Validation should be strict and should fail loudly (but not crash the server) when `data/entities.json` violates the contract.

## Copilot restrictions

- Copilot may implement code that *reads, validates, and renders* `data/entities.json`.
- Copilot may not silently mutate `data/entities.json` content “to make the UI nicer”.

## Mock UI data

If UI development needs placeholder content, create it in `static/js/mock_ui_examples.js` and ensure it is not used by the simulation/content data path and does not affect `/api/entities`.
