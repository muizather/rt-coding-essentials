<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), Copyright (c) 2025 Addy Osmani, MIT License — see NOTICE. -->

# Project Constraints

> **The written quality bar.** This file declares the constraints agents must respect
> **before** they start work. It exists because an agent will happily lower the bar
> to make a failing check pass — so the bar is written down, and a hook
> (`.cursor/hooks/constraints-guard.mjs`) blocks any agent edit that weakens it.
>
> **Rules of engagement**
> - **Humans own this file.** Agents may *add* or *strengthen* constraints, never *relax* them. To relax one, a human edits it here and records the change in **Exceptions**.
> - These are **floors, not ceilings.** Exceeding the bar is always fine.
> - An agent that hits a constraint it cannot meet **stops and asks** — it does not edit this file to make the problem disappear.

Last reviewed: <date> by <owner>

---

## Floor (always enforced, no setup required)

- No new suppression comments: `@ts-ignore`, `eslint-disable`, `# noqa`, `# type: ignore`, `nosemgrep`, `gitleaks:allow`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`
- No skipped or deleted tests without a reason in the commit message
- No secrets in source
- **This file does not get weakened to make a change pass.** Tightening the bar is silent; loosening it is loud.

---

## Testing

| Constraint | Value | Why |
|---|---|---|
| Line coverage | ≥ 80% | Untested code is unreviewable code |
| Mutation score | ≥ 70% | Coverage without assertions is a lie |
| Flaky tests | 0 | A flaky suite teaches people to ignore red |
| New public function without tests | Not allowed | Tests are part of "done", not a follow-up |

## Performance

| Constraint | Value | Why |
|---|---|---|
| API p95 latency | ≤ 250 ms | Users feel latency before they see features |
| Web LCP | ≤ 2500 ms | Core Web Vitals "good" threshold |
| Web CLS | ≤ 0.1 | Layout shift is a correctness bug |
| Web INP | ≤ 200 ms | Interaction responsiveness floor |
| Initial JS bundle | ≤ 200 kB gzip | Parse/execute cost on real devices |

## Reliability

| Constraint | Value | Why |
|---|---|---|
| Error budget (user-facing ops) | ≤ 0.1% | Ships stop when the budget is spent |
| p99 latency | ≤ 2× p95 | Tail latency is where incidents live |
| New dependencies (per feature) | ≤ 3 | Every dep is supply-chain + upgrade debt |

## Security

| Constraint | Value | Why |
|---|---|---|
| High/critical vulns at merge | 0 | Known-exploitable code does not ship |
| Secrets in the repo | Never | Rotation is painful; prevention is cheap |
| New lint suppressions / `@ts-ignore` | 0 (without human sign-off) | Suppressions are hidden debt |

## Code quality

| Constraint | Value | Why |
|---|---|---|
| New lint/type errors | 0 | A growing error count never shrinks on its own |
| Files touched outside task scope | 0 | Drive-by edits make review and revert unsafe |
| TODO without a linked ticket + owner | Not allowed | Untracked TODOs are where work goes to die |

---

## Measured, not yet enforced

Record today's value and a direction; the bar is "must not move the wrong way", not an
aspiration the codebase fails on day one. When a number improves, update it; when it
drops, that's the finding.

| Metric | Today | Direction |
|---|---|---|
| _(example)_ Project coverage | 62.4% | must not fall |
| _(example)_ Bundle size (main) | 184 kB | must not grow |

---

## Exceptions

A constraint may be relaxed **only** by a human editing this table. Each exception
records why, who approved it, and when it expires. An expired exception is a bug.

| Constraint relaxed | Reason | Owner | Expires |
|---|---|---|---|
| _(none)_ | | | |

---

### If you're an AI agent reading this

Respect the bar. If you genuinely cannot meet a constraint, **stop and ask** — do
not edit this file to make the failure go away. The `constraints-guard.mjs` hook
will deny the edit anyway; asking a human is faster and honest.
