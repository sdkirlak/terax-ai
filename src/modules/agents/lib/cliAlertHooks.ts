import type { AgentProviderInfo } from "./types";

export type CliAlertProviderAction = "install" | "uninstall" | null;

export type CliAlertProviderRow = AgentProviderInfo & {
  action: CliAlertProviderAction;
  disabled: boolean;
};

export type CliAlertFooterState =
  | { kind: "checking"; title: string; detail: string }
  | { kind: "ready"; title: string; detail: string }
  | { kind: "setup"; title: string; detail: string }
  | { kind: "error"; title: string; detail: string };

export function cliAlertProviderRows(
  providers: AgentProviderInfo[],
): CliAlertProviderRow[] {
  return providers
    .filter((provider) => provider.readiness !== "unavailable")
    .map((provider) => {
      const action =
        provider.readiness === "ready"
          ? "uninstall"
          : provider.readiness === "missing" || provider.readiness === "error"
            ? "install"
            : null;

      return {
        ...provider,
        action,
        disabled: false,
      };
    });
}

export function nextInstallableProvider(
  providers: AgentProviderInfo[],
): AgentProviderInfo | undefined {
  return providers.find((provider) => provider.readiness === "missing");
}

export function cliAlertFooterState(
  providers: AgentProviderInfo[],
): CliAlertFooterState {
  if (providers.length === 0) {
    return {
      kind: "checking",
      title: "Agent hooks",
      detail: "Checking hook setup",
    };
  }

  if (providers.some((provider) => provider.readiness === "error")) {
    return {
      kind: "error",
      title: "Agent hooks",
      detail: "Some hook setup cannot be read",
    };
  }

  const availableProviders = providers.filter(
    (provider) => provider.readiness !== "unavailable",
  );

  if (availableProviders.length === 0) {
    return {
      kind: "setup",
      title: "Agent hooks",
      detail: "No supported CLI agents found",
    };
  }

  if (availableProviders.every((provider) => provider.readiness === "ready")) {
    return {
      kind: "ready",
      title: "Agent hooks on",
      detail: "All available CLI hooks are active",
    };
  }

  return {
    kind: "setup",
    title: "Agent hooks",
    detail: "Enable hooks for supported CLI agents",
  };
}
