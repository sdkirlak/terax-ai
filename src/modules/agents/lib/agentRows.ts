import { isAttentionWorthy } from "./agentStatus";
import type { AgentRow } from "./types";

export type AgentBadgeState = {
  unreadCount: number;
  showStatusDot: boolean;
};

function rowTieBreaker(row: AgentRow): number {
  return row.source === "terminal" ? row.leafId : 0;
}

export function sortedAgentRows(rows: AgentRow[]): AgentRow[] {
  return [...rows].sort((a, b) => {
    const byActivity = b.lastActivityAt - a.lastActivityAt;
    if (byActivity !== 0) return byActivity;
    return b.startedAt - a.startedAt || rowTieBreaker(b) - rowTieBreaker(a);
  });
}

export function agentBadgeState(rows: AgentRow[]): AgentBadgeState {
  const unreadCount = rows.filter((row) => row.unread).length;
  return {
    unreadCount,
    showStatusDot:
      unreadCount === 0 && rows.some((row) => isAttentionWorthy(row.status)),
  };
}
