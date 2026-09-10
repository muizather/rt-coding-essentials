---
name: awe-architect
description: Run the architecture phase — platform spec, DDD, contracts, gherkin E2E, spec slices in each repo's plans folder. Usage: /awe-architect
---

# awe-architect

**Purpose.** Turn the intake spec into a **platform spec** (not an implementation plan). Phase after success: `approve`. Follow `references/spec-plan.md`, `references/code-graph.md`, `references/ddd.md`.

## Procedure

1. **Gate check.** `.cursor/state/awe-state.json` must be `active: true` with `phase: architect`.
2. **Graph.** Follow `references/code-graph.md` (derive ignores, sequential `full` index, cross-repo-intelligence). Do not ask the human what to skip.
3. **DDD.** If `docs/domain-model/platform-manifest.json` is missing and `gitRepos.length > 1` (or the ticket is cross-repo), follow `ddd-domain-model` Phase 0–1 using **existing** indexes. If the manifest exists, read it + context-map + DDD open-questions. Do not dump every context JSON into the brief.
4. **Ingest answers.** Fold answered ticket questions into `intake.md`. Fold answered DDD questions from `docs/domain-model/open-questions.md`.
5. **Spawn `awe-architect`** with: ticket id, intake + ticket open-questions paths, `gitRepos` / `roles`, DDD `output_root`, instruction that **file lists and unit tests are forbidden**, gherkin is E2E only, spec slices go in each assignee’s `plans/<ticket>/`.
6. **Verify output** (`references/spec-plan.md`):
   - `plans/<ticket>/architecture.md` with repos + contract, **no source file paths**.
   - `plans/<ticket>/e2e/*.feature` exists (at least one scenario).
   - Every in-scope assignee has `spec.md` in **that repo’s** `plans/<ticket>/` (or `plans/<ticket>/<role>.spec.md` for a single git repo). Specs have no file lists.
   - Domain questions live in DDD `open-questions.md`; ticket questions in `plans/<ticket>/open-questions.md`.
7. **Write state**: `phase: approve`; each assignee `planStatus` matches its spec frontmatter (`draft` | `questions-open`).
8. **Tell the human**: 3–5 bullets, which repos, path to gherkin, how many DDD vs ticket questions remain, then `/awe-approve` (or answer questions first).

## Never clobber

If a spec already exists with `status` past draft and unchecked work, do not overwrite — same rule as before. Approved specs are contracts; re-open via the human.

## Exit criteria

- Architecture + gherkin + per-repo specs on disk; no implementation file lists; state `phase: approve`.
