#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '@cct/db';
import { runOnce } from './runOnce.js';
import { installUncaughtHandler } from './uncaughtHandler.js';

// CCT runner CLI entry。
// Source of truth: design/05-backend.md §6.1 + §10 R2.

interface Args {
  taskId?: string;
  runId?: string;
  manual: boolean;
  tccProbe: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { manual: false, tccProbe: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task-id') out.taskId = argv[++i];
    else if (a === '--run-id') out.runId = argv[++i];
    else if (a === '--manual') out.manual = true;
    else if (a === '--tcc-probe') out.tccProbe = true;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return out;
}

function printHelp(): void {
  process.stdout.write(
    [
      'cct-runner — execute one Task by id',
      '',
      'Usage:',
      '  cct-runner --task-id <id> [--manual] [--run-id <id>]',
      '  cct-runner --tcc-probe',
      '',
      'Environment:',
      '  CCT_DB_URL                SQLite URL (file:...)',
      '  CCT_LOG_DIR               log directory override',
      '  CCT_MAX_CONCURRENT_RUNS   default 3',
      '  CCT_CLAUDE_BIN            override `claude` bin path',
      '',
    ].join('\n'),
  );
}

async function tccProbe(): Promise<number> {
  // 设计 §10 R2-01 / 07-qa.md R2-01：
  // 在 ~/Documents 写一份探测文件，验证 TCC 是否拦截 cct-runner 进程。
  const probeFile = path.join(
    os.homedir(),
    'Documents',
    `.cct-tcc-${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(probeFile, 'cct-tcc-probe', { mode: 0o600 });
    const back = await fs.readFile(probeFile, 'utf8');
    await fs.unlink(probeFile);
    if (back !== 'cct-tcc-probe') {
      process.stdout.write(
        '[cct-runner] CCT_DOCTOR_TCC_BLOCKED: write/read mismatch\n',
      );
      return 1;
    }
    process.stdout.write('[cct-runner] tcc-probe: ok\n');
    return 0;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      process.stdout.write(
        [
          '[cct-runner] CCT_DOCTOR_TCC_BLOCKED',
          '  cct-runner cannot access ~/Documents under launchd.',
          '  Fix:',
          '    1. open "System Settings" → "Privacy & Security" → "Full Disk Access"',
          `    2. click "+", choose: ${process.execPath}`,
          '    3. retry: cct-runner --tcc-probe',
          '',
        ].join('\n'),
      );
      return 1;
    }
    process.stdout.write(`[cct-runner] tcc-probe: warn ${err.message}\n`);
    return 1;
  }
}

async function main(): Promise<number> {
  installUncaughtHandler({
    fatal: (msg) => process.stderr.write(`${msg}\n`),
  });

  const args = parseArgs(process.argv.slice(2));

  if (args.tccProbe) return tccProbe();

  if (!args.taskId) {
    process.stderr.write('[cct-runner] missing --task-id\n');
    printHelp();
    return 1;
  }

  try {
    const result = await runOnce({
      prisma,
      taskId: args.taskId,
      manual: args.manual,
      runId: args.runId,
    });
    if (result.status === 'not_found') return 2;
    return 0;
  } catch (e: unknown) {
    process.stderr.write(`[cct-runner] fatal: ${(e as Error).message}\n`);
    return 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`[cct-runner] unhandled: ${(err as Error).message}\n`);
    process.exit(99);
  },
);
