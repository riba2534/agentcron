import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { CCT, cct } from '@cct/shared';
import { verifySession } from './session';

export interface Context {
  req: Request;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  resHeaders: Headers;
}

function extractIp(req: Request): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  );
}

export async function createContext({
  req,
  resHeaders,
}: FetchCreateContextFnOptions): Promise<Context> {
  const cookie = req.headers.get('cookie') ?? '';
  const match = /(?:^|;\s*)cct_session=([^;]+)/.exec(cookie);
  const token = match?.[1];
  const userId = token ? await verifySession(token).catch(() => null) : null;
  return {
    req,
    userId,
    ip: extractIp(req),
    userAgent: req.headers.get('user-agent'),
    resHeaders,
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const isZod = error.cause instanceof ZodError;
    const causeRecord =
      typeof error.cause === 'object' && error.cause !== null
        ? (error.cause as unknown as Record<string, unknown>)
        : null;
    const errorCode =
      typeof causeRecord?.errorCode === 'string' ? (causeRecord.errorCode as string) : undefined;
    return {
      ...shape,
      data: {
        ...shape.data,
        errorCode,
        zodIssues: isZod ? (error.cause as ZodError).issues : undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw cct.unauthorized(CCT.AUTH_SESSION_MISSING);
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

// 给上层用的 alias
export type ProtectedContext = Context & { userId: string };
export { TRPCError };
