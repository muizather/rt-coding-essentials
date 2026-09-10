---
name: ddd-domain-model
description: >-
  Iteratively build and refine DDD domain model artifacts across multiple repos
  using codebase-memory-mcp as the primary discovery source. Use when the user
  asks for a domain model, bounded contexts, context map, ubiquitous language,
  aggregates, or cross-repo platform modeling from code. Minimize direct code
  reads; prefer MCP graph search, trace, and architecture tools.
---

# DDD Domain Model (cross-repo, MCP-first)

Build domain model artifacts **incrementally**. Never produce one monolithic dump.
After every MCP discovery pass, update the smallest set of affected artifacts and
log what changed.

## MCP server

**Server:** `codebase-memory-mcp` (or `user-codebase-memory-mcp` per your MCP config)

Read tool schemas under the MCP descriptors folder before calling. Core tools:
`list_projects`, `index_status`, `index_repository`, `get_architecture`, `get_graph_schema`,
`search_graph`, `trace_path`, `query_graph`, `get_code_snippet`, `search_code`,
`detect_changes`, `manage_adr`.

See [mcp-playbook.md](mcp-playbook.md) for full 14-tool catalog, cross-repo fallback, and SQL-first branch.

### If the MCP server is missing

**Halt immediately** — do not invent a domain model from filesystem reads alone.

Tell the developer how to install:

1. Docs / project: [https://github.com/DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
2. One-liner install (recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash -s -- --ui
```

After install, ask them to restart Cursor (or reload MCP servers), then retry Phase 0.

## Output layout

User may override `output_root`. Default:

```
{output_root}/
├── platform-manifest.json
├── context-map.json
├── ubiquitous-language.json
├── refinement-log.json
├── open-questions.md
├── human/                          # human-writable — see ddd-apply-feedback skill
│   ├── review-queue.json           # generated index (rq-NNN)
│   ├── review-board.md             # generated reading order
│   ├── responses/                  # human answers
│   ├── ad-hoc/feedback.md          # non-queue corrections
│   └── todos.json                  # implementation backlog
├── contexts/
│   └── {context-slug}/
│       ├── bounded-context.json
│       ├── aggregates.json
│       ├── domain-events.json
│       ├── integrations.json
│       └── sources.json
└── views/                          # generated — render_domain_views.py
    ├── README.md
    ├── context-map.md
    ├── glossary.md
    └── contexts/{slug}.md
```

Renderable JSON must include `"$render_contract": "views/v1"` (see [render-contract](render-contract/v1/CONTRACT.md)).

Copy templates from [artifacts/templates/](artifacts/templates/) on first use.
See [artifacts/README.md](artifacts/README.md) for canonical evidence schema, field naming, and conformance checklist.

## User initialization prompt

Collect (ask if missing):

| Input | Example |
|-------|---------|
| Platform name | `retail-analytics-platform` |
| Repo paths or workon keys | `api-gateway`, `master-data`, `analytics-worker` |
| Scope focus (optional) | `entity mapping`, `ETL`, `operations console` |
| `output_root` (optional) | `docs/domain-model/` |
| Index mode | `use existing` or `re-index` |

Resolve each repo → MCP `project` key via `list_projects` (match `root_path` suffix).

## High-level flow

```
Initialize → Discover → Map contexts → Context map → Deep-dive contexts → Refine (loop)
     │            │            │              │                │              │
     ▼            ▼            ▼              ▼                ▼              ▼
 manifest    architecture   candidates    integrations    aggregates     log + patch
```

### Phase 0 — Initialize

1. Confirm MCP tools are available. If not → follow [If the MCP server is missing](#if-the-mcp-server-is-missing) and stop.
2. `list_projects` — map user repos to project keys; note `nodes`/`edges` counts.
3. `index_status` per project — if stale/missing, re-index.
4. **Sequential indexing (mandatory):** call `index_repository` **one repo at a time**.
   Wait for each call to finish before starting the next. **Never** index multiple repos in
   parallel — concurrent indexing hangs developer machines.
5. For multi-repo scope: only after **all** per-repo indexes are fresh, run **one**
   `index_repository` with `mode: cross-repo-intelligence` and `target_projects: ["*"]`.
6. Create `output_root` skeleton from templates; seed `platform-manifest.json` and empty
   `refinement-log.json`.
7. Tell the user which projects are indexed and the active phase.

**Stop after:** manifest exists, projects mapped, skeleton on disk.

### Phase 1 — Discover (platform scan)

Per project (batch MCP calls; no code reads unless MCP returns nothing):

1. `get_graph_schema` once per anchor repo — note available edge labels.
2. `get_architecture` — record clusters, top packages, dependency hints.
3. `search_graph` with `label: Route` and scope keywords — HTTP/API entry points.
4. `query_graph` — cross-repo edges if cross-repo-intelligence was run:

```cypher
MATCH (a)-[r:CROSS_HTTP_CALLS|CROSS_ASYNC_CALLS]->(b)
RETURN a.qualified_name, type(r), b.qualified_name
LIMIT 200
```

5. Patch `platform-manifest.json` (`repos`, `entry_points`, `clusters`).
6. Append `refinement-log.json` entry; propose **candidate bounded contexts** (names only).

**Stop after:** candidate context list + manifest patch. Ask user to confirm/prioritize contexts.

### Phase 2 — Context map

For each candidate context and cross-repo edge:

1. If Phase 1 Cypher returned 0 CROSS_* rows → follow [cross-repo fallback playbook](mcp-playbook.md#cross-repo-fallback-playbook).
2. `trace_path` with `mode: cross_service`, `direction: both`, `depth: 3` on key routes/handlers.
3. `search_graph` `semantic_query` for integration vocabulary: `["replication","catalog","grpc","batch"]`.
4. Fill `context-map.json` — relationship type (customer/supplier, shared kernel, ACL, conformist),
   integration mechanism, upstream/downstream direction, optional `rel-NNN` ids.
5. Update `refinement-log.json`; add `open-questions.md` items for ambiguous boundaries.
6. Run Phase 2 items from [conformance checklist](artifacts/README.md#template-conformance-checklist).

**Stop after:** context map draft with confidence levels. Do not deep-dive all contexts yet.

### Phase 3 — Bounded context deep-dive (one context at a time)

User picks a context (or highest-priority candidate). Create `contexts/{slug}/`.

**SQL-first branch** — use when `get_architecture` shows dominant `database*` clusters or SQL
scripts carry most domain logic. Follow [SQL-first repo branch](mcp-playbook.md#sql-first-repo-branch).

Otherwise (app-code-first):

1. `search_graph` — `query` + `file_pattern` scoped to context repos; labels `Function`, `Class`, `Route`.
2. `trace_path` `mode: data_flow` on 2–3 pivotal functions (parameters: ids, batch, pipeline).
3. `query_graph` for hub nodes (high in-degree) — candidate aggregate roots / anti-patterns.
4. Fill per-context files from [bounded-context templates](artifacts/templates/bounded-context/).
5. Discover **aggregate `state_machine`** (mandatory when lifecycle signals exist):
   - Follow signal order in [state-machine-schema.md](../ddd-use-cases/artifacts/state-machine-schema.md)
   - Link transitions to `commands[].name` and `emits_event` to `domain-events.json`
   - ACL/console contexts: `inference: inferred-from-orchestration`, `confidence: low`
   - Omit `state_machine` for read-model-only aggregates
   - After discovery, backfill evidence for `medium`/`high` confidence:
     ```bash
     python3 .cursor/skills/ddd-use-cases/scripts/backfill_state_machine_evidence.py {output_root}
     python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py {output_root}
     ```
6. Merge terms into `ubiquitous-language.json` with `context_slugs` and `legacy_names` where applicable.
7. **Code read only when:** MCP returns no match, `get_code_snippet` insufficient, or verifying
   an invariant/SQL rule. Prefer `get_code_snippet` over opening files; use `search_code` with
   `mode: compact` and low `limit` before full file reads.
8. Run Phase 3 items from [conformance checklist](artifacts/README.md#template-conformance-checklist).

**Stop after:** one context folder is populated. Summarize findings; ask whether to continue next context.

### Phase 4 — Continuous refinement (always on)

On **every** subsequent user message or new finding:

1. Identify affected artifacts (context map? one context? glossary term?).
2. Patch JSON surgically — do not regenerate entire files.
3. Append `refinement-log.json` with canonical `evidence[]` and `{ "phase", "action", "artifacts_touched" }`.
4. Bump `confidence` / `status` fields; move resolved items out of `open-questions.md`.
5. If discovery contradicts prior model, add `supersedes` note in refinement log.
6. Use `detect_changes` when user is modeling a moving branch — record impact on contexts.
7. Use `manage_adr` for boundary decisions; reference ADR in refinement-log `notes`.
8. After patching renderable JSON, regenerate human views:

```bash
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py {output_root}
python3 .cursor/skills/ddd-apply-feedback/scripts/sync_human_review_queue.py {output_root}
```

See [render-contract/v1/CONTRACT.md](render-contract/v1/CONTRACT.md) for frozen vs extensible fields.
Aggregate/process state machine rules: [state-machine-schema.md](../ddd-use-cases/artifacts/state-machine-schema.md).

## Token budget rules

| Priority | Action |
|----------|--------|
| 1 | `get_graph_schema`, then `search_graph`, `query_graph`, `trace_path` |
| 2 | `get_architecture`, `get_code_snippet` |
| 3 | `search_code` compact, `limit: 10` |
| 4 | Read single file, narrow line range |
| 5 | Never read whole repos or run unfocused grep |

Store **indexed evidence** in `sources.json` (`sources[]` with `src-NNN` ids) using the
[canonical evidence schema](artifacts/README.md#canonical-evidence-schema).

## Confidence and status fields

Use across all JSON artifacts:

- `confidence`: `low` | `medium` | `high`
- `status`: `proposed` | `validated` | `deprecated`
- `last_updated`: ISO-8601 date
- `evidence`: array of MCP pointers (canonical schema)

## When to ask the user

- Ambiguous context boundary (two clusters both own the same term).
- Strategic classification (core vs supporting) — propose default, ask to confirm.
- Missing repo not in index.
- Contradictory cross-repo flow.

## After the domain model

When bounded contexts, aggregates, and events are mostly complete, derive application
use cases with [ddd-use-cases](../ddd-use-cases/SKILL.md). That skill reads these JSON
artifacts, links commands/events to use cases, builds a process map, and **highlights
gaps** (unclear actors/triggers, orphans) for human correction.

**Portable end-to-end pipeline:** [workflow-playbook.md](../ddd-use-cases/workflow-playbook.md)
(covers validation gate, state machines, views, gap resolution, human feedback loop, and context archetypes).

**Human feedback:** after discovery, humans review `views/` and answer in `{output_root}/human/`.
Apply answers with [ddd-apply-feedback](../ddd-apply-feedback/SKILL.md). See [feedback-loop.md](../ddd-apply-feedback/feedback-loop.md).

## Additional resources

- MCP query patterns: [mcp-playbook.md](mcp-playbook.md)
- Phase checklists: [phases.md](phases.md)
- Artifact templates and refinement protocol: [artifacts/README.md](artifacts/README.md)
- Starter user prompts: [starter-prompts.md](starter-prompts.md)
- Worked examples: [examples.md](examples.md)
- Resume/refine sessions: [ddd-domain-model-continue](../ddd-domain-model-continue/SKILL.md)
- Use cases (post-model): [ddd-use-cases](../ddd-use-cases/SKILL.md)
- **End-to-end workflow:** [workflow-playbook.md](../ddd-use-cases/workflow-playbook.md)
- Human feedback loop: [ddd-apply-feedback](../ddd-apply-feedback/SKILL.md), [feedback-loop.md](../ddd-apply-feedback/feedback-loop.md)
- State machines (shared): [state-machine-schema.md](../ddd-use-cases/artifacts/state-machine-schema.md)
