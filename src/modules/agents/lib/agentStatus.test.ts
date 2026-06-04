import { describe, expect, it } from "vitest";
import {
  agentStatusPriority,
  agentStatusView,
  isAttentionWorthy,
} from "./agentStatus";

describe("agentStatus", () => {
  it("labels unified statuses", () => {
    expect(agentStatusView("working")).toMatchObject({
      label: "working",
      mark: "dots",
    });
    expect(agentStatusView("needs-input")).toMatchObject({
      label: "needs input",
      tone: "primary",
    });
    expect(agentStatusView("idle")).toMatchObject({ label: "idle" });
    expect(agentStatusView("error")).toMatchObject({ label: "failed" });
  });

  it("limits attention-worthy states", () => {
    expect(isAttentionWorthy("working")).toBe(false);
    expect(isAttentionWorthy("needs-input")).toBe(true);
    expect(isAttentionWorthy("idle")).toBe(true);
    expect(isAttentionWorthy("error")).toBe(true);
  });

  it("orders tab marker priority", () => {
    expect(agentStatusPriority("needs-input")).toBeGreaterThan(
      agentStatusPriority("error"),
    );
    expect(agentStatusPriority("error")).toBeGreaterThan(
      agentStatusPriority("idle"),
    );
    expect(agentStatusPriority("idle")).toBeGreaterThan(
      agentStatusPriority("working"),
    );
  });
});
