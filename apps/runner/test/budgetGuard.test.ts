import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isMonthlyBudgetExceeded } from '../src/budgetGuard.js';
import { type TestDb, makeTestDb } from './helpers/dbHelper.js';

let testDb: TestDb;

beforeEach(async () => {
  testDb = await makeTestDb();
  // seed: user + adapter + task with monthlyBudgetCap=10
  await testDb.prisma.user.create({
    data: { id: 'u1', email: 'u1@example.com', passwordHash: 'x' },
  });
  await testDb.prisma.modelAdapter.create({
    data: {
      id: 'a1',
      userId: 'u1',
      alias: 'kcc',
      displayName: 'kcc',
      baseUrl: 'https://api.example.com',
      modelId: 'kimi-k2.6',
      authTokenCipher: 'v1:xxxx',
      trustLevel: 'self-hosted',
    },
  });
});

afterEach(async () => {
  await testDb.cleanup();
});

const T = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  userId: 'u1',
  modelAdapterId: 'a1',
  name: 'name1',
  rawInput: 'r',
  commandPrompt: 'p',
  workingDirectory: '/tmp',
  cronExpression: '0 9 * * *',
  timezone: 'Asia/Shanghai',
  timeoutMs: 60_000,
  maxBudgetUsd: 1.0,
  monthlyBudgetCap: 10,
  specJson: '{}',
  ...over,
});

async function makeTask(over: Record<string, unknown> = {}) {
  await testDb.prisma.task.create({ data: T(over) });
}

describe('isMonthlyBudgetExceeded', () => {
  it('U-RUN-04a: monthlyBudgetCap 未设置 → 永远 false', async () => {
    await makeTask({ monthlyBudgetCap: null });
    const r = await isMonthlyBudgetExceeded(testDb.prisma, {
      id: 't1',
      monthlyBudgetCap: null,
    });
    expect(r).toBe(false);
  });

  it('U-RUN-04b: 当月已花 $10，cap=$10 → true（>= 触发）', async () => {
    await makeTask();
    const now = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
    // 当月初
    await testDb.prisma.taskRun.create({
      data: {
        taskId: 't1',
        status: 'succeeded',
        triggerSource: 'schedule',
        startedAt: new Date(Date.UTC(2026, 4, 1, 1, 0, 0)),
        endedAt: new Date(Date.UTC(2026, 4, 1, 1, 1, 0)),
        costUsd: 6.0,
      },
    });
    await testDb.prisma.taskRun.create({
      data: {
        taskId: 't1',
        status: 'failed',
        triggerSource: 'schedule',
        startedAt: new Date(Date.UTC(2026, 4, 10, 1, 0, 0)),
        endedAt: new Date(Date.UTC(2026, 4, 10, 1, 1, 0)),
        costUsd: 4.0,
      },
    });
    const r = await isMonthlyBudgetExceeded(
      testDb.prisma,
      { id: 't1', monthlyBudgetCap: 10 },
      now,
    );
    expect(r).toBe(true);
  });

  it('U-RUN-04c: 月初首次 → false', async () => {
    await makeTask();
    // 上个月的消耗不算
    await testDb.prisma.taskRun.create({
      data: {
        taskId: 't1',
        status: 'succeeded',
        triggerSource: 'schedule',
        startedAt: new Date(Date.UTC(2026, 3, 28, 1, 0, 0)),
        costUsd: 100,
      },
    });
    const now = new Date(Date.UTC(2026, 4, 1, 0, 5, 0));
    const r = await isMonthlyBudgetExceeded(
      testDb.prisma,
      { id: 't1', monthlyBudgetCap: 10 },
      now,
    );
    expect(r).toBe(false);
  });

  it('skipped/pending 不计入累积', async () => {
    await makeTask();
    const now = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
    await testDb.prisma.taskRun.create({
      data: {
        taskId: 't1',
        status: 'skipped',
        triggerSource: 'schedule',
        startedAt: new Date(Date.UTC(2026, 4, 1, 1, 0, 0)),
        costUsd: 1000,
      },
    });
    await testDb.prisma.taskRun.create({
      data: {
        taskId: 't1',
        status: 'pending',
        triggerSource: 'schedule',
        startedAt: new Date(Date.UTC(2026, 4, 1, 1, 0, 0)),
        costUsd: 500,
      },
    });
    const r = await isMonthlyBudgetExceeded(
      testDb.prisma,
      { id: 't1', monthlyBudgetCap: 10 },
      now,
    );
    expect(r).toBe(false);
  });
});
