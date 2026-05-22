// runner — 收集 9 项 probe 结果并计数。
// Source of truth: design/05-backend.md §7（exit code = 错误数）。
import type { PrismaClient } from '@cct/db';
import type { Scheduler } from '@cct/scheduler';
import { probeClaudeBin } from './probes/claudeBin.js';
import { probeClockSkew } from './probes/clockSkew.js';
import { probeDbReachable } from './probes/dbReachable.js';
import { probeKeychain } from './probes/keychain.js';
import { probeLogDir } from './probes/logDir.js';
import { probeReconcile } from './probes/reconcile.js';
import { probeRunnerBin } from './probes/runnerBin.js';
import { probeScheduler } from './probes/scheduler.js';
import { probeTcc } from './probes/tcc.js';
import type { DoctorRunReport, ProbeResult } from './types.js';

export interface RunAllOptions {
  prisma: PrismaClient;
  scheduler?: Scheduler; // 可注入 mock，默认走 createScheduler()
  // 跳过特定 probe（测试 / 局部诊断时）
  skip?: ReadonlySet<string>;
}

// 把抛出的异常吞掉转成 error level，确保 runAll 永不崩溃。
async function safe(name: string, fn: () => Promise<ProbeResult>): Promise<ProbeResult> {
  try {
    return await fn();
  } catch (e: unknown) {
    return {
      name,
      level: 'error',
      message: `probe "${name}" threw: ${(e as Error).message}`,
    };
  }
}

export async function runAll(opts: RunAllOptions): Promise<DoctorRunReport> {
  const skip = opts.skip ?? new Set<string>();
  const probes: Array<{ name: string; fn: () => Promise<ProbeResult> }> = [
    { name: 'claudeBin', fn: () => probeClaudeBin() },
    { name: 'dbReachable', fn: () => probeDbReachable(opts.prisma) },
    { name: 'keychain', fn: () => probeKeychain() },
    { name: 'tcc', fn: () => probeTcc() },
    { name: 'scheduler', fn: () => probeScheduler({ scheduler: opts.scheduler, prisma: opts.prisma }) },
    { name: 'runnerBin', fn: () => probeRunnerBin() },
    { name: 'logDir', fn: () => probeLogDir() },
    { name: 'clockSkew', fn: () => probeClockSkew() },
    { name: 'reconcile', fn: () => probeReconcile({ scheduler: opts.scheduler, prisma: opts.prisma }) },
  ];

  const results = await Promise.all(
    probes
      .filter((p) => !skip.has(p.name))
      .map((p) => safe(p.name, p.fn)),
  );

  let errorCount = 0;
  let warnCount = 0;
  let okCount = 0;
  for (const r of results) {
    if (r.level === 'error') errorCount++;
    else if (r.level === 'warn') warnCount++;
    else okCount++;
  }
  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    results,
    errorCount,
    warnCount,
    okCount,
  };
}
