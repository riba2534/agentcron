import { z } from 'zod';

export const clarifyStartInput = z.object({
  rawInput: z.string().min(2).max(4_000),
  modelAdapterId: z.string().min(1),
});

export const clarifyRespondInput = z.object({
  sessionId: z.string().min(1),
  userMessage: z.string().min(1).max(4_000),
});

export const clarifyConfirmInput = z.object({
  sessionId: z.string().min(1),
  finalSpec: z
    .object({
      name: z.string().min(1).max(80),
      cronExpression: z.string().min(1),
      timezone: z.string().min(1),
      commandPrompt: z.string().min(1),
      systemPrompt: z.string().optional(),
      workingDirectory: z.string().min(1),
      timeoutMs: z.number().int().min(30_000).max(60 * 60_000),
      maxBudgetUsd: z.number().min(0.01).max(100),
      monthlyBudgetCap: z.number().min(0.01).max(10_000).optional(),
      modelAdapterId: z.string().min(1),
    })
    .passthrough(),
});

export const clarifyCancelInput = z.object({
  sessionId: z.string().min(1),
});

export const clarifyListInput = z
  .object({
    status: z.enum(['in_progress', 'completed', 'cancelled']).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .partial();

export type ClarifyStartInput = z.infer<typeof clarifyStartInput>;
export type ClarifyRespondInput = z.infer<typeof clarifyRespondInput>;
export type ClarifyConfirmInput = z.infer<typeof clarifyConfirmInput>;
