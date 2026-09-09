# plans/ — the AWE workspace

Every ticket gets a folder `plans/<ticket>/`. It is the single source of truth for what was asked, what was planned, what reviewers said, and what the human verified. Commit these folders — they are your project's memory of *why* the code looks the way it does.

## Lifecycle

```
/awe-intake PROJ-123     → plans/PROJ-123/intake.md + open-questions.md
/awe-architect           → architecture.md + <role>.plan.md (per role)
/awe-approve             → plan frontmatter flips to status: approved, approvals.md
/awe-code backend        → handoff.md (shared brief, updated each review round)
/awe-review backend      → reviews/round-1.md (+ <role>-functional/-security-round-N.md)
/awe-verify              → verification.md  (human signs frontmatter)
/awe-ship                → pr-body.md (when no git MCP is configured)
/awe-regression "..."    → plans/PROJ-123-R1/ (links back to the original folder)
```

## File templates

### intake.md
```markdown
---
ticket: PROJ-123
source: manual | mcp:redmine | mcp:jira | mcp:github | mcp:gitlab
createdAt: 2026-09-08T12:00:00Z
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

### verification.md
Numbered human test steps. Frontmatter `verified: false` → the human flips it to `true` with initials + date to unlock shipping.

### ESCALATION.md
Written when the review budget is exhausted: unresolved findings, what was tried, recommended human decision.

## House rules

- Agents write here freely in every phase (the write-gate always allows `plans/`).
- Never store secrets or raw ticket dumps here — sanitized specs only.
- `.cursor/state/` (runtime state, evidence, audit log) stays out of git; this folder goes in.
