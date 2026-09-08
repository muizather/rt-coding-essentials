// AWE scanner library — secret detection with graceful degradation.
//
// Strategy:
//   1. Built-in regexes always run (zero-dependency baseline).
//   2. If gitleaks is on PATH, it is used as an additional pass on the file.
//   3. Scanner failures NEVER crash a hook: warn into the audit log and fall
//      back to the built-ins. In strict security mode (awe.config.json
//      "strictSecurity": true) a scanner failure throws instead, so a hard
//      gate can fail closed.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { audit } from './audit.mjs';

export const BUILTIN_PATTERNS = [
  { name: 'aws-access-key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: 'generic-secret-assignment', re: /\b(?:api[_-]?key|apikey|secret|secret[_-]?key|password|passwd|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i },
  { name: 'github-token', re: /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

/** Which optional scanners are available on PATH right now? */
export function detectScanners() {
  const has = (bin, args = ['--version']) => {
    try {
      const r = spawnSync(bin, args, { stdio: 'ignore', timeout: 5000 });
      return r.status === 0;
    } catch {
      return false;
    }
  };
  return {
    gitleaks: has('gitleaks'),
    semgrep: has('semgrep'),
    osvScanner: has('osv-scanner'),
  };
}

/** Run built-in regexes against text. Returns [{ name, line }] findings. */
export function builtinScan(text) {
  const findings = [];
  const lines = String(text).split('\n');
  for (const { name, re } of BUILTIN_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        findings.push({ name, line: i + 1, scanner: 'builtin' });
        break; // one hit per pattern is enough to flag the file
      }
    }
  }
  return findings;
}

/**
 * Best-effort gitleaks pass over a single file. Returns findings or null when
 * gitleaks is unavailable/failed (caller then relies on the built-in pass).
 *
 * Uses the `dir` subcommand: gitleaks ≥ v8.19 deprecated `detect`/`protect`
 * (removed from current releases — v8.30.1 is the pinned/verified version).
 * `dir` scans a file or directory with no git involved, so it works on a
 * just-written file that may not be committed yet. `--redact` keeps any found
 * secret out of our logs (we only count lines, never echo values).
 */
export function gitleaksScan(filePath, dir) {
  try {
    const r = spawnSync(
      'gitleaks',
      ['dir', filePath, '--log-level', 'error', '--exit-code', '1', '--redact'],
      { cwd: dir, timeout: 15000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    if (r.error) return null;
    if (r.status === 0) return []; // clean
    if (r.status === 1) {
      // gitleaks prints findings to stdout; keep it to a count so the hook stays fast
      const count = (r.stdout || '').split('\n').filter((l) => l.trim().length > 0).length;
      return [{ name: 'gitleaks', line: null, scanner: 'gitleaks', detail: `${Math.max(count, 1)} finding(s)` }];
    }
    return null; // unexpected exit → treat as unavailable
  } catch {
    return null;
  }
}

/**
 * Scan a just-written file for secrets. Never throws unless strict === true.
 * @returns {{ findings: Array, scannerUsed: string }}
 */
export function scanFileForSecrets(filePath, dir, { strict = false } = {}) {
  let text = '';
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) return { findings: [], scannerUsed: 'skipped (>1MB)' };
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { findings: [], scannerUsed: 'skipped (unreadable)' };
  }

  const findings = builtinScan(text);
  let scannerUsed = 'builtin';

  const gl = gitleaksScan(filePath, dir);
  if (gl === null) {
    if (strict && !detectScanners().gitleaks) {
      const err = new Error('strictSecurity: gitleaks unavailable and built-in scan is the only coverage');
      audit(dir, 'scanner', 'error', err.message, { path: filePath });
      throw err;
    }
    audit(dir, 'scanner', 'degraded', 'gitleaks unavailable — built-in patterns only', { path: filePath });
  } else {
    scannerUsed = 'builtin+gitleaks';
    findings.push(...gl);
  }

  return { findings, scannerUsed };
}
