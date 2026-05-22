import { afterEach, describe, expect, it } from 'vitest';
import { installUncaughtHandler } from '../src/uncaughtHandler.js';

afterEach(() => {
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
});

describe('uncaughtHandler.installUncaughtHandler', () => {
  it('uncaughtException 触发 fatal callback，且 stack 中的 sk-token 被 redact', () => {
    const messages: string[] = [];
    installUncaughtHandler(
      {
        fatal: (m) => {
          messages.push(m);
        },
      },
      { exit: () => {}, exitDelayMs: 0 },
    );
    const err = new Error('boom: token=sk-ant-api03-LEAKME12345678');
    process.emit('uncaughtException', err);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('uncaughtException');
    expect(messages[0]).not.toContain('LEAKME12345678');
    expect(messages[0]).toContain('<redacted>');
  });

  it('unhandledRejection 触发 fatal callback，redact 字符串型 reason', () => {
    const messages: string[] = [];
    installUncaughtHandler(
      {
        fatal: (m) => {
          messages.push(m);
        },
      },
      { exit: () => {}, exitDelayMs: 0 },
    );
    process.emit(
      'unhandledRejection',
      'leaked: Bearer abc.def.ghi-jkl-mno',
      Promise.resolve(),
    );
    expect(messages.some((m) => m.includes('unhandledRejection'))).toBe(true);
    const all = messages.join('\n');
    expect(all).not.toContain('Bearer abc.def.ghi-jkl-mno');
    expect(all).toContain('<redacted>');
  });

  it('Error 型 unhandledRejection 也走 redact', () => {
    const messages: string[] = [];
    installUncaughtHandler(
      {
        fatal: (m) => {
          messages.push(m);
        },
      },
      { exit: () => {}, exitDelayMs: 0 },
    );
    const e = new Error('Bearer abc.def.ghi-jkl-mno-pqr');
    process.emit('unhandledRejection', e, Promise.resolve());
    const all = messages.join('\n');
    expect(all).not.toContain('Bearer abc.def.ghi-jkl-mno-pqr');
    expect(all).toContain('<redacted>');
  });
});
