'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/PasswordInput';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTheme, type ThemeMode } from '@/stores/themeStore';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { describe } from '@/lib/errorMessages';

const passSchema = z.object({
  oldPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(12, '至少 12 位').max(256),
});

export default function ProfilePage() {
  const me = trpc.auth.me.useQuery();
  const themeMode = useTheme((s) => s.mode);
  const setThemeMode = useTheme((s) => s.setMode);

  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => toast.success('密码已更新'),
    onError: (err) => {
      const m = describe(err.data?.errorCode);
      toast.error(m.title, m.hint ? { description: m.hint } : undefined);
    },
  });
  const form = useForm<z.infer<typeof passSchema>>({
    resolver: zodResolver(passSchema),
    mode: 'onBlur',
    defaultValues: { oldPassword: '', newPassword: '' },
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">账号</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {me.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : me.data ? (
            <>
              <Field label="邮箱" value={me.data.email} />
              <Field label="昵称" value={me.data.displayName ?? '—'} />
              <Field label="时区" value={me.data.timezone} />
              <Field label="注册时间" value={me.data.createdAt} />
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">界面</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <Label className="mb-1 block text-xs">主题</Label>
          <Select value={themeMode} onValueChange={(v) => setThemeMode(v as ThemeMode)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">跟随系统</SelectItem>
              <SelectItem value="light">浅色</SelectItem>
              <SelectItem value="dark">深色</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">修改密码</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={form.handleSubmit((v) => change.mutate(v))}>
            <Field
              label={<Label className="text-xs">当前密码</Label>}
              value={
                <>
                  <PasswordInput {...form.register('oldPassword')} autoComplete="current-password" />
                  {form.formState.errors.oldPassword ? (
                    <p className="mt-1 text-xs text-danger-600">{form.formState.errors.oldPassword.message}</p>
                  ) : null}
                </>
              }
            />
            <Field
              label={<Label className="text-xs">新密码 (至少 12 位)</Label>}
              value={
                <>
                  <PasswordInput {...form.register('newPassword')} autoComplete="new-password" />
                  {form.formState.errors.newPassword ? (
                    <p className="mt-1 text-xs text-danger-600">{form.formState.errors.newPassword.message}</p>
                  ) : null}
                </>
              }
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={change.isPending}>
                {change.isPending ? '更新中…' : '更新密码'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-2">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="min-w-0 break-words text-sm">{value}</span>
    </div>
  );
}
