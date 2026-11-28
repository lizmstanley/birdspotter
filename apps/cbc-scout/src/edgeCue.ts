import type { Crossing } from './settledStatus.ts';

const PULSE_MS = 200;
const GAP_MS = 150;
const TONE_HZ = 880;
const TONE_GAIN = 0.3;
const FADE_S = 0.02;
const UNLOCK_EVENTS = ['touchend', 'click', 'keydown'] as const;

/** @returns vibration pattern in milliseconds: one pulse inward, two outward */
export function cuePattern(crossing: Crossing): readonly number[] {
  return crossing === 'inward' ? [PULSE_MS] : [PULSE_MS, GAP_MS, PULSE_MS];
}

function canVibrate(): boolean {
  return typeof navigator.vibrate === 'function';
}

function playTone(audio: AudioContext, startS: number, seconds: number): void {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = TONE_HZ;
  gain.gain.setValueAtTime(0, startS);
  gain.gain.linearRampToValueAtTime(TONE_GAIN, startS + FADE_S);
  gain.gain.setValueAtTime(TONE_GAIN, startS + seconds - FADE_S);
  gain.gain.linearRampToValueAtTime(0, startS + seconds);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(startS);
  oscillator.stop(startS + seconds);
}

/** Even entries of the pattern sound and odd entries are the silence between, as in a vibration pattern. */
function playTones(audio: AudioContext, pattern: readonly number[]): void {
  let startS = audio.currentTime;
  for (let index = 0; index < pattern.length; index += 1) {
    const seconds = pattern[index] / 1000;
    if (index % 2 === 0) playTone(audio, startS, seconds);
    startS += seconds;
  }
}

export interface EdgeCuePlayer {
  readonly play: (crossing: Crossing) => void;
  /** Stops listening for the tap that unlocks sound, and closes the sound. */
  readonly close: () => void;
}

/**
 * Buzzes where the browser can, and otherwise plays a tone. iPhone Safari has no vibration, and its sound starts
 * only from a tap, so the player listens for the first tap on the page.
 */
export function createEdgeCuePlayer(): EdgeCuePlayer {
  if (canVibrate()) {
    return {
      play: (crossing) => {
        // Refused before the first tap since the page opened; Help says the cue starts after a tap.
        navigator.vibrate([...cuePattern(crossing)]);
      },
      close: () => {},
    };
  }
  let audio: AudioContext | null = null;

  function unlock(): void {
    audio ??= new AudioContext();
    if (audio.state === 'running') return;
    audio.resume().catch(() => {
      // Refused outside a tap; the next tap tries again.
    });
  }

  for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlock, { capture: true });
  return {
    play: (crossing) => {
      if (audio?.state === 'running') playTones(audio, cuePattern(crossing));
    },
    close: () => {
      for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlock, { capture: true });
      void audio?.close();
    },
  };
}
