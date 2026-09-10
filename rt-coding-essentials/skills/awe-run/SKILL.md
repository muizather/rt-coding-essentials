---
name: awe-run
description: >-
  Run the AWE pipeline from a ticket or task through coding and review until
  tests are green. Use when the user describes a feature, bug, ticket id, or
  asks to implement something end-to-end. Stops for explicit human yes at
  approve and for hands-on verify. Requires codebase-memory MCP.
---

# awe-run

**Purpose.** One entry point. The human describes work (or pastes a ticket); you bootstrap this repo, then chain phases. Do **not** ask them to type `/awe-intake` then `/awe-architect` then `/awe-code`. Follow each phase skill's procedure (same artifacts, same hooks).

Human gates that still stop you:

1. **APPROVE** — after architecture, present the summary and wait for an explicit **yes**. Hedges are not approval (`/awe-approve` procedure).
2. **VERIFY** — after review is green, write `verification.md` and wait for the human to test and sign (`/awe-verify` procedure). Then you may `/awe-ship` if they want.

## 0. Bootstrap (every run)

1. Read `.cursor/state/awe-state.json`. If `active: true` for another ticket, STOP and ask them to finish or abandon it.
2. **Memory MCP (required).** If `list_projects` / `index_repository` / `search_graph` are missing, STOP: enable **codebase-memory** (one copy only — if a user MCP already works, leave the plugin copy off), reload, retry.
3. Follow `references/code-graph.md` (git family, derive ignores, sequential `full` index, cross-repo-intelligence). Follow `references/ddd.md` when DDD artifacts are missing on a multi-repo workspace.
4. Discovered settings are in `.cursor/state/awe-discovered.json` (sessionStart writes it). Honor optional `awe.config.json` if present. Use `baseBranch`, `commands.test`, and `roles` from there. If roles look wrong, ask once, then proceed.
5. Optional: follow `references/mcp-report.md` when Slack/GitHub/GitLab tools exist.

## 1. Intake → architect

Follow `/awe-intake` then `/awe-architect` in this chat (spawn `awe-architect`). Architect produces **spec + gherkin**, not file lists. If open questions block (ticket or DDD), write them, report, and **wait**.

## 2. Approve (hard stop)

Follow `/awe-approve` validation. Ask **"Approve these plans? (yes/no)"**. Only an explicit yes flips `status: approved` and `phase: code`. Then continue in this chat — do not stop after printing `/awe-code` commands.

## 3. Code → review loop

For each discovered role, follow `/awe-code <role>` (worktree, handoff, spawn role dev). Then `/awe-review <role>` including the needs-fix respawn loop up to `reviewIterations`. Report review status if MCP tools exist.

When every role is reviewer-`verified`, set `phase: verify`.

## 4. Verify (hard stop)

Follow `/awe-verify`: spawn `awe-verifier`, hand `verification.md` to the human, wait until frontmatter `verified: true` with initials + date, then write signoff and `phase: ship`. Do not push before that.

## 5. Ship + knowledge

If the human wants it shipped, follow `/awe-ship`. After a successful ship (or when they say the ticket is done):

- Spawn a **knowledge pass** (architect, still no app code): if this ticket made a lasting decision, `manage_adr` create/update. Skip trivia.
- MCP report the PR/MR if those tools exist.

## Exit criteria

- Ticket either waiting on a human gate (questions / approve / verify) with a clear ask, or review-verified with evidence, or shipped.
- Graph was used; no silent fallback.
- No phase skipped.
