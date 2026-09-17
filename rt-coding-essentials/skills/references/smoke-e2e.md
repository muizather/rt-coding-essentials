# SMOKE — runtime E2E against the architect bar

Gherkin under `plans/<ticket>/e2e/*.feature` plus intake acceptance criteria are the bar. The **smoke tester** **runs** that bar on localhost. Unit tests and the reviewer are not a substitute.

**Division of labor:** the **coding agents write** the Playwright specs (they built the routes, selectors, and states), the smoke tester **only runs them** — it never writes or edits test code. A missing, stale, broken, or under-demonstrating spec is a `needs-fix` finding back to the coder, never something smoke patches itself.

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

## 2. Specs come from the coder — smoke only runs them

The coder already turned the gherkin into Playwright specs under `plans/<ticket>/e2e/` during the code phase. Before running anything, **verify the mapping and the config**:

- One spec file per `.feature`, scenarios mapped **1:1**. Tag `@backend` for API-only; untagged/default is browser.
- Backend tests: `playwright.request` against the local API. No browser, no second HTTP framework.
- Frontend / combined: browser actions that match the Gherkin steps; assert observable UI **and** API side effects when the scenario names them.
- `playwright.config.ts` — `video: 'on'`, `trace: 'on'`, `screenshot: 'on'`, `baseURL` from local discovery, output under `.cursor/state/smoke/<ticket>/` (gitignored). **HTML reporter required** (`open: 'never'`) writing to `.cursor/state/smoke/<ticket>-html-report`.

A missing, stale, or mismatched spec is a `needs-fix` finding (category `tests`) back to the coder. Smoke never writes or edits specs, config, or fixtures.

First time the app repo has no `@playwright/test`: ask to add `1.61.0` as a devDependency and run `npx playwright install chromium`. No yes → stop; SMOKE cannot skip Playwright.

### The video is the deliverable (recording quality bar)

A green run the human cannot *watch* is not evidence. Every UI scenario's recording must show the **complete user journey**, not just the first viewport. The coder writes specs to this bar; the smoke tester enforces it:

- **Full journey on screen.** Start at the page top; perform the steps as a user would (real typing, real clicks). Bring every key element into view with `scrollIntoViewIfNeeded()` — never assert against an element the video never shows.
- **Dwell on the outcome.** Every scenario exists to prove an observable result (the mockup, the saved row, the error toast). The last action of every UI test scrolls that result on screen and holds it ~2–3s (a short `waitForTimeout` after the final assertion) so the recording lingers on the proof.
- **Human pace, not machine pace.** Use `launchOptions: { slowMo: 250 }` (or per-step pauses) on recorded runs so interactions are followable. A happy-path UI video shorter than ~15–20s is a red flag, not a success.
- **Self-check before evidence.** After a green run, inspect each UI video (duration + final screenshot / trace) and confirm the scenario's expected outcome is actually visible. A video that never shows the outcome or never scrolls = the spec is under-demonstrating → `needs-fix` to the coder (the *spec's demonstration* gets fixed — unless the app itself is broken).
- The numbered human steps in `smoke.md` must describe what is **visible in the recordings**, so the human can cross-check video against steps.

## 3. Run, loop, evidence

Run against localhost only (`npx playwright test -c plans/<ticket>/e2e`). Use a **portable** command: no sandbox `PLAYWRIGHT_BROWSERS_PATH`, no machine-only `--prefix` unless that path is this workspace. Coverage: collect if the repo already has a Playwright/v8 coverage hook; otherwise note which ticket-touched files the trace/network hit. Coverage is evidence of the slice, not a new numeric gate unless `CONSTRAINTS.md` already has one.

**Fail** — *or green with recordings that fail the §2 quality bar* → structured findings (same schema as review: `file`, `line`, `severity`, `category`, `evidence`, `suggested_fix`; use category `tests` when the spec's demonstration is the problem). Orchestrator sets phase `code`, increments `smokeIteration`, appends `handoff.md`, respawns the matching coder. Budget is `reviewIterations` (default 3) **on this smoke counter, independent of review rounds**. Exhausted → `ESCALATION.md` and stop. Append the same bullets to `plans/<ticket>/ticket-updates.md` (and MCP-comment if `mcp-report.md` says the tools exist).

**Green with watchable recordings** (§2 self-check done) → write these artifacts (all of them):

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
