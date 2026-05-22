import { z } from 'zod';
import { prisma } from '@cct/db';
import { CCT, cct } from '@cct/shared';
import { createScheduler, type DoctorReport } from '@cct/scheduler';
import { protectedProcedure, router } from './init';

interface ReconcileReport {
  scheduledMissingInDb: string[];
  dbMissingInScheduler: string[];
  driftCount: number;
  appliedCount: number;
  dryRun: boolean;
}

export const systemRouter = router({
  doctor: protectedProcedure.query(async (): Promise<DoctorReport> => {
    try {
      const scheduler = createScheduler();
      return await scheduler.doctor();
    } catch (e: unknown) {
      throw cct.internal(CCT.DOCTOR_RUN_FAILED, (e as Error).message);
    }
  }),

  reconcile: protectedProcedure
    .input(z.object({ dryRun: z.boolean().default(true) }).default({ dryRun: true }))
    .mutation(async ({ ctx, input }): Promise<ReconcileReport> => {
      const scheduler = createScheduler();
      const [dbTasks, schedEntries] = await Promise.all([
        prisma.task.findMany({
          where: { userId: ctx.userId, status: 'active', enabled: true },
        }),
        scheduler.list(),
      ]);
      const dbIds = new Set(dbTasks.map((t) => t.id));
      const schedIds = new Set(schedEntries.map((e) => e.taskId));
      const dbMissingInScheduler = dbTasks.filter((t) => !schedIds.has(t.id)).map((t) => t.id);
      const scheduledMissingInDb = schedEntries.filter((e) => !dbIds.has(e.taskId)).map((e) => e.taskId);
      let driftCount = 0;
      for (const t of dbTasks) {
        const e = schedEntries.find((x) => x.taskId === t.id);
        if (e && e.cronExpression !== t.cronExpression) driftCount += 1;
      }

      let applied = 0;
      if (!input.dryRun) {
        try {
          for (const t of dbTasks) {
            await scheduler.sync(t);
            applied += 1;
          }
          for (const orphan of scheduledMissingInDb) {
            await scheduler.remove(orphan);
            applied += 1;
          }
        } catch (e: unknown) {
          throw cct.internal(CCT.SCHEDULER_SYNC_FAILED, (e as Error).message);
        }
      }

      return {
        scheduledMissingInDb,
        dbMissingInScheduler,
        driftCount,
        appliedCount: applied,
        dryRun: input.dryRun,
      };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const [taskCount, runCount, costAgg] = await Promise.all([
      prisma.task.count({ where: { userId: ctx.userId, status: 'active' } }),
      prisma.taskRun.count({ where: { task: { userId: ctx.userId } } }),
      prisma.taskRun.aggregate({
        _sum: { costUsd: true },
        where: {
          task: { userId: ctx.userId },
          startedAt: { gte: startOfMonth },
        },
      }),
    ]);
    return {
      taskCount,
      runCount,
      costThisMonth: costAgg._sum.costUsd ?? 0,
    };
  }),
});
