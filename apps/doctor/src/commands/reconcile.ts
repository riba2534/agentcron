// reconcile — 把 Scheduler 与 DB(active+enabled) 一致化。
// Source of truth: design/05-backend.md §7 reconcile 子命令。
import type { PrismaClient } from '@cct/db';
import { createScheduler } from '@cct/scheduler';
import type { Scheduler } from '@cct/scheduler';
import chalk from 'chalk';
import { computeReconcileDiff } from '../probes/reconcile.js';
import { confirmYesNo } from '../prompt.js';

export interface ReconcileOptions {
  prisma: PrismaClient;
  scheduler?: Scheduler;
  yes?: boolean; // 跳过交互式确认（CI 用）
  json?: boolean;
}

export interface ReconcileOutcome {
  scanned: { managedEntries: number; activeTasks: number };
  orphans: Array<{ taskId: string; action: 'synced' | 'failed' | 'skipped'; error?: string }>;
  ghosts: Array<{ identifier: string; action: 'removed' | 'failed' | 'skipped'; error?: string }>;
}

function jsonOut(o: ReconcileOutcome): void {
  process.stdout.write(`${JSON.stringify(o, null, 2)}\n`);
}

export async function runReconcile(opts: ReconcileOptions): Promise<number> {
  const scheduler = opts.scheduler ?? createScheduler();
  const diff = await computeReconcileDiff(scheduler, opts.prisma);

  const outcome: ReconcileOutcome = {
    scanned: { managedEntries: diff.managedEntries, activeTasks: diff.activeTasks },
    orphans: [],
    ghosts: [],
  };

  if (diff.orphanTaskIds.length === 0 && diff.ghostIdentifiers.length === 0) {
    if (opts.json) {
      jsonOut(outcome);
    } else {
      process.stdout.write(
        chalk.green(
          `Nothing to reconcile. managed=${diff.managedEntries} activeTasks=${diff.activeTasks}\n`,
        ),
      );
    }
    return 0;
  }

  if (!opts.json) {
    process.stdout.write(
      `Found ${diff.orphanTaskIds.length} orphan(s) and ${diff.ghostIdentifiers.length} ghost(s).\n`,
    );
    if (diff.orphanTaskIds.length > 0) {
      process.stdout.write(`  Orphan tasks (in DB but no scheduler entry):\n`);
      for (const id of diff.orphanTaskIds) process.stdout.write(`    - ${id}\n`);
    }
    if (diff.ghostIdentifiers.length > 0) {
      process.stdout.write(`  Ghost entries (in scheduler but not in DB):\n`);
      for (const id of diff.ghostIdentifiers) process.stdout.write(`    - ${id}\n`);
    }
    process.stdout.write('\n');
  }

  let proceed = opts.yes === true;
  if (!proceed) {
    proceed = await confirmYesNo('Sync orphans (re-create scheduler entries) and remove ghosts?');
  }
  if (!proceed) {
    if (opts.json) {
      // 标记跳过
      for (const id of diff.orphanTaskIds) outcome.orphans.push({ taskId: id, action: 'skipped' });
      for (const id of diff.ghostIdentifiers)
        outcome.ghosts.push({ identifier: id, action: 'skipped' });
      jsonOut(outcome);
    } else {
      process.stdout.write(chalk.yellow('Aborted by user.\n'));
    }
    return 0;
  }

  // Sync orphans → 重新写入调度记录
  for (const taskId of diff.orphanTaskIds) {
    const task = await opts.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      outcome.orphans.push({ taskId, action: 'skipped', error: 'task vanished mid-reconcile' });
      continue;
    }
    try {
      await scheduler.sync(task);
      outcome.orphans.push({ taskId, action: 'synced' });
    } catch (e: unknown) {
      outcome.orphans.push({ taskId, action: 'failed', error: (e as Error).message });
    }
  }
  // Remove ghosts → 从调度器删除
  for (const identifier of diff.ghostIdentifiers) {
    try {
      await scheduler.remove(identifier);
      outcome.ghosts.push({ identifier, action: 'removed' });
    } catch (e: unknown) {
      outcome.ghosts.push({ identifier, action: 'failed', error: (e as Error).message });
    }
  }

  if (opts.json) {
    jsonOut(outcome);
  } else {
    const failed =
      outcome.orphans.filter((o) => o.action === 'failed').length +
      outcome.ghosts.filter((g) => g.action === 'failed').length;
    process.stdout.write(
      `Synced ${outcome.orphans.filter((o) => o.action === 'synced').length} orphan(s); ` +
        `removed ${outcome.ghosts.filter((g) => g.action === 'removed').length} ghost(s)` +
        (failed > 0 ? chalk.red(`; ${failed} failure(s).`) : '.') +
        '\n',
    );
    for (const o of outcome.orphans) {
      if (o.action === 'failed') {
        process.stdout.write(chalk.red(`  orphan ${o.taskId}: ${o.error}\n`));
      }
    }
    for (const g of outcome.ghosts) {
      if (g.action === 'failed') {
        process.stdout.write(chalk.red(`  ghost ${g.identifier}: ${g.error}\n`));
      }
    }
  }

  const failedCount =
    outcome.orphans.filter((o) => o.action === 'failed').length +
    outcome.ghosts.filter((g) => g.action === 'failed').length;
  return failedCount > 0 ? 1 : 0;
}
