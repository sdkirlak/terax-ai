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
        soundOnlyForActiveTab: false,
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
        soundOnlyForActiveTab: false,
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
        soundOnlyForActiveTab: false,
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
        soundOnlyForActiveTab: false,
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
        soundOnlyForActiveTab: false,
        globalSound: true,
        tabMuted: true,
      }),
    ).toMatchObject({ unread: true, playSound: false, toast: true });
  });

  it("focus sound mode keeps background alerts visible but silent", () => {
    expect(
      agentAlertDecision({
        status: "needs-input",
        appFocused: true,
        exactAgentVisible: false,
        alertWhenActive: false,
        soundOnlyForActiveTab: true,
        globalSound: true,
        tabMuted: false,
      }),
    ).toMatchObject({ unread: true, toast: true, playSound: false });
  });

  it("focus sound mode allows only the active agent tab to make sound", () => {
    expect(
      agentAlertDecision({
        status: "needs-input",
        appFocused: true,
        exactAgentVisible: true,
        alertWhenActive: false,
        soundOnlyForActiveTab: true,
        globalSound: true,
        tabMuted: false,
      }),
    ).toMatchObject({ unread: false, toast: false, playSound: true });
  });

  it("per-tab mute still suppresses active-tab sound in focus sound mode", () => {
    expect(
      agentAlertDecision({
        status: "needs-input",
        appFocused: true,
        exactAgentVisible: true,
        alertWhenActive: false,
        soundOnlyForActiveTab: true,
        globalSound: true,
        tabMuted: true,
      }).playSound,
    ).toBe(false);
  });

  it("uses OS notifications only when backgrounded", () => {
    expect(
      agentAlertDecision({
        status: "error",
        appFocused: true,
        exactAgentVisible: false,
        alertWhenActive: false,
        soundOnlyForActiveTab: false,
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
        soundOnlyForActiveTab: false,
        globalSound: true,
        tabMuted: false,
      }).osNotify,
    ).toBe(true);
  });
});
