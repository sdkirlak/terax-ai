import { Notification01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import {
  agentBadgeState,
  sortedAgentRows,
} from "@/modules/agents/lib/agentRows";
import { agentStatusView } from "@/modules/agents/lib/agentStatus";
import type { AgentRow } from "@/modules/agents/lib/types";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { AgentStatusMark } from "./AgentStatusMark";
import { CliAlertHookFooter } from "./CliAlertHookFooter";

type Props = {
  onActivate: (tabId: number, leafId: number) => void;
  onActivateLocal: () => void;
};

function rowPrimary(row: AgentRow): string {
  return row.label ?? row.agent;
}

function rowSecondary(row: AgentRow): string {
  if (row.label && row.label !== row.agent) return row.agent;
  return row.source === "local" ? "Terax agent" : "Terminal agent";
}

function AgentRowButton({
  row,
  onClick,
}: {
  row: AgentRow;
  onClick: () => void;
}) {
  const view = agentStatusView(row.status);
  const primary = rowPrimary(row);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      {row.unread ? (
        <span className="absolute left-1 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary/70" />
      ) : null}
      <AgentIcon
        agent={row.agent}
        size={17}
        className="ml-1 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          {primary}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {rowSecondary(row)}
        </span>
      </span>
      <span
        className={cn(
          "flex min-w-[5rem] shrink-0 items-center justify-end gap-1.5 whitespace-nowrap text-[11px]",
          view.tone === "primary" && "font-medium text-primary",
          view.tone === "destructive" && "font-medium text-destructive",
          view.tone === "muted" && "text-muted-foreground",
        )}
      >
        <AgentStatusMark view={view} />
        {view.label}
      </span>
    </button>
  );
}

export function AgentStatusCenter({ onActivate, onActivateLocal }: Props) {
  const [open, setOpen] = useState(false);
  const rowsState = useAgentStore((s) => s.rows);

  const rows = useMemo(
    () =>
      sortedAgentRows([
        ...Object.values(rowsState.terminal),
        ...(rowsState.local ? [rowsState.local] : []),
      ]),
    [rowsState],
  );
  const badge = agentBadgeState(rows);
  const activeCount = rows.length;
  const empty = activeCount === 0;

  const activateRow = (row: AgentRow) => {
    const store = useAgentStore.getState();
    if (row.source === "local") {
      store.clearLocalUnread();
      onActivateLocal();
    } else {
      store.clearTerminalUnread(row.leafId);
      onActivate(row.tabId, row.leafId);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Agents"
        >
          <HugeiconsIcon
            icon={Notification01Icon}
            size={16}
            strokeWidth={1.75}
          />
          {badge.unreadCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground">
              {badge.unreadCount > 9 ? "9+" : badge.unreadCount}
            </span>
          ) : badge.showStatusDot ? (
            <span className="absolute top-0 right-0 size-2 rounded-full bg-primary/70 ring-2 ring-background" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 overflow-hidden p-0 gap-0"
      >
        <div className="flex h-10 items-center px-3 pt-0.5">
          <span className="text-[13px] font-medium text-foreground">
            Agents
          </span>
          {activeCount > 0 ? (
            <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {activeCount} active
            </span>
          ) : null}
        </div>

        {empty ? (
          <div className="border-t border-border/60 px-3 py-5 text-center text-xs leading-relaxed text-muted-foreground">
            <p>No agent activity yet.</p>
            <p>Run Terax or supported CLI agents to track them here.</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto border-t border-border/60 p-1">
            {rows.map((row) => (
              <AgentRowButton
                key={row.id}
                row={row}
                onClick={() => activateRow(row)}
              />
            ))}
          </div>
        )}

        <CliAlertHookFooter open={open} />
      </PopoverContent>
    </Popover>
  );
}
