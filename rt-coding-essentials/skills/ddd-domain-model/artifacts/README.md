# Domain model artifacts

Living documents under `{output_root}/`. **Patch, don't rewrite.** Every change gets a
`refinement-log.json` entry.

## File catalog

| File | Scope | Template |
|------|-------|----------|
| `platform-manifest.json` | Whole platform | [platform-manifest.template.md](templates/platform/platform-manifest.template.md) |
| `context-map.json` | Context relationships | [context-map.template.md](templates/platform/context-map.template.md) |
| `ubiquitous-language.json` | Shared glossary | [ubiquitous-language.template.md](templates/platform/ubiquitous-language.template.md) |
| `refinement-log.json` | Change audit trail | [refinement-log.template.md](templates/platform/refinement-log.template.md) |
| `contexts/{slug}/bounded-context.json` | One context | [bounded-context.template.md](templates/bounded-context/bounded-context.template.md) |
| `contexts/{slug}/aggregates.json` | Aggregates in context | [aggregate.template.md](templates/bounded-context/aggregate.template.md) |
| `contexts/{slug}/domain-events.json` | Events | [domain-event.template.md](templates/bounded-context/domain-event.template.md) |
| `contexts/{slug}/integrations.json` | Inbound/outbound | [integrations.template.md](templates/bounded-context/integrations.template.md) |
| `contexts/{slug}/sources.json` | MCP evidence index | [sources.template.md](templates/bounded-context/sources.template.md) |
| `views/` | Human-readable diagrams (generated) | [render-contract/v1/CONTRACT.md](../render-contract/v1/CONTRACT.md) |
| `human/` | Human feedback, todos (human-writable) | [ddd-apply-feedback](../../ddd-apply-feedback/feedback-loop.md) |
| `contexts/{slug}/use-cases.json` | Use cases + gaps (ddd-use-cases skill) | [ddd-use-cases templates](../../ddd-use-cases/artifacts/README.md) |
| `process-map.json` | Cross-context processes (ddd-use-cases) | [ddd-use-cases templates](../../ddd-use-cases/artifacts/README.md) |

## Human views (`views/`)

JSON artifacts are the **source of truth**. Markdown + Mermaid under `{output_root}/views/` are
**generated projections** for humans. Do not hand-edit `views/` — regenerate after JSON patches.

```bash
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py docs/domain-model
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py docs/domain-model
python3 .cursor/skills/ddd-use-cases/scripts/backfill_state_machine_evidence.py docs/domain-model
```

Bulk conformance migration (when templates change): `scripts/migrate_domain_model_conformance.py` — adapt or extend for your platform.

State machine rules and scripts: [state-machine-schema.md](../../ddd-use-cases/artifacts/state-machine-schema.md),
[end-to-end workflow](../../ddd-use-cases/workflow-playbook.md).

### Render contract (`views/v1`)

Renderable JSON files include `"$render_contract": "views/v1"`. **Frozen** field paths are defined in
[render-contract/v1/manifest.json](../render-contract/v1/manifest.json). Changing frozen paths requires
bumping the contract version and updating `render_domain_views.py` in the same change.

| Category | Rule |
|----------|------|
| **Frozen** | Required for diagrams; validated by renderer |
| **Extensible** | `evidence`, `notes`, `open_questions`, etc. — agents may add freely |

Agents remain autonomous on extensible fields. Structural changes to frozen paths are explicit,
versioned contract changes — not silent skill drift.


Use **one evidence object shape** everywhere. Do not mix field names (`query` vs `target`,
`finding_summary` vs `finding`, top-level `evidence` vs `sources`).

```json
{
  "id": "ev-001",
  "mcp_tool": "trace_path",
  "project": "<mcp-project-key>",
  "target": "<function|route|cypher-query>",
  "mode": "cross_service|data_flow|...",
  "finding": "one-line summary",
  "artifacts_informed": ["context-map.json"],
  "confidence": "low|medium|high",
  "timestamp": "ISO-8601"
}
```

### Where evidence lives

| Location | Key | Rules |
|----------|-----|-------|
| `sources.json` | `sources[]` | **Indexed** evidence per context. Each entry must have `id` (`src-NNN`). Use canonical fields. |
| Inline on claims | `evidence[]` | On relationships, aggregates, events, integrations. May omit `id` and `artifacts_informed`. |
| `refinement-log.json` | `evidence[]` | Same shape as inline; include `finding` on every entry. |

**Do not** use a top-level `evidence` key in `sources.json` — use `sources[]`.

### Field naming registry

| Use | Do not use |
|-----|------------|
| `context_slugs` | `contexts` (glossary terms) |
| `target` | `query`, `query_or_target`, `qualified_name` (in evidence only) |
| `finding` | `finding_summary` |
| `from_context_slug` + `from_type` | Self-referencing inbound (same context slug) |

## Refinement protocol

### On each discovery pass

1. Decide **minimum artifact set** to update (often 1–3 files).
2. Merge new facts; never delete history — use `status: deprecated` and `supersedes`.
3. Append refinement-log entry:

```json
{
  "id": "0007",
  "timestamp": "2026-07-07T16:00:00Z",
  "phase": "3-deep-dive",
  "action": "added aggregate Customer",
  "artifacts_touched": ["contexts/master-data/aggregates.json"],
  "evidence": [
    {
      "mcp_tool": "trace_path",
      "project": "<mcp-project-key>",
      "target": "searchCustomers",
      "finding": "Calls primary_db search_customers SQL function"
    }
  ],
  "confidence_delta": "low → medium",
  "notes": "optional"
}
```

4. Post a **delta summary** to the user: what changed, what's still uncertain.

### Field conventions (all templates)

| Field | Values | Meaning |
|-------|--------|---------|
| `confidence` | low, medium, high | Evidence strength |
| `status` | proposed, validated, deprecated | Lifecycle |
| `last_updated` | ISO-8601 | Last patch date |
| `evidence` | array | MCP pointers; canonical shape above |

### Slug naming

`{context-slug}` = kebab-case ubiquitous name, e.g. `shared-reference-data`, `analytics-etl`,
`rebate-calculation`, `operations-console`.

### Per-context isolation

Each bounded context owns its folder. Shared terms go in root `ubiquitous-language.json` with
`context_slugs: ["slug-a", "slug-b"]` when shared. Context-specific aliases stay in
`bounded-context.json` → `aliases`.

### When to split a context

Split when MCP shows:

- Distinct cluster with weak coupling to others
- Different deployment DB or publication boundary
- Different change cadence / team ownership (if known)
- Conflicting ubiquitous terms

Record split rationale in `refinement-log.json`.

## Template conformance checklist

Reference this at the end of each phase. See [phases.md](../phases.md) for phase-specific items.

### Phase 2 — Context map

- [ ] Relationships have `upstream_slug` (supplier) and `downstream_slug` (consumer) documented
- [ ] Optional stable `id` assigned (`rel-NNN`)
- [ ] Inline `evidence[]` uses canonical field names

### Phase 3 — Per context deep-dive

- [ ] `sources.json` uses `sources[]` with `src-NNN` ids (not top-level `evidence`)
- [ ] Aggregate roots have `attributes` when columns are known
- [ ] Aggregates with lifecycle columns/status VOs have `state_machine` (or explicit open question why omitted)
- [ ] `state_machine.inference` uses canonical enum; `medium`/`high` have `evidence[]`
- [ ] Integrations inbound are **other contexts** or `external:*` only (never self)
- [ ] Glossary terms use `context_slugs` and `legacy_names` where code uses prefixed names
- [ ] Domain events have `inference` when not from an explicit event bus

### Phase 4 — Refinement

- [ ] `refinement-log.json` evidence entries include `finding`
- [ ] Patches are surgical; ids and history preserved
- [ ] Boundary decisions optionally recorded via `manage_adr` (link id in refinement-log `notes`)

## open-questions.md (markdown, not JSON)

Track human-required decisions:

```markdown
## Boundary: ingestion vs analytics
- **Question:** Does the ingestion context own raw file metadata or only hand off to the pipeline?
- **Blocking:** aggregates in file-ingestion
- **MCP hints:** trace_path on process_batch handler
- **Status:** open
```

Remove or move to "Resolved" when answered.
