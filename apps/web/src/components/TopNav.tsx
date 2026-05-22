'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Settings, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { HealthLight } from './HealthLight';
import { useCommandPalette } from '@/stores/commandPaletteStore';
import { KeyboardHint } from './KeyboardHint';
import { cn } from '@/lib/utils';

const NAV = [
  { label: '任务', href: '/tasks' },
  { label: '新建任务', href: '/tasks/new' },
  { label: '模型', href: '/settings/models' },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const togglePalette = useCommandPalette((s) => s.toggle);

  const onLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-0/85 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/85">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
        <Link href="/tasks" className="flex items-center gap-2 text-md font-semibold text-primary-600 dark:text-primary-400">
          <img src="/logo/logo.png" alt="AgentCron" className="h-7 w-7 rounded-md" />
          <span className="hidden sm:inline">AgentCron</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/tasks/new' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-neutral-200 bg-neutral-50 text-neutral-600 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900"
            onClick={() => togglePalette()}
          >
            <span>搜索 / 命令</span>
            <KeyboardHint keys={['⌘', 'K']} />
          </Button>
          <HealthLight />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="账号菜单">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                  {(me.data?.email ?? '?').slice(0, 1).toUpperCase()}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <div className="flex flex-col gap-0.5 px-2 py-1.5 text-xs">
                <span className="font-medium text-neutral-800 dark:text-neutral-100">
                  {me.data?.displayName || '本机用户'}
                </span>
                <span className="text-neutral-500">{me.data?.email ?? '—'}</span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings/profile">
                  <User className="h-4 w-4" /> 个人资料
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/system">
                  <Settings className="h-4 w-4" /> 系统状态
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="h-4 w-4" /> 退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
