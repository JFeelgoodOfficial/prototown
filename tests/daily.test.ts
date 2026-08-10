import { describe, it, expect } from "vitest";
import { dailyKey, dailySeedForToday, dailyOptions, seedFromKey, DAILY_OPPONENTS } from "../src/game/daily";
import { newGame } from "../src/engine/mapgen";
import { TRIBES } from "../src/data/tribes";

describe("daily challenge", () => {
  it("keys on the UTC date", () => {
    expect(dailyKey(new Date(Date.UTC(2026, 7, 10, 23, 59)))).toBe("2026-08-10");
    // still the same day for a player whose local clock has rolled over
    expect(dailyKey(new Date(Date.UTC(2026, 7, 10, 0, 1)))).toBe("2026-08-10");
  });

  it("gives the same board to everyone on the same day", () => {
    const a = dailyOptions(new Date(Date.UTC(2026, 0, 15)));
    const b = dailyOptions(new Date(Date.UTC(2026, 0, 15)));
    expect(a).toEqual(b);
    const g1 = newGame(a);
    const g2 = newGame(b);
    expect(JSON.stringify(g1.tiles)).toBe(JSON.stringify(g2.tiles));
  });

  it("gives a different board the next day", () => {
    const today = dailySeedForToday(new Date(Date.UTC(2026, 0, 15)));
    const tomorrow = dailySeedForToday(new Date(Date.UTC(2026, 0, 16)));
    expect(today).not.toBe(tomorrow);
  });

  it("fixes the tribe line-up so scores are comparable", () => {
    const opts = dailyOptions(new Date(Date.UTC(2026, 3, 2)));
    expect(opts.tribes.length).toBe(DAILY_OPPONENTS + 1);
    expect(new Set(opts.tribes).size).toBe(opts.tribes.length);
    for (const id of opts.tribes) expect(TRIBES.some((t) => t.id === id)).toBe(true);
    expect(opts.winMode).toBe("perfection");
  });

  it("produces a usable positive seed", () => {
    for (const key of ["2026-01-01", "2030-12-31", "1999-06-15"]) {
      const seed = seedFromKey(key);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
    }
  });
});
