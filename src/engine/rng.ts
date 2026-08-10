import type { GameState } from "./state";

/** mulberry32 — small, fast, deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a random float in [0,1) from the state's PRNG, advancing the
 * cursor stored in the state. The only sanctioned source of randomness.
 */
export function nextRandom(state: GameState): number {
  let a = state.rngState >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rngState = a >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(state: GameState, maxExclusive: number): number {
  return Math.floor(nextRandom(state) * maxExclusive);
}
