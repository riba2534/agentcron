import { describe, expect, it, vi } from 'vitest';
import { runReconcile } from '../../src/commands/reconcile.js';

const fakePrisma = (taskIds: string[]) => ({
  task: {
    findMany: vi.fn(async () => taskIds.map((id) => ({ id }))),
    findUnique: vi.fn(async (q: { where: { id: string } }) => {
      if (taskIds.includes(q.where.id)) {
        // 返回最小可用 Task 形状 — Scheduler.sync 只会读 cronExpression / id 等字段。
        return {
          id: q.where.id,
          cronExpression: '* * * * *',
          enabled: true,
          status: 'active',
          name: 'fake',
          timezone: 'UTC',
          rawInput: '',
          commandPrompt: '',
          systemPrompt: null,
          workingDirectory: '/tmp',
          timeoutMs: 60000,
          maxBudgetUsd: 1,
          monthlyBudgetCap: null,
          specJson: '{}',
          notifyConfigJson: null,
          modelAdapterId: 'm1',
          userId: 'u1',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSyncedAt: null,
          lastSyncError: null,
        };
      }
      return null;
    }),
  },
});

const fakeScheduler = (entryIds: string[]) => ({
  platform: 'launchd' as const,
  list: vi.fn(async () =>
    entryIds.map((id) => ({
      taskId: id,
      cronExpression: '* * * * *',
      command: 'cct-runner',
      enabled: true,
    })),
  ),
  sync: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  doctor: vi.fn(async () => {
    throw new Error('not used');
  }),
});

describe('reconcile command', () => {
  it('reports nothing-to-do when DB and scheduler agree (--json --yes)', async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      const code = await runReconcile({
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        prisma: fakePrisma(['t1']) as any,
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        scheduler: fakeScheduler(['t1']) as any,
        json: true,
        yes: true,
      });
      expect(code).toBe(0);
      const out = JSON.parse(writes.join(''));
      expect(out.orphans).toEqual([]);
      expect(out.ghosts).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('syncs orphans and removes ghosts with --yes (--json)', async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const prisma = fakePrisma(['t1', 't2']);
    const scheduler = fakeScheduler(['t1', 'ghost-x']);
    try {
      const code = await runReconcile({
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        prisma: prisma as any,
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        scheduler: scheduler as any,
        json: true,
        yes: true,
      });
      expect(code).toBe(0);
      const out = JSON.parse(writes.join(''));
      expect(out.orphans).toContainEqual({ taskId: 't2', action: 'synced' });
      expect(out.ghosts).toContainEqual({ identifier: 'ghost-x', action: 'removed' });
      expect(scheduler.sync).toHaveBeenCalledTimes(1);
      expect(scheduler.remove).toHaveBeenCalledWith('ghost-x');
    } finally {
      spy.mockRestore();
    }
  });

  it('reports failures from sync/remove without throwing', async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const prisma = fakePrisma(['t-orphan']);
    const scheduler = fakeScheduler(['ghost-1']);
    scheduler.sync.mockRejectedValueOnce(new Error('sync exploded'));
    scheduler.remove.mockRejectedValueOnce(new Error('remove exploded'));
    try {
      const code = await runReconcile({
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        prisma: prisma as any,
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        scheduler: scheduler as any,
        json: true,
        yes: true,
      });
      expect(code).toBe(1);
      const out = JSON.parse(writes.join(''));
      expect(out.orphans[0]).toMatchObject({ taskId: 't-orphan', action: 'failed' });
      expect(out.ghosts[0]).toMatchObject({ identifier: 'ghost-1', action: 'failed' });
    } finally {
      spy.mockRestore();
    }
  });
});
