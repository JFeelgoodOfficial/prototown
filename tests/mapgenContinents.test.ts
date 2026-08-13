import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import type { GameState } from "../src/engine/state";
import { idx, neighbors } from "../src/engine/state";

const opts = (seed: number, tribes = ["meridia", "ashfen"]) => ({
  seed,
  size: 14,
  mapType: "continents" as const,
  tribes,
  winMode: "domination" as const,
});

const SEEDS = [1, 7, 23, 42, 99, 250];

const isLand = (s: GameState, x: number, y: number): boolean => {
  const t = s.tiles[idx(s, x, y)].terrain;
  return t === "field" || t === "forest" || t === "mountain";
};

function landmassOf(s: GameState, sx: number, sy: number): Set<number> {
  const seen = new Set<number>([idx(s, sx, sy)]);
  const queue: Array<[number, number]> = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [nx, ny] of neighbors(s, x, y)) {
      const key = idx(s, nx, ny);
      if (!seen.has(key) && isLand(s, nx, ny)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

/** All sea tiles 8-connected to (sx, sy). */
function seaOf(s: GameState, sx: number, sy: number): Set<number> {
  const water = (x: number, y: number) => {
    const t = s.tiles[idx(s, x, y)].terrain;
    return t === "water" || t === "ocean";
  };
  const seen = new Set<number>([idx(s, sx, sy)]);
  const queue: Array<[number, number]> = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [nx, ny] of neighbors(s, x, y)) {
      const key = idx(s, nx, ny);
      if (!seen.has(key) && water(nx, ny)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

describe("continents map generation", () => {
  it("is deterministic for the same seed", () => {
    const a = newGame(opts(42));
    const b = newGame(opts(42));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("gives every capital a big-enough continent", () => {
    for (const seed of SEEDS) {
      const s = newGame(opts(seed));
      for (const c of s.cities) {
        expect(landmassOf(s, c.x, c.y).size).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("gives every capital shallow water beside it, connected to the wider sea", () => {
    for (const seed of SEEDS) {
      const s = newGame(opts(seed));
      // the biggest sea on the map, to check the capital's water is not a puddle
      let biggestSea = new Set<number>();
      for (const t of s.tiles) {
        if ((t.terrain === "water" || t.terrain === "ocean") && !biggestSea.has(idx(s, t.x, t.y))) {
          const sea = seaOf(s, t.x, t.y);
          if (sea.size > biggestSea.size) biggestSea = sea;
        }
      }
      for (const c of s.cities) {
        const portable = neighbors(s, c.x, c.y).filter(([nx, ny]) => s.tiles[idx(s, nx, ny)].terrain === "water");
        expect(portable.length).toBeGreaterThan(0);
        expect(portable.some(([nx, ny]) => biggestSea.has(idx(s, nx, ny)))).toBe(true);
      }
    }
  });

  it("separates two-player capitals by ocean on most seeds", () => {
    let separated = 0;
    for (const seed of SEEDS) {
      const s = newGame(opts(seed));
      const [a, b] = s.cities;
      if (!landmassOf(s, a.x, a.y).has(idx(s, b.x, b.y))) separated++;
    }
    expect(separated).toBeGreaterThanOrEqual(SEEDS.length - 1);
  });

  it("gives deep ocean a shallow shelf wherever it meets land", () => {
    const s = newGame(opts(7));
    for (const t of s.tiles) {
      if (t.terrain !== "ocean") continue;
      for (const [nx, ny] of neighbors(s, t.x, t.y)) {
        expect(isLand(s, nx, ny)).toBe(false);
      }
    }
  });
});
