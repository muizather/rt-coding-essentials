---
name: awe-approve
description: Human approval gate — validate questions are answered and flip every plan to approved, unlocking the code phase. Usage: /awe-approve
disable-model-invocation: true
---

# awe-approve

**Purpose.** The first human gate. Code emission is hard-blocked until this skill flips every role plan to `status: approved` and sets `phase: code`.

## Procedure

1. **Gate check.** State must be `active: true`, `phase: approve`. Otherwise stop and report the actual phase.
2. **Validate open questions.** Every item in `plans/<ticket>/open-questions.md` must be `- [x]` with a non-empty answer. Blocking items in `docs/domain-model/open-questions.md` that this ticket’s specs reference must also be answered or waived. If any are open: list them and STOP.
3. **Validate specs.** `plans/<ticket>/architecture.md` exists; `plans/<ticket>/e2e/*.feature` exists; every assignee has a `spec.md` (child `<repo>/plans/<ticket>/spec.md` or `plans/<ticket>/<role>.spec.md`). Specs must **not** contain source file lists. Each `dependsOn` must match a contract section in `architecture.md`.
4. **Present the approval summary**: one bullet per assignee (what they owe, which gherkin), the contract in two lines, risks. Ask **"Approve this spec? (yes/no)"**. Record the yes in `plans/<ticket>/approvals.md`.
5. **Reject hedged approval.** Adapted from agent-skills `interview-me`'s "explicit yes" discipline (MIT, Addy Osmani 2025 — see NOTICE). **"Looks reasonable", "I guess", "sure, whatever", and silence are NOT approval** — neither are unanswered open questions. Only an explicit **yes** (or explicit answers/waivers on every question) lets you flip a plan. If the human hedges, re-present the specific open decision as a concrete choice and wait. Approving on a hedge is how the wrong thing gets built with a green checkmark.
6. **Flip the specs.** Set `status: approved` on `architecture.md` and every assignee `spec.md`. Implementation plans do **not** exist yet and are not approved here.
7. **Write state**: `phase: code`; each assignee `planStatus: approved`, `iteration: 0`, `verified: false`.
8. **Print start commands** if standalone `/awe-approve`: `/awe-code <assignee>` for each (repo folder name or `backend` / `frontend`). `/awe-run` continues to `/awe-code` immediately. Multi-git: worktree **that** repo, branch `awe/<ticket>-<repo>`.

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
