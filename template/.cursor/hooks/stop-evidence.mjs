// AWE stop gate (stop, loop_limit: 8). failClosed: false.
//
// `stop` cannot veto completion, but it can return followup_message, which is
// auto-submitted and forces the agent to continue. We use it for two
// anti-rationalization checks, only when AWE is active and phase is code|review:
//
//   1. EVIDENCE: .cursor/state/awe-evidence.json must exist with
//      { testsPassed: true, command, at } where `at` is < 2 hours old.
//      "Seems right" is not sufficient — evidence or it didn't happen.
//   2. REVIEW BUDGET: when every role's iteration has reached
//      config.reviewIterations, further loops are pointless — the followup
//      directs the agent to stop and escalate to the human.
//
// loop_limit (8 in hooks.json) caps how many times this can fire per session,
// so a stuck agent cannot loop forever.

import {
  runHook, respond, loadState, loadStateJson, loadConfig, isActive,
  projectDir, minutesSince, EVIDENCE_FILE,
} from './lib/state.mjs';
import { audit } from './lib/audit.mjs';

const EVIDENCE_MAX_AGE_MIN = 120;

await runHook(async (input) => {
  const dir = projectDir();
  const state = loadState(dir);
  if (!isActive(state)) return respond({});
  if (!['code', 'review'].includes(state.phase)) return respond({});

  const config = loadConfig(dir) || {};
  const testCommand = config.commands?.test || 'npm test';
  const budget = Number.isInteger(config.reviewIterations) ? config.reviewIterations : 3;

  // --- Review iteration budget ------------------------------------------------
  if (state.phase === 'review') {
    const roles = Object.values(state.roles || {});
    const exhausted = roles.length > 0 && roles.every((r) => (r?.iteration ?? 0) >= budget);
    if (exhausted) {
      audit(dir, 'stop', 'escalate', `review budget (${budget}) exhausted for all roles`, {
        ticket: state.ticket,
      });
      return respond({
        followup_message:
          `REVIEW BUDGET EXHAUSTED: all roles have used ${budget} review iteration(s) without a ` +
          `"verified" verdict. Three rounds unresolved = human escalation, not silent shipping. ` +
          `Do NOT spawn more review or code rounds. Write plans/${state.ticket}/ESCALATION.md ` +
          `(unresolved findings, what was tried, recommended human decision) and stop for the human.`,
      });
    }
  }

  // --- Fresh green-test evidence ----------------------------------------------
  const evidence = loadStateJson(EVIDENCE_FILE, dir);
  const fresh = evidence && evidence.testsPassed === true && minutesSince(evidence.at) <= EVIDENCE_MAX_AGE_MIN;
  if (!fresh) {
    const why = !evidence
      ? 'no evidence file'
      : evidence.testsPassed !== true
        ? 'testsPassed is not true'
        : 'evidence is stale (>2h)';
    audit(dir, 'stop', 'continue', `missing fresh test evidence (${why})`, { ticket: state.ticket, phase: state.phase });
    return respond({
      followup_message:
        `ANTI-RATIONALIZATION GATE: No fresh green-test evidence found (${why}). ` +
        `Run the configured test command (\`${testCommand}\`) and write ` +
        `.cursor/state/awe-evidence.json as {"testsPassed": true, "command": "${testCommand}", "at": "<ISO timestamp>"}. ` +
        `"Seems right" is not sufficient — evidence or it didn't happen.`,
    });
  }

  return respond({});
});
