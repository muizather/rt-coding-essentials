// AWE session context (sessionStart). LOCAL-ONLY event — cloud agents do not
// receive sessionStart, so nothing here may be load-bearing (the hard gates
// live in preToolUse / beforeShellExecution, which DO run in cloud).
//
// When AWE is active, injects a compact situational brief so the agent starts
// every session knowing the ticket, phase, role plan statuses, and how many
// open questions are waiting on humans.

import fs from 'node:fs';
import path from 'node:path';
import { runHook, respond, loadState, isActive, projectDir, ensureDiscoveredConfig, loadConfig } from './lib/state.mjs';

function countOpenQuestions(dir, ticket) {
  try {
    const p = path.join(dir, 'plans', ticket, 'open-questions.md');
    const text = fs.readFileSync(p, 'utf8');
    return text.split('\n').filter((l) => l.trimStart().startsWith('- [ ]')).length;
  } catch {
    return 0;
  }
}

await runHook(async (_input) => {
  const dir = projectDir();
  ensureDiscoveredConfig(dir);
  const cfg = loadConfig(dir);
  const discovered =
    `Discovered baseBranch=${cfg.baseBranch}, test=\`${cfg.commands?.test || 'npm test'}\`, ` +
    `roles=${(cfg.roles || ['backend']).join(',')}.`;
  const memory =
    `REQUIRED: follow code-graph.md (git family, derive ignores, sequential full index). ` +
    `DDD ships with this plugin (docs/domain-model). Architect writes spec+gherkin; coders write implementation plans+unit tests.`;
  const optionalMcp =
    `Optional: if GitHub/GitLab/Slack MCP tools are available, post status at phase boundaries; if not, skip.`;

  const state = loadState(dir);
  if (!isActive(state)) {
    return respond({
      additional_context:
        `AWE ready — no active ticket; hooks will not block normal work. ${discovered} ` +
        `${memory} Start with /awe-run or by describing a ticket. ${optionalMcp}`,
    });
  }

  const roles = Object.entries(state.roles || {})
    .map(([role, r]) => `${role}=${r?.planStatus ?? '?'}(iter ${r?.iteration ?? 0})`)
    .join(', ') || 'none';
  const openQ = state.ticket ? countOpenQuestions(dir, state.ticket) : 0;

  return respond({
    additional_context:
      `AWE ACTIVE — ticket ${state.ticket}, phase ${state.phase}. ` +
      `Role plan statuses: ${roles}. ` +
      `Open questions: ${openQ} in plans/${state.ticket}/open-questions.md. ` +
      `${discovered} ${memory} ` +
      `/awe-run may chain phases; APPROVE and VERIFY still need an explicit human yes. ` +
      `Code emission is blocked until phase=code.`,
  });
});
