import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  WavingHand01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/modules/agents/lib/types";

type Props = {
  status: AgentStatus;
  className?: string;
};

const iconByStatus: Record<Exclude<AgentStatus, "working">, IconSvgElement> = {
  idle: CheckmarkCircle02Icon,
  "needs-input": WavingHand01Icon,
  error: AlertCircleIcon,
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

  if (status === "working") {
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

  return (
    <span
      role="img"
      aria-label={label}
      data-agent-tab-state={status}
      className={cn(
        "flex size-3 shrink-0 items-center justify-center text-muted-foreground/80",
        className,
      )}
    >
      <HugeiconsIcon icon={iconByStatus[status]} size={12} strokeWidth={1.85} />
    </span>
  );
}
