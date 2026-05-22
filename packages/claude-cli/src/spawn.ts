import { type ChildProcess, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { buildEnv } from './envBuilder.js';
import { parseStreamJson } from './streamJson.js';
import { TeeWriter } from './teeWriter.js';
import { redactBuffer } from './tokenRedactor.js';
import type { SpawnClaudeOptions, SpawnClaudeResult, SpawnClaudeStatus } from './types.js';

// claude -p 子进程包装。
// Source of truth: design/05-backend.md §6.1, §6.5。
//
// 关键不变量：
//  - args 严格按 _terminology.md：v1.0 全局 --dangerously-skip-permissions
//  - timeout: SIGTERM → 5s 后 SIGKILL（设计 R3-05）
//  - stdout 头 100KB + 尾 50KB + 文件 5MB；stderr 总 30KB（头 20K + 尾 10K）
//  - stderr 写入 digest 前过 redactor（设计 §10 R5）
//  - 单行 > 10KB 加 [line-truncated]（在 chunk 级裁切，不破坏 stream-json 解析）

const STDOUT_HEAD_CAP = 100 * 1024; // 100KB
const STDOUT_TAIL_CAP = 50 * 1024; // 50KB
const STDOUT_FILE_CAP = 5 * 1024 * 1024; // 5MB

const STDERR_HEAD_CAP = 20 * 1024; // 20KB
const STDERR_TAIL_CAP = 10 * 1024; // 10KB

const SIGTERM_TO_SIGKILL_MS = 5_000;
const LINE_CAP = 10 * 1024;
const LINE_TRUNCATED_MARK = Buffer.from(' [line-truncated]\n', 'utf8');

function resolveBinPath(opts: SpawnClaudeOptions): string {
  return opts.binPath ?? process.env.CCT_CLAUDE_BIN ?? 'claude';
}

function buildArgs(opts: SpawnClaudeOptions): string[] {
  const t = opts.task;
  const args: string[] = [
    '-p',
    t.commandPrompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-budget-usd',
    String(t.maxBudgetUsd),
    '--add-dir',
    t.workingDirectory,
    '--dangerously-skip-permissions',
  ];
  if (t.systemPrompt && t.systemPrompt.length > 0) {
    args.push('--system-prompt', t.systemPrompt);
  }
  return args;
}

// 在 chunk 级别按行检测超长行，超出 LINE_CAP 加截断标记。
// 注意：仅对当前 chunk 内的换行边界裁切；跨 chunk 的超长行依靠总尾 buf 截断兜底。
export function lineCap(chunk: Buffer): Buffer {
  // 快路径：chunk 整体都不到上限，按单行也不可能超
  if (chunk.length < LINE_CAP) return chunk;
  const out: Buffer[] = [];
  let lineStart = 0;
  for (let i = 0; i < chunk.length; i++) {
    if (chunk[i] === 0x0a /* \n */) {
      const lineLen = i - lineStart;
      if (lineLen > LINE_CAP) {
        out.push(chunk.subarray(lineStart, lineStart + LINE_CAP));
        out.push(LINE_TRUNCATED_MARK);
      } else {
        out.push(chunk.subarray(lineStart, i + 1));
      }
      lineStart = i + 1;
    }
  }
  if (lineStart < chunk.length) {
    const tail = chunk.subarray(lineStart);
    if (tail.length > LINE_CAP) {
      out.push(tail.subarray(0, LINE_CAP));
      out.push(LINE_TRUNCATED_MARK);
    } else {
      out.push(tail);
    }
  }
  return Buffer.concat(out);
}

export async function spawnClaude(opts: SpawnClaudeOptions): Promise<SpawnClaudeResult> {
  mkdirSync(opts.logDir, { recursive: true });
  const logFilePath = path.join(opts.logDir, `${opts.run.id}.log`);
  const fileStream = createWriteStream(logFilePath, { flags: 'w', mode: 0o600 });

  const stdoutTee = new TeeWriter({
    headCap: STDOUT_HEAD_CAP,
    tailCap: STDOUT_TAIL_CAP,
    fileStream,
    fileCap: STDOUT_FILE_CAP,
  });
  const stderrTee = new TeeWriter({
    headCap: STDERR_HEAD_CAP,
    tailCap: STDERR_TAIL_CAP,
  });

  const env = buildEnv({
    task: opts.task,
    adapter: opts.adapter,
    token: opts.token,
  });
  const bin = resolveBinPath(opts);
  const args = buildArgs(opts);

  let child: ChildProcess;
  try {
    child = spawn(bin, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (e: unknown) {
    fileStream.end();
    if (opts.onSpawnError) opts.onSpawnError(e as Error);
    return {
      status: 'failed',
      exitCode: -1,
      endedAt: new Date(),
      stdoutDigest: '',
      stderrDigest: `spawn failed: ${(e as Error).message}`,
      logFilePath,
    };
  }

  // 复制一份 stdout 给 stream-json parser；teeWriter 处理 digest + 日志文件
  const parserPipe = new PassThrough();
  const childStdout = child.stdout;
  const childStderr = child.stderr;

  const stdoutDone = new Promise<void>((resolve) => {
    if (!childStdout) {
      parserPipe.end();
      resolve();
      return;
    }
    childStdout.on('data', (chunk: Buffer) => {
      const capped = lineCap(chunk);
      stdoutTee.write(capped);
      parserPipe.write(capped);
    });
    childStdout.on('end', () => {
      parserPipe.end();
      resolve();
    });
    childStdout.on('error', () => {
      parserPipe.end();
      resolve();
    });
  });

  const stderrDone = new Promise<void>((resolve) => {
    if (!childStderr) {
      resolve();
      return;
    }
    childStderr.on('data', (chunk: Buffer) => {
      const redacted = redactBuffer(chunk);
      const capped = lineCap(redacted);
      stderrTee.write(capped);
    });
    childStderr.on('end', () => resolve());
    childStderr.on('error', () => resolve());
  });

  // stream-json 解析与子进程并行
  const streamPromise = parseStreamJson(parserPipe).catch(() => ({}) as Awaited<
    ReturnType<typeof parseStreamJson>
  >);

  // 并发拉起：超时 / abort / 退出
  let timedOut = false;
  let aborted = false;

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    if (!child.killed) {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, SIGTERM_TO_SIGKILL_MS).unref();
    }
  }, opts.task.timeoutMs).unref();

  const onAbort = () => {
    aborted = true;
    if (!child.killed) {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, SIGTERM_TO_SIGKILL_MS).unref();
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  const exitInfo = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.on('exit', (code, signal) => resolve({ code, signal }));
      child.on('error', (err) => {
        // ENOENT 等 spawn 错（虽然 spawn 同步阶段抛过了）
        if (opts.onSpawnError) opts.onSpawnError(err);
        resolve({ code: -1, signal: null });
      });
    },
  );

  clearTimeout(timeoutHandle);
  if (opts.signal) opts.signal.removeEventListener('abort', onAbort);

  await Promise.allSettled([stdoutDone, stderrDone]);
  const stream = await streamPromise;

  await new Promise<void>((resolve) => {
    fileStream.end(() => resolve());
  });

  let status: SpawnClaudeStatus;
  if (timedOut || aborted) {
    status = 'timeout';
  } else if (
    typeof stream.costUsd === 'number' &&
    typeof opts.task.maxBudgetUsd === 'number' &&
    stream.costUsd >= opts.task.maxBudgetUsd
  ) {
    status = 'budget_exceeded';
  } else if (exitInfo.code === 0) {
    status = 'succeeded';
  } else {
    status = 'failed';
  }

  return {
    status,
    exitCode: exitInfo.code,
    endedAt: new Date(),
    costUsd: stream.costUsd,
    inputTokens: stream.inputTokens,
    outputTokens: stream.outputTokens,
    cacheReadTokens: stream.cacheReadTokens,
    stdoutDigest: stdoutTee.digest(),
    stderrDigest: stderrTee.digest(),
    summary: stream.summary,
    logFilePath,
  };
}
