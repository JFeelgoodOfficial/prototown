import type { AiPersonality } from "../ai/evaluate";

export type Difficulty = "relaxed" | "normal" | "hard";

/**
 * Difficulty shapes the whole opponent, not just how eagerly it attacks:
 * a hard rival also expands sooner, works its land harder and researches more.
 */
export const DIFFICULTY_PERSONALITY: Record<Difficulty, AiPersonality> = {
  relaxed: { aggression: 0.6, expansion: 0.8, economy: 0.8, research: 0.7, lookahead: 0 },
  normal: { aggression: 1, expansion: 1, economy: 1, research: 1, lookahead: 4 },
  hard: { aggression: 1.5, expansion: 1.3, economy: 1.3, research: 1.4, lookahead: 10 },
};

export const DIFFICULTIES = Object.keys(DIFFICULTY_PERSONALITY) as Difficulty[];

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && (DIFFICULTIES as string[]).includes(v);
}

/** Older saves stored only an aggression multiplier; map it back to a setting. */
export function difficultyFromAggression(aggression: number): Difficulty {
  let best: Difficulty = "normal";
  for (const d of DIFFICULTIES) {
    const cur = Math.abs(DIFFICULTY_PERSONALITY[d].aggression - aggression);
    if (cur < Math.abs(DIFFICULTY_PERSONALITY[best].aggression - aggression)) best = d;
  }
  return best;
}
