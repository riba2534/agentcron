// uninstall — 双重确认清除：plist/crontab + Keychain master 密钥 + DB 文件。
// Source of truth: design/02-architecture.md §10 + design/05-backend.md §7。
import { execFile as execFileCb } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { PrismaClient } from '@cct/db';
import { createScheduler } from '@cct/scheduler';
import type { Scheduler } from '@cct/scheduler';
import chalk from 'chalk';
import { ask } from '../prompt.js';

const execFile = promisify(execFileCb);

const KEYCHAIN_SERVICE = 'com.cct.master';
const FINAL_PHRASE = 'YES UNINSTALL';

export interface UninstallOptions {
  prisma: PrismaClient;
  scheduler?: Scheduler;
  confirm?: boolean; // --confirm flag（一重）
  yes?: boolean; // 跳过 phrase（CI / 测试用）
  json?: boolean;
  // 测试时注入临时路径覆盖
  dbFilePathOverride?: string;
  masterKeyFilePathOverride?: string;
}

export interface UninstallStep {
  step: string;
  status: 'ok' | 'skipped' | 'error';
  detail?: string;
}

export interface UninstallOutcome {
  steps: UninstallStep[];
  aborted: boolean;
}

function defaultDbFilePath(): string | undefined {
  const url = process.env.CCT_DB_URL;
  if (!url) return path.join(os.homedir(), '.cct/db.sqlite');
  // 仅对 file:... 提取路径；其他（mysql/postgres）跳过删除
  const m = /^file:(.+)$/.exec(url.trim());
  return m?.[1];
}

function defaultMasterKeyPath(): string {
  const override = process.env.CCT_MASTER_KEY_PATH;
  return override ? override.replace(/^~(?=$|\/|\\)/, os.homedir()) : path.join(os.homedir(), '.cct/master.key');
}

export async function runUninstall(opts: UninstallOptions): Promise<number> {
  const out: UninstallOutcome = { steps: [], aborted: false };

  // 第一重：必须显式 --confirm
  if (!opts.confirm) {
    out.aborted = true;
    if (opts.json) {
      out.steps.push({
        step: 'confirmation',
        status: 'skipped',
        detail: '--confirm flag missing',
      });
      process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    } else {
      process.stdout.write(
        chalk.yellow(
          'Refusing to uninstall without --confirm. Re-run as `cct-doctor uninstall --confirm`.\n',
        ),
      );
    }
    return 1;
  }

  // 第二重：交互式短语确认（除非 --yes）
  if (!opts.yes) {
    process.stdout.write(
      chalk.red(
        'WARNING: this will remove ALL CCT scheduled entries, the master key, and the local DB file.\n',
      ),
    );
    const answer = await ask(`Type "${FINAL_PHRASE}" to proceed: `);
    if (answer !== FINAL_PHRASE) {
      out.aborted = true;
      out.steps.push({ step: 'confirmation', status: 'skipped', detail: 'phrase mismatch' });
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      } else {
        process.stdout.write(chalk.yellow('Aborted: confirmation phrase did not match.\n'));
      }
      return 1;
    }
  }

  // Step 1: 移除所有调度记录
  try {
    const scheduler = opts.scheduler ?? createScheduler();
    const entries = await scheduler.list();
    let removed = 0;
    let failed = 0;
    for (const e of entries) {
      try {
        await scheduler.remove(e.taskId);
        removed++;
      } catch {
        failed++;
      }
    }
    out.steps.push({
      step: 'scheduler.removeAll',
      status: failed === 0 ? 'ok' : 'error',
      detail: `removed=${removed} failed=${failed}`,
    });
  } catch (e: unknown) {
    out.steps.push({
      step: 'scheduler.removeAll',
      status: 'error',
      detail: (e as Error).message,
    });
  }

  // Step 2: 清除主密钥
  if (process.platform === 'darwin') {
    try {
      await execFile('security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE]);
      out.steps.push({ step: 'keychain.delete', status: 'ok', detail: KEYCHAIN_SERVICE });
    } catch (e: unknown) {
      const stderr = (e as { stderr?: string }).stderr ?? (e as Error).message;
      if (typeof stderr === 'string' && stderr.includes('could not be found')) {
        out.steps.push({
          step: 'keychain.delete',
          status: 'skipped',
          detail: 'no keychain entry',
        });
      } else {
        out.steps.push({ step: 'keychain.delete', status: 'error', detail: stderr });
      }
    }
  } else {
    const keyPath = opts.masterKeyFilePathOverride ?? defaultMasterKeyPath();
    try {
      await fs.unlink(keyPath);
      out.steps.push({ step: 'masterKey.delete', status: 'ok', detail: keyPath });
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        out.steps.push({
          step: 'masterKey.delete',
          status: 'skipped',
          detail: `${keyPath} (not present)`,
        });
      } else {
        out.steps.push({
          step: 'masterKey.delete',
          status: 'error',
          detail: `${keyPath}: ${err.message}`,
        });
      }
    }
  }

  // Step 3: 关闭 prisma + 删除 DB 文件
  try {
    await opts.prisma.$disconnect();
  } catch {
    // 忽略 disconnect 失败，文件删除仍要尝试
  }
  const dbFile = opts.dbFilePathOverride ?? defaultDbFilePath();
  if (!dbFile) {
    out.steps.push({
      step: 'db.delete',
      status: 'skipped',
      detail: 'CCT_DB_URL is not file: scheme; manual cleanup required',
    });
  } else {
    let anyError: string | undefined;
    let anyDeleted = false;
    for (const ext of ['', '-journal', '-wal', '-shm']) {
      const target = dbFile + ext;
      try {
        await fs.unlink(target);
        anyDeleted = true;
      } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException;
        if (err.code !== 'ENOENT') anyError = `${target}: ${err.message}`;
      }
    }
    if (anyError) {
      out.steps.push({ step: 'db.delete', status: 'error', detail: anyError });
    } else {
      out.steps.push({
        step: 'db.delete',
        status: anyDeleted ? 'ok' : 'skipped',
        detail: dbFile,
      });
    }
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    for (const step of out.steps) {
      const color =
        step.status === 'ok' ? chalk.green : step.status === 'skipped' ? chalk.yellow : chalk.red;
      process.stdout.write(
        `${color(`[${step.status.toUpperCase()}]`)} ${step.step}${
          step.detail ? ` — ${step.detail}` : ''
        }\n`,
      );
    }
  }

  const errs = out.steps.filter((s) => s.status === 'error').length;
  return errs > 0 ? 1 : 0;
}
