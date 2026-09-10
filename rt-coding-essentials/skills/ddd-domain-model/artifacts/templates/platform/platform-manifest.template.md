# platform-manifest.template.json

Platform-wide index. Update in Phase 0–1; patch as repos or entry points are discovered.

```json
{
  "$schema": "ddd-domain-model/platform-manifest/v1",
  "platform_name": "",
  "description": "",
  "status": "proposed",
  "confidence": "low",
  "last_updated": "",
  "output_root": "",
  "repos": [
    {
      "name": "",
      "path": "",
      "mcp_project_key": "",
      "role": "",
      "repo_kind": "core|supporting|config|infra",
      "index_status": "unknown|indexed|stale|missing",
      "last_indexed": "",
      "primary_languages": [],
      "notes": ""
    }
  ],
  "mcp": {
    "server": "user-codebase-memory-mcp",
    "cross_repo_indexed": false,
    "last_index_check": ""
  },
  "candidate_bounded_contexts": [
    {
      "slug": "",
      "name": "",
      "repos": [],
      "cluster_hints": [],
      "confidence": "low",
      "status": "proposed",
      "priority": 1
    }
  ],
  "entry_points": [
    {
      "type": "http_route|grpc|cron|cli",
      "name": "",
      "context_slug": "",
      "project": "",
      "qualified_name": "",
      "description": "",
      "evidence": []
    }
  ],
  "architecture_clusters": [
    {
      "project": "",
      "cluster_label": "",
      "cohesion": null,
      "top_nodes": [],
      "mapped_context_slug": null
    }
  ]
}
```

## Capture guidance

| Field | Source (MCP-first) |
|-------|-------------------|
| `mcp_project_key` | `list_projects` |
| `index_status`, `last_indexed` | `index_status` |
| `repo_kind` | User scope + role: `core` = owns bounded context; `supporting` = shared lib; `config` = deployment config; `infra` = IaC/ops |
| `candidate_bounded_contexts` | `get_architecture` clusters + user scope |
| `entry_points.context_slug` | Map route/handler to owning context after Phase 2 |
| `entry_points` | `search_graph` label=Route |
| `architecture_clusters` | `get_architecture` |

## repo_kind examples

| Kind | Typical repos |
|------|---------------|
| `core` | API gateway, master-data service, analytics worker |
| `supporting` | Shared client library, proto definitions |
| `config` | Job/pipeline YAML, upload definitions |
| `infra` | Terraform, deployment manifests |

Supporting repos inform integrations but may not map 1:1 to a bounded context.
