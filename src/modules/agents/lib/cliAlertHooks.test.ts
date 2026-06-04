import { describe, expect, it } from "vitest";
import {
  cliAlertFooterState,
  cliAlertProviderRows,
  nextInstallableProvider,
} from "./cliAlertHooks";
import type { AgentProviderInfo } from "./types";

function provider(
  readiness: AgentProviderInfo["readiness"],
): AgentProviderInfo {
  return {
    id: readiness,
    label: readiness,
    aliases: [],
    integration: "settings-json",
    experimental: false,
    readiness,
  };
}

describe("cliAlertHooks", () => {
  it("checks provider setup before providers load", () => {
    expect(cliAlertFooterState([])).toEqual({
      kind: "checking",
      title: "Agent hooks",
      detail: "Checking hook setup",
    });
  });

  it("uses setup state for mixed ready and missing providers", () => {
    expect(
      cliAlertFooterState([provider("ready"), provider("missing")]),
    ).toEqual({
      kind: "setup",
      title: "Agent hooks",
      detail: "Enable hooks for supported CLI agents",
    });
  });

  it("uses ready state only when all providers are ready", () => {
    expect(cliAlertFooterState([provider("ready"), provider("ready")])).toEqual(
      {
        kind: "ready",
        title: "Agent hooks on",
        detail: "All available CLI hooks are active",
      },
    );
  });

  it("ignores unavailable providers when all available providers are ready", () => {
    expect(
      cliAlertFooterState([provider("ready"), provider("unavailable")]),
    ).toEqual({
      kind: "ready",
      title: "Agent hooks on",
      detail: "All available CLI hooks are active",
    });
  });

  it("uses an empty installed-provider state when every provider is unavailable", () => {
    expect(cliAlertFooterState([provider("unavailable")])).toEqual({
      kind: "setup",
      title: "Agent hooks",
      detail: "No supported CLI agents found",
    });
  });

  it("uses error state when any provider cannot be read", () => {
    expect(cliAlertFooterState([provider("ready"), provider("error")])).toEqual(
      {
        kind: "error",
        title: "Agent hooks",
        detail: "Some hook setup cannot be read",
      },
    );
  });

  it("hides unavailable providers from hook rows", () => {
    expect(cliAlertProviderRows([provider("unavailable")])).toEqual([]);
  });

  it("assigns install and uninstall actions to actionable providers", () => {
    expect(
      cliAlertProviderRows([
        provider("ready"),
        provider("missing"),
        provider("error"),
      ]),
    ).toMatchObject([
      { readiness: "ready", action: "uninstall", disabled: false },
      { readiness: "missing", action: "install", disabled: false },
      { readiness: "error", action: "install", disabled: false },
    ]);
  });

  it("uses the first missing provider for the bulk setup action", () => {
    const missing = { ...provider("missing"), id: "missing-provider" };

    expect(
      nextInstallableProvider([
        provider("unavailable"),
        provider("ready"),
        missing,
        provider("error"),
      ]),
    ).toEqual(missing);
  });
});
