import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playAgentAlertSound, setAgentSoundPlayerForTest } from "./agentSound";

describe("agentSound", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    setAgentSoundPlayerForTest(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses injected player when available", () => {
    const player = vi.fn();
    setAgentSoundPlayerForTest(player);
    playAgentAlertSound();
    expect(player).toHaveBeenCalledTimes(1);
  });

  it("passes the requested volume to the injected player", () => {
    const player = vi.fn();
    setAgentSoundPlayerForTest(player);

    playAgentAlertSound(0.25);

    expect(player).toHaveBeenCalledWith(0.25);
  });

  it("collapses rapid alert bursts into one sound", () => {
    vi.useFakeTimers();
    const player = vi.fn();
    setAgentSoundPlayerForTest(player);

    vi.setSystemTime(1_000);
    playAgentAlertSound();
    vi.setSystemTime(1_100);
    playAgentAlertSound();
    vi.setSystemTime(1_200);
    playAgentAlertSound();

    expect(player).toHaveBeenCalledTimes(1);

    vi.setSystemTime(2_300);
    playAgentAlertSound();

    expect(player).toHaveBeenCalledTimes(2);
  });

  it("does not throw without window", () => {
    vi.stubGlobal("window", undefined);
    expect(() => playAgentAlertSound()).not.toThrow();
  });

  it("does not throw when browser audio constructors are unavailable", () => {
    vi.stubGlobal("window", {});
    expect(() => playAgentAlertSound()).not.toThrow();
  });

  it("closes browser audio from fallback timer when ended never fires", () => {
    vi.useFakeTimers();
    const close = vi.fn(() => Promise.resolve());
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function AudioContextMock() {
        return {
          close,
          createGain: () => ({
            connect: vi.fn(),
            gain: { value: 0 },
          }),
          createOscillator: () => ({
            addEventListener: vi.fn(),
            connect: vi.fn(),
            frequency: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
            type: "sine",
          }),
          currentTime: 0,
          destination: {},
        };
      }),
    });

    playAgentAlertSound();

    expect(close).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("closes browser audio once when ended fires before fallback timer", () => {
    vi.useFakeTimers();
    const close = vi.fn(() => Promise.resolve());
    const handlers: { ended?: () => void } = {};
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function AudioContextMock() {
        return {
          close,
          createGain: () => ({
            connect: vi.fn(),
            gain: { value: 0 },
          }),
          createOscillator: () => ({
            addEventListener: vi.fn((event: string, handler: () => void) => {
              if (event === "ended") handlers.ended = handler;
            }),
            connect: vi.fn(),
            frequency: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
            type: "sine",
          }),
          currentTime: 0,
          destination: {},
        };
      }),
    });

    playAgentAlertSound();
    handlers.ended?.();
    vi.runOnlyPendingTimers();

    expect(close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("closes browser audio when setup fails after construction", () => {
    const close = vi.fn(() => Promise.resolve());
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function AudioContextMock() {
        return {
          close,
          createGain: () => {
            throw new Error("gain failed");
          },
        };
      }),
    });

    expect(() => playAgentAlertSound()).not.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("resumes suspended browser audio before playback", () => {
    const resume = vi.fn(() => Promise.resolve());
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function AudioContextMock() {
        return {
          close: vi.fn(() => Promise.resolve()),
          createGain: () => ({
            connect: vi.fn(),
            gain: {
              cancelScheduledValues: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              setValueAtTime: vi.fn(),
            },
          }),
          createOscillator: () => ({
            addEventListener: vi.fn(),
            connect: vi.fn(),
            frequency: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
            type: "sine",
          }),
          currentTime: 0,
          destination: {},
          resume,
          state: "suspended",
        };
      }),
    });

    playAgentAlertSound();

    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("plays a longer browser alert", () => {
    const stop = vi.fn();
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function AudioContextMock() {
        return {
          close: vi.fn(() => Promise.resolve()),
          createGain: () => ({
            connect: vi.fn(),
            gain: {
              cancelScheduledValues: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              setValueAtTime: vi.fn(),
            },
          }),
          createOscillator: () => ({
            addEventListener: vi.fn(),
            connect: vi.fn(),
            frequency: { value: 0 },
            start: vi.fn(),
            stop,
            type: "sine",
          }),
          currentTime: 1,
          destination: {},
        };
      }),
    });

    playAgentAlertSound();

    expect(stop).toHaveBeenCalledWith(1.38);
  });

  it("maps volume to a louder browser gain envelope", () => {
    const setValueAtTime = vi.fn();
    const linearRampToValueAtTime = vi.fn();
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function AudioContextMock() {
        return {
          close: vi.fn(() => Promise.resolve()),
          createGain: () => ({
            connect: vi.fn(),
            gain: {
              cancelScheduledValues: vi.fn(),
              linearRampToValueAtTime,
              setValueAtTime,
            },
          }),
          createOscillator: () => ({
            addEventListener: vi.fn(),
            connect: vi.fn(),
            frequency: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
            type: "sine",
          }),
          currentTime: 0,
          destination: {},
        };
      }),
    });

    playAgentAlertSound(0.25);

    expect(setValueAtTime).toHaveBeenCalledWith(0.0001, 0);
    expect(linearRampToValueAtTime).toHaveBeenCalledWith(0.055, 0.025);
  });
});
