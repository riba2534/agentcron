import { describe, expect, it } from 'vitest';
import { redact, redactBuffer } from '../src/tokenRedactor.js';

describe('tokenRedactor', () => {
  it('U-RUN-08: 替换 sk-ant-api03-XXX → <redacted>', () => {
    const input =
      'oops leaked: sk-ant-api03-LEAKME12345678ABC and trailing text';
    const out = redact(input);
    expect(out).not.toContain('LEAKME12345678');
    expect(out).toContain('<redacted>');
  });

  it('替换多种 token 格式', () => {
    expect(redact('Bearer abc.def.ghi-jkl')).toContain('<redacted>');
    expect(redact('aigateway://user:pass@host/path?k=v ok')).toContain('<redacted>');
    expect(redact('token tp-XYZ_1234567890ABC done')).toContain('<redacted>');
    expect(redact('Bearer abc.def.ghi-jkl')).not.toContain('abc.def.ghi-jkl');
    expect(redact('aigateway://user:pass@host')).not.toContain('user:pass');
  });

  it('短串不误伤', () => {
    expect(redact('sk-ab')).toBe('sk-ab'); // 长度 < 10 不命中
    expect(redact('hello world')).toBe('hello world');
  });

  it('redactBuffer 命中时返回新 Buffer，未命中时返回原 Buffer', () => {
    const safe = Buffer.from('hello\n', 'utf8');
    expect(redactBuffer(safe)).toBe(safe);
    const danger = Buffer.from('sk-ant-api03-LEAKME12345678', 'utf8');
    const out = redactBuffer(danger);
    expect(out.toString('utf8')).toBe('<redacted>');
  });

  it('多次出现同一 token 全部替换', () => {
    const input =
      'key1=sk-1234567890ABC and key2=sk-1234567890ABC and tp-9876543210XYZ';
    const out = redact(input);
    expect(out.match(/<redacted>/g)?.length).toBe(3);
  });
});
