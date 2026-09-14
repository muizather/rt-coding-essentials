// AWE session context (sessionStart). LOCAL-ONLY event — cloud agents do not
// receive sessionStart, so nothing here may be load-bearing (the hard gates
// live in preToolUse / beforeShellExecution, which DO run in cloud).
//
// When AWE is active, injects a compact situational brief so the agent starts
// every session knowing the ticket, phase, role plan statuses, and how many
// open questions are waiting on humans.

import fs from 'node:fs';
import path from 'node:path';
import { runHook, respond, loadState, isActive, projectDir, ensureDiscoveredConfig, loadConfig, listTickets, unmetDependencies } from './lib/state.mjs';

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
    `REQUIRED: follow code-graph.md. Architect writes high-level spec+gherkin (no files). Coders write implementation plans + unit tests and must search current advisories before adding packages.`;
  const optionalMcp =
    `Optional: if GitHub/GitLab/Slack MCP tools are available, post status at phase boundaries; if not, skip.`;

  const state = loadState(dir);
  if (!isActive(state)) {
    return respond({
      additional_context:
        `AWE ready — no active ticket; hooks will not block normal work. ${discovered} ` +
        `${memory} Start with /awe-run or by describing a ticket. Multiple plans may run at once; ` +
        `a new intake never waits on an unrelated in-flight plan. ${optionalMcp}`,
    });
  }

  const tickets = listTickets(state);
  const lines = Object.entries(tickets).map(([id, t]) => {
    const roles = Object.entries(t.roles || {})
      .map(([role, r]) => `${role}=${r?.planStatus ?? '?'}(iter ${r?.iteration ?? 0})`)
      .join(', ') || 'none';
    const openQ = countOpenQuestions(dir, id);
    const deps = Array.isArray(t.dependsOn) && t.dependsOn.length ? t.dependsOn.join(', ') : 'none';
    const unmet = unmetDependencies(state, id);
    const wait = unmet.length ? ` CODE BLOCKED on ${unmet.join(', ')}` : '';
    return `${id}: phase=${t.phase}, roles=${roles}, dependsOn=${deps}, openQ=${openQ}${wait}`;
  });
  const focus = state.ticket && tickets[state.ticket] ? state.ticket : (Object.keys(tickets)[0] || '');

  return respond({
    additional_context:
      `AWE ACTIVE — ${Object.keys(tickets).length} in-flight plan(s). Focus ${focus || '(none)'}. ` +
      `${lines.join(' | ')}. ` +
      `${discovered} ${memory} ` +
      `New /awe-run intake is never blocked by another ticket. Record dependsOn when work shares a surface; ` +
      `implementation is blocked until those tickets are phase=done. ` +
      `Worktrees only when two+ plans occupy code|review|verify|ship at once. ` +
      `/awe-run may chain phases; APPROVE and VERIFY still need an explicit human yes.`,
  });
});
