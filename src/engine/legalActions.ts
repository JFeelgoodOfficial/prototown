import type { GameState, Tile } from "./state";
import {
  citiesOf,
  unitsOf,
  tileAt,
  unitAt,
  cityById,
  playerById,
  hasTech,
  dist,
  idx,
} from "./state";
import type { Action } from "./actions";
import { reachableTiles } from "./movement";
import { unitRange } from "./combat";
import { watchedMask } from "./fog";
import { HARVEST_DEFS, BUILDING_DEFS, REWARD_STARS_AMOUNT } from "../data/constants";
import { UNITS, NAVAL, type UnitType } from "../data/units";
import { TECHS, techCost } from "../data/techs";
import { cityUnitCount, cityCapacity, playerHasPendingReward } from "./economy";

/**
 * Every action the player may take right now. Fog-aware: attacks only
 * target enemies the player can currently see. A pending city reward
 * must be resolved before anything else.
 */
export function computeLegalActions(state: GameState, playerId: number): Action[] {
  if (state.winnerId !== null || state.currentPlayerId !== playerId) return [];
  const player = playerById(state, playerId);
  if (!player.alive) return [];

  const rewardCity = playerHasPendingReward(state, playerId);
  if (rewardCity) {
    return rewardCity.pendingReward!.map((reward) => ({
      type: "CHOOSE_REWARD",
      cityId: rewardCity.id,
      reward,
    }));
  }

  const actions: Action[] = [];
  const watched = watchedMask(state, player);

  for (const unit of unitsOf(state, playerId)) {
    if (!unit.moved) {
      for (const [x, y] of reachableTiles(state, unit)) {
        actions.push({ type: "MOVE", unitId: unit.id, x, y });
      }
    }
    if (!unit.attacked) {
      const range = unitRange(unit);
      for (const enemy of state.units) {
        if (enemy.ownerId === playerId) continue;
        if (dist(unit.x, unit.y, enemy.x, enemy.y) > range) continue;
        if (!watched[idx(state, enemy.x, enemy.y)]) continue;
        actions.push({ type: "ATTACK", unitId: unit.id, targetId: enemy.id });
      }
    }
    if (!unit.moved && !unit.attacked && unit.embarked === null) {
      const tile = tileAt(state, unit.x, unit.y);
      const enemyCityHere =
        tile.cityHere !== null && cityById(state, tile.cityHere)!.ownerId !== playerId;
      if (tile.village || enemyCityHere) {
        actions.push({ type: "CAPTURE", unitId: unit.id });
      }
    }
    if (!unit.moved && !unit.attacked && unit.hp < unit.maxHp) {
      actions.push({ type: "RECOVER", unitId: unit.id });
    }
    if (!unit.moved && !unit.attacked && !unit.fortified && unit.embarked === null) {
      actions.push({ type: "FORTIFY", unitId: unit.id });
    }
    if (hasTech(player, "free_spirit") && !unit.moved && !unit.attacked) {
      actions.push({ type: "DISBAND", unitId: unit.id });
    }
    if (
      unit.embarked === "raft" &&
      hasTech(player, "sailing") &&
      player.stars >= NAVAL.ship.upgradeCost &&
      !unit.moved &&
      !unit.attacked
    ) {
      actions.push({ type: "UPGRADE_BOAT", unitId: unit.id });
    }
  }

  const myCities = citiesOf(state, playerId);
  const myCityIds = new Set(myCities.map((c) => c.id));

  for (const tile of state.tiles) {
    if (tile.cityId === null || !myCityIds.has(tile.cityId)) continue;
    harvestActionsFor(player.stars, player.techs, tile, actions);
  }

  for (const city of myCities) {
    const occupied = unitAt(state, city.x, city.y) !== undefined;
    if (occupied) continue;
    if (cityUnitCount(state, city.id) >= cityCapacity(city)) continue;
    for (const [unitType, def] of Object.entries(UNITS)) {
      if (!def.trainable) continue;
      if (def.cost > player.stars) continue;
      if (!hasTech(player, def.tech)) continue;
      actions.push({ type: "TRAIN", cityId: city.id, unitType: unitType as UnitType });
    }
  }

  const numCities = myCities.length;
  for (const tech of TECHS) {
    if (player.techs.includes(tech.id)) continue;
    if (tech.requires && !player.techs.includes(tech.requires)) continue;
    if (techCost(tech.id, numCities) > player.stars) continue;
    actions.push({ type: "RESEARCH", techId: tech.id });
  }

  actions.push({ type: "END_TURN" });
  return actions;
}

function harvestActionsFor(
  stars: number,
  techs: string[],
  tile: Tile,
  actions: Action[],
): void {
  if (tile.village || tile.cityHere !== null) return;

  if (tile.resource && tile.resource in HARVEST_DEFS) {
    const def = HARVEST_DEFS[tile.resource as keyof typeof HARVEST_DEFS];
    if (techs.includes(def.tech) && stars >= def.cost) {
      actions.push({ type: "HARVEST", x: tile.x, y: tile.y });
    }
  }

  if (tile.building === null) {
    for (const [name, def] of Object.entries(BUILDING_DEFS)) {
      if (def.terrain !== tile.terrain) continue;
      if ("needsResource" in def && def.needsResource !== tile.resource) continue;
      if (name === "lumber_hut" && tile.resource !== null) continue;
      if (!techs.includes(def.tech) || stars < def.cost) continue;
      actions.push({ type: "BUILD", x: tile.x, y: tile.y, building: name as keyof typeof BUILDING_DEFS });
    }
  }
}

export { REWARD_STARS_AMOUNT };
