---
name: ddd-use-cases
description: >-
  Derives application use cases and cross-context processes from completed DDD
  domain-model JSON artifacts, highlighting gaps (unclear actors, triggers,
  orphan commands/events) for human correction. Use when the user asks for use
  cases, application flows, command/event mapping, process maps, scenarios, or
  use-case coverage after bounded contexts, aggregates, and events exist.
---

# DDD Use Cases (post domain-model)

Companion to [ddd-domain-model](../ddd-domain-model/SKILL.md). Runs **after** domain
model artifacts are mostly complete. Reads JSON under `{output_root}` first.
MCP is optional and **validation-only** — do not rediscover the domain.

## Role

You are a Domain-Driven Design (DDD) architect reconstructing **application use cases**
from an existing domain model, then relating them bidirectionally to aggregates,
domain events, and integrations.

## Inputs (from disk — do not ask the user to paste)

| Artifact | Path |
|----------|------|
| Manifest | `{output_root}/platform-manifest.json` |
| Context map | `{output_root}/context-map.json` |
| Glossary | `{output_root}/ubiquitous-language.json` |
| Bounded context | `{output_root}/contexts/{slug}/bounded-context.json` |
| Aggregates | `{output_root}/contexts/{slug}/aggregates.json` |
| Domain events | `{output_root}/contexts/{slug}/domain-events.json` |
| Integrations | `{output_root}/contexts/{slug}/integrations.json` |
| Sources | `{output_root}/contexts/{slug}/sources.json` |

Default `output_root`: `docs/domain-model/` (user may override).

**Portable end-to-end pipeline** (domain model → use cases → validation → views):
[workflow-playbook.md](workflow-playbook.md)

## Output layout

```
{output_root}/
├── process-map.json                 # cross-context flows (source of truth)
├── open-questions.md                # mirrors blocking gaps (narrative)
├── human/                           # human-writable — see ddd-apply-feedback skill
│   ├── review-queue.json            # generated ordered index
│   ├── review-board.md
│   ├── responses/
│   ├── ad-hoc/feedback.md
│   └── todos.json
├── refinement-log.json              # append phase 5-use-cases entries
├── contexts/{slug}/
│   └── use-cases.json               # per-context catalog + gaps[]
└── views/                           # generated — do not hand-edit use-case sections
    ├── process-map.md               # human process map
    ├── README.md                    # index (+ process map link)
    └── contexts/{slug}.md           # domain view + appended use cases
```

Copy templates from [artifacts/templates/](artifacts/templates/) on first use.
See [artifacts/README.md](artifacts/README.md) for schemas and gap taxonomy.

## Prerequisite gate

For each target context, require:

1. `bounded-context.json` exists
2. `aggregates.json` exists with ≥1 aggregate
3. At least one of `domain-events.json` or `integrations.json` exists
4. Prefer contexts with aggregate/`confidence` of `medium` or higher

If gate fails: record in `open-questions.md`, skip that context, do **not** invent use cases.

## High-level flow

```
Load model → Gate → Reconstruct (1 context) → Queries → Gaps → Process map → Validate → Refine
```

See [phases.md](phases.md) for checklists.

### Phase 0 — Load

1. Read `platform-manifest.json`, last 5 `refinement-log.json` entries, `open-questions.md`.
2. List context slugs; ask user which context(s) if unspecified.
3. Run prerequisite gate; report blocked contexts.

**Stop after:** selected context confirmed and gate results shown.

### Phase 1 — Reconstruct command / reactive use cases

For the selected context:

1. Walk `aggregates[].commands[]` → candidate command use cases.
2. Walk inbound `integrations[]` + consumed domain/integration events → reactive use cases.
3. Walk `domain-events[].events[]` → infer emitters; link `outcomes.domain_events`.
4. Name use cases with **ubiquitous language** (glossary terms / aggregate command names).
5. Fill `contexts/{slug}/use-cases.json` from template.
6. **Never invent a confident actor or trigger** — see Gap rules below.

**Stop after:** one context `use-cases.json` drafted + gap report.

### Phase 2 — Query use cases

Map `aggregates[].queries[]` to `kind: query` use cases. No domain events expected.
Still require `actor` / `trigger` or emit gaps.

### Phase 3 — Cross-context process map

1. Read `context-map.json` + all contexts' outbound integrations / `integration_events`.
2. Patch or create `process-map.json` with ordered steps linking `use_case_id`s.
3. Reconstruct each process `state_machine` from step order + events (see process-map template).
   Run `infer_process_state_machines.py` for baseline, then patch failure branches.
4. Orphan cross-context edges → `gap_type: cross-context-orphan`.

### Phase 4 — Validate + human views (mandatory)

```bash
python3 .cursor/skills/ddd-use-cases/scripts/validate_use_cases.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/render_use_case_views.py {output_root}
python3 .cursor/skills/ddd-apply-feedback/scripts/sync_human_review_queue.py {output_root}
```

Coverage orphans **must** become `gaps[]` entries — never silent omissions.

**Always regenerate views** after any change to `use-cases.json` or `process-map.json`:

| Output | Source |
|--------|--------|
| `views/contexts/{slug}.md` | Appends **Use cases** + **Use-case gaps** (marker-bounded) onto domain-model context view |
| `views/process-map.md` | Platform-level process map (tables + Mermaid **flowcharts** + **state machines**) |
| `views/README.md` | Index link to process map |

Aggregate lifecycle diagrams come from `ddd-domain-model` `render_domain_views.py`
(`aggregates[].state_machine`). Run both renderers when aggregates **and** process-map change:

```bash
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/render_use_case_views.py {output_root}
```

Do **not** hand-edit between `<!-- BEGIN ddd-use-cases:generated -->` markers.
If context MD is missing, run `render_domain_views.py` first, then this renderer.

### Phase 5 — Refine

On every subsequent message:

1. Patch surgically; preserve `uc-NNN` / `gap-NNN` / `proc-NNN` ids.
2. Append `refinement-log.json` with `"phase": "5-use-cases"`.
3. Resolve gaps when user answers; move open-questions to Resolved (`wont-fix` counts as resolved).
4. Re-run full validation gate (see [workflow-playbook.md](workflow-playbook.md#4-validation-gate-run-after-every-json-patch)).

## Core analysis task (per use case)

For each use case provide:

1. **Name** — ubiquitous language (e.g. `ProcessImportBatch`)
2. **Trigger** — user-command | incoming-domain-event | incoming-integration | scheduled | internal-policy | **unknown**
3. **Target Aggregate** — which aggregate's state is mutated (or read for queries)
4. **Expected Outcome** — domain event(s) and/or outbound integration(s); empty for queries

Also required fields: `id`, `kind`, `actor` (or `actor_status: unknown`), `commands_invoked` / `queries_invoked`, `outcomes`, bidirectional refs when known.

## Command vs use case

| Layer | Meaning |
|-------|---------|
| Aggregate **command** | Domain operation on one aggregate (`aggregates.json`) |
| **Use case** | Application scenario: actor + trigger + command(s)/query + outcomes |

May be 1:1, many:1, or 1:many. Prefer linking via `commands_invoked[]` rather than duplicating domain says-so.

## Gap rules (mandatory)

**Highlight gaps; do not fabricate certainty.**

When Name, Actor, Trigger, Target Aggregate, or Outcome cannot be clearly inferred:

1. Set use-case `status: needs-review` and `confidence: low`.
2. Use `null` + `actor_status: unknown` or `trigger.type: unknown` — never invent `"user"` / `"system"` without evidence.
3. Add a `gaps[]` entry with `gap_type`, `candidate_hypotheses`, `blocking`, `status: open`.
4. Link via `use_cases[].gaps: ["gap-NNN"]` (**string ids only** — full objects live in top-level `gaps[]`) and `human_correction_needed[]`.
5. Mirror **blocking** gaps into `{output_root}/open-questions.md`.

### Gap types

| `gap_type` | When |
|------------|------|
| `unclear-actor` | Entry point exists; initiator unknown |
| `unclear-trigger` | Mutation path exists; cron vs user vs event unclear |
| `orphan-command` | Aggregate command with no use case |
| `orphan-event` | Domain event with no emitting use case |
| `orphan-inbound` | Inbound integration with no reactive use case |
| `ambiguous-aggregate` | Multiple possible target aggregates |
| `missing-outcome` | Use case inferred; no event/integration found |
| `cross-context-orphan` | Outbound with no downstream use case |
| `naming-uncertain` | Behavior known; UL name is guesswork |

**Passive infrastructure** (replication, shared DB reads): document as `waits_for_integration` on
the process step, add `cross-context-orphan` gap with `status: wont-fix` — do not invent a fake use case.
See [workflow-playbook.md](workflow-playbook.md#process-gaps--wont-fix-pattern).

End every context pass with a **Gap report** and point the user to `human/review-board.md`
(ordered queue) and `human/ad-hoc/feedback.md` for items not auto-detected.

## Token / discovery budget

| Priority | Action |
|----------|--------|
| 1 | Read existing domain-model JSON |
| 2 | Infer use cases + gaps from those artifacts |
| 3 | Optional MCP: `trace_path` / `get_code_snippet` on uncertain `entry_points` only |
| 4 | Never re-run full domain-model discovery |

## Confidence and status

Same conventions as domain-model:

- `confidence`: `low` | `medium` | `high`
- `status` (artifacts / use cases): `proposed` | `needs-review` | `validated` | `deprecated`
- Gap `status`: `open` | `resolved` | `wont-fix`
- Field inference: `inferred` | `hypothesis` | `unknown` (via `actor_status` / trigger.type)

## When to ask the user

- Prerequisite gate failure (incomplete domain model).
- Blocking gaps (`unclear-actor`, `unclear-trigger`, `ambiguous-aggregate`).
- Strategic process boundaries (where a cross-context saga starts/ends).
- Confirm hypotheses before promoting `needs-review` → `validated`.

## Additional resources

- **End-to-end workflow:** [workflow-playbook.md](workflow-playbook.md)
- State machines: [artifacts/state-machine-schema.md](artifacts/state-machine-schema.md)
- Phases: [phases.md](phases.md)
- Templates: [artifacts/README.md](artifacts/README.md)
- Starter prompts: [starter-prompts.md](starter-prompts.md)
- Worked example: [examples.md](examples.md)
- Domain model skill: [ddd-domain-model](../ddd-domain-model/SKILL.md)
- Apply human feedback: [ddd-apply-feedback](../ddd-apply-feedback/SKILL.md)
- Continue domain model: [ddd-domain-model-continue](../ddd-domain-model-continue/SKILL.md)
