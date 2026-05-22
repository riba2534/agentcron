import type { PrismaClient, Task } from '@cct/db';

// 月度预算守门。
// Source of truth: design/05-backend.md §6.6
//
// 规则：
//  - monthlyBudgetCap 未设置 → 永远 false
//  - 当月（按 UTC 月初）已记账的 cost 累计 >= cap → true
//  - 仅累计 succeeded / failed / timeout / budget_exceeded 状态（这些都"已发生消耗"）
//    pending / running / skipped 不计入

export async function isMonthlyBudgetExceeded(
  prisma: PrismaClient,
  task: Pick<Task, 'id' | 'monthlyBudgetCap'>,
  now: Date = new Date(),
): Promise<boolean> {
  if (task.monthlyBudgetCap == null) return false;

  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );

  const agg = await prisma.taskRun.aggregate({
    _sum: { costUsd: true },
    where: {
      taskId: task.id,
      startedAt: { gte: startOfMonth },
      status: { in: ['succeeded', 'failed', 'timeout', 'budget_exceeded'] },
    },
  });

  const spent = agg._sum.costUsd ?? 0;
  return spent >= task.monthlyBudgetCap;
}
