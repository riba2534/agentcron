// clockSkew probe — sntp -q time.apple.com，差 > 10s 警告；命令缺失时跳过。
// Source of truth: design/05-backend.md §7.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProbeResult } from '../types.js';

const execFileAsync = promisify(execFile);

const PROBE_NAME = 'clockSkew';
const NTP_SERVER = process.env.CCT_NTP_SERVER ?? 'time.apple.com';
const SKEW_THRESHOLD_SEC = 10;

// `sntp -q time.apple.com` 输出形如：
//   +0.012345 +/- 0.005678 time.apple.com 17.253.16.123
// 取首个 token 作为偏移秒数（带正负号）。
function parseSntp(stdout: string): number | undefined {
  const firstLine = stdout.split('\n').find((l) => l.trim().length > 0);
  if (!firstLine) return undefined;
  const token = firstLine.trim().split(/\s+/)[0];
  if (!token) return undefined;
  const parsed = Number.parseFloat(token);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function probeClockSkew(): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileAsync('sntp', ['-q', NTP_SERVER], { timeout: 8_000 });
    const skew = parseSntp(stdout);
    if (skew === undefined) {
      return {
        name: PROBE_NAME,
        level: 'warn',
        message: `sntp returned unparseable output:\n${stdout.trim() || '(empty)'}`,
      };
    }
    const abs = Math.abs(skew);
    if (abs > SKEW_THRESHOLD_SEC) {
      return {
        name: PROBE_NAME,
        level: 'warn',
        message: `clock skew ${skew.toFixed(3)}s vs ${NTP_SERVER} exceeds ±${SKEW_THRESHOLD_SEC}s.`,
        remediation: [
          'Sync system clock:',
          process.platform === 'darwin'
            ? '  sudo sntp -sS time.apple.com'
            : '  sudo timedatectl set-ntp true',
        ].join('\n'),
        details: { skewSeconds: skew, ntpServer: NTP_SERVER },
      };
    }
    return {
      name: PROBE_NAME,
      level: 'ok',
      message: `clock skew ${skew.toFixed(3)}s vs ${NTP_SERVER} (within ±${SKEW_THRESHOLD_SEC}s).`,
      details: { skewSeconds: skew, ntpServer: NTP_SERVER },
    };
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === 'ENOENT') {
      return {
        name: PROBE_NAME,
        level: 'ok',
        message: '`sntp` not installed; skipping clock skew probe.',
      };
    }
    // 设计要求 sntp 失败时跳过（不当作 error/warn），只把原因放进 message。
    return {
      name: PROBE_NAME,
      level: 'ok',
      message: `sntp probe skipped (${(err.stderr || err.message).split('\n')[0]}).`,
    };
  }
}
