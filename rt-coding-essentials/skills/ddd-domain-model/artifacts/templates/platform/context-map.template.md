# context-map.template.json

Strategic relationships between bounded contexts. Refine in Phase 2+.

```json
{
  "$schema": "ddd-domain-model/context-map/v1",
  "$render_contract": "views/v1",
  "platform_name": "",
  "status": "proposed",
  "confidence": "low",
  "last_updated": "",
  "contexts": [
    {
      "slug": "",
      "name": "",
      "type": "core|supporting|generic",
      "status": "proposed",
      "confidence": "low",
      "repos": [],
      "description": ""
    }
  ],
  "relationships": [
    {
      "id": "rel-001",
      "upstream_slug": "",
      "downstream_slug": "",
      "pattern": "customer-supplier|shared-kernel|anticorruption-layer|conformist|open-host-service|partnership",
      "integration": {
        "mechanism": "sync-http|grpc|async-job|db-replication|shared-db|file-s3|message-catalog",
        "direction": "upstream-to-downstream",
        "contracts": [],
        "data_stores_touched": []
      },
      "description": "",
      "validation_status": "one-way-traced|both-directions-traced",
      "status": "proposed",
      "confidence": "low",
      "evidence": [
        {
          "mcp_tool": "trace_path|query_graph|search_graph",
          "project": "",
          "target": "",
          "finding": ""
        }
      ]
    }
  ],
  "shared_kernels": [
    {
      "name": "",
      "context_slugs": [],
      "shared_artifacts": ["tables", "packages", "proto"],
      "notes": ""
    }
  ]
}
```

## Upstream / downstream semantics

- **Upstream** supplies data or capabilities; **downstream** consumes or adapts them.
- `upstream_slug` → `downstream_slug` with `direction: upstream-to-downstream`.
- Example: `master-data` (upstream) supplies reference data to `analytics-etl` (downstream).

## Relationship id

Optional but recommended: `rel-NNN` for stable references in refinement-log and user discussion.

## validation_status

| Value | Meaning |
|-------|---------|
| `one-way-traced` | Only outbound or inbound trace completed |
| `both-directions-traced` | Both sides of integration confirmed |

## Pattern hints (from code signals)

| Signal | Likely pattern |
|--------|----------------|
| Downstream adapts upstream types heavily | ACL |
| Downstream consumes upstream API as-is | Conformist |
| Shared tables replicated both ways | Shared kernel (verify ownership) |
| Upstream publishes, downstream subscribes | Customer-supplier / OHS |
| Same team, tight cycle | Partnership (rare) |
