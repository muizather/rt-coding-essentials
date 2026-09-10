# Starter prompts

Copy, fill in, and send to the agent. Always invoke the **ddd-domain-model** skill.

## New platform model

```
Use the ddd-domain-model skill.

Platform: retail-analytics-platform
Repos: api-gateway, master-data, analytics-worker, pipeline-config, infra
Focus: entity mapping, ETL pipeline, operations console
Output: docs/domain-model/

Phase 0 only: map repos to MCP projects, verify indexes, create artifact skeleton.
Stop and show me candidate bounded contexts before deep-diving.
```

## Continue / refine

```
Use the ddd-domain-model skill.

Continue domain model at docs/domain-model/
Read existing artifacts first; do not regenerate from scratch.

New focus: trace GET /api/customers/search from api-gateway and update context map + integrations for operations-console and master-data contexts.

MCP only unless blocked. Patch artifacts and append refinement-log.
```

## Deep-dive one context

```
Use the ddd-domain-model skill.

Deep-dive context: analytics-etl (slug: analytics-etl)
Output: docs/domain-model/

Populate aggregates, domain-events, integrations for analytics-worker ETL processing.
One context only; stop with delta summary.
```

## Cross-repo context map only

```
Use the ddd-domain-model skill.

Platform: retail-analytics-platform
Repos: api-gateway, master-data, analytics-worker, message-catalog
Phase 2 only: build context-map.json from MCP cross_service traces.
Do not read source files. Update refinement-log.
```

## Cross-repo discovery when CROSS_* empty

```
Use the ddd-domain-model skill.

Platform: retail-analytics-platform
Repos: api-gateway, master-data, analytics-worker

Phase 2: cross-repo-intelligence returned 0 CROSS_* edges.
Run get_graph_schema on api-gateway, then GRPC_CALLS/CALLS fallback playbook.
Build context-map.json from trace_path chains. MCP only.
```

## SQL-first aggregate pass

```
Use the ddd-domain-model skill.

Deep-dive context: master-data
Output: docs/domain-model/

This repo is SQL-first: domain logic in database/scripts.
Use search_graph label=Function file_pattern=database* and search_code INSERT INTO|ON CONFLICT.
Populate aggregates with identifiers + attributes from SQL. One context only.
```

## After code changes

```
Use the ddd-domain-model skill.

Branch: feature/customer-merge
Run detect_changes on master-data and analytics-worker.
Update affected aggregates and integrations in docs/domain-model/.
```

## Boundary decision (ADR)

```
Use the ddd-domain-model skill.

Continue at docs/domain-model/
Decision: keep file-ingestion and analytics-etl as separate contexts.
Record via manage_adr on api-gateway project; link in refinement-log.
Patch context-map if needed.
```
