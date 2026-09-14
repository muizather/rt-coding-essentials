// AWE shared hook library — state, config, stdin/stdout plumbing.
// Zero dependencies. Node >= 24. Every hook in .cursor/hooks/ imports from here.
//
// CRITICAL HUMAN-FRIENDLINESS CONTRACT (do not break):
//   * If there is no state file, or state.active !== true, or AWE_DISABLED=1 is set,
//     every hook must exit 0 with `{}` — AWE never interferes with normal work.
//   * Hooks never crash the agent loop. Unexpected errors are handled per-hook
//     (hard security gates fail closed with an explanatory message; the rest fail open).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const STATE_DIR = path.join('.cursor', 'state');
export const STATE_FILE = 'awe-state.json';
export const EVIDENCE_FILE = 'awe-evidence.json';
export const VERIFY_EVIDENCE_FILE = 'awe-verify-evidence.json';
export const SIGNOFF_FILE = 'awe-signoff.json';
export const AUDIT_FILE = 'audit.log';
export const DISCOVERED_FILE = 'awe-discovered.json';

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

/** Phases that may only write plans/ + .cursor/state/ (per ticket, not repo-global). */
export const PLAN_ONLY_PHASES = new Set(['intake', 'architect', 'approve']);
/** Phases that write application source / review fixes. */
export const IMPLEMENT_PHASES = new Set(['code', 'review']);
/** Phases that occupy an `awe/<ticket>-*` branch (worktree only if another ticket is here). */
export const BRANCH_HELD_PHASES = new Set(['code', 'review', 'verify', 'ship']);

/**
 * All in-flight tickets. Prefers `state.tickets`; synthesizes from legacy
 * `{ ticket, phase, roles }` so older state files keep working.
 */
export function listTickets(state) {
  if (!state || typeof state !== 'object') return {};
  if (state.tickets && typeof state.tickets === 'object' && !Array.isArray(state.tickets)) {
    const out = {};
    for (const [id, t] of Object.entries(state.tickets)) {
      if (id && t && typeof t === 'object' && !Array.isArray(t)) out[id] = t;
    }
    if (Object.keys(out).length) return out;
  }
  if (typeof state.ticket === 'string' && state.ticket) {
    return {
      [state.ticket]: {
        phase: state.phase,
        roles: state.roles && typeof state.roles === 'object' ? state.roles : {},
        dependsOn: Array.isArray(state.dependsOn) ? state.dependsOn : [],
        regressionOf: state.regressionOf,
      },
    };
  }
  return {};
}

export function getTicketEntry(state, id) {
  if (!id) return null;
  return listTickets(state)[id] || null;
}

/** dependsOn ids that are still in state and not `done`. Missing ids are treated as already finished. */
export function unmetDependencies(state, ticketId) {
  const t = getTicketEntry(state, ticketId);
  const deps = Array.isArray(t?.dependsOn) ? t.dependsOn : [];
  const all = listTickets(state);
  return deps.filter((d) => {
    const other = all[d];
    if (!other) return false;
    return other.phase !== 'done';
  });
}

/** True when another ticket already holds an implementation branch — then (and only then) use a worktree. */
export function needsWorktree(state, ticketId) {
  return Object.entries(listTickets(state)).some(
    ([id, t]) => id !== ticketId && BRANCH_HELD_PHASES.has(t.phase),
  );
}

export function parseAweBranch(branch) {
  const m = String(branch || '').match(/^awe\/(.+)-(backend|frontend)$/);
  return m ? { ticket: m[1], role: m[2] } : null;
}

export function parseAweWorktreeRel(rel) {
  const m = String(rel || '').match(/^\.worktrees\/(.+)-(backend|frontend)(?:\/|$)/);
  return m ? { ticket: m[1], role: m[2] } : null;
}

export function parsePlanTicket(rel) {
  const m = String(rel || '').match(/(?:^|\/)plans\/([^/]+)\//);
  return m ? m[1] : null;
}

export function ticketsInPhases(state, phases) {
  const set = phases instanceof Set ? phases : new Set(phases);
  return Object.entries(listTickets(state)).filter(([, t]) => set.has(t.phase));
}

/**
 * Which ticket a write belongs to: worktree path, then plans/, then current
 * `awe/<ticket>-<role>` branch, then the unique ticket in code|review.
 */
export function resolveWriteTicket(state, rel, dir = projectDir()) {
  const wt = parseAweWorktreeRel(rel);
  if (wt) return { ticket: wt.ticket, role: wt.role, via: 'worktree' };
  const planId = parsePlanTicket(rel);
  if (planId) return { ticket: planId, via: 'plans' };
  const branch = gitOut(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
    || gitOut(dir, ['symbolic-ref', '--short', 'HEAD']);
  const parsed = parseAweBranch(branch);
  if (parsed) return { ticket: parsed.ticket, role: parsed.role, via: 'branch' };
  const coding = ticketsInPhases(state, IMPLEMENT_PHASES);
  if (coding.length === 1) return { ticket: coding[0][0], via: 'unique-coding' };
  return null;
}

function gitOut(dir, args) {
  try {
    return execFileSync('git', args, {
      cwd: dir, timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function existsRel(dir, rel) {
  return fs.existsSync(path.join(dir, rel));
}

function readJsonFile(abs) {
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist a JSON blob under `.cursor/state/`. */
export function saveStateJson(name, obj, dir = projectDir()) {
  const p = path.join(stateDir(dir), name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, p);
  return obj;
}

/** Default branch: origin/HEAD, else main/master/develop, else current branch. */
export function discoverBaseBranch(dir = projectDir()) {
  const originHead = gitOut(dir, ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']);
  if (originHead) return originHead.replace(/^origin\//, '') || 'main';
  for (const b of ['main', 'master', 'develop']) {
    if (gitOut(dir, ['rev-parse', '--verify', `refs/heads/${b}`])) return b;
  }
  const current = gitOut(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return current && current !== 'HEAD' ? current : 'main';
}

/** Repo's own test command — never assume npm test without checking. */
export function discoverTestCommand(dir = projectDir()) {
  const pkg = readJsonFile(path.join(dir, 'package.json'));
  if (pkg?.scripts?.test) return 'npm test';
  if (pkg?.scripts?.check) return 'npm run check';
  if (existsRel(dir, 'pyproject.toml') || existsRel(dir, 'pytest.ini') || existsRel(dir, 'conftest.py')) {
    return 'pytest';
  }
  if (existsRel(dir, 'go.mod')) return 'go test ./...';
  if (existsRel(dir, 'Cargo.toml')) return 'cargo test';
  if (existsRel(dir, 'gradlew')) return './gradlew test';
  if (existsRel(dir, 'mvnw')) return './mvnw test';
  if (existsRel(dir, 'Makefile')) return 'make test';
  return 'npm test';
}

export function discoverLintCommand(dir = projectDir()) {
  const pkg = readJsonFile(path.join(dir, 'package.json'));
  if (pkg?.scripts?.lint) return 'npm run lint';
  return '';
}

const COMPOSE_FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'];

function startFromRoot(root) {
  const pkg = readJsonFile(path.join(root, 'package.json')) || {};
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const composeFile = COMPOSE_FILES.find((f) => existsRel(root, f)) || null;
  let start = null;
  if (scripts.dev) start = 'npm run dev';
  else if (scripts.start) start = 'npm run start';
  else if (composeFile) start = 'docker compose up';
  return { start, composeFile, scripts: Object.keys(scripts) };
}

/**
 * How this workspace boots locally. Used by VERIFY (Playwright against localhost).
 * Never invents URLs or env values.
 */
export function discoverLocalRun(dir = projectDir()) {
  const root = startFromRoot(dir);
  const repos = discoverGitRepos(dir);
  const services = repos.map((r) => {
    const child = startFromRoot(r.path);
    return {
      name: r.name,
      relative: r.relative,
      start: child.start,
      composeFile: child.composeFile,
    };
  });
  const notes = [];
  if (!root.start && !services.some((s) => s.start)) {
    notes.push('no start command discovered — ask the human once before VERIFY');
  }
  return {
    start: root.start,
    composeFile: root.composeFile,
    scripts: root.scripts,
    services,
    urls: {},
    notes,
  };
}

/**
 * Git repo family for this workspace.
 * One entry if `dir` is itself a git root; otherwise each depth-1 child that has `.git`.
 */
export function discoverGitRepos(dir = projectDir()) {
  if (existsRel(dir, '.git')) {
    return [{ name: path.basename(dir), path: dir, relative: '.' }];
  }
  const out = [];
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const child = path.join(dir, ent.name);
    if (fs.existsSync(path.join(child, '.git'))) {
      out.push({ name: ent.name, path: child, relative: ent.name });
    }
  }
  return out;
}

function detectFeBe(root) {
  const pkg = readJsonFile(path.join(root, 'package.json'));
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const feDep = ['react', 'vue', 'next', 'svelte', 'nuxt', '@angular/core'].some((d) => deps[d]);
  const frontendPath = ['src/components', 'src/app', 'app/page.tsx', 'app/page.jsx', 'frontend', 'apps/web', 'web', 'client']
    .some((p) => existsRel(root, p));
  const hasFe = feDep || frontendPath;
  const hasBe = ['go.mod', 'pyproject.toml', 'Cargo.toml', 'pom.xml', 'build.gradle', 'backend', 'server', 'api', 'src/api', 'apps/api']
    .some((p) => existsRel(root, p));
  return { hasFe, hasBe };
}

/** backend and/or frontend from tree + package.json; default backend-only. Never child-repo folder names. */
export function discoverRoles(dir = projectDir()) {
  const family = discoverGitRepos(dir);
  const roots = family.length > 0 ? family.map((r) => r.path) : [dir];
  let hasFe = false;
  let hasBe = false;
  for (const root of roots) {
    const hit = detectFeBe(root);
    hasFe = hasFe || hit.hasFe;
    hasBe = hasBe || hit.hasBe;
  }
  if (hasFe && hasBe) return ['backend', 'frontend'];
  if (hasFe) return ['frontend'];
  return ['backend'];
}

/** Unchecked GitHub-style boxes (`- [ ]`). Checked (`- [x]`) do not count. */
export function hasUncheckedMarkdownBoxes(text) {
  return String(text || '').split(/\r?\n/).some((l) => /^\s*-\s*\[\s*\]/.test(l));
}

/**
 * Coding cannot start until this role has an implementation plan AND a questions
 * file with no open `- [ ]` boxes (file may say "No open questions.").
 */
export function implementationArtifactsReady(dir, ticket, role) {
  if (!dir || !ticket || !role) return false;
  const plan = path.join(dir, 'plans', ticket, `${role}.implementation.plan.md`);
  const questions = path.join(dir, 'plans', ticket, `${role}.implementation-questions.md`);
  try {
    if (!fs.existsSync(plan) || !fs.existsSync(questions)) return false;
    return !hasUncheckedMarkdownBoxes(fs.readFileSync(questions, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Guess which coding role owns a source path. `null` = unmatched (caller treats
 * as backend when that role is in play).
 */
export function inferSourceWriteRole(rel) {
  const p = String(rel || '');
  if (!p || p.startsWith('plans/') || /(^|\/)plans\//.test(p) || p.startsWith('.cursor/')) return null;
  if (/\.(tsx|jsx|vue|css|scss|sass|less)$/i.test(p)) return 'frontend';
  if (/(^|\/)(frontend|client|web|apps\/web|src\/components|src\/app)\//.test(p)) return 'frontend';
  if (/(^|\/)app\/.*\.(ts|js|tsx|jsx)$/.test(p)) return 'frontend';
  if (/(^|\/)(backend|server|api|apps\/api)\//.test(p)) return 'backend';
  return null;
}

/** Whether a code-phase source write is allowed given implementation artifacts. */
export function sourceWriteAllowedInCodePhase(dir, state, rel, ticketId) {
  const ticket = ticketId || state?.ticket;
  const entry = getTicketEntry(state, ticket);
  const roles = entry?.roles || state?.roles || {};
  const matched = inferSourceWriteRole(rel);
  let role = matched;
  if (!role || roles[role]?.planStatus !== 'approved') {
    role = roles.backend?.planStatus === 'approved' ? 'backend' : 'frontend';
  }
  return implementationArtifactsReady(dir, ticket, role);
}

function defaultConfig(dir) {
  return {
    version: 1,
    projectName: path.basename(dir),
    baseBranch: 'main',
    roles: ['backend'],
    commands: { test: 'npm test', lint: '' },
    reviewIterations: 3,
    triggerMode: 'auto',
    ticketSystem: 'none',
    notifications: { enabled: false, slack: false, gmail: false },
    strictSecurity: false,
    securityReview: false,
    envUrls: {},
    deployCommands: {},
    playwright: { package: '@playwright/test', version: '1.61.0' },
  };
}

/**
 * Optional `awe.config.json` overrides discovered values.
 * Always returns an object (never null) so hooks can run without a repo config file.
 */
export function loadConfig(dir = projectDir()) {
  const base = defaultConfig(dir);
  const discovered = loadStateJson(DISCOVERED_FILE, dir) || {};
  const file = readJsonFile(path.join(dir, 'awe.config.json')) || {};
  const commands = {
    ...base.commands,
    ...(discovered.commands && typeof discovered.commands === 'object' ? discovered.commands : {}),
    ...(file.commands && typeof file.commands === 'object' ? file.commands : {}),
  };
  return { ...base, ...discovered, ...file, commands };
}

/** Write `.cursor/state/awe-discovered.json` once per repo so hooks do not re-probe git on every event. */
export function ensureDiscoveredConfig(dir = projectDir()) {
  const existing = loadStateJson(DISCOVERED_FILE, dir);
  if (existing && typeof existing.baseBranch === 'string' && existing.commands?.test) {
    let dirty = false;
    if (!Array.isArray(existing.gitRepos)) {
      existing.gitRepos = discoverGitRepos(dir);
      existing.roles = discoverRoles(dir);
      dirty = true;
    }
    if (!existing.local || typeof existing.local !== 'object') {
      existing.local = discoverLocalRun(dir);
      dirty = true;
    }
    return dirty ? saveStateJson(DISCOVERED_FILE, existing, dir) : existing;
  }
  const gitRepos = discoverGitRepos(dir);
  const cfg = {
    projectName: path.basename(dir),
    baseBranch: discoverBaseBranch(dir),
    roles: discoverRoles(dir),
    gitRepos,
    commands: { test: discoverTestCommand(dir), lint: discoverLintCommand(dir) },
    local: discoverLocalRun(dir),
    reviewIterations: 3,
    triggerMode: 'auto',
    discoveredAt: new Date().toISOString(),
  };
  return saveStateJson(DISCOVERED_FILE, cfg, dir);
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
