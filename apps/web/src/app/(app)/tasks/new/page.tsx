'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MessageSquareText, Send } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatComposer } from '@/components/ChatComposer';
import { TrustLevelTag } from '@/components/TrustLevelTag';
import { SpecPreviewCard } from '@/components/SpecPreviewCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useClarifySSE } from '@/hooks/useClarifySSE';
import { useClarifySession, type ParsedTaskSpec } from '@/stores/clarifySessionStore';
import { toast } from '@/components/ui/sonner';
import { describe } from '@/lib/errorMessages';

export default function NewTaskPage() {
  const router = useRouter();
  const [rawInput, setRawInput] = useState('');
  const [modelAdapterId, setModelAdapterId] = useState<string>('');

  const sessionId = useClarifySession((s) => s.sessionId);
  const setSessionId = useClarifySession((s) => s.setSessionId);
  const turns = useClarifySession((s) => s.turns);
  const status = useClarifySession((s) => s.status);
  const error = useClarifySession((s) => s.error);
  const parsedSpec = useClarifySession((s) => s.parsedSpec);
  const reset = useClarifySession((s) => s.reset);
  const appendUserTurn = useClarifySession((s) => s.appendUserTurn);
  const setStatus = useClarifySession((s) => s.setStatus);

  const utils = trpc.useUtils();
  const models = trpc.modelAdapter.list.useQuery(undefined, { staleTime: 60_000 });

  useEffect(() => {
    if (!modelAdapterId && models.data?.length) {
      const sh = models.data.find((m) => m.trustLevel === 'self-hosted');
      setModelAdapterId(sh?.id ?? models.data[0]!.id);
    }
  }, [models.data, modelAdapterId]);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  useClarifySSE(sessionId, { enabled: !!sessionId });

  const start = trpc.clarify.start.useMutation({
    onSuccess: (res) => {
      reset();
      setSessionId(res.sessionId);
      appendUserTurn(rawInput);
      setStatus('streaming');
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });

  const respond = trpc.clarify.respond.useMutation({
    onSuccess: () => setStatus('streaming'),
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });

  const cancel = trpc.clarify.cancel.useMutation({
    onSuccess: () => {
      reset();
      router.push('/tasks');
    },
  });

  const create = trpc.task.create.useMutation({
    onSuccess: (t) => {
      reset();
      utils.task.list.invalidate();
      utils.system.stats.invalidate();
      toast.success('任务已创建');
      router.push(`/tasks/${t.id}`);
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });

  const onStart = () => {
    if (!rawInput.trim() || !modelAdapterId) return;
    start.mutate({ rawInput: rawInput.trim(), modelAdapterId });
  };

  const onReply = async (text: string) => {
    if (!sessionId) return;
    appendUserTurn(text);
    await respond.mutateAsync({ sessionId, userMessage: text });
  };

  const onCancel = () => {
    if (sessionId) cancel.mutate({ sessionId });
    else router.push('/tasks');
  };

  const onConfirmCreate = () => {
    if (!parsedSpec || !sessionId) return;
    const payload = {
      sessionId,
      name: parsedSpec.name,
      cronExpression: parsedSpec.cronExpression,
      timezone: parsedSpec.timezone,
      modelAdapterId: parsedSpec.modelAdapterId || modelAdapterId,
      commandPrompt: parsedSpec.commandPrompt,
      systemPrompt: parsedSpec.systemPrompt,
      workingDirectory: parsedSpec.workingDirectory,
      timeoutMs: parsedSpec.timeoutMs,
      maxBudgetUsd: parsedSpec.maxBudgetUsd,
      monthlyBudgetCap: parsedSpec.monthlyBudgetCap,
      notifyConfig: parsedSpec.notifyConfig,
    } satisfies Parameters<typeof create.mutate>[0];
    create.mutate(payload);
  };

  const trustLevel = useMemo(() => {
    return models.data?.find((m) => m.id === (parsedSpec?.modelAdapterId ?? modelAdapterId))?.trustLevel ?? 'self-hosted';
  }, [models.data, modelAdapterId, parsedSpec?.modelAdapterId]);

  const modelLabel = useMemo(() => {
    const m = models.data?.find((x) => x.id === (parsedSpec?.modelAdapterId ?? modelAdapterId));
    return m ? `${m.alias} · ${m.modelId}` : undefined;
  }, [models.data, modelAdapterId, parsedSpec?.modelAdapterId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push('/tasks')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">新建任务</h1>
        </div>
        <Button variant="ghost" onClick={onCancel}>
          关闭
        </Button>
      </div>
      {status === 'streaming' ? (
        <Progress value={undefined} className="h-1" />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          {!sessionId ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <Label className="mb-2 block">想让 AI 每天 / 每周 / 每小时帮你做什么?</Label>
              <Textarea
                placeholder="例如:每天早 9 点把昨天 GitHub 通知整理成飞书 markdown,发给我"
                rows={4}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
              />
              <div className="mt-3 flex items-end gap-3">
                <div className="flex-1">
                  <Label className="mb-1 block text-xs">模型</Label>
                  <Select value={modelAdapterId} onValueChange={setModelAdapterId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.data?.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{m.alias}</span>
                            <TrustLevelTag level={m.trustLevel} showLabel={false} />
                            <span className="text-xs text-neutral-500">{m.modelId}</span>
                          </div>
                        </SelectItem>
                      )) ?? null}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={onStart} disabled={!rawInput.trim() || !modelAdapterId || start.isPending}>
                  <Send className="h-4 w-4" />
                  {start.isPending ? '创建中…' : '开始澄清'}
                </Button>
              </div>
              {(models.data?.length ?? 0) === 0 ? (
                <p className="mt-3 text-xs text-neutral-500">
                  还没有可用模型,
                  <Link href="/settings/models" className="underline">
                    去导入
                  </Link>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
                <MessageSquareText className="h-4 w-4" /> 澄清会话 #{sessionId.slice(0, 8)}
              </div>
              <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
                {turns.map((t) => (
                  <ChatBubble key={t.id} role={t.role} text={t.text} done={t.done} />
                ))}
                {turns.length === 0 ? (
                  <p className="text-xs text-neutral-400">等待 AI 回复…</p>
                ) : null}
              </div>
              {error ? (
                <div className="mt-3">
                  <ErrorBanner title="澄清出错" message={describe(error.code).title + (error.message ? ` · ${error.message}` : '')} />
                </div>
              ) : null}
              <div className="mt-3">
                <ChatComposer
                  onSubmit={onReply}
                  pending={respond.isPending}
                  disabled={!sessionId || status === 'streaming'}
                />
              </div>
            </div>
          )}
        </div>
        <div>
          {parsedSpec ? (
            <SpecPreviewCard
              spec={parsedSpec as ParsedTaskSpec}
              trustLevel={trustLevel}
              modelLabel={modelLabel}
              onConfirm={onConfirmCreate}
              onEdit={() => setStatus('need_more_info')}
              pending={create.isPending}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
              澄清完成后,这里会出现任务规格预览。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
