import { describe, it, expect } from "vitest";
import { DIFFICULTIES, DIFFICULTY_PERSONALITY, isDifficulty, difficultyFromAggression } from "../src/game/difficulty";

describe("difficulty", () => {
  it("scales the whole opponent, not just aggression", () => {
    const relaxed = DIFFICULTY_PERSONALITY.relaxed;
    const hard = DIFFICULTY_PERSONALITY.hard;
    for (const trait of ["aggression", "expansion", "economy", "research"] as const) {
      expect(hard[trait]).toBeGreaterThan(DIFFICULTY_PERSONALITY.normal[trait]);
      expect(relaxed[trait]).toBeLessThan(DIFFICULTY_PERSONALITY.normal[trait]);
    }
  });

  it("normal weights everything neutrally", () => {
    const { aggression, expansion, economy, research } = DIFFICULTY_PERSONALITY.normal;
    expect({ aggression, expansion, economy, research }).toEqual({ aggression: 1, expansion: 1, economy: 1, research: 1 });
  });

  it("thinks further ahead the harder it gets", () => {
    expect(DIFFICULTY_PERSONALITY.relaxed.lookahead).toBe(0);
    expect(DIFFICULTY_PERSONALITY.hard.lookahead).toBeGreaterThan(DIFFICULTY_PERSONALITY.normal.lookahead);
    expect(DIFFICULTY_PERSONALITY.normal.lookahead).toBeGreaterThan(DIFFICULTY_PERSONALITY.relaxed.lookahead);
  });

  it("recognises its own names and nothing else", () => {
    for (const d of DIFFICULTIES) expect(isDifficulty(d)).toBe(true);
    expect(isDifficulty("brutal")).toBe(false);
    expect(isDifficulty(1.5)).toBe(false);
    expect(isDifficulty(null)).toBe(false);
  });

  it("maps an old save's aggression multiplier back to a setting", () => {
    expect(difficultyFromAggression(0.6)).toBe("relaxed");
    expect(difficultyFromAggression(1)).toBe("normal");
    expect(difficultyFromAggression(1.5)).toBe("hard");
    expect(difficultyFromAggression(1.4)).toBe("hard");
  });
});
