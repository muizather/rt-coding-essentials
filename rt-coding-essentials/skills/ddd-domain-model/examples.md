# Examples

## Example 1 — Phase 0 output (agent delta summary)

**User:** Initialize platform for api-gateway, master-data, analytics-worker.

**Agent actions:**
1. `list_projects` → maps 3 keys
2. `index_status` → all indexed
3. Creates `docs/domain-model/platform-manifest.json` + skeleton
4. **Stops** with:

```
Phase 0 complete.
- Indexed: api-gateway (2045 nodes), master-data (6656), analytics-worker (3236)
- Candidates: shared-reference-data, analytics-etl, operations-console
- Next: confirm contexts or run Phase 2 context map
```

No aggregates yet. No 50-page writeup.

---

## Example 2 — Iterative refinement

**Pass 1:** Context map proposes `api-gateway → master-data` as customer-supplier (confidence: low).

**Pass 2:** User asks to trace customer search.

**Agent:**
- `trace_path` searchCustomers cross_service
- Patches `context-map.json` relationship confidence → medium
- Adds `integrations.json` outbound on operations-console
- Appends refinement-log entry `0007`
- Shows delta: 2 files touched, 1 relationship upgraded

---

## Example 3 — Good sources.json (canonical schema)

```json
{
  "$schema": "ddd-domain-model/sources/v1",
  "context_slug": "master-data",
  "last_updated": "2026-07-07",
  "sources": [
    {
      "id": "src-003",
      "mcp_tool": "trace_path",
      "project": "<mcp-project-key>",
      "target": "searchCustomers",
      "mode": "cross_service",
      "finding": "Calls primary_db search_customers; analytics_db get_sales_details",
      "artifacts_informed": ["context-map.json", "contexts/operations-console/integrations.json"],
      "confidence": "high",
      "timestamp": "2026-07-07T16:30:00Z"
    }
  ]
}
```

No application source pasted into the artifact.

---

## Example 4 — Bad sources.json (anti-pattern)

```json
{
  "context_slug": "master-data",
  "evidence": [
    {
      "mcp_tool": "search_graph",
      "project": "<mcp-project-key>",
      "query": "customer territory mapping",
      "finding": "146 hits"
    }
  ]
}
```

**Problems:** top-level `evidence` instead of `sources[]`; missing `id`; uses `query` instead of `target`.

---

## Example 5 — Ubiquitous language merge

Discovery finds `vendor_item_map`, `category_item_map`, `item_map`.

**Agent adds one term:**

```json
{
  "term": "Item mapping",
  "definition": "Association between vendor item identity and canonical platform item",
  "legacy_names": ["vendor_item_map", "category_item_map", "item_map"],
  "context_slugs": ["shared-reference-data", "analytics-etl"],
  "status": "proposed",
  "confidence": "medium"
}
```

---

## Example 6 — Identifiers vs attributes (aggregate)

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
      "attributes": ["street", "city", "state", "zip"]
    }
  ]
}
```

**Anti-pattern:** putting `street`, `city`, `zip` under `identifiers` — those are attributes, not identity keys.

---

## Anti-patterns (do not)

- Single message dumping all contexts, all aggregates, full glossary
- Reading entire `database/migrations` directory
- Grep across all repos before trying `search_graph`
- Regenerating JSON files instead of patching
- **Self-referencing inbound integration** — `operations-console` listing itself as inbound; use `external:operator-ui` with `from_type: external`
- **Running Cypher without `get_graph_schema` first** — leads to empty results and wasted token loops
- **Top-level `evidence` in sources.json** — use `sources[]` with `src-NNN` ids

---

## Example 7 — get_graph_schema before Cypher

**Bad:** Run `MATCH (a)-[r:CROSS_HTTP_CALLS]->(b)` → 0 rows → repeat with variations.

**Good:**
1. `get_graph_schema` on api-gateway → discovers `GRPC_CALLS`, `HTTP_CALLS` but no `CROSS_*`
2. Switch to [cross-repo fallback playbook](mcp-playbook.md#cross-repo-fallback-playbook)
3. `trace_path` with `edge_types: ["GRPC_CALLS"]` on known handlers
