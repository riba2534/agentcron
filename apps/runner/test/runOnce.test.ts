import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _resetMasterKeyCache, aesEncrypt, getMasterKey } from '@cct/secrets';
import { runOnce } from '../src/runOnce.js';
import { type TestDb, makeTestDb } from './helpers/dbHelper.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLAUDE = path.join(HERE, 'mock-claude.mjs');

let testDb: TestDb;
let logDir: string;
let masterKeyDir: string;

beforeAll(async () => {
  // 强制 secrets 包走 file 模式（即便在 macOS 上）以避免动 Keychain
  masterKeyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cct-runner-mk-'));
  process.env.CCT_FORCE_FILE_MASTERKEY = '1';
  process.env.CCT_MASTER_KEY_PATH = path.join(masterKeyDir, 'master.key');
});

beforeEach(async () => {
  testDb = await makeTestDb();
  logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cct-runner-log-'));
  _resetMasterKeyCache();
});

afterEach(async () => {
  await testDb.cleanup();
  await fs.rm(logDir, { recursive: true, force: true }).catch(() => {});
});

const PLAIN_TOKEN = 'sk-test-PLAINTOKEN-1234567890';

async function seed(opts: {
  enabled?: boolean;
  status?: 'active' | 'archived';
  monthlyBudgetCap?: number | null;
  workingDirectory?: string;
  timeoutMs?: number;
  maxBudgetUsd?: number;
  systemPrompt?: string;
  commandPrompt?: string;
} = {}): Promise<{ taskId: string }> {
  const key = await getMasterKey();
  const cipher = aesEncrypt(PLAIN_TOKEN, key);
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
      authTokenCipher: cipher,
      trustLevel: 'self-hosted',
    },
  });
  await testDb.prisma.task.create({
    data: {
      id: 't1',
      userId: 'u1',
      modelAdapterId: 'a1',
      name: 'demo',
      rawInput: '每天 9 点',
      commandPrompt: opts.commandPrompt ?? 'do summary mockclaude:happy',
      systemPrompt: opts.systemPrompt ?? null,
      workingDirectory: opts.workingDirectory ?? '/tmp',
      cronExpression: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      timeoutMs: opts.timeoutMs ?? 60_000,
      maxBudgetUsd: opts.maxBudgetUsd ?? 1.0,
      monthlyBudgetCap: opts.monthlyBudgetCap ?? null,
      enabled: opts.enabled ?? true,
      status: opts.status ?? 'active',
      specJson: '{}',
    },
  });
  return { taskId: 't1' };
}

describe('runOnce — early exits', () => {
  it('happy path: spawn mock-claude --scenario=happy → status=succeeded + cost/tokens', async () => {
    const { taskId } = await seed();
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId,
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
    });
    expect(r.status).toBe('succeeded');
    const run = await testDb.prisma.taskRun.findUnique({
      where: { id: r.runId! },
    });
    expect(run?.status).toBe('succeeded');
    expect(run?.exitCode).toBe(0);
    expect(run?.costUsd).toBe(0.0125);
    expect(run?.inputTokens).toBe(1234);
    expect(run?.outputTokens).toBe(567);
    expect(run?.cacheReadTokens).toBe(89);
    expect(run?.summary).toBe('任务已完成。共处理 3 条记录。');
    expect(run?.logFilePath).toContain(run!.id);
    // 日志文件存在
    const stat = await fs.stat(run!.logFilePath!);
    expect(stat.size).toBeGreaterThan(0);
  });

  it('crash scenario: exit !=0 → status=failed', async () => {
    const { taskId } = await seed({ commandPrompt: 'mockclaude:crash' });
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId,
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
    });
    expect(r.status).toBe('failed');
    const run = await testDb.prisma.taskRun.findUnique({ where: { id: r.runId! } });
    expect(run?.status).toBe('failed');
    expect(run?.exitCode).toBe(1);
  });

  it('stderr-token scenario: stderr 中的 sk- / Bearer 被 redact', async () => {
    const { taskId } = await seed({ commandPrompt: 'mockclaude:stderr-token' });
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId,
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
    });
    const run = await testDb.prisma.taskRun.findUnique({ where: { id: r.runId! } });
    const stderr = run?.stderrDigest ?? '';
    expect(stderr).not.toContain('LEAKME12345678');
    expect(stderr).not.toContain('abc.def.ghi-jkl');
    expect(stderr).toContain('<redacted>');
  });

  it('timeout scenario: timeoutMs=2s 触发 SIGTERM → status=timeout', async () => {
    const { taskId } = await seed({
      commandPrompt: 'mockclaude:timeout',
      timeoutMs: 2_000,
    });
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId,
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
    });
    expect(r.status).toBe('timeout');
    const run = await testDb.prisma.taskRun.findUnique({ where: { id: r.runId! } });
    expect(run?.status).toBe('timeout');
  }, 15_000);

  it('disabled task → skipped/disabled', async () => {
    const { taskId } = await seed({ enabled: false });
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId,
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
    });
    expect(r.status).toBe('skipped');
    expect(r.skipReason).toBe('disabled');
    const run = await testDb.prisma.taskRun.findUnique({ where: { id: r.runId! } });
    expect(run?.status).toBe('skipped');
    expect(run?.skipReason).toBe('disabled');
  });

  it('archived task → skipped/archived', async () => {
    const { taskId } = await seed({ status: 'archived' });
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId,
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
    });
    expect(r.skipReason).toBe('archived');
  });

  it('monthly budget exceeded → skipped/monthly_budget_exceeded', async () => {
    const { taskId } = await seed({ monthlyBudgetCap: 1 });
    // 注入一条 succeeded run 占满 budget
    await testDb.prisma.taskRun.create({
      data: {
        taskId,
        status: 'succeeded',
        triggerSource: 'schedule',
        startedAt: new Date(),
        costUsd: 5.0,
      },
    });
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId,
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
    });
    expect(r.skipReason).toBe('monthly_budget_exceeded');
  });

  it('task 不存在 → status=not_found', async () => {
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId: 'nonexistent',
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
    });
    expect(r.status).toBe('not_found');
  });
});

describe('runOnce — concurrent lock', () => {
  it('同 task 第二次抢占失败 → skipped/concurrent_run_in_progress', async () => {
    const { taskId } = await seed();
    // 手动占住 task lock
    await testDb.prisma.runnerLock.create({
      data: {
        scope: `task:${taskId}`,
        acquiredAt: new Date(),
        acquiredBy: 99999,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId,
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
    });
    expect(r.skipReason).toBe('concurrent_run_in_progress');
  });

  it('global 并发上限 → skipped/global_concurrency_limit', async () => {
    const { taskId } = await seed();
    // 注满 global slots（3 个）
    for (let i = 0; i < 3; i++) {
      await testDb.prisma.runnerLock.create({
        data: {
          scope: `global:other-${i}`,
          acquiredAt: new Date(),
          acquiredBy: 9000 + i,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
    }
    const r = await runOnce({
      prisma: testDb.prisma,
      taskId,
      binPath: MOCK_CLAUDE,
      logDirOverride: logDir,
      maxConcurrent: 3,
    });
    expect(r.skipReason).toBe('global_concurrency_limit');
  });
});
