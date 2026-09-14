<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), Copyright (c) 2025 Addy Osmani, MIT License — see NOTICE. -->
<!-- Source: skills/planning-and-task-breakdown. The task/plan output contract for the awe-architect agent. -->

# Plan & Task Template (implementation plan — coding agents)

The **platform architect** does **not** use this template. Architect output is `architecture.md` + gherkin E2E + per-repo `spec.md` (see `spec-plan.md`).

**Coding agents** emit `implementation.plan.md` with this task contract (files + **unit tests**). Gherkin under `plans/<ticket>/e2e/` is the feature E2E bar and is not duplicated here.

Always also write `plans/<ticket>/<role>.implementation-questions.md` in the same pass. The write-gate blocks application source until that file exists and has no open `- [ ]`. Zero questions is valid (`No open questions.`).

## Security check (training cutoff)

Before listing a third-party package or a copied snippet in **Files likely touched** / new dependencies, search **today's** OSV / NVD / GitHub Advisories for that name and version. Record:

```markdown
## Security check
- `package@version` — searched <source> on <date> — <clean | CVE-… patched in …>
```

A model does not know about a vuln published after its training date until it looks it up. If a patch already exists, plan for the patched version.

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
- **Needs coordination:** features sharing an API contract — define the contract first (AWE's `architecture.md` § Contract), then parallelize. Cross-ticket: set `dependsOn` on the later plan; implementation waits, intake does not.

## Plan frontmatter (AWE)

Each `implementation.plan.md` carries frontmatter `status: draft | questions-open | ready`. **Specs** (`<role>.spec.md`) are what `/awe-approve` flips to `approved`. Implementation plans are written in the **code** phase by coding agents. `ready` means questions are closed and source may be written; it is not a second architect approval.
