---
name: awe-approve
description: Human approval gate — validate questions are answered and flip every plan to approved, unlocking the code phase. Usage: /awe-approve
disable-model-invocation: true
---

# awe-approve

**Purpose.** The first human gate. Code emission is hard-blocked until this skill flips every role plan to `status: approved` and sets `phase: code`.

## Procedure

1. **Gate check.** State must be `active: true`, `phase: approve`. Otherwise stop and report the actual phase.
2. **Validate open questions.** Every item in `plans/<ticket>/open-questions.md` must be `- [x]` with a non-empty answer line. If any are open: list them, tell the human to answer (or explicitly waive), and STOP — do not approve.
3. **Validate dependencies.** For each `<role>.plan.md`, every `dependsOn` entry must reference another role's plan that exists and whose contract section in `architecture.md` covers the dependency. List any unacknowledged dependency and STOP.
4. **Present the approval summary** to the human: one bullet per role (scope in one line, file count, test count), the cross-role contract in two lines, the risk list from `architecture.md`. Ask explicitly: **"Approve these plans? (yes/no)"** — a yes in this conversation counts as the human's decision; record it in `plans/<ticket>/approvals.md` with timestamp.
5. **Reject hedged approval.** Adapted from agent-skills `interview-me`'s "explicit yes" discipline (MIT, Addy Osmani 2025 — see NOTICE). **"Looks reasonable", "I guess", "sure, whatever", and silence are NOT approval** — neither are unanswered open questions. Only an explicit **yes** (or explicit answers/waivers on every question) lets you flip a plan. If the human hedges, re-present the specific open decision as a concrete choice and wait. Approving on a hedge is how the wrong thing gets built with a green checkmark.
6. **Flip the plans.** In each `<role>.plan.md` frontmatter set `status: approved`. ("Approved enough" is not approved — the frontmatter is the source of truth and the subagent-gate hook checks it.)
7. **Write state**: `phase: code`; each role `planStatus: approved`, `iteration: 0`, `verified: false`.
8. **Print per-role start commands**, one per role so they can run in parallel:

```
Role backend:  /awe-code backend
Role frontend: /awe-code frontend
```

   Each creates its own worktree + branch `awe/<ticket>-<role>`, so roles never collide.

## Rationalizations (approve)

| Excuse | Reality |
|---|---|
| "They said 'looks reasonable' — that's a yes" | It's a hedge, not a yes. Only an explicit yes flips a plan to `approved`. |
| "The open questions are minor" | An unanswered question is an unmade decision baked into the plan. Answer or explicitly waive each one. |
| "I'll approve now and fix the plan later" | `approved` is a contract the coder builds against. Approving a plan you intend to change builds the wrong thing on purpose. |
| "The dependency will sort itself out" | An unacknowledged cross-role dependency is a broken contract waiting to fail at integration. Acknowledge it in `architecture.md` first. |
| "We can skip approval for a small ticket" | APPROVE is a hard gate by design. The hook blocks code without it — the size of the ticket doesn't change that. |

## Exit criteria

- All plans `status: approved` on an **explicit** human yes (hedges rejected), `approvals.md` records it, state `phase: code`, start commands printed.
