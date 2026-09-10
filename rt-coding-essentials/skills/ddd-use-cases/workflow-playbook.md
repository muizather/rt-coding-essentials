# End-to-end workflow playbook (portable)

Repeatable pipeline for modeling **any multi-repo platform** with
[ddd-domain-model](../ddd-domain-model/SKILL.md) then [ddd-use-cases](SKILL.md).

Set `{output_root}` once (default `docs/domain-model/`). All paths below are relative to it.

## Overview

```
Phase 0–4  ddd-domain-model     → contexts, aggregates, events, integrations, aggregate state machines
Phase 0–5  ddd-use-cases        → use cases, process map, process state machines, gaps
Gate       validation scripts   → structural checks before views
Views      both renderers        → human-readable MD + Mermaid
Loop       gap resolution       → human answers → ddd-apply-feedback → patch → re-validate
Human      human/ directory     → review-board, responses, ad-hoc, todos
```

**Source of truth:** JSON under `{output_root}/`. Never hand-edit `views/` except outside marker blocks.

## 1. Initialize (once per platform)

| Step | Skill | Output |
|------|-------|--------|
| Map repos → MCP project keys | domain-model Phase 0 | `platform-manifest.json` |
| Index / cross-repo intelligence | domain-model Phase 0 | fresh graph |
| Copy templates | both | skeleton dirs |
| Seed refinement log | domain-model | `refinement-log.json` |

Stop and confirm **candidate bounded contexts** with the user before deep-dives.

## 2. Domain model (per context)

Work **one context at a time** unless user says "all contexts".

1. Context map relationships (`context-map.json`) — Phase 2
2. Deep-dive folder `contexts/{slug}/` — Phase 3:
   - `bounded-context.json`, `aggregates.json`, `domain-events.json`, `integrations.json`, `sources.json`
   - **Aggregate `state_machine`** when lifecycle signals exist ([state-machine-schema](artifacts/state-machine-schema.md))
3. Append `refinement-log.json`; update `open-questions.md` for boundary disputes
4. Regenerate domain views:

```bash
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py {output_root}
```

### Aggregate state machine rules

| Signal | Action |
|--------|--------|
| `status` / `processed` column | `state_field` + discrete states |
| Status value object (A/R, pending/approved) | States from VO |
| Setter SQL / INSERT-only aggregate | `inferred-from-table-write` or `inferred-from-command` |
| Console/ACL, no local persistence | `inferred-from-orchestration`, `confidence: low` |
| Read-model only | **Omit** `state_machine` |

After adding machines, run evidence backfill for `medium`/`high` confidence:

```bash
python3 .cursor/skills/ddd-use-cases/scripts/backfill_state_machine_evidence.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py {output_root}
```

## 3. Use cases (after domain model is "done enough")

**Gate:** each target context needs `bounded-context.json`, `aggregates.json` (≥1), and
`domain-events.json` and/or `integrations.json`.

Per context (or batch "all contexts" sequentially):

1. **Phase 1–2:** `contexts/{slug}/use-cases.json`
   - Commands → `kind: command`; inbound integrations/events → `kind: reactive`; queries → `kind: query`
   - **Never fabricate** actor/trigger — emit gaps (see gap rules in SKILL.md)
2. **Phase 3:** `process-map.json`
   - Chain cross-context steps via integration events
   - `infer_process_state_machines.py` for baseline process `state_machine`, then patch failure branches
3. Append `refinement-log.json` (`phase: 5-use-cases`)

### Gap schema (critical for validators)

```json
{
  "use_cases": [
    { "id": "uc-003", "gaps": ["gap-001", "gap-002"] }
  ],
  "gaps": [
    { "id": "gap-001", "gap_type": "unclear-actor", "blocking": true, "status": "open" }
  ]
}
```

- `use_cases[].gaps` = **string ids only** (not inline gap objects)
- Full gap objects live in top-level `gaps[]` (per-context) or `process-map.json` → `gaps[]`
- Mirror **blocking** open gaps into `open-questions.md`

### Process gaps — `wont-fix` pattern

When a cross-context edge is **passive infrastructure** (replication, shared DB read, config already applied):

1. Keep `waits_for_integration` on the process step (do not invent a fake use case)
2. Add `cross-context-orphan` gap with `status: wont-fix` and hypotheses documented
3. Remove gap id from `processes[].gaps[]` when resolved as wont-fix
4. Record in `open-questions.md` → Resolved

## 4. Validation gate (run after every JSON patch)

```bash
# Domain model views (if aggregates/context map changed)
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py {output_root}

# Use cases + state machines
python3 .cursor/skills/ddd-use-cases/scripts/validate_use_cases.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py {output_root}

# Strict mode before declaring "merge-ready" (expected to fail while gaps are open)
python3 .cursor/skills/ddd-use-cases/scripts/validate_use_cases.py {output_root} --strict

# Human views (use cases + process map sections)
python3 .cursor/skills/ddd-use-cases/scripts/render_use_case_views.py {output_root}
python3 .cursor/skills/ddd-apply-feedback/scripts/sync_human_review_queue.py {output_root}
```

| Script | Fails on | Warnings OK |
|--------|----------|-------------|
| `validate_use_cases.py` | orphan refs, missing gap for unknown actor/trigger | blocking open gaps |
| `validate_state_machines.py` | invalid state ids, broken use_case_id on process transitions | command/event not in aggregate |
| `--strict` | any open blocking gap | — |

## 5. Human feedback loop

After validation, sync the review queue:

```bash
python3 .cursor/skills/ddd-apply-feedback/scripts/sync_human_review_queue.py {output_root}
```

| Human reads | Human writes | Agent skill |
|-------------|--------------|-------------|
| `views/`, `human/review-board.md` | `human/responses/rq-*.md` | — |
| anything missing from queue | `human/ad-hoc/feedback.md` | — |
| `human/todos.json` | new todos, ticket refs | [ddd-apply-feedback](../ddd-apply-feedback/SKILL.md) |

**Order:** answer boundary items first (they block context-level gaps). `unclear-actor` before `unclear-trigger` for the same use case.

`open-questions.md` remains a narrative mirror; `human/review-queue.json` is the structured source for ordering and dependencies.

## 6. Context archetypes (portable patterns)

| Archetype | Examples | State machine | Use-case notes |
|-----------|----------|---------------|----------------|
| **Core domain** | ETL, rebate, catalog | Status columns, job-driven | Cron vs operator gaps common |
| **ACL / console** | operations-console | `inferred-from-orchestration`, low confidence | Actor often `external:operator`; state owned upstream |
| **Supporting / infra** | platform-infrastructure | One-time setup jobs | May not appear as process steps; use `wont-fix` |
| **Shared reference** | master data | Command-driven CRUD | Reactive to console integrations |

## 7. Exit criteria (platform slice)

- [ ] All prioritized contexts have Phase 3 artifacts + `use-cases.json`
- [ ] `process-map.json` covers main cross-context sagas
- [ ] `validate_state_machines.py` → OK (0 errors)
- [ ] `validate_use_cases.py` → OK (warnings for open gaps acceptable)
- [ ] Views regenerated; `open-questions.md` lists only human-blocked items
- [ ] `refinement-log.json` documents each pass

## 8. Common pitfalls (from practice)

| Pitfall | Fix |
|---------|-----|
| Self-loop transition without guard | Use `absent → recorded` or document idempotency in `guard` |
| `inferred-from-actions` (non-canonical) | Use enum from [state-machine-schema](artifacts/state-machine-schema.md) |
| Inline gap objects on use cases | Use string ids + top-level `gaps[]` |
| Hand-editing `views/process-map.md` | Patch JSON; run renderers |
| Skipping infra/supporting context | Still derive use cases; mark passive edges `wont-fix` |
| `medium`/`high` state_machine without `evidence[]` | Run `backfill_state_machine_evidence.py` |

## 9. Quick reference — script locations

| Script | Skill folder |
|--------|----------------|
| `render_domain_views.py` | `ddd-domain-model/scripts/` |
| `validate_use_cases.py` | `ddd-use-cases/scripts/` |
| `validate_state_machines.py` | `ddd-use-cases/scripts/` |
| `infer_process_state_machines.py` | `ddd-use-cases/scripts/` |
| `backfill_state_machine_evidence.py` | `ddd-use-cases/scripts/` |
| `render_use_case_views.py` | `ddd-use-cases/scripts/` |
| `sync_human_review_queue.py` | `ddd-apply-feedback/scripts/` |
