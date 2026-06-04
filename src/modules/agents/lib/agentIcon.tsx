import {
  AiProgrammingIcon,
  ChatGptIcon,
  ClaudeIcon,
  GoogleGeminiIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  type AgentIconKind,
  agentIconAsset,
  agentIconKind,
} from "./agentIconModel";

function iconFor(kind: AgentIconKind): IconSvgElement {
  switch (kind) {
    case "openai":
      return ChatGptIcon;
    case "claude":
      return ClaudeIcon;
    case "gemini":
      return GoogleGeminiIcon;
    case "code":
    case "pi":
    case "hermes":
    case "generic":
    case "terax":
      return AiProgrammingIcon;
  }
}

function OpenCodeOfficialIcon({
  size,
  className,
}: {
  size: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 300 300"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="OpenCode"
      focusable="false"
    >
      <g transform="translate(30 0)">
        <path d="M180 240H60V120H180V240Z" fill="#4B4646" />
        <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC" />
      </g>
    </svg>
  );
}

function PiOfficialIcon({
  size,
  className,
}: {
  size: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 800 800"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Pi"
      focusable="false"
    >
      <rect width="800" height="800" rx="120" fill="#09090b" />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
      />
      <path fill="#fff" d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}

function HermesOfficialIcon({
  size,
  className,
}: {
  size: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      fill="none"
      role="img"
      aria-label="Hermes Agent"
      focusable="false"
    >
      <path
        d="M8 1.5v13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M8 3.25c-2.35-1.4-4.7-.95-6.25.35 1.85-.2 3.8.2 5.55 1.55"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
      <path
        d="M8 3.25c2.35-1.4 4.7-.95 6.25.35-1.85-.2-3.8.2-5.55 1.55"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
      <path
        d="M8 13.25c-2.3-1-3.05-2.65-1.35-4.15-2 .8-2.35 2.95-.35 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
      <path
        d="M8 13.25c2.3-1 3.05-2.65 1.35-4.15 2 .8 2.35 2.95.35 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
      <circle cx="8" cy="1.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function AgentIcon({
  agent,
  size = 15,
  className,
}: {
  agent: string;
  size?: number;
  className?: string;
}) {
  const kind = agentIconKind(agent);
  switch (agentIconAsset(agent)) {
    case "terax-logo":
      return (
        <img
          src="/logo.png"
          alt=""
          width={size}
          height={size}
          className={className}
          style={{ width: size, height: size }}
        />
      );
    case "opencode-official":
      return <OpenCodeOfficialIcon size={size} className={className} />;
    case "pi-official":
      return <PiOfficialIcon size={size} className={className} />;
    case "hermes-official":
      return <HermesOfficialIcon size={size} className={className} />;
    case "openai-hugeicon":
    case "claude-hugeicon":
    case "gemini-hugeicon":
    case "generic-hugeicon":
      break;
  }

  return (
    <HugeiconsIcon
      icon={iconFor(kind)}
      size={size}
      strokeWidth={1.75}
      className={className}
    />
  );
}
