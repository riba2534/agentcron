import { redact } from '@cct/claude-cli';

// crash log 必须先过 redactor 再写。
// Source of truth: design/05-backend.md §10 R5（c/d）

export interface CrashLogger {
  fatal(msg: string): void;
}

export interface InstallOptions {
  // 测试钩子：默认 process.exit；测试中可注入 noop
  exit?: (code: number) => void;
  // 默认 500ms 后 process.exit；测试中可注入 0
  exitDelayMs?: number;
}

export function installUncaughtHandler(
  logger: CrashLogger,
  opts: InstallOptions = {},
): void {
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const delay = opts.exitDelayMs ?? 500;

  process.on('uncaughtException', (err: Error) => {
    const stack = err.stack ?? `${err.name}: ${err.message}`;
    logger.fatal(`[runner] uncaughtException: ${redact(stack)}`);
    if (delay > 0) {
      setTimeout(() => exit(98), delay).unref();
    } else {
      // 0 → 不调用 exit（用于测试）
    }
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const text =
      reason instanceof Error
        ? reason.stack ?? reason.message
        : typeof reason === 'string'
          ? reason
          : (() => {
              try {
                return JSON.stringify(reason);
              } catch {
                return String(reason);
              }
            })();
    logger.fatal(`[runner] unhandledRejection: ${redact(text)}`);
  });
}
