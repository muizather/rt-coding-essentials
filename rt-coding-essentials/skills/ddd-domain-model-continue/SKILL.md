---
name: ddd-domain-model-continue
description: >-
  Resume or refine an in-progress cross-repo DDD domain model built with
  codebase-memory-mcp. Use when the user says continue, refine, update, or extend
  an existing domain model, context map, or bounded context artifacts. Reads
  existing JSON under output_root first; MCP-first for new discoveries; patch only.
disable-model-invocation: true
---

# DDD Domain Model — Continue / Refine

Companion to [ddd-domain-model](../ddd-domain-model/SKILL.md). Load the main skill for full phase definitions.

## Before anything else

1. Read `{output_root}/platform-manifest.json` and `refinement-log.json` (last 5 entries).
2. Read `open-questions.md` if present.
3. Identify active phase from last log entry; do not restart from Phase 0 unless user asks.

## Refinement rules

- **Patch** affected JSON files; preserve ids and history.
- **Append** refinement-log; never silent edits.
- **MCP first:** `get_graph_schema`, then `search_graph`, `trace_path`, `query_graph` before code.
- **One slice per turn:** e.g. one context, one flow, or one relationship — unless user requests more.
- **Conformance:** before closing the turn, verify patches against [conformance checklist](../ddd-domain-model/artifacts/README.md#template-conformance-checklist).
- **Views:** after patching renderable JSON, run `render_domain_views.py` on `{output_root}`.
- **Review queue:** run `sync_human_review_queue.py` after each discovery pass.
- **State machines:** after `state_machine` patches, run `backfill_state_machine_evidence.py` and `validate_state_machines.py` (see [workflow-playbook](../ddd-use-cases/workflow-playbook.md)).
- End with **delta summary**: files touched, confidence changes, open questions.

## User says "continue" with no detail

1. Pick highest-priority context with `status: proposed` in manifest.
2. Run Phase 3 deep-dive for that context only.
3. Ask what to tackle next.

## Batch exception — user says "all contexts"

Process contexts **sequentially** (one MCP discovery pass per context). Choose one logging style:

- **Per context:** one refinement-log entry per context (`artifacts_touched` scoped to that folder), or
- **Batched:** single entry with `artifacts_touched` listing all context folders touched.

Do not skip conformance checklist per context. Still end with one consolidated delta summary.

## User gives new scope (e.g. new repo)

1. Update manifest repos + `list_projects` / `index_status`.
2. If re-index is needed: run `index_repository` **one repo at a time** (never parallel); then
   re-run cross-repo-intelligence alone if integrations may change; use fallback playbook if CROSS_* empty.
3. Patch context-map and affected contexts only.
4. If MCP is unavailable: halt and follow install instructions in [ddd-domain-model](../ddd-domain-model/SKILL.md#if-the-mcp-server-is-missing).

## Resources

- Templates: [artifacts/README.md](../ddd-domain-model/artifacts/README.md)
- MCP queries: [mcp-playbook.md](../ddd-domain-model/mcp-playbook.md)
- Prompts: [starter-prompts.md](../ddd-domain-model/starter-prompts.md)
- Use cases (when model is ready): [ddd-use-cases](../ddd-use-cases/SKILL.md)
- End-to-end workflow: [workflow-playbook.md](../ddd-use-cases/workflow-playbook.md)
- Apply human feedback: [ddd-apply-feedback](../ddd-apply-feedback/SKILL.md)
