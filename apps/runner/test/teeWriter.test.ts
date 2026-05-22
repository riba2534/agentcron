import { promises as fs, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TeeWriter } from '@cct/claude-cli';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cct-tee-'));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe('TeeWriter (apps/runner relies on @cct/claude-cli)', () => {
  it('U-RUN-01: 200KB 边界（100 头 + 50 尾） → digest 不含 truncated 标记', () => {
    // 总写入 = headCap + tailCap = 150KB；写 200KB 必然超
    const tee = new TeeWriter({
      headCap: 100 * 1024,
      tailCap: 50 * 1024,
    });
    // 写恰好 150KB → 不应触发 truncated
    const bytes150k = Buffer.alloc(150 * 1024, 65 /* 'A' */);
    tee.write(bytes150k);
    const digest = tee.digest();
    expect(digest).not.toContain('truncated');
    expect(digest.length).toBe(150 * 1024);
  });

  it('U-RUN-02: 写入 500KB → digest 含 [truncated 350000 bytes] 标记', () => {
    const tee = new TeeWriter({
      headCap: 100 * 1024,
      tailCap: 50 * 1024,
    });
    const bytes500k = Buffer.alloc(500 * 1024, 65);
    tee.write(bytes500k);
    const digest = tee.digest();
    // 应该包含 truncated + 数字 350000（500K - 100K - 50K）
    expect(digest).toMatch(/\[truncated 358400 bytes\]/);
    // head 长度 100K，tail 长度 50K，再加分隔符
    expect(digest.length).toBeGreaterThanOrEqual(100 * 1024 + 50 * 1024);
    expect(digest.startsWith('A'.repeat(100))).toBe(true);
  });

  it('U-RUN-03: 写入 6MB → 文件 5MB 处停笔但 digest 完整', async () => {
    const filePath = path.join(tmpDir, 'big.log');
    const fs2 = createWriteStream(filePath);
    const tee = new TeeWriter({
      headCap: 100 * 1024,
      tailCap: 50 * 1024,
      fileStream: fs2,
      fileCap: 5 * 1024 * 1024,
    });
    const bytes6m = Buffer.alloc(6 * 1024 * 1024, 66 /* 'B' */);
    tee.write(bytes6m);
    await new Promise<void>((res) => fs2.end(() => res()));
    const stat = await fs.stat(filePath);
    // 5MB + truncated marker（marker < 100B）
    expect(stat.size).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(stat.size).toBeLessThan(5 * 1024 * 1024 + 200);
    const digest = tee.digest();
    expect(digest).toMatch(/\[truncated/);
    expect(tee.isFileTruncated).toBe(true);
  });

  it('多次小 chunk 写入 → digest 与一次大写等价', () => {
    const a = new TeeWriter({ headCap: 1024, tailCap: 1024 });
    const b = new TeeWriter({ headCap: 1024, tailCap: 1024 });
    const chunks: Buffer[] = [];
    for (let i = 0; i < 100; i++) {
      chunks.push(Buffer.alloc(50, 65 + (i % 26)));
    }
    a.write(Buffer.concat(chunks));
    for (const c of chunks) b.write(c);
    expect(a.digest()).toBe(b.digest());
  });

  it('totalSize=0 → digest 空字符串', () => {
    const t = new TeeWriter({ headCap: 100, tailCap: 50 });
    expect(t.digest()).toBe('');
  });
});
