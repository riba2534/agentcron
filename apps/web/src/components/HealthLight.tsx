'use client';

import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useEffect } from 'react';
import { trpc } from '@/lib/trpc-client';
import { useHealth } from '@/stores/healthStore';
import { cn } from '@/lib/utils';

const COLOR: Record<'ok' | 'warn' | 'error' | 'unknown', string> = {
  ok: 'bg-success-500',
  warn: 'bg-warning-500',
  error: 'bg-danger-500',
  unknown: 'bg-neutral-400',
};

const ICON = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: AlertTriangle,
  unknown: HelpCircle,
} as const;

export function HealthLight() {
  const level = useHealth((s) => s.level);
  const summary = useHealth((s) => s.summary);
  const setStatus = useHealth((s) => s.setStatus);
  const doctor = trpc.system.doctor.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!doctor.data) return;
    const issues = doctor.data.issues ?? [];
    const errors = issues.filter((p) => p.level === 'error').length;
    const warns = issues.filter((p) => p.level === 'warn').length;
    if (errors > 0) {
      setStatus({ level: 'error', summary: `${errors} 项错误` });
    } else if (warns > 0) {
      setStatus({ level: 'warn', summary: `${warns} 项警告` });
    } else if (!doctor.data.reachable) {
      setStatus({ level: 'error', summary: '调度器不可达' });
    } else {
      setStatus({ level: 'ok', summary: '系统状态良好' });
    }
  }, [doctor.data, setStatus]);

  const color = COLOR[level];
  const Icon = ICON[level];

  return (
    <a
      href="/settings/system"
      role="status"
      aria-label={`系统健康：${level} - ${summary}`}
      className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
    >
      <span className="relative inline-flex h-2 w-2">
        <span className={cn('inline-block h-2 w-2 rounded-full', color)} />
        {level === 'error' || level === 'warn' ? (
          <span className={cn('absolute inset-0 inline-block h-2 w-2 animate-ping rounded-full opacity-60', color)} />
        ) : null}
      </span>
      <span className="hidden text-xs text-neutral-600 dark:text-neutral-300 md:inline">{summary}</span>
      <Icon className="hidden h-3 w-3 text-neutral-500 group-hover:text-neutral-700 lg:inline" aria-hidden />
    </a>
  );
}
