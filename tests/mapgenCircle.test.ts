import { describe, it, expect } from "vitest";
import { newGame, insideCircle } from "../src/engine/mapgen";
import { dist } from "../src/engine/state";

const opts = (seed: number, size = 14) => ({
  seed,
  size,
  mapType: "circle" as const,
  tribes: ["meridia", "ashfen", "korvani"],
  winMode: "domination" as const,
});

describe("circle map generation", () => {
  it("is deterministic for the same seed", () => {
    const a = newGame(opts(42));
    const b = newGame(opts(42));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("stamps the map type into state", () => {
    expect(newGame(opts(1)).mapType).toBe("circle");
  });

  it("leaves square maps bit-identical to before the mapType option existed", () => {
    const square = newGame({ ...opts(42), mapType: "square" });
    const legacy = newGame({ seed: 42, size: 14, tribes: ["meridia", "ashfen", "korvani"], winMode: "domination" });
    expect(JSON.stringify(square)).toBe(JSON.stringify(legacy));
  });

  it.each([11, 14, 16])("size %i: void exactly outside the disc, playable inside", (size) => {
    const s = newGame(opts(9, size));
    for (const t of s.tiles) {
      if (insideCircle(size, t.x, t.y)) {
        expect(t.terrain).not.toBe("void");
      } else {
        expect(t.terrain).toBe("void");
        expect(t.resource).toBeNull();
        expect(t.village).toBe(false);
        expect(t.ruin).toBe(false);
        expect(t.cityHere).toBeNull();
        expect(t.cityId).toBeNull();
      }
    }
    // the disc really is round-ish: corners void, centre playable
    expect(s.tiles[0].terrain).toBe("void");
    const c = Math.floor(size / 2);
    expect(s.tiles[c * size + c].terrain).not.toBe("void");
  });

  it("keeps capitals, villages and ruins inside the disc with playable surroundings", () => {
    for (const seed of [1, 7, 23, 99]) {
      const s = newGame(opts(seed));
      for (const city of s.cities) {
        expect(insideCircle(s.size, city.x, city.y)).toBe(true);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            expect(s.tiles[(city.y + dy) * s.size + city.x + dx].terrain).not.toBe("void");
          }
      }
      for (const t of s.tiles) {
        if (t.village || t.ruin) expect(insideCircle(s.size, t.x, t.y)).toBe(true);
      }
    }
  });

  it("connects all capitals by land through the centre", () => {
    for (const seed of [1, 7, 23, 99]) {
      const s = newGame(opts(seed));
      // BFS over walkable-ish land (anything not water/ocean/void) from capital 0
      const land = (x: number, y: number) => {
        const t = s.tiles[y * s.size + x].terrain;
        return t !== "water" && t !== "ocean" && t !== "void";
      };
      const seen = new Set<number>();
      const queue = [[s.cities[0].x, s.cities[0].y] as [number, number]];
      seen.add(s.cities[0].y * s.size + s.cities[0].x);
      while (queue.length) {
        const [x, y] = queue.pop()!;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
            const key = ny * s.size + nx;
            if (seen.has(key) || !land(nx, ny)) continue;
            seen.add(key);
            queue.push([nx, ny]);
          }
      }
      for (const c of s.cities) expect(seen.has(c.y * s.size + c.x)).toBe(true);
    }
  });

  it("keeps capitals spaced apart", () => {
    const s = newGame(opts(7));
    for (let i = 0; i < s.cities.length; i++)
      for (let j = i + 1; j < s.cities.length; j++) {
        expect(dist(s.cities[i].x, s.cities[i].y, s.cities[j].x, s.cities[j].y)).toBeGreaterThanOrEqual(4);
      }
  });

  it("never reveals or claims void tiles", () => {
    const s = newGame(opts(5));
    for (const p of s.players) {
      for (const t of s.tiles) {
        if (t.terrain === "void") {
          expect(p.explored[t.y * s.size + t.x]).toBe(0);
          expect(t.cityId).toBeNull();
        }
      }
    }
  });
});
