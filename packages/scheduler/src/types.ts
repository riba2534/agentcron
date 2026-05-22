import type { Task } from '@cct/db';

// ── 调度记录抽象 ──────────────────────────────────────────────
// Source of truth: design/02-architecture.md §5
export interface ScheduledEntry {
  taskId: string;
  cronExpression: string;
  command: string;
  enabled: boolean;
}

// ── DoctorReport（design/05-backend.md §5.3 完整字段）─────────
export type DoctorIssueLevel = 'warn' | 'error';

export interface DoctorIssue {
  level: DoctorIssueLevel;
  code: string;
  message: string;
  remediation?: string;
}

export interface OrphanedEntry {
  taskId: string;
  reason: 'plist_missing' | 'not_loaded' | 'crontab_missing';
}

export interface GhostEntry {
  identifier: string;
  source: 'plist' | 'crontab_line';
}

export interface DriftEntry {
  taskId: string;
  expected: string;
  actual: string;
}

export interface DoctorPermissions {
  fullDiskAccess?: 'granted' | 'denied' | 'unknown';
  runnerBinExecutable: boolean;
  logDirWritable: boolean;
  keychainAccessible?: boolean;
}

export interface DoctorReport {
  scheduler: 'launchd' | 'crontab';
  reachable: boolean;
  managedEntries: number;
  orphanedEntries: OrphanedEntry[];
  ghostEntries: GhostEntry[];
  driftEntries: DriftEntry[];
  permissions: DoctorPermissions;
  issues: DoctorIssue[];
  generatedAt: string;
}

// ── Scheduler 接口 ───────────────────────────────────────────
export interface Scheduler {
  readonly platform: 'launchd' | 'crontab';
  sync(task: Task): Promise<void>;
  remove(taskId: string): Promise<void>;
  list(): Promise<ScheduledEntry[]>;
  doctor(): Promise<DoctorReport>;
}

export interface SchedulerConfig {
  runnerBinPath: string;
  logDir: string;
  dbUrl: string;
  homeDir: string;
}
