import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { agentStatusView } from "@/modules/agents/lib/agentStatus";
import { AgentStatusMark } from "./AgentStatusMark";

describe("AgentStatusMark", () => {
  it("renders working dots with animation and enough inline room", () => {
    const markup = renderToStaticMarkup(
      <AgentStatusMark view={agentStatusView("working")} />,
    );

    expect(markup).toContain("animate-pulse");
    expect(markup).toContain("min-w-4");
  });
});
