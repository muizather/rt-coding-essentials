// AWE audit log — append-only JSON-lines at .cursor/state/audit.log.
// Every gate decision lands here so a human can answer "why was that blocked?"
// without digging through transcripts. Auditing must never crash a hook.

import fs from 'node:fs';
import path from 'node:path';
import { stateDir } from './state.mjs';

/**
 * Append one audit record.
 * @param {string} dir      project root
 * @param {string} event    hook event or logical action, e.g. "preToolUse", "ship:push"
 * @param {string} decision e.g. "allow" | "deny" | "ask" | "flagged" | "clean"
 * @param {string} reason   short human-readable explanation
 * @param {object} [extra]  any extra structured fields (path, command, ticket, phase...)
 */
export function audit(dir, event, decision, reason, extra = {}) {
  try {
    const d = stateDir(dir);
    fs.mkdirSync(d, { recursive: true });
    const line = JSON.stringify({
      at: new Date().toISOString(),
      event,
      decision,
      reason,
      ...extra,
    });
    fs.appendFileSync(path.join(d, 'audit.log'), line + '\n');
  } catch {
    // Auditing is best-effort. Never let logging break a hook.
  }
}
