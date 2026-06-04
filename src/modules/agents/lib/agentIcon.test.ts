import { describe, expect, it } from "vitest";
import { agentIconAsset, agentIconKind } from "./agentIconModel";

describe("agentIconKind", () => {
  it("normalizes provider ids and aliases to stable icon kinds", () => {
    expect(agentIconKind("codex")).toBe("openai");
    expect(agentIconKind("ChatGPT")).toBe("openai");
    expect(agentIconKind("claude")).toBe("claude");
    expect(agentIconKind("opencode")).toBe("code");
    expect(agentIconKind("pi")).toBe("pi");
    expect(agentIconKind("hermes")).toBe("hermes");
    expect(agentIconKind("agy")).toBe("gemini");
    expect(agentIconKind("antigravity")).toBe("gemini");
  });

  it("uses official compact marks for providers that ship them", () => {
    expect(agentIconAsset("opencode")).toBe("opencode-official");
    expect(agentIconAsset("pi")).toBe("pi-official");
    expect(agentIconAsset("hermes")).toBe("hermes-official");
  });
});
