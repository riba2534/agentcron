'use client';

import { useApplyTheme } from '@/hooks/useApplyTheme';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { CommandPalette } from './CommandPalette';
import { ShortcutsHelpDialog } from './ShortcutsHelpDialog';

export function GlobalShellEffects() {
  useApplyTheme();
  useGlobalShortcuts();
  return (
    <>
      <CommandPalette />
      <ShortcutsHelpDialog />
    </>
  );
}
