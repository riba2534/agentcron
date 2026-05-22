'use client';

import { CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { describe } from '@/lib/errorMessages';

interface Props {
  id: string;
}

export function TestConnectionPanel({ id }: Props) {
  const utils = trpc.useUtils();
  const test = trpc.modelAdapter.testConnection.useMutation({
    onSuccess: () => {
      utils.modelAdapter.list.invalidate();
    },
  });

  const result = test.data ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">测试连通</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <Button onClick={() => test.mutate({ id })} disabled={test.isPending}>
          {test.isPending ? (
            <>
              <Hourglass className="h-4 w-4 animate-spin" /> 正在请求…
            </>
          ) : (
            '发起测试请求'
          )}
        </Button>
        {test.error ? (
          <div className="flex items-center gap-2 text-danger-600">
            <XCircle className="h-4 w-4" />
            {describe(test.error.data?.errorCode).title}
          </div>
        ) : null}
        {result ? (
          result.ok ? (
            <div className="flex items-center gap-2 rounded-md border border-success-500/30 bg-success-50 p-2 text-success-600 dark:bg-success-900">
              <CheckCircle2 className="h-4 w-4" />
              <span>成功 · {result.latencyMs} ms</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 rounded-md border border-danger-500/30 bg-danger-50 p-2 text-danger-600 dark:bg-danger-900">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4" /> 失败 · {result.latencyMs ?? '—'} ms
              </div>
              {result.errorMessage ? <pre className="whitespace-pre-wrap text-xs">{result.errorMessage}</pre> : null}
              <p className="text-xs">检查 base_url 和 token 是否正确,或确认模型可用。</p>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
