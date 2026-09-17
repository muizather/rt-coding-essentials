---
name: awe-ship
description: Ship phase — pre-flight checks, commit, push the awe/<ticket>-* branch, open a PR (MCP or printed commands). Usage: /awe-ship
---

# awe-ship

**Purpose.** Get the verified work in front of a merge decision. The hook layer independently gates `git push`; this skill makes the gate pass legitimately.

## Pre-flight (all must pass — check and report each)

1. State `active: true`, this ticket `phase: ship`.
2. `.cursor/state/awe-signoff.json` exists with `verified: true` (human signed the smoke report).
3. `.cursor/state/awe-evidence.json` has `testsPassed: true` and `at` younger than 2 hours — stale? Re-run the configured test command on this ticket's branch (worktree only if one was created for parallel work) and refresh evidence first.
4. Scanners clean on the final diffs (built-ins always; gitleaks/semgrep/osv-scanner when available; strict mode requires them).
5. Current branch for each shipping role matches `awe/<ticket>-*` — the shell gate denies anything else.
6. **Ship Decision artifact exists** — `plans/<ticket>/ship-decision.md` with a GO/NO-GO verdict, blockers, acknowledged risks, and a rollback plan (trigger conditions, exact steps, RTO). See "Ship Decision" below. No artifact → write it before pushing.
7. **Docs gate (ADR)** — every architectural decision made on this ticket has an ADR (or a recorded "no ADR needed" reason), linked in the PR body. See "Docs gate" below.

## Procedure

1. **Commit** any remaining changes on this ticket's branch (main tree, or the role worktree if parallel work created one) with a conventional message referencing the ticket (`feat(PROJ-123): …`).
2. **Rebase check**: `git fetch origin <baseBranch>` and report if the branch is behind; if it is, stop and let the human decide rebase vs. merge (never silently rewrite).
3. **Push** each `awe/<ticket>-*` branch: `git push -u origin awe/<ticket>-<role>`. The before-shell gate will allow it because pre-flight passed.
4. **Open the PR** targeting the configured base branch:
   - If the GitHub/GitLab MCP is configured, create it via MCP: title `<ticket>: <summary>`, body = links to `plans/<ticket>/` artifacts (architecture, smoke.md summary, review rounds), checklist of acceptance criteria.
   - Otherwise print the exact commands for the human, e.g. `gh pr create --base <baseBranch> --head awe/<ticket>-<role> --title "..." --body-file plans/<ticket>/pr-body.md` (write `pr-body.md` for them).
5. **Multi-role tickets**: open one PR per role and note the merge order from the architecture dependency graph, or combine branches if the human prefers one PR — ask.
6. **Print post-merge E2E instructions**: after the human merges, pull the base branch, run the combined E2E steps from `smoke.md` against the merged result, watch the rollout against the thresholds in `references/ship-decision.md` (error rate > 2× baseline ⇒ roll back; P95 + 50% ⇒ roll back), and apply the **error-budget gate** (budget exhausted ⇒ freeze feature work). File any regression with `/awe-regression <description>`. Then set **this ticket** `phase: done`. Set `active: false` **only if** no other ticket is still in-flight; otherwise keep `active: true` and leave the others untouched. A regression re-activates via the regression skill.
7. **Knowledge pass (optional after a real ship).** Follow `references/project-briefing.md`. The orchestrator writes `docs/awe/**` only when this ticket changed the product briefing (PRD, apps, connections, deploy strategy). Same surface → edit the existing section. **Skip if there is nothing to add** — missing `docs/awe/` is not a ship blocker. If codebase-memory `manage_adr` is available, record lasting *decisions* (approach, rejected alternatives, invariants); skip trivia. Follow `/awe-remember` if the human also stated extra knowledge.
8. **Report** per `references/mcp-report.md` (journal always; Slack/ticket/PR comments if those tools exist). The create-PR/MR call is enough for git forges when that is how you opened it.

## Ship Decision (mandatory artifact)

Adapted from agent-skills `shipping-and-launch` (MIT, Addy Osmani 2025 — see NOTICE). Full template + rollout thresholds + error-budget gate: `references/ship-decision.md`. Before any push, write `plans/<ticket>/ship-decision.md`:

- **Verdict: GO / NO-GO**, with the human decider's initials.
- **Blockers** — anything that must resolve before merge (NO-GO reasons).
- **Acknowledged risks** — risks accepted knowingly (GO only), each with why it's acceptable.
- **Rollback plan** — **trigger conditions** (error rate > 2× baseline; P95 > 50% above baseline; data-integrity/security issue), **exact steps** (flag off / `git revert <sha> && git push` / redeploy previous), **database considerations**, and a **recovery time objective**.

Every launch should be reversible, observable, and incremental. If the work ships behind a feature flag, note the flag owner + expiry and the rollout stages (canary → 25% → 50% → 100%) with monitoring at each.

## Docs gate (ADRs)

Adapted from agent-skills `documentation-and-adrs` (MIT, Addy Osmani 2025 — see NOTICE). Code shows *what*; an ADR records *why this way* and *what alternatives were rejected*. Before the PR opens:

- **Every architectural decision on this ticket needs an ADR, linked in the PR body** — framework/dependency choices, data model/schema, auth strategy, API architecture, infra choices, anything expensive to reverse.
- **Match the repo's existing ADR convention first** (location, numbering, headings). Only if none exists, use `docs/decisions/NNNN-title.md` with Status / Date / Context / Decision / Alternatives Considered / Consequences.
- **Don't delete old ADRs** — a changed decision gets a new ADR that supersedes it.
- If genuinely no architectural decision was made, record that in `ship-decision.md` ("no ADR needed: <reason>") rather than skipping silently.

## Rationalizations (ship)

| Excuse | Reality |
|---|---|
| "It works in staging, it'll work in production" | Production has different data, traffic, and edge cases. Monitor after deploy. |
| "We don't need a rollback plan for this" | Every deploy needs a rollback plan *before* it happens. "Reversible" is a property you build, not hope for. |
| "No ADR — everyone knows why we did this" | They don't, and future-you won't. A 10-minute ADR prevents a 2-hour re-debate six months later. |
| "The error rate looks fine, keep shipping" | Check the **burn rate**, not just the current rate — consuming budget faster than baseline is a hold signal. |
| "Rolling back is admitting failure" | Rolling back is responsible engineering. Shipping a broken feature is the failure. |
| "It's Friday afternoon, let's ship it" | Ship when you can watch it. An unmonitored deploy is an incident waiting for a timezone. |

## Exit criteria

- Branch(es) pushed (gate allowed), PR(s) opened or exact commands printed, **Ship Decision artifact + ADR gate satisfied**, human holds the merge decision, post-merge E2E instructions (with rollback thresholds + error-budget gate) delivered.
