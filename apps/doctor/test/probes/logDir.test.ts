import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { probeLogDir } from '../../src/probes/logDir.js';

describe('logDir probe', () => {
  let tmp: string;
  let prev: string | undefined;
  beforeEach(async () => {
    prev = process.env.CCT_LOG_DIR;
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cct-doctor-logdir-'));
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.CCT_LOG_DIR;
    else process.env.CCT_LOG_DIR = prev;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('returns ok when override dir is writable', async () => {
    process.env.CCT_LOG_DIR = path.join(tmp, 'logs');
    const r = await probeLogDir();
    expect(r.level).toBe('ok');
    expect(r.message).toContain(path.join(tmp, 'logs'));
  });

  it('returns error when override is a read-only path', async () => {
    // /etc on macOS root-only. Most CI/dev users can't write there → expect error.
    process.env.CCT_LOG_DIR = '/etc/cct-doctor-readonly-test';
    const r = await probeLogDir();
    expect(r.level).toBe('error');
  });
});
