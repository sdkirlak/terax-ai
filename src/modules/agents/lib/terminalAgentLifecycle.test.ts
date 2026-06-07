import { beforeEach, describe, expect, it } from "vitest";
import { useAgentStore } from "../store/agentStore";
import { useManagedAgentsStore } from "../store/managedAgentsStore";
import { clearDisposedTerminalAgent } from "./terminalAgentLifecycle";

describe("terminalAgentLifecycle", () => {
  beforeEach(() => {
    useAgentStore.getState().resetForTest();
    useManagedAgentsStore.setState({ agents: {} });
  });

  it("removes terminal agent state when a terminal leaf is disposed", () => {
    useAgentStore.getState().startTerminal(42, 7, "codex", "repo");
    useAgentStore
      .getState()
      .setTerminalStatus(42, "needs-input", { unread: true });
    useManagedAgentsStore.getState().register({
      leafId: 42,
      tabId: 7,
      sessionId: "session-42",
      task: "review this branch",
      cwd: "/repo",
    });

    clearDisposedTerminalAgent(42);

    expect(useAgentStore.getState().rows.terminal[42]).toBeUndefined();
    expect(useManagedAgentsStore.getState().agents[42]).toBeUndefined();
  });
});
