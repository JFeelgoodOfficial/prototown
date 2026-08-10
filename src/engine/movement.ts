import type { GameState, Unit } from "./state";
import { idx, neighbors, unitAt, playerById, hasTech, cityById } from "./state";
import { TERRAIN } from "../data/terrain";
import { unitMovIn } from "./combat";
import { abilityOf } from "./tribeAbility";

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
  const canEnter = terrainOpenTo(state, unit.ownerId);
  const budget: number[] = new Array(state.size * state.size).fill(-1);
  budget[start] = unitMovIn(state, unit);
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
        if (!canEnter(tile.terrain)) continue;
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

/**
 * Whether a player's land units may enter a terrain: the tech gate, waived
 * for tribes whose ability climbs mountains for free.
 */
export function terrainOpenTo(state: GameState, playerId: number): (terrain: string) => boolean {
  const player = playerById(state, playerId);
  const climbs = abilityOf(state, playerId).freeClimbing;
  return (terrain: string) => {
    const terr = TERRAIN[terrain as keyof typeof TERRAIN];
    if (!terr.requiresTech) return true;
    if (climbs && terr.requiresTech === "climbing") return true;
    return hasTech(player, terr.requiresTech);
  };
}
