import type { TerminalAgentRow } from "./types";

export function shouldHoldAgentWakeLock({
  enabled,
  focused,
  terminalRows,
}: {
  enabled: boolean;
  focused: boolean;
  terminalRows: Record<number, TerminalAgentRow>;
}): boolean {
  return (
    enabled &&
    focused &&
    Object.values(terminalRows).some((row) => row.status === "working")
  );
}
