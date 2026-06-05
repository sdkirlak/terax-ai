import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/modules/agents/lib/types";

type Props = {
  status: AgentStatus;
  className?: string;
};

export function tabAgentStateLabel(status: AgentStatus): string {
  switch (status) {
    case "working":
      return "working";
    case "needs-input":
      return "interaction needed";
    case "idle":
      return "idle";
    case "error":
      return "failed";
  }
}

export function TabAgentStateMark({ status, className }: Props) {
  const label = tabAgentStateLabel(status);

  if (status !== "working") return null;

  return (
    <span
      role="img"
      aria-label={label}
      data-agent-tab-state={status}
      className={cn(
        "flex h-3 w-4 shrink-0 items-center justify-center gap-0.5 text-muted-foreground/70",
        className,
      )}
    >
      <span className="size-1 rounded-full bg-current opacity-40 motion-safe:animate-[tab-agent-working-dot-wave_1.45s_ease-in-out_infinite]" />
      <span className="size-1 rounded-full bg-current opacity-40 motion-safe:animate-[tab-agent-working-dot-wave_1.45s_ease-in-out_infinite] motion-safe:[animation-delay:170ms]" />
      <span className="size-1 rounded-full bg-current opacity-40 motion-safe:animate-[tab-agent-working-dot-wave_1.45s_ease-in-out_infinite] motion-safe:[animation-delay:340ms]" />
    </span>
  );
}
