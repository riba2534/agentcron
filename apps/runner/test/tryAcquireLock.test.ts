import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { releaseLock, tryAcquireLock } from '../src/tryAcquireLock.js';
import { type TestDb, makeTestDb } from './helpers/dbHelper.js';

let testDb: TestDb;

beforeEach(async () => {
  testDb = await makeTestDb();
});
afterEach(async () => {
  await testDb.cleanup();
});

describe('tryAcquireLock', () => {
  it('U-RUN-05: 同 scope 第二次返回 null（unique violation）', async () => {
    const a = await tryAcquireLock(testDb.prisma, 'task:T1', 60_000);
    expect(a).not.toBeNull();
    const b = await tryAcquireLock(testDb.prisma, 'task:T1', 60_000);
    expect(b).toBeNull();
  });

  it('释放后可以再次抢占', async () => {
    const a = await tryAcquireLock(testDb.prisma, 'task:T2', 60_000);
    expect(a).not.toBeNull();
    await releaseLock(testDb.prisma, a!);
    const b = await tryAcquireLock(testDb.prisma, 'task:T2', 60_000);
    expect(b).not.toBeNull();
  });

  it('U-RUN-06a: global maxConcurrency=3 → 第 4 次返回 null', async () => {
    const a = await tryAcquireLock(testDb.prisma, 'global', 60_000, { maxConcurrency: 3 });
    const b = await tryAcquireLock(testDb.prisma, 'global', 60_000, { maxConcurrency: 3 });
    const c = await tryAcquireLock(testDb.prisma, 'global', 60_000, { maxConcurrency: 3 });
    const d = await tryAcquireLock(testDb.prisma, 'global', 60_000, { maxConcurrency: 3 });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).not.toBeNull();
    expect(d).toBeNull();
  });

  it('U-RUN-06b: 任意一条过期后第 5 次成功', async () => {
    const a = await tryAcquireLock(testDb.prisma, 'global', 60_000, { maxConcurrency: 3 });
    const b = await tryAcquireLock(testDb.prisma, 'global', 60_000, { maxConcurrency: 3 });
    const c = await tryAcquireLock(testDb.prisma, 'global', 60_000, { maxConcurrency: 3 });
    expect(a && b && c).toBeTruthy();

    // 直接把 a 的 expiresAt 改到过去
    await testDb.prisma.runnerLock.update({
      where: { id: a!.id },
      data: { expiresAt: new Date(Date.now() - 10_000) },
    });

    const d = await tryAcquireLock(testDb.prisma, 'global', 60_000, { maxConcurrency: 3 });
    expect(d).not.toBeNull();
  });

  it('过期 task lock 在抢占时被自动清理', async () => {
    const a = await tryAcquireLock(testDb.prisma, 'task:STALE', 60_000);
    expect(a).not.toBeNull();
    await testDb.prisma.runnerLock.update({
      where: { id: a!.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const b = await tryAcquireLock(testDb.prisma, 'task:STALE', 60_000);
    expect(b).not.toBeNull();
    expect(b!.id).not.toBe(a!.id);
  });
});
