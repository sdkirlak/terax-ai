export type AgentIconKind =
  | "terax"
  | "openai"
  | "claude"
  | "gemini"
  | "code"
  | "pi"
  | "hermes"
  | "generic";

export type AgentIconAsset =
  | "terax-logo"
  | "openai-hugeicon"
  | "claude-hugeicon"
  | "gemini-hugeicon"
  | "opencode-official"
  | "pi-official"
  | "hermes-official"
  | "generic-hugeicon";

export function agentIconKind(agent: string): AgentIconKind {
  const a = agent.toLowerCase();
  if (a.includes("terax")) return "terax";
  if (a.includes("claude")) return "claude";
  if (
    a.includes("codex") ||
    a.includes("gpt") ||
    a.includes("chatgpt") ||
    a.includes("openai")
  ) {
    return "openai";
  }
  if (
    a === "agy" ||
    a.includes("antigravity") ||
    a.includes("gemini") ||
    a.includes("google")
  ) {
    return "gemini";
  }
  if (a.includes("opencode") || a.includes("open code")) return "code";
  if (a === "pi" || a.startsWith("pi ")) return "pi";
  if (a.includes("hermes")) return "hermes";
  return "generic";
}

export function agentIconAsset(agent: string): AgentIconAsset {
  switch (agentIconKind(agent)) {
    case "terax":
      return "terax-logo";
    case "openai":
      return "openai-hugeicon";
    case "claude":
      return "claude-hugeicon";
    case "gemini":
      return "gemini-hugeicon";
    case "code":
      return "opencode-official";
    case "pi":
      return "pi-official";
    case "hermes":
      return "hermes-official";
    case "generic":
      return "generic-hugeicon";
  }
}
