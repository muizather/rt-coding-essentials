// AWE stop gate (stop, loop_limit: 8). failClosed: false.
//
// `stop` cannot veto completion, but it can return followup_message, which is
// auto-submitted and forces the agent to continue. When AWE is active:
//
//   1. EVIDENCE (code|review): awe-evidence.json testsPassed + at < 2h.
//   2. REVIEW BUDGET: all roles' iteration >= reviewIterations → escalate.
//   3. SMOKE: Playwright awe-smoke-evidence.json, or smokeIteration budget.
//
// loop_limit (8 in hooks.json) caps how many times this can fire per session,
// so a stuck agent cannot loop forever.

import {
  runHook, respond, loadState, loadStateJson, loadConfig, isActive,
  projectDir, minutesSince, EVIDENCE_FILE, loadSmokeEvidence, listTickets, IMPLEMENT_PHASES,
  isSmokePhase, smokeIterationOf,
} from './lib/state.mjs';
import { audit } from './lib/audit.mjs';

const EVIDENCE_MAX_AGE_MIN = 120;

await runHook(async (input) => {
  const dir = projectDir();
  const state = loadState(dir);
  if (!isActive(state)) return respond({});
  const tickets = listTickets(state);
  const impl = Object.entries(tickets).filter(([, t]) => IMPLEMENT_PHASES.has(t.phase));
  const smoking = Object.entries(tickets).filter(([, t]) => isSmokePhase(t.phase));

  const config = loadConfig(dir) || {};
  const testCommand = config.commands?.test || 'npm test';
  const budget = Number.isInteger(config.reviewIterations) ? config.reviewIterations : 3;

  if (!impl.length && !smoking.length) return respond({});

  // --- Review iteration budget (per ticket) -----------------------------------
  for (const [id, t] of impl) {
    if (t.phase !== 'review') continue;
    const roles = Object.values(t.roles || {});
    const exhausted = roles.length > 0 && roles.every((r) => (r?.iteration ?? 0) >= budget);
    if (exhausted) {
      audit(dir, 'stop', 'escalate', `review budget (${budget}) exhausted for all roles`, {
        ticket: id,
      });
      return respond({
        followup_message:
          `REVIEW BUDGET EXHAUSTED: all roles on ${id} have used ${budget} review iteration(s) without a ` +
          `"verified" verdict. Three rounds unresolved = human escalation, not silent shipping. ` +
          `Do NOT spawn more review or code rounds. Write plans/${id}/ESCALATION.md ` +
          `(unresolved findings, what was tried, recommended human decision) and stop for the human.`,
      });
    }
  }

  // --- Smoke iteration budget + Playwright evidence ---------------------------
  for (const [id, t] of smoking) {
    if (smokeIterationOf(t) >= budget) {
      audit(dir, 'stop', 'escalate', `smoke budget (${budget}) exhausted`, { ticket: id });
      return respond({
        followup_message:
          `SMOKE BUDGET EXHAUSTED: ${id} has used ${budget} Playwright smoke iteration(s) without a green run. ` +
          `Three rounds unresolved = human escalation, not silent shipping. ` +
          `Do NOT spawn more smoke or code rounds. Write plans/${id}/ESCALATION.md ` +
          `(failed scenarios, what was tried, recommended human decision) and stop for the human.`,
      });
    }
  }
  if (smoking.length) {
    const ve = loadSmokeEvidence(dir);
    const vFresh = ve && ve.playwrightPassed === true && minutesSince(ve.at) <= EVIDENCE_MAX_AGE_MIN;
    if (!vFresh) {
      const why = !ve
        ? 'no smoke evidence file'
        : ve.playwrightPassed !== true
          ? 'playwrightPassed is not true'
          : 'smoke evidence is stale (>2h)';
      audit(dir, 'stop', 'continue', `missing fresh Playwright evidence (${why})`, {
        ticket: smoking[0][0],
      });
      return respond({
        followup_message:
          `ANTI-RATIONALIZATION GATE: No fresh Playwright smoke evidence found (${why}). ` +
          `Run the Gherkin specs with Playwright on localhost and write ` +
          `.cursor/state/awe-smoke-evidence.json as {"playwrightPassed": true, "command": "npx playwright test -c plans/<ticket>/e2e", "video": "<path or null>", "trace": "<path or null>", "at": "<ISO timestamp>"}. ` +
          `Human steps without a green local run are not smoke.`,
      });
    }
  }

  if (!impl.length) return respond({});

  // --- Fresh green-test evidence ----------------------------------------------
  const evidence = loadStateJson(EVIDENCE_FILE, dir);
  const fresh = evidence && evidence.testsPassed === true && minutesSince(evidence.at) <= EVIDENCE_MAX_AGE_MIN;
  if (!fresh) {
    const why = !evidence
      ? 'no evidence file'
      : evidence.testsPassed !== true
        ? 'testsPassed is not true'
        : 'evidence is stale (>2h)';
    audit(dir, 'stop', 'continue', `missing fresh test evidence (${why})`, { ticket: state.ticket, phase: impl[0][1].phase });
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
