# Use-case artifacts

Living documents under `{output_root}/`. **Patch, don't rewrite.** Every change gets a
`refinement-log.json` entry with `"phase": "5-use-cases"`.

Produced by [ddd-use-cases](../SKILL.md) after [ddd-domain-model](../../ddd-domain-model/SKILL.md)
artifacts exist.

## File catalog

| File | Scope | Template |
|------|-------|----------|
| `contexts/{slug}/use-cases.json` | Per-context use cases + gaps | [use-cases.template.md](templates/use-cases.template.md) |
| `process-map.json` | Cross-context processes | [process-map.template.md](templates/process-map.template.md) |
| `open-questions.md` | Human decisions (incl. blocking gaps) | (markdown) |
| `human/review-queue.json` | Ordered review index (generated) | [ddd-apply-feedback](../../ddd-apply-feedback/feedback-loop.md) |
| `human/todos.json` | Implementation backlog | [ddd-apply-feedback](../../ddd-apply-feedback/feedback-loop.md) |
| `refinement-log.json` | Shared with domain-model skill | domain-model template |

## Relationship to domain model

| Use-case field | Domain-model source |
|----------------|---------------------|
| `target_aggregate` | `aggregates[].name` |
| `commands_invoked[]` | `aggregates[].commands[].name` |
| `queries_invoked[]` | `aggregates[].queries[].name` |
| `outcomes.domain_events[]` | `domain-events.json` → `events[].name` |
| `outcomes.integrations[]` | `integrations.outbound` contracts / `integration_events` |
| `trigger.ref` / inbound | `integrations.inbound` or upstream event |
| `invariants_enforced[]` | `aggregates[].invariants[].rule` (text match / free text) |

Optional backfill (when user asks): add `triggered_by_use_cases[]` on domain events and
`fulfills_use_case` on aggregate commands. Prefer use-case → domain links first.

## Canonical evidence schema

Same as domain-model. Use `finding` not `finding_summary`; `target` not `query`.

```json
{
  "mcp_tool": "trace_path",
  "project": "<mcp-project-key>",
  "target": "<entry-point>",
  "finding": "one-line summary",
  "artifacts_informed": ["use-cases.json"],
  "confidence": "low|medium|high",
  "timestamp": "ISO-8601"
}
```

## Gap taxonomy

Every coverage orphan **must** appear in `gaps[]`. Do not leave silent holes.

| `gap_type` | Meaning |
|------------|---------|
| `unclear-actor` | Who initiates is unknown |
| `unclear-trigger` | Cron vs user vs inbound event unclear |
| `orphan-command` | Aggregate command with no use case |
| `orphan-event` | Domain event with no emitting use case |
| `orphan-inbound` | Inbound integration with no reactive use case |
| `ambiguous-aggregate` | Multiple aggregates could own mutation |
| `missing-outcome` | Use case has no event/integration outcome |
| `cross-context-orphan` | Outbound with no downstream use case |
| `naming-uncertain` | UL name is guesswork |

### Gap status

`open` | `resolved` | `wont-fix`

### Blocking

`blocking: true` when validation or process-map progression depends on the answer.
Mirror blocking open gaps into `open-questions.md`.

### Gap linking schema

| Location | Format |
|----------|--------|
| `use_cases[].gaps` | `["gap-001", "gap-002"]` — **ids only** |
| `use-cases.json` → `gaps[]` | Full gap objects with `id`, `gap_type`, `status`, … |
| `process-map.json` → `gaps[]` | Full gap objects for cross-context orphans |
| `processes[].gaps` | Open gap ids only; remove when `resolved` or `wont-fix` |

## Field conventions

| Field | Values |
|-------|--------|
| `kind` | `command` \| `query` \| `reactive` |
| `actor_status` | `inferred` \| `hypothesis` \| `unknown` |
| `trigger.type` | `user-command` \| `incoming-domain-event` \| `incoming-integration` \| `scheduled` \| `internal-policy` \| `unknown` |
| `confidence` | `low` \| `medium` \| `high` |
| `status` (use case) | `proposed` \| `needs-review` \| `validated` \| `deprecated` |

### Ids

- Use cases: `uc-NNN`
- Gaps: `gap-NNN`
- Processes: `proc-NNN`
- Process step order: integer starting at 1

## Validation + human views

```bash
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py docs/domain-model
python3 .cursor/skills/ddd-use-cases/scripts/validate_use_cases.py docs/domain-model
python3 .cursor/skills/ddd-use-cases/scripts/validate_use_cases.py docs/domain-model --strict
python3 .cursor/skills/ddd-use-cases/scripts/validate_use_cases.py docs/domain-model --context analytics-etl
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py docs/domain-model
python3 .cursor/skills/ddd-use-cases/scripts/backfill_state_machine_evidence.py docs/domain-model
python3 .cursor/skills/ddd-use-cases/scripts/infer_process_state_machines.py docs/domain-model  # optional rebuild
python3 .cursor/skills/ddd-use-cases/scripts/render_use_case_views.py docs/domain-model
```

State machine schema: [state-machine-schema.md](state-machine-schema.md)  
End-to-end workflow: [workflow-playbook.md](../workflow-playbook.md)

| Generated file | Content |
|----------------|---------|
| `views/contexts/{slug}.md` | Domain-model view + appended Use cases / Gaps (marker-bounded) |
| `views/process-map.md` | All processes: tables + Mermaid flowcharts |
| `views/README.md` | Index includes process map link |

Regenerate after every `use-cases.json` or `process-map.json` patch. Domain skeleton MDs still come from `ddd-domain-model/scripts/render_domain_views.py` — run that first when context views are missing.

## Conformance checklist

- [ ] `use-cases.json` has `$schema` and `context_slug`
- [ ] Every use case has `id`, `name`, `kind`, `status`, `confidence`
- [ ] Unknown actors/triggers use `unknown` + gaps — not fabricated labels
- [ ] Coverage orphans have matching `gaps[]` entries
- [ ] Blocking gaps listed in `open-questions.md`
- [ ] `process-map.json` steps reference existing `use_case_id`s when present
- [ ] Process `state_machine` present; `validate_state_machines.py` passes
- [ ] `use_cases[].gaps` are string ids (not inline objects)
- [ ] Refinement-log entry written for the pass
