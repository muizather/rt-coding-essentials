---
name: awe-code
description: Start coding for one role — creates a worktree + awe/<ticket>-<role> branch, writes handoff.md, spawns the role dev subagent. Usage: /awe-code <role>
---

# awe-code

**Purpose.** Launch implementation for one role, in isolation. Roles run in parallel; each gets its own git worktree and branch. Phase stays `code`.

## Procedure

1. **Gate check.** State `active: true`, `phase: code`, and `roles.<role>.planStatus == approved`.
2. **Create the worktree + branch** from that assignee’s **git repo** (`gitRepos[].path` when `relative !== '.'`, else workspace root) and `baseBranch`:

```bash
REPO=<git repo path for this assignee>
git -C "$REPO" fetch origin <baseBranch>
git -C "$REPO" worktree add "$REPO/.worktrees/<ticket>-<role>" -b awe/<ticket>-<role> origin/<baseBranch>
```

   Reuse the branch on re-runs. Single-repo workspaces: `REPO` is the workspace (same as today).
3. **Write `plans/<ticket>/handoff.md`** (workspace, append-only):

```markdown
# Handoff — <ticket> / <role>
- Spec: <repo>/plans/<ticket>/spec.md or plans/<ticket>/<role>.spec.md (approved)
- Contract: plans/<ticket>/architecture.md § Contract
- Gherkin: plans/<ticket>/e2e/*.feature
- Implementation plan: written by the coder as <role>.implementation.plan.md (not yet)
- Iteration: <N> of <reviewIterations>
## Expectations
- Write the implementation plan first (files + unit tests), then TDD.
- Implement only this assignee’s spec; stubs for the contract.
- Gherkin is E2E spec; unit tests are yours.
- Run this repo’s test command; write awe-evidence.json when green.
## Prior review findings
<latest round or "none yet">
```

### Test-driven development (the coder's loop)

Adapted from agent-skills `test-driven-development` (MIT, Addy Osmani 2025 — see NOTICE).

**Discover the repo's own test commands first.** The TDD cycle is universal; the commands are not. Before the first test, the coder reads `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` / a `Makefile`, prefers checked-in wrappers (`./gradlew`, `./mvnw`, `make test`) over global tools, and confirms how *this* repo runs a single focused test vs. the full suite (README / CONTRIBUTING / CI show the commands that actually gate merges). AWE's discovered `commands.test` (`.cursor/state/awe-discovered.json` or optional `awe.config.json`) is the default — the coder verifies it matches the repo's real command and says so if it doesn't. Never assume `npm test`.

Then work the cycle per task:

```
RED                GREEN              REFACTOR
Write a test  →   minimal code   →   clean up,      →  repeat
that FAILS        to make it         tests still
                  PASS               PASS
```

- **RED** — a failing test first. A test that passes immediately proves nothing.
- **GREEN** — the minimum code to pass. Don't over-engineer.
- **REFACTOR** — with green tests, improve without changing behavior; re-run after each step.
- **Bug fixes use Prove-It:** reproduce the bug as a failing test *before* fixing it (see `awe-regression`).

Tests are proof — "seems right" is not done. Every new behavior lands with a test; the full suite passes before evidence is written.

4. **Spawn** `awe-backend-dev` / `awe-frontend-dev` when the assignee is `backend`/`frontend`; otherwise spawn **`awe-repo-dev`** with the repo slug in the brief and the child worktree path.
5. **When it returns**, sanity-check: did it report tests green? Does `.cursor/state/awe-evidence.json` exist with a fresh timestamp and `testsPassed: true`? (The stop hook will independently demand this.) Report the dev's end-of-run summary to the human, including "what to manually check".
6. **Next step:** if this chat is `/awe-run`, continue to `/awe-review <role>` without waiting for a new slash command. Otherwise tell the human: run `/awe-code <other-role>` in another chat to parallelize, or `/awe-review <role>` to review this role now.

## Rationalizations (code)

| Excuse | Reality |
|---|---|
| "I'll write tests after the code works" | You won't. And tests written after the fact test implementation, not behavior. |
| "This is too simple to test" | Simple code gets complicated. The test documents the expected behavior. |
| "Tests slow me down" | They slow you now and speed you up on every later change. |
| "I tested it manually" | Manual testing doesn't persist. Tomorrow's change breaks it silently. |
| "The code is self-explanatory" | Tests ARE the specification — what the code *should* do, not what it does. |
| "It's just a prototype" | Prototypes become production. Test debt compounds from day one. |
| "I'll assume `npm test`" | Discover *this* repo's command first — a Gradle/Cargo/pytest project has its own. A wrong default runs nothing. |

## Exit criteria

- Worktree + `awe/<ticket>-<role>` branch exist; handoff written; dev subagent ran; **every new behavior has a failing-first test and the full suite is green**; fresh evidence on disk; human knows the two possible next steps.
