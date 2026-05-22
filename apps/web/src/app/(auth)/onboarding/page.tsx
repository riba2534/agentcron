'use client';

import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="flex flex-col items-center gap-2 pt-8 text-center">
        <Sparkles className="h-10 w-10 text-primary-500" />
        <h2 className="text-xl font-semibold">欢迎使用 AgentCron</h2>
        <p className="max-w-sm text-sm text-neutral-500">
          用一句自然语言注册定时 AI 任务，自动每日 / 每小时 / 每周触发。
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-8">
        <Button onClick={() => router.push('/tasks')}>开始使用</Button>
        <Button variant="ghost" onClick={() => router.push('/settings/models')}>
          先去添加模型
        </Button>
        <p className="pt-2 text-center text-xs text-neutral-400">
          可在「设置 · 模型管理」中手动添加 ANTHROPIC_BASE_URL / TOKEN / MODEL 配置。
        </p>
      </CardContent>
    </Card>
  );
}
