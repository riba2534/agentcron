import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LaunchdScheduler } from '../../src/launchd/LaunchdScheduler.js';
import { plistFileNameFor } from '../../src/launchd/plistTemplate.js';

const execFileAsync = promisify(execFile);

interface FakeTask {
  id: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  status: string;
}

const buildTask = (overrides: Partial<FakeTask> = {}): FakeTask => ({
  id: overrides.id ?? 'tasksmoke001',
  cronExpression: overrides.cronExpression ?? '*/15 * * * *',
  timezone: overrides.timezone ?? 'UTC',
  enabled: overrides.enabled ?? true,
  status: overrides.status ?? 'active',
});

const isMacOS = process.platform === 'darwin';
const describeOnMac = isMacOS ? describe : describe.skip;

describeOnMac('I-SCH-01: LaunchdScheduler real plist write + plutil convert', () => {
  let tmpDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cct-scheduler-it-'));
    originalEnv = { ...process.env };
    process.env.LAUNCH_AGENTS_DIR = path.join(tmpDir, 'LaunchAgents');
    process.env.CCT_LOG_DIR = path.join(tmpDir, 'logs');
    process.env.CCT_DB_URL = `file:${path.join(tmpDir, 'db.sqlite')}`;
    process.env.CCT_RUNNER_BIN = path.join(tmpDir, 'cct-runner');
    process.env.CCT_LAUNCHCTL_BIN = '/usr/bin/true';
    await fs.mkdir(process.env.LAUNCH_AGENTS_DIR!, { recursive: true });
    await fs.mkdir(process.env.CCT_LOG_DIR!, { recursive: true });
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes plist with valid XML and StartCalendarInterval matching cron', async () => {
    const scheduler = new LaunchdScheduler();
    const task = buildTask({ id: 'inttask01', cronExpression: '*/15 * * * *' });
    await scheduler.sync(task as unknown as Parameters<typeof scheduler.sync>[0]);

    const plistPath = path.join(process.env.LAUNCH_AGENTS_DIR!, plistFileNameFor(task.id));
    const xml = await fs.readFile(plistPath, 'utf8');
    expect(xml).toContain('com.cct.task.inttask01');
    expect(xml).toContain('<key>StartCalendarInterval</key>');

    const { stdout } = await execFileAsync('plutil', ['-convert', 'json', '-o', '-', plistPath]);
    const parsed = JSON.parse(stdout) as {
      Label: string;
      StartCalendarInterval: Array<{ Minute?: number; Hour?: number }>;
      ProgramArguments: string[];
    };
    expect(parsed.Label).toBe('com.cct.task.inttask01');
    expect(Array.isArray(parsed.StartCalendarInterval)).toBe(true);
    expect(parsed.StartCalendarInterval).toHaveLength(96);
    const minutes = new Set(parsed.StartCalendarInterval.map((e) => e.Minute));
    expect([...minutes].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 15, 30, 45]);
    expect(parsed.ProgramArguments).toEqual([
      process.env.CCT_RUNNER_BIN,
      '--task-id',
      'inttask01',
    ]);
  });

  it('overwrites existing plist when synced again with new cron', async () => {
    const scheduler = new LaunchdScheduler();
    const t1 = buildTask({ id: 'inttask02', cronExpression: '0 9 * * *' });
    const t2 = { ...t1, cronExpression: '0 10 * * *' };
    await scheduler.sync(t1 as unknown as Parameters<typeof scheduler.sync>[0]);
    await scheduler.sync(t2 as unknown as Parameters<typeof scheduler.sync>[0]);

    const plistPath = path.join(process.env.LAUNCH_AGENTS_DIR!, plistFileNameFor(t1.id));
    const { stdout } = await execFileAsync('plutil', ['-convert', 'json', '-o', '-', plistPath]);
    const parsed = JSON.parse(stdout) as {
      StartCalendarInterval: Array<{ Hour: number }>;
    };
    expect(parsed.StartCalendarInterval[0]?.Hour).toBe(10);
  });

  it('remove deletes the plist file', async () => {
    const scheduler = new LaunchdScheduler();
    const task = buildTask({ id: 'inttask03', cronExpression: '0 0 * * *' });
    await scheduler.sync(task as unknown as Parameters<typeof scheduler.sync>[0]);
    const plistPath = path.join(process.env.LAUNCH_AGENTS_DIR!, plistFileNameFor(task.id));
    await fs.access(plistPath);
    await scheduler.remove(task.id);
    await expect(fs.access(plistPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('list returns managed plist filenames as ScheduledEntry rows', async () => {
    const scheduler = new LaunchdScheduler();
    const a = buildTask({ id: 'list_a', cronExpression: '0 9 * * *' });
    const b = buildTask({ id: 'list_b', cronExpression: '0 10 * * *' });
    await scheduler.sync(a as unknown as Parameters<typeof scheduler.sync>[0]);
    await scheduler.sync(b as unknown as Parameters<typeof scheduler.sync>[0]);
    const entries = await scheduler.list();
    const ids = entries.map((e) => e.taskId).sort();
    expect(ids).toContain('list_a');
    expect(ids).toContain('list_b');
  });
});
