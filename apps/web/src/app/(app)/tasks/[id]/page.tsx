'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, MoreHorizontal, Play } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { DangerBadge } from '@/components/DangerBadge';
import { TrustLevelTag } from '@/components/TrustLevelTag';
import { StatusDot } from '@/components/StatusDot';
import { TaskOverview } from './_components/TaskOverview';
import { TaskRunsTab } from './_components/TaskRunsTab';
import { TaskEditTab } from './_components/TaskEditTab';
import { ErrorBanner } from '@/components/ErrorBanner';
import { toast } from '@/components/ui/sonner';
import { describe } from '@/lib/errorMessages';
import { formatDateTime } from '@/lib/format';

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const sp = useSearchParams();
  const initial = (sp.get('tab') as 'overview' | 'runs' | 'edit' | null) ?? 'overview';
  const [tab, setTab] = useState<'overview' | 'runs' | 'edit'>(initial);

  useEffect(() => {
    setTab(initial);
  }, [initial]);

  const utils = trpc.useUtils();
  const task = trpc.task.get.useQuery({ id }, { enabled: !!id });
  const models = trpc.modelAdapter.list.useQuery(undefined, { staleTime: 60_000 });

  const setEnabled = trpc.task.setEnabled.useMutation({
    onSuccess: () => utils.task.get.invalidate({ id }),
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title);
    },
  });

  const runNow = trpc.task.runNow.useMutation({
    onSuccess: () => {
      toast.success('已开始触发');
      utils.taskRun.list.invalidate({ taskId: id });
    },
  });

  const archive = trpc.task.archive.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      toast.success('已归档');
      router.push('/tasks');
    },
  });

  const onTabChange = (v: string) => {
    const next = v as 'overview' | 'runs' | 'edit';
    setTab(next);
    const psp = new URLSearchParams(sp.toString());
    if (next === 'overview') psp.delete('tab');
    else psp.set('tab', next);
    router.replace(`/tasks/${id}?${psp.toString()}`);
  };

  if (task.isPending) return <DetailSkeleton />;
  if (task.error || !task.data)
    return <ErrorBanner title="无法加载任务" message={task.error?.message} onRetry={() => task.refetch()} />;

  const t = task.data;
  const model = models.data?.find((m) => m.id === t.modelAdapterId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.push('/tasks')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {t.name}
          </span>
        }
        actions={
          <>
            <Switch checked={t.enabled} onCheckedChange={(v) => setEnabled.mutate({ id: t.id, enabled: v })} />
            <Button onClick={() => runNow.mutate({ id: t.id })} disabled={runNow.isPending}>
              <Play className="h-4 w-4" /> {runNow.isPending ? '运行中…' : '试运行'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onTabChange('edit')}>编辑</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => archive.mutate({ id: t.id })}>归档</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        meta={
          <>
            <DangerBadge inline />
            {model ? <TrustLevelTag level={model.trustLevel} /> : null}
            <StatusDot status={t.status === 'archived' ? 'archived' : t.enabled ? 'enabled' : 'disabled'} />
            <span className="text-xs text-neutral-500">下次执行: <NextFire id={t.id} cron={t.cronExpression} timezone={t.timezone} /></span>
          </>
        }
      />
      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="runs">执行历史</TabsTrigger>
          <TabsTrigger value="edit">编辑</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <TaskOverview task={t} model={model} />
        </TabsContent>
        <TabsContent value="runs">
          <TaskRunsTab taskId={t.id} />
        </TabsContent>
        <TabsContent value="edit">
          <TaskEditTab task={t} models={models.data ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NextFire({ id, cron, timezone }: { id: string; cron: string; timezone: string }) {
  const q = trpc.task.previewCron.useQuery({ cronExpression: cron, timezone, count: 1 }, { staleTime: 60_000, retry: false });
  void id;
  const t = q.data?.nextFireTimes?.[0];
  return <span>{t ? formatDateTime(t) : '—'}</span>;
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
