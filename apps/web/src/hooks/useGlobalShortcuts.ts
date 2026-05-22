'use client';

import { useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useRouter } from 'next/navigation';
import { useCommandPalette } from '@/stores/commandPaletteStore';
import { useShortcuts } from '@/stores/shortcutsStore';

export function useGlobalShortcuts() {
  const router = useRouter();
  const togglePalette = useCommandPalette((s) => s.toggle);
  const toggleShortcuts = useShortcuts((s) => s.toggle);

  useHotkeys('mod+k', (e) => { e.preventDefault(); togglePalette(); }, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
  });

  useHotkeys('shift+/', (e) => { e.preventDefault(); toggleShortcuts(); });

  useHotkeys('n', (e) => { e.preventDefault(); router.push('/tasks/new'); });

  useHotkeys('g>t', () => { router.push('/tasks'); });
  useHotkeys('g>m', () => { router.push('/settings/models'); });
  useHotkeys('g>s', () => { router.push('/settings/system'); });
}

export function useEscapeStack(onEscape: () => void, when = true) {
  useEffect(() => {
    if (!when) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape, when]);
}
