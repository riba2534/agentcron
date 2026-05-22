import { describe, expect, it } from 'vitest';
import { runAll } from '../src/runner.js';
import type { ProbeResult } from '../src/types.js';

// Stub all probes by injecting a fake prisma + scheduler so runAll
// only exercises the orchestration logic.
function fakePrisma(): unknown {
  return {
    $queryRawUnsafe: async () => [{ ok: 1 }],
    task: { findMany: async () => [] },
    $disconnect: async () => {},
  };
}

function fakeScheduler(): {
  platform: 'launchd' | 'crontab';
  list: () => Promise<unknown[]>;
  doctor: () => Promise<{
    scheduler: 'launchd';
    reachable: true;
    managedEntries: 0;
    orphanedEntries: never[];
    ghostEntries: never[];
    driftEntries: never[];
    permissions: { runnerBinExecutable: true; logDirWritable: true };
    issues: never[];
    generatedAt: string;
  }>;
  sync: () => Promise<void>;
  remove: () => Promise<void>;
} {
  return {
    platform: 'launchd',
    list: async () => [],
    doctor: async () => ({
      scheduler: 'launchd' as const,
      reachable: true as const,
      managedEntries: 0 as const,
      orphanedEntries: [],
      ghostEntries: [],
      driftEntries: [],
      permissions: { runnerBinExecutable: true as const, logDirWritable: true as const },
      issues: [],
      generatedAt: new Date().toISOString(),
    }),
    sync: async () => {},
    remove: async () => {},
  };
}

describe('runAll', () => {
  it('aggregates all probes and returns a stable summary shape', async () => {
    const report = await runAll({
      // biome-ignore lint/suspicious/noExplicitAny: structural fakes for unit test.
      prisma: fakePrisma() as any,
      // biome-ignore lint/suspicious/noExplicitAny: structural fakes for unit test.
      scheduler: fakeScheduler() as any,
    });
    expect(report.platform).toBe(process.platform);
    expect(report.results.length).toBeGreaterThanOrEqual(8);
    // sum check
    expect(report.okCount + report.warnCount + report.errorCount).toBe(report.results.length);
  });

  it('respects skip set', async () => {
    const report = await runAll({
      // biome-ignore lint/suspicious/noExplicitAny: structural fakes for unit test.
      prisma: fakePrisma() as any,
      // biome-ignore lint/suspicious/noExplicitAny: structural fakes for unit test.
      scheduler: fakeScheduler() as any,
      skip: new Set(['claudeBin', 'runnerBin', 'tcc', 'logDir', 'clockSkew']),
    });
    const names = report.results.map((r: ProbeResult) => r.name);
    expect(names).not.toContain('claudeBin');
    expect(names).not.toContain('runnerBin');
    expect(names).toContain('dbReachable');
    expect(names).toContain('scheduler');
    expect(names).toContain('reconcile');
    expect(names).toContain('keychain');
  });

  it('never throws even if a probe rejects (safe wrapper converts to error level)', async () => {
    const badPrisma = {
      $queryRawUnsafe: () => Promise.reject(new Error('boom')),
      task: { findMany: () => Promise.reject(new Error('boom')) },
      $disconnect: async () => {},
    };
    const report = await runAll({
      // biome-ignore lint/suspicious/noExplicitAny: structural fakes for unit test.
      prisma: badPrisma as any,
      // biome-ignore lint/suspicious/noExplicitAny: structural fakes for unit test.
      scheduler: fakeScheduler() as any,
    });
    const dbProbe = report.results.find((r) => r.name === 'dbReachable');
    expect(dbProbe?.level).toBe('error');
    expect(dbProbe?.message).toMatch(/boom/);
  });
});
