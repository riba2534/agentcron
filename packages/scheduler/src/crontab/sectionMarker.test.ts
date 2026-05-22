import { describe, expect, it } from 'vitest';
import {
  parseManagedSection,
  renderManagedSection,
  SECTION_BEGIN,
  SECTION_END,
  spliceManagedSection,
  stripManagedSection,
} from './sectionMarker.js';

describe('sectionMarker', () => {
  it('U-SCH-06: strip is idempotent on a crontab without managed markers', () => {
    const original = '# user crontab\nMAILTO=me@x\n0 9 * * * echo hi\n';
    expect(stripManagedSection(original)).toBe(original);
  });

  it('U-SCH-07: render with empty entries still emits BEGIN/END block', () => {
    const out = renderManagedSection([]);
    expect(out).toContain(SECTION_BEGIN);
    expect(out).toContain(SECTION_END);
    expect(out.split(SECTION_BEGIN)).toHaveLength(2);
    expect(out.split(SECTION_END)).toHaveLength(2);
  });

  it('strip removes the managed section but keeps user lines', () => {
    const ct = [
      '# user line',
      '0 9 * * * echo user',
      '',
      SECTION_BEGIN,
      '# CCT v1.0 — DO NOT EDIT BY HAND, USE Claude Crontab UI',
      '*/5 * * * * /usr/local/bin/cct-runner --task-id abc # cct:abc',
      SECTION_END,
      '',
    ].join('\n');
    const out = stripManagedSection(ct);
    expect(out).toContain('echo user');
    expect(out).not.toContain('cct-runner');
    expect(out).not.toContain(SECTION_BEGIN);
  });

  it('splice writes managed section once even when called twice (idempotent)', () => {
    const initial = '# user line\n0 9 * * * echo user\n';
    const entries = [
      {
        taskId: 'abc',
        cronExpression: '*/5 * * * *',
        command: '/usr/local/bin/cct-runner --task-id abc',
        enabled: true,
      },
    ];
    const once = spliceManagedSection(initial, entries);
    const twice = spliceManagedSection(once, entries);
    expect(twice).toBe(once);
    const beginCount = (twice.match(new RegExp(SECTION_BEGIN, 'g')) ?? []).length;
    expect(beginCount).toBe(1);
    expect(twice).toContain('# user line');
    expect(twice).toContain('echo user');
  });

  it('splice preserves arbitrary user lines after re-write', () => {
    const initial = [
      '# user A',
      '0 0 * * * echo midnight',
      '# user B',
      '*/30 * * * * echo halfhour',
    ].join('\n') + '\n';
    const out = spliceManagedSection(initial, [
      { taskId: 'x', cronExpression: '0 9 * * *', command: '/bin/true', enabled: true },
    ]);
    expect(out).toContain('# user A');
    expect(out).toContain('# user B');
    expect(out).toContain('echo halfhour');
    expect(out).toContain('# cct:x');
  });

  it('parseManagedSection roundtrips through render', () => {
    const entries = [
      { taskId: 't1', cronExpression: '0 9 * * *', command: '/bin/cct-runner --task-id t1', enabled: true },
      { taskId: 't2', cronExpression: '*/15 * * * *', command: '/bin/cct-runner --task-id t2', enabled: true },
    ];
    const rendered = renderManagedSection(entries);
    const parsed = parseManagedSection(rendered);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((e) => e.taskId).sort()).toEqual(['t1', 't2']);
  });

  it('render emits no body lines when all entries disabled', () => {
    const out = renderManagedSection([
      { taskId: 'x', cronExpression: '0 0 * * *', command: '/bin/true', enabled: false },
    ]);
    expect(out).not.toContain('cct:x');
  });
});
