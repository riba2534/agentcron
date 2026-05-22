'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Copy, ExternalLink, RotateCw } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/StatusDot';
import { LogViewer } from '@/components/LogViewer';
import { ErrorBanner } from '@/components/ErrorBanner';
import { toast } from '@/components/ui/sonner';
import { describe } from '@/lib/errorMessages';
import { formatDateTime, formatDurationMs, formatMoney, formatTokens } from '@/lib/format';

export default function TaskRunPage() {
  const router = useRouter();
  const params = useParams<{ id: string; runId: string }>();
  const { id: taskId, runId } = params;
  const utils = trpc.useUtils();
  const run = trpc.taskRun.get.useQuery({ id: runId });
  const [tab, setTab] = useState<'summary' | 'logs'>('summary');
  const isRunning = run.data?.status === 'running' || run.data?.status === 'pending';

  const tail = trpc.taskRun.tailLog.useQuery(
    { id: runId, offset: 0, lines: 2000 },
    {
      enabled: tab === 'logs',
      refetchInterval: tab === 'logs' && isRunning ? 2000 : false,
      retry: false,
    },
  );

  const runNow = trpc.task.runNow.useMutation({
    onSuccess: () => {
      utils.taskRun.list.invalidate({ taskId });
      toast.success('已开始试运行');
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title);
    },
  });

  useEffect(() => {
    document.title = `Run ${runId.slice(0, 8)} · CCT`;
  }, [runId]);

  if (run.isPending) return <Skeleton className="h-72 w-full" />;
  if (run.error || !run.data) {
    return <ErrorBanner title="无法加载执行记录" message={run.error?.message} onRetry={() => run.refetch()} />;
  }

  const r = run.data;
  const duration = r.endedAt ? new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime() : null;

  const onCopy = async () => {
    await navigator.clipboard.writeText(r.summary ?? '');
    toast.success('已复制');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/tasks/${taskId}?tab=runs`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-md font-semibold">Run · {r.id.slice(0, 8)}</h1>
          <StatusDot status={r.status} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" /> 复制摘要
          </Button>
          <Button variant="ghost" size="sm" onClick={() => runNow.mutate({ id: taskId })}>
            <RotateCw className="h-3.5 w-3.5" /> 再试运行
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">元信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="开始" value={formatDateTime(r.startedAt)} />
            <Field label="结束" value={r.endedAt ? formatDateTime(r.endedAt) : '运行中'} />
            <Field label="耗时" value={formatDurationMs(duration)} />
            <Field label="退出码" value={r.exitCode ?? '—'} />
            <Field label="花费" value={formatMoney(r.costUsd)} />
            <Field
              label="Token 数"
              value={
                <span className="text-xs">
                  输入 {formatTokens(r.inputTokens)} / 输出 {formatTokens(r.outputTokens)}
                  {r.cacheReadTokens != null ? ` · 缓存 ${formatTokens(r.cacheReadTokens)}` : ''}
                </span>
              }
            />
            <Field label="触发方式" value={r.triggerSource} />
            {r.skipReason ? <Field label="跳过原因" value={r.skipReason} /> : null}
            {r.logFilePath ? (
              <div className="grid grid-cols-[60px_1fr] items-start gap-2">
                <span className="text-xs text-neutral-500">日志</span>
                <code
                  className="break-words font-mono text-xs text-neutral-600 dark:text-neutral-300"
                  title={r.logFilePath}
                >
                  {r.logFilePath}
                </code>
              </div>
            ) : null}
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onOpenInTerminal}>
              <ExternalLink className="h-3.5 w-3.5" /> 在终端打开
            </Button>
          </CardContent>
        </Card>

        <div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'summary' | 'logs')}>
            <TabsList>
              <TabsTrigger value="summary">摘要</TabsTrigger>
              <TabsTrigger value="logs">全量日志</TabsTrigger>
            </TabsList>
            <TabsContent value="summary">
              {r.summary ? (
                <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-900">
                  {r.summary}
                </pre>
              ) : (
                <p className="rounded-md border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
                  暂无摘要
                </p>
              )}
            </TabsContent>
            <TabsContent value="logs">
              {tail.error ? (
                <ErrorBanner title="日志加载失败" message={tail.error.message} onRetry={() => tail.refetch()} />
              ) : (
                <LogViewer lines={tail.data?.lines ?? []} maxHeight={560} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[60px_1fr] items-start gap-2">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="min-w-0 break-words text-sm">{value}</span>
    </div>
  );
}

function onOpenInTerminal() {
  toast.info('请在 Terminal 运行 open 命令查看日志', { description: 'open <log path>' });
}
