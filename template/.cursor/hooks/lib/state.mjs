// AWE shared hook library — state, config, stdin/stdout plumbing.
// Zero dependencies. Node >= 24. Every hook in .cursor/hooks/ imports from here.
//
// CRITICAL HUMAN-FRIENDLINESS CONTRACT (do not break):
//   * If there is no state file, or state.active !== true, or AWE_DISABLED=1 is set,
//     every hook must exit 0 with `{}` — AWE never interferes with normal work.
//   * Hooks never crash the agent loop. Unexpected errors are handled per-hook
//     (hard security gates fail closed with an explanatory message; the rest fail open).

import fs from 'node:fs';
import path from 'node:path';

export const STATE_DIR = path.join('.cursor', 'state');
export const STATE_FILE = 'awe-state.json';
export const EVIDENCE_FILE = 'awe-evidence.json';
export const SIGNOFF_FILE = 'awe-signoff.json';
export const AUDIT_FILE = 'audit.log';

export const PHASES = ['intake', 'architect', 'approve', 'code', 'review', 'verify', 'ship', 'done'];

/** Absolute path of the project the agent is working in. */
export function projectDir() {
  return process.env.CURSOR_PROJECT_DIR || process.cwd();
}

export function stateDir(dir = projectDir()) {
  return path.join(dir, STATE_DIR);
}

export function statePath(dir = projectDir()) {
  return path.join(stateDir(dir), STATE_FILE);
}

/** Load `.cursor/state/awe-state.json`. Returns null when absent/corrupt — callers treat null as inactive. */
export function loadState(dir = projectDir()) {
  try {
    const raw = fs.readFileSync(statePath(dir), 'utf8');
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return null;
    return s;
  } catch {
    return null;
  }
}

/** Persist state, stamping updatedAt. Creates .cursor/state/ on first use. */
export function saveState(state, dir = projectDir()) {
  const p = statePath(dir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  state.updatedAt = new Date().toISOString();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, p); // atomic-ish: never leave a half-written state file
  return state;
}

/** Load a JSON file from .cursor/state/, or null. */
export function loadStateJson(name, dir = projectDir()) {
  try {
    const raw = fs.readFileSync(path.join(stateDir(dir), name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Master kill switch: AWE_DISABLED=1 (or true/yes) disables every AWE hook. */
export function isDisabled() {
  const v = process.env.AWE_DISABLED;
  if (!v) return false;
  return !['0', 'false', 'no', ''].includes(v.toLowerCase());
}

/** AWE only gates work when a ticket is actively flowing through the pipeline. */
export function isActive(state) {
  return !!state && state.active === true && !isDisabled();
}

/** Load awe.config.json (user-owned, written by awe-setup). Returns null when absent. */
export function loadConfig(dir = projectDir()) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'awe.config.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Read the hook payload Cursor sends on stdin. Tolerates empty/invalid input. */
export async function readStdinJson() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  try {
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  } catch {
    return {};
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Emit the hook decision on stdout and exit 0. */
export function respond(obj) {
  process.stdout.write(JSON.stringify(obj ?? {}) + '\n');
  process.exit(0);
}

/**
 * Wrap a hook's main function.
 *  - Honors AWE_DISABLED before anything else.
 *  - Parses stdin once and hands it over.
 *  - `onError: 'closed'` (hard security gates) denies with a human-readable message
 *    when the hook itself blows up; `onError: 'open'` (default) allows and moves on.
 */
export async function runHook(fn, { onError = 'open' } = {}) {
  try {
    if (isDisabled()) return respond({});
    const input = await readStdinJson();
    await fn(input);
    return respond({});
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (onError === 'closed') {
      return respond({
        permission: 'deny',
        agent_message:
          `AWE security gate hit an internal error and failed closed (failClosed). ` +
          `Detail: ${msg}. A human can bypass all AWE hooks by setting AWE_DISABLED=1 in the environment.`,
        user_message: `AWE hook error (failClosed): ${msg}. Set AWE_DISABLED=1 to bypass AWE hooks entirely.`,
      });
    }
    return respond({});
  }
}

/** Pull a filesystem path out of a tool payload, tolerating Cursor field-name variants. */
export function extractFilePath(input) {
  const ti = input.tool_input || input.toolInput || input.input || {};
  const raw =
    ti.file_path ?? ti.filePath ?? ti.path ?? ti.target_file ?? ti.targetFile ??
    input.file_path ?? input.filePath ?? input.path ?? '';
  return typeof raw === 'string' ? raw : '';
}

/** Pull a shell command out of a tool payload, tolerating variants. */
export function extractCommand(input) {
  const ti = input.tool_input || input.toolInput || input.input || {};
  const raw = ti.command ?? input.command ?? ti.cmd ?? input.cmd ?? '';
  return typeof raw === 'string' ? raw : '';
}

/**
 * Pull the content-bearing fields out of a write/edit tool payload.
 * Tolerates Cursor field-name variants. Shapes by tool:
 *   Write:               { file_path, content }
 *   Edit / StrReplace:   { file_path, old_string, new_string }
 *   MultiEdit:           { file_path, edits: [{ old_string, new_string }, …] }
 * @returns {{ content?: string, oldStr?: string, newStr?: string, edits?: Array }}
 */
export function extractToolContent(input) {
  const ti = input.tool_input || input.toolInput || input.input || {};
  const out = {};
  const str = (v) => (typeof v === 'string' ? v : undefined);
  out.content = str(ti.content ?? ti.new_content ?? ti.newContent);
  out.newStr = str(ti.new_string ?? ti.newString ?? ti.replacement);
  out.oldStr = str(ti.old_string ?? ti.oldString ?? ti.find ?? ti.search);
  if (Array.isArray(ti.edits)) {
    out.edits = ti.edits
      .map((e) => ({
        oldStr: str(e?.old_string ?? e?.oldString ?? e?.find ?? e?.search) ?? '',
        newStr: str(e?.new_string ?? e?.newString ?? e?.replacement) ?? '',
      }))
      .filter((e) => e.oldStr !== '' || e.newStr !== '');
  }
  return out;
}

/** Pull a subagent name out of a subagentStart payload, tolerating variants. */
export function extractSubagentName(input) {
  const raw =
    input.subagent_name ?? input.subagentName ?? input.agent_name ?? input.agentName ??
    input.name ?? (input.subagent && input.subagent.name) ?? (input.agent && input.agent.name) ?? '';
  return typeof raw === 'string' ? raw : '';
}

/** Normalize any path to a posix-style path relative to the project root. */
export function relPath(p, dir = projectDir()) {
  if (!p) return '';
  let r = p;
  if (path.isAbsolute(p)) {
    r = path.relative(dir, p);
  }
  r = r.split(path.sep).join('/').replace(/^\.\//, '');
  return r;
}

/** Minutes since an ISO timestamp; Infinity when unparseable. */
export function minutesSince(iso) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 60000;
}
