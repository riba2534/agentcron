'use client';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="w-full">
      <ErrorBanner title="登录页加载失败" message={error.message} retryLabel="重试" onRetry={reset} />
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={() => location.assign('/login')}>返回登录</Button>
      </div>
    </div>
  );
}
