---
name: awe-code
description: Start coding for one role — creates a worktree + awe/<ticket>-<role> branch, writes handoff.md, spawns backend-dev or frontend-dev. Usage: /awe-code <role>
---

# awe-code

**Purpose.** Launch implementation for **backend** or **frontend**, in isolation. Roles run in parallel; each gets its own git worktree and branch. Phase stays `code`.

There is no third coder. If the argument is not `backend` or `frontend`, STOP and tell the human.

## Procedure

1. **Gate check.** State `active: true`, `phase: code`, role is `backend` or `frontend`, and `roles.<role>.planStatus == approved`.
2. **Create the worktree + branch** from the workspace git root and `baseBranch`:

```bash
REPO=<workspace git root>
git -C "$REPO" fetch origin <baseBranch>
git -C "$REPO" worktree add "$REPO/.worktrees/<ticket>-<role>" -b awe/<ticket>-<role> origin/<baseBranch>
```

   Reuse the branch on re-runs.

3. **Decide mode** from artifacts (hook-enforced):
   - Missing `plans/<ticket>/<role>.implementation.plan.md` or `*.implementation-questions.md` → **`mode: plan`**
   - Questions file has any `- [ ]` → **STOP**. Tell the human to answer, then re-run `/awe-code <role>`. Do not spawn implement.
   - Plan exists and questions file has no open boxes → **`mode: implement`**

4. **Write `plans/<ticket>/handoff.md`** (workspace, append-only):

```markdown
# Handoff — <ticket> / <role>
- Mode: plan | implement
- Spec: plans/<ticket>/<role>.spec.md (approved) — high-level what/AC/contract
- Contract: plans/<ticket>/architecture.md § Contract
- Gherkin: plans/<ticket>/e2e/*.feature
- Implementation plan: plans/<ticket>/<role>.implementation.plan.md
- Implementation questions: plans/<ticket>/<role>.implementation-questions.md
- Iteration: <N> of <reviewIterations>
## Expectations
- Plan mode: files + unit tests + security advisory search + questions. No application source.
- Implement mode: only after every implementation question is checked. TDD.
- Gherkin is E2E spec; unit tests are yours.
- Run this repo’s test command; write awe-evidence.json when green.
## Prior review findings
<latest round or "none yet">
```

### Test-driven development (implement mode)

Adapted from agent-skills `test-driven-development` (MIT, Addy Osmani 2025 — see NOTICE).

**Discover the repo's own test commands first.** The TDD cycle is universal; the commands are not. Before the first test, the coder reads `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` / a `Makefile`, prefers checked-in wrappers (`./gradlew`, `./mvnw`, `make test`) over global tools, and confirms how *this* repo runs a single focused test vs. the full suite. AWE's discovered `commands.test` is the default — the coder verifies it matches. Never assume `npm test`.

```
RED                GREEN              REFACTOR
Write a test  →   minimal code   →   clean up,      →  repeat
that FAILS        to make it         tests still
                  PASS               PASS
```

- **Bug fixes use Prove-It:** reproduce as a failing test *before* fixing (`/awe-regression`).

5. **Spawn** `awe-backend-dev` or `awe-frontend-dev` only. Brief includes `mode: plan` or `mode: implement`.
6. **When plan mode returns:**
   - If `*.implementation-questions.md` still has `- [ ]` → tell the human where to answer. **Do not** continue to implement or to `/awe-review`.
   - If no open boxes → immediately spawn again with `mode: implement` (same chat), unless the human asked to read the plan first.
7. **When implement mode returns:** sanity-check tests green and `.cursor/state/awe-evidence.json` (`testsPassed: true`, fresh). Report what to manually check.
8. **Next step (implement only):** if this chat is `/awe-run`, continue to `/awe-review <role>`. Otherwise tell the human: `/awe-code <other-role>` in another chat, or `/awe-review <role>`.

## Rationalizations (code)

| Excuse | Reality |
|---|---|
| "I'll write tests after the code works" | You won't. And tests written after the fact test implementation, not behavior. |
| "This is too simple to test" | Simple code gets complicated. The test documents the expected behavior. |
| "I know which files from the spec" | The spec has no files. You learned them from the graph. |
| "Open questions can wait until the PR" | The hook blocks source until they are checked. Answer first. |
| "I'll assume `npm test`" | Discover *this* repo's command first. |
| "The model already knows if this package is safe" | Training cutoff. Search today's advisories before you add or copy it. |

## Exit criteria

- **Plan stop:** implementation plan + questions on disk; human knows to answer or that implement will start.
- **Implement done:** worktree + branch exist; TDD; fresh evidence; human knows review vs the other role.
