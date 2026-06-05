import { create } from "zustand";
import type {
  AgentStatus,
  LocalAgentState,
  TerminalAgentRow,
} from "../lib/types";

type AgentStoreState = {
  rows: {
    terminal: Record<number, TerminalAgentRow>;
    local: LocalAgentState;
  };
  mutedTabIds: Set<number>;
  startTerminal: (
    leafId: number,
    tabId: number,
    agent: string,
    label?: string,
  ) => void;
  setTerminalLabel: (leafId: number, label: string) => void;
  setTerminalStatus: (
    leafId: number,
    status: AgentStatus,
    options?: { unread?: boolean },
  ) => void;
  interruptTerminal: (leafId: number) => void;
  clearTerminalUnread: (leafId: number) => void;
  clearVisibleTerminalUnread: (options: {
    focused: boolean;
    activeLeafId: number | null;
  }) => void;
  clearAllUnread: () => void;
  exitTerminal: (leafId: number) => void;
  setLocalAgent: (row: LocalAgentState) => void;
  clearLocalUnread: () => void;
  toggleTabSoundMute: (tabId: number) => void;
  setTabSoundMuted: (tabId: number, muted: boolean) => void;
  resetForTest: () => void;
};

function terminalRowId(leafId: number): string {
  return `terminal:${leafId}`;
}

function nextAttentionSince(
  status: AgentStatus,
  now: number,
  current: number | null,
): number | null {
  if (status !== "needs-input") return null;
  return current ?? now;
}

function initialRows(): AgentStoreState["rows"] {
  return { terminal: {}, local: null };
}

export const useAgentStore = create<AgentStoreState>((set) => ({
  rows: initialRows(),
  mutedTabIds: new Set(),

  startTerminal: (leafId, tabId, agent, label) =>
    set((state) => {
      const now = Date.now();
      return {
        rows: {
          ...state.rows,
          terminal: {
            ...state.rows.terminal,
            [leafId]: {
              id: terminalRowId(leafId),
              source: "terminal",
              leafId,
              tabId,
              agent,
              label,
              status: "idle",
              unread: false,
              startedAt: now,
              lastActivityAt: now,
              attentionSince: null,
            },
          },
        },
      };
    }),

  setTerminalLabel: (leafId, label) =>
    set((state) => {
      const row = state.rows.terminal[leafId];
      if (!row || row.label === label) return state;
      return {
        rows: {
          ...state.rows,
          terminal: { ...state.rows.terminal, [leafId]: { ...row, label } },
        },
      };
    }),

  setTerminalStatus: (leafId, status, options) =>
    set((state) => {
      const row = state.rows.terminal[leafId];
      if (!row) return state;
      const now = Date.now();
      return {
        rows: {
          ...state.rows,
          terminal: {
            ...state.rows.terminal,
            [leafId]: {
              ...row,
              status,
              unread: options?.unread ?? row.unread,
              lastActivityAt: now,
              attentionSince: nextAttentionSince(
                status,
                now,
                row.attentionSince,
              ),
            },
          },
        },
      };
    }),

  interruptTerminal: (leafId) =>
    set((state) => {
      const row = state.rows.terminal[leafId];
      if (!row) return state;
      const now = Date.now();
      return {
        rows: {
          ...state.rows,
          terminal: {
            ...state.rows.terminal,
            [leafId]: {
              ...row,
              status: "idle",
              unread: false,
              lastActivityAt: now,
              attentionSince: null,
            },
          },
        },
      };
    }),

  clearTerminalUnread: (leafId) =>
    set((state) => {
      const row = state.rows.terminal[leafId];
      if (!row?.unread) return state;
      return {
        rows: {
          ...state.rows,
          terminal: {
            ...state.rows.terminal,
            [leafId]: { ...row, unread: false },
          },
        },
      };
    }),

  clearVisibleTerminalUnread: ({ focused, activeLeafId }) =>
    set((state) => {
      if (!focused || activeLeafId === null) return state;
      const row = state.rows.terminal[activeLeafId];
      if (!row?.unread) return state;
      return {
        rows: {
          ...state.rows,
          terminal: {
            ...state.rows.terminal,
            [activeLeafId]: { ...row, unread: false },
          },
        },
      };
    }),

  clearAllUnread: () =>
    set((state) => {
      const terminal = Object.entries(state.rows.terminal).reduce<
        AgentStoreState["rows"]["terminal"]
      >((next, [leafId, row]) => {
        next[Number(leafId)] = row.unread ? { ...row, unread: false } : row;
        return next;
      }, {});
      const local = state.rows.local?.unread
        ? { ...state.rows.local, unread: false }
        : state.rows.local;
      return { rows: { terminal, local } };
    }),

  exitTerminal: (leafId) =>
    set((state) => {
      if (!state.rows.terminal[leafId]) return state;
      const terminal = { ...state.rows.terminal };
      delete terminal[leafId];
      return { rows: { ...state.rows, terminal } };
    }),

  setLocalAgent: (row) =>
    set((state) => ({ rows: { ...state.rows, local: row } })),

  clearLocalUnread: () =>
    set((state) => {
      const local = state.rows.local;
      if (!local?.unread) return state;
      return { rows: { ...state.rows, local: { ...local, unread: false } } };
    }),

  toggleTabSoundMute: (tabId) =>
    set((state) => {
      const mutedTabIds = new Set(state.mutedTabIds);
      if (mutedTabIds.has(tabId)) {
        mutedTabIds.delete(tabId);
      } else {
        mutedTabIds.add(tabId);
      }
      return { mutedTabIds };
    }),

  setTabSoundMuted: (tabId, muted) =>
    set((state) => {
      if (muted === state.mutedTabIds.has(tabId)) return state;
      const mutedTabIds = new Set(state.mutedTabIds);
      if (muted) {
        mutedTabIds.add(tabId);
      } else {
        mutedTabIds.delete(tabId);
      }
      return { mutedTabIds };
    }),

  resetForTest: () => set({ rows: initialRows(), mutedTabIds: new Set() }),
}));
