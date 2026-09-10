# Human feedback loop (portable)

Structured loop between **machine JSON** (source of truth), **generated views** (read), and **`human/`** (write).

## Directory layout

```
{output_root}/
├── contexts/ …                    # machine — agent patches
├── *.json                         # machine
├── views/                         # generated — read only
├── open-questions.md              # narrative mirror (agent maintains)
└── human/                         # human-writable
    ├── README.md
    ├── review-queue.json          # generated index (rq-NNN)
    ├── review-board.md            # generated reading order
    ├── responses/TEMPLATE.md
    ├── responses/rq-*.md          # human answers
    ├── ad-hoc/feedback.md         # non-queue corrections
    └── todos.json                 # implementation backlog
```

## Review categories

| Category | Typical human finding | Queue source |
|----------|----------------------|--------------|
| `boundary` | Wrong context split | `context-map.json` low/medium confidence |
| `aggregate` | Missing root, wrong commands | `aggregates.json` confidence |
| `glossary` | Missing term, wrong definition | `ubiquitous-language.json` |
| `use-case-gap` | Unknown actor/trigger | `use-cases.json` → `gaps[]` |
| `process-map-gap` | Broken cross-context step | `process-map.json` → `gaps[]` |

Ad-hoc covers everything else: "add aggregate X", "move term Y to context Z", "proc-001 step 3 is wrong".

## Ordering and dependencies

`sync_human_review_queue.py` assigns:

1. **Priority 1** — boundary disputes (block context-level work)
2. **Priority 2** — blocking use-case gaps
3. **Priority 3** — process-map gaps
4. **Priority 4–5** — low/medium confidence aggregates, glossary, non-blocking gaps

**`depends_on`:** glossary/aggregate/gap items in a context depend on open boundary items for that context.
**`unclear-trigger`** depends on **`unclear-actor`** for the same use case.

Answer in `review-board.md` top-to-bottom, skipping items whose dependencies are still open.

## Skill triggers

| Skill | When |
|-------|------|
| `ddd-domain-model` | Discovery → patch JSON → `sync_human_review_queue.py` |
| `ddd-use-cases` | Use cases / gaps → patch JSON → sync queue |
| `ddd-apply-feedback` | Human updated `human/` → patch JSON → render → todos |

## Todos governance (future)

`todos.json` is intentionally lightweight. Later: link to Jira/Redmine via MCP, dedupe by external key, sprint labels. For now: `source` field encodes origin.

## Scripts

```bash
python3 .cursor/skills/ddd-apply-feedback/scripts/sync_human_review_queue.py {output_root}
```

Called after discovery passes and after `ddd-apply-feedback` completes.
