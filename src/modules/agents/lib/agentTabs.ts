import { agentStatusPriority } from "./agentStatus";
import type {
  AgentRow,
  TerminalAgentRow,
  TerminalTabAgentSummary,
} from "./types";

function isTerminalAgentRow(row: AgentRow): row is TerminalAgentRow {
  return row.source === "terminal";
}

export function terminalTabAgentSummary({
  tabId,
  rows,
  mutedTabIds,
  globalSound,
}: {
  tabId: number;
  rows: AgentRow[];
  mutedTabIds: Set<number>;
  globalSound: boolean;
}): TerminalTabAgentSummary {
  const tabRows = rows.filter(
    (row): row is TerminalAgentRow =>
      isTerminalAgentRow(row) && row.tabId === tabId,
  );
  const muted = mutedTabIds.has(tabId);
  const base = { muted, soundDisabledGlobally: !globalSound };
  if (tabRows.length === 0) return { kind: "none", ...base };

  const sorted = [...tabRows].sort((a, b) => {
    const byPriority =
      agentStatusPriority(b.status) - agentStatusPriority(a.status);
    if (byPriority !== 0) return byPriority;
    return b.lastActivityAt - a.lastActivityAt;
  });
  const top = sorted.find((row) => row.status === "working") ?? sorted[0];
  const providers = [...new Set(tabRows.map((row) => row.agent))];
  const unread = tabRows.some((row) => row.unread);

  if (providers.length === 1) {
    return {
      kind: "single",
      agent: providers[0],
      providers,
      status: top.status,
      unread,
      ...base,
    };
  }
  return {
    kind: "multiple",
    count: providers.length,
    providers,
    status: top.status,
    unread,
    ...base,
  };
}
