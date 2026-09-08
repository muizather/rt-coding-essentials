<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), Copyright (c) 2025 Addy Osmani, MIT License — see NOTICE. -->
<!-- Source: skills/planning-and-task-breakdown. The task/plan output contract for the awe-architect agent. -->

# Plan & Task Template (architect output contract)

Decompose the spec into small, verifiable tasks with explicit acceptance criteria. Every task should be small enough to implement, test, and verify in a single focused session. The awe-architect emits one `<role>.plan.md` per role; each plan's tasks follow this contract.

## Slice vertically, order by dependency

Build one complete feature path at a time, not all-database-then-all-API-then-all-UI. Implementation order follows the dependency graph bottom-up (foundations first). Each task leaves the system in a working state; put a verification checkpoint after every 2–3 tasks and put high-risk tasks early (fail fast).

```
GOOD (vertical):                      BAD (horizontal):
Task 1: user can create account        Task 1: entire DB schema
Task 2: user can log in                Task 2: all API endpoints
Task 3: user can create a task         Task 3: all UI components
```

## Task template (every task in a plan)

```markdown
## Task [N]: [short descriptive title]

**Description:** One paragraph on what this accomplishes.

**Acceptance criteria:**
- [ ] [specific, testable condition]
- [ ] [specific, testable condition]

**Verification:**
- [ ] Tests pass: [the repository's focused-test command]
- [ ] Build succeeds: [the repository's build command]
- [ ] Manual check: [what to verify]

**Depends on:** [task numbers, or "None"]

**Files likely touched:**
- `src/path/to/file.ts`
- `tests/path/to/test.ts`

**Estimated scope:** XS | S | M | L | XL
```

## Task sizing

| Size | Files | Scope | Example |
|---|---|---|---|
| **XS** | 1 | Single function or config change | Add a validation rule |
| **S** | 1–2 | One component or endpoint | Add a new API endpoint |
| **M** | 3–5 | One feature slice | User registration flow |
| **L** | 5–8 | Multi-component feature | Search with filter + pagination |
| **XL** | 8+ | **Too large — break it down further** | — |

An agent performs best on **S and M** tasks. Break a task down further when: it would take more than one focused session; you can't describe its acceptance criteria in ≤3 bullets; it touches two or more independent subsystems; or you find yourself writing "and" in the title (that's two tasks).

## Never clobber an incomplete plan

Before writing a plan that already exists with unchecked tasks: **same work being replanned** → update in place; **different work** → stop and ask. Unchecked tasks may be mid-build in another session — overwriting them destroys work state that exists nowhere else. In AWE this is enforced two ways:
- **By the architect:** an approved plan is a contract; revise it only through the human (re-open to `draft`) or a new ticket.
- **By the hook:** `pre-tool-gate.mjs` denies any write that *removes content* from a plan whose frontmatter `status` is past `draft`/`questions-open` (appends and status-only flips are allowed). Don't try to route around it.

## Parallelization

- **Safe to parallelize:** independent feature slices, tests for already-built features, docs.
- **Must be sequential:** DB migrations, shared-state changes, dependency chains.
- **Needs coordination:** features sharing an API contract — define the contract first (AWE's `architecture.md` § Contract), then parallelize. This is exactly how AWE runs per-role dev agents on separate worktrees.

## Plan frontmatter (AWE)

Each `<role>.plan.md` carries frontmatter the pipeline reads: `status: draft | questions-open | approved` (set to `approved` only by `/awe-approve`), plus the role and ticket. Keep `status` accurate — the subagent-gate and plan-clobber guard both read it.
