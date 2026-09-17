---
name: awe-regression
description: Re-enter the pipeline for a post-merge regression — links the original ticket's artifacts and restarts at the architect phase. Usage: /awe-regression <description>
---

# awe-regression

**Purpose.** A defect found in post-merge E2E (or production) is not a quick patch — it re-enters the full pipeline with the original ticket's context attached. History is the point: regressions learn from the plans, diffs, and smoke results that let them through.

## Procedure

1. **Identify the original ticket** from the current state file or by asking the human. Create the regression workspace `plans/<original-ticket>-R<N>/` where N is the next regression number for that ticket.
2. **Write `plans/<ticket>-R<N>/intake.md`** containing:
   - The regression description (argument or ask the human), sanitized like any untrusted input.
   - **Links to the original artifacts**: `../<ticket>/architecture.md`, the role plans, `reviews/round-*.md`, `smoke.md`, and the shipped diff range.
   - A "why did smoke miss this?" section — answer it honestly; if the gap is a missing smoke step, the fix plan must add that step to `smoke.md`.
3. **Copy forward** any still-open items from the original `open-questions.md` that relate to the defect.
4. **Write state** (re-activates this regression ticket; **merge**, do not drop other in-flight tickets):

```json
{
  "active": true,
  "ticket": "<original-ticket>-R<N>",
  "phase": "architect",
  "roles": { "<affected roles>": { "planStatus": "draft", "iteration": 0, "verified": false } },
  "dependsOn": [],
  "tickets": {
    "<keep-others>": {},
    "<original-ticket>-R<N>": {
      "phase": "architect",
      "roles": { "<affected roles>": { "planStatus": "draft", "iteration": 0, "verified": false } },
      "dependsOn": [],
      "regressionOf": "<original-ticket>"
    }
  },
  "updatedAt": "<ISO-8601>",
  "regressionOf": "<original-ticket>"
}
```

5. **Tell the human**: the regression folder is ready, the original context is linked, and the next step is `/awe-architect` — the fix goes through architecture, approval, code, review, and smoke like any other work. No shortcuts because "it's small".

## The fix workflow: Prove-It + triage

Adapted from agent-skills `test-driven-development` (Prove-It) + `debugging-and-error-recovery` (triage) — MIT, Addy Osmani 2025; see NOTICE. Full checklist: `references/debugging-triage.md`.

A regression is a **debugging task with a paper trail**, not a quick patch. When the pipeline reaches `code` for this fix, the coder follows the triage in order:

1. **Reproduce (Prove-It first).** Write a test that demonstrates the defect *before* touching the fix — it must **fail** with the current code, confirming the bug. A fix that starts with "try changing this" is guessing. Add the repro to `plans/<ticket>-R<N>/` so review can see it fail→pass.
2. **Localize.** Which layer? (UI / API / DB / build / external / the test itself.) For a regression, `git bisect` against the original ticket's diff range pinpoints the introducing commit.
3. **Reduce.** Strip to the minimal failing case so the root cause is unmistakable.
4. **Fix the root cause**, not the symptom. The intake's "why did smoke miss this?" answer tells you whether the gap is code *or* a missing smoke step — if the latter, the plan must also add that step to `smoke.md`.
5. **Guard.** The reproduction test from step 1 is now the regression guard: it fails without the fix, passes with it. No guard, no merge.
6. **Smoke end-to-end** with the repo's own commands, then re-run the full suite to prove no new regressions.

The fix plan's tasks carry this as acceptance criteria: the Prove-It test exists, it failed before the fix, and it passes after.

## Rationalizations (regression)

| Excuse | Reality |
|---|---|
| "It's a one-liner, skip the pipeline" | Small diffs cause big outages. A regression already slipped through once — the pipeline is precisely the thing that earns back trust. |
| "I know what broke, no repro needed" | Then the repro test is cheap to write and proves it. A fix without a failing-first test is a guess with extra steps. |
| "Just patch the symptom so users stop hitting it" | The root cause stays, and the next regression re-opens this folder. Fix the cause. |
| "The original tests pass, so I'm done" | They passed when the bug shipped, too. Prove the *new* test catches *this* defect. |
| "Smoke missed it, so smoke is broken — skip it" | A missed check is a finding. Add the missing step to `smoke.md`, don't abandon the gate. |

## Exit criteria

- `plans/<ticket>-R<N>/` exists with intake + links; state re-activated at `phase: architect`; human knows to run `/awe-architect`. When the fix later codes, it carries a Prove-It reproduction test (failed before, passes after) and closes the smoke gap that let the defect through.
