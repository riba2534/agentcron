'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useShortcuts } from '@/stores/shortcutsStore';
import { KeyboardHint } from './KeyboardHint';

const SHORTCUTS = [
  { keys: ['⌘', 'K'], desc: '打开命令面板' },
  { keys: ['N'], desc: '新建任务' },
  { keys: ['G', 'T'], desc: '跳到任务列表' },
  { keys: ['G', 'M'], desc: '跳到模型管理' },
  { keys: ['G', 'S'], desc: '跳到系统状态' },
  { keys: ['?'], desc: '显示快捷键面板' },
  { keys: ['Esc'], desc: '关闭弹层' },
];

export function ShortcutsHelpDialog() {
  const open = useShortcuts((s) => s.helpOpen);
  const setOpen = useShortcuts((s) => s.setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>快捷键速查</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {SHORTCUTS.map((s) => (
            <div key={s.desc} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900">
              <span className="text-sm text-neutral-700 dark:text-neutral-200">{s.desc}</span>
              <KeyboardHint keys={s.keys} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
