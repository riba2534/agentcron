'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/PasswordInput';
import { describe } from '@/lib/errorMessages';
import { toast } from '@/components/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确').max(255),
  password: z.string().min(1, '请输入密码').max(256),
});
const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确').max(255),
  password: z.string().min(12, '至少 12 位').max(256),
  displayName: z.string().min(1, '请输入昵称').max(80),
});

type Mode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/tasks';
  const [mode, setMode] = useState<Mode>('login');

  return (
    <Card className="w-full">
      <CardHeader className="gap-1.5">
        <h2 className="text-2xl font-semibold">欢迎使用 AgentCron</h2>
        <p className="text-sm text-neutral-500">5 分钟跑通你的第一个 AI 定时任务</p>
      </CardHeader>
      <CardContent>
        {mode === 'login' ? (
          <LoginForm
            onDone={() => router.push(next)}
            onSwitch={() => setMode('register')}
          />
        ) : (
          <RegisterForm
            onDone={() => router.push(next)}
            onSwitch={() => setMode('login')}
          />
        )}
      </CardContent>
    </Card>
  );
}

function LoginForm({ onDone, onSwitch }: { onDone: () => void; onSwitch: () => void }) {
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  });
  const login = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success('登录成功');
      onDone();
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });
  return (
    <form className="flex flex-col gap-3" onSubmit={form.handleSubmit((v) => login.mutate(v))}>
      <Field
        label="邮箱"
        error={form.formState.errors.email?.message}
        input={<Input type="email" autoComplete="email" {...form.register('email')} />}
      />
      <Field
        label={
          <span className="flex items-center justify-between">
            <span>密码</span>
            <Tooltip>
              <TooltipTrigger className="text-xs text-neutral-400 underline decoration-dotted">
                本机也要登录？
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                防止局域网误访问，本机依然走标准登录流程。
              </TooltipContent>
            </Tooltip>
          </span>
        }
        error={form.formState.errors.password?.message}
        input={<PasswordInput autoComplete="current-password" {...form.register('password')} />}
      />
      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? '登录中…' : '登录'}
        </Button>
        <Button type="button" variant="ghost" onClick={onSwitch}>
          没有账号？立即注册
        </Button>
      </div>
    </form>
  );
}

function RegisterForm({ onDone, onSwitch }: { onDone: () => void; onSwitch: () => void }) {
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '', displayName: '' },
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success('注册成功');
      onDone();
    },
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });
  return (
    <form className="flex flex-col gap-3" onSubmit={form.handleSubmit((v) => register.mutate(v))}>
      <Field
        label="昵称"
        error={form.formState.errors.displayName?.message}
        input={<Input autoComplete="nickname" {...form.register('displayName')} />}
      />
      <Field
        label="邮箱"
        error={form.formState.errors.email?.message}
        input={<Input type="email" autoComplete="email" {...form.register('email')} />}
      />
      <Field
        label={<span>密码 <span className="ml-1 text-xs text-neutral-400">至少 12 位</span></span>}
        error={form.formState.errors.password?.message}
        input={<PasswordInput autoComplete="new-password" {...form.register('password')} />}
      />
      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? '注册中…' : '注册'}
        </Button>
        <Button type="button" variant="ghost" onClick={onSwitch}>
          已有账号？返回登录
        </Button>
      </div>
    </form>
  );
}

function Field({ label, input, error }: { label: React.ReactNode; input: React.ReactNode; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {input}
      {error ? <p className="text-xs text-danger-600">{error}</p> : null}
    </div>
  );
}
