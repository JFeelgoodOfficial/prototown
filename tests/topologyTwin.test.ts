import { describe, it, expect } from "vitest";
import { sphereTopology } from "../src/engine/topology";
import type { Grid } from "../src/engine/state";
import {
  idx,
  neighbors,
  dist,
  disk,
  gridWidth,
  gridHeight,
  tileCount,
  planetOf,
  planetCount,
  isGlobeGrid,
} from "../src/engine/state";

describe("twin-globe grid", () => {
  const n = 5;
  const twin: Grid = { size: n, mapType: "twin_globes" };
  const globe: Grid = { size: n, mapType: "globe" };
  const w = n * 6;

  it("is two cube-spheres side by side in one 12n-wide grid", () => {
    expect(isGlobeGrid(twin)).toBe(true);
    expect(planetCount(twin)).toBe(2);
    expect(gridWidth(twin)).toBe(12 * n);
    expect(gridHeight(twin)).toBe(n);
    expect(tileCount(twin)).toBe(12 * n * n);
    expect(planetOf(twin, 0)).toBe(0);
    expect(planetOf(twin, w - 1)).toBe(0);
    expect(planetOf(twin, w)).toBe(1);
    expect(planetOf(twin, 2 * w - 1)).toBe(1);
    // single worlds always report planet 0
    expect(planetOf(globe, w - 1)).toBe(0);
    expect(planetCount(globe)).toBe(1);
  });

  it("keeps every neighbour on its own planet, mirroring the plain globe", () => {
    for (let y = 0; y < n; y++)
      for (let x = 0; x < 2 * w; x++) {
        const p = planetOf(twin, x);
        const ns = neighbors(twin, x, y);
        for (const [nx] of ns) expect(planetOf(twin, nx)).toBe(p);
        // planet-local adjacency is exactly the single globe's adjacency
        const localNs = ns.map(([ax, ay]) => [ax - p * w, ay]);
        const globeNs = neighbors(globe, x - p * w, y);
        expect(localNs.sort().toString()).toBe(globeNs.sort().toString());
      }
  });

  it("measures Infinity between planets and globe distance within one", () => {
    const topo = sphereTopology(n);
    expect(dist(twin, 0, 0, w, 0)).toBe(Infinity);
    expect(dist(twin, 2, 3, w + 2, 3)).toBe(Infinity);
    // same planet: identical to the sphere's own metric, on either planet
    expect(dist(twin, 1, 2, 8, 4)).toBe(topo.dist(idx(globe, 1, 2), idx(globe, 8, 4)));
    expect(dist(twin, w + 1, 2, w + 8, 4)).toBe(topo.dist(idx(globe, 1, 2), idx(globe, 8, 4)));
  });

  it("never leaks a disk across the void between worlds", () => {
    for (const [x, y, r] of [
      [0, 0, 3],
      [w - 1, n - 1, 4],
      [w, 0, 3],
      [2 * w - 1, 2, n * 3],
    ]) {
      const p = planetOf(twin, x);
      const tiles = disk(twin, x, y, r);
      for (const [dx] of tiles) expect(planetOf(twin, dx)).toBe(p);
    }
    // a disk wide enough to swallow the whole sphere still stays on it
    expect(disk(twin, 0, 0, n * 4).length).toBe(6 * n * n);
  });
});
