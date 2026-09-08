# AWE Flow — the pipeline, drawn

This page shows how a ticket moves through AWE: the phases, the human gates, and the
hooks that enforce them. It's the visual companion to the **Daily workflow** section of
the [README](../README.md) and to the `.cursor/rules/10-awe-phases.mdc` rule.

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

**2 — ARCHITECT** (`/awe-architect`). The `awe-architect` subagent (gated by `subagent-gate.mjs`) turns the spec into `architecture.md` (dependency graph + cross-role contract) and one `<role>.plan.md` per role, each task templated (acceptance criteria, verify command, files, XS–XL size). Plans land as `status: draft`.

**3 — APPROVE** (`/awe-approve`) ▣ **human gate**. Validates every open question is answered and every dependency acknowledged, rejects hedged approvals ("looks reasonable" ≠ yes), then flips each plan to `status: approved`. *Hooks involved:* `pre-tool-gate.mjs` blocks all code writes until this flips `phase: code`; the plan-clobber guard makes approved plans append-only.

**4 — CODE** (`/awe-code <role>`). Creates a worktree + branch `awe/<ticket>-<role>`, writes `handoff.md`, spawns the role dev subagent (gated by `subagent-gate.mjs` — needs `phase: code` + approved plan). The coder works test-first (RED→GREEN→REFACTOR) using the repo's own commands. *Hooks involved:* `pre-tool-gate.mjs` allows code writes; `post-tool-scan.mjs` secret-scans every edit; `before-shell.mjs` blocks dangerous commands; `stop-evidence.mjs` refuses to end the session without a fresh `awe-evidence.json` (`testsPassed:true`, < 2 h old).

**5 — REVIEW** (`/awe-review <role>`). Runs scanners, then spawns `awe-reviewer` + `awe-security-reviewer` in parallel — a fresh-context **adversarial** pass over the diff against the plan and acceptance criteria. Findings are severity-labeled (Critical ⇒ the iteration fails). *needs-fix* respawns the coder with `handoff.md` updated (context preserved); *verified* moves on; three unresolved rounds write `ESCALATION.md` and hand it to you.

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
    participant Rev as awe-reviewer + awe-security-reviewer
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

*Enforcement detail: every allow/deny above comes from a real hook in `.cursor/hooks/`
(`pre-tool-gate`, `before-shell`, `before-read`, `post-tool-scan`, `subagent-gate`,
`stop-evidence`, `constraints-guard`). When AWE is inactive — no `awe-state.json`, or
`AWE_DISABLED=1` — every hook exits immediately and interferes with nothing.*
