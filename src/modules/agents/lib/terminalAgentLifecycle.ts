import { useAgentStore } from "../store/agentStore";
import { useManagedAgentsStore } from "../store/managedAgentsStore";

export function clearDisposedTerminalAgent(leafId: number): void {
  useAgentStore.getState().exitTerminal(leafId);
  useManagedAgentsStore.getState().remove(leafId);
}
