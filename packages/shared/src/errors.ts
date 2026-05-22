import { TRPCError } from '@trpc/server';

// ── 错误码常量集（CCT_*）────────────────────────────────────────
// Source of truth: design/05-backend.md §9
export const CCT = {
  // CCT_AUTH_*
  AUTH_EMAIL_TAKEN: 'CCT_AUTH_EMAIL_TAKEN',
  AUTH_WEAK_PASSWORD: 'CCT_AUTH_WEAK_PASSWORD',
  AUTH_INVALID_CREDENTIALS: 'CCT_AUTH_INVALID_CREDENTIALS',
  AUTH_SESSION_MISSING: 'CCT_AUTH_SESSION_MISSING',
  AUTH_SESSION_EXPIRED: 'CCT_AUTH_SESSION_EXPIRED',
  AUTH_RATE_LIMIT: 'CCT_AUTH_RATE_LIMIT',

  // CCT_TASK_*
  TASK_NOT_FOUND: 'CCT_TASK_NOT_FOUND',
  TASK_DUPLICATE_NAME: 'CCT_TASK_DUPLICATE_NAME',
  TASK_INVALID_CRON: 'CCT_TASK_INVALID_CRON',
  TASK_DISABLED: 'CCT_TASK_DISABLED',
  TASK_ARCHIVED: 'CCT_TASK_ARCHIVED',
  TASK_INVALID_TIMEZONE: 'CCT_TASK_INVALID_TIMEZONE',
  TASK_TIMEOUT_OUT_OF_RANGE: 'CCT_TASK_TIMEOUT_OUT_OF_RANGE',
  TASK_BUDGET_INVALID: 'CCT_TASK_BUDGET_INVALID',

  // CCT_CLARIFY_*
  CLARIFY_NOT_FOUND: 'CCT_CLARIFY_NOT_FOUND',
  CLARIFY_NOT_READY: 'CCT_CLARIFY_NOT_READY',
  CLARIFY_ALREADY_COMPLETED: 'CCT_CLARIFY_ALREADY_COMPLETED',
  CLARIFY_MODEL_UNAVAILABLE: 'CCT_CLARIFY_MODEL_UNAVAILABLE',
  CLARIFY_TIMEOUT: 'CCT_CLARIFY_TIMEOUT',
  CLARIFY_INTERNAL: 'CCT_CLARIFY_INTERNAL',

  // CCT_SCHEDULER_*
  SCHEDULER_BOOTSTRAP_FAILED: 'CCT_SCHEDULER_BOOTSTRAP_FAILED',
  SCHEDULER_CRONTAB_WRITE_FAILED: 'CCT_SCHEDULER_CRONTAB_WRITE_FAILED',
  SCHEDULER_CRON_TOO_DENSE: 'CCT_SCHEDULER_CRON_TOO_DENSE',
  SCHEDULER_LOCK_TIMEOUT: 'CCT_SCHEDULER_LOCK_TIMEOUT',
  SCHEDULER_SYNC_FAILED: 'CCT_SCHEDULER_SYNC_FAILED',
  SCHEDULER_UNSUPPORTED_PLATFORM: 'CCT_SCHEDULER_UNSUPPORTED_PLATFORM',

  // CCT_RUNNER_*
  RUNNER_TASK_NOT_FOUND: 'CCT_RUNNER_TASK_NOT_FOUND',
  RUNNER_SPAWN_FAILED: 'CCT_RUNNER_SPAWN_FAILED',
  RUNNER_TIMEOUT: 'CCT_RUNNER_TIMEOUT',
  RUNNER_LOCK_BUSY: 'CCT_RUNNER_LOCK_BUSY',
  RUNNER_DECRYPT_FAILED: 'CCT_RUNNER_DECRYPT_FAILED',
  RUNNER_DB_UNAVAILABLE: 'CCT_RUNNER_DB_UNAVAILABLE',
  RUNNER_LOG_WRITE_FAILED: 'CCT_RUNNER_LOG_WRITE_FAILED',
  RUNNER_BUDGET_EXCEEDED: 'CCT_RUNNER_BUDGET_EXCEEDED',

  // CCT_MODEL_*
  MODEL_NOT_FOUND: 'CCT_MODEL_NOT_FOUND',
  MODEL_ALIAS_TAKEN: 'CCT_MODEL_ALIAS_TAKEN',
  MODEL_INVALID_URL: 'CCT_MODEL_INVALID_URL',
  MODEL_IN_USE: 'CCT_MODEL_IN_USE',
  MODEL_TEST_FAILED: 'CCT_MODEL_TEST_FAILED',

  // CCT_RUN_* / CCT_DOCTOR_* / CCT_SECRETS_*
  RUN_NOT_FOUND: 'CCT_RUN_NOT_FOUND',
  RUN_LOG_MISSING: 'CCT_RUN_LOG_MISSING',
  DOCTOR_RUN_FAILED: 'CCT_DOCTOR_RUN_FAILED',
  DOCTOR_TCC_BLOCKED: 'CCT_DOCTOR_TCC_BLOCKED',
  SECRETS_KEYCHAIN_UNAVAILABLE: 'CCT_SECRETS_KEYCHAIN_UNAVAILABLE',
  SECRETS_DECRYPT_FAILED: 'CCT_SECRETS_DECRYPT_FAILED',
  SECRETS_UNKNOWN_VERSION: 'CCT_SECRETS_UNKNOWN_VERSION',
  SECRETS_MASTER_KEY_MISSING: 'CCT_SECRETS_MASTER_KEY_MISSING',

  // CCT_PROMPT_*
  PROMPT_SUSPICIOUS_INJECTION: 'CCT_PROMPT_SUSPICIOUS_INJECTION',
} as const;

export type CCTErrorCode = (typeof CCT)[keyof typeof CCT];

// ── 错误工厂（cct.* 命名空间）────────────────────────────────────
function buildCause(errorCode: string, detail?: unknown) {
  return detail === undefined ? { errorCode } : { errorCode, detail };
}

export const cct = {
  notFound: (errorCode: string, detail?: unknown) =>
    new TRPCError({ code: 'NOT_FOUND', message: errorCode, cause: buildCause(errorCode, detail) }),
  badRequest: (errorCode: string, detail?: unknown) =>
    new TRPCError({
      code: 'BAD_REQUEST',
      message: errorCode,
      cause: buildCause(errorCode, detail),
    }),
  unauthorized: (errorCode: string, detail?: unknown) =>
    new TRPCError({
      code: 'UNAUTHORIZED',
      message: errorCode,
      cause: buildCause(errorCode, detail),
    }),
  forbidden: (errorCode: string, detail?: unknown) =>
    new TRPCError({ code: 'FORBIDDEN', message: errorCode, cause: buildCause(errorCode, detail) }),
  conflict: (errorCode: string, detail?: unknown) =>
    new TRPCError({ code: 'CONFLICT', message: errorCode, cause: buildCause(errorCode, detail) }),
  failedPrecondition: (errorCode: string, detail?: unknown) =>
    new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: errorCode,
      cause: buildCause(errorCode, detail),
    }),
  tooMany: (errorCode: string, detail?: unknown) =>
    new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: errorCode,
      cause: buildCause(errorCode, detail),
    }),
  internal: (errorCode: string, detail?: unknown) =>
    new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: errorCode,
      cause: buildCause(errorCode, detail),
    }),
};
