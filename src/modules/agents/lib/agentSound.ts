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

type ChimeNote = {
  duration: number;
  frequency: number;
  peak: number;
  start: number;
  type: OscillatorType;
};

const ALERT_DURATION_SECONDS = 0.56;
const MIN_SOUND_INTERVAL_MS = ALERT_DURATION_SECONDS * 1_000;
const AUDIO_CONTEXT_IDLE_SUSPEND_MS = 4_000;
const NOTE_ATTACK_SECONDS = 0.038;
const NOTE_RELEASE_SECONDS = 0.18;
const MAX_GAIN = 0.22;
const PHONE_CHIME_NOTES: readonly ChimeNote[] = [
  { type: "sine", frequency: 523.25, start: 0, duration: 0.2, peak: 0.66 },
  { type: "sine", frequency: 698.46, start: 0.13, duration: 0.31, peak: 0.8 },
];

let injectedPlayer: SoundPlayer | null = null;
let lastPlayedAt: number | null = null;
let audioContext: AudioContext | null = null;
let idleSuspendTimer: ReturnType<typeof setTimeout> | null = null;

export function setAgentSoundPlayerForTest(player: SoundPlayer | null): void {
  injectedPlayer = player;
  lastPlayedAt = null;
  disposeAudioContext();
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
  startOffset: number,
  duration: number,
): void {
  const start = now + startOffset;
  const end = start + duration;
  const attackEnd = start + Math.min(NOTE_ATTACK_SECONDS, duration * 0.3);
  const releaseStart =
    start + Math.max(NOTE_ATTACK_SECONDS, duration - NOTE_RELEASE_SECONDS);

  if (
    typeof gain.cancelScheduledValues === "function" &&
    typeof gain.setValueAtTime === "function" &&
    typeof gain.linearRampToValueAtTime === "function"
  ) {
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0.0001, now);
    if (start > now) gain.setValueAtTime(0.0001, start);
    gain.linearRampToValueAtTime(peak, attackEnd);
    gain.linearRampToValueAtTime(Math.max(peak * 0.82, 0.0001), releaseStart);
    gain.linearRampToValueAtTime(0.0001, end);
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

function clearIdleSuspendTimer(): void {
  if (idleSuspendTimer === null) return;
  clearTimeout(idleSuspendTimer);
  idleSuspendTimer = null;
}

function disposeAudioContext(): void {
  clearIdleSuspendTimer();
  const ctx = audioContext;
  audioContext = null;
  if (!ctx) return;
  try {
    void ctx.close();
  } catch {
    return;
  }
}

function resolveAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext && audioContext.state !== "closed") return audioContext;
  const audioWindow = window as AudioWindow;
  const AudioContextCtor =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext = new AudioContextCtor();
  return audioContext;
}

function resumeAudioContext(ctx: AudioContext): void {
  if (ctx.state === "suspended") void ctx.resume();
}

function scheduleIdleSuspend(ctx: AudioContext): void {
  clearIdleSuspendTimer();
  idleSuspendTimer = setTimeout(() => {
    idleSuspendTimer = null;
    if (audioContext !== ctx || ctx.state === "closed") return;
    if (typeof ctx.suspend === "function") void ctx.suspend();
  }, AUDIO_CONTEXT_IDLE_SUSPEND_MS);
}

export function playAgentAlertSound(volume = 0.5): void {
  const normalizedVolume = clampVolume(volume);
  if (normalizedVolume <= 0) return;
  if (!shouldPlay(Date.now())) return;
  if (injectedPlayer) {
    injectedPlayer(normalizedVolume);
    return;
  }

  try {
    const ctx = resolveAudioContext();
    if (!ctx) return;
    clearIdleSuspendTimer();
    resumeAudioContext(ctx);
    const now = ctx.currentTime;
    const oscillators: ToneOscillator[] = [];
    for (const note of PHONE_CHIME_NOTES) {
      const gain = ctx.createGain();
      const oscillator = ctx.createOscillator();
      const start = now + note.start;
      const peak = MAX_GAIN * normalizedVolume * note.peak;
      scheduleGainEnvelope(gain.gain, now, peak, note.start, note.duration);
      configureOscillator(oscillator, note.type, note.frequency);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + note.duration);
      oscillators.push(oscillator);
    }
    const suspendAfterTail = () => scheduleIdleSuspend(ctx);
    const fallbackTimer = setTimeout(
      suspendAfterTail,
      (ALERT_DURATION_SECONDS + 0.68) * 1_000,
    );
    oscillators[oscillators.length - 1]?.addEventListener(
      "ended",
      () => {
        clearTimeout(fallbackTimer);
        suspendAfterTail();
      },
    );
  } catch {
    disposeAudioContext();
  }
}
