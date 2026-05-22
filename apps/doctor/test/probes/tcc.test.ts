import { describe, expect, it, vi } from 'vitest';
import { probeTcc } from '../../src/probes/tcc.js';

describe('probeTcc', () => {
  it('returns ok on non-darwin platforms', async () => {
    if (process.platform === 'darwin') {
      // 在 macOS 上跳过这个分支检查（无法 mock platform）
      return;
    }
    const result = await probeTcc();
    expect(result.level).toBe('ok');
  });

  it('marks CCT_DOCTOR_TCC_BLOCKED when fs.writeFile throws EPERM (R2-01)', async () => {
    if (process.platform !== 'darwin') return; // probe 在非 darwin 直接 ok，不走 fsImpl 分支
    const fsImpl = {
      writeFile: vi.fn(async () => {
        const e = new Error('Operation not permitted') as NodeJS.ErrnoException;
        e.code = 'EPERM';
        throw e;
      }),
      readFile: vi.fn(async () => 'unused'),
      unlink: vi.fn(async () => {}),
    };
    const result = await probeTcc({ homeDir: '/tmp/cct-test-tcc', fsImpl });
    expect(result.level).toBe('error');
    expect(result.message).toMatch(/CCT_DOCTOR_TCC_BLOCKED/);
    expect(result.remediation).toMatch(/Full Disk Access/);
    expect(result.remediation).toMatch(/cct-runner/);
  });

  it('marks warn for other write errors', async () => {
    if (process.platform !== 'darwin') return;
    const fsImpl = {
      writeFile: vi.fn(async () => {
        throw new Error('disk full');
      }),
      readFile: vi.fn(async () => 'unused'),
      unlink: vi.fn(async () => {}),
    };
    const result = await probeTcc({ homeDir: '/tmp/cct-test-tcc', fsImpl });
    expect(result.level).toBe('warn');
  });

  it('returns ok with note about doctor != runner permissions when probe succeeds', async () => {
    if (process.platform !== 'darwin') return;
    const fsImpl = {
      writeFile: vi.fn(async () => {}),
      readFile: vi.fn(async () => 'cct-tcc-probe'),
      unlink: vi.fn(async () => {}),
    };
    const result = await probeTcc({ homeDir: '/tmp/cct-test-tcc', fsImpl });
    expect(result.level).toBe('ok');
    expect(result.message).toMatch(/cct-runner --tcc-probe/);
  });

  it('flags read mismatch as error', async () => {
    if (process.platform !== 'darwin') return;
    const fsImpl = {
      writeFile: vi.fn(async () => {}),
      readFile: vi.fn(async () => 'tampered'),
      unlink: vi.fn(async () => {}),
    };
    const result = await probeTcc({ homeDir: '/tmp/cct-test-tcc', fsImpl });
    expect(result.level).toBe('error');
    expect(result.message).toMatch(/mismatch/);
  });
});
