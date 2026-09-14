---
name: awe-architect
description: Run the architecture phase — high-level spec, contract, gherkin E2E, backend/frontend spec slices. Usage: /awe-architect
---

# awe-architect

**Purpose.** Turn the intake spec into a **high-level spec** (not an implementation plan). Phase after success: `approve`. Follow `references/spec-plan.md` and `references/code-graph.md`.

The architect knows the system and the ticket. Coding agents know the files. Do not collapse those jobs.

## Procedure

1. **Gate check.** `.cursor/state/awe-state.json` must be `active: true` with `phase: architect`.
2. **Graph.** Follow `references/code-graph.md` (derive ignores, sequential `full` index). Root grain only for the architect brief.
3. **Existing domain docs.** If `docs/domain-model/` exists, read manifest + context-map for ownership language. Do **not** run DDD reverse-engineering. Coders go deep.
4. **Ingest answers.** Fold any answered ticket questions into `intake.md`. Architect questions are optional — if none were written, that is fine.
5. **Spawn `awe-architect`** with: ticket id, intake + open-questions paths, roles (`backend` and/or `frontend` only), instruction that **file lists and unit tests are forbidden**, gherkin is E2E only, specs go in `plans/<ticket>/<role>.spec.md`.
6. **Verify output** (`references/spec-plan.md`):
   - `plans/<ticket>/architecture.md` with contract, **no source file paths**.
   - `plans/<ticket>/e2e/*.feature` exists (at least one scenario).
   - Every in-scope role has `plans/<ticket>/<role>.spec.md` with no file lists. Roles are only `backend` and `frontend`.
7. **Write state**: `phase: approve`; each role `planStatus` matches its spec frontmatter (`draft` | `questions-open`). Missing questions file / empty questions → `draft`.
8. **Tell the human**: 3–5 bullets, path to gherkin, whether any architect questions exist (zero is OK), then `/awe-approve` (or answer questions first).

## Never clobber

If a spec already exists with `status` past draft and unchecked work, do not overwrite. Approved specs are contracts; re-open via the human.

## Exit criteria

- Architecture + gherkin + per-role specs on disk; no implementation file lists; state `phase: approve`.
