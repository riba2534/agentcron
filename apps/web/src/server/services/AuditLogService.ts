import { prisma } from '@cct/db';
import { redact } from '@cct/claude-cli';

const SENSITIVE_KEY_PATTERNS: ReadonlyArray<RegExp> = [
  /token/i,
  /secret/i,
  /password/i,
  /api[_-]?key/i,
  /authorization/i,
  /credential/i,
  /cipher/i,
];

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((p) => p.test(k));
      out[k] = isSensitive ? '<redacted>' : redactValue(v);
    }
    return out;
  }
  return value;
}

export interface AuditLogContext {
  userId?: string | null;
  taskId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export const AuditLogService = {
  async log(action: string, payload: Record<string, unknown>, ctx: AuditLogContext): Promise<void> {
    const safe = redactValue(payload);
    await prisma.auditLog.create({
      data: {
        action,
        payloadJson: JSON.stringify(safe),
        userId: ctx.userId ?? null,
        taskId: ctx.taskId ?? null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
  },

  __redactValue: redactValue,
};
