---
name: awe-architect
description: Run the architecture phase — high-level spec, contract, gherkin E2E, per-role spec slices (backend / frontend / fullstack). Usage: /awe-architect
---

# awe-architect

**Purpose.** Turn the intake spec into a **high-level spec** (not an implementation plan). Phase after success: `approve`. Follow `references/spec-plan.md` and `references/code-graph.md`.

The architect knows the system and the ticket. Coding agents know the files. Do not collapse those jobs. Read `references/project-briefing.md` when `docs/awe/` exists. Missing briefing files never stop this phase.

## Procedure

1. **Gate check.** `.cursor/state/awe-state.json` must be `active: true`. This ticket is in `phase: architect` (in `tickets.<id>` or legacy top-level). Other tickets may be in any phase — do not wait on them.
2. **Project briefing (optional).** If `docs/awe/` exists, read the files that exist (`product.md`, `project-map.md`, `architecture.md`, `connections.md`, `deployment.md`, `features/*`). Do **not** create a stub just because the folder is empty. Missing map → continue with discovery + graph.
3. **Graph.** Follow `references/code-graph.md` (derive ignores, sequential `full` index). Root grain only for the architect brief — fill gaps the briefing does not cover.
4. **Existing domain docs.** If `docs/domain-model/` exists, read manifest + context-map for ownership language. Do **not** run DDD reverse-engineering. Coders go deep.
5. **Ingest answers.** Fold any answered ticket questions into `intake.md`. Architect questions are optional — if none were written, that is fine.
6. **Spawn `awe-architect`** with: ticket id, intake + open-questions paths, discovered roles (`backend` / `frontend` / `fullstack`), any `docs/awe/` paths that exist, instruction that **file lists and unit tests are forbidden**, gherkin is E2E only, specs go in `plans/<ticket>/<role>.spec.md`, and the **Decision surface is mandatory** — product-level decisions (input constraints, placement/business logic, ownership/persistence, edge cases, scope) are decided-with-rationale in `architecture.md` or asked as options with trade-offs; they must not leak into implementation plans. A Magento repo with a sibling Next.js SPA is **not** fullstack.
7. **Check output** (`references/spec-plan.md`):
   - `plans/<ticket>/architecture.md` with contract and a **Decision surface** section, **no source file paths**.
   - `plans/<ticket>/e2e/*.feature` exists (at least one scenario).
   - Every in-scope role has `plans/<ticket>/<role>.spec.md` with no file lists. Roles are only `backend`, `frontend`, and `fullstack`.
   - Any new open questions carry **options + a recommendation**, not just a leading guess.
7b. **Ask architect questions in chat.** If `open-questions.md` has open `- [ ]` items, present each with Cursor's structured question prompt (the architect's recommendation as the first option, then the alternatives it listed; "Other" always available). Record answers back into the file (`- [x]` + `A:`). Skipped/dismissed questions stay open and the affected specs stay `questions-open` — do not treat silence as an answer.
8. **Briefing delta (optional).** If this ticket taught a lasting product / architecture / connection / deploy fact, the orchestrator (not the read-only subagent) updates the matching `docs/awe/` file, or adds one. Same surface → edit the existing section. Nothing new → **do not write docs**. Never block approve on docs.
9. **Write state**: this ticket `phase: approve`; each role `planStatus` matches its spec frontmatter (`draft` | `questions-open`). Missing questions file / empty questions → `draft`. Update `tickets.<id>` **and** session focus (`ticket`/`phase`/`roles`). Leave other tickets unchanged.
10. **Tell the human**: 3–5 bullets, path to gherkin, whether any architect questions exist (zero is OK), then `/awe-approve` (or answer questions first).

## Never clobber

If a spec already exists with `status` past draft and unchecked work, do not overwrite. Approved specs are contracts; re-open via the human.

## Exit criteria

- Architecture + gherkin + per-role specs on disk; no implementation file lists; state `phase: approve`.
