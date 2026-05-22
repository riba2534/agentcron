import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { probeClaudeBin } from '../../src/probes/claudeBin.js';
import { probeRunnerBin } from '../../src/probes/runnerBin.js';

describe('claudeBin probe', () => {
  it('returns error if CCT_CLAUDE_BIN points at nonexistent path', async () => {
    const prev = process.env.CCT_CLAUDE_BIN;
    process.env.CCT_CLAUDE_BIN = '/definitely/does/not/exist/cct-test-claude';
    try {
      const r = await probeClaudeBin();
      expect(r.level).toBe('error');
      expect(r.remediation).toMatch(/Install Claude Code/);
    } finally {
      if (prev === undefined) delete process.env.CCT_CLAUDE_BIN;
      else process.env.CCT_CLAUDE_BIN = prev;
    }
  });

  it('returns ok if CCT_CLAUDE_BIN points at /bin/echo (echo --version writes to stdout, exits 0)', async () => {
    const prev = process.env.CCT_CLAUDE_BIN;
    process.env.CCT_CLAUDE_BIN = '/bin/echo';
    try {
      const r = await probeClaudeBin();
      expect(r.level).toBe('ok');
      expect(r.message).toMatch(/--version/);
    } finally {
      if (prev === undefined) delete process.env.CCT_CLAUDE_BIN;
      else process.env.CCT_CLAUDE_BIN = prev;
    }
  });
});

describe('runnerBin probe', () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.CCT_RUNNER_BIN;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CCT_RUNNER_BIN;
    else process.env.CCT_RUNNER_BIN = prev;
  });

  it('returns ok when CCT_RUNNER_BIN points at an executable file (/bin/echo)', async () => {
    process.env.CCT_RUNNER_BIN = '/bin/echo';
    const r = await probeRunnerBin();
    expect(r.level).toBe('ok');
    expect(r.message).toContain('/bin/echo');
  });

  it('returns error when CCT_RUNNER_BIN points at non-executable file (/etc/hosts)', async () => {
    process.env.CCT_RUNNER_BIN = '/etc/hosts';
    const r = await probeRunnerBin();
    expect(r.level).toBe('error');
  });

  it('returns error when CCT_RUNNER_BIN points at nonexistent path', async () => {
    process.env.CCT_RUNNER_BIN = '/no/such/path/cct-runner';
    const r = await probeRunnerBin();
    expect(r.level).toBe('error');
    expect(r.remediation).toMatch(/cct-runner/);
  });
});
