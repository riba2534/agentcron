import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runUninstall } from '../../src/commands/uninstall.js';

const fakePrismaWithDisconnect = (): unknown => ({
  $disconnect: vi.fn(async () => {}),
});

const fakeScheduler = () => ({
  platform: 'launchd' as const,
  list: vi.fn(async () => [
    { taskId: 't1', cronExpression: '* * * * *', command: 'x', enabled: true },
  ]),
  remove: vi.fn(async () => {}),
  sync: vi.fn(async () => {}),
  doctor: vi.fn(async () => {
    throw new Error('not used');
  }),
});

describe('uninstall command', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cct-uninstall-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('refuses without --confirm and emits structured JSON in --json mode', async () => {
    const writes: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      const code = await runUninstall({
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        prisma: fakePrismaWithDisconnect() as any,
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        scheduler: fakeScheduler() as any,
        json: true,
      });
      expect(code).toBe(1);
      const all = writes.join('');
      // JSON-only output: must parse cleanly
      const parsed = JSON.parse(all);
      expect(parsed.aborted).toBe(true);
      expect(parsed.steps[0].step).toBe('confirmation');
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('proceeds with --confirm + --yes against fixture sqlite', async () => {
    // 准备 fixture：临时 sqlite + master.key 文件
    const dbFile = path.join(tmp, 'fixture.sqlite');
    await fs.writeFile(dbFile, ''); // 空 SQLite 占位文件
    const keyFile = path.join(tmp, 'master.key');
    await fs.writeFile(keyFile, 'fake-key');

    // 隔离环境变量，保证默认路径解析也指向 fixture
    const prevDb = process.env.CCT_DB_URL;
    const prevKey = process.env.CCT_MASTER_KEY_PATH;
    process.env.CCT_DB_URL = `file:${dbFile}`;
    process.env.CCT_MASTER_KEY_PATH = keyFile;

    const writes: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const sched = fakeScheduler();
    try {
      const code = await runUninstall({
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        prisma: fakePrismaWithDisconnect() as any,
        // biome-ignore lint/suspicious/noExplicitAny: structural fake.
        scheduler: sched as any,
        confirm: true,
        yes: true,
        json: true,
      });
      // 在 macOS 上 keychain.delete 可能 skip / error 而不是 ok（开发机上没有 com.cct.master entry），
      // 此时整体仍允许；只要 db.delete 成功即可。
      expect(code).toBe(0);

      const out = JSON.parse(writes.join(''));
      expect(out.aborted).toBe(false);
      const stepNames = out.steps.map((s: { step: string }) => s.step);
      expect(stepNames).toContain('scheduler.removeAll');
      // db.delete 必须出现
      expect(stepNames).toContain('db.delete');

      // sched.list 必被调用，sched.remove 至少 1 次
      expect(sched.list).toHaveBeenCalledTimes(1);
      expect(sched.remove).toHaveBeenCalledTimes(1);

      // db 文件应已被删除
      await expect(fs.access(dbFile)).rejects.toThrow();
    } finally {
      stdoutSpy.mockRestore();
      if (prevDb === undefined) delete process.env.CCT_DB_URL;
      else process.env.CCT_DB_URL = prevDb;
      if (prevKey === undefined) delete process.env.CCT_MASTER_KEY_PATH;
      else process.env.CCT_MASTER_KEY_PATH = prevKey;
    }
  });
});
