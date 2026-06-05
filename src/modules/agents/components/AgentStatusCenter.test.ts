import { describe, expect, it } from "vitest";
import {
  agentRowButtonClassName,
  agentStatusHeaderMode,
} from "./AgentStatusCenter";

describe("AgentStatusCenter", () => {
  it("uses a thicker themed border for unread rows", () => {
    expect(agentRowButtonClassName(true)).toContain("before:w-[3px]");
    expect(agentRowButtonClassName(true)).toContain("before:bg-primary/70");
    expect(agentRowButtonClassName(true)).not.toContain("size-1.5");
  });

  it("keeps read rows visually quiet", () => {
    expect(agentRowButtonClassName(false)).toContain("before:w-px");
    expect(agentRowButtonClassName(false)).toContain("before:bg-transparent");
  });

  it("shows read all only when unread rows exist", () => {
    expect(agentStatusHeaderMode({ unreadCount: 2, activeCount: 3 })).toBe(
      "read-all",
    );
    expect(agentStatusHeaderMode({ unreadCount: 0, activeCount: 3 })).toBe(
      "active-count",
    );
    expect(agentStatusHeaderMode({ unreadCount: 0, activeCount: 0 })).toBe(
      "empty",
    );
  });
});
