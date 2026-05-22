// runnerBin probe — fs.access(CCT_RUNNER_BIN || which cct-runner, X_OK)。
// Source of truth: design/05-backend.md §7.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import type { ProbeResult } from '../types.js';

const execFileAsync = promisify(execFile);

const PROBE_NAME = 'runnerBin';

const REMEDIATION = [
  'Build cct-runner and link the bin into PATH:',
  '  pnpm --filter @cct/runner build',
  '  ln -s "$(pwd)/apps/runner/dist/index.js" /usr/local/bin/cct-runner',
  '  chmod +x apps/runner/dist/index.js',
].join('\n');

async function whichRunner(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('which', ['cct-runner']);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function probeRunnerBin(): Promise<ProbeResult> {
  const fromEnv = process.env.CCT_RUNNER_BIN;
  const runnerPath = fromEnv && fromEnv.trim().length > 0 ? fromEnv : await whichRunner();

  if (!runnerPath) {
    return {
      name: PROBE_NAME,
      level: 'error',
      message: '`cct-runner` not found in $PATH and CCT_RUNNER_BIN is unset.',
      remediation: REMEDIATION,
    };
  }
  try {
    await fs.access(runnerPath, fs.constants.X_OK);
    return {
      name: PROBE_NAME,
      level: 'ok',
      message: `cct-runner executable at ${runnerPath}`,
      details: { runnerPath, source: fromEnv ? 'CCT_RUNNER_BIN' : 'PATH' },
    };
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `cct-runner at ${runnerPath} not executable (${err.code ?? err.message})`,
      remediation: REMEDIATION,
      details: { runnerPath, code: err.code },
    };
  }
}
