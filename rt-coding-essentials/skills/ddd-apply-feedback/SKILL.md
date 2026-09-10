---
name: ddd-apply-feedback
description: >-
  Applies human feedback from docs/domain-model/human/ to machine JSON artifacts,
  re-renders views, syncs review queue, and records implementation todos. Use when
  the user updated human/responses/, ad-hoc/feedback.md, or asks to apply feedback,
  process review answers, or incorporate domain model corrections.
---

# DDD Apply Feedback

Companion to [ddd-domain-model](../ddd-domain-model/SKILL.md) and [ddd-use-cases](../ddd-use-cases/SKILL.md).
**Reads human-writable files first**; patches machine JSON surgically; never overwrites `human/responses/` or `human/ad-hoc/`.

## Inputs (human-writable)

| Path | Purpose |
|------|---------|
| `{output_root}/human/responses/*.md` | Answers to `rq-NNN` review-queue items |
| `{output_root}/human/ad-hoc/feedback.md` | Corrections not in the queue |
| `{output_root}/human/todos.json` | Existing backlog (append only) |
| `{output_root}/human/review-queue.json` | Context for each `rq-NNN` (read-only) |

Default `output_root`: `docs/domain-model/`.

## High-level flow

```
Load human input → Map to artifacts → Patch JSON → Validate → Render views → Sync queue → Todos
```

### Phase 0 — Load

1. Read `human/review-queue.json` and `human/review-board.md`.
2. List `human/responses/*.md` (skip `TEMPLATE.md`).
3. Read `human/ad-hoc/feedback.md` for `status: open` items.
4. Read last 3 `refinement-log.json` entries for context.

**Stop after:** inventory of pending responses and ad-hoc items.

### Phase 1 — Apply queued responses

For each `responses/rq-NNN.md` with `status: answered` (or `wont-fix`):

1. Look up `rq-NNN` in `review-queue.json` → `category`, `source_ref`, `source_artifact`.
2. Patch the referenced machine artifact:

| Category | Patch target |
|----------|----------------|
| `use-case-gap` | `contexts/{slug}/use-cases.json` → gap `status`, use case `actor`/`trigger`/`confidence` |
| `process-map-gap` | `process-map.json` → gap + process step linkage |
| `boundary` | `context-map.json` → relationship `confidence`/`status` |
| `aggregate` | `contexts/{slug}/aggregates.json` → fields per answer |
| `glossary` | `ubiquitous-language.json` → term definition/confidence/status |

3. For `wont-fix`: set gap `status: wont-fix`; do not fabricate missing use cases.
4. Mark `rq-NNN` as `answered` / `wont-fix` in review-queue when applied.
5. Mirror resolved blocking items in `open-questions.md` → **Resolved** section.

**Dependency rule:** if answer to `unclear-actor` changes trigger hypotheses, re-evaluate dependent `unclear-trigger` items before closing them.

### Phase 2 — Apply ad-hoc feedback

For each open ad-hoc item:

| Category | Action |
|----------|--------|
| `boundary` | Patch `context-map.json`; may move terms between contexts in glossary |
| `aggregate` | Add/patch/remove in `aggregates.json`; update events/integrations if needed |
| `glossary` | Add/patch term in `ubiquitous-language.json` |
| `process-map` | Patch `process-map.json` steps/processes |
| `use-case` | Patch `use-cases.json` |
| `other` | Patch smallest affected artifact; note ambiguity in refinement-log |

Mark ad-hoc item `status: applied` in `feedback.md` after patching.

### Phase 3 — Validation + views (mandatory)

```bash
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/validate_use_cases.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/validate_state_machines.py {output_root}
python3 .cursor/skills/ddd-use-cases/scripts/render_use_case_views.py {output_root}
python3 .cursor/skills/ddd-apply-feedback/scripts/sync_human_review_queue.py {output_root}
```

### Phase 4 — Implementation todos

When feedback implies **code, infra, or test work** (not just JSON model fixes), append to `human/todos.json`:

```json
{
  "id": "todo-NNN",
  "title": "short imperative",
  "source": "feedback:rq-001",
  "source_detail": "optional link to response or ad-hoc id",
  "status": "open",
  "priority": "high|medium|low",
  "context_slug": "optional",
  "created_at": "ISO-8601",
  "notes": "what to implement and why"
}
```

**Do not** duplicate todos already `open` with the same `source` + `title`.

Sources: `feedback:rq-NNN`, `feedback:adhoc-NNN`, `requirement`, `jira:KEY`, `redmine:#id`, `agent`.

### Phase 5 — Refinement log

Append one entry per apply pass:

```json
{
  "phase": "6-apply-feedback",
  "action": "Applied N queued + M ad-hoc responses",
  "artifacts_touched": ["..."],
  "notes": "rq-ids and ad-hoc ids processed"
}
```

End with **delta summary**: artifacts touched, gaps resolved, new todos, remaining open `rq-*` count.

## Rules

- **Never** delete human response files — rename or add `status: applied` in the file header if needed.
- **Never** hand-edit `views/` — always re-run renderers.
- Preserve ids (`gap-NNN`, `uc-NNN`, `rq-NNN`, `todo-NNN`).
- If an answer contradicts MCP evidence, lower `confidence` and add a refinement-log note; do not silently override high-confidence code-backed fields without user acknowledgment.

## When to ask the user

- Answer is ambiguous between equally valid hypotheses.
- Ad-hoc feedback requires moving an aggregate to another bounded context (structural change).
- Applying feedback would invalidate already-validated use cases — confirm scope.

## Additional resources

- Feedback loop overview: [feedback-loop.md](feedback-loop.md)
- End-to-end pipeline: [workflow-playbook.md](../ddd-use-cases/workflow-playbook.md)
- Human directory layout: `{output_root}/human/README.md`
