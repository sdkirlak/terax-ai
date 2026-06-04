import { describe, expect, it } from "vitest";
import { agentAlertDecision } from "./agentAlerts";

describe("agentAlertDecision", () => {
  it("suppresses exact active tab by default", () => {
    expect(
      agentAlertDecision({
        status: "needs-input",
        appFocused: true,
        exactAgentVisible: true,
        alertWhenActive: false,
        globalSound: true,
        tabMuted: false,
      }),
    ).toMatchObject({ unread: false, playSound: false, osNotify: false });
  });

  it("allows active-tab sound without unread state", () => {
    expect(
      agentAlertDecision({
        status: "needs-input",
        appFocused: true,
        exactAgentVisible: true,
        alertWhenActive: true,
        globalSound: true,
        tabMuted: false,
      }),
    ).toMatchObject({
      unread: false,
      toast: false,
      osNotify: false,
      playSound: true,
    });
  });

  it("allows active-tab sound only for attention-worthy states", () => {
    expect(
      agentAlertDecision({
        status: "needs-input",
        appFocused: true,
        exactAgentVisible: true,
        alertWhenActive: true,
        globalSound: true,
        tabMuted: false,
      }).playSound,
    ).toBe(true);
    expect(
      agentAlertDecision({
        status: "working",
        appFocused: true,
        exactAgentVisible: true,
        alertWhenActive: true,
        globalSound: true,
        tabMuted: false,
      }).playSound,
    ).toBe(false);
  });

  it("per-tab mute suppresses sound only", () => {
    expect(
      agentAlertDecision({
        status: "idle",
        appFocused: true,
        exactAgentVisible: false,
        alertWhenActive: false,
        globalSound: true,
        tabMuted: true,
      }),
    ).toMatchObject({ unread: true, playSound: false, toast: true });
  });

  it("uses OS notifications only when backgrounded", () => {
    expect(
      agentAlertDecision({
        status: "error",
        appFocused: true,
        exactAgentVisible: false,
        alertWhenActive: false,
        globalSound: true,
        tabMuted: false,
      }).osNotify,
    ).toBe(false);
    expect(
      agentAlertDecision({
        status: "error",
        appFocused: false,
        exactAgentVisible: false,
        alertWhenActive: false,
        globalSound: true,
        tabMuted: false,
      }).osNotify,
    ).toBe(true);
  });
});
