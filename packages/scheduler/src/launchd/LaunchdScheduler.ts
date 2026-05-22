import { execFile } from 'node:child_process';
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

import { cronToCalendarIntervals } from './cronToCalendar.js';
import {
  PLIST_LABEL_PREFIX,
  plistFileNameFor,
  plistLabelFor,
  renderPlist,
} from './plistTemplate.js';

const execFileAsync = promisify(execFile);

const defaultLaunchAgentsDir = () =>
  process.env.LAUNCH_AGENTS_DIR ?? path.join(os.homedir(), 'Library/LaunchAgents');

const defaultRunnerBinPath = () =>
  process.env.CCT_RUNNER_BIN ?? '/usr/local/bin/cct-runner';

const defaultLogDir = () =>
  process.env.CCT_LOG_DIR ?? path.join(os.homedir(), 'Library/Logs/cct');

const defaultDbUrl = () =>
  process.env.CCT_DB_URL ?? `file:${path.join(os.homedir(), '.cct/db.sqlite')}`;

const TASK_ID_FROM_FILENAME =
  /^com\.cct\.task\.(?<taskId>[A-Za-z0-9_-]+)\.plist$/;

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runLaunchctl(args: string[]): Promise<ExecResult> {
  const bin = process.env.CCT_LAUNCHCTL_BIN ?? 'launchctl';
  try {
    const { stdout, stderr } = await execFileAsync(bin, args);
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

function getUid(): number {
  return process.getuid?.() ?? 501;
}

export class LaunchdScheduler implements Scheduler {
  readonly platform = 'launchd' as const;
  private readonly cfg: SchedulerConfig;

  constructor(cfg?: Partial<SchedulerConfig>) {
    this.cfg = {
      runnerBinPath: cfg?.runnerBinPath ?? defaultRunnerBinPath(),
      logDir: cfg?.logDir ?? defaultLogDir(),
      dbUrl: cfg?.dbUrl ?? defaultDbUrl(),
      homeDir: cfg?.homeDir ?? os.homedir(),
    };
  }

  private get launchAgentsDir(): string {
    return defaultLaunchAgentsDir();
  }

  private plistPath(taskId: string): string {
    return path.join(this.launchAgentsDir, plistFileNameFor(taskId));
  }

  async sync(task: Task): Promise<void> {
    await fs.mkdir(this.launchAgentsDir, { recursive: true });
    await fs.mkdir(this.cfg.logDir, { recursive: true }).catch(() => {});

    const calendarIntervals = cronToCalendarIntervals(task.cronExpression, task.timezone);
    const xml = renderPlist({
      taskId: task.id,
      runnerBinPath: this.cfg.runnerBinPath,
      calendarIntervals,
      home: this.cfg.homeDir,
      dbUrl: this.cfg.dbUrl,
      logDir: this.cfg.logDir,
    });

    const dest = this.plistPath(task.id);
    const tmp = `${dest}.tmp.${process.pid}`;
    await fs.writeFile(tmp, xml, { mode: 0o644 });
    await fs.rename(tmp, dest);

    const uid = getUid();
    const label = plistLabelFor(task.id);
    await runLaunchctl(['bootout', `gui/${uid}/${label}`]);

    const shouldLoad = task.enabled && task.status === 'active';
    if (shouldLoad) {
      const r = await runLaunchctl(['bootstrap', `gui/${uid}`, dest]);
      if (r.code !== 0) {
        throw cct.internal(CCT.SCHEDULER_BOOTSTRAP_FAILED, {
          taskId: task.id,
          stderr: r.stderr,
          code: r.code,
        });
      }
    }
  }

  async remove(taskId: string): Promise<void> {
    const dest = this.plistPath(taskId);
    const uid = getUid();
    await runLaunchctl(['bootout', `gui/${uid}/${plistLabelFor(taskId)}`]);
    await fs.unlink(dest).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }

  async list(): Promise<ScheduledEntry[]> {
    const files = await this.listManagedFiles();
    const out: ScheduledEntry[] = [];
    for (const file of files) {
      const m = TASK_ID_FROM_FILENAME.exec(path.basename(file));
      if (!m?.groups?.taskId) continue;
      out.push({
        taskId: m.groups.taskId,
        cronExpression: '',
        command: this.cfg.runnerBinPath,
        enabled: await this.isLoaded(m.groups.taskId),
      });
    }
    return out;
  }

  private async listManagedFiles(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.launchAgentsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    return entries.filter((f) => f.startsWith(PLIST_LABEL_PREFIX) && f.endsWith('.plist'));
  }

  private async isLoaded(taskId: string): Promise<boolean> {
    const r = await runLaunchctl(['print', `gui/${getUid()}/${plistLabelFor(taskId)}`]);
    return r.code === 0;
  }

  async doctor(knownTaskIds: string[] = []): Promise<DoctorReport> {
    const issues: DoctorIssue[] = [];
    const orphaned: OrphanedEntry[] = [];
    const ghosts: GhostEntry[] = [];
    const drift: DriftEntry[] = [];

    const files = await this.listManagedFiles().catch((err) => {
      issues.push({
        level: 'error',
        code: 'CCT_DOCTOR_LAUNCH_AGENTS_UNREADABLE',
        message: `Cannot read ${this.launchAgentsDir}: ${(err as Error).message}`,
      });
      return [] as string[];
    });

    const fileTaskIds = new Set<string>();
    for (const f of files) {
      const m = TASK_ID_FROM_FILENAME.exec(f);
      if (m?.groups?.taskId) fileTaskIds.add(m.groups.taskId);
    }

    const known = new Set(knownTaskIds);
    for (const taskId of fileTaskIds) {
      if (!known.has(taskId)) {
        ghosts.push({ identifier: plistLabelFor(taskId), source: 'plist' });
      }
    }
    for (const taskId of known) {
      if (!fileTaskIds.has(taskId)) {
        orphaned.push({ taskId, reason: 'plist_missing' });
        continue;
      }
      if (!(await this.isLoaded(taskId))) {
        orphaned.push({ taskId, reason: 'not_loaded' });
      }
    }

    const permissions: DoctorPermissions = {
      runnerBinExecutable: existsSync(this.cfg.runnerBinPath),
      logDirWritable: await canWrite(this.cfg.logDir),
      fullDiskAccess: 'unknown',
      keychainAccessible: undefined,
    };

    if (!permissions.runnerBinExecutable) {
      issues.push({
        level: 'error',
        code: 'CCT_DOCTOR_RUNNER_MISSING',
        message: `Runner binary not found at ${this.cfg.runnerBinPath}`,
        remediation: 'pnpm --filter @cct/runner build && link the bin into PATH',
      });
    }

    return {
      scheduler: 'launchd',
      reachable: true,
      managedEntries: fileTaskIds.size,
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
