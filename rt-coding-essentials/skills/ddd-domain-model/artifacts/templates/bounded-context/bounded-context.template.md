# bounded-context.template.json

One file per context under `contexts/{slug}/bounded-context.json`.

```json
{
  "$schema": "ddd-domain-model/bounded-context/v1",
  "$render_contract": "views/v1",
  "slug": "",
  "name": "",
  "description": "",
  "type": "core|supporting|generic",
  "status": "proposed",
  "confidence": "low",
  "last_updated": "",
  "repos": [],
  "mcp_project_keys": [],
  "responsibilities": [],
  "out_of_scope": [],
  "ubiquitous_language_refs": [],
  "aliases": {
    "code_prefixes": [],
    "db_schemas": [],
    "deployment_hosts": []
  },
  "boundaries": {
    "deployment_units": [],
    "data_stores": [],
    "public_interfaces": []
  },
  "read_models": [
    {
      "name": "",
      "description": "",
      "entry_points": [],
      "source_contexts": [],
      "notes": ""
    }
  ],
  "policies": [
    {
      "name": "",
      "description": "",
      "status": "proposed",
      "confidence": "low",
      "evidence": []
    }
  ],
  "open_questions": []
}
```

## responsibilities (examples)

- Owns canonical customer master data
- Publishes reference dimensions to analytics tier
- Resolves mapping failures submitted from operations console

## read_models

Use for query/ACL-heavy contexts (e.g. operations console) that expose aggregated views across
other contexts rather than owning classic aggregate roots. Optional — omit array when not applicable.

## boundaries.data_stores

Use logical names from MCP traces (`primary_db`, `analytics_db`, `warehouse_db`) not connection strings.
