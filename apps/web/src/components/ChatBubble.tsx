'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatBubbleProps {
  role: 'assistant' | 'user';
  text: string;
  done?: boolean;
  pending?: boolean;
}

export function ChatBubble({ role, text, done, pending }: ChatBubbleProps) {
  const isAssistant = role === 'assistant';
  const isTyping = isAssistant && (pending || !done) && text.length > 0;
  const showCursor = isAssistant && !done;
  return (
    <div
      className={cn(
        'flex w-full gap-3',
        isAssistant ? 'justify-start' : 'justify-end',
      )}
      data-role={role}
    >
      {isAssistant ? (
        <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
          <Bot className="h-4 w-4" aria-hidden />
        </span>
      ) : null}
      <div
        aria-live={isTyping ? 'polite' : 'off'}
        className={cn(
          'max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed shadow-sm',
          isAssistant
            ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50'
            : 'bg-primary-50 text-primary-900 dark:bg-primary-950 dark:text-primary-100',
        )}
      >
        {text}
        {showCursor ? <BlinkingCursor /> : null}
      </div>
      {!isAssistant ? (
        <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300">
          <User className="h-4 w-4" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

function BlinkingCursor() {
  const [v, setV] = useState(true);
  const ref = useRef<number | null>(null);
  useEffect(() => {
    ref.current = window.setInterval(() => setV((x) => !x), 500);
    return () => {
      if (ref.current) window.clearInterval(ref.current);
    };
  }, []);
  return (
    <span aria-hidden className={cn('ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-current align-middle', v ? 'opacity-80' : 'opacity-0')} />
  );
}
