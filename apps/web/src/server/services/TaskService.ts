import { spawn } from 'node:child_process';
import path from 'node:path';
import { prisma, type Task } from '@cct/db';
import { CCT, cct, isValidCron, isValidIanaTimezone, nextFireTimes } from '@cct/shared';
import { sanitizePrompt } from '@cct/prompt-safe';
import { createScheduler } from '@cct/scheduler';
import { AuditLogService } from './AuditLogService';

const scheduler = createScheduler();

export interface TaskListOptions {
  status?: 'active' | 'archived';
  enabled?: boolean;
  cursor?: string;
  limit?: number;
  search?: string;
}

export interface TaskCreateOptions {
  userId: string;
  sessionId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  modelAdapterId: string;
  commandPrompt: string;
  systemPrompt?: string;
  workingDirectory: string;
  timeoutMs: number;
  maxBudgetUsd: number;
  monthlyBudgetCap?: number;
  notifyConfig?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface TaskUpdateOptions {
  userId: string;
  id: string;
  patch: {
    name?: string;
    cronExpression?: string;
    timezone?: string;
    commandPrompt?: string;
    systemPrompt?: string;
    workingDirectory?: string;
    timeoutMs?: number;
    maxBudgetUsd?: number;
    monthlyBudgetCap?: number;
    modelAdapterId?: string;
  };
  ip?: string | null;
  userAgent?: string | null;
}

function validateCronAndTz(cron: string, tz: string): void {
  if (!isValidIanaTimezone(tz)) throw cct.badRequest(CCT.TASK_INVALID_TIMEZONE);
  if (!isValidCron(cron, tz)) throw cct.badRequest(CCT.TASK_INVALID_CRON);
}

async function resolveAdapter(userId: string, modelAdapterId: string): Promise<void> {
  const adapter = await prisma.modelAdapter.findFirst({
    where: { id: modelAdapterId, userId },
  });
  if (!adapter) throw cct.notFound(CCT.MODEL_NOT_FOUND);
  if (!adapter.enabled) {
    throw cct.failedPrecondition(CCT.CLARIFY_MODEL_UNAVAILABLE, { reason: 'disabled' });
  }
}

async function syncOrUnwind(task: Task, op: 'create' | 'update'): Promise<Task> {
  try {
    await scheduler.sync(task);
    return prisma.task.update({
      where: { id: task.id },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    });
  } catch (e: unknown) {
    const message = (e as Error).message ?? 'unknown';
    await prisma.task.update({
      where: { id: task.id },
      data: { lastSyncError: message },
    });
    if (op === 'create') {
      await prisma.task.delete({ where: { id: task.id } });
    }
    throw cct.internal(CCT.SCHEDULER_SYNC_FAILED, message);
  }
}

export const TaskService = {
  async list(userId: string, opts: TaskListOptions): Promise<{ items: Task[]; nextCursor?: string }> {
    const limit = opts.limit ?? 20;
    const where: Record<string, unknown> = { userId };
    if (opts.status) where.status = opts.status;
    if (typeof opts.enabled === 'boolean') where.enabled = opts.enabled;
    if (opts.search && opts.search.trim().length > 0) {
      where.name = { contains: opts.search.trim() };
    }
    const items = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    let nextCursor: string | undefined;
    if (items.length > limit) {
      const overflow = items.pop();
      nextCursor = overflow?.id;
    }
    return { items, nextCursor };
  },

  async get(userId: string, id: string): Promise<Task> {
    const task = await prisma.task.findFirst({ where: { id, userId } });
    if (!task) throw cct.notFound(CCT.TASK_NOT_FOUND);
    return task;
  },

  async create(opts: TaskCreateOptions): Promise<Task> {
    validateCronAndTz(opts.cronExpression, opts.timezone);
    await resolveAdapter(opts.userId, opts.modelAdapterId);

    const session = await prisma.clarificationSession.findFirst({
      where: { id: opts.sessionId, userId: opts.userId },
    });
    if (!session) throw cct.notFound(CCT.CLARIFY_NOT_FOUND);
    if (session.status !== 'completed') {
      throw cct.failedPrecondition(CCT.CLARIFY_NOT_READY);
    }

    const sanitized = sanitizePrompt(opts.commandPrompt);
    if (sanitized.suspicious) {
      throw cct.badRequest(CCT.PROMPT_SUSPICIOUS_INJECTION, {
        matched: sanitized.matchedPatterns.slice(0, 3),
      });
    }

    const dup = await prisma.task.findFirst({
      where: { userId: opts.userId, name: opts.name },
    });
    if (dup) throw cct.conflict(CCT.TASK_DUPLICATE_NAME);

    const specJson = session.finalSpecJson ?? JSON.stringify({
      name: opts.name,
      cronExpression: opts.cronExpression,
      timezone: opts.timezone,
      commandPrompt: opts.commandPrompt,
      systemPrompt: opts.systemPrompt,
      workingDirectory: opts.workingDirectory,
      timeoutMs: opts.timeoutMs,
      maxBudgetUsd: opts.maxBudgetUsd,
      monthlyBudgetCap: opts.monthlyBudgetCap,
      modelAdapterId: opts.modelAdapterId,
    });

    const created = await prisma.task.create({
      data: {
        userId: opts.userId,
        modelAdapterId: opts.modelAdapterId,
        name: opts.name,
        rawInput: session.rawInput,
        commandPrompt: sanitized.sanitized,
        systemPrompt: opts.systemPrompt ?? null,
        workingDirectory: opts.workingDirectory,
        cronExpression: opts.cronExpression,
        timezone: opts.timezone,
        timeoutMs: opts.timeoutMs,
        maxBudgetUsd: opts.maxBudgetUsd,
        monthlyBudgetCap: opts.monthlyBudgetCap ?? null,
        specJson,
        notifyConfigJson: opts.notifyConfig ? JSON.stringify(opts.notifyConfig) : null,
      },
    });

    const synced = await syncOrUnwind(created, 'create');

    await prisma.clarificationSession.update({
      where: { id: session.id },
      data: { createdTaskId: created.id },
    });

    await AuditLogService.log(
      'task.create',
      {
        taskId: created.id,
        name: created.name,
        finalSpecHash: sanitized.hash,
        cronExpression: created.cronExpression,
        modelAdapterId: created.modelAdapterId,
      },
      { userId: opts.userId, taskId: created.id, ip: opts.ip, userAgent: opts.userAgent },
    );

    return synced;
  },

  async update(opts: TaskUpdateOptions): Promise<Task> {
    const existing = await prisma.task.findFirst({
      where: { id: opts.id, userId: opts.userId },
    });
    if (!existing) throw cct.notFound(CCT.TASK_NOT_FOUND);

    const nextCron = opts.patch.cronExpression ?? existing.cronExpression;
    const nextTz = opts.patch.timezone ?? existing.timezone;
    if (opts.patch.cronExpression || opts.patch.timezone) {
      validateCronAndTz(nextCron, nextTz);
    }
    if (opts.patch.modelAdapterId) {
      await resolveAdapter(opts.userId, opts.patch.modelAdapterId);
    }

    if (opts.patch.name && opts.patch.name !== existing.name) {
      const dup = await prisma.task.findFirst({
        where: { userId: opts.userId, name: opts.patch.name, NOT: { id: opts.id } },
      });
      if (dup) throw cct.conflict(CCT.TASK_DUPLICATE_NAME);
    }

    let nextCommandPrompt = existing.commandPrompt;
    let finalSpecHash: string | undefined;
    if (opts.patch.commandPrompt) {
      const sanitized = sanitizePrompt(opts.patch.commandPrompt);
      if (sanitized.suspicious) {
        throw cct.badRequest(CCT.PROMPT_SUSPICIOUS_INJECTION, {
          matched: sanitized.matchedPatterns.slice(0, 3),
        });
      }
      nextCommandPrompt = sanitized.sanitized;
      finalSpecHash = sanitized.hash;
    }

    const updated = await prisma.task.update({
      where: { id: opts.id },
      data: {
        ...(opts.patch.name ? { name: opts.patch.name } : {}),
        ...(opts.patch.cronExpression ? { cronExpression: opts.patch.cronExpression } : {}),
        ...(opts.patch.timezone ? { timezone: opts.patch.timezone } : {}),
        ...(opts.patch.systemPrompt !== undefined
          ? { systemPrompt: opts.patch.systemPrompt }
          : {}),
        ...(opts.patch.workingDirectory ? { workingDirectory: opts.patch.workingDirectory } : {}),
        ...(opts.patch.timeoutMs ? { timeoutMs: opts.patch.timeoutMs } : {}),
        ...(typeof opts.patch.maxBudgetUsd === 'number'
          ? { maxBudgetUsd: opts.patch.maxBudgetUsd }
          : {}),
        ...(typeof opts.patch.monthlyBudgetCap === 'number'
          ? { monthlyBudgetCap: opts.patch.monthlyBudgetCap }
          : {}),
        ...(opts.patch.modelAdapterId ? { modelAdapterId: opts.patch.modelAdapterId } : {}),
        ...(opts.patch.commandPrompt ? { commandPrompt: nextCommandPrompt } : {}),
      },
    });

    const synced = await syncOrUnwind(updated, 'update');

    await AuditLogService.log(
      'task.update',
      {
        taskId: updated.id,
        patchKeys: Object.keys(opts.patch),
        finalSpecHash,
      },
      { userId: opts.userId, taskId: updated.id, ip: opts.ip, userAgent: opts.userAgent },
    );

    return synced;
  },

  async setEnabled(
    userId: string,
    id: string,
    enabled: boolean,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<Task> {
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) throw cct.notFound(CCT.TASK_NOT_FOUND);
    const updated = await prisma.task.update({
      where: { id },
      data: { enabled },
    });
    const synced = await syncOrUnwind(updated, 'update');
    await AuditLogService.log(
      'task.setEnabled',
      { taskId: id, enabled },
      { userId, taskId: id, ip: ctx?.ip, userAgent: ctx?.userAgent },
    );
    return synced;
  },

  async archive(
    userId: string,
    id: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<void> {
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) throw cct.notFound(CCT.TASK_NOT_FOUND);
    await prisma.task.update({
      where: { id },
      data: { status: 'archived', enabled: false },
    });
    try {
      await scheduler.remove(id);
    } catch (e: unknown) {
      throw cct.internal(CCT.SCHEDULER_SYNC_FAILED, (e as Error).message);
    }
    await AuditLogService.log(
      'task.archive',
      { taskId: id },
      { userId, taskId: id, ip: ctx?.ip, userAgent: ctx?.userAgent },
    );
  },

  async delete(
    userId: string,
    id: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<void> {
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) throw cct.notFound(CCT.TASK_NOT_FOUND);
    try {
      await scheduler.remove(id);
    } catch {
      // ignore — DB delete 仍要继续
    }
    await prisma.task.delete({ where: { id } });
    await AuditLogService.log(
      'task.delete',
      { taskId: id },
      { userId, taskId: id, ip: ctx?.ip, userAgent: ctx?.userAgent },
    );
  },

  async runNow(
    userId: string,
    id: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<{ runId: string }> {
    const task = await prisma.task.findFirst({ where: { id, userId } });
    if (!task) throw cct.notFound(CCT.TASK_NOT_FOUND);
    if (task.status === 'archived') throw cct.failedPrecondition(CCT.TASK_ARCHIVED);
    if (!task.enabled) throw cct.failedPrecondition(CCT.TASK_DISABLED);

    const run = await prisma.taskRun.create({
      data: { taskId: task.id, status: 'pending', triggerSource: 'manual' },
    });

    const runnerBin = process.env.CCT_RUNNER_BIN;
    let bin: string;
    let args: string[];
    if (runnerBin && runnerBin.length > 0) {
      bin = runnerBin;
      args = ['--task-id', task.id, '--manual', '--run-id', run.id];
    } else {
      bin = process.execPath;
      const fallback = path.resolve(process.cwd(), 'apps/runner/dist/index');
      args = [fallback, '--task-id', task.id, '--manual', '--run-id', run.id];
    }

    try {
      const child = spawn(bin, args, {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          CCT_DB_URL: process.env.CCT_DB_URL,
          PATH: process.env.PATH,
        },
      });
      child.unref();
    } catch (e: unknown) {
      await prisma.taskRun.update({
        where: { id: run.id },
        data: { status: 'failed', endedAt: new Date(), stderrDigest: (e as Error).message },
      });
      throw cct.internal(CCT.RUNNER_SPAWN_FAILED, (e as Error).message);
    }

    await AuditLogService.log(
      'task.run.manual',
      { taskId: task.id, runId: run.id },
      { userId, taskId: task.id, ip: ctx?.ip, userAgent: ctx?.userAgent },
    );

    return { runId: run.id };
  },

  previewCron(cronExpression: string, timezone: string, count: number): string[] {
    return nextFireTimes(cronExpression, timezone, count);
  },
};
