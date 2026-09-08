// AWE post-write secret scan (postToolUse, matcher "Write|Edit|StrReplace|MultiEdit").
// failClosed: false — scanning is advisory at this layer; the hard gate is CI (L4).
//
// Scans every just-written file for secrets (built-in patterns + gitleaks when
// available). Findings are injected back as additional_context so the agent
// removes the secret immediately, and every scan lands in the audit log.

import path from 'node:path';
import { runHook, respond, projectDir, extractFilePath, loadConfig } from './lib/state.mjs';
import { audit } from './lib/audit.mjs';
import { scanFileForSecrets } from './lib/scanners.mjs';

await runHook(async (input) => {
  const dir = projectDir();
  const rel = extractFilePath(input);
  if (!rel) return respond({});
  const abs = path.isAbsolute(rel) ? rel : path.join(dir, rel);

  const config = loadConfig(dir) || {};
  const { findings, scannerUsed } = scanFileForSecrets(abs, dir, {
    strict: config.strictSecurity === true,
  });

  const relPosix = path.relative(dir, abs).split(path.sep).join('/');
  if (findings.length > 0) {
    const names = [...new Set(findings.map((f) => f.name))].join(', ');
    audit(dir, 'postToolUse', 'flagged', `possible secret in ${relPosix}: ${names}`, {
      path: relPosix, scanner: scannerUsed,
    });
    return respond({
      additional_context:
        `SECURITY: possible secret detected in ${relPosix} (${names}). ` +
        `Remove it immediately and rotate if real. Secrets are rotated, not deleted — ` +
        `if this already reached a commit, tell the human now.`,
    });
  }

  audit(dir, 'postToolUse', 'clean', `scanned ${relPosix}`, { path: relPosix, scanner: scannerUsed });
  return respond({});
});
