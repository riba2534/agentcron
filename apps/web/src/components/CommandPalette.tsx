'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Database, Files, ListPlus, Settings, ShieldCheck } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useCommandPalette } from '@/stores/commandPaletteStore';
import { trpc } from '@/lib/trpc-client';
import { useDebounce } from '@/hooks/useDebounce';

export function CommandPalette() {
  const open = useCommandPalette((s) => s.open);
  const setOpen = useCommandPalette((s) => s.setOpen);
  const close = useCommandPalette((s) => s.close);
  const query = useCommandPalette((s) => s.query);
  const setQuery = useCommandPalette((s) => s.setQuery);
  const debounced = useDebounce(query, 200);
  const router = useRouter();
  const tasks = trpc.task.list.useQuery(
    { search: debounced || undefined, limit: 8 },
    { enabled: open && debounced.length > 0, staleTime: 30_000 },
  );

  useEffect(() => {
    if (!open) setQuery('');
  }, [open, setQuery]);

  const go = (path: string) => {
    close();
    router.push(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="搜索任务、跳转、运行命令…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>无结果。试试输入 “task”、“model” 或 “/”</CommandEmpty>
        <CommandGroup heading="跳转">
          <CommandItem onSelect={() => go('/tasks')}>
            <Files className="h-4 w-4" /> 任务列表
            <CommandShortcut>G T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/settings/models')}>
            <Bot className="h-4 w-4" /> 模型管理
            <CommandShortcut>G M</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/settings/system')}>
            <ShieldCheck className="h-4 w-4" /> 系统状态
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/settings/profile')}>
            <Settings className="h-4 w-4" /> 个人资料
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="动作">
          <CommandItem onSelect={() => go('/tasks/new')}>
            <ListPlus className="h-4 w-4" /> 新建任务
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        {tasks.data?.items.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="搜索">
              {tasks.data.items.map((t) => (
                <CommandItem key={t.id} onSelect={() => go(`/tasks/${t.id}`)}>
                  <Database className="h-4 w-4" /> {t.name}
                  <span className="ml-auto text-xs text-neutral-500">{t.cronExpression}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
