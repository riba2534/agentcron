import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { Task } from '@cct/db';
import { CCT, cct } from '@cct/shared';

import type {
  DoctorIssue,
  DoctorPermissions,
  DoctorReport,
  DriftEntry,
  GhostEntry,
  OrphanedEntry,
  ScheduledEntry,
  Scheduler,
  SchedulerConfig,
} from '../types.js';

import { acquireCrontabLock } from './lockManager.js';
import {
  type CrontabEntryLine,
  parseManagedSection,
  spliceManagedSection,
} from './sectionMarker.js';

const execFileAsync = promisify(execFile);

const defaultRunnerBinPath = () =>
  process.env.CCT_RUNNER_BIN ?? '/usr/local/bin/cct-runner';

const defaultLogDir = () =>
  process.env.CCT_LOG_DIR ?? path.join(os.homedir(), '.local/share/cct/logs');

const defaultDbUrl = () =>
  process.env.CCT_DB_URL ?? `file:${path.join(os.homedir(), '.cct/db.sqlite')}`;

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCrontab(args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('crontab', args);
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? '',
      code: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

async function readCurrentCrontab(): Promise<string> {
  const r = await runCrontab(['-l']);
  if (r.code !== 0) {
    if (/no crontab/i.test(r.stderr)) return '';
    return '';
  }
  return r.stdout;
}

export class CrontabScheduler implements Scheduler {
  readonly platform = 'crontab' as const;
  private readonly cfg: SchedulerConfig;

  constructor(cfg?: Partial<SchedulerConfig>) {
    this.cfg = {
      runnerBinPath: cfg?.runnerBinPath ?? defaultRunnerBinPath(),
      logDir: cfg?.logDir ?? defaultLogDir(),
      dbUrl: cfg?.dbUrl ?? defaultDbUrl(),
      homeDir: cfg?.homeDir ?? os.homedir(),
    };
  }

  private buildCommandLine(taskId: string): string {
    const logFile = path.join(this.cfg.logDir, `${taskId}.log`);
    return `${this.cfg.runnerBinPath} --task-id ${taskId} >> ${logFile} 2>&1`;
  }

  async sync(task: Task): Promise<void> {
    await fs.mkdir(this.cfg.logDir, { recursive: true }).catch(() => {});

    const release = await acquireCrontabLock();
    try {
      const current = await readCurrentCrontab();
      const existing = parseManagedSection(current);
      const filtered = existing.filter((e) => e.taskId !== task.id);
      if (task.enabled && task.status === 'active') {
        filtered.push({
          taskId: task.id,
          cronExpression: task.cronExpression,
          command: this.buildCommandLine(task.id),
          enabled: true,
        });
      }
      filtered.sort((a, b) => a.taskId.localeCompare(b.taskId));
      await this.writeCrontab(current, filtered);
    } finally {
      await release();
    }
  }

  async remove(taskId: string): Promise<void> {
    const release = await acquireCrontabLock();
    try {
      const current = await readCurrentCrontab();
      const existing = parseManagedSection(current);
      const filtered = existing.filter((e) => e.taskId !== taskId);
      await this.writeCrontab(current, filtered);
    } finally {
      await release();
    }
  }

  private async writeCrontab(current: string, entries: CrontabEntryLine[]): Promise<void> {
    const next = spliceManagedSection(current, entries);
    const tmp = path.join(os.tmpdir(), `cct-${randomUUID()}.crontab`);
    try {
      await fs.writeFile(tmp, next, { mode: 0o600 });
      const r = await runCrontab([tmp]);
      if (r.code !== 0) {
        throw cct.internal(CCT.SCHEDULER_CRONTAB_WRITE_FAILED, {
          stderr: r.stderr,
          code: r.code,
        });
      }
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  }

  async list(): Promise<ScheduledEntry[]> {
    const current = await readCurrentCrontab();
    const entries = parseManagedSection(current);
    return entries.map((e) => ({
      taskId: e.taskId,
      cronExpression: e.cronExpression,
      command: e.command,
      enabled: true,
    }));
  }

  async doctor(knownTaskIds: string[] = []): Promise<DoctorReport> {
    const issues: DoctorIssue[] = [];
    const orphaned: OrphanedEntry[] = [];
    const ghosts: GhostEntry[] = [];
    const drift: DriftEntry[] = [];

    const r = await runCrontab(['-l']);
    let reachable = true;
    let entries: CrontabEntryLine[] = [];
    if (r.code !== 0 && !/no crontab/i.test(r.stderr)) {
      reachable = false;
      issues.push({
        level: 'error',
        code: 'CCT_DOCTOR_CRONTAB_UNREADABLE',
        message: r.stderr,
      });
    } else {
      entries = parseManagedSection(r.stdout);
    }

    const known = new Set(knownTaskIds);
    const seen = new Set<string>();
    for (const e of entries) {
      seen.add(e.taskId);
      if (!known.has(e.taskId)) {
        ghosts.push({ identifier: e.taskId, source: 'crontab_line' });
      }
    }
    for (const taskId of known) {
      if (!seen.has(taskId)) {
        orphaned.push({ taskId, reason: 'crontab_missing' });
      }
    }

    const permissions: DoctorPermissions = {
      runnerBinExecutable: existsSync(this.cfg.runnerBinPath),
      logDirWritable: await canWrite(this.cfg.logDir),
    };

    if (!permissions.runnerBinExecutable) {
      issues.push({
        level: 'error',
        code: 'CCT_DOCTOR_RUNNER_MISSING',
        message: `Runner binary not found at ${this.cfg.runnerBinPath}`,
      });
    }

    return {
      scheduler: 'crontab',
      reachable,
      managedEntries: entries.length,
      orphanedEntries: orphaned,
      ghostEntries: ghosts,
      driftEntries: drift,
      permissions,
      issues,
      generatedAt: new Date().toISOString(),
    };
  }
}

async function canWrite(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
