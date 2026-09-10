# domain-event.template.json

`contexts/{slug}/domain-events.json` — inferred events (mark tentative until validated).

```json
{
  "$schema": "ddd-domain-model/domain-events/v1",
  "$render_contract": "views/v1",
  "context_slug": "",
  "status": "proposed",
  "confidence": "low",
  "last_updated": "",
  "events": [
    {
      "name": "",
      "past_tense": "",
      "description": "",
      "emitted_by_aggregate": "",
      "inference": "explicit|inferred-from-job|inferred-from-table-write",
      "transport_known": false,
      "triggers": [],
      "payload": [
        {
          "field": "",
          "type": "",
          "description": ""
        }
      ],
      "consumers": [
        {
          "context_slug": "",
          "mechanism": "sync|async|replication|none-known",
          "notes": ""
        }
      ],
      "status": "proposed",
      "confidence": "low",
      "evidence": []
    }
  ],
  "integration_events": [
    {
      "name": "",
      "description": "",
      "source_context": "",
      "target_context": "",
      "transport": "",
      "inference": "explicit|inferred-from-job|inferred-from-table-write",
      "transport_known": false,
      "evidence": []
    }
  ]
}
```

## inference field

| Value | When to use |
|-------|-------------|
| `explicit` | Named event type, message bus, or domain event class in code |
| `inferred-from-job` | Cron/batch job completion implies the event |
| `inferred-from-table-write` | INSERT/UPDATE pattern implies the event; no explicit publisher |

Set `transport_known: false` when mechanism is guessed. Keeps confidence honest.

## Naming

Prefer business past tense: `CustomerRegistered`, `ImportBatchPublished`, `ProcessingFailed`.

If only batch/cron exists with no explicit event type, set `inference: inferred-from-job` and
`status: proposed`.
