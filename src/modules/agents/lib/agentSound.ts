type SoundPlayer = (volume: number) => void;

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type ToneOscillator = OscillatorNode & {
  frequency: AudioParam;
};

type ToneGain = GainNode["gain"] & {
  value: number;
};

let injectedPlayer: SoundPlayer | null = null;
let lastPlayedAt: number | null = null;

const MIN_SOUND_INTERVAL_MS = 300;
const ALERT_DURATION_SECONDS = 0.38;
const ALERT_ATTACK_SECONDS = 0.025;
const ALERT_RELEASE_SECONDS = 0.12;
const MAX_GAIN = 0.22;

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

function scheduleGainEnvelope(
  gain: ToneGain,
  now: number,
  peak: number,
): void {
  if (
    typeof gain.cancelScheduledValues === "function" &&
    typeof gain.setValueAtTime === "function" &&
    typeof gain.linearRampToValueAtTime === "function"
  ) {
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0.0001, now);
    gain.linearRampToValueAtTime(peak, now + ALERT_ATTACK_SECONDS);
    gain.linearRampToValueAtTime(
      Math.max(peak * 0.72, 0.0001),
      now + ALERT_DURATION_SECONDS - ALERT_RELEASE_SECONDS,
    );
    gain.linearRampToValueAtTime(0.0001, now + ALERT_DURATION_SECONDS);
    return;
  }

  gain.value = peak;
}

function configureOscillator(
  osc: ToneOscillator,
  type: OscillatorType,
  frequency: number,
): void {
  osc.type = type;
  osc.frequency.value = frequency;
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
    if (ctx.state === "suspended") void ctx.resume();
    const gain = ctx.createGain();
    const primary = ctx.createOscillator();
    const accent = ctx.createOscillator();
    const now = ctx.currentTime;
    scheduleGainEnvelope(gain.gain, now, MAX_GAIN * normalizedVolume);
    configureOscillator(primary, "triangle", 880);
    configureOscillator(accent, "sine", 1320);
    primary.connect(gain);
    accent.connect(gain);
    gain.connect(ctx.destination);
    primary.start(now);
    accent.start(now);
    primary.stop(now + ALERT_DURATION_SECONDS);
    accent.stop(now + ALERT_DURATION_SECONDS);
    cleanupTimer = setTimeout(cleanup, 1_000);
    primary.addEventListener("ended", cleanup);
  } catch {
    cleanup();
  }
}
