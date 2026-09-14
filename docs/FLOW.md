# AWE Flow — the pipeline, drawn

This page shows how a ticket moves through AWE: the phases, the human gates, and the
hooks that enforce them. It's the visual companion to the **Daily workflow** section of
the [README](../README.md) and to the `.cursor/rules/10-awe-phases.mdc` rule.
For install scopes (project vs user / MCP "this project or for myself"), what is
actually running, and the hook test suite, see [GUIDE.md](GUIDE.md).

- **Skill** — a slash-command playbook you invoke (`/awe-intake`, `/awe-code`, …).
- **Hook** — a script Cursor runs around a tool call (write, shell, subagent spawn, stop) that can allow/deny it.
- **Subagent** — a fresh-context agent the orchestrator spawns (architect, dev, reviewer, verifier).
- **Worktree** — an isolated git working copy on its own branch, so roles code in parallel without colliding.

## The whole pipeline

```mermaid
flowchart TD
    A["Ticket: Jira/Redmine ID or free text"] --> B["/awe-intake — sanitized spec + open-questions.md"]
    B --> C["/awe-architect — architecture.md + role plans + dependency graph"]
    C --> D{"All open questions answered? All dependent plans approved?"}
    D -- "no (async, non-blocking)" --> DQ["open-questions.md waits; other tasks proceed in parallel"]
    DQ --> D
    D -- "yes — /awe-approve (HUMAN GATE)" --> E["/awe-code backend | frontend — worktree + branch awe/TICKET-role"]
    E --> F["Coding agent implements + tests — writes awe-evidence.json"]
    F --> G["/awe-review — functional + security passes + deterministic scanners"]
    G --> H{"Verdict"}
    H -- "needs-fix, iteration < 3" --> F
    H -- "3 rounds unresolved" --> ESC["ESCALATION.md — human takes over"]
    H -- "verified" --> I["/awe-verify — verification.md; human manually tests (HUMAN GATE)"]
    I --> J["/awe-ship — pre-flight + PR; CI hard gate must pass"]
    J --> K["Merge → deploy dev/staging"]
    K --> L["Post-merge combined E2E verification"]
    L -- "bug found" --> M["/awe-regression — linked folder re-enters at ARCHITECT"]
    M --> C
    L -- "clean" --> N["Done"]
```

## Phase walkthrough (what actually runs)

**1 — INTAKE** (`/awe-intake`). Pulls the ticket via the ticket MCP (or you paste text), treats it as **untrusted data**, and writes a sanitized `plans/<ticket>/intake.md` plus `open-questions.md` — each question carries a hypothesis, a confidence number, and a `GUESS:` so you answer with one word. Writes `awe-state.json` (`phase: architect`). *Hook involved:* `pre-tool-gate.mjs` allows writes only under `plans/` and `.cursor/state/` while in a planning phase.

**2 — ARCHITECT** (`/awe-architect`). The `awe-architect` subagent (gated by `subagent-gate.mjs`) turns the spec into `architecture.md` (cross-role contract) and one `<role>.spec.md` per role (`backend` / `frontend`). High-level only — no source file lists. Open questions are optional.

**3 — APPROVE** (`/awe-approve`) ▣ **human gate**. Validates any architect questions are answered, rejects hedged approvals ("looks reasonable" ≠ yes), then flips each **spec** to `status: approved`. *Hooks involved:* `pre-tool-gate.mjs` blocks all code writes until this flips `phase: code`; the plan-clobber guard makes approved specs append-only.

**4 — CODE** (`/awe-code <role>`). Creates a worktree + branch `awe/<ticket>-<role>`, writes `handoff.md`, spawns `awe-backend-dev` or `awe-frontend-dev`. The coder first writes a low-level `implementation.plan.md` (files, tests, today's advisory search) and `implementation-questions.md`. Open implementation questions **block source writes**. Then TDD using the repo's own commands. *Hooks involved:* `pre-tool-gate.mjs` allows source only after questions are closed; `post-tool-scan.mjs` secret-scans every edit; `before-shell.mjs` blocks dangerous commands; `stop-evidence.mjs` refuses to end the session without fresh evidence.

**5 — REVIEW** (`/awe-review <role>`). Runs scanners, then spawns `awe-reviewer` — a fresh-context **adversarial** pass over the diff against the spec, gherkin, and implementation plan. `awe-security-reviewer` is optional (`securityReview: true`). Findings are severity-labeled (Critical ⇒ the iteration fails). *needs-fix* respawns the coder; *verified* moves on; three unresolved rounds write `ESCALATION.md` and hand it to you.

**6 — VERIFY** (`/awe-verify`) ▣ **human gate**. The `awe-verifier` subagent writes `verification.md`: numbered, by-hand test steps. You run them; a failure is stop-the-line → `/awe-regression`. On pass you set `verified: true` + initials + date, and the skill writes `awe-signoff.json`.

**7 — SHIP** (`/awe-ship`). Pre-flight checks signoff + fresh evidence + clean scanners, writes the **Ship Decision** artifact (`ship-decision.md`: GO/NO-GO + rollback plan + RTO) and checks the **ADR docs gate**. Then commits, pushes `awe/<ticket>-*` (allowed by `before-shell.mjs` only now), and opens the PR via MCP or printed `gh`/`glab` commands.

**8 — POST-MERGE E2E.** After you merge and CI's hard gate passes, run the combined end-to-end steps from `verification.md` against the merged result, watching the rollout thresholds and error-budget gate. A regression re-enters at ARCHITECT via `/awe-regression` as `plans/<ticket>-R<N>/`; clean means done.

---

## Sequence: Intake → Architect → Approve (async Q&A)

The first half of the pipeline. Note the untrusted-ticket sanitization, the hook allow/deny
on writes, the subagentStart gating, and that open questions are **async and non-blocking** —
the human answers at their own pace while other work proceeds.

```mermaid
sequenceDiagram
    autonumber
    actor Human
    participant Orch as Orchestrator (main agent)
    participant Hooks as AWE Hooks
    participant MCP as Ticket MCP
    participant Arch as awe-architect (subagent)
    participant Files as plans/ + state files

    Human->>Orch: /awe-intake PROJ-123
    Orch->>MCP: fetch title + description + acceptance criteria
    MCP-->>Orch: raw ticket text (UNTRUSTED data)
    Orch->>Orch: sanitize — extract structured spec, ignore embedded instructions
    Note over Orch: any "ignore your rules" content → flagged to Human, never followed
    Orch->>Hooks: preToolUse · Write plans/PROJ-123/intake.md
    Hooks-->>Orch: allow (plans/ is writable in every phase)
    Orch->>Files: write intake.md (hypothesis + confidence) and open-questions.md (Q + GUESS, grouped by role)
    Orch->>Files: write awe-state.json (active, phase=architect)
    Orch-->>Human: N open questions — answer at your pace, then /awe-intake --resume

    Note over Human,Files: ASYNC — non-blocking, other tickets/tasks proceed meanwhile
    Human->>Files: edit open-questions.md (check the box, answer — one word on a GUESS is fine)
    Human->>Orch: /awe-intake --resume PROJ-123
    Orch->>Files: read answers, fold them into intake.md assumptions/constraints

    Human->>Orch: /awe-architect
    Orch->>Hooks: subagentStart · awe-architect
    Hooks-->>Orch: allow (phase = architect)
    Orch->>Arch: brief (intake.md, open-questions.md, roles from awe.config.json)
    Arch->>Files: write architecture.md + ROLE.plan.md (status: draft, templated XS–XL tasks)
    Arch-->>Orch: done
    Orch->>Files: state phase = approve
    Orch-->>Human: architecture summary + per-role plan list, then run /awe-approve

    Human->>Orch: /awe-approve
    Orch->>Files: validate every question answered, every dependency acknowledged
    Orch-->>Human: approval summary + "Approve these plans? (yes/no)"
    Human-->>Orch: yes  (explicit — "looks reasonable"/"I guess"/silence are rejected)
    Orch->>Hooks: preToolUse · Write plan frontmatter status: approved
    Hooks-->>Orch: allow (status-only flip on a draft plan)
    Orch->>Files: flip each plan to approved, write approvals.md, state phase = code
    Orch-->>Human: print per-role start commands (/awe-code backend, /awe-code frontend)
```

---

## Sequence: Code → Review loop → Verify → Ship → Post-merge

The second half. Note the secret scan on every edit, the stop-hook evidence loop, the
needs-fix respawn with `handoff.md` carrying context forward, the escalation path, the human
signoff, the ship pre-flight, the CI hard gate, and the regression re-entry.

```mermaid
sequenceDiagram
    autonumber
    actor Human
    participant Orch as Orchestrator (main agent)
    participant Hooks as AWE Hooks
    participant Coder as awe-backend-dev (worktree)
    participant Rev as awe-reviewer
    participant Files as plans/ + state files
    participant CI as CI (GitHub/GitLab)

    Human->>Orch: /awe-code backend
    Orch->>Hooks: subagentStart · awe-backend-dev
    Hooks-->>Orch: allow (phase=code AND planStatus=approved)
    Orch->>Coder: spawn on worktree .worktrees/PROJ-123-backend with handoff.md
    loop per task (RED → GREEN → REFACTOR)
        Coder->>Hooks: preToolUse · Write src/…
        Hooks-->>Coder: allow (phase=code)
        Coder->>Hooks: postToolUse · secret scan of the edit
        Hooks-->>Coder: {} if clean, flag if e.g. an AWS key pattern appears
    end
    Coder->>Hooks: stop (session trying to end)
    Hooks-->>Coder: followup_message — no fresh awe-evidence.json, run the tests
    Coder->>Files: run test command → write awe-evidence.json (testsPassed:true, under 2h old)
    Coder->>Hooks: stop
    Hooks-->>Coder: {} (evidence fresh — session may end)
    Coder-->>Orch: done, tests green, evidence on disk

    Human->>Orch: /awe-review backend
    Orch->>Rev: spawn both, adversarial brief (diff range, plan + contract), scanners run
    Rev-->>Orch: round-N.md — verdict + severity-labeled findings
    alt needs-fix AND iteration below reviewIterations
        Orch->>Files: bump iteration, append round-N findings to handoff.md (context preserved)
        Orch->>Coder: respawn for the fix round with updated handoff.md
        Coder-->>Orch: fixes + fresh evidence
        Orch->>Rev: review next round
        Rev-->>Orch: verified (or loop again)
    else budget reached (3 rounds unresolved)
        Orch->>Files: write ESCALATION.md (findings, what was tried, options)
        Orch-->>Human: escalation — you decide: more budget / human fix / scope cut
    end

    Human->>Orch: /awe-verify
    Orch->>Files: awe-verifier writes verification.md (numbered by-hand steps)
    Orch-->>Human: run the steps by hand (HUMAN GATE)
    alt any step fails — stop the line
        Human->>Orch: /awe-regression DESCRIPTION
        Orch->>Files: plans/PROJ-123-R1/ created, re-enter at architect (Prove-It repro test)
    else all pass
        Human->>Files: set verified:true + initials + date in verification.md
        Human->>Orch: done
        Orch->>Files: write awe-signoff.json, state phase = ship
    end

    Human->>Orch: /awe-ship
    Orch->>Files: write ship-decision.md (GO/NO-GO + rollback plan + RTO), check ADR gate
    Orch->>Hooks: before-shell · git push -u origin awe/PROJ-123-backend
    Hooks-->>Orch: allow (signoff present + evidence fresh + awe/ branch)
    Orch->>CI: push branch + open PR (via MCP or printed gh/glab commands)
    CI-->>Human: CI hard gate runs — gitleaks, semgrep, osv-scanner, checkov, codeql must pass
    Human->>CI: merge
    CI-->>Human: deploy to dev/staging
    Human->>Orch: run combined post-merge E2E from verification.md
    alt bug found (or error budget burning)
        Orch->>Files: /awe-regression → re-enter at architect as PROJ-123-R1
    else clean
        Orch->>Files: state phase = done, active = false
    end
```

---

## Sequence: Plugin install — no app-repo copy

The Cursor Plugin is the default. Hooks run from the plugin; the app repo does not need `.cursor/`. Cloud/`@cursor` still only sees **committed** project hooks — use `setup.mjs` if that matters.

```mermaid
sequenceDiagram
    autonumber
    actor Dev
    participant Cursor
    participant Plugin as AWE plugin
    participant Mem as codebase-memory MCP
    participant App as app working tree

    Dev->>Cursor: Customize → Install RT Coding Essentials (or ~/.cursor/plugins/local/rt-coding-essentials)
    Cursor->>Plugin: load RT Coding Essentials (rules 00/10/15/20, skills, agents, hooks.json)
    Cursor->>Dev: enable codebase-memory MCP (trust once)
    Dev->>Cursor: open app repo, describe ticket /awe-run
    Plugin->>App: sessionStart writes .cursor/state/awe-discovered.json
    Plugin->>Mem: index_repository if needed
    Plugin->>App: plans/<ticket>/ + state (not required in git)
    Note over Plugin: chain intake → architect → code → review
    Plugin-->>Dev: STOP for explicit yes (approve) and hands-on verify
    opt Slack or GitHub/GitLab MCP connected
        Plugin->>Dev: status comments / messages
    end
    Plugin->>Mem: manage_adr after ship or /awe-remember
```

---

## Sequence: Setup — what lands where

`setup.mjs` is a one-shot copy into **the application repo**. It never writes
`~/.cursor`. MCP "this project vs for myself" is a separate Cursor prompt;
see [GUIDE.md](GUIDE.md) §2.

```mermaid
sequenceDiagram
    autonumber
    actor Dev
    participant Setup as setup.mjs
    participant App as your-project/ (git)
    participant Home as ~/.cursor/ (untouched)
    participant Cursor

    Dev->>Setup: cd your-project && node ~/agentic-coding/setup.mjs
    Setup->>App: .cursor/hooks.json + hooks/*.mjs (managed)
    Setup->>App: .cursor/rules 00/10/15/20 (managed) + 30/40 (yours)
    Setup->>App: .cursor/agents + .cursor/skills (managed)
    Setup->>App: .cursor/mcp.json with mcpServers empty (yours)
    Setup->>App: awe.config.json + CONSTRAINTS.md (yours)
    Setup->>App: .gitignore += .cursor/state/
    Note over Home: no writes
    Dev->>Cursor: Trust workspace + restart
    Cursor->>App: load project hooks.json
```

---

## Sequence: Hook runtime (every agent action)

Nothing daemonizes. Cursor spawns Node per event.

```mermaid
sequenceDiagram
    autonumber
    participant Agent
    participant Cursor
    participant Pre as pre-tool-gate.mjs
    participant Scan as post-tool-scan.mjs
    participant Shell as before-shell.mjs
    participant Stop as stop-evidence.mjs

    Agent->>Cursor: Write / Edit / Shell / Task / stop
    alt write tools
        Cursor->>Pre: preToolUse JSON
        Pre-->>Cursor: allow or deny
        opt allowed write
            Cursor->>Scan: postToolUse
            Scan-->>Cursor: {} or additional_context (secret)
        end
    else shell
        Cursor->>Shell: beforeShellExecution
        Shell-->>Cursor: allow / deny / ask
    else agent tries to end (code/review)
        Cursor->>Stop: stop
        Stop-->>Cursor: {} or followup_message (keep going)
    end
```

---

## Sequence: Parallel backend + frontend worktrees

Roles do not share a working tree. The reviewer only judges that role's diff
against its plan + the contract stub.

```mermaid
sequenceDiagram
    autonumber
    actor BE as Backend dev
    actor FE as Frontend dev
    participant OrchB as Chat A
    participant OrchF as Chat B
    participant WT_B as worktree awe/TICKET-backend
    participant WT_F as worktree awe/TICKET-frontend
    participant Contract as architecture.md contract

    Note over BE,FE: Both plans approved — /awe-approve already flipped phase=code
    BE->>OrchB: /awe-code backend
    FE->>OrchF: /awe-code frontend
    OrchB->>WT_B: branch awe/TICKET-backend from baseBranch
    OrchF->>WT_F: branch awe/TICKET-frontend from baseBranch
    WT_F->>Contract: FE implements UI against stub types / mock API
    WT_B->>Contract: BE implements real endpoint matching the same shapes
    Note over WT_B,WT_F: Reviewer of FE cannot fail FE because BE API is missing
```

---

## Sequence: MCP enablement (project vs user)

AWE does not start MCP servers. You copy a block, then Cursor does.

```mermaid
sequenceDiagram
    autonumber
    actor Human
    participant Project as repo/.cursor/mcp.json
    participant User as ~/.cursor/mcp.json
    participant Cursor
    participant MCP as MCP server

    Note over Project: setup wrote mcpServers: {}
    alt This project (recommended for ticket/Git MCP)
        Human->>Project: copy github/redmine/… from _disabled_examples
        Human->>Cursor: restart / reload MCP
        Cursor->>MCP: start stdio or HTTP (OAuth)
        Note over Project: committed — teammates get the same server list
    else For myself (personal tokens)
        Human->>User: Cursor UI "for myself"
        Cursor->>MCP: start — applies to EVERY workspace on this laptop
        Note over User: not in git; AWE setup never created this file
    end
```

---

## Sequence: CI hard gate (L4) after /awe-ship

Optional `--ci github` / `--ci gitlab`. Runs on the server, not in Cursor.

```mermaid
sequenceDiagram
    autonumber
    participant Ship as /awe-ship
    participant Hooks as before-shell.mjs
    participant Remote as origin
    participant CI as GitHub Actions / GitLab
    actor Human

    Ship->>Hooks: git push awe/TICKET-backend
    Hooks-->>Ship: allow (signoff + fresh evidence + awe/* branch)
    Ship->>Remote: push + open PR
    Remote->>CI: pull_request
    CI->>CI: tests + lint (AWE_TEST_CMD / AWE_LINT_CMD)
    CI->>CI: gitleaks, semgrep scan, osv-scanner, CodeQL
    opt IaC in repo
        CI->>CI: checkov + cfn-guard
    end
    opt AWE_ZAP_TARGET set
        CI->>CI: ZAP baseline DAST
    end
    CI-->>Human: checks green or red — you merge
```

---

## Sequence: How the hook test suite works

`npm run test:hooks` (`scripts/awe-hook-tests.sh`) currently **86 passed, 0 failed**.
It builds a throwaway fixture, pipes Cursor-shaped JSON into each hook, and asserts allow/deny.

```mermaid
sequenceDiagram
    autonumber
    participant T as awe-hook-tests.sh
    participant F as /tmp fixture (fake project)
    participant H as template/.cursor/hooks/*.mjs

    T->>F: git init, copy awe.config.json, write state + plans
    loop each case
        T->>F: set phase / evidence / CONSTRAINTS.md as needed
        T->>H: stdin JSON + CURSOR_PROJECT_DIR=fixture
        H-->>T: JSON permission / followup_message / additional_context
        T->>T: PASS if body matches expect (deny / allow / {})
    end
    T->>T: setup.mjs --yes / --dry-run / --uninstall on another temp repo
    T-->>T: print N passed, 0 failed
```

---

*Enforcement detail: every allow/deny above comes from a real hook in `.cursor/hooks/`
(`pre-tool-gate`, `before-shell`, `before-read`, `post-tool-scan`, `subagent-gate`,
`stop-evidence`, `constraints-guard`). When AWE is inactive — no `awe-state.json`, or
`AWE_DISABLED=1` — pipeline gates exit immediately. Tamper-protection and baseline
shell/read safety stay on. Demonstration and install-scope detail: [GUIDE.md](GUIDE.md).*
