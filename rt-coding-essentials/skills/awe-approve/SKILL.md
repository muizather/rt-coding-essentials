---
name: awe-approve
description: Human approval gate — validate questions are answered and flip every plan to approved, unlocking the code phase. Usage: /awe-approve
disable-model-invocation: true
---

# awe-approve

**Purpose.** The first human gate. Code emission is hard-blocked until this skill flips every role plan to `status: approved` and sets `phase: code`.

## Procedure

1. **Gate check.** State must be `active: true`, this ticket `phase: approve` (`tickets.<id>` or focus). Other in-flight tickets do not block approval.
2. **Validate open questions.** Every item in `plans/<ticket>/open-questions.md` must be `- [x]` with a non-empty answer. Blocking items in `docs/domain-model/open-questions.md` that this ticket’s specs reference must also be answered or waived. If any are open: list them and STOP.
3. **Validate specs.** `plans/<ticket>/architecture.md` exists; `plans/<ticket>/e2e/*.feature` exists; every in-scope role (`backend` and/or `frontend` and/or `fullstack`) has `plans/<ticket>/<role>.spec.md`. Specs must **not** contain source file lists. Each `dependsOn` must match a contract section in `architecture.md`. `architecture.md` must carry a **Decision surface**: every product-level decision (input constraints — types/sizes/validation; placement & business logic; ownership & persistence; edge cases & failure UX; scope boundaries) is either decided-with-rationale or linked to an **answered** open question that presented real options. If a product decision would only surface later in a coder's implementation plan, the spec is under-specified — send it back to the architect instead of approving.
4. **Present the approval summary**: one bullet per role (what they owe, which gherkin), the contract in two lines, risks. Ask **"Approve this spec? (yes/no)"**. Record the yes in `plans/<ticket>/approvals.md`.
5. **Reject hedged approval.** Adapted from agent-skills `interview-me`'s "explicit yes" discipline (MIT, Addy Osmani 2025 — see NOTICE). **"Looks reasonable", "I guess", "sure, whatever", and silence are NOT approval** — neither are unanswered open questions. Only an explicit **yes** (or explicit answers/waivers on every question) lets you flip a plan. If the human hedges, re-present the specific open decision as a concrete choice and wait. Approving on a hedge is how the wrong thing gets built with a green checkmark.
6. **Flip the specs.** Set `status: approved` on `architecture.md` and every assignee `spec.md`. Implementation plans do **not** exist yet and are not approved here.
7. **Write state**: this ticket `phase: code`; each assignee `planStatus: approved`, `iteration: 0`, `verified: false`. Merge into `tickets.<id>`; keep other tickets. Session focus follows this ticket.
8. **Print start commands** if standalone `/awe-approve`: `/awe-code backend`, `/awe-code frontend`, and/or `/awe-code fullstack`. `/awe-run` continues to `/awe-code`. Coding agents still write their own implementation plans and may stop for **their** questions before any source lands.

## Rationalizations (approve)

| Excuse | Reality |
|---|---|
| "They said 'looks reasonable' — that's a yes" | It's a hedge, not a yes. Only an explicit yes flips a plan to `approved`. |
| "The open questions are minor" | An unanswered question is an unmade decision baked into the plan. Answer or explicitly waive each one. |
| "I'll approve now and fix the plan later" | `approved` is a contract the coder builds against. Approving a plan you intend to change builds the wrong thing on purpose. |
| "The dependency will sort itself out" | An unacknowledged cross-role dependency is a broken contract waiting to fail at integration. Acknowledge it in `architecture.md` first. |
| "We can skip approval for a small ticket" | APPROVE is a hard gate by design. The hook blocks code without it — the size of the ticket doesn't change that. |
| "The coder can decide that detail" | Input limits, placement logic, and business rules are product decisions. If they first appear in an implementation plan, approval rubber-stamped a blank spot in the spec. |

## Exit criteria

- All plans `status: approved` on an **explicit** human yes (hedges rejected), `approvals.md` records it, state `phase: code`, start commands printed.
