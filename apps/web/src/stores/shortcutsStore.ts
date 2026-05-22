import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ShortcutsState {
  helpOpen: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

export const useShortcuts = create<ShortcutsState>()(
  persist(
    (set) => ({
      helpOpen: false,
      toggle: () => set((s) => ({ helpOpen: !s.helpOpen })),
      setOpen: (helpOpen) => set({ helpOpen }),
    }),
    {
      name: 'cct.shortcuts',
      partialize: () => ({}),
    },
  ),
);
