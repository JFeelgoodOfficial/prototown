import { describe, it, expect } from "vitest";
import { ATLAS_SIZE, CELL_H, CELL_W, atlasCols, cellOrigin, cellDiamondUv } from "../src/render/globe/atlasLayout";

/** The biggest globe the menus offer: n=7 → 294 tiles. */
const MAX_TILES = 6 * 7 * 7;
/** The hard cap for twin worlds: two planets at n=8 → 768 tiles, still ≤ 882 cells. */
const MAX_TWIN_TILES = 12 * 8 * 8;

describe("globe atlas layout", () => {
  it("fits every tile of the biggest globe inside the atlas", () => {
    for (let i = 0; i < MAX_TILES; i++) {
      const [x, y] = cellOrigin(i);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + CELL_W).toBeLessThanOrEqual(ATLAS_SIZE);
      expect(y + CELL_H).toBeLessThanOrEqual(ATLAS_SIZE);
    }
  });

  it("fits both planets of the biggest twin world inside the atlas", () => {
    for (let i = 0; i < MAX_TWIN_TILES; i++) {
      const [x, y] = cellOrigin(i);
      expect(x + CELL_W).toBeLessThanOrEqual(ATLAS_SIZE);
      expect(y + CELL_H).toBeLessThanOrEqual(ATLAS_SIZE);
    }
  });

  it("gives every tile its own cell", () => {
    const seen = new Set<string>();
    for (let i = 0; i < MAX_TWIN_TILES; i++) {
      const key = cellOrigin(i).join(",");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("keeps diamond UVs inside the cell, clear of its edges", () => {
    for (const i of [0, 1, atlasCols() - 1, atlasCols(), MAX_TILES - 1]) {
      const [ox, oy] = cellOrigin(i);
      const uvs = cellDiamondUv(i);
      for (const [u, v] of uvs) {
        expect(u).toBeGreaterThan(ox / ATLAS_SIZE);
        expect(u).toBeLessThan((ox + CELL_W) / ATLAS_SIZE);
        // v is flipped: cell pixel rows [oy, oy+CELL_H] are v ∈ [1-(oy+CELL_H)/A, 1-oy/A]
        expect(v).toBeGreaterThan(1 - (oy + CELL_H) / ATLAS_SIZE);
        expect(v).toBeLessThan(1 - oy / ATLAS_SIZE);
      }
      // diamond shape: top and bottom share u with the centre, left/right share v
      const [top, right, bottom, left] = uvs;
      expect(top[0]).toBeCloseTo(bottom[0], 10);
      expect(right[1]).toBeCloseTo(left[1], 10);
      expect(top[1]).toBeGreaterThan(bottom[1]);
      expect(right[0]).toBeGreaterThan(left[0]);
    }
  });
});
