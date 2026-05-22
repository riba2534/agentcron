import { create } from 'zustand';

export interface ParsedTaskSpec {
  name: string;
  cronExpression: string;
  timezone: string;
  modelAdapterId: string;
  commandPrompt: string;
  systemPrompt?: string;
  workingDirectory: string;
  timeoutMs: number;
  maxBudgetUsd: number;
  monthlyBudgetCap?: number;
  notifyConfig?: Record<string, unknown>;
}

export type ClarifyStatus =
  | 'idle'
  | 'streaming'
  | 'need_more_info'
  | 'ready_to_create'
  | 'error';

export interface ClarifyTurn {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  ts: number;
  done: boolean;
}

interface ClarifySessionState {
  sessionId: string | null;
  turns: ClarifyTurn[];
  pendingChunks: string[];
  parsedSpec: ParsedTaskSpec | null;
  status: ClarifyStatus;
  error: { code: string; message: string } | null;
  reset: () => void;
  setSessionId: (id: string | null) => void;
  setStatus: (status: ClarifyStatus) => void;
  appendChunk: (text: string) => void;
  flushOneChar: () => void;
  finalizeTurn: (turn: { role: 'assistant' | 'user'; text: string }) => void;
  appendUserTurn: (text: string) => void;
  setParsedSpec: (spec: ParsedTaskSpec) => void;
  setError: (err: { code: string; message: string } | null) => void;
}

let turnIdCounter = 0;
function makeTurnId() {
  turnIdCounter += 1;
  return `t-${Date.now()}-${turnIdCounter}`;
}

export const useClarifySession = create<ClarifySessionState>((set, get) => ({
  sessionId: null,
  turns: [],
  pendingChunks: [],
  parsedSpec: null,
  status: 'idle',
  error: null,
  reset: () =>
    set({
      sessionId: null,
      turns: [],
      pendingChunks: [],
      parsedSpec: null,
      status: 'idle',
      error: null,
    }),
  setSessionId: (sessionId) => set({ sessionId }),
  setStatus: (status) => set({ status }),
  appendChunk: (text) => {
    if (!text) return;
    set((s) => ({ pendingChunks: [...s.pendingChunks, text] }));
    const turns = get().turns;
    const last = turns[turns.length - 1];
    if (!last || last.role !== 'assistant' || last.done) {
      set((s) => ({
        turns: [
          ...s.turns,
          { id: makeTurnId(), role: 'assistant', text: '', ts: Date.now(), done: false },
        ],
      }));
    }
  },
  flushOneChar: () => {
    const { pendingChunks, turns } = get();
    if (pendingChunks.length === 0) return;
    const head = pendingChunks[0]!;
    if (!head) {
      set({ pendingChunks: pendingChunks.slice(1) });
      return;
    }
    const ch = head[0]!;
    const restOfHead = head.slice(1);
    const nextChunks = restOfHead.length > 0 ? [restOfHead, ...pendingChunks.slice(1)] : pendingChunks.slice(1);
    const last = turns[turns.length - 1];
    if (!last || last.role !== 'assistant' || last.done) {
      set({
        turns: [
          ...turns,
          { id: makeTurnId(), role: 'assistant', text: ch, ts: Date.now(), done: false },
        ],
        pendingChunks: nextChunks,
      });
      return;
    }
    const updated: ClarifyTurn = { ...last, text: last.text + ch };
    set({
      turns: [...turns.slice(0, -1), updated],
      pendingChunks: nextChunks,
    });
  },
  finalizeTurn: ({ role, text }) =>
    set((s) => {
      const last = s.turns[s.turns.length - 1];
      if (last && !last.done && last.role === role) {
        return {
          turns: [
            ...s.turns.slice(0, -1),
            { ...last, text: text || last.text, done: true },
          ],
          pendingChunks: [],
        };
      }
      return {
        turns: [
          ...s.turns,
          { id: makeTurnId(), role, text, ts: Date.now(), done: true },
        ],
        pendingChunks: [],
      };
    }),
  appendUserTurn: (text) =>
    set((s) => ({
      turns: [
        ...s.turns,
        { id: makeTurnId(), role: 'user', text, ts: Date.now(), done: true },
      ],
    })),
  setParsedSpec: (parsedSpec) => set({ parsedSpec }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),
}));
