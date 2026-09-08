// AWE constraints guard (preToolUse, matcher "Write|Edit|StrReplace|MultiEdit").
// failClosed: false — a bug here must never wedge legitimate edits; it fails open + logs.
//
// Adapted from agent-skills 'constraint-driven-development' ("guard the bar") —
// MIT, Copyright (c) 2025 Addy Osmani; see NOTICE.
//
// CONSTRAINTS.md is the project's written quality bar and is HUMAN-OWNED. The
// entire point of the file is that an agent must not lower the bar to turn a red
// check green (lower a coverage floor, bump a latency budget, delete a "no
// secrets" rule). This hook watches writes to CONSTRAINTS.md and denies any that
// REMOVE or WEAKEN a threshold-bearing line. Pure additions (strengthening the
// bar, adding a new dimension or exception) are allowed.
//
// THE HEURISTIC IS DELIBERATELY SIMPLE — documented so nobody mistakes it for proof:
//   * Compute the lines this write would REMOVE (before minus after).
//   * If a removed line carries a threshold signal (a comparison + number, a
//     number + unit, or a severity/count cap), deny.
//   * We do NOT parse magnitude direction (is 80%→70% weaker?). That needs human
//     judgement — which is the point: the human relaxes the bar, not the agent.
// Over-strict by design: it may deny a legitimate rewording of a threshold line.
// The escape hatch is always "ask the human to edit CONSTRAINTS.md by hand."
// Agents can also bypass every AWE hook with AWE_DISABLED=1 (human decision).

import fs from 'node:fs';
import path from 'node:path';
import {
  runHook, respond, projectDir, extractFilePath, extractToolContent, relPath,
} from './lib/state.mjs';
import { audit } from './lib/audit.mjs';

const TARGET = 'CONSTRAINTS.md';

// Lines that carry a numeric bar or a hard cap. Short and loud on purpose — see
// the "deliberately simple" note in the header.
const THRESHOLD_SIGNALS = [
  /[<>=≤≥~]\s*\d/,                                                          // ≤ 2500ms · >= 80% · ~5% · > 2x
  /\d+(\.\d+)?\s*(%|percent|ms\b|s\b|min\b|kB|KB|MB|GB|KiB|MiB|x\b)/i,      // 80% · 2500 ms · 0.1 · 2x
  /\b(coverage|threshold|budget|mutation score|error rate|latency|LCP|CLS|INP)\b/i,
  /\b(zero|no new|no high|no critical|none|never)\b/i,                      // severity / count caps
];
const carriesThreshold = (line) => THRESHOLD_SIGNALS.some((re) => re.test(line));

/** Lines present in `before` but absent from `after` (trimmed, blanks dropped). */
function removedLines(before, after) {
  const afterSet = new Set(String(after).split('\n').map((l) => l.trim()));
  return String(before)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !afterSet.has(l));
}

await runHook(async (input) => {
  const dir = projectDir();
  const rel = relPath(extractFilePath(input), dir);
  if (rel !== TARGET) return respond({}); // only CONSTRAINTS.md is guarded

  const abs = path.join(dir, rel);
  const { content, oldStr, newStr, edits } = extractToolContent(input);

  // Collect every removed line across whatever shape this edit takes.
  let removed = [];
  if (typeof content === 'string') {
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    removed = removedLines(before, content);
  } else {
    const pairs = edits && edits.length ? edits : oldStr !== undefined ? [{ oldStr, newStr }] : [];
    for (const p of pairs) removed.push(...removedLines(p.oldStr || '', p.newStr || ''));
    // No content fields at all but the file exists on disk → this is a delete or
    // a full truncate: every line (every threshold) is being removed.
    if (removed.length === 0 && oldStr === undefined && !(edits && edits.length) && fs.existsSync(abs)) {
      removed = removedLines(fs.readFileSync(abs, 'utf8'), '');
    }
  }

  const hit = removed.find(carriesThreshold);
  if (hit) {
    audit(dir, 'preToolUse', 'deny', `constraints-guard: weakening "${hit.slice(0, 60)}"`, { path: rel });
    return respond({
      permission: 'deny',
      agent_message:
        `AWE constraints guard: this edit to CONSTRAINTS.md removes or weakens a threshold ` +
        `("${hit.trim().slice(0, 60)}"). The quality bar is human-owned — an agent must not lower it ` +
        `to make a failing check pass. If a constraint genuinely needs relaxing, STOP and ask the human ` +
        `to edit CONSTRAINTS.md themselves (recording reason + owner + expiry in the Exceptions table). ` +
        `Adding or strengthening constraints is always allowed.`,
      user_message: 'AWE blocked an agent from weakening CONSTRAINTS.md.',
    });
  }
  return respond({}); // addition / strengthening / no threshold touched → no opinion
});
