import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import { dist } from "../src/engine/state";

const opts = (seed: number) => ({
  seed,
  size: 14,
  tribes: ["meridia", "ashfen", "korvani"],
  winMode: "domination" as const,
});

describe("map generation", () => {
  it("is deterministic for the same seed", () => {
    const a = newGame(opts(42));
    const b = newGame(opts(42));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("differs across seeds", () => {
    const a = newGame(opts(1));
    const b = newGame(opts(2));
    expect(JSON.stringify(a.tiles)).not.toBe(JSON.stringify(b.tiles));
  });

  it("places one capital and one starting warrior per tribe, spaced apart", () => {
    const s = newGame(opts(7));
    expect(s.cities.length).toBe(3);
    expect(s.units.length).toBe(3);
    for (const c of s.cities) {
      expect(c.isCapital).toBe(true);
      expect(s.tiles[c.y * s.size + c.x].terrain).toBe("field");
    }
    for (let i = 0; i < s.cities.length; i++)
      for (let j = i + 1; j < s.cities.length; j++) {
        expect(dist(s, s.cities[i].x, s.cities[i].y, s.cities[j].x, s.cities[j].y)).toBeGreaterThanOrEqual(4);
      }
  });

  it("spawns villages on land away from capitals", () => {
    const s = newGame(opts(13));
    const villages = s.tiles.filter((t) => t.village);
    expect(villages.length).toBeGreaterThan(3);
    for (const v of villages) {
      expect(v.terrain).toBe("field");
      for (const c of s.cities) expect(dist(s, v.x, v.y, c.x, c.y)).toBeGreaterThanOrEqual(3);
    }
  });

  it("marks the first humanSeats players as human", () => {
    const solo = newGame(opts(7));
    expect(solo.players.map((p) => p.isHuman)).toEqual([true, false, false]);
    const duo = newGame({ ...opts(7), humanSeats: 2 });
    expect(duo.players.map((p) => p.isHuman)).toEqual([true, true, false]);
  });

  it("generates the identical map regardless of humanSeats", () => {
    const solo = newGame(opts(7));
    const duo = newGame({ ...opts(7), humanSeats: 2 });
    const strip = (s: ReturnType<typeof newGame>) =>
      JSON.stringify({ ...s, players: s.players.map((p) => ({ ...p, isHuman: undefined })) });
    expect(strip(duo)).toBe(strip(solo));
  });

  it("players start with their tribe's tech and 5 stars", () => {
    const s = newGame(opts(3));
    expect(s.players[0].techs).toEqual(["organization"]);
    expect(s.players[1].techs).toEqual(["hunting"]);
    expect(s.players[2].techs).toEqual(["fishing"]);
    for (const p of s.players) expect(p.stars).toBe(5);
  });
});
