# integrations.template.json

`contexts/{slug}/integrations.json` — this context's inbound and outbound integrations.

```json
{
  "$schema": "ddd-domain-model/integrations/v1",
  "$render_contract": "views/v1",
  "context_slug": "",
  "status": "proposed",
  "confidence": "low",
  "last_updated": "",
  "inbound": [
    {
      "from_context_slug": "",
      "from_type": "bounded-context|external",
      "mechanism": "sync-http|grpc|async-job|db-replication|file-s3|catalog",
      "contract": "",
      "entry_points": [],
      "data_received": [],
      "status": "proposed",
      "confidence": "low",
      "evidence": []
    }
  ],
  "outbound": [
    {
      "to_context_slug": "",
      "mechanism": "",
      "contract": "",
      "exit_points": [],
      "data_sent": [],
      "target_data_stores": [],
      "status": "proposed",
      "confidence": "low",
      "evidence": []
    }
  ],
  "anti_corruption_layers": [
    {
      "name": "",
      "protects_from_context": "",
      "description": "",
      "code_anchors": [],
      "evidence": []
    }
  ]
}
```

## Inbound rules

**Inbound = cross-context or external actor only.** Never list the same context as its own inbound source.

| `from_type` | `from_context_slug` example | When |
|-------------|----------------------------|------|
| `bounded-context` | `master-data` | Another bounded context calls or writes into this one |
| `external` | `external:operator-ui` | Browser, CLI, vendor SFTP, third-party API |

Browser/JWT-authenticated UI is **external**, not a bounded context.

## data_stores_touched format

```json
{
  "logical_name": "primary_db",
  "host_pattern": "master-data-*-db",
  "function_or_table": "search_entities",
  "access": "read|write|read-write"
}
```

Populate from `trace_path` `data_flow` on dynamic DB routing params or SQL function names — not from reading env files.
