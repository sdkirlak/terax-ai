import type { AgentStatus } from "./types";

export type AgentStatusMark = "dots" | "outline" | "ring";
export type AgentStatusTone = "muted" | "primary" | "destructive";

export type AgentStatusView = {
  label: string;
  mark: AgentStatusMark;
  tone: AgentStatusTone;
};

export function agentStatusView(status: AgentStatus): AgentStatusView {
  switch (status) {
    case "needs-input":
      return { label: "needs input", mark: "ring", tone: "primary" };
    case "idle":
      return { label: "idle", mark: "outline", tone: "primary" };
    case "error":
      return { label: "failed", mark: "outline", tone: "destructive" };
    case "working":
      return { label: "working", mark: "dots", tone: "muted" };
  }
}

export function isAttentionWorthy(status: AgentStatus): boolean {
  return status === "needs-input" || status === "idle" || status === "error";
}

export function agentStatusPriority(status: AgentStatus): number {
  switch (status) {
    case "needs-input":
      return 4;
    case "error":
      return 3;
    case "idle":
      return 2;
    case "working":
      return 1;
  }
}
