# aggregate.template.json

`contexts/{slug}/aggregates.json` — array of aggregates for one context.

```json
{
  "$schema": "ddd-domain-model/aggregates/v1",
  "$render_contract": "views/v1",
  "context_slug": "",
  "status": "proposed",
  "confidence": "low",
  "last_updated": "",
  "aggregates": [
    {
      "name": "",
      "description": "",
      "status": "proposed",
      "confidence": "low",
      "aggregate_root": {
        "name": "",
        "identifiers": [],
        "attributes": [],
        "code_anchors": [],
        "evidence": []
      },
      "entities": [
        {
          "name": "",
          "role": "child-entity|reference-inside-aggregate",
          "identifiers": [],
          "attributes": []
        }
      ],
      "value_objects": [
        {
          "name": "",
          "attributes": []
        }
      ],
      "invariants": [
        {
          "rule": "",
          "status": "proposed",
          "confidence": "low",
          "evidence": []
        }
      ],
      "commands": [
        {
          "name": "",
          "description": "",
          "entry_points": [],
          "evidence": []
        }
      ],
      "queries": [
        {
          "name": "",
          "description": "",
          "entry_points": [],
          "evidence": []
        }
      ],
      "state_machine": {
        "name": "",
        "description": "",
        "state_field": "",
        "initial_state": "",
        "terminal_states": [],
        "states": [
          {
            "id": "",
            "label": "",
            "description": ""
          }
        ],
        "transitions": [
          {
            "from": "",
            "to": "",
            "trigger": "",
            "command": "",
            "guard": "",
            "emits_event": null
          }
        ],
        "status": "proposed",
        "confidence": "low",
        "inference": "explicit|inferred-from-status-column|inferred-from-table-write|inferred-from-job|inferred-from-invariant|inferred-from-command|inferred-from-orchestration|unknown",
        "evidence": []
      },
      "consistency_boundary_notes": "",
      "persistence_hints": {
        "tables": [],
        "schemas": []
      }
    }
  ]
}
```

## State machines (per aggregate)

Discover an aggregate **state machine** whenever lifecycle is visible in code/SQL.

| Signal | How to model |
|--------|----------------|
| `status` / `state` / `processed` column | `state_field` + discrete `states[]` |
| Value object like `ResolutionStatus` / `ApprovalStatus` | States = VO attributes or known enums |
| Setter SQL (`set_*_processed`, `set_approval_approved`) | `transitions[]` with `command` |
| Domain event on transition | `emits_event` past-tense event name |
| No lifecycle found | Omit `state_machine` **or** set `inference: unknown` with empty transitions + open question |

**Rules:**

- Prefer one primary machine per aggregate (entity-owned sub-lifecycle stays notes).
- `from` / `to` must match `states[].id` (use `"*"` only for catch-all with notes).
- Link `command` to `commands[].name` when known; `emits_event` must exist in `domain-events.json`.
- Avoid self-loop transitions unless `guard` documents idempotency.
- Console/ACL orchestration without local persistence → `inference: inferred-from-orchestration`, `confidence: low`.
- Keep `confidence` honest — inferred enums are `low` until validated.

Canonical inference values: see [state-machine-schema.md](../../../ddd-use-cases/artifacts/state-machine-schema.md).

Validate:

```bash
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py {output_root}
```

Renderer projects `state_machine` as Mermaid `stateDiagram-v2` under each aggregate in `views/contexts/{slug}.md`.

## Entity vs value object fields

In DDD, **entities have identity and mutable state**; **value objects are defined entirely by their attributes** (no separate lifecycle identity). Both can list `attributes` in this schema.

| Field | Applies to | Meaning |
|-------|------------|---------|
| `identifiers` | aggregate_root, entities | Keys that establish identity within the aggregate (PK, business key, FK to parent root) |
| `attributes` | aggregate_root, entities, value_objects | Descriptive or mutable fields; not used for cross-lifecycle identity |
| `role` | entities only | `child-entity` (owned, FK to root) or `reference-inside-aggregate` (lookup within boundary) |

**When to use which:**

- Put **identity keys** in `identifiers` (e.g. `id`, `customer_id`, `import_batch_id`).
- Put **columns / properties** in `attributes` (e.g. `name`, `status`, `transaction_date`).
- Use **value_objects** when a bundle has no identity and is compared by value (e.g. `Address`, `Money`, `DateRange`). Prefer a VO over a child entity when the concept has no independent lifecycle.

**Phase 3 discovery order:** `identifiers` first (from PK/FK/`ON CONFLICT` signals), then `attributes` as MCP/SQL reveals columns. Empty `attributes` arrays are fine during early passes.

**Example (customer aggregate):**

```json
{
  "aggregate_root": {
    "name": "customer",
    "identifiers": ["id"],
    "attributes": ["name", "status", "tier", "segment_id"]
  },
  "entities": [
    {
      "name": "customer_address",
      "role": "child-entity",
      "identifiers": ["customer_id"],
      "attributes": ["house_number", "street", "city", "state", "zip", "lat", "lng"]
    }
  ],
  "value_objects": [
    {
      "name": "CustomerStatus",
      "attributes": ["status"]
    }
  ]
}
```

Do **not** list the same field as both an entity `attribute` and a separate value object unless they represent different bounded-context meanings.

## Inferring aggregates from MCP (heuristics)

| Signal | Likely aggregate |
|--------|------------------|
| High in-degree orchestrator function | Root or domain service |
| `ON CONFLICT` / unique index on business key | Root identity → `identifiers` |
| Table columns in SQL `INSERT`/`SELECT` | Root or entity → `attributes` |
| Child rows FK to parent with cascade | Child entity in same aggregate |
| Cross-context ID reference only | External aggregate — link, don't embed |
| Embedded struct with no own table/id | Value object |

Verify invariants with `get_code_snippet` only when MCP suggests a rule.
