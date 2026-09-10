# Spec vs implementation plans

Two different brains. Do not collapse them.

## Platform architect (spec)

Sees: ticket intake, DDD, graph at **root grain** (projects, clusters, route/channel names, CROSS_* edges). Does **not** list source files or unit tests.

Writes:

1. `plans/<ticket>/architecture.md` — in-scope contexts, chosen approach + rejected alternatives, **which child repos**, contracts (APIs / events / ownership), risks. No file lists.
2. `plans/<ticket>/e2e/*.feature` — **Gherkin end-to-end** scenarios for the feature (happy path + important failures). These are the high-level tests of the spec. **Not** unit tests.
3. One spec slice per assignee, in **that repo’s plan folder**:
   - Multi-git family: `<repo>/plans/<ticket>/spec.md`
   - Single git (roles backend/frontend): `plans/<ticket>/<role>.spec.md`

`spec.md` says **what** that repo owes (behavior, contract side, which gherkin scenarios it must satisfy). Still no file paths, no unit-test names.

Human approves **architecture + specs + gherkin**. That unlocks code.

## Repo coding agent (implementation)

Sees: approved spec for **its** repo, the contract, the gherkin scenarios it must enable, and the **full graph of that repo only**.

Writes `<repo>/plans/<ticket>/implementation.plan.md` (or `plans/<ticket>/<role>.implementation.plan.md` in a single repo) **before** coding: files, unit tests, how. Unit tests are derived here — they are not the architect’s gherkin.

Then implements test-first against that implementation plan.

## Reviewer

Functional review is against **gherkin + spec AC + contract**, not against “the whole codebase.” The reviewer does not need Magento+Nest+blog in context. Security review still reads **this repo’s diff**. Unit tests are the coder’s proof; gherkin is the spec bar the human verify step also uses.
