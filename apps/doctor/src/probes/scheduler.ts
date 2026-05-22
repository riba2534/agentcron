// scheduler probe — 转发 createScheduler().doctor()，并把 issues 转成 ProbeResult.level。
// Source of truth: design/05-backend.md §5.3 + §7.
import { createScheduler } from '@cct/scheduler';
import type { DoctorReport, Scheduler } from '@cct/scheduler';
import type { PrismaClient } from '@cct/db';
import type { ProbeResult } from '../types.js';

const PROBE_NAME = 'scheduler';

export interface SchedulerProbeOptions {
  scheduler?: Scheduler;
  prisma?: PrismaClient;
}

export async function probeScheduler(opts: SchedulerProbeOptions = {}): Promise<ProbeResult> {
  let scheduler: Scheduler;
  try {
    scheduler = opts.scheduler ?? createScheduler();
  } catch (e: unknown) {
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `Cannot bootstrap scheduler: ${(e as Error).message}`,
    };
  }

  let knownTaskIds: string[] = [];
  if (opts.prisma) {
    try {
      const tasks = await opts.prisma.task.findMany({
        where: { status: 'active', enabled: true },
        select: { id: true },
      });
      knownTaskIds = tasks.map((t) => t.id);
    } catch {
      // 不致命，让下游 dbReachable probe 报告
    }
  }

  let report: DoctorReport;
  try {
    // doctor() 接受可选的 knownTaskIds（LaunchdScheduler/CrontabScheduler 都接受 string[]）
    // 必须保留 this 绑定，否则 LaunchdScheduler.doctor 内部访问 this.listManagedFiles 会失败。
    type DoctorFn = (this: Scheduler, ids?: string[]) => Promise<DoctorReport>;
    const docFn = scheduler.doctor as unknown as DoctorFn;
    report = await docFn.call(scheduler, knownTaskIds);
  } catch (e: unknown) {
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `scheduler.doctor() failed: ${(e as Error).message}`,
    };
  }

  const errCount = report.issues.filter((i) => i.level === 'error').length;
  const warnCount = report.issues.filter((i) => i.level === 'warn').length;
  const orphanCount = report.orphanedEntries.length;
  const ghostCount = report.ghostEntries.length;
  const driftCount = report.driftEntries.length;

  const summary =
    `${report.scheduler} reachable=${report.reachable} ` +
    `managed=${report.managedEntries} orphans=${orphanCount} ` +
    `ghosts=${ghostCount} drift=${driftCount}`;

  if (errCount > 0 || !report.reachable) {
    const firstError = report.issues.find((i) => i.level === 'error');
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `${summary}; first error: ${firstError?.code ?? 'unknown'} ${firstError?.message ?? ''}`.trim(),
      remediation:
        firstError?.remediation ??
        'Run `cct-doctor reconcile` to resolve orphan/ghost entries.',
      details: report,
    };
  }
  if (warnCount > 0 || orphanCount > 0 || ghostCount > 0 || driftCount > 0) {
    return {
      name: PROBE_NAME,
      level: 'warn',
      message: summary,
      remediation:
        orphanCount + ghostCount + driftCount > 0
          ? 'Run `cct-doctor reconcile` to resolve drift.'
          : undefined,
      details: report,
    };
  }
  return {
    name: PROBE_NAME,
    level: 'ok',
    message: summary,
    details: report,
  };
}
