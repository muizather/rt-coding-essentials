---
name: awe-architect
description: Run the architecture phase — spawns the awe-architect subagent to produce architecture.md and per-role plans. Usage: /awe-architect
---

# awe-architect

**Purpose.** Turn the intake spec into an architecture and one approved-ready plan per role. Phase after success: `approve`.

## Procedure

1. **Gate check.** `.cursor/state/awe-state.json` must be `active: true` with `phase: architect`. If `phase` is anything else, stop and tell the human the current phase (skills only move forward; use `/awe-regression` to re-enter).
2. **Ingest answers.** Read `plans/<ticket>/open-questions.md`: fold every answered question into `intake.md` (assumptions/constraints) so the architect sees one coherent spec.
3. **Spawn the `awe-architect` subagent** with this brief: ticket id, paths to `intake.md` and `open-questions.md`, the discovered or configured `roles`, and instruction that **codebase-memory graph tools are required** (`search_graph`, `trace_path`, `get_architecture`). If those tools are missing, STOP — do not fall back to a blind file walk. (The subagent-gate hook independently verifies the phase.)
4. **Verify its output contract** after it returns (full contract in `references/plan-task-template.md`):
   - `plans/<ticket>/architecture.md` exists with a dependency graph and an explicit cross-role contract.
   - `plans/<ticket>/<role>.plan.md` exists for each configured role, frontmatter `status` is `draft` or `questions-open`, and **every task follows the task template**: a description, checkbox **acceptance criteria** (testable), a **verification** step naming the repo's own test/build command, **files likely touched**, a **depends-on** list, and an **XS–XL size**. S/M tasks are ideal; anything L or larger must be broken down further.
   - Tasks are **sliced vertically** (complete feature paths) and **ordered by the dependency graph** (foundations first), with a verification checkpoint every 2–3 tasks.
   - If any plan is `questions-open`, the questions exist as unchecked items in `open-questions.md`.
5. **Write state**: set `phase: approve`, keep each role's `planStatus` in sync with its plan frontmatter (`draft` or `questions-open`), update `updatedAt`.
6. **Tell the human**: summary of the architecture in 3-5 bullets, the per-role plan list, how many open questions remain, and exactly what to do next — answer questions (edit `open-questions.md`, then `/awe-architect` again) or run `/awe-approve`.

## Never clobber an incomplete plan

Adapted from agent-skills `planning-and-task-breakdown` (MIT, Addy Osmani 2025 — see NOTICE). If a plan already exists for this ticket with **unchecked tasks**, do not overwrite it on your own — those tasks may be mid-build in another session. Replanning the *same* work → update in place; *different* work → stop and ask the human. Once a plan is `approved`, it is a contract: the `pre-tool-gate.mjs` **plan-clobber guard** hard-denies any write that removes content from a non-draft plan (appends and status-only flips are allowed). Change the substance by asking the human to re-open the plan to `draft`, or by cutting a new ticket.

## Rationalizations (architect)

| Excuse | Reality |
|---|---|
| "I'll figure it out as I go" | That's how you get a tangled mess and rework. Ten minutes of planning saves hours. |
| "The tasks are obvious" | Write them down anyway. Explicit tasks surface hidden dependencies and forgotten edge cases. |
| "Planning is overhead" | Planning *is* the task. Implementation without a plan is just typing. |
| "I can hold it all in my head" | Context windows are finite. Written plans survive session boundaries and compaction. |
| "The old plan is stale, I'll just replace it" | Unchecked tasks may be mid-build elsewhere. Overwriting destroys work state that exists nowhere else. Stop and ask. |
| "One big task is simpler" | XL tasks are where agents flounder. S/M tasks with acceptance criteria are what actually complete. |

## Exit criteria

- Architecture + role plans on disk (each task templated, sized XS–XL, vertically sliced, dependency-ordered); state `phase: approve`; human told precisely what their approval gate needs.
