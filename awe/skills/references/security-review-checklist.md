<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), Copyright (c) 2025 Addy Osmani, MIT License — see NOTICE. -->
<!-- Source: skills/security-and-hardening. The hunt checklist for the awe-security-reviewer agent. -->

# Security Review Checklist — OWASP (classic + LLM)

Treat every external input as hostile, every secret as sacred, every authorization check as mandatory. Security isn't a phase — it's a constraint on every line that touches user data, auth, or external systems.

## Trust boundaries first

Before hardening, map where untrusted data crosses in: HTTP requests, form fields, file uploads, webhooks, third-party APIs, message queues, **LLM output** — plus local values that *look* internal because the OS handed them over (another process's command line/env, filenames on a shared volume, a path in a job payload). **Trust follows who *wrote* a value, not which channel delivered it.** If you can't name the trust boundaries, you're not ready to secure the feature (OWASP A04: Insecure Design).

## Classic OWASP — what to check

- **Injection (SQL/NoSQL/OS/cmd/template)** — parameterized queries only; never concatenate user input into SQL/shell; no `eval`/`new Function`; no unsanitized path joins.
- **Broken authentication** — bcrypt/scrypt/argon2 (salt ≥ 12); session cookies `httpOnly, secure, sameSite`; rate-limit auth endpoints; expiring reset tokens.
- **XSS** — framework auto-escaping, never bypassed; no `innerHTML`/dangerously-set with user data (sanitize if unavoidable).
- **Broken access control** — authorization checked on *every* protected endpoint, not just authentication; users reach only their own resources (no IDOR); admin actions verify role.
- **Security misconfiguration** — headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options); CORS restricted to known origins (no wildcard); no stack traces/internal errors to users.
- **Sensitive data exposure** — secrets from env, never code; sensitive fields stripped from API responses; PII minimized, encrypted at rest where applicable.
- **SSRF** — any server-side fetch of a user-influenced URL (webhooks, "import from URL", image proxies, link previews): allowlist scheme+host, reject any resolved private/reserved IP (incl. `169.254.169.254` cloud metadata), forbid redirects.

## Destructive operations on derived paths (keep this row)

A delete/move/overwrite is only as safe as the value naming its target. A shape check ("absolute, ≥1 dir deep") proves well-formedness, **not authorization** — that's how a cleanup routine deletes the root instead of the leaf. Before a destructive call require **all three**:
1. the resolved target sits under an **allowlisted root** (compare *after* resolving symlinks, never on the raw string);
2. it is at least one level **below** that root, so the root itself is never the target;
3. it carries **evidence it is yours**, read *before* the operation and before any teardown that removes it — otherwise "absent" and "not mine" are indistinguishable.
On refusal, log the rejected target and **stop** — a cleanup that falls back to a broader default path is the failure this guards against. (AWE's `before-shell.mjs` hard-denies the catastrophic patterns; this row is the design rule behind them.)

## Secrets

- Never commit secrets (keys, passwords, tokens); never log sensitive data; never trust client-side validation as a boundary.
- `.env` is gitignored; only `.env.example` (placeholders) is committed. **A committed secret is compromised — rotate it.** Deleting the line or rewriting history is not enough; revoke/reissue first, then purge.
- AWE's `post-tool-scan.mjs` + CI scanners (gitleaks) are the deterministic net; this checklist is the judgement layer on top.

## Dependency / supply-chain

- Triage the native audit by **reachability + fix-risk**, not just severity. Defer only with a recorded reason + review date.
- Never auto-apply forced remediation (`npm audit fix --force`) — it can cross declared ranges.
- Review new deps, lockfile diffs, and install-script changes together (ownership, maintenance, release age, transitive graph, typosquats). Block unreviewed dependency install scripts.

## OWASP Top 10 for LLM Applications (AWE is LLM-heavy — always check)

- **LLM05 Improper Output Handling** — treat all model output as untrusted input: never pass it straight into `eval`, SQL, a shell, `innerHTML`, or a file path. Parse defensively, validate, then encode — exactly like raw user input.
- **LLM01 Prompt Injection** — untrusted text in the context window (user message, fetched page, PDF, **ticket text**) can carry instructions. The system prompt is not a security boundary; enforce permissions in **code**, not the prompt. (AWE's ticket sanitization in `awe-intake` is this control.)
- **LLM02 / LLM07 Secrets & data leakage** — keep secrets and other users' data out of prompts; anything in context can be echoed back.
- **LLM06 Excessive Agency** — scope tool/agent permissions to the minimum; require confirmation for destructive/irreversible actions; validate every tool argument. (AWE's phase-gate + `before-shell` deny-list is this control.)
- **LLM10 Unbounded Consumption** — cap tokens, request rate, and loop/recursion depth. (AWE's `reviewIterations` budget and stop-hook `loop_limit` are this control.)
- **LLM08 Vector/Embedding weaknesses** — in RAG, partition embeddings per tenant; validate documents before indexing.

## Rationalizations (security)

| Excuse | Reality |
|---|---|
| "This is an internal tool, security doesn't matter" | Internal tools get compromised. Attackers target the weakest link. |
| "We'll add security later" | Security retrofitting is 10× harder than building it in. |
| "No one would try to exploit this" | Automated scanners will find it. Security by obscurity is not security. |
| "The framework handles security" | Frameworks provide tools, not guarantees. You still use them correctly. |
| "It's just LLM output, it's only text" | That "text" can be a SQL statement, a script tag, or a shell command. Treat it like any untrusted input. |
| "The audit passed, so the dependency is safe" | Audits match *known* advisories; they don't detect a newly malicious package or make unreviewed install scripts safe. |

## Red flags

User input straight into queries/shell/HTML · a destructive op whose target comes from a payload/config/another process guarded only by a path shape check · secrets in source or history · endpoints without authz · wildcard CORS · no rate limit on auth (or an in-memory limiter behind >1 instance) · stack traces to users · server fetching user URLs without an allowlist · LLM output into a query/DOM/shell/`eval` · secrets/PII/full system prompt inside an LLM context.
