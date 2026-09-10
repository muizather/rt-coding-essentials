# Examples

## Example 1 — Phase 0 gate

**User:** Derive use cases for analytics-etl at docs/domain-model/.

**Agent:**
1. Reads `platform-manifest.json` + last refinement-log entries
2. Checks `contexts/analytics-etl/` for aggregates + events/integrations
3. Stops with:

```
Phase 0 complete.
- Gate OK: analytics-etl (aggregates=4, events present, integrations present)
- Next: Phase 1 reconstruct use cases; MCP only if actor/trigger ambiguous
```

---

## Example 2 — Use case with unknown actor (gap highlighted)

Inferred from `ImportBatch.commands[ProcessCatalogBatch]` and event `ImportBatchLoaded`,
but initiator not clear beyond `runjob process`:

```json
{
  "id": "uc-001",
  "name": "ProcessImportBatch",
  "kind": "command",
  "description": "Load catalog archive into etl staging and mark batch processed.",
  "actor": null,
  "actor_status": "unknown",
  "trigger": {
        "type": "unknown",
        "ref": "runjob process",
        "source_integration_id": null
      },
  "target_aggregate": "ImportBatch",
  "commands_invoked": ["ProcessCatalogBatch"],
  "queries_invoked": [],
  "outcomes": {
    "domain_events": ["ImportBatchLoaded"],
    "integrations": [],
    "failure_events": ["ProcessingFailed"]
  },
  "gaps": ["gap-001", "gap-002"],
  "human_correction_needed": [
    "Confirm actor: system:runjob vs operator-triggered via operations-console?",
    "Confirm trigger type: scheduled cron vs user-command"
  ],
  "status": "needs-review",
  "confidence": "low",
  "evidence": []
}
```

Corresponding gaps:

```json
{
  "id": "gap-001",
  "gap_type": "unclear-actor",
  "severity": "ProcessCatalogBatch entry_points include runjob process; no authenticated user found.",
  "related": {
    "context_slug": "analytics-etl",
    "use_case_id": "uc-001",
    "aggregate": "ImportBatch",
    "command": "ProcessCatalogBatch",
    "query": null,
    "event": null,
    "entry_points": ["runjob process", "jobs.process.Job.run"]
  },
  "candidate_hypotheses": [
    "system:runjob (scheduled)",
    "external:operator-ui via operations-console"
  ],
  "blocking": true,
  "status": "open",
  "confidence": "low",
  "evidence": []
}
```

```json
{
  "id": "gap-002",
  "gap_type": "unclear-trigger",
  "severity": "Entry point looks like cron but could be manually invoked via RunJob API.",
  "related": {
    "context_slug": "analytics-etl",
    "use_case_id": "uc-001",
    "aggregate": "ImportBatch",
    "command": "ProcessCatalogBatch",
    "entry_points": ["runjob process"]
  },
  "candidate_hypotheses": [
    "scheduled (cron:runjob process)",
    "user-command (MarsService/RunJob)"
  ],
  "blocking": true,
  "status": "open",
  "confidence": "low",
  "evidence": []
}
```

**Gap report (end of turn):**

```
## Use-case gaps — analytics-etl
- [gap-001] unclear-actor on ProcessImportBatch (blocking) — choose: system:runjob | operator-ui
- [gap-002] unclear-trigger on ProcessImportBatch (blocking) — choose: scheduled | user-command
- [gap-004] orphan-event WarehouseSalesProcessed (no emitter use case yet)
```

Use `trigger.type: unknown` until confirmed; put scheduled/operator guesses only in
`candidate_hypotheses` on the gap.

---

## Example 3 — After human correction

**User:** gap-001 actor is system:runjob (scheduled).

**Agent patches:**

- `actor`: `"system:runjob"`, `actor_status`: `"inferred"`
- `trigger.type`: `"scheduled"`, `ref`: `"cron:runjob process"`
- gap-001 `status`: `"resolved"`
- use case `status`: `"proposed"`, `confidence`: `"medium"`
- open-questions: move to Resolved
- Re-run `validate_use_cases.py`

---

## Example 4 — Process map snippet

```json
{
  "id": "proc-catalog-to-warehouse",
  "name": "CatalogToWarehousePipeline",
  "description": "Catalog item available → ETL process/publish → warehouse sales queryable.",
  "contexts_involved": ["data-catalog", "analytics-etl"],
  "steps": [
    {
      "order": 1,
      "context_slug": "data-catalog",
      "use_case_id": "uc-003",
      "produces_event": "CatalogItemPublished",
      "triggered_by_event": null,
      "waits_for_integration": null,
      "notes": ""
    },
    {
      "order": 2,
      "context_slug": "analytics-etl",
      "use_case_id": "uc-001",
      "produces_event": "ImportBatchLoaded",
      "triggered_by_event": "CatalogItemPublished",
      "waits_for_integration": "inbound:catalog-s3",
      "notes": "Poll/pull rather than push in current implementation"
    }
  ],
  "gaps": [],
  "status": "proposed",
  "confidence": "low",
  "evidence": []
}
```

---

## Example 5 — Validate script

```bash
python3 .cursor/skills/ddd-use-cases/scripts/validate_use_cases.py docs/domain-model --context analytics-etl
```

Expected when orphans lack gaps:

```
ERROR: analytics-etl: orphan command ImportBatch::ProcessCatalogBatch with no orphan-command gap
FAIL: 1 error(s), 0 warning(s)
```
