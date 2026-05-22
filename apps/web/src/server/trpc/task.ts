import { z } from 'zod';
import { taskZod } from '@cct/shared';
import { protectedProcedure, router } from './init';
import { TaskService } from '../services/TaskService';
import { taskDto } from '../dto/index';

const taskGetInput = z.object({ id: z.string().min(1) });
const taskDeleteInput = z.object({ id: z.string().min(1) });
const taskRunNowInput = z.object({ id: z.string().min(1) });
const taskArchiveInput = z.object({ id: z.string().min(1) });

export const taskRouter = router({
  list: protectedProcedure
    .input(taskZod.taskListInput)
    .query(async ({ ctx, input }) => {
      const result = await TaskService.list(ctx.userId, {
        status: input.status,
        enabled: input.enabled,
        cursor: input.cursor,
        limit: input.limit,
        search: input.search,
      });
      return {
        items: result.items.map(taskDto),
        nextCursor: result.nextCursor,
      };
    }),

  get: protectedProcedure
    .input(taskGetInput)
    .query(async ({ ctx, input }) => {
      const t = await TaskService.get(ctx.userId, input.id);
      return taskDto(t);
    }),

  create: protectedProcedure
    .input(taskZod.taskCreateInput)
    .mutation(async ({ ctx, input }) => {
      const t = await TaskService.create({
        userId: ctx.userId,
        sessionId: input.sessionId,
        name: input.name,
        cronExpression: input.cronExpression,
        timezone: input.timezone,
        modelAdapterId: input.modelAdapterId,
        commandPrompt: input.commandPrompt,
        systemPrompt: input.systemPrompt,
        workingDirectory: input.workingDirectory,
        timeoutMs: input.timeoutMs,
        maxBudgetUsd: input.maxBudgetUsd,
        monthlyBudgetCap: input.monthlyBudgetCap,
        notifyConfig: input.notifyConfig,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return taskDto(t);
    }),

  update: protectedProcedure
    .input(taskZod.taskUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const t = await TaskService.update({
        userId: ctx.userId,
        id: input.id,
        patch: input.patch,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return taskDto(t);
    }),

  setEnabled: protectedProcedure
    .input(taskZod.taskSetEnabledInput)
    .mutation(async ({ ctx, input }) => {
      const t = await TaskService.setEnabled(ctx.userId, input.id, input.enabled, {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return taskDto(t);
    }),

  archive: protectedProcedure
    .input(taskArchiveInput)
    .mutation(async ({ ctx, input }) => {
      await TaskService.archive(ctx.userId, input.id, {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(taskDeleteInput)
    .mutation(async ({ ctx, input }) => {
      await TaskService.delete(ctx.userId, input.id, {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { ok: true };
    }),

  runNow: protectedProcedure
    .input(taskRunNowInput)
    .mutation(async ({ ctx, input }) => {
      return TaskService.runNow(ctx.userId, input.id, {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }),

  previewCron: protectedProcedure
    .input(taskZod.previewCronInput)
    .query(({ input }) => ({
      nextFireTimes: TaskService.previewCron(input.cronExpression, input.timezone, input.count),
    })),
});
