// logDir probe — 日志目录可写。
// Source of truth: design/05-backend.md §7 + _terminology.md "用户机器上的运行时路径"。
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProbeResult } from '../types.js';

const PROBE_NAME = 'logDir';

function defaultLogDir(): string {
  if (process.env.CCT_LOG_DIR) return process.env.CCT_LOG_DIR;
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Logs/cct');
  return path.join(os.homedir(), '.local/share/cct/logs');
}

export async function probeLogDir(): Promise<ProbeResult> {
  const dir = defaultLogDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fs.constants.W_OK);
    return {
      name: PROBE_NAME,
      level: 'ok',
      message: `log dir writable: ${dir}`,
      details: { dir },
    };
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `log dir not writable (${err.code ?? err.message}): ${dir}`,
      remediation: [
        `Ensure ${dir} exists and is owned by the current user.`,
        `Override with CCT_LOG_DIR=/path/to/dir if needed.`,
      ].join('\n'),
      details: { dir, code: err.code },
    };
  }
}
