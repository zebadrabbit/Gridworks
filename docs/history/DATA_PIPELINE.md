# Data Pipeline (Gridworks)

> **Historical** — describes the pre-2026-07-16 Flask codebase (`tools/`, `data/derived/`,
> `/api/*`), which was lost. Kept for reference only; the current app is a static rebuild
> with no derivation pipeline (see the repo README and `docs/SOURCE_OF_TRUTH.md`).

## Immutable source of truth

- The pipeline reads the raw Satisfactory dataset from a **configured source-of-truth path** in `data/source/source_of_truth.json`.
- The raw dataset file itself is versioned (for example `data/source/satisfactory_data.v1.json`, `data/source/satisfactory_data.v2.json`).
- Never overwrite an existing version in-place; add a new `vN` file and point `data/source/source_of_truth.json` at it.

Fallback behavior:
- If `data/source/source_of_truth.json` is missing/invalid, the tools fall back to `data/source/satisfactory_data.json`.
- Treat `data/source/satisfactory_data.json` as legacy/default and do not edit it in-place.

## Derived outputs

Derived files are generated from `data/source/satisfactory_data.json` and must not be hand-edited:

- `data/derived/entities_derived.json`
- `data/derived/milestones_derived.json` (if milestones are present in raw; otherwise a stub with `available:false`)

The derived file includes:

- `schema_version`
- `source_of_truth.path` and `source_of_truth.fingerprint` (sha256 of the raw file contents)
- `mapping_rules` (timestamp + documented derivation strategies)
- `tiers`, `items`, `entities`

Every derived item/entity includes:

- `source_ref.raw_id`: the raw object id (typically `key_name`)
- `source_ref.raw_path`: best-effort JSON-pointer-like path such as `/items/12`

Every derived entity also includes:

- `gridworks_classification.gw_category`
- `gridworks_classification.gw_mk` (Mk level for upgradeable entities; null when not applicable)

## Raw facts vs Gridworks overlay

Some fields required by Gridworks runtime (notably `ports`) are not present in `data/source/satisfactory_data.json`.
For entities, the derived schema therefore splits:

- `raw_facts`: the raw object copied from the source file without interpretation
- `gridworks_overlay`: Gridworks-specific inferred/defaulted fields like `ports` and UI hints

For backward compatibility, entities also include legacy top-level `ports` and `ui` mirroring the overlay.

Important: Gridworks does **not** model tile occupancy. There is no `grid_size` field in derived entities; the editor grid is used only to snap a node's top-left anchor.

## Non-derived file: `data/entities.json`

- `data/entities.json` is not used for derivation.
- It is treated as immutable by repo policy for this pipeline.

## Mapping rules

### Items

- Items are derived from raw `items[*]` and `fluids[*]`.
- Mapping is identity-based: `derived.items[item_id]` corresponds to raw `key_name == item_id`.

### Entities

Entities are derived from raw lists:

- `buildings[*]`, `miners[*]`, `belts[*]`, `pipes[*]`

Entity ids are identity-based: `derived.entities[entity_id]` corresponds to raw `key_name == entity_id`.

Some entity fields (like `ports` and the legacy UI badge field `tier`) are derived via documented best-effort rules in `tools/derive_from_satisfactory.py`.

Progression is intended to be driven by Mk levels + milestones (HUB unlocks), not by legacy badge colors.

## How to run

- Derive: `python tools/derive_from_satisfactory.py`
- Derive milestones: `python tools/derive_milestones.py`
- Validate: `python tools/validate_derived.py`
- Full checks (derive + validate + immutables guard): `bash tools/check.sh`

## Server behavior

- The `/api/entities` endpoint serves `data/derived/entities_derived.json` only.
- The `/api/milestones` endpoint serves `data/derived/milestones_derived.json`.
- If the derived file is missing, the server runs derivation once, validates, and then serves.
- If derivation or validation fails, the server returns HTTP 500 with errors.
