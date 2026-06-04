import { showAgentToast } from "@/modules/agents/components/AgentToast";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { type AgentAlertDecision, agentAlertDecision } from "./agentAlerts";
import { playAgentAlertSound } from "./agentSound";
import { osNotify as defaultOsNotify } from "./notify";
import type { AgentStatus } from "./types";

type Effect = () => void | Promise<void>;
type SoundEffect = (volume: number) => void | Promise<void>;

type RouteAgentStatusEventArgs = {
  status: AgentStatus;
  focused: boolean;
  exactAgentVisible: boolean;
  alertWhenActive: boolean;
  globalSound: boolean;
  soundVolume: number;
  tabMuted: boolean;
  osNotify: Effect;
  toast: Effect;
  sound: SoundEffect;
};

type RouteAgentStatusArgs = {
  status: AgentStatus;
  focused: boolean;
  exactAgentVisible: boolean;
  tabMuted: boolean;
  title: string;
  body?: string;
  agent: string;
  onActivate: () => void;
};

type RouteAgentStatusResult = {
  unread: boolean;
};

export function routeAgentStatusEvent({
  status,
  focused,
  exactAgentVisible,
  alertWhenActive,
  globalSound,
  soundVolume,
  tabMuted,
  osNotify,
  toast,
  sound,
}: RouteAgentStatusEventArgs): AgentAlertDecision {
  const decision = agentAlertDecision({
    status,
    appFocused: focused,
    exactAgentVisible,
    alertWhenActive,
    globalSound,
    tabMuted,
  });

  if (decision.osNotify) void osNotify();
  if (decision.toast) void toast();
  if (decision.playSound) void sound(soundVolume);

  return decision;
}

export function routeAgentStatus({
  status,
  focused,
  exactAgentVisible,
  tabMuted,
  title,
  body,
  agent,
  onActivate,
}: RouteAgentStatusArgs): RouteAgentStatusResult {
  const preferences = usePreferencesStore.getState();
  if (!preferences.agentNotifications) return { unread: false };

  const decision = routeAgentStatusEvent({
    status,
    focused,
    exactAgentVisible,
    alertWhenActive: preferences.agentAlertWhenActive,
    globalSound: preferences.agentAudibleAlerts,
    soundVolume: preferences.agentAlertVolume,
    tabMuted,
    osNotify: () => defaultOsNotify(title, body ?? agent),
    toast: () => showAgentToast({ agent, title, body, onActivate }),
    sound: playAgentAlertSound,
  });

  return { unread: decision.unread };
}
