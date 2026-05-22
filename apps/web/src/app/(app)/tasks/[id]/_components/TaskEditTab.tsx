'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CronInput } from '@/components/CronInput';
import { TrustLevelTag } from '@/components/TrustLevelTag';
import { toast } from '@/components/ui/sonner';
import { describe } from '@/lib/errorMessages';
import type { ModelAdapterDTO, TaskDTO } from '@/server/dto/index';

const schema = z.object({
  name: z.string().min(1).max(80),
  cronExpression: z.string().min(1),
  timezone: z.string().min(1).max(64),
  modelAdapterId: z.string().min(1),
  commandPrompt: z.string().min(1).max(20_000),
  systemPrompt: z.string().max(8000).optional(),
  workingDirectory: z.string().min(1),
  timeoutMs: z.coerce.number().int().min(30_000).max(60 * 60_000),
  maxBudgetUsd: z.coerce.number().min(0.01).max(100),
  monthlyBudgetCap: z.coerce.number().min(0.01).max(10_000).optional(),
});

interface Props {
  task: TaskDTO;
  models: ModelAdapterDTO[];
}

export function TaskEditTab({ task, models }: Props) {
  const utils = trpc.useUtils();
  const update = trpc.task.update.useMutation({
    onSuccess: () => {
      utils.task.get.invalidate({ id: task.id });
      utils.task.list.invalidate();
      toast.success('已保存');
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      name: task.name,
      cronExpression: task.cronExpression,
      timezone: task.timezone,
      modelAdapterId: task.modelAdapterId,
      commandPrompt: task.commandPrompt,
      systemPrompt: task.systemPrompt ?? '',
      workingDirectory: task.workingDirectory,
      timeoutMs: task.timeoutMs,
      maxBudgetUsd: task.maxBudgetUsd,
      monthlyBudgetCap: task.monthlyBudgetCap ?? undefined,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(values) as (keyof typeof values)[]) {
      const v = values[key];
      if (v === undefined || v === '') continue;
      patch[key] = v;
    }
    if (!values.systemPrompt) delete patch.systemPrompt;
    update.mutate({ id: task.id, patch });
  });

  const cronValue = form.watch('cronExpression');
  const timezone = form.watch('timezone');

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <div className="md:col-span-2">
        <Label className="mb-1 block">任务名</Label>
        <Input {...form.register('name')} />
      </div>
      <div>
        <Label className="mb-1 block">Cron 表达式</Label>
        <CronInput
          value={cronValue}
          onChange={(v) => form.setValue('cronExpression', v, { shouldValidate: true })}
          timezone={timezone}
          error={form.formState.errors.cronExpression?.message}
        />
      </div>
      <div>
        <Label className="mb-1 block">时区</Label>
        <Input {...form.register('timezone')} placeholder="Asia/Shanghai" />
      </div>
      <div className="md:col-span-2">
        <Label className="mb-1 block">模型</Label>
        <Select
          value={form.watch('modelAdapterId')}
          onValueChange={(v) => form.setValue('modelAdapterId', v, { shouldValidate: true })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono">{m.alias}</span>
                  <TrustLevelTag level={m.trustLevel} showLabel={false} />
                  <span className="text-xs text-neutral-500">{m.modelId}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Label className="mb-1 block">提示词</Label>
        <Textarea rows={6} {...form.register('commandPrompt')} className="font-mono" />
      </div>
      <div className="md:col-span-2">
        <Label className="mb-1 block">系统提示词（可选）</Label>
        <Textarea rows={3} {...form.register('systemPrompt')} className="font-mono" />
      </div>
      <div>
        <Label className="mb-1 block">工作目录</Label>
        <Input {...form.register('workingDirectory')} className="font-mono" />
      </div>
      <div>
        <Label className="mb-1 block">超时 (ms)</Label>
        <Input type="number" {...form.register('timeoutMs')} />
      </div>
      <div>
        <Label className="mb-1 block">单次预算 ($)</Label>
        <Input type="number" step="0.01" {...form.register('maxBudgetUsd')} />
      </div>
      <div>
        <Label className="mb-1 block">月度预算 ($, 可选)</Label>
        <Input type="number" step="0.01" {...form.register('monthlyBudgetCap')} />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? '保存中…' : '保存修改'}
        </Button>
      </div>
    </form>
  );
}
