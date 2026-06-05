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

  it("renders idle, interaction, and error as distinct themed icon states", () => {
    for (const [status, label] of [
      ["idle", "idle"],
      ["needs-input", "interaction needed"],
      ["error", "failed"],
    ] as const) {
      const markup = renderToStaticMarkup(
        <TabAgentStateMark status={status} />,
      );

      expect(markup).toContain(`aria-label="${label}"`);
      expect(markup).toContain(`data-agent-tab-state="${status}"`);
      expect(markup).toContain("text-muted-foreground");
      expect(markup).not.toContain("text-destructive");
    }
  });
});
