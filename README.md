# Agentic Workflow Essentials (AWE)

**A phase-gated, multi-agent workflow harness for [Cursor](https://cursor.com).** Install it as a **Cursor Plugin** (Customize → Install). It brings skills, agents, rules, hooks, and the **codebase-memory** graph. Describe a ticket (or run `/awe-run`); agents chain through code and review. You still say **yes** to the plan and **sign** the smoke report after watching the Playwright recording. No `awe.config.json` required — AWE discovers the default branch and test command. Optional `setup.mjs` remains if you want a repo-committed copy (cloud agents).

```
 ┌─────────┐   ┌────────────┐   ┌──────────┐   ┌────────┐   ┌─────────┐   ┌────────┐   ┌───────┐   ┌──────────────┐
 │ INTAKE  │ → │ ARCHITECT  │ → │ APPROVE  │ → │  CODE  │ → │ REVIEW  │ → │ SMOKE  │ → │ SHIP  │ → │ POST-MERGE   │
 │ ticket  │   │ role plans │   │ ▣ HUMAN  │   │ per-   │   │ 3 iters │   │▣ HUMAN │   │ PR +  │   │ E2E          │
 │ sanitize│   │ + contract │   │ gate     │   │ role   │   │ then ▣  │   │ PW+you │   │ push  │   │ regressions  │
 │         │   │            │   │          │   │ role    │  │ escalate│   │ record │   │       │   │ re-enter ▶───┼──┐
 └─────────┘   └────────────┘   └──────────┘   └────────┘   └─────────┘   └────────┘   └───────┘   └──────────────┘  │
                                                                                                                    │
   ▣ = human gate                          enforced by Cursor hooks (HARD) + rules (SOFT)         ◀── /awe-regression ┘
```

- **Hard enforcement** — Cursor hooks physically block writes during planning phases, block pushes before signoff, and force agents to continue when "done" has no evidence.
- **Soft enforcement** — always-on rules: a constitution with an anti-rationalization table that talks agents out of their favorite excuses.
- **Parallel by design** — backend and frontend of one ticket share a contract; **multiple plans** may be in-flight. A new plan is never blocked by another ticket. Implementation waits only on `dependsOn`. Git worktrees appear only when two+ plans would conflict on the same checkout.
- **Zero dependencies** — everything is plain Node.js built-ins and markdown. Nothing to audit, nothing to rot.

**30-second vocabulary** (five words AWE uses everywhere):

- **Hook** — a small script Cursor runs around an agent action (write a file, run a shell command, spawn a subagent, end a session) that can allow or deny it. AWE's hard enforcement lives here.
- **Skill** — a playbook (`/awe-run`, `/awe-intake`, …). `/awe-run` chains phases; hooks still block skipped gates.
- **Subagent** — a fresh-context agent the main chat spawns for one bounded job (architect, role dev, reviewer, smoke tester). Isolation is the point: a reviewer that didn't write the code reviews it honestly.
- **MCP** — Model Context Protocol. **codebase-memory** is required (enable it once on the plugin). GitHub / GitLab / Redmine / Jira / Slack are optional — if connected, agents journal `ticket-updates.md` and comment on the originating ticket; if not, the pipeline still runs. See [docs/GUIDE.md](docs/GUIDE.md).
- **Worktree** — a second checkout of the same repo on its own branch. AWE creates one only when two plans are implementing at once (so they do not clobber each other). A single implementing ticket uses the main working tree.

---

## 1. Install (plugin)

Repo: **https://github.com/muizather/rt-coding-essentials** (public). Anyone with that link can install.

**From Cursor (share this):**

Cursor loads a GitHub URL as a **marketplace**. This repo lists one plugin, **RT Coding Essentials** (`rt-coding-essentials/`).

1. If you already added the URL and saw an empty list: **remove that marketplace** (Customize → Plugins → the GitHub source → Remove), then add it again. Cursor pins the first import.
2. **Customize → Plugins → Add from GitHub** (or `/add-plugin https://github.com/muizather/rt-coding-essentials`).
3. You should see **RT Coding Essentials**. Install it (user or this-workspace). Enable **codebase-memory** when asked. A single git repo: install **in that repo**. A parent folder is only for several sibling git clones.
4. Reload the window.

For a local always-HEAD install, symlink the **plugin folder** (not the repo root):

```bash
ln -s /path/to/rt-coding-essentials/rt-coding-essentials ~/.cursor/plugins/local/rt-coding-essentials
```

Then **Developer: Reload Window**. Teams/Enterprise: turn on **Allow Local Plugin Imports** if that setting is off.

After you push a plugin change, refresh this machine’s GitHub-marketplace cache (skips if that origin SHA is already there):

```bash
npm run marketplace:cache           # fetch origin, install GitHub latest
npm run marketplace:cache:check     # exit 2 if GitHub HEAD is not cached
```

Uses **origin/main**, not your working tree. Then reload the window. If Customize still shows the old semver, remove the GitHub source and add it again.

Official Marketplace listing (optional, Cursor reviews every update): [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) with this repo URL.

Optional **`setup.mjs`** still copies a project-local `.cursor/` (including rule 15) for teammates who do not use the plugin, or for **cloud agents** that only see repo-committed hooks.

### What setup.mjs still writes (optional)

Running `setup.mjs` in your project adds:

```
your-project/
├── awe.config.json                 # YOURS — generated from your answers, never clobbered
├── CONSTRAINTS.md                  # YOURS — the written quality bar; a hook stops agents weakening it
├── NOTICE                          # MIT attribution for adapted agent-skills material
├── plans/
│   └── README.md                   # how the per-ticket workspace works
└── .cursor/
    ├── hooks.json                  # wires 8 hook scripts into 7 Cursor events
    ├── hooks/                      # AWE-managed — refreshed on re-run
    │   ├── pre-tool-gate.mjs       #   blocks code writes before approval; tamper-protects config; guards approved plans
    │   ├── constraints-guard.mjs   #   blocks agent edits that weaken CONSTRAINTS.md
    │   ├── before-shell.mjs        #   blocks force-push/curl|sh/secrets; gates git push to ship
    │   ├── before-read.mjs         #   blocks reads of .env, ~/.aws, ~/.ssh, secrets/
    │   ├── post-tool-scan.mjs      #   scans every written file for secrets
    │   ├── subagent-gate.mjs       #   subagents only spawn in their correct phase
    │   ├── stop-evidence.mjs       #   "done" requires fresh green-test evidence
    │   ├── session-context.mjs     #   briefs every session on ticket/phase/questions
    │   └── lib/                    #   state.mjs · audit.mjs · scanners.mjs
    ├── rules/
    │   ├── 00-awe-constitution.mdc # AWE-managed: invariants + anti-rationalization table
    │   ├── 10-awe-phases.mdc       # AWE-managed: the phase machine, evidence contract
    │   ├── 15-awe-runtime.mdc      # AWE-managed: discover, memory MCP, knowledge, reporting
    │   ├── 20-awe-security.mdc     # AWE-managed: untrusted input, secrets, MCP hygiene
    │   ├── 30-awe-project-profile.mdc  # YOURS — only if you ran setup.mjs
    │   └── 40-awe-project-custom.mdc   # YOURS — only if you ran setup.mjs
    ├── agents/                     # AWE-managed subagents
    │   ├── awe-architect.md            (read-only planner)
    │   ├── awe-backend-dev.md / awe-frontend-dev.md / awe-fullstack-dev.md
    │   ├── awe-reviewer.md
    │   ├── awe-security-reviewer.md   (optional — spawned only when securityReview: true)
    │   └── awe-smoke-tester.md             (writes your human test script)
    ├── skills/                     # /awe-run /awe-intake /awe-architect /awe-approve /awe-code
    │   ├── …                       # /awe-review /awe-smoke /awe-ship /awe-regression /awe-remember
    │   └── references/             #   the long checklists: review rubric, security checklist,
    │                               #   ship-decision, definition-of-done, plan template, debugging triage
    └── mcp.json                    # everything disabled; copy what you need from _disabled_examples
```

Optional (via `--ci github` / `--ci gitlab`): a CI workflow that re-runs tests + gitleaks + semgrep + osv-scanner + CodeQL (+checkov and cfn-guard when IaC exists, +ZAP baseline DAST when you set a target URL) on every PR — the server-side backstop. A `dependabot.yml` template is included to keep the SHA-pinned actions fresh.

**Pinned CI tooling (verified 2026-09-08).** GitHub Actions are pinned to full commit SHAs: `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0, `github/codeql-action` v4.37.9, `gitleaks-action` **v3.0.0**, `osv-scanner-action` v2.5.1, `checkov-action` v12.3122.0, `zaproxy/action-baseline` v0.15.0 (optional DAST). Container/CLI pins: `semgrep/semgrep:1.176.0`, `ghcr.io/gitleaks/gitleaks:v8.30.1`, `ghcr.io/google/osv-scanner:v2.5.1`, `bridgecrew/checkov:3.3.16`, cfn-guard 3.2.1, `ghcr.io/zaproxy/zaproxy:2.17.0` (GHCR publishes ZAP tags **without** a `v` prefix — verified 2026-09-08). Two things to know:

- **gitleaks-action must be v3** — v2 uses the Node 20 runtime that GitHub removes from runners on **2026-09-16** (v2 stops working that day). v3 runs on Node 24 with no behavior change. **Organizations** also need a `GITLEAKS_LICENSE` secret (gitleaks is no longer free for org use; personal repos are unaffected).
- **semgrep-action is deprecated/archived** — AWE runs the CLI from the pinned `semgrep/semgrep:1.176.0` image instead (`semgrep scan --config p/default --error`, no Semgrep account needed). Locally: `pipx install semgrep`.

**Re-running setup is safe.** AWE-managed files refresh in place; your files (`awe.config.json`, rules 30/40, `mcp.json`, `plans/**`) are never overwritten — if AWE's template changed you get a `*.new` file to merge by hand. If you edited an AWE-managed file, setup skips it and tells you (use `--force` to take the fresh copy).

---

## 2. Prerequisites

### REQUIRED

| Requirement | Why | Check |
|---|---|---|
| **Node.js 24.x "Krypton"** — Active LTS (≥ 24.0.0; latest 24.20.0 as of Sep 2026). Node 26 enters LTS on **2026-10-28** — bump then if you prefer the newest line. | Runs every hook and the setup script | `node --version` |
| **git** | AWE branches, worktrees, and the ship gate | `git --version` |
| **Cursor ≥ 2.5** (recommend **3.x** — latest stable 3.15) | 2.5 added async/nested subagents + plugins, which AWE's parallel roles rely on; 3.x is the current stable line | Cursor → About |
| **A git repository** for your project | Worktrees need one; setup offers `git init` | — |
| **codebase-memory MCP** (`codebase-memory-mcp@0.10.8`, latest npm 2026-09-09) | Graph index of the app repo. Plugin ships it; you enable/trust it once | Tools `list_projects` / `search_graph` available in chat |

### RECOMMENDED

| Tool | What it unlocks | Without it |
|---|---|---|
| **Ticket MCP** — Redmine / Jira / GitHub / GitLab | Automatic ticket intake (`/awe-intake PROJ-123` pulls the ticket itself) and automatic PR creation in `/awe-ship` | Manual paste works fine — intake asks you to paste the ticket; ship prints exact `gh`/`git` commands |

### OPTIONAL — graceful degradation, nothing breaks

| Tool | What it adds | If absent |
|---|---|---|
| **Slack / Gmail MCP** | Notifications ("3 open questions waiting on you") | **OFF by default** — pure good-to-have. AWE is fully functional without any notification channel. |
| **ngrok** | Local integration testing against external webhooks | Skip the webhook tests |
| **AWS credentials** | Deploy-smoke flows for AWS projects | Smoke steps stay local |
| **semgrep / gitleaks / osv-scanner binaries** | Deeper local scanning during review | Hooks log a warning and use built-in secret patterns; CI still runs the full scanners |
| **cfn-guard binary** (3.2.1; CloudFormation projects only) | Policy-as-code checks on CFN templates against your `*.guard` rules | CFN policy checks simply don't run; checkov still covers IaC in CI |
| **sequential-thinking MCP** | A structured scratchpad for very large architecture decompositions | Architect works normally |

---

## 3. Quick start

**Plugin (preferred)**

```text
Customize → Install RT Coding Essentials  (or symlink this repo's `rt-coding-essentials/` folder to `~/.cursor/plugins/local/rt-coding-essentials` and reload)
Enable codebase-memory MCP when Cursor asks
Open your app repo → describe the ticket  (or /awe-run PROJ-123)
```

Index happens on first run (`index_repository`). Then: answer open questions if any → explicit **yes** on the plan → agents code and review → smoke tester runs Gherkin with Playwright on localhost (HTML report + video/trace) → you watch the report and sign `smoke.md` → `/awe-ship` if you want a PR. Status always lands in `plans/<ticket>/ticket-updates.md`; if a ticket/Slack MCP can comment, the same bullets go there.

**setup.mjs (optional, repo-local copy)**

```bash
git clone <this-repo> agentic-coding     # once per machine (or per team)
cd ~/your-project                         # YOUR project
node ~/agentic-coding/setup.mjs           # answer 8 quick prompts (Enter = sensible default)
```

Then (setup path): **trust the workspace** when Cursor asks, **restart Cursor**, and run `/awe-run` or:

```
/awe-intake PROJ-123
```

That's it. Non-interactive install for your whole team:

```bash
node ~/agentic-coding/setup.mjs --yes --set baseBranch=main --set roles=backend,frontend --ci github
```

Other flags: `--dry-run` (show everything, write nothing) · `--target <dir>` · `--force` (overwrite locally-modified managed files) · `--uninstall`.

### What just happened?

Setup copied AWE's hooks, rules, agents, and skills into your project's `.cursor/`, generated `awe.config.json` and `CONSTRAINTS.md` from your answers, added one `.gitignore` line (`.cursor/state/` — AWE's runtime files stay local), and installed **nothing from npm** (your `package-lock.json` was never touched). From now on, Cursor enforces the pipeline on this repo: agents can't write code before a plan is approved, can't push before a human verifies, and can't claim "done" without fresh test output. Your normal non-ticket work is untouched — with no active ticket, every AWE hook steps aside.

### Your first ticket in 10 minutes (no MCP needed)

Try the whole pipeline on a demo ticket. Nothing here needs a ticket system — you'll paste the "ticket" by hand:

1. **Intake.** In Cursor chat: `/awe-intake DEMO-1` — when asked, paste something like *"Add a health-check endpoint GET /health that returns { ok: true }"*. AWE writes `plans/DEMO-1/intake.md` (a sanitized spec) and `plans/DEMO-1/open-questions.md` (each question with the architect's guess attached).
2. **Answer questions** by editing `open-questions.md` — check a box, write a word. Then `/awe-intake --resume DEMO-1` (or skip ahead if nothing was blocking).
3. **Architect.** `/awe-architect` — the read-only architect subagent writes `architecture.md` and per-role `*.plan.md` files with sized, testable tasks.
4. **Approve** ▣ *you*. `/awe-approve` — read the one-screen summary, say **yes**. Only now can any code be written (before this, the write-gate hook physically denies code edits — try it: ask the agent to "just start coding" and watch it get blocked).
5. **Code.** `/awe-code backend` — a dev subagent implements the plan test-first on branch `awe/DEMO-1-backend` (a worktree only if another plan is already implementing), then writes fresh test evidence.
6. **Review.** `/awe-review backend` — two reviewers (functional + security) attack the diff; fixes loop automatically, up to 3 rounds before it escalates to you.
7. **Smoke** ▣ *you*. `/awe-smoke` — Playwright runs the Gherkin on localhost; open the HTML report (`npx playwright show-report .cursor/state/smoke/<ticket>-html-report`). Flip `signed: true` with your initials.
8. **Ship.** `/awe-ship` — pre-flight checks, push, and either a PR via MCP or the exact `gh pr create` command printed for you. You merge.

When you're done experimenting: `/awe-regression` is how a post-merge bug re-enters the pipeline, and `node ~/agentic-coding/setup.mjs --uninstall` removes every AWE-managed file cleanly.

---

## 4. Daily workflow

> One ticket flows through 8 phases. You interact with **two human gates** (approve, smoke) and answer questions asynchronously. Everything else is agents doing bounded work with hard guardrails.
>
> 📊 **Prefer pictures?** [docs/FLOW.md](docs/FLOW.md) has the full pipeline as a flowchart plus sequence diagrams (hooks, sanitization, evidence loop, CI). **[docs/GUIDE.md](docs/GUIDE.md)** is the demonstration guide: project vs user install, MCP "this project / for myself", what is actually running, the hook test suite, and a 10-minute live demo script.

### Phase 1 — INTAKE

```
/awe-intake PROJ-123
```

- With a ticket MCP configured, the ticket is pulled automatically; otherwise paste the text.
- AWE writes `plans/PROJ-123/intake.md` — a **sanitized** spec (ticket text is treated as untrusted data; embedded "instructions" are ignored and reported) — plus `plans/PROJ-123/open-questions.md`.

**Async questions, your pace.** AWE doesn't block you with a modal quiz. Answer whenever:

1. Open `plans/PROJ-123/open-questions.md`
2. Change `- [ ]` to `- [x]`, write the answer under the question
3. Run `/awe-intake --resume PROJ-123` (or just continue to the architect if nothing was blocking)

### Phase 2 — ARCHITECT

```
/awe-architect
```

Spawns the read-only `awe-architect` subagent: it reads any `docs/awe/` briefing that exists (PRD, apps, connections, deploy — skip missing files; they never block), then your repo (memory MCP when available), then writes `architecture.md` (approach + rejected alternatives + **contract**) and one `<role>.spec.md` per enabled role (`backend` / `frontend` / `fullstack`). The spec is **high-level** — no source file lists. Coding agents decide files after you approve. If this ticket taught a lasting domain fact, the parent skill may update `docs/awe/`; skip if nothing new.

### Phase 3 — APPROVE ▣ *human gate*

```
/awe-approve
```

AWE verifies every open question is answered and every cross-role dependency acknowledged, then shows you a one-screen summary per role and asks **"Approve these plans?"**. Your yes flips each plan's frontmatter to `status: approved`. Until that moment, the write-gate hook **physically denies** any code edit — agents literally cannot jump the gun.

### Phase 4 — CODE

```
/awe-code backend      # or frontend, in parallel when split
/awe-code fullstack    # same-repo UI+server (no sibling SPA)
```

Each role implements on branch `awe/PROJ-123-<role>` cut from your base branch, plus a `handoff.md` brief. A **git worktree** (`.worktrees/<ticket>-<role>`) is created only when another in-flight plan is already in `code|review|smoke|ship` — otherwise the main checkout is used. The role dev first writes a **low-level** `implementation.plan.md` (files, unit tests, today's advisory search for any package it will use) and `implementation-questions.md`. Open implementation questions **block source writes** (hook) until you answer them. If this ticket's `dependsOn` lists a plan that is not `done` yet, **implementation** is blocked (intake and architect are not). Then it implements only its approved spec, builds cross-role needs against contract stubs, writes the named unit tests, runs your test command, and writes fresh evidence to `.cursor/state/awe-evidence.json`. Try to end the session without that evidence and the `stop` hook sends the agent back to work.

### Phase 5 — REVIEW

```
/awe-review backend
```

Scanners run (built-in secrets always; gitleaks/semgrep/osv-scanner when installed). Then `awe-reviewer` (functional) reviews the diff, producing structured JSON findings plus a verdict. `awe-security-reviewer` runs **only when** `securityReview` is `true` in `awe.config.json` (default **false**). Coding agents already search current advisories before adding packages — that is the default security bar.

- `needs-fix` → findings go into `handoff.md`, the coder writes `reviews/round-N-response.md` (fixed / rebutted / deferred) and is respawned. Up to **3 iterations** (your configured `reviewIterations`).
- Budget exhausted → `plans/PROJ-123/ESCALATION.md` and a stop for **your** decision. Never silent shipping.
- `verified` from the required reviewer(s) → role marked verified; when all roles pass, phase becomes `smoke`.

Reviewers only judge a role's own scope — the frontend is never failed because the backend API doesn't exist yet; the contract stub is the correct artifact.

### Phase 6 — SMOKE ▣ *human gate*

```
/awe-smoke
```

`awe-smoke-tester` **runs** the architect Gherkin on **localhost** with mandatory Playwright (`@playwright/test@1.61.0`): browser **video** for UI, API **trace** for backend, **HTML report** as the combined viewer (`npx playwright show-report .cursor/state/smoke/<ticket>-html-report`). Failures go back to the coder (`smokeIteration`, budget 3, independent of review). When green, it writes:

- `plans/PROJ-123/smoke.md` — numbered human steps + signoff frontmatter
- `plans/PROJ-123/e2e/run-smoke.sh` — portable re-run
- `.cursor/state/smoke/PROJ-123/README.md` — sits next to the traces (what/where/how)

Open the HTML report first (every scenario, video, and trace in one UI). Optionally walk the steps. All matches? Flip the frontmatter:

```yaml
verified: true
initials: "MA"
date: "2026-09-08"
```

Tell the agent; it records `.cursor/state/awe-signoff.json` and unlocks ship. Something broken after you signed? `/awe-regression "checkout 500s when cart is empty"` — don't hand-fix code in the smoke phase. A Playwright fail *before* signoff respawns the coder, not a regression ticket.

### Phase 7 — SHIP

```
/awe-ship
```

Pre-flight (signoff present, evidence < 2h old, scanners clean) → commit → push `awe/PROJ-123-*` (the shell gate independently re-checks signoff/evidence/branch before allowing the push) → PR opened via GitHub/GitLab MCP, or exact `gh pr create …` commands printed for you. **You merge.**

### Phase 8 — POST-MERGE E2E

After merging: pull the base branch, run the combined E2E section of `smoke.md` against the merged result. A regression isn't a quick patch — it re-enters the pipeline:

```
/awe-regression "what broke"
```

This creates `plans/PROJ-123-R1/` linked to the original architecture, diffs, and verification results (including *why smoke missed it*), and restarts at ARCHITECT with full context.

---

## 5. Configuration — optional `awe.config.json`

Not required. Session start writes `.cursor/state/awe-discovered.json` (base branch, test command, roles). If you create `awe.config.json`, those fields win. Re-running setup still writes `awe.config.json.new` instead of clobbering an existing file.

| Field | Default | Meaning |
|---|---|---|
| `projectName` | dir name | Display name used in reports |
| `baseBranch` | `develop` | Branches `awe/<ticket>-*` are cut from here; PRs target it |
| `roles` | `["backend","frontend"]` | Which coder agents exist (`backend`, `frontend`, `fullstack`). `fullstack` is exclusive. Discovery: CMS + sibling SPA (ipromo Magento + Next) → split; same-repo UI+server → fullstack |
| `securityReview` | `false` | When `true`, `/awe-review` also spawns `awe-security-reviewer`. Default off. |
| `commands.test` | discovered | Must exit 0 when green. Optional file overrides `.cursor/state/awe-discovered.json` |
| `commands.lint` | `npm run lint` | Run before each review round |
| `reviewIterations` | `3` | needs-fix rounds per ticket before human escalation |
| `triggerMode` | `auto` | `/awe-run` chains phases. APPROVE and SMOKE stay human-gated |
| `ticketSystem` | `none` | `redmine` / `jira` / `github` / `gitlab` for MCP ticket intake; `none` = paste manually |
| `notifications.enabled` / `.slack` / `.gmail` | `false` | Optional Slack/Gmail nudges. OFF by default; pure good-to-have |
| `strictSecurity` | `false` | `false`: missing scanners warn and degrade gracefully. `true`: gates fail closed when scanners are missing |
| `envUrls` | `{}` | staging/prod URLs for **post-merge** E2E. SMOKE itself uses discovered localhost starts |
| `deployCommands` | `{}` | deploy commands for deploy-smoke projects |

---

## 6. How enforcement works

Hooks are small Node scripts (spawned per event, JSON in → JSON out, zero deps). Decisions land in `.cursor/state/audit.log` — append-only, one JSON line per decision, so you can always answer "why was that blocked?".

| Cursor event | Script | Hard/Soft | What it blocks / injects |
|---|---|---|---|
| `preToolUse` (Write/Edit/StrReplace/Delete/MultiEdit) | `pre-tool-gate.mjs` | **HARD** (failClosed) | Always: writes to `.cursor/hooks*`, `awe.config.json`. While planning: any write outside `plans/` & `.cursor/state/`. In `code`: application source blocked until that role's `implementation.plan.md` + `implementation-questions.md` have no open `- [ ]`. Always while active: overwriting an approved spec (appends and status flips stay allowed) |
| `preToolUse` (Write/Edit/StrReplace/Delete/MultiEdit) | `constraints-guard.mjs` | advisory (fail-open) | Edits to `CONSTRAINTS.md` that remove/weaken a threshold — the quality bar is human-owned |
| `beforeShellExecution` | `before-shell.mjs` | **HARD** (failClosed) | Always: force-push, `npm publish`, `curl\|sh`, `rm -rf /`, metadata IPs, reading `.aws/.ssh/.env`. While active: `git push` denied outside ship; in ship, allowed only from `awe/<ticket>-*` with verified signoff + fresh evidence |
| `beforeReadFile` | `before-read.mjs` | HARD (fail-open) | Reads of `.env*`, `**/.aws/**`, `**/.ssh/**`, `**/secrets/**` |
| `postToolUse` (writes) | `post-tool-scan.mjs` | advisory | Injects `additional_context` when a just-written file smells like a secret (built-ins + gitleaks when present) |
| `subagentStart` | `subagent-gate.mjs` | HARD (fail-open) | Devs only in `code` with an approved plan; reviewers only in `code`/`review`; architect only in `intake`/`architect`; smoke tester only in `smoke` (coder respawn from SMOKE sets phase `code` first) |
| `stop` (loop_limit 8) | `stop-evidence.mjs` | **HARD-ish** | Can't veto completion, but auto-submits a followup forcing the agent to produce fresh test evidence — or to escalate when the review budget is spent |
| `sessionStart` | `session-context.mjs` | SOFT | Briefs each session: ticket, phase, plan statuses, open-question count |

Rules (`00`/`10`/`20`, always-on) are the SOFT layer: constitution, phase machine, security policy — including the anti-rationalization table ("I'll write tests later → *Later is the load-bearing word. There is no later.*").

**When AWE is inactive** (no ticket flowing), every hook exits immediately — AWE never interferes with normal work. Baseline shell safety (force-push, `curl|sh`, credential reads) stays on as a seatbelt. Kill switch for everything: `AWE_DISABLED=1`.

---

## 7. Model routing

AWE pins every subagent to **Composer 2.5** — which is in the Cursor Models pool on **every paid plan** — instead of leaving the model on **Auto**.

**Why not Auto?** Auto can silently route to third-party API-key models under the hood. AWE pins Composer explicitly so behavior *and billing* stay inside your Cursor subscription — no third-party keys, no surprise model swaps mid-pipeline.

**Standard vs. Fast — same weights, different serving.** Fast serving is ~6× the price for lower latency (≈ **$0.44** vs ≈ **$0.07** per task). The output quality is identical; you're buying responsiveness.

**AWE's default split** matches how the agents are actually used:

| Agent | Pin | Why |
|---|---|---|
| `awe-backend-dev`, `awe-frontend-dev`, `awe-fullstack-dev` | `composer-2.5-fast` | **Interactive** — a human is usually watching while code is written, so latency is felt |
| `awe-architect`, `awe-reviewer`, `awe-security-reviewer` | `composer-2.5[fast=false]` | **Unattended** — planning/review, often cloud or overnight |
| `awe-smoke-tester` | `composer-2.5[fast=false]` | Runs Playwright from Gherkin, writes HTML report + steps, then waits on you |

**Change a pin** by editing the single `model:` line in that agent's `.cursor/agents/awe-*.md` frontmatter. If a pinned model isn't available on your plan, Cursor **falls back gracefully** (the run still happens on an available model). **Escape hatch:** set `model: inherit` to use whatever model the parent chat is running.

**Approximate cost per full ticket loop** (intake → architect → approve → code × roles → review ≤3 iters → smoke → ship), Composer 2.5:

| Routing strategy | Fast used for | ≈ Cost / ticket |
|---|---|---|
| All-standard | nothing | **≈ $0.50** — cheapest; fine for fully-async/overnight work |
| **Interactive (AWE default)** | the two coding agents only | **≈ $2.00** — latency only where a human is waiting |
| All-fast | everything | **≈ $3.00+** — no benefit once you're not watching; not recommended |

## 8. Cloud & team usage

- **Plugin hooks travel with the install.** Cloud agents still only see **repo-committed** `.cursor/hooks.json`. Use `setup.mjs` if `@cursor` on a PR must hit the same gates.
- **codebase-memory is required** locally; enable it on the plugin. Slack/GitHub/GitLab reporting is optional.
- **Auto trigger:** `/awe-run` chains until approve/smoke. Keep those human.

---

## 9. Customization & knowledge

- **Plugin users:** house knowledge goes in codebase-memory ADRs (`/awe-remember`, and a pass after ship). Add your own rules in **the app repo's** `.cursor/rules/` — AWE will not overwrite them.
- **setup.mjs users:** `40-awe-project-custom.mdc` is still the forever file setup never clobbers; rule 30 is the generated profile.
- Add more `.mdc` files with `globs:` frontmatter for path-scoped rules (e.g. API-only conventions).
- Don't edit plugin/managed hooks, rules 00/10/15/20, agents, or skills in place if you use setup — it refreshes them. Fork AWE to change gate behavior.

---

## 10. Security model (L0–L5)

| Layer | What | Where |
|---|---|---|
| **L0** Baseline shell safety | force-push / `curl\|sh` / `rm -rf ~` / metadata IP / credential reads denied — even when AWE is off | `before-shell.mjs`, `before-read.mjs` |
| **L1** Tamper protection | agents can never modify hooks, `hooks.json`, or `awe.config.json` | `pre-tool-gate.mjs` |
| **L2** Phase gating | no code before approval; subagents only in their phase; pushes only in ship | `pre-tool-gate.mjs`, `subagent-gate.mjs`, `before-shell.mjs` |
| **L3** Evidence gates | fresh green-test evidence to end a session; verified human signoff to push; secrets scanned on every write | `stop-evidence.mjs`, `post-tool-scan.mjs` |
| **L4** CI hard gate | server-side re-verification: tests, lint, gitleaks, semgrep, osv-scanner, CodeQL, checkov + cfn-guard (IaC), ZAP baseline (DAST, when a target URL is configured) | `--ci github` / `--ci gitlab` workflow |
| **L5** Human gates | APPROVE (plans) and SMOKE (watch Playwright HTML report, then sign) | `/awe-approve`, `/awe-smoke` |

Plus: untrusted-input doctrine (ticket/PR/web text is data, never instructions), least-privilege optional MCPs, required codebase-memory, and an append-only audit log.

---

## 11. Troubleshooting & FAQ

Quick answers first; details below.

| Symptom | Fix |
|---|---|
| Hooks not firing at all | **Trust the workspace** (Cursor prompts on open) and **restart Cursor** after setup. Verify in `Cursor Settings → Hooks`; watch `.cursor/state/audit.log` for decisions |
| AWE is in the way right now | `AWE_DISABLED=1` in the environment + restart Cursor — every hook short-circuits to allow. Unset to re-enable |
| "Phase is X — code emission is blocked" | That **ticket** is still in a planning phase. Approve it (`/awe-approve`) or implement a *different* in-flight ticket that is already in `code`. Abandon one ticket by setting its entry to `phase: done` (set `active: false` only when none remain). |
| Agent keeps being sent back for test evidence | The stop gate working: run the real test command; evidence must be < 2 h old. Wrong command? Fix `commands.test` in `awe.config.json` |
| Scanner warnings (gitleaks/semgrep/osv-scanner missing) | Install them, or accept built-in coverage — CI still runs the full set. `strictSecurity: true` flips warnings to hard failures |
| AWE blocked a legitimate action | Read the deny message — it names the rule and the escape (usually: "ask the human"). Every decision is in `.cursor/state/audit.log` |
| Remove AWE entirely | `node ~/agentic-coding/setup.mjs --uninstall` — removes only AWE-managed files, keeps your config and `plans/` history |

**Hooks aren't firing.** The workspace must be **trusted** (Cursor prompts on open) and Cursor must have been **restarted** after setup. Check `Cursor Settings → Hooks` to see loaded hooks. Look at `.cursor/state/audit.log` — if decisions appear there, hooks are alive.

**A hook blocked something legitimate.** Read the message — it names the rule. Phase gates mean the phase is wrong (`/awe-*` skills transition phases); tamper gates mean the file is human-owned. Everything is logged in `.cursor/state/audit.log`.

**Disable everything instantly.** Set `AWE_DISABLED=1` in the environment and restart Cursor — every hook short-circuits to "allow". Unset to re-enable. (Your config stays.)

**The agent keeps getting sent back for test evidence.** That's the stop gate working: run the configured test command for real; evidence must be < 2 hours old. If your test command is wrong, fix `commands.test` in `awe.config.json`.

**Scanners missing warnings.** Install `gitleaks`/`semgrep`/`osv-scanner`, or accept the built-in coverage (CI still runs the full set). Set `strictSecurity: true` if you prefer missing scanners to block instead of warn.

**"Agent tried to read .env" / "write to hooks.json".** Working as intended. Agents get needed values from you, out-of-band.

**Plans vs. state out of sync after manual edits.** Re-run the current phase's skill — skills re-derive state from the `plans/<ticket>/` artifacts, which are the source of truth.

---

## 12. Uninstall

```bash
node ~/agentic-coding/setup.mjs --uninstall        # add --force to also remove managed files you edited
```

Removes **only AWE-managed files** (hooks, agents, skills incl. `skills/references/`, rules 00/10/20, `plans/README.md`, `NOTICE`, CI workflow). Keeps everything that's yours: `awe.config.json`, `CONSTRAINTS.md`, rules 30/40, `mcp.json`, your ticket folders under `plans/**`, and the `.cursor/state/` history. The `.gitignore` line for `.cursor/state/` is left in place (harmless). Re-run setup any time to come back.

---

## 13. Developing AWE itself

```bash
npm run check                 # syntax-checks setup.mjs, marketplace cache script, every hook
npm run test:hooks            # hook+setup assertions (piped JSON + throwaway git repo)
npm run marketplace:cache     # install GitHub latest into ~/.cursor marketplace cache if missing
```

The `template/` tree is copied verbatim into target projects (with `{{PLACEHOLDER}}` substitution for the config/profile). Hooks must stay zero-dependency Node ≥ 24 and must honor the golden rule: **no state file / `active: false` / `AWE_DISABLED=1` → exit 0 with `{}` immediately.**

---

*AWE v0.1.0 · MIT · zero runtime dependencies · Node 24 LTS "Krypton"*
