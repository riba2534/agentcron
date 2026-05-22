'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrustLevelTag } from '@/components/TrustLevelTag';
import { trpc } from '@/lib/trpc-client';
import { formatDateTime, formatDurationMs, formatMoney } from '@/lib/format';
import type { TaskDTO } from '@/server/dto/index';
import type { ModelAdapterDTO } from '@/server/dto/index';

interface Props {
  task: TaskDTO;
  model?: ModelAdapterDTO;
}

export function TaskOverview({ task, model }: Props) {
  const stats = trpc.taskRun.list.useQuery({ taskId: task.id, limit: 5 });
  const lastRun = stats.data?.items?.[0];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">基础信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label="Cron" value={<code className="font-mono text-xs">{task.cronExpression}</code>} />
          <Field label="时区" value={task.timezone} />
          <Field label="工作目录" value={<code className="font-mono text-xs">{task.workingDirectory}</code>} />
          <Field label="超时" value={`${Math.round(task.timeoutMs / 60000)} 分钟`} />
          <Field label="单次预算" value={formatMoney(task.maxBudgetUsd)} />
          {task.monthlyBudgetCap ? <Field label="月度预算" value={formatMoney(task.monthlyBudgetCap)} /> : null}
          {model ? (
            <Field
              label="模型"
              value={
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-xs">{model.alias}</span>
                  <TrustLevelTag level={model.trustLevel} />
                </span>
              }
            />
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">同步状态</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label="最近同步" value={task.lastSyncedAt ? formatDateTime(task.lastSyncedAt) : '—'} />
          <Field label="同步错误" value={task.lastSyncError ?? <span className="text-success-500">无</span>} />
          <Field label="状态" value={task.status === 'archived' ? '已归档' : task.enabled ? '启用中' : '已停用'} />
          <Field
            label="调度命令"
            value={
              <code className="block break-all rounded bg-neutral-100 px-2 py-1 font-mono text-[11px] dark:bg-neutral-900">
                cct-runner --task-id {task.id}
              </code>
            }
          />
          <p className="text-[11px] text-neutral-400">
            到点时调度系统会执行上面这条命令；点页面顶部的「试运行」可立即执行同样的命令。
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">最近执行</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {lastRun ? (
            <>
              <Field label="最后执行" value={formatDateTime(lastRun.startedAt)} />
              <Field label="耗时" value={formatDurationMs(lastRun.endedAt ? new Date(lastRun.endedAt).getTime() - new Date(lastRun.startedAt).getTime() : null)} />
              <Field label="花费" value={formatMoney(lastRun.costUsd)} />
              <Field label="状态" value={lastRun.status} />
            </>
          ) : (
            <p className="text-xs text-neutral-500">还没有执行记录</p>
          )}
        </CardContent>
      </Card>
      <Card className="md:col-span-2 xl:col-span-3">
        <CardHeader>
          <CardTitle className="text-sm">提示词</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-md bg-neutral-100 p-3 font-mono text-xs dark:bg-neutral-900">
            {task.commandPrompt}
          </pre>
          {task.systemPrompt ? (
            <details className="mt-3 text-xs text-neutral-500">
              <summary className="cursor-pointer text-neutral-700 dark:text-neutral-200">system prompt</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-neutral-100 p-3 font-mono dark:bg-neutral-900">{task.systemPrompt}</pre>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-2">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="min-w-0 break-words text-sm">{value}</span>
    </div>
  );
}
