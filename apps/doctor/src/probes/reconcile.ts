// reconcile probe — 比较 Scheduler.list() 与 prisma.task.findMany 的 active+enabled 集。
// 仅做对账，不做修复（修复在 commands/reconcile.ts）。
// Source of truth: design/05-backend.md §7.
import type { PrismaClient } from '@cct/db';
import { createScheduler } from '@cct/scheduler';
import type { ScheduledEntry, Scheduler } from '@cct/scheduler';
import type { ProbeResult } from '../types.js';

const PROBE_NAME = 'reconcile';

export interface ReconcileProbeOptions {
  scheduler?: Scheduler;
  prisma?: PrismaClient;
}

export interface ReconcileSummary {
  managedEntries: number;
  activeTasks: number;
  orphanTaskIds: string[];        // DB 有 (active+enabled) 但调度器无
  ghostIdentifiers: string[];     // 调度器有但 DB 无
}

export async function computeReconcileDiff(
  scheduler: Scheduler,
  prisma: PrismaClient,
): Promise<ReconcileSummary> {
  const [entries, tasks] = await Promise.all([
    scheduler.list(),
    prisma.task.findMany({
      where: { status: 'active', enabled: true },
      select: { id: true },
    }),
  ]);
  const entryIds = new Set(entries.map((e: ScheduledEntry) => e.taskId));
  const taskIds = new Set(tasks.map((t) => t.id));
  const orphanTaskIds: string[] = [];
  const ghostIdentifiers: string[] = [];
  for (const id of taskIds) if (!entryIds.has(id)) orphanTaskIds.push(id);
  for (const id of entryIds) if (!taskIds.has(id)) ghostIdentifiers.push(id);
  return {
    managedEntries: entries.length,
    activeTasks: tasks.length,
    orphanTaskIds,
    ghostIdentifiers,
  };
}

export async function probeReconcile(opts: ReconcileProbeOptions = {}): Promise<ProbeResult> {
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
  if (!opts.prisma) {
    return {
      name: PROBE_NAME,
      level: 'error',
      message: 'Prisma client unavailable for reconcile probe.',
    };
  }
  let summary: ReconcileSummary;
  try {
    summary = await computeReconcileDiff(scheduler, opts.prisma);
  } catch (e: unknown) {
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `reconcile diff failed: ${(e as Error).message}`,
    };
  }
  const driftCount = summary.orphanTaskIds.length + summary.ghostIdentifiers.length;
  const message =
    `managed=${summary.managedEntries} activeTasks=${summary.activeTasks} ` +
    `orphans=${summary.orphanTaskIds.length} ghosts=${summary.ghostIdentifiers.length}`;
  if (driftCount === 0) {
    return { name: PROBE_NAME, level: 'ok', message, details: summary };
  }
  return {
    name: PROBE_NAME,
    level: 'warn',
    message,
    remediation: 'Run `cct-doctor reconcile` to fix orphans/ghosts.',
    details: summary,
  };
}
