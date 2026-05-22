import { describe, expect, it } from 'vitest';
import {
  parseManagedSection,
  renderManagedSection,
  SECTION_BEGIN,
  SECTION_END,
  spliceManagedSection,
} from '../../src/crontab/sectionMarker.js';

describe('I-SCH-02: managed section idempotency end-to-end', () => {
  it('two consecutive splices produce identical output (single BEGIN/END pair)', () => {
    const initial = '# user\n0 9 * * * echo hi\n';
    const entries = [
      {
        taskId: 'a',
        cronExpression: '0 9 * * *',
        command: '/usr/local/bin/cct-runner --task-id a >> /var/log/cct/a.log 2>&1',
        enabled: true,
      },
      {
        taskId: 'b',
        cronExpression: '*/15 * * * *',
        command: '/usr/local/bin/cct-runner --task-id b >> /var/log/cct/b.log 2>&1',
        enabled: true,
      },
    ];

    const once = spliceManagedSection(initial, entries);
    const twice = spliceManagedSection(once, entries);
    expect(twice).toBe(once);

    const beginMatches = twice.match(new RegExp(SECTION_BEGIN, 'g')) ?? [];
    const endMatches = twice.match(new RegExp(SECTION_END, 'g')) ?? [];
    expect(beginMatches).toHaveLength(1);
    expect(endMatches).toHaveLength(1);
  });

  it('I-SCH-03: arbitrary user lines preserved before and after managed section', () => {
    const initial = [
      '# user header',
      'MAILTO=hep@x',
      '0 0 * * * echo daily',
      '',
      '# trailing user',
      '*/30 * * * * echo halfhour',
    ].join('\n') + '\n';

    const entries = [
      {
        taskId: 't',
        cronExpression: '0 9 * * *',
        command: '/bin/cct-runner --task-id t',
        enabled: true,
      },
    ];

    const out = spliceManagedSection(initial, entries);
    expect(out).toContain('# user header');
    expect(out).toContain('MAILTO=hep@x');
    expect(out).toContain('echo daily');
    expect(out).toContain('# trailing user');
    expect(out).toContain('echo halfhour');
    expect(out).toContain('# cct:t');

    const cleared = spliceManagedSection(out, []);
    expect(cleared).toContain('# user header');
    expect(cleared).toContain('echo daily');
    expect(cleared).not.toContain('# cct:t');
  });

  it('parses round-trip preserving cron expression and taskId', () => {
    const entries = [
      {
        taskId: 'roundtrip',
        cronExpression: '*/5 9-17 * * 1-5',
        command: '/usr/local/bin/cct-runner --task-id roundtrip',
        enabled: true,
      },
    ];
    const rendered = renderManagedSection(entries);
    const parsed = parseManagedSection(rendered);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.taskId).toBe('roundtrip');
    expect(parsed[0]?.cronExpression).toBe('*/5 9-17 * * 1-5');
  });
});
