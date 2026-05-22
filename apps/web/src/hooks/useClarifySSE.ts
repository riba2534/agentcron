'use client';

import { useEffect, useRef } from 'react';
import { useClarifySession, type ParsedTaskSpec } from '@/stores/clarifySessionStore';

const MAX_RETRY = 3;
const CHAR_INTERVAL_MS = 25;

interface UseClarifySSEOptions {
  enabled?: boolean;
}

export function useClarifySSE(sessionId: string | null, opts: UseClarifySSEOptions = {}) {
  const { enabled = true } = opts;
  const setStatus = useClarifySession((s) => s.setStatus);
  const appendChunk = useClarifySession((s) => s.appendChunk);
  const finalizeTurn = useClarifySession((s) => s.finalizeTurn);
  const setParsedSpec = useClarifySession((s) => s.setParsedSpec);
  const setError = useClarifySession((s) => s.setError);
  const flushOneChar = useClarifySession((s) => s.flushOneChar);

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFlushRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!sessionId || !enabled) return;
    closedRef.current = false;
    retryRef.current = 0;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const open = () => {
      if (closedRef.current) return;
      const es = new EventSource(`/api/sse/clarify/${sessionId}`, { withCredentials: true });
      esRef.current = es;

      es.addEventListener('ready', () => {
        retryRef.current = 0;
        setStatus('streaming');
      });

      es.addEventListener('assistant.delta', (e) => {
        try {
          const { text } = JSON.parse((e as MessageEvent).data) as { text: string };
          if (reducedMotion) {
            finalizeTurn({ role: 'assistant', text });
          } else {
            appendChunk(text);
          }
        } catch {
          /* ignore parse errors */
        }
      });

      es.addEventListener('need_more_info', (e) => {
        try {
          const { question } = JSON.parse((e as MessageEvent).data) as { question: string };
          finalizeTurn({ role: 'assistant', text: question });
          setStatus('need_more_info');
        } catch {
          /* ignore */
        }
      });

      es.addEventListener('ready_to_create', (e) => {
        try {
          const { spec } = JSON.parse((e as MessageEvent).data) as { spec: ParsedTaskSpec };
          setParsedSpec(spec);
          setStatus('ready_to_create');
        } catch {
          setError({ code: 'CCT_CLARIFY_INTERNAL', message: '澄清结果解析失败' });
        }
      });

      es.addEventListener('error', (e) => {
        const me = e as MessageEvent;
        const data = me.data ? safeJson(me.data) : null;
        if (data) {
          setError({
            code: typeof data.code === 'string' ? data.code : 'CCT_CLARIFY_INTERNAL',
            message: typeof data.message === 'string' ? data.message : '澄清出错',
          });
          es.close();
          return;
        }
        retryRef.current += 1;
        if (retryRef.current > MAX_RETRY) {
          setError({ code: 'CCT_SSE_RECONNECT_FAILED', message: '重连失败' });
          es.close();
        }
      });

      es.addEventListener('done', () => {
        setStatus((useClarifySession.getState().parsedSpec ? 'ready_to_create' : 'idle') as never);
      });
    };

    const tick = (ts: number) => {
      if (closedRef.current) return;
      if (ts - lastFlushRef.current >= CHAR_INTERVAL_MS) {
        flushOneChar();
        lastFlushRef.current = ts;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    if (!reducedMotion) {
      rafRef.current = requestAnimationFrame(tick);
    }
    open();

    return () => {
      closedRef.current = true;
      esRef.current?.close();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      esRef.current = null;
      rafRef.current = null;
    };
  }, [sessionId, enabled, setStatus, appendChunk, finalizeTurn, setParsedSpec, setError, flushOneChar]);
}

function safeJson(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}
