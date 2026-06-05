import { describe, expect, it } from "vitest";
import { tabAgentSoundMenu } from "./tabAgentSoundMenu";
import type { TerminalTabAgentSummary } from "@/modules/agents/lib/types";

const baseSummary = {
  kind: "none",
  soundDisabledGlobally: false,
} satisfies Omit<TerminalTabAgentSummary, "muted">;

describe("tabAgentSoundMenu", () => {
  it("uses agent-alert language for the tab context menu", () => {
    expect(tabAgentSoundMenu({ ...baseSummary, muted: false })).toMatchObject({
      label: "Mute agent alerts",
      icon: "mute",
    });
    expect(tabAgentSoundMenu({ ...baseSummary, muted: true })).toMatchObject({
      label: "Unmute agent alerts",
      icon: "unmute",
    });
  });
});
