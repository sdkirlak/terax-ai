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
      className={cn(
        "size-2 shrink-0 rounded-full border border-current",
        toneClass[view.tone],
        view.mark === "ring"
          ? "bg-current ring-2 ring-current/20"
          : "bg-transparent",
        className,
      )}
    />
  );
}
