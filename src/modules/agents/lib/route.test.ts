import { describe, expect, it, vi } from "vitest";
import { routeAgentStatusEvent } from "./route";

describe("routeAgentStatusEvent", () => {
  it("alerts a focused other-tab attention event without OS notification", () => {
    const osNotify = vi.fn();
    const toast = vi.fn();
    const sound = vi.fn();

    const decision = routeAgentStatusEvent({
      status: "needs-input",
      focused: true,
      exactAgentVisible: false,
      alertWhenActive: false,
      soundOnlyForActiveTab: false,
      globalSound: true,
      soundVolume: 0.42,
      tabMuted: false,
      osNotify,
      toast,
      sound,
    });

    expect(decision).toEqual({
      unread: true,
      toast: true,
      osNotify: false,
      playSound: true,
    });
    expect(toast).toHaveBeenCalledOnce();
    expect(sound).toHaveBeenCalledWith(0.42);
    expect(osNotify).not.toHaveBeenCalled();
  });

  it("suppresses active exact-tab alerts by default", () => {
    const osNotify = vi.fn();
    const toast = vi.fn();
    const sound = vi.fn();

    const decision = routeAgentStatusEvent({
      status: "needs-input",
      focused: true,
      exactAgentVisible: true,
      alertWhenActive: false,
      soundOnlyForActiveTab: false,
      globalSound: true,
      soundVolume: 0.5,
      tabMuted: false,
      osNotify,
      toast,
      sound,
    });

    expect(decision).toEqual({
      unread: false,
      toast: false,
      osNotify: false,
      playSound: false,
    });
    expect(osNotify).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(sound).not.toHaveBeenCalled();
  });

  it("plays active exact-tab sound without unread state when alertWhenActive is enabled", () => {
    const osNotify = vi.fn();
    const toast = vi.fn();
    const sound = vi.fn();

    const decision = routeAgentStatusEvent({
      status: "needs-input",
      focused: true,
      exactAgentVisible: true,
      alertWhenActive: true,
      soundOnlyForActiveTab: false,
      globalSound: true,
      soundVolume: 0.5,
      tabMuted: false,
      osNotify,
      toast,
      sound,
    });

    expect(decision).toEqual({
      unread: false,
      toast: false,
      osNotify: false,
      playSound: true,
    });
    expect(sound).toHaveBeenCalledOnce();
    expect(osNotify).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("plays active exact-tab idle sound without OS notification when alertWhenActive is enabled", () => {
    const osNotify = vi.fn();
    const toast = vi.fn();
    const sound = vi.fn();

    const decision = routeAgentStatusEvent({
      status: "idle",
      focused: true,
      exactAgentVisible: true,
      alertWhenActive: true,
      soundOnlyForActiveTab: false,
      globalSound: true,
      soundVolume: 1,
      tabMuted: false,
      osNotify,
      toast,
      sound,
    });

    expect(decision).toEqual({
      unread: false,
      toast: false,
      osNotify: false,
      playSound: true,
    });
    expect(sound).toHaveBeenCalledWith(1);
    expect(osNotify).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("keeps focused other-tab notifications visual but silent in focus sound mode", () => {
    const osNotify = vi.fn();
    const toast = vi.fn();
    const sound = vi.fn();

    const decision = routeAgentStatusEvent({
      status: "needs-input",
      focused: true,
      exactAgentVisible: false,
      alertWhenActive: false,
      soundOnlyForActiveTab: true,
      globalSound: true,
      soundVolume: 0.5,
      tabMuted: false,
      osNotify,
      toast,
      sound,
    });

    expect(decision).toEqual({
      unread: true,
      toast: true,
      osNotify: false,
      playSound: false,
    });
    expect(toast).toHaveBeenCalledOnce();
    expect(sound).not.toHaveBeenCalled();
    expect(osNotify).not.toHaveBeenCalled();
  });
});
