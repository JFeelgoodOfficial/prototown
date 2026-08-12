import type { GameState, Unit } from "./state";
import { idx, neighbors, unitAt, playerById, hasTech, cityById, citiesOf, inBounds } from "./state";
import { TERRAIN } from "../data/terrain";
import { ROAD_MOVE_COST } from "../data/constants";
import { unitMovIn } from "./combat";
import { abilityOf } from "./tribeAbility";

/**
 * Tiles the unit can move to this turn. BFS in move points with the
 * reference game's rules:
 *  - forest/mountain end movement on entry; mountains need Climbing
 *  - entering a tile adjacent to a visible enemy unit ends movement
 *  - land units embark by stepping aboard a friendly port; naval units move
 *    on water (ocean needs Navigation) and disembark onto land
 *  - cannot pass through or stop on any occupied tile
 *  - with Roads, a step between two land tiles of your own territory costs
 *    half and is never stopped by the terrain underneath it
 */
export function reachableTiles(state: GameState, unit: Unit): Array<[number, number]> {
  const player = playerById(state, unit.ownerId);
  const start = idx(state, unit.x, unit.y);
  const canEnter = terrainOpenTo(state, unit.ownerId);
  const budget: number[] = new Array(state.size * state.size).fill(-1);
  budget[start] = unitMovIn(state, unit);
  const queue: number[] = [start];
  const out: Array<[number, number]> = [];
  // tiles already pushed to `out`, so collecting results stays linear
  const listed = new Uint8Array(state.size * state.size);

  // Roads only help a land unit walking its own ground. Territory includes
  // coastal water (claimTerritory has no terrain check), so an embarked unit
  // would otherwise get a free half-price cruise along its own shoreline.
  const roaded = unit.embarked === null && hasTech(player, "roads")
    ? roadNetwork(state, unit.ownerId)
    : null;

  const enemyNear = enemyAdjacencyMask(state, unit.ownerId);

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
          // a land unit puts to sea by stepping aboard a friendly port; ports
          // sit on water, so the boarding step is the entry into water itself
          const ontoPort =
            tile.building === "port" &&
            tile.cityId !== null &&
            cityById(state, tile.cityId)?.ownerId === unit.ownerId;
          if (!ontoPort) continue;
        } else {
          if (tile.terrain === "ocean" && !hasTech(player, "navigation")) continue;
        }
      } else {
        entering = "land";
        if (!canEnter(tile.terrain)) continue;
      }

      // a roaded step is one that both leaves and enters your own land
      const onRoad = roaded !== null && entering === "land" && roaded[cur] === 1 && roaded[ni] === 1;

      const stops =
        (onRoad ? false : terr.stopsMovement) ||
        enemyNear[ni] === 1 ||
        (entering === "water" && unit.embarked === null) || // embarking ends movement
        (entering === "land" && unit.embarked !== null); // disembarking ends movement

      const cost = onRoad ? ROAD_MOVE_COST : terr.moveCost;
      const left = stops ? 0 : remaining - cost;
      if (remaining - cost < 0) continue;
      if (budget[ni] >= left && budget[ni] !== -1) continue;

      budget[ni] = left;
      if (ni !== start) {
        if (!listed[ni]) {
          listed[ni] = 1;
          out.push([nx, ny]);
        }
        if (left > 0) queue.push(ni);
      }
    }
  }
  return out;
}

/**
 * Land tiles belonging to this player's cities — the ground Roads runs over.
 * Built in one pass because the BFS asks about it on every edge it considers.
 */
function roadNetwork(state: GameState, playerId: number): Uint8Array {
  const mine = new Set(citiesOf(state, playerId).map((c) => c.id));
  const mask = new Uint8Array(state.size * state.size);
  for (let i = 0; i < state.tiles.length; i++) {
    const tile = state.tiles[i];
    if (tile.cityId === null || !mine.has(tile.cityId)) continue;
    if (TERRAIN[tile.terrain].water) continue;
    mask[i] = 1;
  }
  return mask;
}

/** Tiles standing next to an enemy unit, which end a move on entry. */
function enemyAdjacencyMask(state: GameState, playerId: number): Uint8Array {
  const mask = new Uint8Array(state.size * state.size);
  for (const u of state.units) {
    if (u.ownerId === playerId) continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = u.x + dx;
        const y = u.y + dy;
        if (inBounds(state, x, y)) mask[idx(state, x, y)] = 1;
      }
  }
  return mask;
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
    if (terr.impassable) return false;
    if (!terr.requiresTech) return true;
    if (climbs && terr.requiresTech === "climbing") return true;
    return hasTech(player, terr.requiresTech);
  };
}
