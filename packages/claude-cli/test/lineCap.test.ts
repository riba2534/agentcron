import { describe, expect, it } from 'vitest';
import { lineCap } from '../src/spawn.js';

describe('lineCap', () => {
  it('短行原样通过', () => {
    const buf = Buffer.from('hello\nworld\n', 'utf8');
    expect(lineCap(buf).toString()).toBe('hello\nworld\n');
  });

  it('单行 50KB → 截断到 10KB + [line-truncated]', () => {
    // 50KB 一行，无换行
    const longLine = Buffer.alloc(50 * 1024, 65 /* 'A' */);
    const out = lineCap(longLine);
    const s = out.toString('utf8');
    expect(s.length).toBeLessThan(50 * 1024);
    expect(s).toContain('[line-truncated]');
    // 前 10KB 是 'A'
    expect(s.startsWith('A'.repeat(10 * 1024))).toBe(true);
  });

  it('超长行夹在两条短行之间', () => {
    const big = 'B'.repeat(15 * 1024);
    const buf = Buffer.from(`short1\n${big}\nshort2\n`, 'utf8');
    const out = lineCap(buf);
    const s = out.toString('utf8');
    expect(s).toContain('short1\n');
    expect(s).toContain('[line-truncated]');
    expect(s).toContain('short2\n');
    expect(s.length).toBeLessThan(buf.length);
  });

  it('chunk 末尾无换行的超长行也被裁切', () => {
    const tail = 'C'.repeat(20 * 1024);
    const buf = Buffer.from(`prefix\n${tail}`, 'utf8');
    const out = lineCap(buf);
    const s = out.toString('utf8');
    expect(s.startsWith('prefix\n')).toBe(true);
    expect(s).toContain('[line-truncated]');
  });

  it('chunk 长度小于 LINE_CAP 时直接返回原 buffer (快路径)', () => {
    const buf = Buffer.from('abc', 'utf8');
    expect(lineCap(buf)).toBe(buf);
  });
});
