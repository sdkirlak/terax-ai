export type AgentStatus = "working" | "needs-input" | "idle" | "error";

export type AgentSource = "terminal" | "local";

export type AgentSignalKind =
  | "started"
  | "working"
  | "attention"
  | "finished"
  | "error"
  | "exited";

export type AgentSignal = {
  id: number;
  kind: AgentSignalKind;
  agent: string | null;
};

export type AgentRowBase = {
  id: string;
  agent: string;
  label?: string;
  status: AgentStatus;
  unread: boolean;
  startedAt: number;
  lastActivityAt: number;
  attentionSince: number | null;
};

export type TerminalAgentRow = AgentRowBase & {
  source: "terminal";
  leafId: number;
  tabId: number;
};

export type LocalAgentRow = AgentRowBase & {
  source: "local";
};

export type AgentRow = TerminalAgentRow | LocalAgentRow;

export type LocalAgentState = LocalAgentRow | null;

export type ProviderReadiness = "ready" | "missing" | "unavailable" | "error";

export type AgentProviderInfo = {
  id: string;
  label: string;
  aliases: string[];
  integration: string;
  experimental: boolean;
  readiness: ProviderReadiness;
};

export type TerminalTabAgentSummary =
  | { kind: "none"; muted: boolean; soundDisabledGlobally: boolean }
  | {
      kind: "single";
      agent: string;
      providers: string[];
      status: AgentStatus;
      unread: boolean;
      muted: boolean;
      soundDisabledGlobally: boolean;
    }
  | {
      kind: "multiple";
      count: number;
      providers: string[];
      status: AgentStatus;
      unread: boolean;
      muted: boolean;
      soundDisabledGlobally: boolean;
    };
