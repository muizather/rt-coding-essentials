# use-cases.template.json

`contexts/{slug}/use-cases.json` — application use cases for one bounded context, plus gaps.

```json
{
  "$schema": "ddd-domain-model/use-cases/v1",
  "$render_contract": "views/v1",
  "context_slug": "",
  "status": "proposed",
  "confidence": "low",
  "last_updated": "",
  "use_cases": [
    {
      "id": "uc-001",
      "name": "",
      "kind": "command",
      "description": "",
      "actor": null,
      "actor_status": "unknown",
      "trigger": {
        "type": "unknown",
        "ref": null,
        "source_integration_id": null
      },
      "preconditions": [],
      "target_aggregate": "",
      "commands_invoked": [],
      "queries_invoked": [],
      "outcomes": {
        "domain_events": [],
        "integrations": [],
        "failure_events": []
      },
      "postconditions": [],
      "invariants_enforced": [],
      "related_queries": [],
      "part_of_process": null,
      "scenarios": [],
      "gaps": [],
      "human_correction_needed": [],
      "status": "needs-review",
      "confidence": "low",
      "evidence": []
    }
  ],
  "gaps": [
    {
      "id": "gap-001",
      "gap_type": "unclear-actor",
      "severity": "",
      "related": {
        "context_slug": "",
        "use_case_id": null,
        "aggregate": null,
        "command": null,
        "query": null,
        "event": null,
        "entry_points": []
      },
      "candidate_hypotheses": [],
      "blocking": true,
      "status": "open",
      "confidence": "low",
      "evidence": []
    }
  ]
}
```

## Field notes

### `kind`

| Value | Meaning |
|-------|---------|
| `command` | Mutates aggregate state via one or more commands |
| `query` | Read-only; maps to `aggregates[].queries[]` |
| `reactive` | Started by inbound event or integration |

### `actor` / `actor_status`

Prefer explicit actors when inferred:

- `system:runjob`, `external:operator-ui`, `context:operations-console`, `external:vendor-sftp`

If unknown: `"actor": null`, `"actor_status": "unknown"`, add `unclear-actor` gap.
Do **not** invent `"user"` or `"system"` without evidence.

### `trigger.type`

`user-command` | `incoming-domain-event` | `incoming-integration` | `scheduled` | `internal-policy` | `unknown`

`ref` points at cron name, route, event name, or integration contract.

### `scenarios` (optional / extensible)

```json
{
  "id": "sc-001",
  "title": "Happy path",
  "given": [],
  "when": "",
  "then": []
}
```

### Coverage orphans

If a command/event/inbound has no use case, still add a `gaps[]` row (`orphan-*`). Optionally
add a stub use case with `status: needs-review` linked to that gap.

## Naming

Prefer ubiquitous-language verbs: `ProcessImportBatch`, `PublishNormalizedBatch`,
`GetWarehouseSalesDetails`.
