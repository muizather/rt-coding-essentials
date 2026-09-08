---
name: awe-code
description: Start coding for one role — creates a worktree + awe/<ticket>-<role> branch, writes handoff.md, spawns the role dev subagent. Usage: /awe-code <role>
disable-model-invocation: true
---

# awe-code

**Purpose.** Launch implementation for one role, in isolation. Roles run in parallel; each gets its own git worktree and branch. Phase stays `code`.

## Procedure

1. **Gate check.** State `active: true`, `phase: code`, and `roles.<role>.planStatus == approved`. The subagent-gate hook enforces this too — if either check fails, stop and say what is missing (usually: `/awe-approve` hasn't run).
2. **Create the worktree + branch** from the configured base branch (`baseBranch` in `awe.config.json`):

```bash
git fetch origin <baseBranch>
git worktree add .worktrees/<ticket>-<role> -b awe/<ticket>-<role> origin/<baseBranch>
```

   If the branch already exists (a re-run or fix round), reuse it: `git worktree add .worktrees/<ticket>-<role> awe/<ticket>-<role>` or just `cd` into the existing worktree.
3. **Write `plans/<ticket>/handoff.md`** (shared, append-only across rounds — devs read it first):

```markdown
# Handoff — <ticket> / <role>
- Plan: plans/<ticket>/<role>.plan.md (status: approved)
- Contract: plans/<ticket>/architecture.md § Contract
- Iteration: <N> of <reviewIterations>
## Expectations
- Implement only the plan; build cross-role deps against contract stubs.
- Work test-first (see "TDD" below): a failing test before the code that makes it pass.
- Run `<test command>`; write .cursor/state/awe-evidence.json when green.
## Prior review findings
<latest round's findings verbatim, or "none yet">
```

### Test-driven development (the coder's loop)

Adapted from agent-skills `test-driven-development` (MIT, Addy Osmani 2025 — see NOTICE).

**Discover the repo's own test commands first.** The TDD cycle is universal; the commands are not. Before the first test, the coder reads `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` / a `Makefile`, prefers checked-in wrappers (`./gradlew`, `./mvnw`, `make test`) over global tools, and confirms how *this* repo runs a single focused test vs. the full suite (README / CONTRIBUTING / CI show the commands that actually gate merges). AWE's `commands.test` in `awe.config.json` is the configured default — the coder verifies it matches the repo's real command and says so if it doesn't. Never assume `npm test`.

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

4. **Spawn the `awe-<role>-dev` subagent** pointed at the worktree path with the handoff path in the brief.
5. **When it returns**, sanity-check: did it report tests green? Does `.cursor/state/awe-evidence.json` exist with a fresh timestamp and `testsPassed: true`? (The stop hook will independently demand this.) Report the dev's end-of-run summary to the human, including "what to manually check".
6. **Next step for the human**: run `/awe-code <other-role>` in another chat to parallelize, or `/awe-review <role>` to review this role now.

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
