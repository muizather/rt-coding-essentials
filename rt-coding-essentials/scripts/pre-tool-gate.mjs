// AWE pre-tool gate (preToolUse, matcher "Write|Edit|StrReplace|Delete|MultiEdit").
//
// HARD gate (failClosed: true in hooks.json). Two jobs:
//   1. TAMPER PROTECTION (always on, even when AWE is inactive): agents may never
//      modify .cursor/hooks.json, .cursor/hooks/**, or awe.config.json. Those are
//      human-owned. The fix is "ask the human", never "edit the gate".
//   2. PHASE GATING (only when AWE is active): during intake|architect|approve the
//      agent may only write under plans/ and .cursor/state/. Code emission is
//      blocked until plans are approved and the phase flips to `code`.
//   3. PLAN-CLOBBER GUARD (only when AWE is active): a plan whose frontmatter
//      status is approved (or anything past draft/questions-open) is approved
//      work state. Agents may append to it or flip a status field, but may never
//      overwrite/delete its content — unchecked tasks may be mid-build in another
//      session. (Adapted from agent-skills 'planning-and-task-breakdown' — MIT,
//      Addy Osmani 2025; see NOTICE.)
//
// Inactive / no state file / AWE_DISABLED=1  →  `{}` immediately (except rule 1).

import fs from 'node:fs';
import path from 'node:path';
import {
  runHook, respond, loadState, isActive, projectDir, extractFilePath, extractToolContent, relPath,
  sourceWriteAllowedInCodePhase,
} from './lib/state.mjs';
import { audit } from './lib/audit.mjs';

const TAMPER_PROTECTED = [
  { re: /^\.cursor\/hooks\.json$/, what: '.cursor/hooks.json' },
  { re: /^\.cursor\/hooks\//, what: '.cursor/hooks/**' },
  { re: /^awe\.config\.json$/, what: 'awe.config.json' },
];

// Phases where only planning artifacts may be written.
const PLAN_ONLY_PHASES = new Set(['intake', 'architect', 'approve']);

// Paths an agent may always write (planning workspace + AWE runtime state).
const ALWAYS_WRITABLE = [
  /^plans\//,
  /^\.cursor\/state\//,
  /^docs\/domain-model\//,
  // Child git repo plan folders (platform workspace: magento/plans/, nestjs/plans/, …)
  /^[^./][^/]*\/plans\//,
];

// ── Rule 3 helpers: plan-clobber guard ─────────────────────────────────────
const PLAN_FILE = /(?:^|\/)plans\/[^/]+\/(?:architecture\.md|spec\.md|[^/]+\.spec\.md|[^/]+\.plan\.md|[^/]*implementation\.plan\.md)$/;
// Statuses where a plan is still being drafted and may be freely rewritten.
const PLAN_OPEN_STATUSES = new Set(['draft', 'questions-open', 'ready']);

/** Frontmatter `status:` of a plan file, or null. */
function planStatus(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return null;
  const s = /^status:\s*([a-z-]+)/m.exec(fm[1]);
  return s ? s[1] : null;
}
/** Strip the frontmatter status value so a status-only flip compares equal. */
const stripStatus = (t) => t.replace(/^(\s*status:\s*)[a-z-]+[ \t]*$/m, '$1').replace(/\s+$/g, '');

/**
 * Returns a short reason when the write would clobber a locked (non-draft) plan,
 * else null. Allowed: creating a new plan, editing a draft/questions-open plan,
 * a pure append, and edits that only touch the `status:` frontmatter line.
 */
function planCobberViolation(rel, dir, input) {
  if (!PLAN_FILE.test(rel)) return null;
  const abs = path.join(dir, rel);
  if (!fs.existsSync(abs)) return null; // new plan file — always fine
  const old = fs.readFileSync(abs, 'utf8');
  const status = planStatus(old);
  if (!status || PLAN_OPEN_STATUSES.has(status)) return null; // still editable

  const { content, oldStr, newStr, edits } = extractToolContent(input);
  // Whole-file write: allow append or a status-only flip; deny any content removal.
  if (typeof content === 'string') {
    if (content.startsWith(old)) return null; // pure append
    if (stripStatus(content) === stripStatus(old)) return null; // status-only flip
    return 'rewrite removes approved plan content';
  }
  // Line edits: deny if any non-status line is removed.
  const pairs = edits && edits.length ? edits : oldStr !== undefined ? [{ oldStr, newStr }] : [];
  for (const p of pairs) {
    const next = p.newStr || '';
    const removed = (p.oldStr || '').split('\n').filter((l) => l.trim() !== '' && !next.includes(l));
    for (const line of removed) {
      if (!/^\s*status:/.test(line)) return `edit removes "${line.trim().slice(0, 40)}"`;
    }
  }
  return null; // append / status-only edit
}

await runHook(async (input) => {
  const dir = projectDir();
  const rel = relPath(extractFilePath(input), dir);
  if (!rel) return respond({}); // can't identify a target → don't guess, don't block

  // --- Rule 1: tamper protection, unconditional -------------------------------
  for (const { re, what } of TAMPER_PROTECTED) {
    if (re.test(rel)) {
      audit(dir, 'preToolUse', 'deny', `tamper-protection: ${what}`, { path: rel });
      return respond({
        permission: 'deny',
        agent_message:
          `AWE tamper-protection: "${what}" is human-owned and agents may never modify it. ` +
          `If it needs to change, STOP and ask the human to make the edit themselves. ` +
          `Do not attempt to work around this gate.`,
        user_message: `AWE blocked an agent attempt to modify ${what}.`,
      });
    }
  }

  // --- Everything below only applies while a ticket is in the pipeline --------
  const state = loadState(dir);
  if (!isActive(state)) return respond({}); // normal, non-AWE work: never interfere

  // --- Rule 3: plan-clobber guard (approved plans are append-only for agents) --
  const clobber = planCobberViolation(rel, dir, input);
  if (clobber) {
    audit(dir, 'preToolUse', 'deny', `plan-clobber guard: ${clobber}`, { path: rel, ticket: state.ticket, phase: state.phase });
    return respond({
      permission: 'deny',
      agent_message:
        `AWE plan-clobber guard: "${rel}" is an approved/locked plan and this write would remove content (${clobber}). ` +
        `Approved plans are append-only for agents — you may add notes or flip a frontmatter status field, but never rewrite or ` +
        `delete approved content (its tasks may be mid-build in another session). To change the substance, ask the human to ` +
        `re-open the plan (set status back to draft) or to make the edit themselves.`,
      user_message: `AWE blocked an agent from overwriting the approved plan ${rel}.`,
    });
  }

  // --- Rule 2: plan-only phases ------------------------------------------------
  if (PLAN_ONLY_PHASES.has(state.phase)) {
    if (ALWAYS_WRITABLE.some((re) => re.test(rel))) {
      return respond({ permission: 'allow' });
    }
    audit(dir, 'preToolUse', 'deny', `phase=${state.phase}: write outside plans/ blocked`, {
      path: rel, ticket: state.ticket, phase: state.phase,
    });
    return respond({
      permission: 'deny',
      agent_message:
        `Phase is ${state.phase} — code emission is blocked until plans are approved (phase=code). ` +
        `Write plans under plans/${state.ticket ?? '<ticket>'}/ only. ` +
        `If you believe the phase is wrong, tell the human; only skills transition phases.`,
    });
  }

  // --- code: source writes need an implementation plan + answered questions ----
  if (state.phase === 'code') {
    if (ALWAYS_WRITABLE.some((re) => re.test(rel))) {
      return respond({ permission: 'allow' });
    }
    if (!sourceWriteAllowedInCodePhase(dir, state, rel)) {
      const ticket = state.ticket ?? '<ticket>';
      audit(dir, 'preToolUse', 'deny', `phase=code: implementation plan/questions not ready`, {
        path: rel, ticket, phase: state.phase,
      });
      return respond({
        permission: 'deny',
        agent_message:
          `Phase is code but this role's implementation plan is not ready. Write ` +
          `plans/${ticket}/<role>.implementation.plan.md and ` +
          `plans/${ticket}/<role>.implementation-questions.md first. ` +
          `If that questions file has open \`- [ ]\` boxes, STOP for the human — ` +
          `do not write application source until every box is checked. ` +
          `Re-run /awe-code <role> after they answer.`,
        user_message:
          `AWE blocked a source write: the ${ticket} implementation plan still has ` +
          `open questions (or is missing). Answer them in plans/${ticket}/ then continue.`,
      });
    }
  }

  // --- review / verify / ship / done: allow (role scope is enforced by
  //     subagent-gate + reviewer scope rules; keep the hard gate simple) --------
  return respond({ permission: 'allow' });
}, { onError: 'closed' });
