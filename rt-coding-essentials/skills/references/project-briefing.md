<!-- Adapted from agent-skills context-engineering (hierarchical project map) + documentation-and-adrs — MIT, Addy Osmani 2025; see NOTICE. -->

# Project briefing — architect-owned domain docs (optional)

`docs/awe/` is the project's **high-level PRD / domain briefing**. The architect owns it. It is **not a gate**. Missing files never stop intake, architect, code, smoke, or ship.

These docs are how the architect learns the product on the next ticket without dumping the whole graph. They stay **short** (minutes to read, not a design dump). File-level how belongs to coding agents.

## Not required

- No `docs/awe/` yet → continue. Graph + intake are enough.
- Nothing new this ticket (bugfix, copy, same surface already described) → **do not** touch the docs. Silence is correct.
- A file is missing that you do not need yet → do not create it "for completeness."

## Layout (committed in the **app** repo, only the files that earn their keep)

Create or update **only** the files that match what you actually know. One file is fine. Several files are fine when topics split naturally.

```text
docs/awe/README.md               optional index when there are 2+ briefing files
docs/awe/product.md              PRD: what the product is, who it is for, in/out of scope
docs/awe/project-map.md          apps, git roots, which UI is real (headless Magento vs Next, …)
docs/awe/architecture.md         high-level shape: how the pieces talk (not ticket architecture.md)
docs/awe/connections.md          integrations, third parties, CROSS_* systems
docs/awe/deployment.md           how this ships (envs, strategy, who deploys) — no secrets
docs/awe/features/<slug>.md      one surface that outgrew a section
docs/decisions/                  ADRs (ship gate; repo convention wins)
```

Reuse an existing section. Same feature later → edit that section. New surface → new `features/<slug>.md` **or** a new section in the file that already owns that topic. Do not start a second competing map.

Keep each file two-minute high-level:

```markdown
# Product
One paragraph. Who it is for. What "done" means for the business.

# Apps
| App | Git root | Role | Notes |
| Magento | magento/ | backend (headless) | Themes exist; product UI is Next.js |
| Storefront | nestjs/ | frontend | Talks to Magento APIs |

# Connections
Checkout: Next → Magento GraphQL → payment provider (name only).

# Deployment
Staging vs prod, who promotes. No tokens, no hostnames that are secrets.
```

## Who writes what

The `awe-architect` subagent is read-only. The **parent** skill (`/awe-architect`, `/awe-ship`, `/awe-remember`) writes `docs/awe/**`. Hooks allow those paths in every phase.

| Event | Owner | Action |
|---|---|---|
| Architect phase | Orchestrator | Read whatever `docs/awe/` exists. After the ticket spec is written, apply a **delta** only if this ticket taught a lasting product/architecture/deploy/connection fact. Else skip. |
| Ticket **ships** | Orchestrator knowledge pass | Same rule: update only if the shipped work changed the domain briefing. Skip trivia. ADR still follows the ship docs gate (`manage_adr` / `docs/decisions/`) when a *decision* was made. |
| Human `/awe-remember` | Remember skill | ADR for tribal knowledge. Patch `docs/awe/` only when it is a product/architecture/deploy/connection fact. |
| Coder | Nobody | Does not own these files. |

## Architect read order (never a stop)

1. Any files under `docs/awe/` (skip missing).
2. ADRs (`manage_adr` and/or `docs/decisions/`) if present.
3. Graph at **root grain** for this ticket's gaps.

If docs contradict discovery (map says headless Magento, a sibling Next.js exists), prefer docs + discovery together. If they conflict, one question in `open-questions.md` — do not halt the spec for a missing file.

## Discovery vs docs

`.cursor/state/awe-discovered.json` (`roles`, `rolesReason`, `rolesClassified`) is machine-local. Worth copying into `docs/awe/project-map.md` (or `product.md`) **once** it is a stable product fact (Magento is backend, Next is the storefront). Not worth a file if you only guessed.
