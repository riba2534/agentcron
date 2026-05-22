import chalk from 'chalk';
import { describe, expect, it } from 'vitest';
import { format, formatJson, formatText } from '../src/output.js';
import type { DoctorRunReport } from '../src/types.js';

const sample: DoctorRunReport = {
  generatedAt: '2026-05-22T12:00:00.000Z',
  platform: 'darwin',
  results: [
    { name: 'claudeBin', level: 'ok', message: '1.0.81 (Claude Code)' },
    {
      name: 'tcc',
      level: 'error',
      message: 'CCT_DOCTOR_TCC_BLOCKED ...',
      remediation: 'open Settings\nadd cct-runner',
    },
    { name: 'clockSkew', level: 'warn', message: 'skew 12s' },
  ],
  errorCount: 1,
  warnCount: 1,
  okCount: 1,
};

describe('output.format', () => {
  it('JSON format emits structured report', () => {
    const out = formatJson(sample);
    const parsed = JSON.parse(out);
    expect(parsed.errorCount).toBe(1);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.platform).toBe('darwin');
  });

  it('text format includes all probe names and remediation', () => {
    const out = formatText(sample, false);
    expect(out).toContain('claudeBin');
    expect(out).toContain('tcc');
    expect(out).toContain('clockSkew');
    expect(out).toContain('CCT_DOCTOR_TCC_BLOCKED');
    expect(out).toContain('Fix:');
    expect(out).toContain('add cct-runner');
    // 不含 ANSI 转义
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape detection.
    expect(out).not.toMatch(/\x1b\[/);
  });

  it('text format with color writes ANSI codes', () => {
    // chalk auto-disables colors when not TTY; force level for the test.
    const prevLevel = chalk.level;
    chalk.level = 1;
    try {
      const out = formatText(sample, true);
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape detection.
      expect(out).toMatch(/\x1b\[/);
    } finally {
      chalk.level = prevLevel;
    }
  });

  it('format() switches by fmt parameter', () => {
    expect(JSON.parse(format(sample, 'json'))).toMatchObject({ errorCount: 1 });
    expect(format(sample, 'text', false)).toContain('claudeBin');
  });

  it('all-pass run shows green summary line', () => {
    const ok: DoctorRunReport = {
      ...sample,
      results: [{ name: 'claudeBin', level: 'ok' }],
      errorCount: 0,
      warnCount: 0,
      okCount: 1,
    };
    const out = formatText(ok, false);
    expect(out).toContain('All probes passed.');
  });
});
