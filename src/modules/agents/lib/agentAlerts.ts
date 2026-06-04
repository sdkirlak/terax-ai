import { isAttentionWorthy } from "./agentStatus";
import type { AgentStatus } from "./types";

export type AgentAlertDecisionArgs = {
  status: AgentStatus;
  appFocused: boolean;
  exactAgentVisible: boolean;
  alertWhenActive: boolean;
  globalSound: boolean;
  tabMuted: boolean;
};

export type AgentAlertDecision = {
  unread: boolean;
  toast: boolean;
  osNotify: boolean;
  playSound: boolean;
};

export function agentAlertDecision(
  args: AgentAlertDecisionArgs,
): AgentAlertDecision {
  const attention = isAttentionWorthy(args.status);
  const exactActive = args.exactAgentVisible;
  const mayVisualAlert = attention && !exactActive;
  const maySound =
    attention && (!exactActive || args.alertWhenActive) && args.globalSound;
  return {
    unread: mayVisualAlert,
    toast: mayVisualAlert && args.appFocused,
    osNotify: mayVisualAlert && !args.appFocused,
    playSound: maySound && !args.tabMuted,
  };
}
