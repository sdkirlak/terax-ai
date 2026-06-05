import type { TerminalTabAgentSummary } from "@/modules/agents/lib/types";

export type TabAgentSoundMenu = {
  label: string;
  icon: "mute" | "unmute";
};

export function tabAgentSoundMenu(
  summary?: TerminalTabAgentSummary,
): TabAgentSoundMenu {
  if (summary?.muted) {
    return { label: "Unmute agent alerts", icon: "unmute" };
  }
  return { label: "Mute agent alerts", icon: "mute" };
}
