// AWE read gate (beforeReadFile). failClosed: false — a bug here must never
// wedge all file reads; it fails open and logs instead.
//
// Always on (even when AWE is inactive): agents never read credential material.
// The human provides specific values out-of-band when truly needed.

import { runHook, respond, projectDir, extractFilePath, relPath } from './lib/state.mjs';
import { audit } from './lib/audit.mjs';

const DENY_READS = [
  { re: /(^|\/)\.env(\.|$)/, what: '.env files' },
  { re: /(^|\/)\.aws\//, what: '~/.aws credentials' },
  { re: /(^|\/)\.ssh\//, what: '~/.ssh keys' },
  { re: /(^|\/)secrets?\//, what: 'secrets directories' },
  { re: /(^|\/)(id_rsa|id_ed25519|credentials|\.netrc|\.npmrc|\.pypirc)$/, what: 'credential files' },
];

await runHook(async (input) => {
  const dir = projectDir();
  const rel = relPath(extractFilePath(input), dir);
  if (!rel) return respond({});

  for (const { re, what } of DENY_READS) {
    if (re.test(rel)) {
      audit(dir, 'beforeReadFile', 'deny', `blocked read of ${what}`, { path: rel });
      return respond({
        permission: 'deny',
        agent_message:
          `AWE blocks agent reads of ${what} ("${rel}"). Secrets stay out of the model context. ` +
          `Ask the human to provide the specific value or config you need, out-of-band.`,
      });
    }
  }
  return respond({}); // nothing to block → no opinion ({}) so AWE never interferes
});
