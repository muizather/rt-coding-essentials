# SMOKE — runtime E2E against the architect bar

Gherkin under `plans/<ticket>/e2e/*.feature` plus intake acceptance criteria are the bar. The **smoke tester** **runs** that bar on localhost. Unit tests and the reviewer are not a substitute.

Playwright is **mandatory**. Frontend scenarios use a browser (video). Backend scenarios use Playwright `APIRequestContext` (trace). Combined flows use both. Pin **`@playwright/test@1.61.0`** (current as of 2026-09-17). Do not add it without an explicit human yes.

Do **not** stitch per-test videos into one file. Playwright already writes an **HTML report** that lists every scenario with its video and trace. That is the combined viewer.

## 1. Discover how this workspace runs (do not invent)

Read `.cursor/state/awe-discovered.json` → `local`. Session-start writes it via `discoverLocalRun`. If `local.start` is missing, **ask the human once** how to boot the slice this ticket needs, then record the answer in discovered state. Never point SMOKE at staging/prod (`envUrls` are for post-merge only).

From discovery + any `docs/awe/` briefing that exists + the code graph:

- How to start each in-scope service (`npm run dev` / `start` / `docker compose up`, ports only if they are already in the repo — not guessed).
- Which app is the **product UI** vs leftover CMS chrome (Magento themes next to a Next.js sibling are not the storefront).
- How services call each other (graph CROSS_* / routes). One git root is a single project; a parent folder of child git repos is a family. There is no extra “architect folder.”
- What this ticket **must** run vs **mock or skip** (other role’s contract stub, payments, email, SSO, unused apps) so only the coded slice is exercised.

Write the slice for this ticket as `plans/<ticket>/local-run.md`: services up, mocks on, gherkin in scope, files that coverage should hit.

If you cannot start the slice locally, **STOP**. Do not fake E2E.

## 2. Playwright from Gherkin

Specs live under `plans/<ticket>/e2e/` (smoke may write `plans/` and `.cursor/state/`, not application source):

- `playwright.config.ts` — `video: 'on'`, `trace: 'on'`, `screenshot: 'on'`, `baseURL` from local discovery, output under `.cursor/state/smoke/<ticket>/` (gitignored). **HTML reporter required** (`open: 'never'`) writing to `.cursor/state/smoke/<ticket>-html-report`.
- One spec file per `.feature`, scenarios mapped **1:1**. Tag `@backend` for API-only; untagged/default is browser.
- Backend tests: `playwright.request` against the local API. No browser, no second HTTP framework.
- Frontend / combined: browser actions that match the Gherkin steps; assert observable UI **and** API side effects when the scenario names them.

First time the app repo has no `@playwright/test`: ask to add `1.61.0` as a devDependency and run `npx playwright install chromium`. No yes → stop; SMOKE cannot skip Playwright.

## 3. Run, loop, evidence

Run against localhost only (`npx playwright test -c plans/<ticket>/e2e`). Use a **portable** command: no sandbox `PLAYWRIGHT_BROWSERS_PATH`, no machine-only `--prefix` unless that path is this workspace. Coverage: collect if the repo already has a Playwright/v8 coverage hook; otherwise note which ticket-touched files the trace/network hit. Coverage is evidence of the slice, not a new numeric gate unless `CONSTRAINTS.md` already has one.

**Fail** → structured findings (same schema as review: `file`, `line`, `severity`, `category`, `evidence`, `suggested_fix`). Orchestrator sets phase `code`, increments `smokeIteration`, appends `handoff.md`, respawns the matching coder. Budget is `reviewIterations` (default 3) **on this smoke counter, independent of review rounds**. Exhausted → `ESCALATION.md` and stop. Append the same bullets to `plans/<ticket>/ticket-updates.md` (and MCP-comment if `mcp-report.md` says the tools exist).

**Green** → write these artifacts (all of them):

1. `.cursor/state/awe-smoke-evidence.json` — portable command, `htmlReport`, video/trace (first UI video if several; also `videos[]` when there is more than one):

```json
{
  "playwrightPassed": true,
  "command": "npx playwright test -c plans/<ticket>/e2e",
  "htmlReport": ".cursor/state/smoke/<ticket>-html-report",
  "video": ".cursor/state/smoke/<ticket>/…webm",
  "trace": ".cursor/state/smoke/<ticket>/…zip",
  "at": "<ISO-8601>"
}
```

2. `plans/<ticket>/e2e/run-smoke.sh` — executable, portable re-run for a human. Must: check or print how to boot the slice (from `local-run.md`); default `PLAYWRIGHT_BASE_URL` from discovery; run Playwright against `plans/<ticket>/e2e`; print the `show-report` command. No `/tmp/cursor-sandbox-cache` paths.

3. `plans/<ticket>/smoke.md` — numbered **human** steps 1:1 with gherkin (setup, URL/port, what to click, expected result). Signoff frontmatter stays here (`signed: false` until the human flips it).

4. `.cursor/state/smoke/<ticket>/README.md` — **the file that sits next to the traces** so opening that folder is enough. Include: what was smoked; localhost URL; `npx playwright show-report .cursor/state/smoke/<ticket>-html-report` as the **combined** viewer; `bash plans/<ticket>/e2e/run-smoke.sh`; pointer to `plans/<ticket>/smoke.md` for signoff; a table of per-test video/trace paths. Copy the numbered human steps into this README (or link them in the first 20 lines) so the user does not have to hunt `plans/`.

Hand the human the **HTML report first**, then the README in the smoke folder, then optional per-test videos. Do not tell them to open eight WebMs one by one unless they ask.

A failed human step after a green script is stop-the-line → `/awe-regression`. Do not patch application source in phase `smoke`.
