import { describe, expect, it } from "vitest";
import { terminalTabAgentSummary } from "./agentTabs";
import type { TerminalAgentRow } from "./types";

function row(overrides: Partial<TerminalAgentRow>): TerminalAgentRow {
  return {
    id: "terminal:1",
    source: "terminal",
    leafId: 1,
    tabId: 1,
    agent: "codex",
    label: "repo",
    status: "working",
    unread: false,
    startedAt: 1,
    lastActivityAt: 1,
    attentionSince: null,
    ...overrides,
  };
}

describe("terminalTabAgentSummary", () => {
  it("uses provider icon when one agent is tracked", () => {
    expect(
      terminalTabAgentSummary({
        tabId: 1,
        rows: [row({ agent: "codex" })],
        mutedTabIds: new Set(),
        globalSound: true,
      }),
    ).toMatchObject({ kind: "single", agent: "codex", muted: false });
  });

  it("uses generic indicator for multiple agents", () => {
    expect(
      terminalTabAgentSummary({
        tabId: 1,
        rows: [
          row({ agent: "codex" }),
          row({ id: "terminal:2", leafId: 2, agent: "claude" }),
        ],
        mutedTabIds: new Set(),
        globalSound: true,
      }),
    ).toMatchObject({ kind: "multiple", count: 2 });
  });

  it("picks status marker by priority then recency", () => {
    expect(
      terminalTabAgentSummary({
        tabId: 1,
        rows: [
          row({ id: "terminal:1", status: "idle", lastActivityAt: 100 }),
          row({
            id: "terminal:2",
            leafId: 2,
            status: "needs-input",
            lastActivityAt: 10,
          }),
        ],
        mutedTabIds: new Set([1]),
        globalSound: true,
      }),
    ).toMatchObject({ status: "needs-input", muted: true });
  });
});
