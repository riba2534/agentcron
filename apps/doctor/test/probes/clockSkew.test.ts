import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { probeClockSkew } from '../../src/probes/clockSkew.js';

// 不依赖外网 / 实际 sntp 行为。仅验证：当 sntp 不可用时 probe 不会 panic。
describe('clockSkew probe', () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.CCT_NTP_SERVER;
    process.env.CCT_NTP_SERVER = '127.0.0.1';
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CCT_NTP_SERVER;
    else process.env.CCT_NTP_SERVER = prev;
  });

  it('does not throw and returns a level', async () => {
    const r = await probeClockSkew();
    expect(['ok', 'warn']).toContain(r.level);
    expect(r.name).toBe('clockSkew');
  });
});
