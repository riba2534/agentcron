// keychain probe (macOS only) — security find-generic-password -s com.cct.master。
// Source of truth: design/05-backend.md §7.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProbeResult } from '../types.js';

const execFileAsync = promisify(execFile);

const PROBE_NAME = 'keychain';
const KEYCHAIN_SERVICE = 'com.cct.master';

export async function probeKeychain(): Promise<ProbeResult> {
  if (process.platform !== 'darwin') {
    return {
      name: PROBE_NAME,
      level: 'ok',
      message: `skipped on ${process.platform} (Keychain is macOS-only)`,
    };
  }
  try {
    await execFileAsync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { timeout: 10_000 },
    );
    return {
      name: PROBE_NAME,
      level: 'ok',
      message: `Keychain entry "${KEYCHAIN_SERVICE}" reachable.`,
    };
  } catch (e: unknown) {
    const err = e as { stderr?: string; message: string };
    const stderr = err.stderr ?? err.message;
    if (stderr.includes('could not be found')) {
      return {
        name: PROBE_NAME,
        level: 'warn',
        message: `Keychain entry "${KEYCHAIN_SERVICE}" not yet created.`,
        remediation: [
          'The master key will be auto-generated on first run.',
          'If you expect an existing key, check `security dump-keychain | grep com.cct.master`.',
        ].join('\n'),
      };
    }
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `security CLI failed: ${stderr}`,
      remediation: [
        'Check that the `security` command-line tool is available (it ships with macOS).',
        'If Keychain access is denied, allow the app via Keychain Access.app.',
      ].join('\n'),
    };
  }
}
