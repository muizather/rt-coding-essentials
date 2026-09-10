# DDD modeling phases (checklists)

Copy the active phase checklist into the conversation and tick items as you go.
Conformance rules: [artifacts/README.md](artifacts/README.md#template-conformance-checklist).

## Phase 0 — Initialize

```
- [ ] MCP server available (else halt + install instructions)
- [ ] list_projects → repo ↔ project key map
- [ ] index_status for each project
- [ ] Re-index stale/missing repos **sequentially** (one index_repository at a time; never parallel)
- [ ] cross-repo-intelligence once, only after all per-repo indexes are fresh
- [ ] output_root skeleton from templates
- [ ] platform-manifest.json seeded (repos with repo_kind, index_status, last_indexed)
- [ ] refinement-log.json created (empty entries array)
- [ ] User confirmed project list and scope
```

## Phase 1 — Discover

```
- [ ] get_graph_schema on anchor repo (note edge labels)
- [ ] get_architecture per repo
- [ ] search_graph: Routes + scope keywords
- [ ] query_graph: cross-repo edges (if available); note if 0 → plan fallback
- [ ] platform-manifest.json updated (clusters, entry_points with context_slug when known)
- [ ] Candidate bounded contexts listed (names + repos + confidence)
- [ ] refinement-log entry appended (canonical evidence with finding)
- [ ] Paused for user context prioritization
```

## Phase 2 — Context map

```
- [ ] If CROSS_* empty: cross-repo fallback playbook (mcp-playbook.md)
- [ ] trace_path cross_service on top entry points
- [ ] Relationships typed (customer/supplier/shared-kernel/ACL/conformist)
- [ ] upstream_slug / downstream_slug documented; optional rel-NNN id assigned
- [ ] Integration mechanisms documented (HTTP, gRPC, replication, batch, shared DB)
- [ ] context-map.json drafted; inline evidence uses canonical field names
- [ ] Regenerate `views/context-map.md` via render script
- [ ] open-questions.md for boundary disputes
- [ ] refinement-log entry appended
```

## Phase 3 — Context deep-dive (repeat per context)

```
- [ ] SQL-first branch if database* cluster dominant (mcp-playbook.md)
- [ ] contexts/{slug}/ directory created
- [ ] search_graph scoped to context
- [ ] trace_path data_flow on pivotal flows
- [ ] query_graph hub / complexity signals
- [ ] bounded-context.json filled (read_models[] if ACL/query context)
- [ ] aggregates.json filled (attributes when columns known)
- [ ] `state_machine` on aggregates with status/lifecycle signals (or explicit open question why omitted)
- [ ] State machines use canonical `inference` enum (see state-machine-schema.md)
- [ ] No self-loop transitions without `guard`; `initial_state` / `terminal_states` ∈ `states[].id`
- [ ] `backfill_state_machine_evidence.py` run when confidence is medium/high
- [ ] `validate_state_machines.py` passes for this context
- [ ] domain-events.json filled (inference field when not explicit)
- [ ] integrations.json filled (inbound: other context or external:* only)
- [ ] sources.json uses sources[] with src-NNN ids (not top-level evidence)
- [ ] ubiquitous-language.json merged (context_slugs, legacy_names)
- [ ] refinement-log entry appended
- [ ] Conformance checklist Phase 3 items verified
- [ ] Regenerate `views/` via `render_domain_views.py`
- [ ] User briefed; next context agreed
```

## Phase 4 — Refinement (continuous)

```
- [ ] New finding mapped to artifact(s)
- [ ] Surgical JSON patch (not full rewrite)
- [ ] refinement-log entry with canonical evidence (finding on every entry)
- [ ] Confidence/status updated
- [ ] open-questions updated
- [ ] Regenerate `views/` when renderable JSON changed
- [ ] `validate_state_machines.py` after aggregate state_machine patches
- [ ] detect_changes when branch is moving
- [ ] manage_adr for boundary decisions (optional; link in refinement-log notes)
- [ ] User shown delta summary (what changed, what's uncertain)
```

## Exit criteria (per engagement slice)

A slice is "done enough" when:

- Every candidate context has `status` ≥ `proposed` in context map.
- At least one context has `aggregates` with `confidence: medium` or higher.
- All `high` impact integrations have evidence pointers.
- Aggregate state machines pass `validate_state_machines.py` (evidence backfilled for medium/high).
- `open-questions.md` only contains items that need human domain input.
- Generated artifacts pass Phase 3 conformance checklist.

**Next:** hand off to [ddd-use-cases workflow](../ddd-use-cases/workflow-playbook.md) for use cases and process map.
