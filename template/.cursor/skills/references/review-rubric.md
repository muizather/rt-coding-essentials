<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), Copyright (c) 2025 Addy Osmani, MIT License — see NOTICE. -->
<!-- Source: skills/code-review-and-quality. The shared rubric for awe-review and the awe-reviewer agent. -->

# Review Rubric — Five Axes, Severity Labels, Approval Standard

## The approval standard

Approve a change when it **definitely improves overall code health**, even if it isn't perfect. Perfect code doesn't exist — the goal is continuous improvement. Don't block a change because it isn't exactly how you would have written it. If it improves the codebase and follows the project's conventions, approve it. (The flip side, for AWE: a single **Critical** finding fails the iteration — see severity below.)

## The five axes

Every review evaluates the diff across these dimensions:

1. **Correctness** — does it do what it claims? Match the spec/plan and acceptance criteria; edge cases (null, empty, boundary); error paths not just the happy path; tests actually test the right things; no off-by-one, race, or state inconsistency.
2. **Readability & simplicity** — could another engineer/agent understand it without the author? Descriptive names; straightforward control flow (no nested ternaries/deep callbacks); logical organization; no "clever" tricks; **could this be fewer lines**; abstractions earning their complexity (don't generalize before the third use); no dead code (no-op vars, compat shims, `// removed`); no new conditional bolted onto an unrelated flow (a design smell, not a nit).
3. **Architecture** — does it fit the system's design? Follows existing patterns (or a justified new one); clean module boundaries; no circular deps; appropriate abstraction level; **a refactor must reduce complexity, not relocate it** — count the concepts a reader must hold; prefer deleting an abstraction to polishing it; no feature logic leaking into a shared module; explicit type boundaries (question gratuitous `any`/casts/silent fallbacks).
4. **Security** — see `security-review-checklist.md`. Input validated at boundaries; secrets out of code/logs/VCS; authz checked; parameterized queries; output encoded; dependencies trusted; external data treated as untrusted.
5. **Performance** — N+1 queries; unbounded loops/fetching; sync ops that should be async; unnecessary re-renders; missing pagination; large objects in hot paths.

### Structural remedies (propose the move, not just the problem)

A review that only says "this is complex" leaves the author guessing. Name the restructuring: replace a conditional chain with a typed model/dispatcher; collapse duplicate branches; separate orchestration from business logic; move feature logic out of a shared module; reuse the canonical helper instead of a near-duplicate; make a type boundary explicit so downstream branching disappears; delete a pass-through wrapper; extract a helper or split a large file. Prefer the remedy that **removes moving pieces** over one that spreads the same complexity around.

## Severity labels

Label every finding so the author knows what's required vs. optional — this prevents treating all feedback as mandatory and wasting time on nits.

| Label | Meaning | Author action | AWE verdict impact |
|---|---|---|---|
| **Critical** | Blocks merge — security vuln, data loss, broken functionality | Must fix | **Iteration fails → needs-fix** |
| **Required** | Necessary change (correctness, a real structural regression) | Must address before merge | needs-fix |
| **Optional** / **Consider** | Suggestion worth weighing | May defer with a note | does not block alone |
| **Nit** | Minor style/preference | May ignore | never blocks |
| **FYI** | Informational only, context for later | No action | never blocks |

Map to the AWE findings schema (`severity: critical|high|medium|low`): Critical→`critical`, Required→`high`, Optional→`medium`, Nit/FYI→`low`. A `needs-fix` verdict requires at least one `critical`/`high`; don't burn an iteration on `medium`/`low`.

**Lead with what matters.** Order findings by leverage: correctness and security first, then structural regressions and missed simplifications, then everything else. Don't bury a real issue under cosmetic nits — a few high-conviction comments beat a long list. If you have one structural problem and ten nits, the structural problem *is* the review.

## Change sizing

- ~100 lines changed → good, reviewable in one sitting. ~300 → acceptable if a single logical change. ~1000 → too large, split it.
- **Watch file size, not just diff size.** A small diff can push a file past ~1000 total lines (an inspection signal, not a hard cap). When a change materially grows an already-large file, ask whether to decompose *first*, then add.
- **Separate refactoring from feature work.** A change that does both is two changes — submit them separately.
- **"What counts as one change":** a single self-contained modification addressing one thing, with related tests, keeping the system functional. One part of a feature — not the whole feature.

## Honesty in review

- **Don't rubber-stamp.** "LGTM" without evidence of review helps no one.
- **Don't soften real issues.** "Might be a minor concern" about a production-bound bug is dishonest.
- **Quantify** when possible: "this N+1 adds ~50ms per item" beats "could be slow".
- **Push back on approaches with clear problems.** Sycophancy is a failure mode; propose alternatives.
- **Accept override gracefully.** If the author has full context and disagrees, defer — comment on code, not people.
- **Don't accept "I'll clean it up later."** Deferred cleanup rarely happens; require it before merge, or file a ticket.

## Rationalizations (review)

| Excuse | Reality |
|---|---|
| "It works, that's good enough" | Working code that's unreadable, insecure, or architecturally wrong creates debt that compounds. |
| "I wrote it, so I know it's correct" | Authors are blind to their own assumptions. Every change benefits from another set of eyes. |
| "We'll clean it up later" | Later never comes. The review is the quality gate — use it. |
| "AI-generated code is probably fine" | AI code needs *more* scrutiny, not less. It's confident and plausible, even when wrong. |
| "The tests pass, so it's good" | Tests are necessary but not sufficient — they don't catch architecture, security, or readability problems. |
| "The refactor makes it cleaner" | Relocating complexity isn't reducing it. If the reader holds the same number of concepts, look for the version where branches disappear. |
| "It's only a small addition to this file" | Small diffs still push files past a healthy size and bolt branches onto unrelated flows. Judge the resulting structure, not the diff size. |
