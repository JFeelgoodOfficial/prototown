import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import { gridToWorld, TILE_W, TILE_H } from "../src/render/iso";
import { pickTile, tileLift } from "../src/render/renderer";
import { FOG_LIFT } from "../src/render/terrainArt";

const state = newGame({ seed: 11, size: 11, tribes: ["ashfen", "korvani"], winMode: "domination" });

/** Is (wx, wy) inside the diamond this tile's top is actually drawn as?
    `slack` decides how points exactly on a shared edge are counted. */
function covers(x: number, y: number, wx: number, wy: number, slack = 1e-6): boolean {
  const [cx, cy] = gridToWorld(x, y);
  const dy = wy - (cy - tileLift(state, x, y));
  return Math.abs(wx - cx) / (TILE_W / 2) + Math.abs(dy) / (TILE_H / 2) <= 1 + slack;
}

/** Painter's order: the tile drawn last is the one the player sees. */
const drawnAfter = (a: [number, number], b: [number, number]): boolean =>
  a[0] + a[1] > b[0] + b[1] || (a[0] + a[1] === b[0] + b[1] && a[0] > b[0]);

describe("tile picking with lifted tile tops", () => {
  it("picks a tile at its own drawn centre", () => {
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const [wx, wy] = gridToWorld(x, y);
        const got = pickTile(state, wx, wy - tileLift(state, x, y));
        expect([got[0] + 0, got[1] + 0]).toEqual([x, y]);
      }
    }
  });

  it("always picks the front-most tile drawn over the point", () => {
    const offsets: Array<[number, number]> = [
      [0, 0],
      [0, -TILE_H / 2 + 2],
      [0, TILE_H / 2 - 2],
      [-TILE_W / 2 + 3, 0],
      [TILE_W / 2 - 3, 0],
      [12, 6],
      [-12, -6],
    ];
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const [cx, cy] = gridToWorld(x, y);
        const top = cy - tileLift(state, x, y);
        for (const [dx, dy] of offsets) {
          const wx = cx + dx;
          const wy = top + dy;
          const got = pickTile(state, wx, wy);
          expect(covers(got[0], got[1], wx, wy)).toBe(true);
          // nothing drawn later may also cover it
          for (let ty = 0; ty < state.size; ty++) {
            for (let tx = 0; tx < state.size; tx++) {
              // -1e-6 slack: a point exactly on two tiles' shared edge is a tie, not a miss
              if (drawnAfter([tx, ty], got as [number, number]) && covers(tx, ty, wx, wy, -1e-6)) {
                throw new Error(`picked ${got} but ${[tx, ty]} is drawn over it at ${wx},${wy}`);
              }
            }
          }
        }
      }
    }
  });

  it("uses the flat fog height for tiles the player has not explored", () => {
    const explored = new Array(state.size * state.size).fill(0);
    const [x, y] = [4, 4];
    const [wx, wy] = gridToWorld(x, y);
    expect(tileLift(state, x, y, explored)).toBe(FOG_LIFT);
    const got = pickTile(state, wx, wy - FOG_LIFT, explored);
    expect([got[0] + 0, got[1] + 0]).toEqual([x, y]);
  });
});
