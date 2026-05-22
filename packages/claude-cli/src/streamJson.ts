import readline from 'node:readline';
import type { Readable } from 'node:stream';
import type { StreamJsonResult } from './types.js';

// stream-json 解析。
// Source of truth: design/05-backend.md §6.4。
//
// 关键不变量：
//  - readline 按行流式，单行 1MB 不 OOM (U-CLI-03)
//  - 容忍非 JSON 行不抛错 (U-CLI-02)
//  - Unicode 边界（chunk 中切到半字符）正确（readline 自身按 utf8 解码）(U-CLI-04)
//  - summary 取 finalText 前 2000 字（U-RUN-07）
//
// 输入 stream 必须是 utf8 文本流（child_process.spawn stdout 默认）。

interface ResultEvent {
  type: 'result';
  total_cost_usd?: number;
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

interface AssistantContentText {
  type: 'text';
  text: string;
}

interface AssistantEvent {
  type: 'assistant';
  message?: {
    content?: AssistantContentText[];
  };
}

const SUMMARY_LIMIT = 2000;

function isResultEvent(ev: unknown): ev is ResultEvent {
  return typeof ev === 'object' && ev !== null && (ev as { type?: unknown }).type === 'result';
}

function isAssistantEvent(ev: unknown): ev is AssistantEvent {
  return typeof ev === 'object' && ev !== null && (ev as { type?: unknown }).type === 'assistant';
}

export async function parseStreamJson(stream: Readable): Promise<StreamJsonResult> {
  // crlfDelay: Infinity 让 readline 把 \r\n 视为单一换行
  // U-CLI-04 关键：readline 默认按 utf8 decode，半字符自动跨 chunk 拼接
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const result: StreamJsonResult = {};
  let finalText = '';

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev: unknown;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      // U-CLI-02: 容忍非 JSON 行
      continue;
    }
    if (isResultEvent(ev)) {
      if (typeof ev.total_cost_usd === 'number') result.costUsd = ev.total_cost_usd;
      if (ev.usage) {
        if (typeof ev.usage.input_tokens === 'number') result.inputTokens = ev.usage.input_tokens;
        if (typeof ev.usage.output_tokens === 'number')
          result.outputTokens = ev.usage.output_tokens;
        if (typeof ev.usage.cache_read_input_tokens === 'number')
          result.cacheReadTokens = ev.usage.cache_read_input_tokens;
      }
      if (typeof ev.result === 'string' && ev.result.length > 0) {
        // result 事件自带 final text（claude --output-format stream-json 的约定）
        finalText = ev.result;
      }
    } else if (isAssistantEvent(ev)) {
      const content = ev.message?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c && c.type === 'text' && typeof c.text === 'string') {
            finalText += c.text;
          }
        }
      }
    }
  }

  result.summary = finalText.slice(0, SUMMARY_LIMIT);
  return result;
}
