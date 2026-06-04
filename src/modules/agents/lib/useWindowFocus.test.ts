import { describe, expect, it } from "vitest";
import { isWindowForegroundForAlerts } from "./useWindowFocus";

describe("isWindowForegroundForAlerts", () => {
  it("treats a focused document as foreground after a stale window blur", () => {
    expect(
      isWindowForegroundForAlerts({
        documentFocused: true,
        documentHidden: false,
        windowFocused: false,
      }),
    ).toBe(true);
  });

  it("treats the app as background when both focus signals are false", () => {
    expect(
      isWindowForegroundForAlerts({
        documentFocused: false,
        documentHidden: false,
        windowFocused: false,
      }),
    ).toBe(false);
  });

  it("treats a hidden document as background", () => {
    expect(
      isWindowForegroundForAlerts({
        documentFocused: true,
        documentHidden: true,
        windowFocused: true,
      }),
    ).toBe(false);
  });
});
