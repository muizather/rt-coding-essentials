---
name: awe-code
description: Start coding for one role — branch awe/<ticket>-<role>, optional worktree only when another plan is already implementing, writes handoff.md, spawns backend-dev or frontend-dev. Usage: /awe-code <role>
---

# awe-code

**Purpose.** Launch implementation for **backend** or **frontend** for **this ticket**. Phase stays `code` on this ticket only. Other in-flight plans are untouched.

There is no third coder. If the argument is not `backend` or `frontend`, STOP and tell the human.

## Procedure

1. **Gate check.** State `active: true`. This ticket (`state.ticket` or the named ticket) has `phase: code`, the role is `backend` or `frontend`, and `tickets.<id>.roles.<role>.planStatus == approved` (legacy: `roles.<role>.planStatus`).
2. **Dependencies.** Read `tickets.<id>.dependsOn` (and intake frontmatter `dependsOn`). If any listed ticket is still in `state.tickets` with `phase != done`:
   - You **may** write `*.implementation.plan.md` and `*.implementation-questions.md` (`mode: plan`).
   - You **must not** spawn implement or write application source. Tell the human which tickets are blocking. Independent tickets can still be implemented in another chat.
3. **Branch, and worktree only if parallel.** Always use branch `awe/<ticket>-<role>` cut from `baseBranch`. **Do not create a worktree by default.**

   Create `.worktrees/<ticket>-<role>` **only when** another in-flight ticket is already in `code|review|verify|ship` (it holds a branch), **or** the main tree is already on `awe/<other-ticket>-*`. That is the git-worktree case: two plans implementing at once without clobbering each other.

```bash
REPO=<workspace git root>
git -C "$REPO" fetch origin <baseBranch>
# Parallel — another plan already occupies a branch:
git -C "$REPO" worktree add "$REPO/.worktrees/<ticket>-<role>" -b awe/<ticket>-<role> origin/<baseBranch>
# Solo (this is the only implementing ticket) — main tree, no worktree:
git -C "$REPO" checkout -B awe/<ticket>-<role> origin/<baseBranch>
```

   Reuse the branch on re-runs. If checkout cannot proceed (dirty tree that is not this branch), use a worktree as the escape hatch and say so. Uncommitted `.cursor/` hooks, `plans/`, and gitignored `.cursor/state/` stay in the **workspace root**; they are not copied by `git worktree add`. Write plans and state in the workspace; write application source in the worktree only when one exists.

4. **Decide mode** from artifacts (hook-enforced):
   - Missing `plans/<ticket>/<role>.implementation.plan.md` or `*.implementation-questions.md` → **`mode: plan`**
   - Questions file has any `- [ ]` → **STOP**. Tell the human to answer, then re-run `/awe-code <role>`. Do not spawn implement.
   - Unmet `dependsOn` → **`mode: plan` only**. After plan files exist, STOP for the dependency; do not spawn implement.
   - Plan exists, questions closed, dependsOn done → **`mode: implement`**

5. **Write `plans/<ticket>/handoff.md`** (workspace, append-only):

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
## Review response
plans/<ticket>/reviews/round-<N>-response.md (each finding → fixed | rebutted | deferred) or "none yet"
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

6. **Spawn** `awe-backend-dev` or `awe-frontend-dev` only. Brief includes `mode: plan` or `mode: implement`. Do **not** spawn implement while `dependsOn` is unmet.
7. **When plan mode returns:**
   - If `*.implementation-questions.md` still has `- [ ]` → tell the human where to answer. **Do not** continue to implement or to `/awe-review`.
   - If `dependsOn` is unmet → tell the human which tickets must reach `done`. **Do not** spawn implement.
   - If no open boxes and dependsOn done → immediately spawn again with `mode: implement` (same chat), unless the human asked to read the plan first.
8. **When implement mode returns:** sanity-check tests green and `.cursor/state/awe-evidence.json` (`testsPassed: true`, fresh). If this was a review fix round, confirm `plans/<ticket>/reviews/round-<N>-response.md` maps every finding. Append `ticket-updates.md`. Report what to manually check.
9. **Next step (implement only):** if this chat is `/awe-run`, continue to `/awe-review <role>`. Otherwise tell the human: `/awe-code <other-role>` in another chat, or `/awe-review <role>`.

## Rationalizations (code)

| Excuse | Reality |
|---|---|
| "I'll write tests after the code works" | You won't. And tests written after the fact test implementation, not behavior. |
| "This is too simple to test" | Simple code gets complicated. The test documents the expected behavior. |
| "I know which files from the spec" | The spec has no files. You learned them from the graph. |
| "Open questions can wait until the PR" | The hook blocks source until they are checked. Answer first. |
| "I'll assume `npm test`" | Discover *this* repo's command first. |
| "The model already knows if this package is safe" | Training cutoff. Search today's advisories before you add or copy it. |
| "Another ticket is open so I cannot start this plan" | Plans are not exclusive. Record `dependsOn` if needed; only **code** waits. |
| "Always make a worktree" | Worktrees exist to isolate **parallel** implementation. One implementing ticket uses the main tree. |

## Exit criteria

- **Plan stop:** implementation plan + questions on disk; human knows to answer, that implement will start, or that a `dependsOn` ticket must finish first.
- **Implement done:** branch `awe/<ticket>-<role>` exists (worktree only if parallel); TDD; fresh evidence; human knows review vs the other role.
