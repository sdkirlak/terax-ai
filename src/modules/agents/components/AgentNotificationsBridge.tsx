import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import type { Tab } from "@/modules/tabs";
import { hasLeaf, leafIdForPty } from "@/modules/terminal";
import { maybeTriggerManagedReview } from "../lib/review";
import { routeAgentStatus } from "../lib/route";
import type { AgentSignal, AgentStatus, TerminalAgentRow } from "../lib/types";
import { useWindowFocus } from "../lib/useWindowFocus";
import { useAgentStore } from "../store/agentStore";
import { useManagedAgentsStore } from "../store/managedAgentsStore";

type Activate = (tabId: number, leafId: number) => void;
type Ctx = {
  tabs: Tab[];
  activeId: number;
  activeLeafId: number | null;
  focused: boolean;
  onActivate: Activate;
};

function tabInfo(
  tabs: Tab[],
  leafId: number,
): { tabId: number; title: string } | null {
  for (const t of tabs) {
    if (t.kind === "terminal" && hasLeaf(t.paneTree, leafId)) {
      return { tabId: t.id, title: t.title };
    }
  }
  return null;
}

function routeRowStatus(
  row: TerminalAgentRow,
  status: AgentStatus,
  title: string,
  ctx: Ctx,
): boolean {
  const body = tabInfo(ctx.tabs, row.leafId)?.title ?? row.label;
  const { unread } = routeAgentStatus({
    status,
    focused: ctx.focused,
    exactAgentVisible:
      ctx.activeId === row.tabId && ctx.activeLeafId === row.leafId,
    tabMuted: useAgentStore.getState().mutedTabIds.has(row.tabId),
    title,
    body,
    agent: row.agent,
    onActivate: () => ctx.onActivate(row.tabId, row.leafId),
  });
  return unread;
}

function handleSignal(sig: AgentSignal, ctx: Ctx): void {
  const leafId = leafIdForPty(sig.id);
  if (leafId === null) return;

  switch (sig.kind) {
    case "started": {
      const info = tabInfo(ctx.tabs, leafId);
      if (!info) return;
      useAgentStore
        .getState()
        .startTerminal(leafId, info.tabId, sig.agent ?? "agent", info.title);
      return;
    }
    case "working": {
      const store = useAgentStore.getState();
      if (!store.rows.terminal[leafId]) return;
      store.setTerminalStatus(leafId, "working", { unread: false });
      return;
    }
    case "attention": {
      const store = useAgentStore.getState();
      const row = store.rows.terminal[leafId];
      if (!row) return;
      const agent = sig.agent ?? row.agent;
      const unread = routeRowStatus(
        { ...row, agent },
        "needs-input",
        `${agent} needs your input`,
        ctx,
      );
      store.setTerminalStatus(leafId, "needs-input", { unread });
      return;
    }
    case "finished": {
      const store = useAgentStore.getState();
      const row = store.rows.terminal[leafId];
      if (row) {
        const agent = sig.agent ?? row.agent;
        const unread = routeRowStatus(
          { ...row, agent },
          "idle",
          `${agent} is idle`,
          ctx,
        );
        store.setTerminalStatus(leafId, "idle", { unread });
      }
      maybeTriggerManagedReview(leafId);
      return;
    }
    case "error": {
      const store = useAgentStore.getState();
      const row = store.rows.terminal[leafId];
      if (!row) return;
      const agent = sig.agent ?? row.agent;
      const unread = routeRowStatus(
        { ...row, agent },
        "error",
        `${agent} failed`,
        ctx,
      );
      store.setTerminalStatus(leafId, "error", { unread });
      return;
    }
    case "exited":
      useAgentStore.getState().exitTerminal(leafId);
      useManagedAgentsStore.getState().remove(leafId);
      return;
  }
}

export function AgentNotificationsBridge({
  tabs,
  activeId,
  activeLeafId,
  onActivate,
}: {
  tabs: Tab[];
  activeId: number;
  activeLeafId: number | null;
  onActivate: Activate;
}) {
  const focused = useWindowFocus();
  const ctxRef = useRef<Ctx>({
    tabs,
    activeId,
    activeLeafId,
    focused,
    onActivate,
  });
  ctxRef.current = { tabs, activeId, activeLeafId, focused, onActivate };

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    listen<AgentSignal>("terax:agent-signal", (e) =>
      handleSignal(e.payload, ctxRef.current),
    )
      .then((u) => {
        if (alive) unlisten = u;
        else u();
      })
      .catch(() => {});
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return null;
}
