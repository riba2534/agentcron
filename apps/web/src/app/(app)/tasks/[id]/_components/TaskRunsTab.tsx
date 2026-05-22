'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc-client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/StatusDot';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime, formatDurationMs, formatMoney, formatTokens } from '@/lib/format';

interface Props {
  taskId: string;
}

export function TaskRunsTab({ taskId }: Props) {
  const list = trpc.taskRun.list.useQuery({ taskId, limit: 50 });

  if (list.isPending) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (!list.data?.items.length) {
    return <EmptyState title="还没有执行记录" description="任务每次执行后会出现在这里" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>开始时间</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>触发方式</TableHead>
          <TableHead>耗时</TableHead>
          <TableHead>花费</TableHead>
          <TableHead>Token 数</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.data.items.map((r) => {
          const duration = r.endedAt ? new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime() : null;
          return (
            <TableRow key={r.id}>
              <TableCell>{formatDateTime(r.startedAt)}</TableCell>
              <TableCell>
                <StatusDot status={r.status} />
              </TableCell>
              <TableCell className="text-xs text-neutral-500">{r.triggerSource}</TableCell>
              <TableCell>{formatDurationMs(duration)}</TableCell>
              <TableCell>{formatMoney(r.costUsd)}</TableCell>
              <TableCell className="text-xs text-neutral-500">
                in {formatTokens(r.inputTokens)} / out {formatTokens(r.outputTokens)}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/tasks/${taskId}/runs/${r.id}`}
                  className="text-sm text-primary-600 underline-offset-2 hover:underline"
                >
                  查看 →
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
