import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { parseStreamJson } from '../src/streamJson.js';

function streamFrom(...chunks: (string | Buffer)[]): Readable {
  const out = Readable.from(
    (async function* () {
      for (const c of chunks) {
        yield typeof c === 'string' ? Buffer.from(c, 'utf8') : c;
      }
    })(),
  );
  return out;
}

describe('parseStreamJson', () => {
  it('U-CLI-01: 含 result 事件 → 提取 cost / tokens / summary', async () => {
    const stream = streamFrom(
      `{"type":"system","subtype":"init"}\n`,
      `{"type":"assistant","message":{"content":[{"type":"text","text":"hello "}]}}\n`,
      `{"type":"assistant","message":{"content":[{"type":"text","text":"world"}]}}\n`,
      `{"type":"result","total_cost_usd":0.0125,"result":"final answer","usage":{"input_tokens":1234,"output_tokens":567,"cache_read_input_tokens":89}}\n`,
    );
    const r = await parseStreamJson(stream);
    expect(r.costUsd).toBe(0.0125);
    expect(r.inputTokens).toBe(1234);
    expect(r.outputTokens).toBe(567);
    expect(r.cacheReadTokens).toBe(89);
    // result.result 优先于 assistant 累积
    expect(r.summary).toBe('final answer');
  });

  it('U-CLI-02: 混入非 JSON 行 → 不抛错，跳过', async () => {
    const stream = streamFrom(
      `{"type":"system"}\n`,
      `oops not a json\n`,
      `{"type":"assistant","message":{"content":[{"type":"text","text":"a"}]}}\n`,
      `{ broken {\n`,
      `{"type":"result","total_cost_usd":0.5,"usage":{"input_tokens":1,"output_tokens":2}}\n`,
    );
    const r = await parseStreamJson(stream);
    expect(r.costUsd).toBe(0.5);
    expect(r.inputTokens).toBe(1);
    expect(r.outputTokens).toBe(2);
    // 没 result.result，summary 取 assistant 累积
    expect(r.summary).toBe('a');
  });

  it('U-CLI-03: 单行 1MB 不 OOM（按行流式）', async () => {
    // 1MB 超长 text
    const big = 'x'.repeat(1024 * 1024);
    const line =
      `{"type":"assistant","message":{"content":[{"type":"text","text":"${big}"}]}}\n`;
    const stream = streamFrom(line, `{"type":"result","total_cost_usd":0.001}\n`);
    const r = await parseStreamJson(stream);
    expect(r.costUsd).toBe(0.001);
    expect(r.summary?.length).toBe(2000); // 截断到 2KB
  });

  it('U-CLI-04: Unicode 半字符在 chunk 边界 → 解析正确', async () => {
    // 中文「测试」UTF-8 是 6 字节，在第 3 字节切开
    const full = `{"type":"assistant","message":{"content":[{"type":"text","text":"测试"}]}}\n{"type":"result"}\n`;
    const buf = Buffer.from(full, 'utf8');
    const cut = Math.floor(buf.length / 2);
    const a = buf.subarray(0, cut);
    const b = buf.subarray(cut);
    const r = await parseStreamJson(streamFrom(a, b));
    expect(r.summary).toBe('测试');
  });

  it('U-RUN-07: summary 截断到 2KB', async () => {
    const long = 'a'.repeat(5000);
    const stream = streamFrom(
      `{"type":"assistant","message":{"content":[{"type":"text","text":"${long}"}]}}\n`,
      `{"type":"result","total_cost_usd":0.01}\n`,
    );
    const r = await parseStreamJson(stream);
    expect(r.summary?.length).toBe(2000);
  });

  it('容忍空流 → 空 summary，无 cost', async () => {
    const r = await parseStreamJson(streamFrom(''));
    expect(r.summary).toBe('');
    expect(r.costUsd).toBeUndefined();
  });
});
