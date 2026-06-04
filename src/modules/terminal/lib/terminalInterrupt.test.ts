import { describe, expect, it } from "vitest";
import { hasTerminalInterrupt } from "./terminalInterrupt";

describe("hasTerminalInterrupt", () => {
  it("detects Ctrl+C input bytes in terminal writes", () => {
    expect(hasTerminalInterrupt("\x03")).toBe(true);
    expect(hasTerminalInterrupt("echo before\x03after")).toBe(true);
    expect(hasTerminalInterrupt("echo safe\r")).toBe(false);
  });
});
