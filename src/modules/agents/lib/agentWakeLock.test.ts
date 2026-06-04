import { describe, expect, it } from "vitest";
import type { TerminalAgentRow } from "./types";
import { shouldHoldAgentWakeLock } from "./agentWakeLock";

function row(
  leafId: number,
  status: TerminalAgentRow["status"],
): TerminalAgentRow {
  return {
    id: `terminal:${leafId}`,
    source: "terminal",
    leafId,
    tabId: leafId + 10,
    agent: "codex",
    label: "repo",
    status,
    unread: false,
    startedAt: 1,
    lastActivityAt: 1,
    attentionSince: null,
  };
}

describe("shouldHoldAgentWakeLock", () => {
  it("does not hold when agent wake lock is disabled", () => {
    expect(
      shouldHoldAgentWakeLock({
        enabled: false,
        focused: true,
        terminalRows: {
          1: row(1, "working"),
        },
      }),
    ).toBe(false);
  });

  it("holds only while Terax is focused and at least one terminal agent is working", () => {
    expect(
      shouldHoldAgentWakeLock({
        enabled: true,
        focused: true,
        terminalRows: {
          1: row(1, "idle"),
          2: row(2, "working"),
        },
      }),
    ).toBe(true);

    expect(
      shouldHoldAgentWakeLock({
        enabled: true,
        focused: false,
        terminalRows: {
          1: row(1, "working"),
        },
      }),
    ).toBe(false);

    expect(
      shouldHoldAgentWakeLock({
        enabled: true,
        focused: true,
        terminalRows: {
          1: row(1, "needs-input"),
          2: row(2, "error"),
        },
      }),
    ).toBe(false);
  });
});
