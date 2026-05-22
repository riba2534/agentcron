import { z } from 'zod';

// 5-field standard cron
const CRON_5_FIELD = /^\s*\S+\s+\S+\s+\S+\s+\S+\s+\S+\s*$/;

export const cronExpression = z
  .string()
  .min(1)
  .regex(CRON_5_FIELD, '需要 5 字段标准 cron，例如 "0 9 * * *"');

export const ianaTimezone = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: '需要合法 IANA 时区，例如 "Asia/Shanghai"' },
  );

export const taskName = z.string().min(1).max(80);

export const taskCreateInput = z.object({
  sessionId: z.string().min(1),
  name: taskName,
  cronExpression,
  timezone: ianaTimezone,
  modelAdapterId: z.string().min(1),
  commandPrompt: z.string().min(1).max(20_000),
  systemPrompt: z.string().max(8_000).optional(),
  workingDirectory: z.string().min(1),
  timeoutMs: z.number().int().min(30_000).max(60 * 60_000).default(900_000),
  maxBudgetUsd: z.number().min(0.01).max(100),
  monthlyBudgetCap: z.number().min(0.01).max(10_000).optional(),
  notifyConfig: z.record(z.unknown()).optional(),
});

export const taskUpdateInput = z.object({
  id: z.string().min(1),
  patch: z
    .object({
      name: taskName.optional(),
      cronExpression: cronExpression.optional(),
      timezone: ianaTimezone.optional(),
      commandPrompt: z.string().min(1).max(20_000).optional(),
      systemPrompt: z.string().max(8_000).optional(),
      workingDirectory: z.string().min(1).optional(),
      timeoutMs: z.number().int().min(30_000).max(60 * 60_000).optional(),
      maxBudgetUsd: z.number().min(0.01).max(100).optional(),
      monthlyBudgetCap: z.number().min(0.01).max(10_000).optional(),
      modelAdapterId: z.string().min(1).optional(),
    })
    .strict(),
});

export const taskListInput = z
  .object({
    status: z.enum(['active', 'archived']).optional(),
    enabled: z.boolean().optional(),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    search: z.string().max(80).optional(),
  })
  .partial();

export const taskSetEnabledInput = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
});

export const taskRunListInput = z.object({
  taskId: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      'pending',
      'running',
      'succeeded',
      'failed',
      'timeout',
      'budget_exceeded',
      'skipped',
    ])
    .optional(),
});

export const taskRunTailLogInput = z.object({
  id: z.string().min(1),
  offset: z.number().int().min(0).default(0),
  lines: z.number().int().min(1).max(2_000).default(500),
});

export const previewCronInput = z.object({
  cronExpression,
  timezone: ianaTimezone,
  count: z.number().int().min(1).max(10).default(5),
});

export type TaskCreateInput = z.infer<typeof taskCreateInput>;
export type TaskUpdateInput = z.infer<typeof taskUpdateInput>;
export type TaskListInput = z.infer<typeof taskListInput>;
export type TaskRunListInput = z.infer<typeof taskRunListInput>;
export type PreviewCronInput = z.infer<typeof previewCronInput>;
