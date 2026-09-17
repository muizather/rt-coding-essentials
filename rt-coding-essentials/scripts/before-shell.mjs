// AWE shell gate (beforeShellExecution). HARD gate (failClosed: true).
//
// Layer A — BASELINE SAFETY, always on (even when AWE is inactive):
//   deny force-push, npm publish, curl|sh / wget|sh, rm -rf / variants,
//   cloud metadata IPs, and casual reads of ~/.aws/* ~/.ssh/* .env*.
//
// Layer B — PIPELINE GATE, only when AWE is active:
//   phase != ship  → `git push` denied ("push happens in ship phase")
//   phase == ship  → push allowed only from branch awe/<ticket>-* AND with a
//                    verified signoff + fresh green-test evidence; otherwise ask.

import { execFileSync } from 'node:child_process';
import {
  runHook, respond, loadState, loadStateJson, isActive, projectDir,
  extractCommand, minutesSince, SIGNOFF_FILE, EVIDENCE_FILE,
  getTicketEntry, parseAweBranch,
} from './lib/state.mjs';
import { audit } from './lib/audit.mjs';

const BASELINE_DENIES = [
  { re: /\bgit\s+push\b[\s\S]*?(--force\b|--force-with-lease\b|\s-f(\s|$))/, why: 'force-push rewrites shared history. Ask the human to run it manually if truly needed.' },
  { re: /\bnpm\s+publish\b/, why: 'publishing packages is a human decision. Ask the human to run it.' },
  { re: /\bcurl\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/, why: 'piping a remote script into a shell is unreviewable code execution. Download, read, then run with human approval.' },
  { re: /\bwget\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/, why: 'piping a remote script into a shell is unreviewable code execution. Download, read, then run with human approval.' },
  { re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(--no-preserve-root\s+)?(\/|\/\*|~|\$HOME)(\s|$|\/)/, why: 'recursive force-delete of a root/home path. This is never an agent action.' },
  { re: /169\.254\.169\.254/, why: 'cloud metadata endpoint access can exfiltrate instance credentials. Blocked.' },
  { re: /\b(cat|less|head|tail|more|bat|view|xxd|base64)\b[^|;&]*((~|\$HOME)\/\.(aws|ssh)\/|\.env(\.|$|\s|["\']))/, why: 'reading credential files (.aws/.ssh/.env) is blocked. Ask the human for the specific value you need.' },
];

function deny(dir, why, command) {
  audit(dir, 'beforeShellExecution', 'deny', why, { command });
  return respond({
    permission: 'deny',
    agent_message: `AWE blocked this shell command: ${why}`,
    user_message: `AWE blocked a shell command: ${why}`,
  });
}

function currentBranch(dir) {
  // symbolic-ref works on unborn branches (fresh repos); rev-parse covers detached HEAD.
  for (const args of [['symbolic-ref', '--short', 'HEAD'], ['rev-parse', '--abbrev-ref', 'HEAD']]) {
    try {
      const b = execFileSync('git', args, {
        cwd: dir, timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (b && b !== 'HEAD') return b;
    } catch { /* try the next strategy */ }
  }
  return null;
}

await runHook(async (input) => {
  const dir = projectDir();
  const command = extractCommand(input);
  if (!command) return respond({});

  // --- Layer A: baseline safety, unconditional --------------------------------
  for (const { re, why } of BASELINE_DENIES) {
    if (re.test(command)) return deny(dir, why, command);
  }

  const state = loadState(dir);
  if (!isActive(state)) return respond({}); // normal work: baseline only

  // --- Layer B: pipeline gate ---------------------------------------------------
  if (/\bgit\s+push\b/.test(command)) {
    const branch = currentBranch(dir);
    const parsed = parseAweBranch(branch);
    const ticketId = parsed?.ticket || state.ticket;
    const entry = getTicketEntry(state, ticketId);
    const phase = entry?.phase || state.phase;
    if (phase !== 'ship') {
      return deny(dir, `ticket ${ticketId ?? '?'} is in phase ${phase} — push happens in the ship phase (run /awe-ship).`, command);
    }
    const expectedPrefix = ticketId ? `awe/${ticketId}-` : 'awe/';
    if (!branch || !branch.startsWith(expectedPrefix)) {
      return deny(
        dir,
        `ship phase pushes only from branch ${expectedPrefix}* (current: ${branch ?? 'unknown'}).`,
        command
      );
    }
    const signoff = loadStateJson(SIGNOFF_FILE, dir);
    const evidence = loadStateJson(EVIDENCE_FILE, dir);
    const signoffOk = signoff && signoff.verified === true;
    const evidenceOk = evidence && evidence.testsPassed === true && minutesSince(evidence.at) <= 120;
    if (signoffOk && evidenceOk) {
      audit(dir, 'beforeShellExecution', 'allow', 'ship push: signoff verified + fresh evidence', { command, branch, ticket: ticketId });
      return respond({ permission: 'allow' });
    }
    const missing = [
      !signoffOk ? 'human signoff (.cursor/state/awe-signoff.json with verified: true)' : null,
      !evidenceOk ? 'fresh green-test evidence (<2h old in .cursor/state/awe-evidence.json)' : null,
    ].filter(Boolean).join(' and ');
    audit(dir, 'beforeShellExecution', 'ask', `ship push missing ${missing}`, { command, branch, ticket: ticketId });
    return respond({
      permission: 'ask',
      user_message: `AWE ship gate: this push is missing ${missing}. Approve only if you have personally signed the smoke report.`,
      agent_message: `Ship gate not satisfied: missing ${missing}. Do not retry the push until the human signs the smoke report (/awe-smoke).`,
    });
  }

  return respond({ permission: 'allow' });
}, { onError: 'closed' });
