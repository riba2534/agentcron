import { describe, expect, it } from 'vitest';
import { probeKeychain } from '../../src/probes/keychain.js';

// 不实际碰用户 Keychain：在非 darwin 平台 probe 直接 ok。
// 在 darwin 上行为依赖系统状态，仅验证 probe 不会 panic 且返回合法 level。
describe('keychain probe', () => {
  it('does not throw and returns a known level', async () => {
    const r = await probeKeychain();
    expect(['ok', 'warn', 'error']).toContain(r.level);
    expect(r.name).toBe('keychain');
  });
});
