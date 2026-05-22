'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TypewriterTextProps {
  text: string;
  intervalMs?: number;
  done?: boolean;
  className?: string;
}

export function TypewriterText({ text, intervalMs = 25, done, className }: TypewriterTextProps) {
  const [count, setCount] = useState(text.length);
  const ref = useRef<number | null>(null);
  const lastRef = useRef(0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || done) {
      setCount(text.length);
      return;
    }
    setCount((c) => Math.min(c, text.length));
    const tick = (ts: number) => {
      if (ts - lastRef.current >= intervalMs) {
        lastRef.current = ts;
        setCount((c) => (c < text.length ? c + 1 : c));
      }
      ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [text, intervalMs, done]);

  return (
    <span aria-live={done ? 'polite' : 'off'} className={cn('whitespace-pre-wrap', className)}>
      {text.slice(0, count)}
    </span>
  );
}
