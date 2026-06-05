import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "./store";

describe("DEFAULT_PREFERENCES", () => {
  it("enables terminal renderer hibernation by default", () => {
    expect(DEFAULT_PREFERENCES.terminalRendererHibernationEnabled).toBe(true);
  });

  it("disables agent wake lock by default", () => {
    expect(DEFAULT_PREFERENCES.agentWakeLockEnabled).toBe(false);
  });

  it("does not restrict agent sound to the active tab by default", () => {
    expect(DEFAULT_PREFERENCES.agentAlertSoundOnlyForActiveTab).toBe(false);
  });
});
