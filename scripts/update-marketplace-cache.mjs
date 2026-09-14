#!/usr/bin/env node
// Install GitHub's latest plugin commit into Cursor's marketplace cache.
// Uses origin (fetched), never the local working tree / uncommitted files.
//
//   npm run marketplace:cache
//   npm run marketplace:cache:check
//
// Flags:
//   --check         Report whether cache needs an update; write nothing
//   --offline       Do not git fetch (use last-known origin/main)
//   --keep-old      Do not delete other SHA folders for this plugin
//   --force         Recopy even when that origin SHA is already cached
//   --dry-run       Print actions, write nothing
//   --cursor-home   Override ~/.cursor (tests)
//   --help

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Update Cursor marketplace cache from GitHub latest (origin/main).

  node scripts/update-marketplace-cache.mjs [--check] [--offline] [--keep-old] [--force] [--dry-run]

Fetches origin, then copies that commit (not your working tree) into
~/.cursor/plugins/{cache,marketplaces} if that SHA is not already there.`);
  process.exit(0);
}

const hasFlag = (n) => argv.includes(n);
const flagValue = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};

const FLAGS = {
  check: hasFlag('--check'),
  offline: hasFlag('--offline'),
  keepOld: hasFlag('--keep-old'),
  dryRun: hasFlag('--dry-run'),
  force: hasFlag('--force'),
  cursorHome: flagValue('--cursor-home'),
};

const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const SYM = {
  pass: paint(32, '✓'),
  warn: paint(33, '⚠'),
  fail: paint(31, '✗'),
  arrow: paint(36, '→'),
};

function die(msg, code = 1) {
  console.error(`${SYM.fail} ${msg}`);
  process.exit(code);
}

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: opts.encoding || 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: opts.maxBuffer || 32 * 1024 * 1024,
  });
}

function gitText(args) {
  return git(args).trim();
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listShaDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[0-9a-f]{7,40}$/i.test(e.name))
    .map((e) => e.name);
}

function cachedVersion(dir, rel) {
  try {
    const j = readJson(path.join(dir, rel));
    return j.version || j.metadata?.version || null;
  } catch {
    return null;
  }
}

function resolveOriginSha() {
  if (!FLAGS.offline) {
    try {
      gitText(['fetch', '--quiet', 'origin']);
    } catch (err) {
      console.log(`${SYM.warn} git fetch origin failed (${err.message.split('\n')[0]}); using last-known origin`);
    }
  }
  for (const ref of ['origin/HEAD', 'origin/main', 'origin/master']) {
    try {
      return { sha: gitText(['rev-parse', ref]), ref };
    } catch { /* try next */ }
  }
  die('no origin/HEAD, origin/main, or origin/master. This script installs GitHub latest, not local HEAD.');
}

function exportCommit(sha, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const tar = git(['archive', '--format=tar', sha], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', dest], { input: tar, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

const { sha, ref } = resolveOriginSha();
const cursorHome = FLAGS.cursorHome || process.env.CURSOR_HOME || path.join(os.homedir(), '.cursor');
const cacheRoot = path.join(cursorHome, 'plugins', 'cache', 'rt-coding-essentials', 'rt-coding-essentials');
const marketRoot = path.join(
  cursorHome, 'plugins', 'marketplaces', 'github.com', 'muizather', 'rt-coding-essentials',
);
const cacheDest = path.join(cacheRoot, sha);
const marketDest = path.join(marketRoot, sha);

const cacheHas = fs.existsSync(path.join(cacheDest, '.cursor-plugin', 'plugin.json'));
const marketHas = fs.existsSync(path.join(marketDest, '.cursor-plugin', 'marketplace.json'));
const cacheVer = cacheHas ? cachedVersion(cacheDest, '.cursor-plugin/plugin.json') : null;
const marketVer = marketHas ? cachedVersion(marketDest, '.cursor-plugin/marketplace.json') : null;
const already = !FLAGS.force && cacheHas && marketHas;

console.log(`${SYM.arrow} ${ref}  ${sha.slice(0, 12)}`);

if (FLAGS.check) {
  if (already) {
    console.log(`${SYM.pass} marketplace cache already has GitHub ${sha.slice(0, 12)} (${cacheVer ?? '?'})`);
    process.exit(0);
  }
  console.log(`${SYM.warn} cache needs GitHub ${sha.slice(0, 12)} (have cache=${cacheVer ?? 'missing'} marketplace=${marketVer ?? 'missing'})`);
  process.exit(2);
}

if (already) {
  console.log(`${SYM.pass} already cached — nothing to do`);
  process.exit(0);
}

if (FLAGS.dryRun) {
  console.log(`${SYM.arrow} would export ${ref} → ${cacheDest}`);
  console.log(`${SYM.arrow} would export ${ref} → ${marketDest}`);
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awe-mkt-'));
try {
  exportCommit(sha, tmp);
  const pluginJson = path.join(tmp, 'rt-coding-essentials', '.cursor-plugin', 'plugin.json');
  const marketJson = path.join(tmp, '.cursor-plugin', 'marketplace.json');
  if (!fs.existsSync(pluginJson) || !fs.existsSync(marketJson)) {
    die(`origin commit ${sha.slice(0, 12)} is missing plugin manifests`);
  }
  const version = readJson(pluginJson).version;
  copyTree(path.join(tmp, 'rt-coding-essentials'), cacheDest);
  copyTree(tmp, marketDest);
  if (cachedVersion(cacheDest, '.cursor-plugin/plugin.json') !== version) {
    die('copy finished but cache plugin.json version mismatch');
  }

  if (!FLAGS.keepOld) {
    for (const other of listShaDirs(cacheRoot)) {
      if (other !== sha) fs.rmSync(path.join(cacheRoot, other), { recursive: true, force: true });
    }
    for (const other of listShaDirs(marketRoot)) {
      if (other !== sha) fs.rmSync(path.join(marketRoot, other), { recursive: true, force: true });
    }
  }

  console.log(`${SYM.pass} cached ${version} from ${ref}`);
  console.log(`    ${cacheDest}`);
  console.log(`    ${marketDest}`);
  console.log(`${SYM.arrow} Developer: Reload Window. If Customize still shows the old version, remove the GitHub marketplace and add it again.`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
