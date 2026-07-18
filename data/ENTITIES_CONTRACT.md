# Gridworks derived entities — Data Contract

Gridworks runtime content is served from `data/derived/entities_derived.json`.

Important constraints:
- `data/source/satisfactory_data.json` is the immutable source of truth.
- `data/entities.json` is treated as immutable by repo policy and is not the runtime source for this pipeline.
- There is **no tile occupancy model**: entity defs do not include `grid_size`. The editor grid is used only to snap a node's top-left anchor.

## Top-level shape

```json
{
  "schema_version": 1,
  "tiers": { "tierId": { "name": "...", "color": "#RRGGBB", "rank": 1 } },
  "items": { "itemId": { "name": "...", "tier": "tierId?", "stack_size": 100 } },
  "entities": { "entityId": { /* entity def */ } },
  "recipes": { "recipeId": { /* optional */ } }
}
```

### `schema_version` (number)
- Current: `1`
- If missing or unknown, the frontend will show a warning but continue to run.

### `tiers` (dictionary)
Tier IDs map to a UI badge/color definition (legacy; not used for progression gating).

Required fields per tier:
- `name` (string)
- `color` (string, hex like `#42d392`)
- `rank` (number) — higher means later/stronger

### `items` (dictionary)
Item IDs map to item definitions. Minimal fields supported:
- `name` (string)

Optional fields (allowed now, may be expanded later):
- `tier` (string tier id)
- `stack_size` (number)

### `entities` (dictionary)
Entity IDs map to entity definitions.

Required fields per entity:
- `name` (string)
- `gridworks_classification` (object)
- `category` (string; Gridworks-facing category; examples: `miner`, `container`, `processor`, `power`, `link`)
- `tier` (string tier id; legacy UI-only; must not be used for progression gating)
- `ports` (array of port defs)
- `ui` (ui block)

Optional blocks/fields:
- `simulation` (object) — arbitrary simulation parameters; may be absent
- `max_rate` (number) — commonly used by `link` entities (e.g. conveyors)

Allowed derived-only blocks/fields:
- `raw_facts` (object) — raw source copied from `data/source/satisfactory_data.json`
- `gridworks_overlay` (object) — Gridworks-specific inferred/defaulted fields (ports/UI hints)

#### `gridworks_classification`
Required fields:
- `gw_category` (string)
- `gw_mk` (integer or null)

#### Ports
Each port describes a connection point and throughput limit.

Required fields per port:
- `id` (string)
- `kind` (string; examples: `input`, `output`, `power`, `heat`)
- `resource` (string; example: `ore`, `power`)
- `max_rate` (number or null) — null means "unbounded"
- `side` (`"N"|"E"|"S"|"W"`)
- `offset` (integer) — position along that side in tile units

Notes:
- For `kind: input`/`output`, `resource` must exist in `derived.items` (power/heat are exempt).
- Port positioning is a UI concern; the data model does not include tile-based geometry.

#### `ui` block
Required fields:
- `tooltip` (string)
- `icon` (string key; not yet used)
- `description` (string)

### `recipes` (optional dictionary)
Reserved for future use. The loader tolerates missing/empty `recipes`.

## Validation philosophy
- Derived data is strictly validated in `tools/validate_derived.py`.
- The runtime/editor stores node placement (`x`,`y`) in the savegame/state, not in entity definitions.
