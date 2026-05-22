import os from 'node:os';
import path from 'node:path';
import { spawnClaude, redact } from '@cct/claude-cli';
import {
  type ModelAdapter,
  type PrismaClient,
  type RunnerLock,
  type Task,
} from '@cct/db';
import { SecretService } from '@cct/secrets';
import { isMonthlyBudgetExceeded } from './budgetGuard.js';
import { releaseLock, tryAcquireLock } from './tryAcquireLock.js';

// runner 主流程。
// Source of truth: design/05-backend.md §6.1
//
// 退出码（来自 §9 CCT_RUNNER_*）：
//   0 — 任务跑完（成功 / 失败 / 超时 / 预算用尽 / 跳过 都算"runner 成功完成调度"）
//   2 — task 不存在
//   3 — spawn 失败（claude bin 找不到等）
//   4 — 超时（兜底，正常超时 status=timeout 也走 0）
//   5 — token 解密失败
//   6 — DB 不可用
//   7 — 日志写失败
//
// 此模块只暴露 runOnce(opts)，CLI 入口在 src/index.ts。

export type SkipReason =
  | 'disabled'
  | 'archived'
  | 'monthly_budget_exceeded'
  | 'concurrent_run_in_progress'
  | 'global_concurrency_limit'
  | 'task_not_found';

export interface RunOnceOptions {
  prisma: PrismaClient;
  taskId: string;
  manual?: boolean;
  runId?: string; // 如果提供则复用已存在 TaskRun（手动触发）
  // 测试钩子
  binPath?: string;
  logDirOverride?: string;
  maxConcurrent?: number;
  now?: Date;
}

export interface RunOnceResult {
  status:
    | 'succeeded'
    | 'failed'
    | 'timeout'
    | 'budget_exceeded'
    | 'skipped'
    | 'not_found';
  runId?: string;
  skipReason?: SkipReason;
}

const MAX_CONCURRENT_DEFAULT = Number.parseInt(
  process.env.CCT_MAX_CONCURRENT_RUNS ?? '3',
  10,
);

function defaultLogDir(): string {
  if (process.env.CCT_LOG_DIR) {
    return process.env.CCT_LOG_DIR.replace(/^~(?=$|\/|\\)/, os.homedir());
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library/Logs/cct');
  }
  return path.join(os.homedir(), '.local/share/cct/logs');
}

function logFatal(msg: string): void {
  // stderr 输出过 redactor，避免 token 泄漏
  process.stderr.write(`${redact(msg)}\n`);
}

async function writeSkipped(
  prisma: PrismaClient,
  taskId: string,
  triggerSource: 'schedule' | 'manual' | 'retry',
  reason: SkipReason,
): Promise<string> {
  const run = await prisma.taskRun.create({
    data: {
      taskId,
      status: 'skipped',
      triggerSource,
      pid: process.pid,
      skipReason: reason,
      endedAt: new Date(),
    },
  });
  return run.id;
}

async function auditEnd(
  prisma: PrismaClient,
  task: Pick<Task, 'id' | 'userId'>,
  runId: string,
  status: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: task.userId,
        taskId: task.id,
        action: 'task.run.end',
        payloadJson: JSON.stringify({ runId, status }),
      },
    });
  } catch {
    // audit 失败不影响主流程
  }
}

export async function runOnce(opts: RunOnceOptions): Promise<RunOnceResult> {
  const { prisma, taskId } = opts;
  const triggerSource: 'schedule' | 'manual' = opts.manual ? 'manual' : 'schedule';

  // 1. 加载 task + adapter
  const task = (await prisma.task.findUnique({
    where: { id: taskId },
    include: { modelAdapter: true },
  })) as (Task & { modelAdapter: ModelAdapter }) | null;

  if (!task) {
    logFatal(`[runner] CCT_RUNNER_TASK_NOT_FOUND task=${taskId}`);
    return { status: 'not_found' };
  }

  // 2. 早退判断
  if (!task.enabled) {
    const id = await writeSkipped(prisma, task.id, triggerSource, 'disabled');
    return { status: 'skipped', runId: id, skipReason: 'disabled' };
  }
  if (task.status === 'archived') {
    const id = await writeSkipped(prisma, task.id, triggerSource, 'archived');
    return { status: 'skipped', runId: id, skipReason: 'archived' };
  }
  if (await isMonthlyBudgetExceeded(prisma, task, opts.now)) {
    const id = await writeSkipped(
      prisma,
      task.id,
      triggerSource,
      'monthly_budget_exceeded',
    );
    return {
      status: 'skipped',
      runId: id,
      skipReason: 'monthly_budget_exceeded',
    };
  }

  // 3. 抢并发锁（task lock + global lock）
  const ttl = task.timeoutMs * 2;
  const taskLock = await tryAcquireLock(prisma, `task:${task.id}`, ttl);
  if (!taskLock) {
    const id = await writeSkipped(
      prisma,
      task.id,
      triggerSource,
      'concurrent_run_in_progress',
    );
    return {
      status: 'skipped',
      runId: id,
      skipReason: 'concurrent_run_in_progress',
    };
  }

  let globalLock: RunnerLock | null = null;
  try {
    globalLock = await tryAcquireLock(prisma, 'global', ttl, {
      maxConcurrency: opts.maxConcurrent ?? MAX_CONCURRENT_DEFAULT,
    });
    if (!globalLock) {
      await releaseLock(prisma, taskLock);
      const id = await writeSkipped(
        prisma,
        task.id,
        triggerSource,
        'global_concurrency_limit',
      );
      return {
        status: 'skipped',
        runId: id,
        skipReason: 'global_concurrency_limit',
      };
    }
  } catch (e: unknown) {
    await releaseLock(prisma, taskLock);
    logFatal(`[runner] global lock failure: ${(e as Error).message}`);
    throw e;
  }

  // 4. 解密 token
  let token: string;
  try {
    token = await SecretService.decrypt(task.modelAdapter.authTokenCipher);
  } catch (e: unknown) {
    await releaseLock(prisma, globalLock);
    await releaseLock(prisma, taskLock);
    logFatal(`[runner] CCT_RUNNER_DECRYPT_FAILED: ${(e as Error).message}`);
    // 写一条 failed run 给用户感知
    const run = await prisma.taskRun.create({
      data: {
        taskId: task.id,
        status: 'failed',
        triggerSource,
        pid: process.pid,
        endedAt: new Date(),
        exitCode: -1,
        stderrDigest: 'CCT_RUNNER_DECRYPT_FAILED',
      },
    });
    await auditEnd(prisma, task, run.id, 'failed');
    return { status: 'failed', runId: run.id };
  }

  // 5. 创建 / 复用 TaskRun
  const run = opts.runId
    ? await prisma.taskRun.update({
        where: { id: opts.runId },
        data: { status: 'pending', triggerSource, pid: process.pid },
      })
    : await prisma.taskRun.create({
        data: {
          taskId: task.id,
          status: 'pending',
          triggerSource,
          pid: process.pid,
        },
      });

  const logDir = opts.logDirOverride ?? defaultLogDir();

  // 6. spawn + 监听
  let result: Awaited<ReturnType<typeof spawnClaude>> | null = null;
  let spawnError: Error | null = null;
  try {
    // 标记 running
    await prisma.taskRun.update({
      where: { id: run.id },
      data: { status: 'running' },
    });
    result = await spawnClaude({
      task,
      adapter: task.modelAdapter,
      token,
      run: { id: run.id },
      logDir,
      binPath: opts.binPath,
      onSpawnError: (e) => {
        spawnError = e;
      },
    });
  } catch (e: unknown) {
    spawnError = e as Error;
  } finally {
    await releaseLock(prisma, globalLock);
    await releaseLock(prisma, taskLock);
  }

  if (!result) {
    const stderr = redact(spawnError?.message ?? 'unknown spawn error');
    await prisma.taskRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        endedAt: new Date(),
        exitCode: -1,
        stderrDigest: `CCT_RUNNER_SPAWN_FAILED: ${stderr}`,
      },
    });
    await auditEnd(prisma, task, run.id, 'failed');
    return { status: 'failed', runId: run.id };
  }

  await prisma.taskRun.update({
    where: { id: run.id },
    data: {
      status: result.status,
      endedAt: result.endedAt,
      exitCode: result.exitCode,
      costUsd: result.costUsd,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cacheReadTokens: result.cacheReadTokens,
      stdoutDigest: result.stdoutDigest,
      stderrDigest: result.stderrDigest,
      summary: result.summary,
      logFilePath: result.logFilePath,
    },
  });
  await auditEnd(prisma, task, run.id, result.status);

  return { status: result.status, runId: run.id };
}
