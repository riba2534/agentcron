import { type ChildProcess, spawn } from 'node:child_process';
import readline from 'node:readline';
import { prisma, type ClarificationSession, type ModelAdapter } from '@cct/db';
import { CCT, cct } from '@cct/shared';
import { SecretService } from '@cct/secrets';
import { redact } from '@cct/claude-cli';

export type ClarifyEvent =
  | { event: 'ready'; data: { sessionId: string; turn: number } }
  | { event: 'assistant.delta'; data: { text: string } }
  | { event: 'assistant.json'; data: { schemaMatched: boolean; parsed: unknown } }
  | { event: 'need_more_info'; data: { question: string } }
  | { event: 'ready_to_create'; data: { spec: Record<string, unknown> } }
  | { event: 'error'; data: { errorCode: string; message: string } }
  | { event: 'done'; data: { turn: number } }
  | { event: 'heartbeat'; data: { ts: number } };

export interface ClarifyEventEmitter {
  (event: ClarifyEvent['event'], data: unknown): void;
}

export interface RunOneTurnOptions {
  onEvent: ClarifyEventEmitter;
  signal: AbortSignal;
}

interface TurnRecord {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

const SYSTEM_PROMPT = `You are a task clarification assistant for "AgentCron", a scheduled AI task platform.
Your job: through 1-3 short rounds of dialog, transform a user's natural-language task description into a complete structured spec, OR ask one focused clarification question.

You MUST respond with ONLY a single JSON object (no prose, no markdown, no code fence). Two valid shapes:

1. Need more info:
{"status":"need_more_info","question":"<one focused question in Chinese>"}

2. Ready to create:
{"status":"ready","spec":{"name":"<task name>","cronExpression":"<5-field cron>","timezone":"<IANA tz like Asia/Shanghai>","commandPrompt":"<the actual prompt to run on schedule>","systemPrompt":"<optional system prompt or empty string>","workingDirectory":"<absolute path>","timeoutMs":<integer ms 30000-3600000>,"maxBudgetUsd":<number 0.01-100>,"monthlyBudgetCap":<optional number>}}

Rules:
- Always respond in Chinese for user-facing text but keep JSON keys in English.
- Do NOT include explanations outside JSON.
- Default timezone Asia/Shanghai if not specified.
- Default workingDirectory ~ if not specified.
- Default timeoutMs 900000 (15min) and maxBudgetUsd 1.0 if not specified.
- If the user asks something unrelated to scheduling, treat it as the commandPrompt and gather missing fields.
`;

const activeRuns = new Map<string, AbortController>();
const TURN_TIMEOUT_MS = 120_000;

function getTurnCount(session: ClarificationSession): number {
  try {
    const arr = JSON.parse(session.turnsJson) as TurnRecord[];
    return arr.length;
  } catch {
    return 0;
  }
}

function appendTurns(turnsJson: string, turns: TurnRecord[]): string {
  let arr: TurnRecord[];
  try {
    arr = JSON.parse(turnsJson) as TurnRecord[];
    if (!Array.isArray(arr)) arr = [];
  } catch {
    arr = [];
  }
  arr.push(...turns);
  return JSON.stringify(arr);
}

function buildAppendSystemPrompt(session: ClarificationSession): string {
  const arr = (() => {
    try {
      const v = JSON.parse(session.turnsJson) as TurnRecord[];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  })();
  if (arr.length === 0) return '';
  const lines: string[] = ['### Conversation history'];
  for (const t of arr) {
    lines.push(`- ${t.role}: ${t.content.slice(0, 800)}`);
  }
  return lines.join('\n');
}

function nextUserMessage(session: ClarificationSession): string {
  const arr = (() => {
    try {
      const v = JSON.parse(session.turnsJson) as TurnRecord[];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  })();
  for (let i = arr.length - 1; i >= 0; i--) {
    const t = arr[i];
    if (t && t.role === 'user') return t.content;
  }
  return session.rawInput;
}

interface ParsedClarifyResult {
  status: 'need_more_info' | 'ready';
  question?: string;
  spec?: Record<string, unknown>;
}

function tryExtractJson(text: string): ParsedClarifyResult | null {
  if (!text) return null;
  const candidates: string[] = [];
  const fenceRegex = /```(?:json)?\s*([\s\S]+?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(text)) !== null) {
    if (m[1]) candidates.push(m[1].trim());
  }
  candidates.push(text.trim());
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c) as unknown;
      if (
        v &&
        typeof v === 'object' &&
        'status' in v &&
        ((v as { status: string }).status === 'need_more_info' ||
          (v as { status: string }).status === 'ready')
      ) {
        return v as ParsedClarifyResult;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

interface SpawnArgs {
  initialPrompt: string;
  systemPrompt: string;
  appendSystem: string;
}

function buildArgs(args: SpawnArgs): string[] {
  const out = [
    '-p',
    args.initialPrompt,
    '--output-format',
    'stream-json',
    '--system-prompt',
    args.systemPrompt,
  ];
  if (args.appendSystem.length > 0) {
    out.push('--append-system-prompt', args.appendSystem);
  }
  return out;
}

function buildClarifyEnv(adapter: ModelAdapter, token: string): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH ?? '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
    HOME: process.env.HOME,
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    ANTHROPIC_BASE_URL: adapter.baseUrl,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_MODEL: adapter.modelId,
    ANTHROPIC_DEFAULT_SONNET_MODEL: adapter.modelId,
    ANTHROPIC_DEFAULT_OPUS_MODEL: adapter.modelId,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: adapter.modelId,
    CLAUDE_CODE_DISABLE_KEYCHAIN: '1',
    CLAUDE_CODE_DISABLE_TELEMETRY: '1',
    CI: '1',
    NO_COLOR: '1',
  };
  return env as NodeJS.ProcessEnv;
}

interface SpawnRoundResult {
  finalText: string;
  exitCode: number | null;
}

async function spawnRound(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<SpawnRoundResult> {
  let child: ChildProcess;
  try {
    child = spawn(bin, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (e: unknown) {
    throw cct.internal(CCT.CLARIFY_INTERNAL, (e as Error).message);
  }

  const onAbort = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 3_000).unref();
    }
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });

  let finalText = '';

  const stdoutDone = new Promise<void>((resolve) => {
    if (!child.stdout) return resolve();
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const ev = JSON.parse(trimmed) as { type?: string; result?: string; message?: { content?: Array<{ type: string; text?: string }> } };
        if (ev.type === 'result' && typeof ev.result === 'string') {
          finalText = ev.result;
          onDelta(ev.result);
        } else if (ev.type === 'assistant' && ev.message?.content) {
          for (const c of ev.message.content) {
            if (c && c.type === 'text' && typeof c.text === 'string') {
              finalText += c.text;
              onDelta(c.text);
            }
          }
        }
      } catch {
        // tolerate non-JSON lines
      }
    });
    rl.on('close', () => resolve());
  });

  const stderrChunks: string[] = [];
  const stderrDone = new Promise<void>((resolve) => {
    if (!child.stderr) return resolve();
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(redact(chunk.toString('utf8')));
    });
    child.stderr.on('end', () => resolve());
    child.stderr.on('error', () => resolve());
  });

  const exit = await new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code));
    child.on('error', () => resolve(-1));
  });

  await Promise.allSettled([stdoutDone, stderrDone]);
  signal.removeEventListener('abort', onAbort);

  if (signal.aborted) {
    throw cct.internal(CCT.CLARIFY_TIMEOUT, 'aborted');
  }
  if (exit !== 0 && finalText.length === 0) {
    const err = stderrChunks.join('').slice(0, 2_000);
    throw cct.internal(CCT.CLARIFY_INTERNAL, err || `claude exited ${exit}`);
  }

  return { finalText, exitCode: exit };
}

export const ClarifyService = {
  async start(
    userId: string,
    rawInput: string,
    modelAdapterId: string,
  ): Promise<{ sessionId: string }> {
    const adapter = await prisma.modelAdapter.findFirst({
      where: { id: modelAdapterId, userId },
    });
    if (!adapter || !adapter.enabled) {
      throw cct.failedPrecondition(CCT.CLARIFY_MODEL_UNAVAILABLE);
    }
    const session = await prisma.clarificationSession.create({
      data: {
        userId,
        modelAdapterId,
        rawInput,
        status: 'in_progress',
        turnsJson: '[]',
      },
    });
    return { sessionId: session.id };
  },

  async respond(userId: string, sessionId: string, userMessage: string): Promise<void> {
    const session = await prisma.clarificationSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw cct.notFound(CCT.CLARIFY_NOT_FOUND);
    if (session.status !== 'in_progress') {
      throw cct.failedPrecondition(CCT.CLARIFY_ALREADY_COMPLETED);
    }
    const turns: TurnRecord[] = [{ role: 'user', content: userMessage, ts: Date.now() }];
    await prisma.clarificationSession.update({
      where: { id: sessionId },
      data: { turnsJson: appendTurns(session.turnsJson, turns) },
    });
  },

  async confirm(
    userId: string,
    sessionId: string,
    finalSpec: Record<string, unknown>,
  ): Promise<void> {
    const session = await prisma.clarificationSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw cct.notFound(CCT.CLARIFY_NOT_FOUND);
    if (session.status !== 'in_progress') {
      throw cct.failedPrecondition(CCT.CLARIFY_ALREADY_COMPLETED);
    }
    await prisma.clarificationSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        finalSpecJson: JSON.stringify(finalSpec),
      },
    });
  },

  async cancel(userId: string, sessionId: string): Promise<void> {
    const session = await prisma.clarificationSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw cct.notFound(CCT.CLARIFY_NOT_FOUND);
    activeRuns.get(sessionId)?.abort();
    activeRuns.delete(sessionId);
    if (session.status === 'in_progress') {
      await prisma.clarificationSession.update({
        where: { id: sessionId },
        data: { status: 'cancelled' },
      });
    }
  },

  async list(
    userId: string,
    opts: { status?: 'in_progress' | 'completed' | 'cancelled'; limit?: number },
  ): Promise<{ items: ClarificationSession[] }> {
    const items = await prisma.clarificationSession.findMany({
      where: {
        userId,
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 20,
    });
    return { items };
  },

  async runOneTurn(
    sessionId: string,
    options: RunOneTurnOptions,
  ): Promise<void> {
    const prev = activeRuns.get(sessionId);
    if (prev) {
      prev.abort();
      activeRuns.delete(sessionId);
    }
    const ctl = new AbortController();
    activeRuns.set(sessionId, ctl);
    const onUserAbort = () => ctl.abort();
    options.signal.addEventListener('abort', onUserAbort, { once: true });

    const turnTimeout = setTimeout(() => ctl.abort(), TURN_TIMEOUT_MS);
    turnTimeout.unref();

    try {
      const session = await prisma.clarificationSession.findUnique({ where: { id: sessionId } });
      if (!session) throw cct.notFound(CCT.CLARIFY_NOT_FOUND);
      if (session.status !== 'in_progress') {
        throw cct.failedPrecondition(CCT.CLARIFY_ALREADY_COMPLETED);
      }
      const adapter = await prisma.modelAdapter.findUnique({
        where: { id: session.modelAdapterId },
      });
      if (!adapter || !adapter.enabled) {
        throw cct.failedPrecondition(CCT.CLARIFY_MODEL_UNAVAILABLE);
      }

      const token = await SecretService.decrypt(adapter.authTokenCipher);
      const env = buildClarifyEnv(adapter, token);
      const args = buildArgs({
        initialPrompt: nextUserMessage(session),
        systemPrompt: SYSTEM_PROMPT,
        appendSystem: buildAppendSystemPrompt(session),
      });
      const bin = process.env.CCT_CLAUDE_BIN ?? 'claude';

      const result = await spawnRound(bin, args, env, ctl.signal, (text) => {
        options.onEvent('assistant.delta', { text });
      });

      const parsed = tryExtractJson(result.finalText);
      options.onEvent('assistant.json', {
        schemaMatched: !!parsed,
        parsed: parsed ?? { rawText: result.finalText.slice(0, 1_000) },
      });

      const turns: TurnRecord[] = [
        { role: 'assistant', content: result.finalText.slice(0, 4_000), ts: Date.now() },
      ];
      await prisma.clarificationSession.update({
        where: { id: session.id },
        data: { turnsJson: appendTurns(session.turnsJson, turns) },
      });

      if (parsed) {
        if (parsed.status === 'need_more_info' && parsed.question) {
          options.onEvent('need_more_info', { question: parsed.question });
        } else if (parsed.status === 'ready' && parsed.spec) {
          options.onEvent('ready_to_create', { spec: parsed.spec });
        }
      }
    } finally {
      clearTimeout(turnTimeout);
      options.signal.removeEventListener('abort', onUserAbort);
      const cur = activeRuns.get(sessionId);
      if (cur === ctl) activeRuns.delete(sessionId);
    }
  },

  __getTurnCount: getTurnCount,
  __tryExtractJson: tryExtractJson,
  __activeRuns: activeRuns,
};
