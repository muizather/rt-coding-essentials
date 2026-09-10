# DDD (shipped with this plugin)

This plugin ships the **ddd-platform-modeling** skillset as-is:

| Skill | When |
|---|---|
| `ddd-domain-model` | Reverse-engineer bounded contexts, context map, glossary from the graph |
| `ddd-domain-model-continue` | Resume / patch; do not restart Phase 0 |
| `ddd-use-cases` | After the model exists: use cases + process map + gaps |
| `ddd-apply-feedback` | Apply answers from `docs/domain-model/human/` |

Follow those `SKILL.md` files. Do not reimplement DDD inside `/awe-*`. Default `output_root` is **`docs/domain-model/`** at the **workspace** (platform) root.

## How AWE uses it

The **platform architect** is required to **read** DDD (manifest, context-map, glossary, DDD `open-questions.md`) and to **run** `ddd-domain-model` when the family has no manifest yet (Phase 0–1 is enough for a first ticket; do not deep-dive every context unless the ticket needs it).

Graph bootstrap (`code-graph.md`) runs **before** DDD Phase 0. DDD should **use existing** indexes (`mode: full` already done). Sequential indexing and no parallel `index_repository` still apply if a member is missing.

## Question routing

| Kind | Store |
|---|---|
| Who owns X, how A relates to B, context boundary | `docs/domain-model/open-questions.md` (and `human/` when using the review board) |
| This ticket’s flag / URL / AC wording | `plans/<ticket>/open-questions.md` |

Ticket `open-questions.md` may **point** at a DDD id (`see domain-model oq-004`). Do not duplicate the full domain question in both files.

Lasting ownership decisions at ship time: `ddd-domain-model-continue` / `ddd-apply-feedback` and `manage_adr`.
