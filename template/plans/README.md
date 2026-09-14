# plans/ — the AWE workspace

Every ticket gets a folder `plans/<ticket>/`. It is the single source of truth for what was asked, what was planned, what reviewers said, and what the human verified. Commit these folders — they are your project's memory of *why* the code looks the way it does. Multiple `plans/<ticket>/` folders may exist at once. If one plan cannot be implemented until another is done, set `dependsOn` in intake frontmatter (and in `awe-state.json`). That does not block creating the new plan; it blocks **code** until the dependency is `done`.

## Lifecycle

```
/awe-intake PROJ-123     → plans/PROJ-123/intake.md + open-questions.md
/awe-architect           → architecture.md + <role>.spec.md (per role)
/awe-approve             → spec frontmatter flips to status: approved, approvals.md
/awe-code backend        → implementation.plan.md + implementation-questions.md, then code (questions must be closed)
/awe-review backend      → reviews/round-1.md + round-1-response.md after the coder replies
/awe-verify              → verification.md + e2e/run-verify.sh (human signs frontmatter; HTML report is the combined viewer)
/awe-ship                → pr-body.md (when no git MCP is configured)
/awe-regression "..."    → plans/PROJ-123-R1/ (links back to the original folder)
```

## File templates

### intake.md
```markdown
---
ticket: PROJ-123
source: manual | mcp:redmine | mcp:jira | mcp:github | mcp:gitlab
remoteId: 12345   # omit when source is manual
createdAt: 2026-09-08T12:00:00Z
dependsOn: []
---
# <one-line summary>
## Summary
## Acceptance criteria
- [ ] observable, testable criterion
## Constraints
## Assumptions
```

### open-questions.md
```markdown
# Open questions — PROJ-123
Answer asynchronously: check the box, write the answer (one word is fine when the GUESS is right), then run /awe-intake --resume PROJ-123.

## backend
- [ ] Q1: What should happen when the token expires mid-upload?
  GUESS: Refresh the token and retry the upload once, then fail with a 401 the user can retry.
  A: 
```

### architecture.md
Context → chosen approach (+ rejected alternatives) → role dependency graph → **cross-role contract** (endpoint shapes / shared types / event names — the thing both roles code against) → risks → test strategy.

### &lt;role&gt;.plan.md
```markdown
---
ticket: PROJ-123
role: backend | frontend | infra
status: draft | questions-open | approved   # only /awe-approve writes "approved"
dependsOn: [frontend]
openQuestions: [Q1]
---
Goal → file-by-file change list (real paths) → contract stubs to build against → named unit tests → out-of-scope → "what the human should manually check".
```

### handoff.md
The brief a dev subagent reads first: plan pointer, contract pointer, iteration count, expectations, prior review findings. Append-only.

### reviews/round-&lt;N&gt;.md
Scanner output + both reviewers' JSON verdicts + combined findings table for round N.

### reviews/round-&lt;N&gt;-response.md
Coder disposition of that round: each finding → **fixed** / **rebutted** / **deferred**, with proof. Required before the next review round.

### ticket-updates.md
Append-only journal (review/verify/ship bullets). Copied to the originating Redmine/Jira/GitHub/GitLab ticket when a write-comment MCP exists.

### verification.md
Numbered human test steps plus paths to the Playwright **HTML report** (combined viewer), **video** (UI), and/or **trace** (API). Frontmatter `verified: false` → the human flips it to `true` with initials + date after watching the report.

### local-run.md
Per-ticket slice: which local services are up, what is mocked/skipped, which gherkin scenarios Playwright will run. Generated during VERIFY from discovered `local` start commands.

### e2e/run-verify.sh
Portable re-run of this ticket's Playwright suite. No sandbox browser paths.

### ESCALATION.md
Written when the review budget is exhausted: unresolved findings, what was tried, recommended human decision.

## House rules

- Agents write here freely in every phase (the write-gate always allows `plans/`).
- Never store secrets or raw ticket dumps here — sanitized specs only.
- `.cursor/state/` (runtime state, evidence, audit log) stays out of git; this folder goes in.
