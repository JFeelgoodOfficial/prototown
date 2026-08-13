import { describe, it, expect } from "vitest";
import { sphereTopology } from "../src/engine/topology";
import type { Grid } from "../src/engine/state";
import { idx, coordsOf, inBounds, neighbors, dist, disk, gridWidth, gridHeight, tileCount } from "../src/engine/state";

describe("flat grid primitives", () => {
  it.each([11, 14, 16])("size %i matches the classic square formulas", (size) => {
    const grid: Grid = { size, mapType: "square" };
    expect(gridWidth(grid)).toBe(size);
    expect(gridHeight(grid)).toBe(size);
    expect(tileCount(grid)).toBe(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        expect(idx(grid, x, y)).toBe(y * size + x);
        expect(coordsOf(grid, y * size + x)).toEqual([x, y]);
        // neighbours are the bounds-clipped Moore 8
        const ns = neighbors(grid, x, y);
        const expected: Array<[number, number]> = [];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (x + dx >= 0 && y + dy >= 0 && x + dx < size && y + dy < size) expected.push([x + dx, y + dy]);
          }
        expect(ns).toEqual(expected);
      }
    expect(dist(grid, 0, 0, 5, 3)).toBe(5);
    expect(inBounds(grid, size, 0)).toBe(false);
    expect(disk(grid, 0, 0, 1).length).toBe(4);
  });
});

describe("cube-sphere topology", () => {
  it.each([3, 5, 7])("n=%i has sound adjacency", (n) => {
    const topo = sphereTopology(n);
    expect(topo.count).toBe(6 * n * n);

    let sevens = 0;
    for (let i = 0; i < topo.count; i++) {
      const ns = topo.neighborTable[i];
      // no self loops, no duplicates, everything in range
      expect(new Set(ns).size).toBe(ns.length);
      expect(ns.includes(i)).toBe(false);
      for (const j of ns) {
        expect(j).toBeGreaterThanOrEqual(0);
        expect(j).toBeLessThan(topo.count);
        // symmetric
        expect(topo.neighborTable[j]).toContain(i);
      }
      expect([7, 8]).toContain(ns.length);
      if (ns.length === 7) sevens++;
    }
    // exactly three tiles meet at each of the eight cube corners
    expect(sevens).toBe(24);
    expect(topo.cornerTiles.size).toBe(24);
  });

  it("has no edges: every tile reaches every other", () => {
    const topo = sphereTopology(5);
    const d = topo.distField(0);
    for (let i = 0; i < topo.count; i++) {
      expect(d[i]).toBeLessThan(0xffff);
    }
    // distance is symmetric
    for (const [a, b] of [
      [0, 77],
      [3, 149],
      [12, 100],
    ]) {
      expect(topo.dist(a, b)).toBe(topo.dist(b, a));
    }
  });

  it("centres sit on the unit sphere, all distinct", () => {
    const topo = sphereTopology(4);
    const seen = new Set<string>();
    for (const [x, y, z] of topo.centers) {
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
      const key = `${x.toFixed(9)},${y.toFixed(9)},${z.toFixed(9)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("plugs into the shared grid primitives", () => {
    const n = 5;
    const grid: Grid = { size: n, mapType: "globe" };
    expect(gridWidth(grid)).toBe(6 * n);
    expect(gridHeight(grid)).toBe(n);
    expect(tileCount(grid)).toBe(6 * n * n);
    // a tile on a face edge still has a full Moore neighbourhood
    for (let y = 0; y < n; y++)
      for (let x = 0; x < 6 * n; x++) {
        const count = neighbors(grid, x, y).length;
        expect([7, 8]).toContain(count);
      }
    // wrap: distance from one face to the opposite face is finite and sane
    expect(dist(grid, 0, 0, 5 * n, n - 1)).toBeGreaterThan(0);
    expect(dist(grid, 0, 0, 5 * n, n - 1)).toBeLessThan(4 * n);
    // disk grows without hitting any edge: r=1 disk always has 8 or 9 tiles
    for (let y = 0; y < n; y++)
      for (let x = 0; x < 6 * n; x++) {
        expect([8, 9]).toContain(disk(grid, x, y, 1).length);
      }
  });
});
