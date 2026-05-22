import type { NextRequest } from 'next/server';
import { prisma } from '@cct/db';
import { CCT, cct } from '@cct/shared';
import { ClarifyService, type ClarifyEvent } from '@/server/services/ClarifyService';
import { verifySession } from '@/server/trpc/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const encoder = new TextEncoder();

function sseLine(event: ClarifyEvent['event'], data: unknown, id?: number): string {
  const lines: string[] = [];
  if (typeof id === 'number') lines.push(`id: ${id}`);
  lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  lines.push('', '');
  return lines.join('\n');
}

async function readUserId(req: NextRequest): Promise<string | null> {
  const cookie = req.headers.get('cookie') ?? '';
  const match = /(?:^|;\s*)cct_session=([^;]+)/.exec(cookie);
  const token = match?.[1];
  if (!token) return null;
  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await context.params;
  const userId = await readUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ errorCode: CCT.AUTH_SESSION_MISSING }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await prisma.clarificationSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) {
    return new Response(JSON.stringify({ errorCode: CCT.CLARIFY_NOT_FOUND }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let counter = 0;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: ClarifyEvent['event'], data: unknown): void => {
        try {
          counter += 1;
          controller.enqueue(encoder.encode(sseLine(event, data, counter)));
        } catch {
          // controller may be closed (client disconnected); swallow
        }
      };

      const initialTurn = ClarifyService.__getTurnCount(session);
      enqueue('ready', { sessionId: session.id, turn: initialTurn });

      const heartbeat = setInterval(() => {
        enqueue('heartbeat', { ts: Date.now() });
      }, 15_000);

      const abortCtl = new AbortController();
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener(
        'abort',
        () => {
          abortCtl.abort();
          close();
        },
        { once: true },
      );

      try {
        if (session.status === 'in_progress') {
          await ClarifyService.runOneTurn(session.id, {
            onEvent: enqueue,
            signal: abortCtl.signal,
          });
        }
        enqueue('done', { turn: initialTurn + 1 });
      } catch (e: unknown) {
        const err = e as { message?: string; cause?: { errorCode?: string } };
        const code = err.cause?.errorCode ?? CCT.CLARIFY_INTERNAL;
        enqueue('error', { errorCode: code, message: err.message ?? 'unknown' });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// Suppress unused export warning when build static-analyses this file.
export { cct as __cctErrorFactory };
