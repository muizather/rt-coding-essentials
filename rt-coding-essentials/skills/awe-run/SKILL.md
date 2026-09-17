---
name: awe-run
description: >-
  Run the AWE pipeline from a ticket or task through coding and review until
  tests are green. Use when the user describes a feature, bug, ticket id, or
  asks to implement something end-to-end. Stops for explicit human yes at
  approve and for smoke (watch Playwright HTML report, then sign). Requires
  codebase-memory MCP.
---

# awe-run

**Purpose.** One entry point. The human describes work (or pastes a ticket); you bootstrap this repo, then chain phases. Do **not** ask them to type `/awe-intake` then `/awe-architect` then `/awe-code`. Follow each phase skill's procedure (same artifacts, same hooks).

Human gates that still stop you:

1. **APPROVE** — after architecture, present the summary and wait for an explicit **yes**. Hedges are not approval (`/awe-approve` procedure).
2. **SMOKE** — after review is green, follow `/awe-smoke`: Playwright from Gherkin on localhost, coder loop if it fails, then wait for the human to open the HTML report and sign. Then you may `/awe-ship` if they want.

## 0. Bootstrap (every run)

1. Read `.cursor/state/awe-state.json`. **Multiple in-flight tickets are allowed.** Do **not** stop because another ticket is active. If this ask continues an existing ticket (same id, or the human said resume/fold), keep that ticket. Otherwise start a new `plans/<id>/`.
   - List in-flight tickets (id, phase, `dependsOn`).
   - If this work **depends** on an in-flight plan (same feature/surface/files, or it cannot ship until that plan is done), record `dependsOn: ["<other>"]` on the new ticket. Independent → `dependsOn: []`. Tell the human what you recorded; they may edit it.
   - **Never block intake or architect** for a dependency. Only **implementation** waits (see `/awe-code`).
2. **Memory MCP (required).** If `list_projects` / `index_repository` / `search_graph` are missing, STOP: enable **codebase-memory** (one copy only — if a user MCP already works, leave the plugin copy off), reload, retry.
3. Follow `references/code-graph.md` (git family, derive ignores, sequential `full` index). Architect stays high-level; coding agents go file-grain. Read `docs/awe/` if it exists; missing briefing files never stop the run.
4. Discovered settings are in `.cursor/state/awe-discovered.json` (sessionStart writes it). Honor optional `awe.config.json` if present. Use `baseBranch`, `commands.test`, and `roles` (`backend` / `frontend` / `fullstack`) from there. Tell the human `rolesReason` once if it is surprising (e.g. Magento is backend because Next.js is a sibling). If roles look wrong, ask once, then proceed.
5. Optional: follow `references/mcp-report.md` when Slack or ticket-system MCP tools exist. Always append `plans/<ticket>/ticket-updates.md`.

## 1. Intake → architect

Follow `/awe-intake` then `/awe-architect` in this chat (spawn `awe-architect`). Architect produces **high-level spec + gherkin**, not file lists. If **architect** open questions block, write them, report, and **wait**. Zero architect questions is fine.

## 2. Approve (hard stop)

Follow `/awe-approve` validation. Ask **"Approve these plans? (yes/no)"**. Only an explicit yes flips `status: approved` and `phase: code`. Then continue in this chat — do not stop after printing `/awe-code` commands.

## 3. Code → review loop

For each discovered role (`backend` / `frontend` / `fullstack`), follow `/awe-code <role>` **for this ticket**. If the role is `fullstack`, do **not** also spawn FE+BE. If `dependsOn` is unmet, that skill stops before implement — keep planning other independent tickets. Do not start `/awe-review` until implement mode has evidence. Then `/awe-review <role>` including the needs-fix respawn loop up to `reviewIterations`. Spawn `awe-security-reviewer` only when `securityReview` is true.

When every role is reviewer-`verified`, set `phase: smoke`.

## 4. Smoke (hard stop)

Follow `/awe-smoke`: spawn `awe-smoke-tester` (Playwright from Gherkin, localhost), loop needs-fix to the coder up to `reviewIterations`, then hand the **HTML report** + smoke-folder README + `smoke.md` to the human. Wait until frontmatter `signed: true` with initials + date, then write signoff and `phase: ship`. Do not push before that.

## 5. Ship + knowledge

If the human wants it shipped, follow `/awe-ship`. After a successful ship (or when they say the ticket is done):

- **Knowledge pass** (orchestrator writes `docs/awe/**` only when the briefing actually changed; architect subagent stays read-only): skip if nothing to add. `manage_adr` for lasting decisions. Follow `/awe-remember` if the human also stated extra knowledge.
- MCP report the PR/MR if those tools exist.

## Exit criteria

- Ticket either waiting on a human gate (questions / approve / smoke) with a clear ask, or review-verified with evidence, or shipped.
- Graph was used; no silent fallback.
- No phase skipped.
