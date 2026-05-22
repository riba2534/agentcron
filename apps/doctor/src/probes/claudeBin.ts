// claudeBin probe — `claude` 在 PATH 中且能执行 `--version`。
// Source of truth: design/05-backend.md §7.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProbeResult } from '../types.js';

const execFileAsync = promisify(execFile);

const PROBE_NAME = 'claudeBin';

const REMEDIATION = [
  'Install Claude Code CLI:',
  '  - npm install -g @anthropic-ai/claude-code',
  '  - or: https://docs.claude.com/en/docs/claude-code/quickstart',
  'Then ensure `claude` is on $PATH for this shell.',
].join('\n');

export async function probeClaudeBin(): Promise<ProbeResult> {
  const claudeBin = process.env.CCT_CLAUDE_BIN ?? 'claude';
  // 1) 解析路径
  let resolvedPath: string | undefined;
  if (claudeBin.includes('/')) {
    resolvedPath = claudeBin;
  } else {
    try {
      const { stdout } = await execFileAsync('which', [claudeBin]);
      resolvedPath = stdout.trim() || undefined;
    } catch {
      return {
        name: PROBE_NAME,
        level: 'error',
        message: `\`${claudeBin}\` not found on PATH.`,
        remediation: REMEDIATION,
      };
    }
  }
  if (!resolvedPath) {
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `\`${claudeBin}\` resolved to empty path.`,
      remediation: REMEDIATION,
    };
  }
  // 2) 执行 --version
  try {
    const { stdout } = await execFileAsync(resolvedPath, ['--version'], {
      timeout: 10_000,
    });
    return {
      name: PROBE_NAME,
      level: 'ok',
      message: stdout.trim() || 'claude --version returned empty output',
      details: { path: resolvedPath },
    };
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    return {
      name: PROBE_NAME,
      level: 'error',
      message: `\`${resolvedPath} --version\` failed: ${err.stderr || err.message}`,
      remediation: REMEDIATION,
      details: { path: resolvedPath },
    };
  }
}
