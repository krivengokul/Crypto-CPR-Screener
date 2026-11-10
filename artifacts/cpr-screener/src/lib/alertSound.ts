let audioContext: AudioContext | null = null;

const MUTE_KEY = "cpr-alert-muted";
export const ALERT_MUTE_EVENT = "cpr-alert-mute-changed";

export function isAlertMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAlertMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(ALERT_MUTE_EVENT, { detail: { muted } }));
}

function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext) {
      const AudioContextConstructor = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return null;
      audioContext = new AudioContextConstructor();
    }
    return audioContext;
  } catch {
    return null;
  }
}

/** Unlock audio after the user's first interaction so later live alerts can sound. */
export function unlockAlertAudio() {
  const context = getAudioContext();
  if (context?.state === "suspended") void context.resume().catch(() => undefined);
}

/** Play the short two-note alert when an exchange trade crosses a signal entry. */
export function playEntryCrossAlert() {
  if (isAlertMuted()) return;
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume().catch(() => undefined);

  const start = context.currentTime;
  [0, 0.18].forEach((offset) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.16);
  });
}
