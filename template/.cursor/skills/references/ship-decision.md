<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), Copyright (c) 2025 Addy Osmani, MIT License — see NOTICE. -->
<!-- Source: skills/shipping-and-launch (+ documentation-and-adrs for the ADR gate). Referenced by awe-ship. -->

# Ship Decision, Rollout & Rollback

The goal is not just to deploy — it's to deploy **safely**: monitoring in place, a rollback plan ready, and a clear definition of success. Every launch should be **reversible, observable, and incremental**.

## The Ship Decision artifact (mandatory before push)

`awe-ship` writes `plans/<ticket>/ship-decision.md`. No artifact, no push — it's the ship-phase counterpart to the approved plan. Template:

```markdown
---
ticket: <ticket>
decidedAt: <ISO-8601>
decider: <human initials>
---

# Ship Decision — <ticket>

## Verdict: GO | NO-GO

## Blockers (NO-GO reasons; empty if GO)
- <anything that must be resolved before merge>

## Acknowledged risks (accepted knowingly, GO only)
- <risk> — why it's acceptable to ship anyway

## Rollback plan
### Trigger conditions (any one ⇒ roll back)
- Error rate > 2× baseline
- P95 latency > 50% above baseline
- User-reported issues spike / data-integrity issue / security vuln discovered
### Exact steps
1. <feature flag off, OR `git revert <sha> && git push`, OR redeploy previous version>
2. Verify rollback: health check + error monitoring
3. Communicate: notify the team
### Database considerations
- <migration rollback path; is new data preserved or cleaned up>
### Recovery time objective (RTO)
- Feature flag: < 1 min · Redeploy previous: < 5 min · DB rollback: < 15 min
```

## Rollout decision thresholds

At each rollout stage (canary → 25% → 50% → 100%), decide advance / hold / roll back:

| Metric | Advance (green) | Hold & investigate (yellow) | Roll back (red) |
|---|---|---|---|
| Error rate | Within 10% of baseline | 10–100% above baseline | **> 2× baseline** |
| P95 latency | Within 20% of baseline | 20–50% above baseline | **> 50% above baseline** |
| Client JS errors | No new types | New errors < 0.1% of sessions | New errors > 0.1% of sessions |
| Business metrics | Neutral/positive | Decline < 5% (may be noise) | Decline > 5% |

**Roll back immediately** if error rate > 2× baseline, P95 latency > 50% above baseline, user issues spike, data integrity is hit, or a security vulnerability is discovered.

## Error-budget release gate

The error budget — the fraction of requests/time your SLO allows to fail — is an **objective gate, not a negotiation**:

```
Budget remaining > 20%   →  Ship normally; monitor closely
Budget remaining 0–20%   →  Slow rollouts only; no high-risk changes
Budget exhausted         →  Freeze feature work; focus entirely on reliability
Budget resets            →  Resume normal pace; bake in the fix that recovered it
```

A high **burn rate** during a canary (consuming budget faster than baseline) is a **hold** signal in the thresholds table above — treat it like an elevated error rate even when individual thresholds are green. This is the gate AWE applies at the **post-merge E2E** phase: if the merged result burns budget, file `/awe-regression`, don't ship more.

## Post-launch verification (first hour)

1. Health endpoint returns 200 · 2. Error dashboard: no new error types · 3. Latency dashboard: no regression · 4. Critical user flow tested manually · 5. Logs flowing and readable · 6. Rollback mechanism confirmed (dry run if possible).

## Docs gate (ADRs) — from documentation-and-adrs

Before the PR is opened, the **docs gate** runs: **every architectural decision made during this ticket needs an ADR, linked in the PR body.** Record decisions, not just code — code shows *what*; an ADR explains *why this way* and *what alternatives were rejected*.

- **When an ADR is required:** choosing a framework/library/major dependency; a data model or schema; an auth strategy; an API architecture; build/hosting/infra choices; anything expensive to reverse.
- **Match the existing convention first.** If the repo already has ADRs (`docs/adr/`, `docs/decisions/`, MADR, an `.adr-dir`), continue its location, numbering, and headings — don't start a second scheme. Only if none exists, use `docs/decisions/NNNN-title.md` with sections **Status / Date / Context / Decision / Alternatives Considered / Consequences**.
- **Don't delete old ADRs.** A changed decision gets a new ADR that supersedes the old one (lifecycle: PROPOSED → ACCEPTED → SUPERSEDED/DEPRECATED).
- Comment the *why*, not the *what*; no commented-out code; no stale TODOs without a ticket.

## Rationalizations (shipping)

| Excuse | Reality |
|---|---|
| "It works in staging, it'll work in production" | Production has different data, traffic, and edge cases. Monitor after deploy. |
| "We don't need feature flags for this" | Every feature benefits from a kill switch. Even "simple" changes break things. |
| "Monitoring is overhead" | Without it you discover problems from user complaints instead of dashboards. |
| "Rolling back is admitting failure" | Rolling back is responsible engineering. Shipping a broken feature is the failure. |
| "The error rate looks fine, keep shipping" | Check the **burn rate**, not just the current rate — consuming budget faster than baseline is a hold signal even when thresholds are green. |
| "It's Friday afternoon, let's ship it" | Ship when you can watch it. A deploy nobody monitors is a incident waiting for a timezone. |
