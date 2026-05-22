'use client';

import { useEffect } from 'react';
import { applyTheme, useTheme } from '@/stores/themeStore';

export function useApplyTheme() {
  const mode = useTheme((s) => s.mode);
  useEffect(() => {
    applyTheme(mode);
    if (mode !== 'auto') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('auto');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);
}
