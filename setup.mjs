#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  AWE — Agentic Workflow Essentials · setup
//
//  Run this from YOUR project (not from the AWE repo):
//
//      cd your-project
//      node /path/to/agentic-coding/setup.mjs
//
//  It scaffolds the AWE phase-gated workflow (Cursor hooks, rules, agents,
//  skills, config) into your project. Zero npm dependencies, never installs
//  packages into your project, never touches your package-lock.json.
//
//  Flags:
//    --yes            Non-interactive: accept all defaults (combine with flags below)
//    --target <dir>   Scaffold into <dir> instead of the current directory
//    --dry-run        Print exactly what would be written, write nothing
//    --force          Overwrite managed files even if you edited them locally
//    --uninstall      Remove AWE-managed files from the target (keeps your config)
//    --ci <provider>  Also install CI gate workflow: github | gitlab | both
//    --set k=v        Non-interactive answer, e.g. --set baseBranch=main
//    --help           Show this help
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AWE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(AWE_ROOT, 'template');
const PLUGIN_DIR = path.join(AWE_ROOT, 'rt-coding-essentials');
const AWE_VERSION = '0.1.0';

// Verified 2026-09-08 against nodejs.org: Node 24.x "Krypton" is Active LTS
// (24.20.0 latest; Node 26 is Current, enters LTS Oct 2026; Node 22 maintenance).
const NODE_LTS_MAJOR = 24;
const NODE_LTS_LABEL = "Node.js 24.x 'Krypton' (Active LTS)";

// ── ANSI colors (hand-rolled, NO_COLOR respected) ───────────────────────────
const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const CODES = { reset: 0, bold: 1, dim: 2, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, gray: 90 };
const paint = (c, s) => (useColor ? `\x1b[${CODES[c]}m${s}\x1b[${CODES.reset}m` : String(s));
const bold = (s) => paint('bold', s);
const dim = (s) => paint('dim', s);
const ok = (s) => paint('green', s);
const warn = (s) => paint('yellow', s);
const bad = (s) => paint('red', s);
const info = (s) => paint('cyan', s);

const SYM = { pass: ok('✓'), fail: bad('✗'), warn: warn('⚠'), arrow: info('→'), dot: dim('•') };

function section(title) {
  const line = `── ${title} `;
  console.log('\n' + paint('bold', paint('cyan', line)) + dim('─'.repeat(Math.max(2, 62 - line.length))));
}
function kv(key, value) {
  console.log(`  ${SYM.dot} ${dim(key + ':')} ${value}`);
}

// ── Args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(n);
const flagValue = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};
const setPairs = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--set' && argv[i + 1]) {
    const eq = argv[i + 1].indexOf('=');
    if (eq > 0) setPairs[argv[i + 1].slice(0, eq)] = argv[i + 1].slice(eq + 1);
    i++;
  }
}
const FLAGS = {
  yes: hasFlag('--yes'),
  dryRun: hasFlag('--dry-run'),
  force: hasFlag('--force'),
  uninstall: hasFlag('--uninstall'),
  help: hasFlag('--help') || hasFlag('-h'),
  target: flagValue('--target'),
  ci: flagValue('--ci') || setPairs.ci || null,
};

const HELP = `
${bold('awe-setup')} — scaffold the AWE phase-gated workflow into your project

${bold('Usage')}
  cd your-project
  node ${path.relative(process.cwd(), path.join(AWE_ROOT, 'setup.mjs')) || './setup.mjs'} [flags]

${bold('Flags')}
  --yes            Accept all defaults (non-interactive)
  --target <dir>   Scaffold into <dir> instead of cwd
  --dry-run        Show what would be written; write nothing
  --force          Overwrite managed files you edited locally
  --uninstall      Remove AWE-managed files (keeps awe.config.json & your rules)
  --ci <p>         Install CI gates: github | gitlab | both
  --set k=v        Answer a prompt non-interactively (projectName, baseBranch,
                   roles, testCommand, lintCommand, reviewIterations,
                   ticketSystem, strictSecurity)
  --help           This help

${bold('Requires')} ${NODE_LTS_LABEL}, git, Cursor ≥ 2.5 (recommend 3.x — latest stable 3.15).
AWE never installs npm packages into your project and never touches package-lock.json.
`;

if (FLAGS.help) {
  console.log(HELP);
  process.exit(0);
}

// ── Target resolution ───────────────────────────────────────────────────────
const TARGET = path.resolve(FLAGS.target || process.cwd());

function banner() {
  console.log('');
  console.log(info(bold('   ___  _      _____')));
  console.log(info(bold('  / _ \\| | /| / / __/')));
  console.log(info(bold(' / __ |/ |/ |/ / _/  ')) + dim('  Agentic Workflow Essentials'));
  console.log(info(bold('/_/ |_|__/|__/___/  ')) + dim(`  setup v${AWE_VERSION}`));
  console.log('');
}

function fail(msg, hint) {
  console.error(`\n${SYM.fail} ${bad(msg)}`);
  if (hint) console.error(`  ${dim(hint)}`);
  process.exit(1);
}

if (TARGET === AWE_ROOT) {
  banner();
  fail(
    'You are inside the AWE boilerplate repo itself.',
    'cd into YOUR project first, or pass --target <dir>:\n' +
      `     node ${path.join(AWE_ROOT, 'setup.mjs')} --target /path/to/your-project`
  );
}

// ── Prereq checks ───────────────────────────────────────────────────────────
function which(bin, args = ['--version']) {
  try {
    const r = spawnSync(bin, args, { stdio: 'ignore', timeout: 8000 });
    return r.status === 0;
  } catch {
    return false;
  }
}
function isGitRepo(dir) {
  try {
    const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000,
    });
    return r.status === 0 && String(r.stdout).trim() === 'true';
  } catch {
    return false;
  }
}

const prereqs = { ok: true };

function checkRow(status, label, hint) {
  const icon = status === 'pass' ? SYM.pass : status === 'fail' ? SYM.fail : SYM.warn;
  console.log(`  ${icon} ${label}${hint ? dim(' — ' + hint) : ''}`);
  if (status === 'fail') prereqs.ok = false;
}

function runPrereqs() {
  section('1/5 · Checking prerequisites');

  console.log('  ' + bold('REQUIRED'));
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= NODE_LTS_MAJOR) {
    checkRow('pass', `Node.js ${process.versions.node} (≥ ${NODE_LTS_MAJOR} LTS)`);
  } else {
    checkRow('fail', `Node.js ${process.versions.node} is too old — need ${NODE_LTS_LABEL}`,
      'install: nvm install --lts  ·  or https://nodejs.org (choose LTS)');
  }

  const gitOk = which('git');
  checkRow(gitOk ? 'pass' : 'fail', gitOk ? 'git available' : 'git not found on PATH',
    gitOk ? null : 'install: https://git-scm.com/downloads');

  let repoOk = isGitRepo(TARGET);
  if (!repoOk) {
    checkRow('warn', 'target is not a git repository yet', 'AWE branches and the ship gate need git');
  } else {
    checkRow('pass', 'inside a git repository');
  }

  let writable = true;
  try {
    fs.accessSync(TARGET, fs.constants.W_OK);
  } catch {
    writable = false;
  }
  checkRow(writable ? 'pass' : 'fail', writable ? 'project directory is writable' : `cannot write to ${TARGET}`);

  console.log('  ' + bold('OPTIONAL') + dim(' (missing ones just degrade gracefully — hooks skip with a warning)'));
  const optionalBins = [
    ['gitleaks', 'secrets scanning', 'brew install gitleaks  ·  https://github.com/gitleaks/gitleaks'],
    ['semgrep', 'SAST scanning', 'pipx install semgrep  ·  https://semgrep.dev'],
    ['osv-scanner', 'dependency vulnerability scanning', 'https://google.github.io/osv-scanner/installation/'],
    ['cfn-guard', 'CloudFormation policy checks (IaC projects only)', 'brew install cloudformation-guard  ·  https://github.com/aws-cloudformation/cloudformation-guard'],
    ['ngrok', 'local integration testing only', 'https://ngrok.com/download'],
    ['aws', 'deploy-verify projects only', 'https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html'],
  ];
  for (const [bin, why, hintText] of optionalBins) {
    const found = which(bin);
    checkRow(found ? 'pass' : 'warn', `${bin} ${found ? 'available' : 'not found'} ${dim(`(${why})`)}`, found ? null : hintText);
  }

  return { repoOk };
}

// ── Prompts ─────────────────────────────────────────────────────────────────
// ONE readline interface for the whole run, with a LINE QUEUE. Two traps this
// avoids: (1) a second interface on the same stdin loses buffered input;
// (2) rl.question only consumes lines while a question is pending — piped
// answers that arrive between questions are silently dropped. The queue
// captures every line the moment it arrives; EOF resolves remaining asks with
// their defaults, so `setup < /dev/null` can never hang.
function makePrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY, // line editing on a real TTY; plain lines when piped
  });
  const lines = [];
  const waiters = [];
  let ended = false;
  rl.on('line', (l) => {
    if (waiters.length > 0) waiters.shift()(l);
    else lines.push(l);
  });
  rl.on('close', () => {
    ended = true;
    while (waiters.length > 0) waiters.shift()(null);
  });
  const nextLine = () => {
    if (lines.length > 0) return Promise.resolve(lines.shift());
    if (ended) return Promise.resolve(null);
    return new Promise((resolve) => waiters.push(resolve));
  };
  return {
    async ask(question, def) {
      const suffix = def !== undefined && def !== '' ? ` ${dim('[' + def + ']')}` : '';
      process.stdout.write(`  ${SYM.arrow} ${question}${suffix}: `);
      const raw = await nextLine();
      if (!process.stdin.isTTY) process.stdout.write('\n'); // piped input isn't echoed; keep the log readable
      if (raw === null) return String(def ?? '');
      const v = String(raw).trim();
      return v === '' && def !== undefined ? String(def) : v;
    },
    close() { rl.close(); },
  };
}

const ROLE_CHOICES = ['backend', 'frontend'];
const TICKET_CHOICES = ['none', 'redmine', 'jira', 'github', 'gitlab'];

async function gatherAnswers(p) {
  section('2/5 · Configuration');
  const defaults = {
    projectName: path.basename(TARGET),
    baseBranch: 'develop',
    roles: 'backend,frontend',
    testCommand: 'npm test',
    lintCommand: 'npm run lint',
    reviewIterations: '3',
    ticketSystem: 'none',
    strictSecurity: 'n',
  };

  if (FLAGS.yes) {
    console.log(dim('  --yes: using defaults (override with --set k=v)'));
    const merged = { ...defaults, ...setPairs };
    for (const [k, v] of Object.entries(merged)) kv(k, v);
    return validateAnswers(merged);
  }

  console.log(dim('  8 quick questions — press Enter to accept each [default].'));
  const a = {};
  a.projectName = setPairs.projectName ?? (await p.ask('Project name', defaults.projectName));
  a.baseBranch = setPairs.baseBranch ?? (await p.ask('Base branch (branches/PRs target it; e.g. develop, staging, main)', defaults.baseBranch));
  a.roles = setPairs.roles ?? (await p.ask(`Roles to enable, comma-separated (${ROLE_CHOICES.join(' / ')})`, defaults.roles));
  a.testCommand = setPairs.testCommand ?? (await p.ask('Test command (must exit 0 when green)', defaults.testCommand));
  a.lintCommand = setPairs.lintCommand ?? (await p.ask('Lint command', defaults.lintCommand));
  a.reviewIterations = setPairs.reviewIterations ?? (await p.ask('Review iterations before human escalation', defaults.reviewIterations));
  a.ticketSystem = setPairs.ticketSystem ?? (await p.ask(`Ticket system (${TICKET_CHOICES.join(' / ')}) — "none" = paste tickets manually`, defaults.ticketSystem));
  a.strictSecurity = setPairs.strictSecurity ?? (await p.ask('Strict security mode? (missing scanners FAIL gates instead of warning) y/N', defaults.strictSecurity));
  return validateAnswers(a);
}

function validateAnswers(a) {
  const roles = String(a.roles).split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
  const badRoles = roles.filter((r) => !ROLE_CHOICES.includes(r));
  if (roles.length === 0 || badRoles.length > 0) {
    fail(`Invalid roles "${a.roles}".`, `Choose from: ${ROLE_CHOICES.join(', ')} (comma-separated).`);
  }
  const iterations = parseInt(a.reviewIterations, 10);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10) {
    fail(`Invalid reviewIterations "${a.reviewIterations}".`, 'Pick an integer 1-10 (3 is recommended).');
  }
  if (!TICKET_CHOICES.includes(String(a.ticketSystem).toLowerCase())) {
    fail(`Invalid ticketSystem "${a.ticketSystem}".`, `Choose from: ${TICKET_CHOICES.join(', ')}.`);
  }
  const strict = ['y', 'yes', 'true', '1'].includes(String(a.strictSecurity).toLowerCase());
  return {
    projectName: a.projectName,
    baseBranch: a.baseBranch,
    roles,
    testCommand: a.testCommand,
    lintCommand: a.lintCommand,
    reviewIterations: iterations,
    ticketSystem: String(a.ticketSystem).toLowerCase(),
    strictSecurity: strict,
  };
}

// ── File planning ───────────────────────────────────────────────────────────
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function walkFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

function render(content, answers) {
  const map = {
    PROJECT_NAME: answers.projectName,
    BASE_BRANCH: answers.baseBranch,
    ROLES: answers.roles.join(', '),
    ROLES_JSON: JSON.stringify(answers.roles),
    TEST_COMMAND: answers.testCommand,
    LINT_COMMAND: answers.lintCommand,
    REVIEW_ITERATIONS: String(answers.reviewIterations),
    TICKET_SYSTEM: answers.ticketSystem,
    STRICT_SECURITY: String(answers.strictSecurity),
    SETUP_DATE: new Date().toISOString().slice(0, 10),
    ENV_URLS: '_None configured — add staging/prod URLs here as the project grows (e.g. `- staging: https://…`)._',
    DEPLOY_COMMANDS: '_None configured — add deploy commands here if agents may verify deploys._',
  };
  return content.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in map ? map[k] : m));
}

/** Canonical managed-file list: [rootDir, srcRel, destRel]. Shared by install + uninstall. */
function managedFiles() {
  const files = [[TEMPLATE_DIR, '.cursor/hooks.json', '.cursor/hooks.json']];
  for (const f of walkFiles(path.join(PLUGIN_DIR, 'scripts'))) {
    files.push([PLUGIN_DIR, path.join('scripts', f), path.join('.cursor/hooks', f)]);
  }
  for (const f of ['00-awe-constitution.mdc', '10-awe-phases.mdc', '15-awe-runtime.mdc', '20-awe-security.mdc']) {
    files.push([PLUGIN_DIR, path.join('rules', f), path.join('.cursor/rules', f)]);
  }
  for (const f of walkFiles(path.join(PLUGIN_DIR, 'agents'))) {
    files.push([PLUGIN_DIR, path.join('agents', f), path.join('.cursor/agents', f)]);
  }
  for (const f of walkFiles(path.join(PLUGIN_DIR, 'skills'))) {
    files.push([PLUGIN_DIR, path.join('skills', f), path.join('.cursor/skills', f)]);
  }
  files.push([TEMPLATE_DIR, 'plans/README.md', 'plans/README.md']);
  files.push([TEMPLATE_DIR, 'NOTICE', 'NOTICE']);
  files.push([TEMPLATE_DIR, 'ci/github/awe-gates.yml', '.github/workflows/awe-gates.yml']);
  files.push([TEMPLATE_DIR, 'ci/gitlab/.gitlab-ci.yml', '.gitlab-ci.yml']);
  files.push([TEMPLATE_DIR, '.github/dependabot.yml', '.github/dependabot.yml']);
  return files;
}

/**
 * Build the operation list.
 * kind: 'managed'  → AWE-owned, refreshed on re-run (user edits need --force)
 *       'user'     → yours; never clobbered, drift produces a `.new` sibling
 */
function planOps(answers) {
  const ops = [];
  const addFrom = (root, src, destRel, kind, { renderIt = false } = {}) => {
    const abs = path.join(root, src);
    const content = fs.readFileSync(abs);
    ops.push({
      destRel,
      destAbs: path.join(TARGET, destRel),
      kind,
      content: renderIt ? Buffer.from(render(content.toString('utf8'), answers)) : content,
    });
  };
  const add = (src, destRel, kind, opts) => addFrom(TEMPLATE_DIR, src, destRel, kind, opts);

  const ci = (FLAGS.ci || '').toLowerCase();
  for (const [root, src, destRel] of managedFiles()) {
    if (src === 'ci/github/awe-gates.yml' && !['github', 'both'].includes(ci)) continue;
    if (src === 'ci/gitlab/.gitlab-ci.yml' && !['gitlab', 'both'].includes(ci)) continue;
    if (src === '.github/dependabot.yml' && !['github', 'both'].includes(ci)) continue;
    addFrom(root, src, destRel, 'managed');
  }

  // User-owned: generated config + profile, custom rules, MCP template
  // awe.config.json: template ships as VALID JSON with defaults; setup parses
  // it and overlays the answers (safer than string-templating JSON).
  const cfg = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'awe.config.json'), 'utf8'));
  cfg.projectName = answers.projectName;
  cfg.baseBranch = answers.baseBranch;
  cfg.roles = answers.roles;
  cfg.commands.test = answers.testCommand;
  cfg.commands.lint = answers.lintCommand;
  cfg.reviewIterations = answers.reviewIterations;
  cfg.ticketSystem = answers.ticketSystem;
  cfg.strictSecurity = answers.strictSecurity;
  cfg._awe.generatedAt = new Date().toISOString().slice(0, 10);
  ops.push({
    destRel: 'awe.config.json',
    destAbs: path.join(TARGET, 'awe.config.json'),
    kind: 'user',
    content: Buffer.from(JSON.stringify(cfg, null, 2) + '\n'),
  });
  add('.cursor/rules/30-awe-project-profile.mdc', '.cursor/rules/30-awe-project-profile.mdc', 'user', { renderIt: true });
  add('.cursor/rules/40-awe-project-custom.mdc', '.cursor/rules/40-awe-project-custom.mdc', 'user');
  add('.cursor/mcp.json', '.cursor/mcp.json', 'user');
  // CONSTRAINTS.md is the human-owned quality bar — scaffold once, never clobber.
  add('CONSTRAINTS.md', 'CONSTRAINTS.md', 'user');
  return ops;
}

// ── Manifest (idempotent, modification-aware re-runs) ──────────────────────
const MANIFEST_PATH = path.join(TARGET, '.cursor/state/awe-manifest.json');
function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return { aweVersion: AWE_VERSION, files: {} };
  }
}
function saveManifest(m) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n');
}

// ── Apply ───────────────────────────────────────────────────────────────────
function applyOps(ops) {
  const manifest = loadManifest();
  const results = { written: [], refreshed: [], unchanged: [], skipped: [], newFiles: [] };

  for (const op of ops) {
    const exists = fs.existsSync(op.destAbs);
    const nextHash = sha256(op.content);

    if (op.kind === 'user') {
      if (!exists) {
        results.written.push(op);
      } else if (sha256(fs.readFileSync(op.destAbs)) === nextHash) {
        results.unchanged.push(op);
      } else {
        results.newFiles.push(op); // drift → write <file>.new, keep theirs
      }
      continue;
    }

    // managed
    if (!exists) {
      results.written.push(op);
    } else {
      const curHash = sha256(fs.readFileSync(op.destAbs));
      const recorded = manifest.files[op.destRel];
      if (curHash === nextHash) {
        results.unchanged.push(op);
      } else if (recorded === curHash || FLAGS.force) {
        // We wrote this exact file and it is untouched (or --force) → safe to refresh.
        results.refreshed.push(op);
      } else {
        // Content differs and we cannot prove AWE wrote it (user edit, or the
        // machine-local manifest was wiped). Never silently clobber: skip + warn.
        results.skipped.push(op);
      }
    }
  }

  if (FLAGS.dryRun) return { results, manifest };

  for (const op of [...results.written, ...results.refreshed]) {
    fs.mkdirSync(path.dirname(op.destAbs), { recursive: true });
    fs.writeFileSync(op.destAbs, op.content);
    if (op.kind === 'managed') manifest.files[op.destRel] = sha256(op.content);
  }
  for (const op of results.newFiles) {
    fs.writeFileSync(op.destAbs + '.new', op.content);
  }
  saveManifest(manifest);
  return { results, manifest };
}

function mergeGitignore() {
  const giPath = path.join(TARGET, '.gitignore');
  const block = ['# AWE runtime state (audit log, evidence, signoff)', '.cursor/state/'];
  let existing = '';
  try {
    existing = fs.readFileSync(giPath, 'utf8');
  } catch { /* none yet */ }
  const already = existing.split('\n').some((l) => l.trim() === '.cursor/state/');
  if (already) return 'unchanged';
  if (FLAGS.dryRun) return fs.existsSync(giPath) ? 'would append' : 'would create';
  const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(giPath, existing + sep + (existing ? '\n' : '') + block.join('\n') + '\n');
  return existing ? 'appended' : 'created';
}

// ── Uninstall ───────────────────────────────────────────────────────────────
function uninstall() {
  section('Uninstall AWE');
  const manifest = loadManifest();
  const removed = [];
  const kept = [];
  // Works even when .cursor/state (and the manifest) was wiped: the managed
  // list comes from the template, and a file is provably AWE's when it matches
  // the manifest hash OR the pristine template bytes.
  for (const [root, src, rel] of managedFiles()) {
    const abs = path.join(TARGET, rel);
    if (!fs.existsSync(abs)) continue;
    const curHash = sha256(fs.readFileSync(abs));
    const provablyOurs =
      manifest.files[rel] === curHash ||
      curHash === sha256(fs.readFileSync(path.join(root, src)));
    if (!provablyOurs && !FLAGS.force) {
      kept.push(rel + ' (modified or unknown origin — re-run with --force to remove)');
      continue;
    }
    if (!FLAGS.dryRun) fs.rmSync(abs);
    removed.push(rel);
  }
  if (removed.length === 0 && kept.length === 0) {
    console.log('  ' + dim('No AWE-managed files found — nothing to remove.'));
    return;
  }
  // clean up empty dirs (deepest first)
  if (!FLAGS.dryRun) {
    const dirs = [...new Set(removed.map((r) => path.dirname(path.join(TARGET, r))))].sort((a, b) => b.length - a.length);
    for (const d of dirs) {
      let cur = d;
      while (cur.startsWith(TARGET) && cur !== TARGET) {
        try {
          if (fs.readdirSync(cur).length === 0) fs.rmdirSync(cur);
          else break;
        } catch { break; }
        cur = path.dirname(cur);
      }
    }
    if (fs.existsSync(MANIFEST_PATH)) fs.rmSync(MANIFEST_PATH);
  }
  for (const r of removed) console.log(`  ${SYM.pass} removed ${r}`);
  for (const k of kept) console.log(`  ${SYM.warn} kept ${k}`);
  console.log('');
  kv('Kept (yours)', 'awe.config.json, .cursor/rules/30 & 40, .cursor/mcp.json, plans/**, .cursor/state/**');
  kv('Note', '.gitignore still lists .cursor/state/ — harmless, remove by hand if you like');
  console.log('\n' + ok(bold('AWE managed files removed.')) + dim(FLAGS.dryRun ? ' (dry-run — nothing actually changed)' : ''));
}

// ── Summary ─────────────────────────────────────────────────────────────────
function printTree(paths) {
  const sorted = [...paths].sort();
  for (const p of sorted) console.log(`    ${dim('│')} ${p}`);
}

function summary(ops, results, answers, gitignoreAction) {
  section('5/5 · Summary');
  const counts = [
    `${results.written.length} written`,
    results.refreshed.length ? `${results.refreshed.length} refreshed` : null,
    results.unchanged.length ? `${results.unchanged.length} already up to date` : null,
    results.skipped.length ? warn(`${results.skipped.length} skipped (locally modified; --force to overwrite)`) : null,
    results.newFiles.length ? warn(`${results.newFiles.length} drifted (see *.new files)`) : null,
  ].filter(Boolean).join(' · ');
  console.log(`  ${counts}${FLAGS.dryRun ? warn('  [DRY RUN — nothing written]') : ''}\n`);

  const all = [
    ...results.written.map((o) => o.destRel),
    ...results.refreshed.map((o) => o.destRel + dim('  (refreshed)')),
    ...results.newFiles.map((o) => o.destRel + '.new' + warn('  (your version kept)')),
    ...results.skipped.map((o) => o.destRel + warn('  (skipped)')),
  ];
  printTree(all);
  kv('.gitignore', gitignoreAction === 'unchanged' ? 'already covers .cursor/state/' : `${gitignoreAction} → .cursor/state/`);

  section('Next steps');
  const steps = [
    `Open ${bold(answers.projectName)} in Cursor and choose ${bold('Trust workspace')} when asked (hooks need trust).`,
    `${bold('Restart Cursor')} so hooks, rules, agents, and skills load.`,
    `Optional: enable MCP servers in ${bold('.cursor/mcp.json')} — a ticket MCP (${answers.ticketSystem === 'none' ? 'github/gitlab/redmine/jira' : answers.ticketSystem}) for automatic intake, and codebase-memory for a smarter architect. Everything ships disabled; AWE works without them.`,
    `Start your first ticket: ${bold('/awe-intake PROJ-123')} ${dim('(or /awe-intake and paste the ticket text)')}`,
  ];
  steps.forEach((s, i) => console.log(`  ${info(String(i + 1) + '.')} ${s}`));

  console.log('');
  kv('Trigger mode', 'manual — you run each /awe-* skill. To automate transitions, wire Cursor Automations after setup (README § Cloud & team).');
  kv('Notifications', 'OFF (Slack/Gmail are optional good-to-haves — README § Prerequisites → Optional).');
  if (!FLAGS.ci) {
    kv('CI gates', `not installed — re-run with ${bold('--ci github')} or ${bold('--ci gitlab')} to add the L4 pipeline gate.`);
  } else {
    const dests = [];
    if (['github', 'both'].includes(FLAGS.ci.toLowerCase())) dests.push('.github/workflows/awe-gates.yml + .github/dependabot.yml');
    if (['gitlab', 'both'].includes(FLAGS.ci.toLowerCase())) dests.push('.gitlab-ci.yml');
    kv('CI gates', `installed → ${dests.join(' and ')} ${dim('— adjust AWE_TEST_CMD/AWE_LINT_CMD at the top to match awe.config.json')}`);
  }
  kv('Uninstall', `node ${path.join(AWE_ROOT, 'setup.mjs')} --uninstall ${FLAGS.target ? `--target ${FLAGS.target}` : ''}`.trim() + dim('  (removes only AWE-managed files)'));
  kv('Docs', `${path.join(AWE_ROOT, 'README.md')} · ${path.join(AWE_ROOT, 'docs/GUIDE.md')} (install scopes + demo)`);

  console.log('\n' + ok(bold('  ✓ AWE is installed.')) + dim('  INTAKE → ARCHITECT → APPROVE → CODE → REVIEW → VERIFY → SHIP → POST-MERGE E2E\n'));
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  banner();
  kv('Target project', TARGET);
  if (FLAGS.dryRun) console.log('  ' + warn(bold('DRY RUN')) + dim(' — nothing will be written'));

  if (FLAGS.uninstall) {
    uninstall();
    return;
  }

  const { repoOk } = runPrereqs();
  if (!prereqs.ok) {
    fail('Fix the REQUIRED failures above and re-run.', 'Nothing was written.');
  }

  // One shared prompter for the whole run (see makePrompter note).
  const prompter = FLAGS.yes ? null : makePrompter();
  let answers;
  try {
    // Not a git repo → offer to init
    if (!repoOk) {
      let doInit = FLAGS.yes;
      if (!FLAGS.yes) {
        doInit = ['y', 'yes', ''].includes(
          (await prompter.ask('Initialize a git repository here? (needed for AWE branches) Y/n', 'Y')).toLowerCase()
        );
      }
      if (doInit) {
        if (!FLAGS.dryRun) {
          fs.mkdirSync(TARGET, { recursive: true });
          spawnSync('git', ['init'], { cwd: TARGET, stdio: 'ignore' });
        }
        console.log(`  ${SYM.pass} git repository initialized`);
      } else {
        fail('AWE needs a git repository.', 'Run git init, then re-run setup.');
      }
    }

    answers = await gatherAnswers(prompter);
  } finally {
    prompter?.close();
  }

  section('3/5 · Scaffolding');
  const ops = planOps(answers);
  const { results } = applyOps(ops);
  const verb = FLAGS.dryRun ? 'would write' : 'wrote';
  console.log(`  ${SYM.pass} ${verb} ${results.written.length + results.refreshed.length} files across .cursor/, plans/, awe.config.json`);

  section('4/5 · Git hygiene');
  const giAction = mergeGitignore();
  console.log(`  ${SYM.pass} .gitignore ${giAction === 'unchanged' ? 'already covers' : giAction + ':'} .cursor/state/ ${dim('(audit log, evidence — machine-local)')}`);
  console.log(`  ${SYM.pass} no npm packages installed; package-lock.json untouched ${dim('(AWE uses only Node built-ins)')}`);

  summary(ops, results, answers, giAction);
}

main().catch((err) => fail(`Unexpected error: ${err.message}`, 'Please report this with the --dry-run output.'));
