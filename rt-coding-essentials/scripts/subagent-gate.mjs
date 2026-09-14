// AWE subagent gate (subagentStart). failClosed: false — a misparse must never
// block legitimate work; it fails open and logs.
//
// Only fires when AWE is active. Enforces the pipeline's role discipline:
//   awe-architect            → phase intake|architect
//   awe-backend-dev          → phase code AND roles.backend.planStatus == approved
//   awe-frontend-dev         → phase code AND roles.frontend.planStatus == approved
//   awe-reviewer             → phase review|code
//   awe-security-reviewer    → phase review|code (optional agent; still gated if spawned)
//   awe-verifier             → phase verify
// Unknown awe-* (including removed awe-repo-dev) → deny.
// Non-AWE subagents → allow. Missing name field → allow + log (defensive).

import {
  runHook, respond, loadState, isActive, projectDir, extractSubagentName,
  listTickets, unmetDependencies,
} from './lib/state.mjs';
import { audit } from './lib/audit.mjs';

const ROLE_OF_AGENT = { 'awe-backend-dev': 'backend', 'awe-frontend-dev': 'frontend' };
const CORE_AGENTS = new Set([
  'awe-architect', 'awe-backend-dev', 'awe-frontend-dev',
  'awe-reviewer', 'awe-security-reviewer', 'awe-verifier',
]);

await runHook(async (input) => {
  const dir = projectDir();
  const state = loadState(dir);
  if (!isActive(state)) return respond({}); // AWE off → spawn whatever you like

  const name = extractSubagentName(input);
  if (!name) {
    audit(dir, 'subagentStart', 'allow', 'subagent name field absent from payload — allowed defensively', {});
    return respond({ permission: 'allow' });
  }
  if (!name.startsWith('awe-')) return respond({ permission: 'allow' }); // not ours to gate

  const tickets = listTickets(state);
  const entries = Object.entries(tickets);
  const deny = (why) => {
    const focus = state.ticket;
    const phase = tickets[focus]?.phase || state.phase;
    audit(dir, 'subagentStart', 'deny', why, { subagent: name, phase, ticket: focus });
    return respond({
      permission: 'deny',
      agent_message:
        `AWE pipeline gate: cannot spawn ${name} now — ${why}. ` +
        `Phases transition only via the /awe-* skills. If the phase is wrong, tell the human.`,
    });
  };

  if (!CORE_AGENTS.has(name)) {
    return deny(`${name} is not a core AWE agent — this plugin only ships backend-dev and frontend-dev`);
  }

  const some = (pred) => entries.some(([id, t]) => pred(id, t));

  if (name === 'awe-architect') {
    if (!some((_, t) => ['intake', 'architect'].includes(t.phase))) {
      return deny(`architect runs in intake|architect; no in-flight ticket is in those phases`);
    }
  } else if (ROLE_OF_AGENT[name]) {
    const role = ROLE_OF_AGENT[name];
    const ready = entries.filter(([id, t]) => {
      if (t.phase !== 'code') return false;
      if (t.roles?.[role]?.planStatus !== 'approved') return false;
      return unmetDependencies(state, id).length === 0;
    });
    if (ready.length === 0) {
      const blocked = entries.filter(([id, t]) => (
        t.phase === 'code' && t.roles?.[role]?.planStatus === 'approved'
          && unmetDependencies(state, id).length > 0
      ));
      if (blocked.length) {
        const bits = blocked.map(([id]) => `${id} waits on ${unmetDependencies(state, id).join(', ')}`);
        return deny(`${name} cannot implement yet — ${bits.join('; ')}`);
      }
      return deny(`${name} runs in phase=code with ${role} plan approved; no ticket is in that state`);
    }
  } else if (name === 'awe-reviewer' || name === 'awe-security-reviewer') {
    if (!some((_, t) => ['review', 'code'].includes(t.phase))) {
      return deny(`reviewers run in phase=review|code; no in-flight ticket is in those phases`);
    }
  } else if (name === 'awe-verifier') {
    if (!some((_, t) => t.phase === 'verify')) {
      return deny(`verifier runs in phase=verify; no in-flight ticket is in verify`);
    }
  }

  audit(dir, 'subagentStart', 'allow', `${name} permitted`, { subagent: name, ticket: state.ticket });
  return respond({ permission: 'allow' });
});
