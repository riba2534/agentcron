'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Bot, Settings, ShieldCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/settings/models', label: '模型', icon: Bot },
  { href: '/settings/profile', label: '个人资料', icon: User },
  { href: '/settings/system', label: '系统状态', icon: ShieldCheck },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Settings className="h-4 w-4" />
        <span>设置</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="flex flex-row gap-1 lg:flex-col" aria-label="设置导航">
          {ITEMS.map((it) => {
            const active = pathname.startsWith(it.href);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800',
                )}
              >
                <Icon className="h-4 w-4" /> {it.label}
              </Link>
            );
          })}
        </nav>
        <div>{children}</div>
      </div>
    </div>
  );
}
