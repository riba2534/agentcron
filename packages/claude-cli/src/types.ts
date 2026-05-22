import type { ModelAdapter, Task, TaskRun } from '@cct/db';

export interface StreamJsonResult {
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  summary?: string;
}

export interface BuildEnvOptions {
  task: Pick<Task, 'timezone'>;
  adapter: Pick<ModelAdapter, 'baseUrl' | 'modelId' | 'envExtraJson'>;
  token: string;
  inheritedEnv?: NodeJS.ProcessEnv;
}

export interface SpawnClaudeOptions {
  task: Task;
  adapter: ModelAdapter;
  token: string;
  run: Pick<TaskRun, 'id'>;
  logDir: string;
  signal?: AbortSignal;
  // 测试钩子：允许测试用 stub bin 替代 'claude'
  binPath?: string;
  // 测试钩子：spawn 自身错误时 callback
  onSpawnError?: (err: Error) => void;
}

export type SpawnClaudeStatus =
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'budget_exceeded';

export interface SpawnClaudeResult {
  status: SpawnClaudeStatus;
  exitCode: number | null;
  endedAt: Date;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  stdoutDigest: string;
  stderrDigest: string;
  summary?: string;
  logFilePath: string;
}
