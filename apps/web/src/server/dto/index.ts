import type {
  AuditLog,
  ClarificationSession,
  ModelAdapter,
  Task,
  TaskRun,
  User,
} from '@cct/db';

export interface UserDTO {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  createdAt: string;
}

export function userDto(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface ModelAdapterDTO {
  id: string;
  alias: string;
  displayName: string;
  baseUrl: string;
  modelId: string;
  trustLevel: 'official' | 'self-hosted' | 'third-party';
  enabled: boolean;
  envExtra: Record<string, unknown>;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  createdAt: string;
  updatedAt: string;
}

function safeJsonObject(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function modelAdapterDto(a: ModelAdapter): ModelAdapterDTO {
  return {
    id: a.id,
    alias: a.alias,
    displayName: a.displayName,
    baseUrl: a.baseUrl,
    modelId: a.modelId,
    trustLevel: a.trustLevel as 'official' | 'self-hosted' | 'third-party',
    enabled: a.enabled,
    envExtra: safeJsonObject(a.envExtraJson),
    lastTestedAt: a.lastTestedAt ? a.lastTestedAt.toISOString() : null,
    lastTestResult: a.lastTestResult,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export interface TaskDTO {
  id: string;
  name: string;
  rawInput: string;
  commandPrompt: string;
  systemPrompt: string | null;
  workingDirectory: string;
  cronExpression: string;
  timezone: string;
  timeoutMs: number;
  maxBudgetUsd: number;
  monthlyBudgetCap: number | null;
  enabled: boolean;
  status: 'active' | 'archived';
  modelAdapterId: string;
  spec: Record<string, unknown>;
  notifyConfig: Record<string, unknown> | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export function taskDto(t: Task): TaskDTO {
  return {
    id: t.id,
    name: t.name,
    rawInput: t.rawInput,
    commandPrompt: t.commandPrompt,
    systemPrompt: t.systemPrompt,
    workingDirectory: t.workingDirectory,
    cronExpression: t.cronExpression,
    timezone: t.timezone,
    timeoutMs: t.timeoutMs,
    maxBudgetUsd: t.maxBudgetUsd,
    monthlyBudgetCap: t.monthlyBudgetCap,
    enabled: t.enabled,
    status: t.status as 'active' | 'archived',
    modelAdapterId: t.modelAdapterId,
    spec: safeJsonObject(t.specJson),
    notifyConfig: t.notifyConfigJson ? safeJsonObject(t.notifyConfigJson) : null,
    lastSyncedAt: t.lastSyncedAt ? t.lastSyncedAt.toISOString() : null,
    lastSyncError: t.lastSyncError,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export type TaskRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'budget_exceeded'
  | 'skipped';

export interface TaskRunDTO {
  id: string;
  taskId: string;
  status: TaskRunStatus;
  triggerSource: 'schedule' | 'manual' | 'retry';
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  stdoutDigest: string | null;
  stderrDigest: string | null;
  summary: string | null;
  logFilePath: string | null;
  skipReason: string | null;
  pid: number | null;
}

export function taskRunDto(r: TaskRun): TaskRunDTO {
  return {
    id: r.id,
    taskId: r.taskId,
    status: r.status as TaskRunStatus,
    triggerSource: r.triggerSource as 'schedule' | 'manual' | 'retry',
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    exitCode: r.exitCode,
    costUsd: r.costUsd,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    stdoutDigest: r.stdoutDigest,
    stderrDigest: r.stderrDigest,
    summary: r.summary,
    logFilePath: r.logFilePath,
    skipReason: r.skipReason,
    pid: r.pid,
  };
}

export interface ClarifySessionDTO {
  id: string;
  modelAdapterId: string;
  rawInput: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  turns: Array<{ role: 'user' | 'assistant'; content: string; ts: number }>;
  finalSpec: Record<string, unknown> | null;
  createdTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function clarifySessionDto(s: ClarificationSession): ClarifySessionDTO {
  let turns: Array<{ role: 'user' | 'assistant'; content: string; ts: number }> = [];
  try {
    const arr = JSON.parse(s.turnsJson) as Array<{
      role: 'user' | 'assistant';
      content: string;
      ts: number;
    }>;
    if (Array.isArray(arr)) turns = arr;
  } catch {
    /* tolerate */
  }
  return {
    id: s.id,
    modelAdapterId: s.modelAdapterId,
    rawInput: s.rawInput,
    status: s.status as 'in_progress' | 'completed' | 'cancelled',
    turns,
    finalSpec: s.finalSpecJson ? safeJsonObject(s.finalSpecJson) : null,
    createdTaskId: s.createdTaskId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export interface AuditLogDTO {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  taskId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export function auditLogDto(a: AuditLog): AuditLogDTO {
  return {
    id: a.id,
    action: a.action,
    payload: safeJsonObject(a.payloadJson),
    taskId: a.taskId,
    ip: a.ip,
    userAgent: a.userAgent,
    createdAt: a.createdAt.toISOString(),
  };
}
