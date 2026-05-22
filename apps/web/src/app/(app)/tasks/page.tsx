'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MoreHorizontal, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { StatusDot } from '@/components/StatusDot';
import { TrustLevelTag } from '@/components/TrustLevelTag';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from '@/components/ui/sonner';
import { describe } from '@/lib/errorMessages';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'enabled' | 'disabled' | 'archived';

const TAB_LABEL: Record<Tab, string> = {
  all: '全部',
  enabled: '启用中',
  disabled: '已停用',
  archived: '已归档',
};

export default function TasksPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'all';
  const search = params.get('q') ?? '';
  const debouncedSearch = useDebounce(search, 300);

  const utils = trpc.useUtils();
  const list = trpc.task.list.useQuery({
    status: tab === 'archived' ? 'archived' : 'active',
    enabled: tab === 'enabled' ? true : tab === 'disabled' ? false : undefined,
    search: debouncedSearch || undefined,
    limit: 50,
  });
  const models = trpc.modelAdapter.list.useQuery(undefined, { staleTime: 60_000 });

  const setEnabled = trpc.task.setEnabled.useMutation({
    onMutate: async ({ id, enabled }) => {
      await utils.task.list.cancel();
      const prev = utils.task.list.getData({
        status: tab === 'archived' ? 'archived' : 'active',
        enabled: tab === 'enabled' ? true : tab === 'disabled' ? false : undefined,
        search: debouncedSearch || undefined,
        limit: 50,
      });
      utils.task.list.setData(
        {
          status: tab === 'archived' ? 'archived' : 'active',
          enabled: tab === 'enabled' ? true : tab === 'disabled' ? false : undefined,
          search: debouncedSearch || undefined,
          limit: 50,
        },
        (old) =>
          old
            ? { ...old, items: old.items.map((it) => (it.id === id ? { ...it, enabled } : it)) }
            : old,
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        utils.task.list.setData(
          {
            status: tab === 'archived' ? 'archived' : 'active',
            enabled: tab === 'enabled' ? true : tab === 'disabled' ? false : undefined,
            search: debouncedSearch || undefined,
            limit: 50,
          },
          ctx.prev,
        );
      }
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
    onSettled: () => utils.task.list.invalidate(),
  });

  const runNow = trpc.task.runNow.useMutation({
    onSuccess: () => {
      toast.success('已开始触发');
      utils.task.list.invalidate();
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });

  const del = trpc.task.delete.useMutation({
    onSuccess: () => {
      toast.success('已删除');
      utils.task.list.invalidate();
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });

  const setQuery = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.replace(`/tasks?${sp.toString()}`);
  };

  const items = list.data?.items ?? [];
  const modelMap = new Map(models.data?.map((m) => [m.id, m] as const) ?? []);

  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [runConfirm, setRunConfirm] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`任务 (${items.length})`}
        actions={
          <Button asChild>
            <Link href="/tasks/new">
              <Plus className="h-4 w-4" /> 新建任务
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setQuery('tab', v === 'all' ? '' : v)}>
          <TabsList>
            {(['all', 'enabled', 'disabled', 'archived'] as Tab[]).map((t) => (
              <TabsTrigger key={t} value={t}>
                {TAB_LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          value={search}
          onChange={(e) => setQuery('q', e.target.value)}
          placeholder="搜索任务名"
          className="w-64"
        />
      </div>
      {list.isPending ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <EmptyState
          title="还没有定时任务"
          description="试试让 AI 每天 9 点整理一次 GitHub 通知?"
          action={
            <Button asChild>
              <Link href="/tasks/new">新建任务</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>下次执行</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>预算</TableHead>
              <TableHead className="w-[120px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((t) => {
              const model = modelMap.get(t.modelAdapterId);
              const failed = t.lastSyncError;
              return (
                <TableRow
                  key={t.id}
                  data-state={failed ? 'failed' : undefined}
                  className={cn(failed ? 'border-l-4 border-l-danger-500' : '', 'group cursor-pointer')}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-row-action]')) return;
                    router.push(`/tasks/${t.id}`);
                  }}
                >
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{t.name}</span>
                      <code className="font-mono text-xs text-neutral-500">{t.cronExpression}</code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <NextFire cron={t.cronExpression} timezone={t.timezone} />
                  </TableCell>
                  <TableCell>
                    <StatusDot status={t.status === 'archived' ? 'archived' : t.enabled ? 'enabled' : 'disabled'} />
                  </TableCell>
                  <TableCell>
                    {model ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs">{model.alias}</span>
                        <TrustLevelTag level={model.trustLevel} showLabel={false} />
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>{formatMoney(t.maxBudgetUsd)}</TableCell>
                  <TableCell className="text-right">
                    <div data-row-action className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Switch
                        checked={t.enabled}
                        onCheckedChange={(v) => setEnabled.mutate({ id: t.id, enabled: v })}
                        aria-label={t.enabled ? '停用' : '启用'}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t.enabled ? '停用' : '启用'}
                        onClick={() => setEnabled.mutate({ id: t.id, enabled: !t.enabled })}
                      >
                        {t.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="试运行"
                        onClick={() => setRunConfirm({ id: t.id, name: t.name })}
                      >
                        <Play className="h-3 w-3 text-info-500" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" title="更多">
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/tasks/${t.id}?tab=edit`}>编辑</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setRunConfirm({ id: t.id, name: t.name })}>
                            试运行
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-danger-600"
                            onClick={() => setConfirmDelete({ id: t.id, name: t.name })}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> 删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <DeleteDialog
        target={confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={(id) => {
          del.mutate({ id });
          setConfirmDelete(null);
        }}
      />
      <RunNowDialog
        target={runConfirm}
        pending={runNow.isPending}
        onCancel={() => setRunConfirm(null)}
        onConfirm={(id) => {
          runNow.mutate({ id });
          setRunConfirm(null);
        }}
      />
    </div>
  );
}

function NextFire({ cron, timezone }: { cron: string; timezone: string }) {
  const q = trpc.task.previewCron.useQuery(
    { cronExpression: cron, timezone, count: 1 },
    { staleTime: 60_000, retry: false },
  );
  if (q.isPending) return <span className="text-xs text-neutral-400">…</span>;
  const t = q.data?.nextFireTimes?.[0];
  return t ? <span className="text-xs">{formatDateTime(t)}</span> : <span className="text-xs text-neutral-400">—</span>;
}

function DeleteDialog({
  target, onCancel, onConfirm,
}: {
  target: { id: string; name: string } | null;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}) {
  const [v, setV] = useState('');
  if (!target) return null;
  const ok = v.trim() === target.name;
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除任务?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-neutral-500">
          删除会同时清理调度记录和历史 Run。请输入任务名 <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{target.name}</code> 确认。
        </p>
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={target.name} autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button variant="danger" disabled={!ok} onClick={() => onConfirm(target.id)}>
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunNowDialog({
  target, pending, onCancel, onConfirm,
}: {
  target: { id: string; name: string } | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}) {
  if (!target) return null;
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>试运行任务？</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-neutral-500">
          立刻执行调度系统到点会跑的命令（<code className="font-mono text-xs">cct-runner --task-id {target.id}</code>），会消耗预算并产生一条执行记录。任务：<strong>{target.name}</strong>
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button onClick={() => onConfirm(target.id)} disabled={pending}>
            {pending ? '触发中…' : '触发'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
