import { useEffect, useRef } from "react";
import { routeAgentStatus } from "@/modules/agents/lib/route";
import type { AgentStatus, LocalAgentRow } from "@/modules/agents/lib/types";
import { useWindowFocus } from "@/modules/agents/lib/useWindowFocus";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { type AgentRunStatus, useChatStore } from "../store/chatStore";

const AGENT = "Terax";
const LOCAL_ID = "local:terax";

function isBusy(status: AgentRunStatus): boolean {
  return (
    status === "thinking" ||
    status === "streaming" ||
    status === "awaiting-approval"
  );
}

type LocalAgentBridgeStatusArgs = {
  status: AgentRunStatus;
  error: string | null;
  previousStatus: AgentRunStatus;
  previousRowStatus: AgentStatus | null;
};

export function deriveLocalAgentBridgeStatus({
  status,
  previousStatus,
  previousRowStatus,
}: LocalAgentBridgeStatusArgs): AgentStatus | null {
  if (status === "awaiting-approval") return "needs-input";
  if (status === "thinking" || status === "streaming") return "working";
  if (status === "error") return "error";
  if (status === "idle" && isBusy(previousStatus)) return "idle";
  if (
    status === "idle" &&
    (previousRowStatus === "idle" || previousRowStatus === "error")
  ) {
    return previousRowStatus;
  }
  return null;
}

function needsNewStartedAt(
  status: AgentStatus,
  previousStatus: AgentStatus | null,
): boolean {
  return (
    (status === "working" || status === "needs-input") &&
    (previousStatus === null ||
      previousStatus === "idle" ||
      previousStatus === "error")
  );
}

function localRow(
  status: AgentStatus,
  unread: boolean,
  startedAt: number,
  previous: LocalAgentRow | null,
): LocalAgentRow {
  const now = Date.now();
  return {
    id: LOCAL_ID,
    source: "local",
    agent: AGENT,
    label: AGENT,
    status,
    unread,
    startedAt,
    lastActivityAt: now,
    attentionSince:
      status === "needs-input" ? (previous?.attentionSince ?? now) : null,
  };
}

export function LocalAgentNotificationsBridge() {
  const status = useChatStore((s) => s.agentMeta.status);
  const error = useChatStore((s) => s.agentMeta.error);
  const visible = useChatStore((s) => s.panelOpen || s.mini.open);
  const focused = useWindowFocus();

  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const initialRow = useAgentStore.getState().rows.local;
  const initialLocalStatus =
    initialRow?.id === LOCAL_ID ? initialRow.status : null;
  const previousRunStatus = useRef<AgentRunStatus>(status);
  const previousLocalStatus = useRef<AgentStatus | null>(initialLocalStatus);
  const startedAt = useRef<number | null>(
    initialRow?.id === LOCAL_ID ? initialRow.startedAt : null,
  );

  useEffect(() => {
    if (focused && visible) {
      useAgentStore.getState().clearLocalUnread();
    }
  }, [focused, visible]);

  useEffect(() => {
    const wasRunStatus = previousRunStatus.current;
    const wasLocalStatus = previousLocalStatus.current;
    const store = useAgentStore.getState();
    const previousRow = store.rows.local;
    const previousRowStatus =
      previousRow?.id === LOCAL_ID ? previousRow.status : null;
    const nextStatus = deriveLocalAgentBridgeStatus({
      status,
      error,
      previousStatus: wasRunStatus,
      previousRowStatus,
    });

    if (!nextStatus) {
      store.setLocalAgent(null);
      startedAt.current = null;
      previousRunStatus.current = status;
      previousLocalStatus.current = null;
      return;
    }

    if (needsNewStartedAt(nextStatus, wasLocalStatus)) {
      startedAt.current = Date.now();
    }
    const currentStartedAt =
      startedAt.current ?? previousRow?.startedAt ?? Date.now();
    startedAt.current = currentStartedAt;

    let unread =
      nextStatus === "working" ? false : (previousRow?.unread ?? false);

    if (nextStatus === "needs-input" && wasLocalStatus !== "needs-input") {
      unread = routeAgentStatus({
        status: "needs-input",
        focused: focusedRef.current,
        exactAgentVisible: visibleRef.current,
        tabMuted: false,
        title: "Terax needs your approval",
        body: "Approve a tool to continue",
        agent: AGENT,
        onActivate: () => useChatStore.getState().openPanel(),
      }).unread;
    } else if (
      nextStatus === "error" &&
      status === "error" &&
      wasLocalStatus !== "error"
    ) {
      unread = routeAgentStatus({
        status: "error",
        focused: focusedRef.current,
        exactAgentVisible: visibleRef.current,
        tabMuted: false,
        title: "Terax run failed",
        body: error || undefined,
        agent: AGENT,
        onActivate: () => useChatStore.getState().openPanel(),
      }).unread;
    } else if (nextStatus === "idle" && isBusy(wasRunStatus)) {
      unread = routeAgentStatus({
        status: "idle",
        focused: focusedRef.current,
        exactAgentVisible: visibleRef.current,
        tabMuted: false,
        title: "Terax is idle",
        body: "Your task is ready",
        agent: AGENT,
        onActivate: () => useChatStore.getState().openPanel(),
      }).unread;
    }

    store.setLocalAgent(
      localRow(nextStatus, unread, currentStartedAt, previousRow),
    );
    previousRunStatus.current = status;
    previousLocalStatus.current = nextStatus;
  }, [status, error]);

  return null;
}
