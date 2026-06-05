import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  WavingHand01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { AgentStatusView } from "@/modules/agents/lib/agentStatus";

type Props = {
  view: AgentStatusView;
  className?: string;
};

const toneClass = {
  muted: "text-muted-foreground",
  primary: "text-primary",
  destructive: "text-destructive",
} as const;

const iconByMark: Record<
  Exclude<AgentStatusView["mark"], "dots">,
  IconSvgElement
> = {
  check: CheckmarkCircle02Icon,
  permission: WavingHand01Icon,
  error: AlertCircleIcon,
};

export function AgentStatusMark({ view, className }: Props) {
  if (view.mark === "dots") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex min-w-4 shrink-0 items-center justify-center gap-0.5 motion-safe:animate-pulse",
          toneClass[view.tone],
          className,
        )}
      >
        <span className="size-1 rounded-full bg-current opacity-45" />
        <span className="size-1 rounded-full bg-current opacity-70" />
        <span className="size-1 rounded-full bg-current" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      data-agent-status-mark={view.mark}
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center",
        toneClass[view.tone],
        className,
      )}
    >
      <HugeiconsIcon
        icon={iconByMark[view.mark]}
        size={13}
        strokeWidth={1.85}
      />
    </span>
  );
}
