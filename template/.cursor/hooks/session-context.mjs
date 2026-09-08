// AWE session context (sessionStart). LOCAL-ONLY event — cloud agents do not
// receive sessionStart, so nothing here may be load-bearing (the hard gates
// live in preToolUse / beforeShellExecution, which DO run in cloud).
//
// When AWE is active, injects a compact situational brief so the agent starts
// every session knowing the ticket, phase, role plan statuses, and how many
// open questions are waiting on humans.

import fs from 'node:fs';
import path from 'node:path';
import { runHook, respond, loadState, isActive, projectDir } from './lib/state.mjs';

function countOpenQuestions(dir, ticket) {
  try {
    const p = path.join(dir, 'plans', ticket, 'open-questions.md');
    const text = fs.readFileSync(p, 'utf8');
    return text.split('\n').filter((l) => l.trimStart().startsWith('- [ ]')).length;
  } catch {
    return 0;
  }
}

await runHook(async (input) => {
  const dir = projectDir();
  const state = loadState(dir);
  if (!isActive(state)) return respond({});

  const roles = Object.entries(state.roles || {})
    .map(([role, r]) => `${role}=${r?.planStatus ?? '?'}(iter ${r?.iteration ?? 0})`)
    .join(', ') || 'none';
  const openQ = state.ticket ? countOpenQuestions(dir, state.ticket) : 0;

  return respond({
    additional_context:
      `AWE ACTIVE — ticket ${state.ticket}, phase ${state.phase}. ` +
      `Role plan statuses: ${roles}. ` +
      `Open questions: ${openQ} in plans/${state.ticket}/open-questions.md. ` +
      `Read .cursor/rules/10-awe-phases.mdc before acting. ` +
      `Phases transition only via the /awe-* skills; code emission is blocked until phase=code.`,
  });
});
