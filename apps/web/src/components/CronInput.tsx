'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc-client';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CronInputProps {
  value: string;
  onChange: (v: string) => void;
  timezone: string;
  error?: string;
  className?: string;
  placeholder?: string;
  count?: number;
}

const CRON_RE = /^\s*\S+\s+\S+\s+\S+\s+\S+\s+\S+\s*$/;

export function CronInput({
  value,
  onChange,
  timezone,
  error,
  className,
  placeholder = '0 9 * * *',
  count = 5,
}: CronInputProps) {
  const debounced = useDebounce(value, 400);
  const valid = CRON_RE.test(debounced);
  const [localError, setLocalError] = useState<string | null>(null);

  const preview = trpc.task.previewCron.useQuery(
    { cronExpression: debounced, timezone, count },
    { enabled: valid && !!timezone, retry: false, staleTime: 60_000 },
  );

  useEffect(() => {
    if (preview.error) {
      setLocalError('预览失败：' + preview.error.message);
    } else {
      setLocalError(null);
    }
  }, [preview.error]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="font-mono"
        aria-invalid={!!error}
      />
      {error ? <p className="text-xs text-danger-600">{error}</p> : null}
      {!error && valid ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-1 flex items-center gap-1 font-medium text-neutral-700 dark:text-neutral-200">
            <Clock className="h-3 w-3" /> 接下来 {count} 次执行
          </div>
          {preview.isPending ? (
            <p className="text-neutral-400">计算中…</p>
          ) : preview.data?.nextFireTimes?.length ? (
            <ol className="list-decimal pl-4 text-neutral-600 dark:text-neutral-300">
              {preview.data.nextFireTimes.map((t: string) => (
                <li key={t} className="font-mono">
                  {formatDateTime(t)}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-neutral-400">无</p>
          )}
          {localError ? <p className="mt-1 text-danger-600">{localError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
