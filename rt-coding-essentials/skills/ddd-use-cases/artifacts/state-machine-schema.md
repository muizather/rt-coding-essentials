# State machine schema (shared)

Used by:

- **Aggregate lifecycle** — `contexts/{slug}/aggregates.json` → `aggregates[].state_machine`
- **Process orchestration** — `process-map.json` → `processes[].state_machine`

Rendered as Mermaid `stateDiagram-v2` in `views/contexts/{slug}.md` and `views/process-map.md`.

## Inference values

| `inference` | When |
|-------------|------|
| `explicit` | Named enum/status in code or explicit state class |
| `inferred-from-status-column` | `status` / `processed` column maps to states |
| `inferred-from-table-write` | INSERT/UPDATE pattern implies transition |
| `inferred-from-job` | Cron/batch job drives transitions |
| `inferred-from-invariant` | Documented invariant describes allowed transition |
| `inferred-from-command` | Command maps 1:1 to transition (no separate status column) |
| `inferred-from-orchestration` | ACL/console orchestration; no local persistence |
| `inferred-from-steps` | **Process only** — rebuilt from `steps[]` + events |
| `unknown` | Lifecycle suspected but evidence insufficient |

## Aggregate discovery protocol (`ddd-domain-model`)

1. **Signals** (in order): `state_field` column → status VO → setter SQL → command → domain event.
2. **States**: one id per distinct value or lifecycle stage; include `initial_state`.
3. **Transitions**: link `command` to `aggregates[].commands[].name` when known.
4. **Events**: `emits_event` must exist in `domain-events.json` for that context (or null).
5. **Confidence**: `high` only with code/SQL evidence; `medium`/`high` **must** have `evidence[]`.
6. **Skip** `state_machine` entirely if aggregate is read-model-only with no mutable lifecycle.
7. **No self-loops** without a documented `guard` (idempotency).
8. **Evidence backfill** (repeatable on any platform):

```bash
python3 .cursor/skills/ddd-use-cases/scripts/backfill_state_machine_evidence.py {output_root}
```

Copies from `aggregate_root.evidence`, transition `commands[].evidence`, and `invariants[].evidence`.
Run after discovery or when validator warns `medium confidence but no evidence[]`.

## Process discovery protocol (`ddd-use-cases`)

1. Build `steps[]` first (use cases + events).
2. Derive `state_machine` from steps:
   - One orchestration state per major milestone (often aligned to `produces_event`).
   - `states[].step_order` links to `steps[].order` when applicable.
   - Branching: alternate transitions for failure events (e.g. `SaleProcessingFailed`).
3. Run `scripts/infer_process_state_machines.py` to rebuild from steps, then patch manually for branches.
4. `transitions[].use_case_id` must resolve in that context's `use-cases.json`.
5. Set `inference: inferred-from-steps` unless human-validated → then `explicit`.

## Validation

```bash
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/backfill_state_machine_evidence.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/infer_process_state_machines.py {output_root}
```

Full pipeline: [workflow-playbook.md](../workflow-playbook.md).
