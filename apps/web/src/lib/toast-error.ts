'use client';

import { toast as sonnerToast } from 'sonner';
import { describe } from './errorMessages';

interface MaybeTRPCError {
  message?: string;
  data?: { errorCode?: string };
}

export function getErrorCode(err: unknown): string | undefined {
  const e = err as MaybeTRPCError | undefined;
  return e?.data?.errorCode ?? (typeof e?.message === 'string' && e.message.startsWith('CCT_') ? e.message : undefined);
}

export function toastError(err: unknown) {
  const code = getErrorCode(err) ?? 'CCT_UNKNOWN';
  const m = describe(code);
  sonnerToast.error(m.title, m.hint ? { description: m.hint } : undefined);
}
