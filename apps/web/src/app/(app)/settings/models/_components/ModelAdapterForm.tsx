'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/PasswordInput';
import { toast } from '@/components/ui/sonner';
import { describe } from '@/lib/errorMessages';
import type { ModelAdapterDTO } from '@/server/dto/index';

const envEntrySchema = z.object({
  key: z
    .string()
    .regex(
      /^[A-Za-z_][A-Za-z0-9_-]*$/,
      'key 需以字母或下划线开头，仅含字母数字下划线短横线',
    )
    .max(120),
  value: z.string().max(4_000),
});

const schema = z.object({
  alias: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,30}$/, '模型名称仅小写字母、数字、短横线，2-31 位'),
  envEntries: z.array(envEntrySchema).min(3, '至少需要 ANTHROPIC_BASE_URL / TOKEN / MODEL'),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  initial: ModelAdapterDTO | null;
  onSaved: (id: string) => void;
  onCancel?: () => void;
}

const REQUIRED_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL'] as const;
const SECRET_KEY = 'ANTHROPIC_AUTH_TOKEN';

const DEFAULT_ENTRIES: { key: string; value: string }[] = [
  { key: 'ANTHROPIC_BASE_URL', value: '' },
  { key: 'ANTHROPIC_AUTH_TOKEN', value: '' },
  { key: 'ANTHROPIC_MODEL', value: '' },
  { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: '' },
  { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: '' },
  { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: '' },
  { key: 'CLAUDE_CODE_NO_FLICKER', value: '1' },
  { key: 'API_TIMEOUT_MS', value: '3000000' },
  { key: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', value: '1' },
  { key: 'CLAUDE_CODE_EFFORT_LEVEL', value: 'max' },
];

function deriveInitialEntries(initial: ModelAdapterDTO | null): { key: string; value: string }[] {
  if (!initial) return DEFAULT_ENTRIES.slice();
  const map = new Map<string, string>();
  // 已存的 envExtra 优先
  for (const [k, v] of Object.entries(initial.envExtra ?? {})) {
    if (typeof v === 'string') map.set(k, v);
  }
  // 三个核心字段从独立列读取
  map.set('ANTHROPIC_BASE_URL', initial.baseUrl);
  map.set('ANTHROPIC_MODEL', initial.modelId);
  // token 永远空（让用户决定是否替换）
  if (!map.has('ANTHROPIC_AUTH_TOKEN')) map.set('ANTHROPIC_AUTH_TOKEN', '');

  // 保证三个 DEFAULT_*_MODEL 在列表里（即便用户没设过，给个空行让他知道这些 key）
  for (const def of DEFAULT_ENTRIES) {
    if (!map.has(def.key)) map.set(def.key, def.value);
  }
  return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
}

export function ModelAdapterForm({ initial, onSaved, onCancel }: Props) {
  const utils = trpc.useUtils();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const upsert = trpc.modelAdapter.upsert.useMutation({
    onSuccess: (m) => {
      utils.modelAdapter.list.invalidate();
      toast.success(initial ? '已更新' : '已创建');
      onSaved(m.id);
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      alias: initial?.alias ?? '',
      envEntries: deriveInitialEntries(initial),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'envEntries',
  });

  const onSubmit = form.handleSubmit((v) => {
    setSubmitError(null);
    const map = new Map<string, string>();
    const seenKeys = new Set<string>();
    for (const e of v.envEntries) {
      if (!e.key) continue;
      if (seenKeys.has(e.key)) {
        setSubmitError(`重复的环境变量：${e.key}`);
        return;
      }
      seenKeys.add(e.key);
      map.set(e.key, e.value);
    }

    for (const k of REQUIRED_KEYS) {
      if (!map.has(k)) {
        setSubmitError(`缺少必填环境变量：${k}`);
        return;
      }
    }

    const baseUrl = (map.get('ANTHROPIC_BASE_URL') ?? '').trim();
    const modelId = (map.get('ANTHROPIC_MODEL') ?? '').trim();
    const authToken = map.get('ANTHROPIC_AUTH_TOKEN') ?? '';

    if (!baseUrl) return setSubmitError('ANTHROPIC_BASE_URL 不能为空');
    if (!baseUrl.startsWith('https://')) {
      return setSubmitError('ANTHROPIC_BASE_URL 必须以 https:// 开头');
    }
    if (!modelId) return setSubmitError('ANTHROPIC_MODEL 不能为空');
    if (!initial && (!authToken || authToken.length < 10)) {
      return setSubmitError('ANTHROPIC_AUTH_TOKEN 长度至少 10 位');
    }

    // 剩余 entries 塞 envExtra（空值 entries 不进，让 runner fallback 生效）
    const envExtra: Record<string, string> = {};
    for (const [k, val] of map.entries()) {
      if (k === 'ANTHROPIC_BASE_URL' || k === 'ANTHROPIC_MODEL' || k === 'ANTHROPIC_AUTH_TOKEN') continue;
      if (val === '') continue;
      envExtra[k] = val;
    }

    upsert.mutate({
      id: initial?.id,
      alias: v.alias,
      baseUrl,
      modelId,
      // 编辑模式 + 留空 → 不传，service 层保留原 cipher
      authToken: authToken === '' && initial ? undefined : authToken,
      envExtra: Object.keys(envExtra).length ? JSON.stringify(envExtra) : undefined,
    });
  });

  const aliasError = form.formState.errors.alias?.message;

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div>
        <Label className="mb-1 block text-xs">模型名称</Label>
        <Input
          {...form.register('alias')}
          placeholder="kcc"
          className="font-mono"
          autoComplete="off"
        />
        {aliasError ? (
          <p className="mt-1 text-xs text-danger-600">{aliasError}</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-400">
            仅小写字母 / 数字 / 短横线，作为系统标识，例：kcc、kimi-k26
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-xs">环境变量</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => append({ key: '', value: '' })}
          >
            <Plus className="h-3.5 w-3.5" /> 添加变量
          </Button>
        </div>
        <ul className="flex flex-col divide-y divide-neutral-200 overflow-hidden rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {fields.map((field, i) => {
            const currentKey = form.watch(`envEntries.${i}.key`);
            const isSecret = currentKey === SECRET_KEY;
            const keyError = form.formState.errors.envEntries?.[i]?.key?.message;
            return (
              <li key={field.id} className="grid grid-cols-[minmax(0,11rem)_auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5">
                <Input
                  {...form.register(`envEntries.${i}.key`)}
                  placeholder="KEY_NAME"
                  className="h-8 font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="text-xs text-neutral-400">=</span>
                {isSecret ? (
                  <PasswordInput
                    {...form.register(`envEntries.${i}.value`)}
                    placeholder={initial ? '留空保持原值不变' : 'sk-...'}
                    className="h-8 font-mono text-xs"
                  />
                ) : (
                  <Input
                    {...form.register(`envEntries.${i}.value`)}
                    placeholder={
                      currentKey === 'ANTHROPIC_BASE_URL'
                        ? 'https://api.kimi.com/coding/'
                        : currentKey === 'ANTHROPIC_MODEL'
                        ? 'kimi-k2.6'
                        : currentKey?.startsWith('ANTHROPIC_DEFAULT_')
                        ? '留空时自动 = ANTHROPIC_MODEL'
                        : ''
                    }
                    className="h-8 font-mono text-xs"
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-neutral-400 hover:text-danger-600"
                  onClick={() => remove(i)}
                  aria-label={`删除 ${currentKey || '此行'}`}
                  title="删除"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                {keyError ? (
                  <p className="col-span-4 -mt-1 pl-2 text-[11px] text-danger-600">{keyError}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-neutral-400">
          预填了常用变量，按需删除/修改/添加。其中 <code className="font-mono">ANTHROPIC_BASE_URL</code> /
          <code className="font-mono"> ANTHROPIC_AUTH_TOKEN</code> /
          <code className="font-mono"> ANTHROPIC_MODEL</code> 必填。
          <code className="font-mono"> ANTHROPIC_DEFAULT_SONNET / OPUS / HAIKU_MODEL</code> 留空时 runner 自动同步 = ANTHROPIC_MODEL。
        </p>
      </div>

      {submitError ? (
        <div className="rounded-md border border-danger-500/40 bg-danger-50 px-3 py-2 text-xs text-danger-600 dark:bg-danger-900/40">
          {submitError}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        ) : null}
        <Button type="submit" disabled={upsert.isPending}>
          {upsert.isPending ? '保存中…' : initial ? '保存修改' : '创建'}
        </Button>
      </div>
    </form>
  );
}
