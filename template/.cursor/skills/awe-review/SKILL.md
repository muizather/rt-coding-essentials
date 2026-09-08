---
name: awe-review
description: Review one role's diff — scanners, parallel functional + security review, verdict handling with iteration budget. Usage: /awe-review <role>
disable-model-invocation: true
---

# awe-review

**Purpose.** Adversarially review a role's completed work. Loops coder↔reviewer up to the configured budget, then escalates to a human. When every role is `verified`, the pipeline moves to `verify`.

## Procedure

1. **Gate check.** State `active: true`, `phase: code|review`. The role's branch `awe/<ticket>-<role>` must exist with commits beyond the base branch.
2. **Set phase** `review` (keep `active`/`ticket`/roles; bump `updatedAt`).
3. **Run scanners** on the role's diff: built-in secret patterns always; `gitleaks`, `semgrep --config p/default`, and `osv-scanner` when on PATH (absent → note "degraded" and continue; `strictSecurity: true` → stop and tell the human to install them).
4. **Spawn reviewers in parallel** (both read-only, both background): `awe-reviewer` and `awe-security-reviewer`, each briefed with: ticket, role, round N = `roles.<role>.iteration + 1`, diff range `origin/<baseBranch>...awe/<ticket>-<role>`, plan + architecture + intake paths, prior rounds folder. Both reviewers apply the shared rubric in `references/review-rubric.md` (five axes: correctness, readability, architecture, security, performance) and label every finding by severity — **Critical / Required / Optional / Nit / FYI**. The functional reviewer runs **adversarially** (see "Doubt-driven iteration" below): its job is to *disprove* the diff, not approve it.
5. **Collect verdicts** from `plans/<ticket>/reviews/<role>-functional-round-<N>.md` and `<role>-security-round-<N>.md`. Merge into `plans/<ticket>/reviews/round-<N>.md` (scanner output + both verdicts + combined findings table). Lead the report with what matters — Critical/Required first, nits last; don't bury a real issue under cosmetics.
6. **Act on the verdict** (needs-fix from either reviewer = needs-fix). **A single Critical finding fails the iteration** — severity labels decide what burns a round: Critical/Required → needs-fix; Optional/Nit/FYI never block alone.
   - **needs-fix AND `iteration < reviewIterations`** → increment `roles.<role>.iteration`, update `handoff.md` "Prior review findings" with round-N findings, set phase `code`, and respawn the coder via the `/awe-code <role>` procedure.
   - **needs-fix AND budget reached** → write `plans/<ticket>/ESCALATION.md` (unresolved findings, what was tried across rounds, recommended human decision: more budget / human fix / scope cut), tell the human plainly, STOP. Three rounds unresolved = human escalation, not silent shipping.
   - **verified from both** → set `roles.<role>.verified: true`, `planStatus` stays `approved`. When **all** roles are verified → set `phase: verify` and tell the human to run `/awe-verify`. Otherwise report which roles remain.
7. **Always report** the findings table to the human, even on success — the human is the backstop reviewer.

## Doubt-driven iteration (per-round protocol)

Adapted from agent-skills `doubt-driven-development` (MIT, Addy Osmani 2025 — see NOTICE). A confident diff is not a correct one; long sessions quietly turn assumptions into "facts". Each review round subjects the role's diff to a **fresh-context adversarial pass** before it stands. The `awe-reviewer` subagent *is* the fresh-context reviewer — it starts with isolated context by design, and it is briefed to **disprove**, not validate.

Map the doubt cycle onto each round:

1. **CLAIM** — the coder's implicit claim is "this diff implements the approved plan and its acceptance criteria, correctly and safely." The round names that claim by reviewing against the plan/criteria, not against taste.
2. **EXTRACT** — the smallest reviewable unit goes to the reviewer: the diff range + the plan + the acceptance criteria (the **contract**). The coder's reasoning and self-assessment are stripped — hand over conclusions and you get back validation of conclusions.
3. **DOUBT** — the `awe-reviewer` runs with an adversarial brief ("find what is wrong; assume the author is overconfident; do not validate"), plus the deterministic scanners. This is a fresh-context pass, not the coder re-reading its own work.
4. **RECONCILE** — findings come back as structured hints (`file/line/severity/category/evidence/suggested_fix`), not commands. The coder evaluates each on merit and may rebut *in writing*; classify each finding (contract misread → fix the plan/contract; valid+actionable → fix; valid trade-off → record it; noise → note it). Don't rubber-stamp the reviewer, don't ignore it.
5. **STOP** — the loop is **bounded by `reviewIterations`** (default 3), not infinite. Verified-from-both stops it; so does the budget. Where the original skill escalates to a *cross-model CLI second opinion*, AWE escalates to a **human** instead — three unresolved rounds write `ESCALATION.md` and hand the decision to a person. (Per the Step-3 model constraint, AWE pins Cursor-subscription models and never invokes third-party CLI reviewers.)

Doubt theater is a checkable failure: across two or more rounds where the reviewer raised substantive findings, if **zero** were classified actionable, you're validating, not reviewing — stop and escalate to the human.

## Optional: simplification pass (behavior-preserving)

Adapted from agent-skills `code-simplification` (MIT, Addy Osmani 2025 — see NOTICE). After a round is `verified` and tests are green, the coder *may* take a simplification pass — reduce complexity while preserving exact behavior. This is **optional and scoped**:

- **Chesterton's Fence first.** Before changing or removing anything, understand why it exists. If you can't explain what the code's responsibility is, what calls it, and why it was written this way (check `git blame`), you're not ready to simplify it.
- **Preserve behavior exactly** — same outputs, error behavior, side effects, ordering. If you're not sure a change preserves behavior, don't make it.
- **Run tests after every single change**, one simplification at a time. A simplification that requires modifying tests to pass is a behavior change — revert it.
- **Scope to what this task changed.** No drive-by refactors of unrelated code. Prefer clarity over cleverness; fewer *concepts a reader must hold*, not fewer *lines*.

## Rationalizations (review)

| Excuse | Reality |
|---|---|
| "It works, that's good enough" | Working code that's unreadable, insecure, or architecturally wrong creates debt that compounds. |
| "The tests pass, so it's good" | Tests are necessary, not sufficient — they don't catch architecture, security, or readability problems. |
| "AI-generated code is probably fine" | AI code needs *more* scrutiny, not less — it's confident and plausible even when wrong. |
| "I'm confident, skip the adversarial pass" | Confidence correlates poorly with correctness on novel problems. Certainty is exactly when blind spots hide. |
| "Spawning a reviewer is expensive" | Debugging a wrong commit in production is more expensive. The check is bounded (`reviewIterations`); the bug isn't. |
| "The reviewer will just nitpick" | Only if unscoped. Constrain it to "issues that would make this fail the plan/contract." |
| "Three rounds failed — ship it anyway, close enough" | Three rounds unresolved = human escalation, not silent shipping. Write `ESCALATION.md` and stop. |

## Exit criteria

- Round report on disk; state reflects the outcome (iteration bumped / role verified / ESCALATION.md written); human knows exactly what happens next.
