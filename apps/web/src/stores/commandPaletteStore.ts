import { create } from 'zustand';

interface CommandPaletteState {
  open: boolean;
  query: string;
  toggle: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;
  setQuery: (q: string) => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  query: '',
  toggle: () => set((s) => ({ open: !s.open, query: s.open ? '' : s.query })),
  close: () => set({ open: false, query: '' }),
  setOpen: (open) => set({ open }),
  setQuery: (query) => set({ query }),
}));
