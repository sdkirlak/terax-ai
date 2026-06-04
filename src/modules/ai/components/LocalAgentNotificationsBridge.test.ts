import { describe, expect, it } from "vitest";
import { deriveLocalAgentBridgeStatus } from "./LocalAgentNotificationsBridge";

describe("deriveLocalAgentBridgeStatus", () => {
  it("lets active run states override stale errors", () => {
    expect(
      deriveLocalAgentBridgeStatus({
        status: "thinking",
        error: "previous failure",
        previousStatus: "error",
        previousRowStatus: "error",
      }),
    ).toBe("working");
    expect(
      deriveLocalAgentBridgeStatus({
        status: "streaming",
        error: "previous failure",
        previousStatus: "error",
        previousRowStatus: "error",
      }),
    ).toBe("working");
    expect(
      deriveLocalAgentBridgeStatus({
        status: "awaiting-approval",
        error: "previous failure",
        previousStatus: "error",
        previousRowStatus: "error",
      }),
    ).toBe("needs-input");
  });

  it("keeps an existing idle or error Terax row on idle remount", () => {
    expect(
      deriveLocalAgentBridgeStatus({
        status: "idle",
        error: null,
        previousStatus: "idle",
        previousRowStatus: "idle",
      }),
    ).toBe("idle");
    expect(
      deriveLocalAgentBridgeStatus({
        status: "idle",
        error: "previous failure",
        previousStatus: "idle",
        previousRowStatus: "error",
      }),
    ).toBe("error");
  });
});
