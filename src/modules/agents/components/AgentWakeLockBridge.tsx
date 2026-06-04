import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { shouldHoldAgentWakeLock } from "../lib/agentWakeLock";
import { useWindowFocus } from "../lib/useWindowFocus";
import { useAgentStore } from "../store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";

export function AgentWakeLockBridge() {
  const enabled = usePreferencesStore((s) => s.agentWakeLockEnabled);
  const focused = useWindowFocus();
  const terminalRows = useAgentStore((s) => s.rows.terminal);
  const requested = useRef(false);
  const shouldHold = shouldHoldAgentWakeLock({
    enabled,
    focused,
    terminalRows,
  });

  useEffect(() => {
    if (requested.current === shouldHold) return;
    requested.current = shouldHold;
    invoke("power_set_agent_wake_lock", { active: shouldHold }).catch((e) => {
      console.warn("[terax] agent wake lock failed:", e);
    });
  }, [shouldHold]);

  useEffect(() => {
    return () => {
      if (requested.current === true) {
        invoke("power_set_agent_wake_lock", { active: false }).catch((e) => {
          console.warn("[terax] agent wake lock release failed:", e);
        });
      }
    };
  }, []);

  return null;
}
