'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Activity } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { TrustLevelTag } from '@/components/TrustLevelTag';
import { ModelAdapterForm } from './_components/ModelAdapterForm';
import { TestConnectionPanel } from './_components/TestConnectionPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { describe } from '@/lib/errorMessages';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { ModelAdapterDTO } from '@/server/dto/index';

type DialogMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; adapter: ModelAdapterDTO };

export default function ModelsPage() {
  const utils = trpc.useUtils();
  const list = trpc.modelAdapter.list.useQuery();
  const [dialog, setDialog] = useState<DialogMode>({ kind: 'closed' });
  const [testingId, setTestingId] = useState<string | null>(null);

  const del = trpc.modelAdapter.delete.useMutation({
    onSuccess: () => {
      utils.modelAdapter.list.invalidate();
      toast.success('已删除');
      setDialog({ kind: 'closed' });
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });

  const items = list.data ?? [];
  const open = dialog.kind !== 'closed';

  const closeDialog = () => setDialog({ kind: 'closed' });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="模型管理"
        description="管理 ModelAdapter，用于调用各家 Claude 兼容 API"
        actions={
          <Button onClick={() => setDialog({ kind: 'create' })}>
            <Plus className="h-4 w-4" /> 新增模型
          </Button>
        }
      />

      {list.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          title="还没有模型"
          description="点击右上角「新增模型」手动配置一个 alias"
          action={
            <Button onClick={() => setDialog({ kind: 'create' })}>
              <Plus className="h-4 w-4" /> 新增模型
            </Button>
          }
        />
      ) : (
        <ul className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          {items.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{m.alias}</span>
                  <TrustLevelTag level={m.trustLevel} />
                  <span className="text-xs text-neutral-400">
                    {m.enabled ? '启用' : '已停用'}
                  </span>
                </div>
                <span className="truncate text-xs text-neutral-500">
                  {m.displayName} · {m.modelId} · {m.baseUrl}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTestingId(testingId === m.id ? null : m.id)}
                  aria-label="测试连通"
                >
                  <Activity className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ kind: 'edit', adapter: m })}
                  aria-label="编辑"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger-600 hover:text-danger-700"
                  onClick={() => {
                    if (confirm(`确认删除 ${m.alias}？`)) del.mutate({ id: m.id });
                  }}
                  aria-label="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {testingId ? (
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">
              测试 alias「
              <code className="font-mono">
                {items.find((m) => m.id === testingId)?.alias}
              </code>
              」
            </span>
            <Button variant="ghost" size="sm" onClick={() => setTestingId(null)}>
              收起
            </Button>
          </div>
          <TestConnectionPanel id={testingId} />
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialog.kind === 'edit' ? `编辑 ${dialog.adapter.alias}` : '新增模型'}
            </DialogTitle>
            <DialogDescription>
              {dialog.kind === 'edit'
                ? '修改模型配置，token 留空保持原值'
                : '填写 alias / baseUrl / token / 模型 ID 即可创建一个新的模型适配器'}
            </DialogDescription>
          </DialogHeader>
          {dialog.kind !== 'closed' ? (
            <ModelAdapterForm
              key={dialog.kind === 'edit' ? dialog.adapter.id : 'new'}
              initial={dialog.kind === 'edit' ? dialog.adapter : null}
              onSaved={() => {
                utils.modelAdapter.list.invalidate();
                closeDialog();
              }}
              onCancel={closeDialog}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
