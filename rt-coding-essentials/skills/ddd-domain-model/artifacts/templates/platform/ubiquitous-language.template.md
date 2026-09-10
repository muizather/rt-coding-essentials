# ubiquitous-language.template.json

Glossary across contexts. Merge on every deep-dive; dedupe by canonical `term`.

```json
{
  "$schema": "ddd-domain-model/ubiquitous-language/v1",
  "$render_contract": "views/v1",
  "platform_name": "",
  "status": "proposed",
  "confidence": "low",
  "last_updated": "",
  "terms": [
    {
      "term": "",
      "definition": "",
      "context_slugs": [],
      "aliases": [],
      "legacy_names": [],
      "type": "entity|value-object|process|policy|event|external-system",
      "status": "proposed",
      "confidence": "low",
      "evidence": [
        {
          "mcp_tool": "search_graph|search_code",
          "project": "",
          "target": "",
          "finding": ""
        }
      ],
      "related_terms": [],
      "notes": ""
    }
  ]
}
```

## Rules

- Prefer **business language** over table prefixes (`vendor_*`, `etl2.*` → note under `legacy_names`).
- **Always populate `legacy_names`** when code uses prefixed table, schema, or package names.
- Same spelling, different meaning → separate entries with disambiguating `context_slugs`.
- Use `context_slugs` (not `contexts`) for term scope.
- `status: validated` only after user confirmation or strong MCP + code invariant proof.
