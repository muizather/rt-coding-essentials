# process-map.template.json

`{output_root}/process-map.json` — cross-context processes composed of use cases.

```json
{
  "$schema": "ddd-domain-model/process-map/v1",
  "$render_contract": "views/v1",
  "platform_name": "",
  "status": "proposed",
  "confidence": "low",
  "last_updated": "",
  "processes": [
    {
      "id": "proc-001",
      "name": "",
      "description": "",
      "contexts_involved": [],
      "steps": [
        {
          "order": 1,
          "context_slug": "",
          "use_case_id": "",
          "produces_event": null,
          "triggered_by_event": null,
          "waits_for_integration": null,
          "notes": ""
        }
      ],
      "state_machine": {
        "name": "",
        "description": "",
        "initial_state": "",
        "terminal_states": [],
        "states": [
          {
            "id": "",
            "label": "",
            "description": "",
            "step_order": null
          }
        ],
        "transitions": [
          {
            "from": "",
            "to": "",
            "trigger": "",
            "use_case_id": "",
            "context_slug": "",
            "guard": "",
            "emits_event": null
          }
        ],
        "status": "proposed",
        "confidence": "low",
        "inference": "inferred-from-steps|explicit|unknown",
        "evidence": []
      },
      "gaps": [],
      "status": "proposed",
      "confidence": "low",
      "evidence": []
    }
  ]
}
```

## Rules

1. Every `use_case_id` should exist under `contexts/{context_slug}/use-cases.json` when that
   context has been processed. If not yet processed, leave `use_case_id` empty and add a gap.
2. Link steps with `produces_event` / `triggered_by_event` using names from `domain-events.json`.
3. Set each participating use case's `part_of_process` to this `id`.
4. Orphan outbound edges without a downstream step → process-level or context `cross-context-orphan` gap.
5. Prefer one process per recognizable business pipeline (e.g. catalog → ETL → warehouse sales).

## Process state machines

Every process **should** include a `state_machine` recounting the end-to-end lifecycle
(orchestration states), distinct from per-aggregate machines in `aggregates.json`.

| Field | Meaning |
|-------|---------|
| `states[].id` | Stable kebab/snake id for Mermaid |
| `states[].step_order` | Optional link to `steps[].order` |
| `transitions[].use_case_id` | Use case that advances the process |
| `transitions[].emits_event` | Domain/integration event crossing the edge |
| `inference` | How the machine was reconstructed |

**Discovery:**

1. Walk ordered `steps[]` → candidate states (e.g. `source-published`, `catalog-registered`).
2. Edges from `produces_event` / `triggered_by_event` / step succession.
3. Failure branches (e.g. `SaleProcessingFailed`) as alternate transitions.
4. If a step lacks `use_case_id`, still model the state; mark gap / low confidence.
5. Run `infer_process_state_machines.py` for a deterministic baseline, then patch branches manually.

Renderer writes Mermaid `stateDiagram-v2` into `views/process-map.md` per process.

See [state-machine-schema.md](state-machine-schema.md) for shared inference enum and validation.
