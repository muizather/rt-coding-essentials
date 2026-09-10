# sources.template.json

`contexts/{slug}/sources.json` — **indexed** MCP evidence per context. **No source code bodies.**

**Top-level key is `sources[]`, not `evidence`.** See [README.md](../../README.md) for canonical evidence schema.

```json
{
  "$schema": "ddd-domain-model/sources/v1",
  "$render_contract": "views/v1",
  "context_slug": "",
  "last_updated": "",
  "sources": [
    {
      "id": "src-001",
      "mcp_tool": "search_graph|trace_path|query_graph|get_architecture|get_code_snippet|search_code|detect_changes",
      "project": "",
      "target": "",
      "mode": "",
      "finding": "",
      "artifacts_informed": [],
      "confidence": "low",
      "timestamp": ""
    }
  ]
}
```

## Purpose

- Lets future passes re-run the same MCP query instead of re-reading code.
- Links model claims to graph evidence for review.
- Keeps artifact JSON small.

## id convention

`src-NNN` monotonic per context file.

## Field notes

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | `src-NNN` |
| `target` | yes | Function name, route, or query string — not `query` or `query_or_target` |
| `finding` | yes | One-line summary — not `finding_summary` |
| `mode` | when applicable | e.g. `cross_service`, `data_flow` for `trace_path` |
| `artifacts_informed` | recommended | Which files this source updated |
