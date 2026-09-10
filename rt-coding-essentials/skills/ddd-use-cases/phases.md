# DDD Use Cases — Phases

Companion checklists for [SKILL.md](SKILL.md). One context per turn unless the user says "all contexts".

## Phase 0 — Load + gate

- [ ] Read `platform-manifest.json`, last 5 refinement-log entries, `open-questions.md`
- [ ] Resolve `output_root` (default `docs/domain-model/`)
- [ ] List `contexts/*/` slugs; confirm target with user if ambiguous
- [ ] Prerequisite gate per target context:
  - [ ] `bounded-context.json`
  - [ ] `aggregates.json` with ≥1 aggregate
  - [ ] `domain-events.json` and/or `integrations.json`
- [ ] Copy `use-cases.template` / `process-map.template` if files missing
- [ ] Stop with gate report before inventing use cases

## Phase 1 — Command + reactive use cases

- [ ] Index all `aggregates[].commands[]` (name, entry_points, aggregate)
- [ ] Index all `domain-events.events[]` (`emitted_by_aggregate`, triggers)
- [ ] Index `integrations.inbound[]` and event consumers
- [ ] Draft `kind: command` use cases linking `commands_invoked` + `target_aggregate`
- [ ] Draft `kind: reactive` use cases for inbound integrations / consumed events
- [ ] Fill `outcomes.domain_events` / `outcomes.integrations` / `failure_events` when known
- [ ] Name from ubiquitous language / glossary; else `naming-uncertain` gap
- [ ] Unknown actor → `actor: null`, `actor_status: unknown`, `gap_type: unclear-actor`
- [ ] Unknown trigger → `trigger.type: unknown`, `gap_type: unclear-trigger`
- [ ] Assign stable ids `uc-001+`, `gap-001+`
- [ ] Append refinement-log (`phase: 5-use-cases`)
- [ ] Stop with delta + gap report; ask which gaps to resolve

## Phase 2 — Query use cases

- [ ] Map each `aggregates[].queries[]` to `kind: query`
- [ ] `commands_invoked: []`, `outcomes.domain_events: []`
- [ ] Still require actor/trigger or emit gaps
- [ ] Link via `queries_invoked[]`

## Phase 3 — Process map

- [ ] Read `context-map.json` relationships
- [ ] Chain use cases across contexts via integration events / outbound integrations
- [ ] Create/update `process-map.json` with `proc-NNN` ids and ordered `steps[]`
- [ ] Run `infer_process_state_machines.py` for baseline; patch failure branches manually
- [ ] Add/update each process `state_machine` (states from steps/events; transitions with use_case_id)
- [ ] Passive infra edges → `waits_for_integration` + `wont-fix` gap (not fake use cases)
- [ ] Set `part_of_process` on participating use cases
- [ ] Missing downstream consumer → `cross-context-orphan` gap
- [ ] Append refinement-log

## Phase 4 — Validate + human views

```bash
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/validate_use_cases.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/render_use_case_views.py {output_root}
```

- [ ] Every aggregate command referenced by ≥1 use case **or** `orphan-command` gap
- [ ] Every domain event emitted by ≥1 use case outcome **or** `orphan-event` gap
- [ ] Every inbound integration starts ≥1 reactive use case **or** `orphan-inbound` gap
- [ ] Every `target_aggregate` / `commands_invoked` / event name resolves
- [ ] `use_cases[].gaps` are string ids; full gap objects in top-level `gaps[]`
- [ ] Blocking open gaps mirrored in `open-questions.md`
- [ ] `validate_state_machines.py` → OK (run `backfill_state_machine_evidence.py` if evidence warnings)
- [ ] `--strict` fails on unknown actors/triggers and blocking gaps (expected until gaps resolved)
- [ ] `views/process-map.md` regenerated (flowcharts + process state machines)
- [ ] Each touched context has Use cases section in `views/contexts/{slug}.md`

## Phase 5 — Refine / continue

- [ ] User answers gap → patch use case; set gap `status: resolved`
- [ ] Promote `needs-review` → `validated` only with evidence or human confirmation
- [ ] Move resolved items out of `open-questions.md`
- [ ] Preserve ids; deprecate rather than delete
- [ ] Re-run validate; delta summary

## Batch — "all contexts"

Process sequentially. One refinement-log entry per context (preferred) or one batched entry.
Still emit one consolidated gap report at the end.

Order suggestion: upstream contexts first (ingestion → catalog → processing → console/ACL last).
Include supporting/infra contexts; mark passive process edges `wont-fix`.
