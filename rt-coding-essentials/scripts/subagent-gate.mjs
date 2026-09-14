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

  const phase = state.phase;
  const deny = (why) => {
    audit(dir, 'subagentStart', 'deny', why, { subagent: name, phase, ticket: state.ticket });
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

  if (name === 'awe-architect') {
    if (!['intake', 'architect'].includes(phase)) {
      return deny(`architect runs in intake|architect, current phase is ${phase}`);
    }
  } else if (ROLE_OF_AGENT[name]) {
    if (phase !== 'code') return deny(`${name} runs in phase=code, current phase is ${phase}`);
    const role = ROLE_OF_AGENT[name];
    const planStatus = state.roles?.[role]?.planStatus;
    if (planStatus !== 'approved') {
      return deny(`${role} plan status is "${planStatus ?? 'missing'}" — must be "approved" (run /awe-approve)`);
    }
  } else if (name === 'awe-reviewer' || name === 'awe-security-reviewer') {
    if (!['review', 'code'].includes(phase)) {
      return deny(`reviewers run in phase=review|code, current phase is ${phase}`);
    }
  } else if (name === 'awe-verifier') {
    if (phase !== 'verify') return deny(`verifier runs in phase=verify, current phase is ${phase}`);
  }

  audit(dir, 'subagentStart', 'allow', `${name} permitted in phase=${phase}`, { subagent: name, phase });
  return respond({ permission: 'allow' });
});
