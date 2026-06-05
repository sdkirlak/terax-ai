import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStore } from "./agentStore";

describe("agentStore", () => {
  beforeEach(() => {
    useAgentStore.getState().resetForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps idle rows alive when unread is cleared", () => {
    const store = useAgentStore.getState();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    store.startTerminal(1, 10, "codex", "repo");
    vi.setSystemTime(2_000);
    store.setTerminalStatus(1, "idle", { unread: true });
    const lastActivityAt =
      useAgentStore.getState().rows.terminal[1]?.lastActivityAt;
    vi.setSystemTime(3_000);
    store.clearTerminalUnread(1);
    expect(useAgentStore.getState().rows.terminal[1]).toMatchObject({
      status: "idle",
      unread: false,
      lastActivityAt,
    });
  });

  it("starts detected terminal sessions idle until a working signal arrives", () => {
    const store = useAgentStore.getState();
    store.startTerminal(1, 10, "claude", "repo");

    expect(useAgentStore.getState().rows.terminal[1]).toMatchObject({
      agent: "claude",
      status: "idle",
      unread: false,
    });
  });

  it("preserves terminal attention time while needs input", () => {
    const store = useAgentStore.getState();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    store.startTerminal(1, 10, "codex", "repo");
    vi.setSystemTime(2_000);
    store.setTerminalStatus(1, "needs-input");
    expect(useAgentStore.getState().rows.terminal[1]?.attentionSince).toBe(
      2_000,
    );
    vi.setSystemTime(3_000);
    store.setTerminalStatus(1, "needs-input");
    expect(useAgentStore.getState().rows.terminal[1]?.attentionSince).toBe(
      2_000,
    );
    vi.setSystemTime(4_000);
    store.setTerminalStatus(1, "idle");
    expect(
      useAgentStore.getState().rows.terminal[1]?.attentionSince,
    ).toBeNull();
  });

  it("marks a working terminal idle when the user interrupts it", () => {
    const store = useAgentStore.getState();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    store.startTerminal(1, 10, "codex", "repo");
    vi.setSystemTime(2_000);
    store.setTerminalStatus(1, "working", { unread: true });
    vi.setSystemTime(3_000);
    store.interruptTerminal(1);

    expect(useAgentStore.getState().rows.terminal[1]).toMatchObject({
      status: "idle",
      unread: false,
      lastActivityAt: 3_000,
      attentionSince: null,
    });
  });

  it("removes row only on exit", () => {
    const store = useAgentStore.getState();
    store.startTerminal(1, 10, "codex", "repo");
    store.setTerminalStatus(1, "needs-input", { unread: true });
    store.exitTerminal(1);
    expect(useAgentStore.getState().rows.terminal[1]).toBeUndefined();
  });

  it("sets terminal labels", () => {
    const store = useAgentStore.getState();
    store.startTerminal(1, 10, "codex", "repo");
    store.setTerminalLabel(1, "feature branch");
    expect(useAgentStore.getState().rows.terminal[1]?.label).toBe(
      "feature branch",
    );
  });

  it("toggles tab sound mute", () => {
    const store = useAgentStore.getState();
    const initialMutedTabIds = store.mutedTabIds;
    store.toggleTabSoundMute(10);
    expect(useAgentStore.getState().mutedTabIds).not.toBe(initialMutedTabIds);
    expect(useAgentStore.getState().mutedTabIds.has(10)).toBe(true);
    store.toggleTabSoundMute(10);
    expect(useAgentStore.getState().mutedTabIds.has(10)).toBe(false);
  });

  it("sets tab sound mute", () => {
    const store = useAgentStore.getState();
    const initialMutedTabIds = store.mutedTabIds;
    store.setTabSoundMuted(10, true);
    const mutedTabIds = useAgentStore.getState().mutedTabIds;
    expect(mutedTabIds).not.toBe(initialMutedTabIds);
    expect(mutedTabIds.has(10)).toBe(true);
    store.setTabSoundMuted(10, false);
    expect(useAgentStore.getState().mutedTabIds).not.toBe(mutedTabIds);
    expect(useAgentStore.getState().mutedTabIds.has(10)).toBe(false);
  });

  it("keeps tab sound mute set reference on no-op calls", () => {
    const store = useAgentStore.getState();
    const initialMutedTabIds = store.mutedTabIds;
    store.setTabSoundMuted(10, false);
    expect(useAgentStore.getState().mutedTabIds).toBe(initialMutedTabIds);
    store.setTabSoundMuted(10, true);
    const mutedTabIds = useAgentStore.getState().mutedTabIds;
    store.setTabSoundMuted(10, true);
    expect(useAgentStore.getState().mutedTabIds).toBe(mutedTabIds);
  });

  it("stores local rows without terminal ids", () => {
    const now = Date.now();
    useAgentStore.getState().setLocalAgent({
      id: "local:terax",
      source: "local",
      agent: "Terax",
      label: "Terax",
      status: "needs-input",
      unread: true,
      startedAt: now,
      lastActivityAt: now,
      attentionSince: now,
    });
    expect(useAgentStore.getState().rows.local).toMatchObject({
      source: "local",
      status: "needs-input",
      unread: true,
    });
    expect(useAgentStore.getState().rows.local).not.toHaveProperty("leafId");
    expect(useAgentStore.getState().rows.local).not.toHaveProperty("tabId");
  });

  it("clears local unread while keeping the row", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    useAgentStore.getState().setLocalAgent({
      id: "local:terax",
      source: "local",
      agent: "Terax",
      label: "Terax",
      status: "needs-input",
      unread: true,
      startedAt: 1_000,
      lastActivityAt: 1_000,
      attentionSince: 1_000,
    });
    vi.setSystemTime(2_000);
    useAgentStore.getState().clearLocalUnread();
    expect(useAgentStore.getState().rows.local).toMatchObject({
      id: "local:terax",
      unread: false,
      lastActivityAt: 1_000,
    });
  });

  it("clears only visible focused terminal unread state", () => {
    const store = useAgentStore.getState();
    store.startTerminal(1, 10, "codex", "repo");
    store.setTerminalStatus(1, "idle", { unread: true });

    store.clearVisibleTerminalUnread({ focused: false, activeLeafId: 1 });
    expect(useAgentStore.getState().rows.terminal[1]?.unread).toBe(true);

    store.clearVisibleTerminalUnread({ focused: true, activeLeafId: null });
    expect(useAgentStore.getState().rows.terminal[1]?.unread).toBe(true);

    store.clearVisibleTerminalUnread({ focused: true, activeLeafId: 1 });
    expect(useAgentStore.getState().rows.terminal[1]?.unread).toBe(false);
  });

  it("clears all unread rows without changing statuses", () => {
    const store = useAgentStore.getState();
    store.startTerminal(1, 10, "codex", "repo");
    store.startTerminal(2, 20, "claude", "docs");
    store.setTerminalStatus(1, "idle", { unread: true });
    store.setTerminalStatus(2, "needs-input", { unread: true });
    store.setLocalAgent({
      id: "local:terax",
      source: "local",
      agent: "Terax",
      label: "Terax",
      status: "error",
      unread: true,
      startedAt: 1_000,
      lastActivityAt: 1_000,
      attentionSince: null,
    });

    store.clearAllUnread();

    expect(useAgentStore.getState().rows.terminal[1]).toMatchObject({
      status: "idle",
      unread: false,
    });
    expect(useAgentStore.getState().rows.terminal[2]).toMatchObject({
      status: "needs-input",
      unread: false,
    });
    expect(useAgentStore.getState().rows.local).toMatchObject({
      status: "error",
      unread: false,
    });
  });
});
