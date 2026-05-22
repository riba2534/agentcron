'use client';
import { ErrorBanner } from '@/components/ErrorBanner';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorBanner title="任务列表加载失败" message={error.message} onRetry={reset} />;
}
