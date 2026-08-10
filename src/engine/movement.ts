import type { GameState, Unit } from "./state";
import { idx, neighbors, unitAt, playerById, hasTech, cityById } from "./state";
import { TERRAIN } from "../data/terrain";
import { unitMov } from "./combat";

/**
 * Tiles the unit can move to this turn. BFS in move points with the
 * reference game's rules:
 *  - forest/mountain end movement on entry; mountains need Climbing
 *  - entering a tile adjacent to a visible enemy unit ends movement
 *  - land units embark from a friendly port; naval units move on water
 *    (ocean needs Navigation) and disembark onto land
 *  - cannot pass through or stop on any occupied tile
 */
export function reachableTiles(state: GameState, unit: Unit): Array<[number, number]> {
  const player = playerById(state, unit.ownerId);
  const start = idx(state, unit.x, unit.y);
  const budget: number[] = new Array(state.size * state.size).fill(-1);
  budget[start] = unitMov(unit);
  const queue: number[] = [start];
  const out: Array<[number, number]> = [];

  const enemyAdjacent = (x: number, y: number): boolean =>
    neighbors(state, x, y).some(([nx, ny]) => {
      const u = unitAt(state, nx, ny);
      return u !== undefined && u.ownerId !== unit.ownerId;
    });

  while (queue.length) {
    const cur = queue.shift()!;
    const cx = cur % state.size;
    const cy = Math.floor(cur / state.size);
    const remaining = budget[cur];
    if (remaining <= 0) continue;

    for (const [nx, ny] of neighbors(state, cx, cy)) {
      const ni = idx(state, nx, ny);
      const tile = state.tiles[ni];
      const terr = TERRAIN[tile.terrain];

      if (unitAt(state, nx, ny)) continue;

      let entering: "land" | "water";
      if (terr.water) {
        entering = "water";
        if (unit.embarked === null) {
          // land unit may only step into water by embarking at a friendly port
          const fromTile = state.tiles[cur];
          const fromPort =
            fromTile.building === "port" &&
            fromTile.cityId !== null &&
            cityById(state, fromTile.cityId)?.ownerId === unit.ownerId;
          if (!fromPort) continue;
          if (tile.terrain === "ocean") continue;
        } else {
          if (tile.terrain === "ocean" && !hasTech(player, "navigation")) continue;
        }
      } else {
        entering = "land";
        if (terr.requiresTech && !hasTech(player, terr.requiresTech) && unit.embarked === null) continue;
        if (unit.embarked !== null) {
          // disembark: any adjacent land tile, ends movement
          if (terr.requiresTech && !hasTech(player, terr.requiresTech)) continue;
        }
      }

      const stops =
        terr.stopsMovement ||
        enemyAdjacent(nx, ny) ||
        (entering === "water" && unit.embarked === null) || // embarking ends movement
        (entering === "land" && unit.embarked !== null); // disembarking ends movement

      const cost = terr.moveCost;
      const left = stops ? 0 : remaining - cost;
      if (remaining - cost < 0) continue;
      if (budget[ni] >= left && budget[ni] !== -1) continue;

      budget[ni] = left;
      if (ni !== start) {
        if (!out.some(([ox, oy]) => ox === nx && oy === ny)) out.push([nx, ny]);
        if (left > 0) queue.push(ni);
      }
    }
  }
  return out;
}
