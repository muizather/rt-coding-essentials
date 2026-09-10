# Starter prompts

Always invoke the **ddd-use-cases** skill. Domain model must already exist under `output_root`.

See [workflow-playbook.md](workflow-playbook.md) for the full portable pipeline.

## Full platform (domain model + use cases)

```
Follow workflow-playbook.md end-to-end.

Output: docs/domain-model/
Repos: <list workon keys or paths>

Phase 0–3 ddd-domain-model for all prioritized contexts (one at a time).
Then ddd-use-cases for all contexts + process-map.json.
Run validation gate and regenerate all views.
Stop with consolidated gap report.
```

## Derive use cases for one context

```
Use the ddd-use-cases skill.

Output: docs/domain-model/
Context: analytics-etl

Prerequisite gate first. Then reconstruct use cases from aggregates, domain-events,
and integrations. Highlight gaps (unclear actor/trigger, orphans) for human correction.
Do not invent confident actors. Stop with gap report.
```

## All contexts

```
Use the ddd-use-cases skill.

Output: docs/domain-model/
Process all contexts sequentially. One use-cases.json per context.
Build process-map.json after contexts with medium confidence are done.
Run full validation gate (validate_use_cases, validate_state_machines, both renderers).
Consolidated gap report at the end.
```

## Resolve gaps

```
Use the ddd-use-cases skill.

Output: docs/domain-model/
Context: analytics-etl

Answers:
- gap-003: actor is system:runjob (scheduled cron process)
- gap-007: ProcessCatalogBatch emits ImportBatchLoaded

Patch use-cases.json, mark gaps resolved, update open-questions.md, re-validate.
```

## Process map only

```
Use the ddd-use-cases skill.

Output: docs/domain-model/
Phase 3 only: build process-map.json from context-map + existing use-cases.json files.
Run infer_process_state_machines.py, patch failure branches, validate_state_machines.py.
Record cross-context-orphan gaps where downstream use cases are missing (wont-fix for passive infra).
Regenerate views/process-map.md.
```

## Backfill state machine evidence

```
Use ddd-domain-model + ddd-use-cases skills.

Output: docs/domain-model/
Run backfill_state_machine_evidence.py then validate_state_machines.py.
Regenerate domain views for touched contexts.
```

## Analysis prompt (agent-facing)

System: You are a Domain-Driven Design (DDD) architect.

Inputs (read from disk under `{output_root}`; do not require paste):
- Bounded Contexts: `contexts/{slug}/bounded-context.json`
- Aggregates: `contexts/{slug}/aggregates.json`
- Domain Events: `contexts/{slug}/domain-events.json`
- Integrations: `contexts/{slug}/integrations.json`
- Ubiquitous Language: `ubiquitous-language.json`
- Context map: `context-map.json`

Task:
Analyze the relationships between the Aggregates and the Events. Reconstruct the logical
Use Cases for each Bounded Context.

For each Use Case, provide:
1. Name: (Using the Ubiquitous Language, e.g., "SubmitInvoice")
2. Trigger: (User Command, Incoming Event/Integration, Scheduled, or unknown)
3. Target Aggregate: (Which aggregate's state is mutated?)
4. Expected Outcome: (Which Domain Event or Integration is generated?)

Also: link `commands_invoked` / `queries_invoked`, set `kind`, and emit `gaps[]` whenever
Actor or Trigger cannot be clearly inferred — highlight for later human correction.
