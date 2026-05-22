import { randomUUID } from 'node:crypto';
import { type PrismaClient, type RunnerLock } from '@cct/db';

// 严格按 design/05-backend.md §6.3 实现：
//  - prisma.$transaction Serializable 隔离级别
//  - 清理过期 lock（expiresAt < now）
//  - global scope 走 maxConcurrency 计数（用 startsWith 'global'）
//  - task scope 走 unique constraint，捕获 P2002 返回 null
//  - 返回 lock 实例 or null

export interface AcquireOptions {
  maxConcurrency?: number;
}

export const DEFAULT_MAX_CONCURRENT = 3;

export async function tryAcquireLock(
  prisma: PrismaClient,
  scope: string,
  ttlMs: number,
  opts: AcquireOptions = {},
): Promise<RunnerLock | null> {
  return prisma.$transaction(
    async (tx) => {
      // 清理过期 lock
      const now = new Date();
      await tx.runnerLock.deleteMany({ where: { expiresAt: { lt: now } } });

      if (scope === 'global') {
        const max = opts.maxConcurrency ?? DEFAULT_MAX_CONCURRENT;
        const count = await tx.runnerLock.count({
          where: { scope: { startsWith: 'global' } },
        });
        if (count >= max) return null;
        const sub = `global:${randomUUID()}`;
        return tx.runnerLock.create({
          data: {
            scope: sub,
            acquiredAt: now,
            acquiredBy: process.pid,
            expiresAt: new Date(now.getTime() + ttlMs),
          },
        });
      }

      try {
        return await tx.runnerLock.create({
          data: {
            scope,
            acquiredAt: now,
            acquiredBy: process.pid,
            expiresAt: new Date(now.getTime() + ttlMs),
          },
        });
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
        if (code === 'P2002') return null; // unique constraint violation
        throw e;
      }
    },
    { isolationLevel: 'Serializable' },
  );
}

export async function releaseLock(
  prisma: PrismaClient,
  lock: RunnerLock,
): Promise<void> {
  await prisma.runnerLock.deleteMany({ where: { id: lock.id } });
}
