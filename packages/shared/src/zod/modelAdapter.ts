import { z } from 'zod';

export const trustLevel = z.enum(['official', 'self-hosted', 'third-party']);

export const modelAlias = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,30}$/, 'alias 仅限小写字母、数字、短横线，2-31 位');

export const modelAdapterUpsertInput = z.object({
  id: z.string().min(1).optional(),
  alias: modelAlias,
  displayName: z.string().min(1).max(80).optional(),
  baseUrl: z.string().url().startsWith('https://', 'baseUrl 必须以 https:// 开头'),
  modelId: z.string().min(1).max(120),
  // 编辑模式下空字符串/undefined 表示"保持原 token 不变"；新建模式必须 ≥10 位（service 层校验）
  authToken: z.string().max(2_000).optional(),
  trustLevel: trustLevel.optional(),
  envExtra: z
    .string()
    .optional()
    .refine(
      (s) => {
        if (!s) return true;
        try {
          JSON.parse(s);
          return true;
        } catch {
          return false;
        }
      },
      { message: '需要合法 JSON 字符串' },
    ),
});

export const modelAdapterDeleteInput = z.object({ id: z.string().min(1) });

export const modelAdapterTestInput = z.object({ id: z.string().min(1) });

export type ModelAdapterUpsertInput = z.infer<typeof modelAdapterUpsertInput>;
