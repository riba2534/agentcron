import type { BuildEnvOptions } from './types.js';

// 16-alias 模板 env 注入。
// Source of truth: design/05-backend.md §6.2。
//
// 关键不变量：
//  1) ANTHROPIC_DEFAULT_{SONNET,OPUS,HAIKU}_MODEL 三项必须 === ANTHROPIC_MODEL
//     （Claude Code 在没有显式 model 时根据 default 选取，必须一致）。
//  2) 永远不能把 token 输出到 stdout / console。
//  3) envExtraJson 非法 JSON 时不抛错，只记一个 stderr warn。
//  4) 输出对象不携带任何 process.env 中的敏感泄露（仅 PATH / HOME 透传）。

interface ParsedExtra {
  values: Record<string, string>;
  parseError?: string;
}

function parseEnvExtra(raw: string | null | undefined): ParsedExtra {
  if (!raw || raw.trim() === '' || raw.trim() === '{}') return { values: {} };
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { values: {}, parseError: 'envExtraJson is not an object' };
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') {
        out[k] = v;
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        out[k] = String(v);
      }
      // 跳过非 string/number/boolean 字段（避免 [object Object]）
    }
    return { values: out };
  } catch (e: unknown) {
    return { values: {}, parseError: (e as Error).message };
  }
}

export function buildEnv(opts: BuildEnvOptions): NodeJS.ProcessEnv {
  const inherited = opts.inheritedEnv ?? process.env;
  const extra = parseEnvExtra(opts.adapter.envExtraJson);
  if (extra.parseError) {
    // Stage 2 仍未引入 logger，写到 stderr 即可（runner 会过 redactor）。
    process.stderr.write(
      `[envBuilder] envExtraJson parse failed, ignoring: ${extra.parseError}\n`,
    );
  }

  const baseEnv = {
    PATH: inherited.PATH ?? '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
    HOME: inherited.HOME,
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    TZ: opts.task.timezone,

    ANTHROPIC_BASE_URL: opts.adapter.baseUrl,
    ANTHROPIC_AUTH_TOKEN: opts.token,
    ANTHROPIC_MODEL: opts.adapter.modelId,
    // 三个 DEFAULT_*_MODEL fallback 到 ANTHROPIC_MODEL；
    // 用户在 envExtra 里显式设置可以覆盖，envExtra 设为空字符串 → 不进 envExtra（前端过滤）
    ANTHROPIC_DEFAULT_SONNET_MODEL: opts.adapter.modelId,
    ANTHROPIC_DEFAULT_OPUS_MODEL: opts.adapter.modelId,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: opts.adapter.modelId,

    // adapter 自定义环境变量（包括 CLAUDE_CODE_NO_FLICKER / API_TIMEOUT_MS /
    // CLAUDE_CODE_EFFORT_LEVEL / ANTHROPIC_CUSTOM_HEADERS / ENABLE_TOOL_SEARCH 等）
    // 完全由用户在「模型管理」表单里维护
    ...extra.values,

    // 强制安全项必须放最后，envExtra 不能覆盖
    CLAUDE_CODE_DISABLE_KEYCHAIN: '1',
    CLAUDE_CODE_DISABLE_TELEMETRY: '1',
    CI: '1',
    NO_COLOR: '1',
  } as Record<string, string | undefined>;

  return baseEnv as NodeJS.ProcessEnv;
}
