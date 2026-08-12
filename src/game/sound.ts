/**
 * Tiny synthesised sound bank. Every effect is generated with oscillators at
 * play time, so the game ships no audio files and the bundle cost is zero.
 */
export type SoundName = "move" | "attack" | "kill" | "capture" | "levelUp" | "select" | "endTurn" | "defeat" | "missile" | "nuke";

const MUTE_KEY = "polyforge-muted";

let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // preference just won't persist
  }
}

/** Browsers only allow audio after a gesture, so the context is made lazily. */
function audio(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface Tone {
  /** start and end frequency in Hz — a slide when they differ */
  from: number;
  to: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  /** seconds to wait before this tone sounds */
  delay?: number;
}

const BANK: Record<SoundName, Tone[]> = {
  select: [{ from: 660, to: 880, duration: 0.07, type: "triangle", gain: 0.05 }],
  move: [{ from: 320, to: 190, duration: 0.11, type: "triangle", gain: 0.07 }],
  attack: [
    { from: 180, to: 60, duration: 0.16, type: "square", gain: 0.08 },
    { from: 90, to: 40, duration: 0.2, type: "sawtooth", gain: 0.05 },
  ],
  kill: [
    { from: 240, to: 50, duration: 0.3, type: "sawtooth", gain: 0.09 },
    { from: 120, to: 35, duration: 0.34, type: "square", gain: 0.06, delay: 0.03 },
  ],
  capture: [
    { from: 440, to: 660, duration: 0.12, type: "triangle", gain: 0.07 },
    { from: 660, to: 880, duration: 0.16, type: "triangle", gain: 0.07, delay: 0.1 },
  ],
  levelUp: [
    { from: 523, to: 523, duration: 0.1, type: "triangle", gain: 0.06 },
    { from: 659, to: 659, duration: 0.1, type: "triangle", gain: 0.06, delay: 0.09 },
    { from: 784, to: 988, duration: 0.24, type: "triangle", gain: 0.07, delay: 0.18 },
  ],
  endTurn: [{ from: 300, to: 400, duration: 0.13, type: "sine", gain: 0.06 }],
  defeat: [
    { from: 300, to: 120, duration: 0.5, type: "sine", gain: 0.08 },
    { from: 150, to: 60, duration: 0.6, type: "triangle", gain: 0.06, delay: 0.12 },
  ],
  // whoosh up, a falling whistle, then the boom timed to MISSILE_ANIM_MS impact
  missile: [
    { from: 140, to: 620, duration: 0.3, type: "sawtooth", gain: 0.05 },
    { from: 1400, to: 320, duration: 0.4, type: "sine", gain: 0.045, delay: 0.45 },
    { from: 160, to: 45, duration: 0.28, type: "square", gain: 0.09, delay: 0.85 },
  ],
  nuke: [
    { from: 70, to: 28, duration: 1.2, type: "sine", gain: 0.11 },
    { from: 200, to: 40, duration: 1.0, type: "sawtooth", gain: 0.07, delay: 0.05 },
    { from: 55, to: 30, duration: 1.3, type: "triangle", gain: 0.08, delay: 0.3 },
  ],
};

export function playSound(name: SoundName): void {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  for (const tone of BANK[name]) {
    const start = now + (tone.delay ?? 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.from, start);
    if (tone.to !== tone.from) osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.duration);
    // a quick attack and a smooth tail, so nothing clicks
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.02);
  }
}
