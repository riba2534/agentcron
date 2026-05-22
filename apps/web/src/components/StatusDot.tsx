import { cn } from '@/lib/utils';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'budget_exceeded'
  | 'skipped';

export type TaskStatusKey = RunStatus | 'enabled' | 'disabled' | 'archived';

const COLOR_MAP: Record<TaskStatusKey, string> = {
  pending: 'bg-status-pending',
  running: 'bg-status-running',
  succeeded: 'bg-status-succeeded',
  failed: 'bg-status-failed',
  timeout: 'bg-status-timeout',
  budget_exceeded: 'bg-status-budget-exceeded',
  skipped: 'bg-status-skipped',
  enabled: 'bg-status-succeeded',
  disabled: 'bg-status-skipped',
  archived: 'bg-status-pending',
};

const LABEL_MAP: Record<TaskStatusKey, string> = {
  pending: '排队中',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  timeout: '超时',
  budget_exceeded: '超预算',
  skipped: '跳过',
  enabled: '启用',
  disabled: '已停用',
  archived: '已归档',
};

interface StatusDotProps {
  status: TaskStatusKey;
  showLabel?: boolean;
  className?: string;
}

export function StatusDot({ status, showLabel = true, className }: StatusDotProps) {
  const color = COLOR_MAP[status];
  const label = LABEL_MAP[status];
  const isRunning = status === 'running';
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} role="status">
      <span className="relative inline-flex h-2 w-2">
        <span className={cn('inline-block h-2 w-2 rounded-full', color)} />
        {isRunning ? (
          <span
            className={cn(
              'absolute inset-0 inline-block h-2 w-2 animate-ping rounded-full opacity-60',
              color,
            )}
          />
        ) : null}
      </span>
      {showLabel ? <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">{label}</span> : null}
      <span className="sr-only">状态：{label}</span>
    </span>
  );
}

export function getStatusLabel(status: TaskStatusKey): string {
  return LABEL_MAP[status];
}
