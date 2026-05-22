// Token redactor for stderr / log / AuditLog payload。
// Source of truth: design/05-backend.md §8.3 (token 红线) + §10 R5。
// 任何写入持久化通道（DB digest / 日志文件 / AuditLog payload）的字符串
// 必须先过 redact()，避免 sk-/tp-/aigateway:// / Bearer 等格式的 token 泄漏。

const PATTERNS: ReadonlyArray<RegExp> = [
  // Anthropic / OpenAI 风格 sk- 前缀（最常见）
  /sk-[A-Za-z0-9_.-]{10,}/g,
  // 内部 super-relay token：tp-xxx
  /tp-[A-Za-z0-9_.-]{10,}/g,
  // AI Gateway URI 含凭证
  /aigateway:\/\/[^\s'"<>]+/g,
  // HTTP Authorization 头里的 Bearer
  /Bearer\s+[A-Za-z0-9._-]+/g,
];

const REDACTED = '<redacted>';

export function redact(text: string): string {
  if (!text) return text;
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

export function redactBuffer(chunk: Buffer): Buffer {
  // 仅在写入字符通道（digest / 日志文件）前调用。
  // 二进制数据请勿调用此函数。
  const text = chunk.toString('utf8');
  const redacted = redact(text);
  if (redacted === text) return chunk;
  return Buffer.from(redacted, 'utf8');
}
