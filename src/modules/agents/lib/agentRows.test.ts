import { describe, expect, it } from "vitest";
import { agentBadgeState, sortedAgentRows } from "./agentRows";
import type { LocalAgentRow, TerminalAgentRow } from "./types";

function row(overrides: Partial<TerminalAgentRow>): TerminalAgentRow {
  return {
    id: "terminal:1",
    source: "terminal",
    leafId: 1,
    tabId: 10,
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

function localRow(overrides: Partial<LocalAgentRow>): LocalAgentRow {
  return {
    id: "local",
    source: "local",
    agent: "terax",
    status: "working",
    unread: false,
    startedAt: 1,
    lastActivityAt: 1,
    attentionSince: null,
    ...overrides,
  };
}

describe("agentRows", () => {
  it("sorts by latest activity rather than unread first", () => {
    const rows = [
      row({ id: "terminal:1", lastActivityAt: 20, unread: false }),
      row({ id: "terminal:2", leafId: 2, lastActivityAt: 10, unread: true }),
      row({ id: "terminal:3", leafId: 3, lastActivityAt: 30, unread: false }),
    ];
    expect(sortedAgentRows(rows).map((r) => r.id)).toEqual([
      "terminal:3",
      "terminal:1",
      "terminal:2",
    ]);
  });

  it("sorts equal activity rows by start time then terminal leaf fallback", () => {
    const rows = [
      localRow({ id: "local", startedAt: 10, lastActivityAt: 20 }),
      row({ id: "terminal:2", leafId: 2, startedAt: 10, lastActivityAt: 20 }),
      row({ id: "terminal:5", leafId: 5, startedAt: 10, lastActivityAt: 20 }),
      row({ id: "terminal:9", leafId: 9, startedAt: 30, lastActivityAt: 20 }),
    ];
    expect(sortedAgentRows(rows).map((r) => r.id)).toEqual([
      "terminal:9",
      "terminal:5",
      "terminal:2",
      "local",
    ]);
  });

  it("counts unread rows without adding a read-agent status dot", () => {
    expect(agentBadgeState([row({ unread: true })])).toEqual({
      unreadCount: 1,
    });
    expect(agentBadgeState([row({ status: "idle", unread: false })])).toEqual({
      unreadCount: 0,
    });
  });
});
