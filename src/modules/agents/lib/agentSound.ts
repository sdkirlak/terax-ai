type SoundPlayer = (volume: number) => void;

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let injectedPlayer: SoundPlayer | null = null;
let lastPlayedAt: number | null = null;

const MIN_SOUND_INTERVAL_MS = 1_200;
const MAX_GAIN = 0.07;

export function setAgentSoundPlayerForTest(player: SoundPlayer | null): void {
  injectedPlayer = player;
  lastPlayedAt = null;
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0.5;
  return Math.min(1, Math.max(0, volume));
}

function shouldPlay(now: number): boolean {
  if (lastPlayedAt !== null && now - lastPlayedAt < MIN_SOUND_INTERVAL_MS) {
    return false;
  }
  lastPlayedAt = now;
  return true;
}

export function playAgentAlertSound(volume = 0.5): void {
  const normalizedVolume = clampVolume(volume);
  if (normalizedVolume <= 0) return;
  if (!shouldPlay(Date.now())) return;
  if (injectedPlayer) {
    injectedPlayer(normalizedVolume);
    return;
  }
  if (typeof window === "undefined") return;
  let ctx: AudioContext | null = null;
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    const audioContext = ctx;
    ctx = null;
    if (!audioContext) return;
    try {
      void audioContext.close();
    } catch {
      return;
    }
  };

  try {
    const audioWindow = window as AudioWindow;
    const AudioContextCtor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return;
    ctx = new AudioContextCtor();
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = MAX_GAIN * normalizedVolume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    cleanupTimer = setTimeout(cleanup, 1_000);
    osc.addEventListener("ended", cleanup);
  } catch {
    cleanup();
  }
}
