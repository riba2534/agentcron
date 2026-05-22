import { describe, expect, it, vi } from 'vitest';
import { buildEnv } from '../src/envBuilder.js';

const baseAdapter = {
  baseUrl: 'https://api.example.com',
  modelId: 'kimi-k2.6',
  envExtraJson: '{}',
};
const baseTask = { timezone: 'Asia/Shanghai' };

describe('buildEnv', () => {
  it('U-CLI-05: ANTHROPIC_DEFAULT_*_MODEL 三项与 ANTHROPIC_MODEL 一致', () => {
    const env = buildEnv({ task: baseTask, adapter: baseAdapter, token: 'sk-ant-api03-XYZ' });
    expect(env.ANTHROPIC_MODEL).toBe('kimi-k2.6');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('kimi-k2.6');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('kimi-k2.6');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('kimi-k2.6');
  });

  it('U-CLI-05b: 设置 disable / NO_COLOR / CI / TZ', () => {
    const env = buildEnv({ task: baseTask, adapter: baseAdapter, token: 'sk-x' });
    expect(env.CLAUDE_CODE_DISABLE_KEYCHAIN).toBe('1');
    expect(env.CLAUDE_CODE_DISABLE_TELEMETRY).toBe('1');
    expect(env.CI).toBe('1');
    expect(env.NO_COLOR).toBe('1');
    expect(env.LANG).toBe('en_US.UTF-8');
    expect(env.LC_ALL).toBe('en_US.UTF-8');
    expect(env.TZ).toBe('Asia/Shanghai');
  });

  it('U-CLI-06: 不泄漏 ANTHROPIC_AUTH_TOKEN 到 process.stdout / console', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const SECRET = 'sk-ant-api03-LEAKME12345678';
    const env = buildEnv({
      task: baseTask,
      adapter: baseAdapter,
      token: SECRET,
    });
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe(SECRET);

    // 校验所有 spy 都没把 SECRET 输出过
    for (const spy of [stdoutSpy, stderrSpy, consoleSpy, consoleInfoSpy]) {
      const calls = spy.mock.calls.flat().map((c) =>
        typeof c === 'string' ? c : Buffer.isBuffer(c) ? c.toString('utf8') : String(c),
      );
      for (const c of calls) {
        expect(c).not.toContain(SECRET);
      }
    }

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    consoleSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  it('U-CLI-07: envExtraJson 非法 JSON 不抛错，主流程依旧正确', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() =>
      buildEnv({
        task: baseTask,
        adapter: { ...baseAdapter, envExtraJson: 'not valid json' },
        token: 'tk',
      }),
    ).not.toThrow();
    const env = buildEnv({
      task: baseTask,
      adapter: { ...baseAdapter, envExtraJson: 'oops' },
      token: 'tk',
    });
    expect(env.ANTHROPIC_MODEL).toBe('kimi-k2.6');
    // 必有一次 warn 写入 stderr
    const writes = stderrSpy.mock.calls.flat().map((c) =>
      typeof c === 'string' ? c : Buffer.isBuffer(c) ? c.toString('utf8') : String(c),
    );
    expect(writes.some((w) => w.includes('envExtraJson parse failed'))).toBe(true);
    stderrSpy.mockRestore();
  });

  it('envExtraJson 合法对象时合并；envExtra 不能覆盖禁用项', () => {
    const env = buildEnv({
      task: baseTask,
      adapter: {
        ...baseAdapter,
        envExtraJson: JSON.stringify({
          'HTTP-Referer': 'https://example.com',
          NO_COLOR: '0', // 试图反向覆盖
          CI: 'false',
        }),
      },
      token: 'tk',
    });
    expect(env['HTTP-Referer']).toBe('https://example.com');
    expect(env.NO_COLOR).toBe('1'); // 禁用项后 spread 覆盖
    expect(env.CI).toBe('1');
  });

  it('inheritedEnv 提供 PATH / HOME 时透传', () => {
    const env = buildEnv({
      task: baseTask,
      adapter: baseAdapter,
      token: 'tk',
      inheritedEnv: { PATH: '/custom/bin', HOME: '/Users/cct' },
    });
    expect(env.PATH).toBe('/custom/bin');
    expect(env.HOME).toBe('/Users/cct');
  });
});
