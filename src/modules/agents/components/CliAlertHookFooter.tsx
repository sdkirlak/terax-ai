import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  Notification03Icon,
  Unlink03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import {
  cliAlertFooterState,
  cliAlertProviderRows,
  nextInstallableProvider,
} from "@/modules/agents/lib/cliAlertHooks";
import type { AgentProviderInfo } from "@/modules/agents/lib/types";

type Props = {
  open?: boolean;
};

function readinessLabel(readiness: AgentProviderInfo["readiness"]): string {
  switch (readiness) {
    case "ready":
      return "Ready";
    case "error":
      return "Error";
    case "missing":
      return "Missing";
    case "unavailable":
      return "Unavailable";
  }
}

export function CliAlertHookFooter({ open = true }: Props) {
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [failed, setFailed] = useState(false);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const mountedRef = useRef(false);
  const requestSeq = useRef(0);

  const state = failed
    ? {
        kind: "error" as const,
        title: "Agent hooks",
        detail: "Hook setup cannot be read",
      }
    : cliAlertFooterState(providers);
  const providerRows = useMemo(
    () => cliAlertProviderRows(providers),
    [providers],
  );
  const nextProvider = useMemo(
    () => nextInstallableProvider(providers),
    [providers],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const requestId = ++requestSeq.current;
    invoke<AgentProviderInfo[]>("agent_provider_readiness")
      .then((nextProviders) => {
        if (cancelled || requestSeq.current !== requestId) return;
        setProviders(nextProviders);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled || requestSeq.current !== requestId) return;
        setProviders([]);
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function refreshProviders(requestId: number) {
    const nextProviders = await invoke<AgentProviderInfo[]>(
      "agent_provider_readiness",
    );
    if (!mountedRef.current || requestSeq.current !== requestId) return;
    setProviders(nextProviders);
    setFailed(false);
  }

  const enableProvider = async (providerId: string) => {
    setBusyProvider(providerId);
    const requestId = ++requestSeq.current;
    try {
      await invoke("agent_enable_provider_hooks", { providerId });
      await refreshProviders(requestId);
    } catch {
      if (!mountedRef.current || requestSeq.current !== requestId) return;
      setFailed(true);
    } finally {
      if (mountedRef.current && requestSeq.current === requestId) {
        setBusyProvider(null);
      }
    }
  };

  const disableProvider = async (providerId: string) => {
    setBusyProvider(providerId);
    const requestId = ++requestSeq.current;
    try {
      await invoke("agent_disable_provider_hooks", { providerId });
      await refreshProviders(requestId);
    } catch {
      if (!mountedRef.current || requestSeq.current !== requestId) return;
      setFailed(true);
    } finally {
      if (mountedRef.current && requestSeq.current === requestId) {
        setBusyProvider(null);
      }
    }
  };

  const ready = state.kind === "ready";
  const checking = state.kind === "checking";

  return (
    <div className="flex flex-col gap-2">
      <Separator className="bg-border/60" />
      <div className="flex flex-col gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((next) => !next)}
          className="flex w-full items-start gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent"
          aria-expanded={expanded}
        >
          <HugeiconsIcon
            icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
            size={13}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
          <HugeiconsIcon
            icon={
              state.kind === "error"
                ? AlertCircleIcon
                : ready
                  ? CheckmarkCircle02Icon
                  : Notification03Icon
            }
            size={14}
            strokeWidth={1.75}
            className={cn(
              "mt-0.5 shrink-0",
              ready && "text-primary",
              state.kind === "error" && "text-destructive",
              !ready && state.kind !== "error" && "text-muted-foreground",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-foreground">
              {state.title}
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {state.detail}
            </p>
          </div>
        </button>

        {expanded && providerRows.length > 0 ? (
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
            {providerRows.map((provider) => {
              const busy = busyProvider === provider.id;
              const canInstall = provider.action === "install";
              const canUninstall = provider.action === "uninstall";

              return (
                <div
                  key={provider.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50",
                    provider.disabled && "opacity-70",
                  )}
                >
                  <AgentIcon
                    agent={provider.id}
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {provider.label}
                    {provider.experimental ? (
                      <span className="ml-1 text-[10px] text-muted-foreground/70">
                        experimental
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      provider.readiness === "ready" &&
                        "bg-primary/10 text-primary",
                      provider.readiness === "error" &&
                        "bg-destructive/10 text-destructive",
                      provider.readiness !== "ready" &&
                        provider.readiness !== "error" &&
                        "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {readinessLabel(provider.readiness)}
                  </span>
                  {canInstall || canUninstall ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        canUninstall
                          ? disableProvider(provider.id)
                          : enableProvider(provider.id)
                      }
                      disabled={busy || busyProvider !== null}
                      title={canUninstall ? "Uninstall hook" : "Install hook"}
                      aria-label={
                        canUninstall
                          ? `Uninstall ${provider.label} hook`
                          : `Install ${provider.label} hook`
                      }
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <HugeiconsIcon
                        icon={
                          busy
                            ? Loading03Icon
                            : canUninstall
                              ? Unlink03Icon
                              : Notification03Icon
                        }
                        size={12}
                        strokeWidth={1.75}
                        className={cn(busy && "animate-spin")}
                      />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {expanded && providerRows.length === 0 && !checking && !failed ? (
          <div className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            No available provider setup found
          </div>
        ) : null}

        {expanded && !ready && nextProvider ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void enableProvider(nextProvider.id);
            }}
            disabled={busyProvider !== null || checking}
            className="h-7 justify-start px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon
              data-icon="inline-start"
              icon={busyProvider ? Loading03Icon : Notification03Icon}
              size={13}
              strokeWidth={1.75}
              className={cn(busyProvider && "animate-spin")}
            />
            {busyProvider
              ? "Updating..."
              : checking
                ? "Checking agent hooks"
                : "Enable next agent hook"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
