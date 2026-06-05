import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabAgentStateMark } from "./TabAgentStateMark";

describe("TabAgentStateMark", () => {
  it("renders working as slow staggered dots", () => {
    const markup = renderToStaticMarkup(<TabAgentStateMark status="working" />);

    expect(markup).toContain('aria-label="working"');
    expect(markup).toContain('data-agent-tab-state="working"');
    expect(markup).toContain("tab-agent-working-dot-wave_1.45s");
    expect(markup).toContain("[animation-delay:170ms]");
    expect(markup).toContain("[animation-delay:340ms]");
  });

  it("renders no tab glyph for idle, interaction, and error", () => {
    for (const status of ["idle", "needs-input", "error"] as const) {
      const markup = renderToStaticMarkup(
        <TabAgentStateMark status={status} />,
      );

      expect(markup).toBe("");
    }
  });
});
