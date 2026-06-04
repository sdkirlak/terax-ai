import type { TerminalAgentRow } from "./types";

export function shouldHoldAgentWakeLock({
  focused,
  terminalRows,
}: {
  focused: boolean;
  terminalRows: Record<number, TerminalAgentRow>;
}): boolean {
  return focused && Object.values(terminalRows).some((row) => row.status === "working");
}
