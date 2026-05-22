// tcc probe — macOS only。doctor 进程权限不能代表 launchd 启动的 runner 进程。
// Source of truth: design/05-backend.md §7 + §10 R2.
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProbeResult } from '../types.js';

const PROBE_NAME = 'tcc';

const TCC_REMEDIATION = [
  'cct-runner cannot access ~/Documents under launchd.',
  'Fix:',
  '  1. open "System Settings" → "Privacy & Security" → "Full Disk Access"',
  '  2. click "+", choose: /usr/local/bin/cct-runner',
  '  3. restart all CCT tasks: `cct-doctor reconcile`',
].join('\n');

export interface TccProbeOptions {
  // 测试时注入临时目录或假 fs
  homeDir?: string;
  fsImpl?: Pick<typeof fs, 'writeFile' | 'readFile' | 'unlink'>;
}

export async function probeTcc(opts: TccProbeOptions = {}): Promise<ProbeResult> {
  if (process.platform !== 'darwin') {
    return {
      name: PROBE_NAME,
      level: 'ok',
      message: `skipped on ${process.platform} (TCC is macOS-only)`,
    };
  }

  const home = opts.homeDir ?? os.homedir();
  const fsImpl = opts.fsImpl ?? fs;
  const probeFile = path.join(home, 'Documents', `.cct-tcc-${randomUUID()}.tmp`);

  try {
    await fsImpl.writeFile(probeFile, 'cct-tcc-probe');
    const back = await fsImpl.readFile(probeFile, 'utf8');
    await fsImpl.unlink(probeFile);
    if (back !== 'cct-tcc-probe') {
      return {
        name: PROBE_NAME,
        level: 'error',
        message: 'TCC test wrote but read mismatch (FS corruption?)',
        remediation: TCC_REMEDIATION,
        details: { probeFile },
      };
    }
    return {
      name: PROBE_NAME,
      level: 'ok',
      // 关键：doctor 进程的权限 != runner 进程，必须明确告知用户。
      message:
        'doctor process can write ~/Documents. Note: this only proves the doctor binary has access — ' +
        'launchd-spawned cct-runner may still be blocked. Run `cct-runner --tcc-probe` to verify the actual runner.',
    };
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      return {
        name: PROBE_NAME,
        level: 'error',
        message: `CCT_DOCTOR_TCC_BLOCKED: macOS TCC blocked file access at ${probeFile} (${err.code}).`,
        remediation: TCC_REMEDIATION,
        details: { probeFile, code: err.code },
      };
    }
    return {
      name: PROBE_NAME,
      level: 'warn',
      message: `TCC probe inconclusive: ${err.message}`,
      remediation: 'Run `cct-runner --tcc-probe` from a launchd-spawned process to get a definitive result.',
      details: { probeFile, code: err.code },
    };
  }
}
