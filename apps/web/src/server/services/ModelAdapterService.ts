import { spawn } from 'node:child_process';
import { prisma, type ModelAdapter } from '@cct/db';
import { CCT, cct, type modelAdapterZod } from '@cct/shared';
import { SecretService } from '@cct/secrets';

import type { z } from 'zod';

type UpsertInput = z.infer<typeof modelAdapterZod.modelAdapterUpsertInput>;

function ensureHttps(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw cct.badRequest(CCT.MODEL_INVALID_URL);
  }
  if (parsed.protocol !== 'https:') {
    throw cct.badRequest(CCT.MODEL_INVALID_URL, { reason: 'must_be_https' });
  }
}

export const ModelAdapterService = {
  async list(userId: string): Promise<ModelAdapter[]> {
    return prisma.modelAdapter.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async upsert(userId: string, input: UpsertInput): Promise<ModelAdapter> {
    ensureHttps(input.baseUrl);
    const envExtraJson = input.envExtra ?? '{}';
    const displayName = input.displayName ?? input.alias;
    const trustLevel = input.trustLevel ?? 'third-party';

    if (input.id) {
      const existing = await prisma.modelAdapter.findFirst({
        where: { id: input.id, userId },
      });
      if (!existing) throw cct.notFound(CCT.MODEL_NOT_FOUND);
      const aliasConflict = await prisma.modelAdapter.findFirst({
        where: {
          userId,
          alias: input.alias,
          NOT: { id: input.id },
        },
      });
      if (aliasConflict) throw cct.conflict(CCT.MODEL_ALIAS_TAKEN);
      // 编辑模式：authToken 为空 → 保留原 cipher 不变；非空 → 重新加密替换
      const cipher = input.authToken && input.authToken.length >= 10
        ? await SecretService.encrypt(input.authToken)
        : existing.authTokenCipher;
      return prisma.modelAdapter.update({
        where: { id: input.id },
        data: {
          alias: input.alias,
          displayName,
          baseUrl: input.baseUrl,
          modelId: input.modelId,
          authTokenCipher: cipher,
          envExtraJson,
          trustLevel,
        },
      });
    }

    if (!input.authToken || input.authToken.length < 10) {
      throw cct.badRequest('CCT_VALIDATION', { field: 'authToken', reason: 'min_length_10' });
    }
    const dup = await prisma.modelAdapter.findFirst({
      where: { userId, alias: input.alias },
    });
    if (dup) throw cct.conflict(CCT.MODEL_ALIAS_TAKEN);
    const cipher = await SecretService.encrypt(input.authToken);
    return prisma.modelAdapter.create({
      data: {
        userId,
        alias: input.alias,
        displayName,
        baseUrl: input.baseUrl,
        modelId: input.modelId,
        authTokenCipher: cipher,
        envExtraJson,
        trustLevel,
      },
    });
  },

  async delete(userId: string, id: string): Promise<void> {
    const existing = await prisma.modelAdapter.findFirst({ where: { id, userId } });
    if (!existing) throw cct.notFound(CCT.MODEL_NOT_FOUND);
    const inUse = await prisma.task.count({
      where: { modelAdapterId: id, status: 'active' },
    });
    if (inUse > 0) {
      throw cct.failedPrecondition(CCT.MODEL_IN_USE, { activeTaskCount: inUse });
    }
    await prisma.modelAdapter.delete({ where: { id } });
  },

  async testConnection(
    userId: string,
    id: string,
  ): Promise<{ ok: boolean; latencyMs?: number; errorMessage?: string }> {
    const adapter = await prisma.modelAdapter.findFirst({ where: { id, userId } });
    if (!adapter) throw cct.notFound(CCT.MODEL_NOT_FOUND);
    const token = await SecretService.decrypt(adapter.authTokenCipher);
    const bin = process.env.CCT_CLAUDE_BIN ?? 'claude';

    const env = {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: process.env.HOME,
      ANTHROPIC_BASE_URL: adapter.baseUrl,
      ANTHROPIC_AUTH_TOKEN: token,
      ANTHROPIC_MODEL: adapter.modelId,
      CLAUDE_CODE_DISABLE_KEYCHAIN: '1',
      CI: '1',
      NO_COLOR: '1',
    } as Record<string, string | undefined> as NodeJS.ProcessEnv;

    const started = Date.now();
    const result = await new Promise<{ code: number | null; err?: string }>((resolve) => {
      let settled = false;
      const child = spawn(bin, ['--version'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (!child.killed) child.kill('SIGKILL');
          resolve({ code: -1, err: 'timeout' });
        }
      }, 5_000);
      timer.unref();
      child.on('error', (e) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ code: -1, err: e.message });
        }
      });
      child.on('exit', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ code });
        }
      });
    });

    const latencyMs = Date.now() - started;
    const ok = result.code === 0;
    await prisma.modelAdapter.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestResult: ok ? 'ok' : `fail:${result.err ?? `exit ${result.code}`}`,
      },
    });
    return ok
      ? { ok: true, latencyMs }
      : { ok: false, latencyMs, errorMessage: result.err ?? `exit ${result.code}` };
  },
};
