# MCP playbook (DDD discovery)

**Server:** `codebase-memory-mcp` (or `user-codebase-memory-mcp` per your MCP config)

Always read the tool descriptor JSON before calling. Evidence pointers use the
[canonical schema](artifacts/README.md#canonical-evidence-schema).

## Missing MCP — install then retry

If tools for this server are unavailable, **stop modeling** and give the developer:

- Repo: [https://github.com/DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
- Install:

```bash
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash -s -- --ui
```

Ask them to restart Cursor / reload MCP, then resume Phase 0.

## Project resolution

```
list_projects → match root_path suffix to user repo path (e.g. .../api-gateway)
Typical key pattern: <workspace-hash>-<repo-slug>
```

Store resolved keys in `platform-manifest.json` → `repos[].mcp_project_key`. Never hardcode
workspace-specific keys in skills — resolve at Phase 0 per engagement.

## Tool catalog (all 14 tools)

| Tool | Cost tier | DDD use |
|------|-----------|---------|
| `list_projects` | low | Phase 0: map user repos → MCP project keys |
| `index_status` | low | Phase 0: check freshness before discovery |
| `index_repository` | high | Index or refresh repos; `cross-repo-intelligence` for CROSS_* edges |
| `get_architecture` | low | Phase 1: Leiden clusters → candidate bounded contexts |
| `get_graph_schema` | low | **Run before Cypher** — discover real node labels and edge types |
| `search_graph` | medium | Routes, functions, semantic concept discovery; paginate with `offset` |
| `query_graph` | medium | Custom Cypher: hubs, cross-repo edges, complexity signals |
| `trace_path` | medium | Callers/callees, data flow, cross-service integration paths |
| `get_code_snippet` | medium | Targeted validation of one function; use `include_neighbors` when needed |
| `search_code` | medium | Compact pattern search for SQL INSERT, connection strings |
| `detect_changes` | medium | Phase 4: scope re-model to changed repos/functions |
| `manage_adr` | low | Record boundary decisions; link ADR id from refinement-log `notes` |
| `ingest_traces` | situational | Validate integration paths from runtime/OpenTelemetry traces |
| `delete_project` | low | Cleanup only — not used during modeling |

## Indexing cost strategy

| Phase | Action |
|-------|--------|
| Phase 0 | `index_status`; re-index stale/missing **sequentially** (one repo at a time) |
| Phase 1 | `get_architecture` — no re-index unless status is stale |
| Phase 2 | `cross-repo-intelligence` once on anchor API repo; if 0 CROSS_* edges → fallback playbook |
| Phase 3 | `get_code_snippet` targeted; avoid wide `search_code` |
| Phase 4 | `detect_changes` on changed repos; `index_repository mode: fast` for single-repo refresh |

### Sequential indexing (mandatory)

- Call `index_repository` for **one** project, wait until it completes, then the next.
- **Never** fire multiple `index_repository` calls in parallel — concurrent indexing hangs developer machines.
- Lightweight tools (`index_status`, `list_projects`) may be batched; indexing must not.

```json
{
  "tool": "index_repository",
  "repo_path": "/path/to/anchor/api-gateway",
  "mode": "cross-repo-intelligence",
  "target_projects": ["*"]
}
```

Ensure per-repo indexes are fresh **before** cross-repo-intelligence (and run that call alone).

---

## Phase 1 — Discovery queries

### Architecture clusters

```json
{ "tool": "get_architecture", "project": "<key>" }
```

Extract: cluster labels, cohesion, `top_nodes`, package boundaries → candidate contexts.

### Graph schema (run first when using Cypher)

```json
{ "tool": "get_graph_schema", "project": "<key>" }
```

Use returned edge labels in `query_graph` — do not assume `CROSS_*` or `GRPC_CALLS` exist.

### API / route entry points

```json
{
  "tool": "search_graph",
  "project": "<key>",
  "label": "Route",
  "query": "<domain keyword>",
  "limit": 50
}
```

### Cross-repo integration edges (when cross-repo-intelligence ran)

```json
{
  "tool": "query_graph",
  "project": "<any indexed key>",
  "query": "MATCH (a)-[r:CROSS_HTTP_CALLS|CROSS_ASYNC_CALLS|CROSS_CHANNEL]->(b) RETURN a.name, type(r), b.name, a.file_path, b.file_path LIMIT 100"
}
```

If this returns 0 rows, switch to [Cross-repo fallback playbook](#cross-repo-fallback-playbook).

### Semantic concept discovery

```json
{
  "tool": "search_graph",
  "project": "<key>",
  "semantic_query": ["mapping", "failure", "batch"],
  "limit": 30
}
```

### Hub orchestrators (SQL-first or app-code repos)

```json
{
  "tool": "search_graph",
  "project": "<key>",
  "label": "Function",
  "min_degree": 5,
  "file_pattern": "database*",
  "limit": 30
}
```

---

## Phase 2 — Context map queries

### Outbound from a handler

```json
{
  "tool": "trace_path",
  "project": "<api-gateway-key>",
  "function_name": "searchCustomers",
  "direction": "outbound",
  "mode": "cross_service",
  "depth": 4
}
```

### Inbound callers (who depends on this?)

```json
{
  "tool": "trace_path",
  "project": "<key>",
  "function_name": "search_customers",
  "direction": "inbound",
  "depth": 3
}
```

### Data-flow for dynamic routing parameters

```json
{
  "tool": "trace_path",
  "project": "<key>",
  "function_name": "<handler>",
  "mode": "data_flow",
  "parameter_name": "DbName",
  "depth": 4
}
```

Replace `DbName` with whatever param carries DB/service routing in the target codebase.

### Filtered edge trace (when cross_service is noisy)

```json
{
  "tool": "trace_path",
  "project": "<key>",
  "function_name": "<handler>",
  "direction": "outbound",
  "mode": "calls",
  "edge_types": ["GRPC_CALLS"],
  "depth": 4
}
```

---

## Cross-repo fallback playbook

Use when `CROSS_HTTP_CALLS|CROSS_ASYNC_CALLS` return 0 (common on gRPC indirection or SQL-heavy platforms).

1. **`get_graph_schema`** on anchor API repo — note real edge types.
2. **`query_graph`** for intra-repo edges:

```cypher
MATCH (a)-[r:GRPC_CALLS|HTTP_CALLS|CALLS]->(b)
RETURN a.qualified_name, type(r), b.qualified_name
LIMIT 100
```

3. **`trace_path`** with `edge_types: ["GRPC_CALLS"]` on known HTTP/gRPC handlers.
4. **`trace_path`** `mode: data_flow` with `parameter_name` for dynamic DB/routing params.
5. **`search_code`** compact for client/connection patterns:

```json
{
  "tool": "search_code",
  "project": "<key>",
  "pattern": "grpc|Client|DbName|Connection",
  "mode": "compact",
  "limit": 10
}
```

6. **`get_code_snippet`** on qualified names from graph — not full file reads.

Chain traces across repos manually: handler in repo A → gRPC client → handler in repo B → SQL function.

---

## SQL-first repo branch

**Trigger when:** `get_architecture` shows dominant `database*` clusters, or SQL migration/scripts
outnumber application handlers for domain logic.

```
1. search_graph label=Function file_pattern=database*
2. search_code "INSERT INTO|ON CONFLICT" mode=compact limit=5
3. get_code_snippet on 2-3 pivot SQL functions only
4. Defer app-handler reads until routing indirection is unclear
```

### Hub functions (candidate aggregate orchestrators)

```cypher
MATCH (f:Function)<-[c:CALLS]-()
WITH f, count(c) AS callers
WHERE callers >= 5
RETURN f.qualified_name, callers, f.file_path
ORDER BY callers DESC
LIMIT 30
```

### Table / persistence hints

```json
{
  "tool": "search_code",
  "project": "<key>",
  "pattern": "INSERT INTO processing_failure",
  "mode": "compact",
  "limit": 5
}
```

Then `get_code_snippet` on the owning function only.

### Hot paths / complexity smell (optional — subdomain split hints)

```cypher
MATCH (f:Function)
WHERE f.transitive_loop_depth >= 2 OR f.linear_scan_in_loop >= 1
RETURN f.qualified_name, f.transitive_loop_depth, f.linear_scan_in_loop
ORDER BY f.transitive_loop_depth DESC
LIMIT 20
```

---

## Phase 4 — Refinement queries

### Detect impact of code changes

```json
{
  "tool": "detect_changes",
  "project": "<key>",
  "scope": "functions",
  "depth": 2,
  "since": "HEAD~5"
}
```

Re-model only affected contexts/aggregates.

### Record boundary decision (ADR)

```json
{
  "tool": "manage_adr",
  "project": "<anchor-key>",
  "mode": "update",
  "content": "## Decision\nKeep ingestion and analytics as separate bounded contexts.\n\n## Context\n..."
}
```

Reference ADR in `refinement-log.json` → `notes`.

### Runtime trace validation (optional)

```json
{ "tool": "ingest_traces", "project": "<key>", "...": "see tool descriptor" }
```

Use when staging/prod traces are available to confirm catalog → pipeline → publish paths.

---

## Index maintenance

```json
{ "tool": "index_status", "project": "<key>" }
```

```json
{
  "tool": "index_repository",
  "repo_path": "/path/to/repo",
  "mode": "moderate",
  "persistence": false
}
```

```json
{
  "tool": "index_repository",
  "repo_path": "/path/to/repo",
  "mode": "fast",
  "persistence": false
}
```

Use `fast` for single-repo refresh during Phase 4 refinement.

---

## Evidence pointer format (sources.json)

Top-level key is `sources[]`. Each entry uses canonical fields:

```json
{
  "id": "src-003",
  "mcp_tool": "trace_path",
  "project": "<mcp-project-key>",
  "target": "searchCustomers",
  "mode": "cross_service",
  "finding": "Calls master-data primary_db search_customers; analytics-worker warehouse_db get_sales_details",
  "artifacts_informed": ["context-map.json", "contexts/operations-console/integrations.json"],
  "confidence": "high",
  "timestamp": "2026-07-07T16:30:00Z"
}
```

## Fallback ladder (token saving)

1. `get_graph_schema` then `search_graph` / `query_graph` / `trace_path`
2. `get_code_snippet` with `qualified_name` from graph
3. `search_code` compact, low limit
4. `Read` single file, narrow offset/limit
5. Do not grep entire monorepo

---

## Proposed MCP tools (for codebase-memory-mcp owner)

Generic enhancements to reduce token cost on SQL-heavy and multi-repo platforms. Not implemented
in this skill repo — document intent for MCP maintainers.

| Priority | Tool | Purpose |
|----------|------|---------|
| Must-have | `list_db_objects` / `get_sql_schema` | Tables, PKs, FKs, `ON CONFLICT` → aggregates without full snippet reads |
| Must-have | `resolve_dynamic_call` | Handler + routing param → resolved SQL/function across repos |
| Must-have | `cross_project_trace` | Single-call multi-repo trace (replaces manual per-repo chains) |
| High | `suggest_aggregates` | Hub score + business-key signals → top-N candidates with evidence pointers |
| High | `extract_enum_values` | Status/failure codes from SQL CASE / lookup tables |
| High | `list_jobs` | Cron/batch entry points → domain events + boundaries |
| Nice | `validate_domain_model` | Lint JSON against templates; orphan glossary terms |
| Nice | `term_candidates` | BM25 over table/job/route names → proposed glossary entries |
