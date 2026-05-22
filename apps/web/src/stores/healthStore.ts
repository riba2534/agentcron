import { create } from 'zustand';

export type HealthLevel = 'ok' | 'warn' | 'error' | 'unknown';

interface HealthState {
  level: HealthLevel;
  summary: string;
  lastChecked: number;
  setStatus: (input: { level: HealthLevel; summary: string }) => void;
}

export const useHealth = create<HealthState>((set) => ({
  level: 'unknown',
  summary: '尚未检查',
  lastChecked: 0,
  setStatus: ({ level, summary }) => set({ level, summary, lastChecked: Date.now() }),
}));
