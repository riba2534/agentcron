'use client';

import { Clock, Coins, FileText, FolderOpen, Hourglass, MailIcon, Repeat, Timer } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DangerBadge } from './DangerBadge';
import { TrustLevelTag, type TrustLevel } from './TrustLevelTag';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ParsedTaskSpec } from '@/stores/clarifySessionStore';

interface SpecPreviewCardProps {
  spec: ParsedTaskSpec;
  trustLevel?: TrustLevel;
  modelLabel?: string;
  onConfirm?: () => void;
  onEdit?: () => void;
  pending?: boolean;
  className?: string;
}

export function SpecPreviewCard({ spec, trustLevel = 'self-hosted', modelLabel, onConfirm, onEdit, pending, className }: SpecPreviewCardProps) {
  const preview = trpc.task.previewCron.useQuery(
    { cronExpression: spec.cronExpression, timezone: spec.timezone, count: 5 },
    { enabled: !!spec.cronExpression && !!spec.timezone, retry: false, staleTime: 60_000 },
  );

  return (
    <Card className={cn('flex flex-col gap-3', className)}>
      <CardHeader className="gap-3 pb-2">
        <div className="flex items-center gap-2">
          <DangerBadge />
          <TrustLevelTag level={trustLevel} />
        </div>
        <h3 className="text-md font-semibold">{spec.name || '（未命名任务）'}</h3>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm">
        <Row icon={<Repeat className="h-3.5 w-3.5" />} label="Cron">
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
            {spec.cronExpression}
          </code>
          <span className="ml-2 text-xs text-neutral-500">{spec.timezone}</span>
        </Row>
        <Row icon={<Clock className="h-3.5 w-3.5" />} label="下次执行">
          {preview.data?.nextFireTimes?.[0]
            ? formatDateTime(preview.data.nextFireTimes[0])
            : preview.isPending
              ? '计算中…'
              : '—'}
        </Row>
        <Row icon={<Hourglass className="h-3.5 w-3.5" />} label="未来 5 次">
          <ul className="ml-2 space-y-0.5 text-xs text-neutral-600 dark:text-neutral-300">
            {(preview.data?.nextFireTimes ?? []).slice(0, 5).map((t: string) => (
              <li key={t} className="font-mono">{formatDateTime(t)}</li>
            ))}
          </ul>
        </Row>
        <Row icon={<MailIcon className="h-3.5 w-3.5" />} label="模型">
          {modelLabel ?? spec.modelAdapterId}
        </Row>
        <Row icon={<FileText className="h-3.5 w-3.5" />} label="Prompt 预览">
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-2 font-mono text-xs dark:bg-neutral-800">
            {spec.commandPrompt}
          </pre>
        </Row>
        <Row icon={<FolderOpen className="h-3.5 w-3.5" />} label="工作目录">
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
            {spec.workingDirectory}
          </code>
        </Row>
        <Row icon={<Coins className="h-3.5 w-3.5" />} label="单次预算">
          {formatMoney(spec.maxBudgetUsd)}
          {spec.monthlyBudgetCap ? <span className="ml-1 text-xs text-neutral-500">/月 {formatMoney(spec.monthlyBudgetCap)}</span> : null}
        </Row>
        <Row icon={<Timer className="h-3.5 w-3.5" />} label="超时">
          {Math.round((spec.timeoutMs ?? 0) / 60000)} 分钟
        </Row>
      </CardContent>
      {(onConfirm || onEdit) && (
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-3 dark:border-neutral-800">
          {onEdit ? (
            <Button variant="ghost" onClick={onEdit} disabled={pending}>
              继续修改
            </Button>
          ) : null}
          {onConfirm ? (
            <Button onClick={onConfirm} disabled={pending}>
              {pending ? '创建中…' : '确认创建'}
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-start gap-3">
      <div className="flex items-center gap-1 pt-0.5 text-xs font-medium text-neutral-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="min-w-0 text-sm text-neutral-800 dark:text-neutral-100">{children}</div>
    </div>
  );
}
