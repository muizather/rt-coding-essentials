# VERIFY — runtime E2E against the architect bar

Gherkin under `plans/<ticket>/e2e/*.feature` plus intake acceptance criteria are the bar. The verifier **runs** that bar on localhost. Unit tests and the reviewer are not a substitute.

Playwright is **mandatory**. Frontend scenarios use a browser (video). Backend scenarios use Playwright `APIRequestContext` (trace). Combined flows use both. Pin **`@playwright/test@1.61.0`** (current as of 2026-09-14). Do not add it without an explicit human yes.

## 1. Discover how this workspace runs (do not invent)

Read `.cursor/state/awe-discovered.json` → `local`. Session-start writes it via `discoverLocalRun`. If `local.start` is missing, **ask the human once** how to boot the slice this ticket needs, then record the answer in discovered state. Never point VERIFY at staging/prod (`envUrls` are for post-merge only).

From discovery + the code graph:

- How to start each in-scope service (`npm run dev` / `start` / `docker compose up`, ports only if they are already in the repo — not guessed).
- How services call each other (graph CROSS_* / routes). One git root is a single project; a parent folder of child git repos is a family. There is no extra “architect folder.”
- What this ticket **must** run vs **mock or skip** (other role’s contract stub, payments, email, SSO, unused apps) so only the coded slice is exercised.

Write the slice for this ticket as `plans/<ticket>/local-run.md`: services up, mocks on, gherkin in scope, files that coverage should hit.

If you cannot start the slice locally, **STOP**. Do not fake E2E.

## 2. Playwright from Gherkin

Specs live under `plans/<ticket>/e2e/` (verify may write `plans/` and `.cursor/state/`, not application source):

- `playwright.config.ts` — `video: 'on'`, `trace: 'on'`, `screenshot: 'on'`, `baseURL` from local discovery, output under `.cursor/state/verify/<ticket>/` (gitignored).
- One spec file per `.feature`, scenarios mapped **1:1**. Tag `@backend` for API-only; untagged/default is browser.
- Backend tests: `playwright.request` against the local API. No browser, no second HTTP framework.
- Frontend / combined: browser actions that match the Gherkin steps; assert observable UI **and** API side effects when the scenario names them.

First time the app repo has no `@playwright/test`: ask to add `1.61.0` as a devDependency and run `npx playwright install chromium`. No yes → stop; VERIFY cannot skip Playwright.

## 3. Run, loop, evidence

Run against localhost only (`npx playwright test -c plans/<ticket>/e2e`). Coverage: collect if the repo already has a Playwright/v8 coverage hook; otherwise note which ticket-touched files the trace/network hit. Coverage is evidence of the slice, not a new numeric gate unless `CONSTRAINTS.md` already has one.

**Fail** → structured findings (same schema as review: `file`, `line`, `severity`, `category`, `evidence`, `suggested_fix`). Orchestrator sets phase `code`, increments `verifyIteration`, appends `handoff.md`, respawns the matching coder. Budget is `reviewIterations` (default 3) **on this verify counter, independent of review rounds**. Exhausted → `ESCALATION.md` and stop.

**Green** → write `.cursor/state/awe-verify-evidence.json`:

```json
{
  "playwrightPassed": true,
  "command": "npx playwright test -c plans/<ticket>/e2e",
  "video": ".cursor/state/verify/<ticket>/…webm",
  "trace": ".cursor/state/verify/<ticket>/…zip",
  "at": "<ISO-8601>"
}
```

Then write `plans/<ticket>/verification.md`: path to the **video** (frontend/combined) and/or **trace** (`npx playwright show-trace <path>` for backend), plus numbered **human** steps for the same scenarios so a person can repeat them. Human still sets `verified: true` + initials + date after watching.

A failed human step after a green script is stop-the-line → `/awe-regression`. Do not patch application source in phase `verify`.
