'use client';

import { AlertTriangle, CheckCircle2, RefreshCw, Wrench } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { toast } from '@/components/ui/sonner';

export default function SystemPage() {
  const utils = trpc.useUtils();
  const doctor = trpc.system.doctor.useQuery(undefined, { refetchInterval: 60_000 });
  const stats = trpc.system.stats.useQuery();

  const reconcile = trpc.system.reconcile.useMutation({
    onSuccess: (r) => {
      toast.success(`已修复 ${r.appliedCount} 项`);
      utils.system.doctor.invalidate();
      utils.task.list.invalidate();
    },
    onError: (err) => {
      toast.error('修复失败', { description: err.message });
    },
  });

  if (doctor.isPending) return <Skeleton className="h-72 w-full" />;
  if (doctor.error || !doctor.data)
    return <ErrorBanner title="无法获取系统状态" message={doctor.error?.message} onRetry={() => doctor.refetch()} />;

  const d = doctor.data;
  const errors = d.issues.filter((i) => i.level === 'error');
  const warns = d.issues.filter((i) => i.level === 'warn');
  const okOverall = errors.length === 0 && warns.length === 0 && d.reachable;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">系统健康</CardTitle>
            <p className="mt-1 text-xs text-neutral-500">调度器: {d.scheduler}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => doctor.refetch()}
            disabled={doctor.isFetching}
          >
            <RefreshCw className="h-3.5 w-3.5" /> 重新检测
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <div
              className={`relative inline-flex h-12 w-12 items-center justify-center rounded-full ${
                okOverall ? 'bg-success-50 text-success-500' : errors.length ? 'bg-danger-50 text-danger-500' : 'bg-warning-50 text-warning-500'
              } dark:bg-opacity-30`}
            >
              {okOverall ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="text-md font-semibold">
                {okOverall
                  ? '一切正常'
                  : `${errors.length} 项错误,${warns.length} 项警告`}
              </h3>
              <p className="text-sm text-neutral-500">
                {d.reachable ? '调度器可达' : '调度器不可达'} · 管理任务 {d.managedEntries} 个 · {d.driftEntries.length} 项漂移
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">检查项</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => reconcile.mutate({ dryRun: false })}
            disabled={reconcile.isPending}
          >
            <Wrench className="h-3.5 w-3.5" /> {reconcile.isPending ? '修复中…' : '一键修复'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {d.issues.length === 0 ? (
            <p className="text-sm text-neutral-500">没有发现问题。</p>
          ) : (
            d.issues.map((it, idx) => (
              <Alert key={idx} variant={it.level === 'error' ? 'danger' : 'warning'}>
                <AlertTitle>{it.code}</AlertTitle>
                <AlertDescription>
                  <p>{it.message}</p>
                  {it.remediation ? <p className="mt-1 text-xs text-neutral-500">{it.remediation}</p> : null}
                </AlertDescription>
              </Alert>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <SmallStat label="任务数量" value={stats.data?.taskCount} />
        <SmallStat label="累计 Run" value={stats.data?.runCount} />
        <SmallStat label="本月花费" value={stats.data?.costThisMonth ? `$${stats.data.costThisMonth.toFixed(2)}` : '$0.00'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">关于卸载</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-neutral-600 dark:text-neutral-300">
          <p>在终端运行下列命令彻底卸载本机部署:</p>
          <pre className="mt-2 overflow-auto rounded-md bg-neutral-100 p-3 font-mono text-xs dark:bg-neutral-900">
            cct-doctor uninstall
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-xl font-semibold">{value ?? '—'}</p>
      </CardContent>
    </Card>
  );
}
