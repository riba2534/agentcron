import { CCT, cct } from '@cct/shared';
import { CrontabScheduler } from './crontab/CrontabScheduler.js';
import { LaunchdScheduler } from './launchd/LaunchdScheduler.js';
import type { Scheduler } from './types.js';

export type {
  Scheduler,
  ScheduledEntry,
  DoctorReport,
  DoctorIssue,
  DriftEntry,
  GhostEntry,
  OrphanedEntry,
  DoctorPermissions,
  SchedulerConfig,
} from './types.js';
export { LaunchdScheduler, CrontabScheduler };

let cached: Scheduler | null = null;

export function createScheduler(): Scheduler {
  if (cached) return cached;
  if (process.platform === 'darwin') {
    cached = new LaunchdScheduler();
    return cached;
  }
  if (process.platform === 'linux') {
    cached = new CrontabScheduler();
    return cached;
  }
  throw cct.failedPrecondition(CCT.SCHEDULER_UNSUPPORTED_PLATFORM, {
    platform: process.platform,
  });
}
