import { describe, expect, it } from 'vitest';
import { probeScheduler } from '../../src/probes/scheduler.js';
import type { DoctorReport } from '@cct/scheduler';

function buildScheduler(report: DoctorReport): {
  platform: 'launchd' | 'crontab';
  list: () => Promise<never[]>;
  doctor: (ids?: string[]) => Promise<DoctorReport>;
  sync: () => Promise<void>;
  remove: () => Promise<void>;
} {
  return {
    platform: report.scheduler,
    list: async () => [],
    doctor: async (_ids) => report,
    sync: async () => {},
    remove: async () => {},
  };
}

const baseReport = (): DoctorReport => ({
  scheduler: 'launchd',
  reachable: true,
  managedEntries: 1,
  orphanedEntries: [],
  ghostEntries: [],
  driftEntries: [],
  permissions: { runnerBinExecutable: true, logDirWritable: true },
  issues: [],
  generatedAt: new Date().toISOString(),
});

describe('scheduler probe', () => {
  it('returns ok when DoctorReport has no issues and no drift', async () => {
    const r = await probeScheduler({
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      scheduler: buildScheduler(baseReport()) as any,
    });
    expect(r.level).toBe('ok');
  });

  it('returns warn when DoctorReport has orphans', async () => {
    const rep = baseReport();
    rep.orphanedEntries = [{ taskId: 't1', reason: 'plist_missing' }];
    const r = await probeScheduler({
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      scheduler: buildScheduler(rep) as any,
    });
    expect(r.level).toBe('warn');
    expect(r.remediation).toMatch(/reconcile/);
  });

  it('returns error when DoctorReport contains an error issue', async () => {
    const rep = baseReport();
    rep.issues.push({
      level: 'error',
      code: 'CCT_DOCTOR_RUNNER_MISSING',
      message: 'cct-runner missing',
      remediation: 'install',
    });
    const r = await probeScheduler({
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      scheduler: buildScheduler(rep) as any,
    });
    expect(r.level).toBe('error');
    expect(r.message).toMatch(/CCT_DOCTOR_RUNNER_MISSING/);
    expect(r.remediation).toBe('install');
  });

  it('catches scheduler.doctor throws', async () => {
    const r = await probeScheduler({
      // biome-ignore lint/suspicious/noExplicitAny: structural fake.
      scheduler: {
        platform: 'launchd',
        list: async () => [],
        doctor: async () => {
          throw new Error('launchctl crashed');
        },
        sync: async () => {},
        remove: async () => {},
      } as any,
    });
    expect(r.level).toBe('error');
    expect(r.message).toMatch(/launchctl crashed/);
  });
});
