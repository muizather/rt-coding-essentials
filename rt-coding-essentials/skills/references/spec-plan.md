# Spec vs implementation plans

Two different brains. Do not collapse them.

## Architect (high-level spec)

Sees: ticket intake, any `docs/awe/` briefing that exists (skip missing), graph at **root grain** (projects, clusters, route/channel names). Does **not** list source files or unit tests. Open questions are optional. Missing briefing docs never block the spec.

Writes:

1. `plans/<ticket>/architecture.md` — chosen approach + rejected alternatives, **backend vs frontend vs fullstack**, contracts (APIs / events / ownership), risks. No file lists.
2. `plans/<ticket>/e2e/*.feature` — **Gherkin end-to-end** scenarios for the feature. High-level tests of the spec. **Not** unit tests.
3. One spec slice per role: `plans/<ticket>/backend.spec.md` and/or `plans/<ticket>/frontend.spec.md` and/or `plans/<ticket>/fullstack.spec.md`

`spec.md` says **what** that role owes (behavior, contract side, which gherkin it must satisfy). Still no file paths, no unit-test names.

**Fullstack** is one role when the same git root owns the product UI and the server and there is no sibling SPA. Magento + a Next.js sibling is **not** fullstack — Magento is backend, Next is frontend.

Human approves **architecture + specs + gherkin**. That unlocks the code phase — not application source yet.

## Coding agent (low-level implementation)

Sees: approved spec for **its** role, the contract, the gherkin, any `docs/awe/` briefing that exists, and the **full graph of this repo** (file grain). If `docs/domain-model/` exists, use it; otherwise learn the domain from the graph.

Writes, **before any application source**:

1. `plans/<ticket>/<role>.implementation.plan.md` — files, unit tests, how, plus a **Security check** (today's advisories for packages it will use).
2. `plans/<ticket>/<role>.implementation-questions.md` — low-level questions for the human, or `No open questions.` A task cannot start while any `- [ ]` is open. The write-gate hook enforces this.

Then implements test-first against that implementation plan.

## Reviewer

Functional review is against **gherkin + spec AC + contract + the implementation plan**, not against “the whole codebase.” The reviewer writes a short testing plan from those artifacts, then hunts the diff. Optional `awe-security-reviewer` runs only when `securityReview` is true. Unit tests are the coder’s proof; gherkin is the spec bar **SMOKE runs with Playwright** on localhost (HTML report + video / API trace), then the human signs. The coder records each round in `reviews/round-N-response.md`.
