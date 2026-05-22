import { describe, expect, it } from 'vitest';
import { computeReconcileDiff, probeReconcile } from '../../src/probes/reconcile.js';

function makePrisma(taskIds: string[]): unknown {
  return {
    task: { findMany: async () => taskIds.map((id) => ({ id })) },
  };
}

function makeScheduler(entryIds: string[]): {
  platform: 'launchd';
  list: () => Promise<{ taskId: string; cronExpression: string; command: string; enabled: true }[]>;
  doctor: () => Promise<never>;
  sync: () => Promise<void>;
  remove: () => Promise<void>;
} {
  return {
    platform: 'launchd',
    list: async () =>
      entryIds.map((id) => ({
        taskId: id,
        cronExpression: '* * * * *',
        command: 'cct-runner',
        enabled: true as const,
      })),
    doctor: async () => {
      throw new Error('doctor not used here');
    },
    sync: async () => {},
    remove: async () => {},
  };
}

describe('reconcile probe', () => {
  it('returns ok with no drift when DB and scheduler agree', async () => {
    const result = await probeReconcile({
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      prisma: makePrisma(['t1', 't2']) as any,
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      scheduler: makeScheduler(['t1', 't2']) as any,
    });
    expect(result.level).toBe('ok');
    expect(result.message).toContain('orphans=0');
    expect(result.message).toContain('ghosts=0');
  });

  it('returns warn with orphans when DB has tasks the scheduler is missing', async () => {
    const result = await probeReconcile({
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      prisma: makePrisma(['t1', 't2']) as any,
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      scheduler: makeScheduler(['t1']) as any,
    });
    expect(result.level).toBe('warn');
    expect(result.message).toMatch(/orphans=1/);
    expect(result.remediation).toMatch(/cct-doctor reconcile/);
  });

  it('returns warn with ghosts when scheduler has entries the DB is missing', async () => {
    const result = await probeReconcile({
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      prisma: makePrisma([]) as any,
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      scheduler: makeScheduler(['ghost-1']) as any,
    });
    expect(result.level).toBe('warn');
    expect(result.message).toMatch(/ghosts=1/);
  });

  it('errors when prisma is missing', async () => {
    const result = await probeReconcile({
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      scheduler: makeScheduler([]) as any,
    });
    expect(result.level).toBe('error');
  });

  it('computeReconcileDiff identifies orphans and ghosts symmetrically', async () => {
    const summary = await computeReconcileDiff(
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      makeScheduler(['a', 'b']) as any,
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      makePrisma(['b', 'c']) as any,
    );
    expect(summary.orphanTaskIds).toEqual(['c']);
    expect(summary.ghostIdentifiers).toEqual(['a']);
  });
});
