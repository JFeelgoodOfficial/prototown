import type { GameState, Tile, City, Unit } from "./state";
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
  isBurning,
  isPlayable,
  planetOf,
} from "./state";
import type { Action } from "./actions";
import { reachableTiles, terrainOpenTo } from "./movement";
import { TERRAIN } from "../data/terrain";
import { unitAtk, unitRange } from "./combat";
import { watchedMask } from "./fog";
import {
  HARVEST_DEFS,
  BUILDING_DEFS,
  CITY_IMPROVEMENTS,
  MAX_PARKS_PER_CITY,
  REWARD_STARS_AMOUNT,
  FOUND_CITY_COST,
  NAVAL_TOWER_RANGE,
  NUKE_DELIVERY_RANGE,
  FIRESTORM_LENGTH,
  FIRESTORM_COST,
  buildingFits,
  type CityImprovement,
} from "../data/constants";
import { UNITS, NAVAL, isAir, type UnitType } from "../data/units";
import { TECHS, techCost, techAvailable } from "../data/techs";
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
    // Medics and scouts carry no weapon at all, so they are never offered a swing.
    if (!unit.attacked && unit.embarked !== "orbit" && unitAtk(unit) > 0) {
      const range = unitRange(unit);
      for (const enemy of state.units) {
        if (enemy.ownerId === playerId) continue;
        if (enemy.embarked === "orbit") continue; // out of everyone's reach
        if (dist(state, unit.x, unit.y, enemy.x, enemy.y) > range) continue;
        if (!watched[idx(state, enemy.x, enemy.y)]) continue;
        actions.push({ type: "ATTACK", unitId: unit.id, targetId: enemy.id });
      }
    }
    // A firestorm run is flown down one of the eight headings, from the tile
    // beside the plane outwards. Fog is no bar: fire falls where it is aimed,
    // and what it finds there is found out afterwards.
    if (canFlyFirestorm(state, unit)) {
      for (const [dx, dy] of HEADINGS) {
        const [ax, ay] = [unit.x + dx, unit.y + dy];
        if (firestormLine(state, unit.x, unit.y, ax, ay).length === 0) continue;
        actions.push({ type: "FIRESTORM", unitId: unit.id, x: ax, y: ay });
      }
    }
    // Aircraft can overfly a village all day; taking it needs boots on the ground.
    if (!unit.moved && !unit.attacked && unit.embarked === null && !isAir(unit.type)) {
      const tile = tileAt(state, unit.x, unit.y);
      const enemyCityHere =
        tile.cityHere !== null && cityById(state, tile.cityHere)!.ownerId !== playerId;
      if (tile.village || enemyCityHere) {
        actions.push({ type: "CAPTURE", unitId: unit.id });
      }
      if (player.stars >= FOUND_CITY_COST && canFoundCityOn(tile)) {
        actions.push({ type: "FOUND_CITY", unitId: unit.id });
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
    // Launch: a fresh unit standing on a friendly spaceport whose city has a
    // Space Station may lift off, spending its turn getting into orbit.
    if (!unit.moved && !unit.attacked && unit.embarked === null) {
      const tile = tileAt(state, unit.x, unit.y);
      if (tile.building === "spaceport" && tile.cityId !== null) {
        const padCity = cityById(state, tile.cityId);
        if (padCity && padCity.ownerId === playerId && padCity.spaceStation) {
          actions.push({ type: "LAUNCH", unitId: unit.id });
        }
      }
    }
    // Land: next turn the orbiting unit comes down on any explored, open,
    // unoccupied land tile of the other planet — or back onto its own pad,
    // so a launch with nowhere to go is never a stranding.
    if (unit.embarked === "orbit" && !unit.moved) {
      actions.push({ type: "LAND", unitId: unit.id, x: unit.x, y: unit.y });
      const canEnter = terrainOpenTo(state, playerId);
      const homePlanet = planetOf(state, unit.x);
      for (const t of state.tiles) {
        if (planetOf(state, t.x) === homePlanet) continue;
        if (player.explored[idx(state, t.x, t.y)] !== 1) continue;
        if (TERRAIN[t.terrain].water || !canEnter(t.terrain)) continue;
        if (unitAt(state, t.x, t.y)) continue;
        actions.push({ type: "LAND", unitId: unit.id, x: t.x, y: t.y });
      }
    }
  }

  const myCities = citiesOf(state, playerId);
  const myCityIds = new Set(myCities.map((c) => c.id));

  for (const tile of state.tiles) {
    if (tile.cityId === null || !myCityIds.has(tile.cityId)) continue;
    harvestActionsFor(player.stars, player.techs, tile, actions);
    if (tile.building === "naval_tower") bombardActionsFor(state, playerId, tile, watched, actions);
  }

  for (const city of myCities) {
    const occupied = unitAt(state, city.x, city.y) !== undefined;
    if (occupied) continue;
    // Nobody musters onto burning ground: a unit trained here would walk out
    // of the gate straight into the fire.
    if (isBurning(state, tileAt(state, city.x, city.y))) continue;
    if (cityUnitCount(state, city.id) >= cityCapacity(state, city)) continue;
    for (const [unitType, def] of Object.entries(UNITS)) {
      if (!def.trainable) continue;
      if (def.cost > player.stars) continue;
      if (!hasTech(player, def.tech)) continue;
      // planes need an airfield, medics a hospital, somewhere in the city's land
      if (def.requiresBuilding && !cityHasBuilding(state, city, def.requiresBuilding)) continue;
      actions.push({ type: "TRAIN", cityId: city.id, unitType: unitType as UnitType });
    }
  }

  // Separate from the training loop above: buying walls is masonry, not
  // recruitment, so a unit standing on the city tile must not block it.
  for (const city of myCities) {
    for (const [name, def] of Object.entries(CITY_IMPROVEMENTS)) {
      if (!hasTech(player, def.tech) || player.stars < def.cost) continue;
      if (name === "walls" && city.walls) continue;
      if (name === "park" && city.parks >= MAX_PARKS_PER_CITY) continue;
      if (name === "station" && (city.spaceStation || !cityHasBuilding(state, city, "spaceport"))) continue;
      actions.push({
        type: "BUILD_IMPROVEMENT",
        cityId: city.id,
        improvement: name as CityImprovement,
      });
    }
  }

  const numCities = myCities.length;
  const discounted = hasTech(player, "philosophy");
  for (const tech of TECHS) {
    if (!techAvailable(state.mapType, tech.id)) continue;
    if (player.techs.includes(tech.id)) continue;
    if (tech.requires && !player.techs.includes(tech.requires)) continue;
    if (techCost(tech.id, numCities, discounted) > player.stars) continue;
    actions.push({ type: "RESEARCH", techId: tech.id });
  }

  // The game's single nuke: a bomb rides to its target under a Bomber and
  // nothing else. It needs a plane with its sortie still in hand, an enemy city
  // in live sight within that plane's reach, and nobody to have fired it yet.
  if (!state.nukeLaunched && hasTech(player, "atomic_theory")) {
    const bombers = unitsOf(state, playerId).filter(canCarryNuke);
    for (const bomber of bombers) {
      for (const city of state.cities) {
        if (city.ownerId === playerId) continue;
        if (!watched[idx(state, city.x, city.y)]) continue;
        if (dist(state, bomber.x, bomber.y, city.x, city.y) > NUKE_DELIVERY_RANGE) continue;
        actions.push({ type: "LAUNCH_NUKE", unitId: bomber.id, cityId: city.id });
      }
    }
  }

  actions.push({ type: "END_TURN" });
  return actions;
}

/**
 * Whether this unit could fly the bomb out right now: a Bomber, on the wing
 * rather than riding a capsule, with its one strike of the turn unspent. Having
 * already moved is no bar — flying in and dropping is one sortie.
 */
export function canCarryNuke(unit: Unit): boolean {
  return unit.type === "bomber" && unit.embarked === null && !unit.attacked;
}

/** The eight headings a firestorm run can be flown along. */
const HEADINGS: Array<[number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/**
 * The tiles a firestorm run burns: up to FIRESTORM_LENGTH of them, starting at
 * (x, y) and carrying on along the heading that leads there from the plane.
 *
 * The line is walked one step at a time and stops the moment the next step is
 * off the map, on void, or — where the grid is a folded-up sphere and a step
 * across a face seam is not the neighbour it looks like — no longer adjacent to
 * the tile before it. A run near a seam is simply a short one; nothing is ever
 * set alight on the far side of the world.
 */
export function firestormLine(
  state: GameState,
  fromX: number,
  fromY: number,
  x: number,
  y: number,
): Array<[number, number]> {
  const dx = x - fromX;
  const dy = y - fromY;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return [];
  const out: Array<[number, number]> = [];
  let px = fromX;
  let py = fromY;
  let cx = x;
  let cy = y;
  while (out.length < FIRESTORM_LENGTH) {
    if (!isPlayable(state, cx, cy)) break;
    if (dist(state, px, py, cx, cy) !== 1) break;
    out.push([cx, cy]);
    px = cx;
    py = cy;
    cx += dx;
    cy += dy;
  }
  return out;
}

/**
 * Whether this unit could fly a firestorm run right now. The same plane and the
 * same unspent strike the nuke asks for — the bomb bays hold one load or the
 * other, never both in a turn.
 */
export function canFlyFirestorm(state: GameState, unit: Unit): boolean {
  const player = playerById(state, unit.ownerId);
  return (
    unit.type === "bomber" &&
    unit.embarked === null &&
    !unit.attacked &&
    hasTech(player, "incendiaries") &&
    player.stars >= FIRESTORM_COST
  );
}

/** Whether the city's territory contains this building (any one of them will do). */
function cityHasBuilding(state: GameState, city: City, building: string): boolean {
  return state.tiles.some((t) => t.cityId === city.id && t.building === building);
}

/**
 * Ground a settling party may found a town on: open land nobody has claimed,
 * with no village or ruin already standing there. Owning no territory is the
 * whole test — every city's borders reach at least one tile out, so a new town
 * can never be squeezed up against an old one.
 */
export function canFoundCityOn(tile: Tile): boolean {
  if (tile.cityId !== null || tile.village || tile.cityHere !== null || tile.ruin) return false;
  const terr = TERRAIN[tile.terrain];
  return !terr.water && !terr.impassable;
}

/** Shots a Naval Tower may take this turn: enemy vessels in sight, in range. */
function bombardActionsFor(
  state: GameState,
  playerId: number,
  tower: Tile,
  watched: number[],
  actions: Action[],
): void {
  if (tower.firedTurn === state.turn) return; // the guns fire once a turn
  for (const enemy of state.units) {
    if (enemy.ownerId === playerId) continue;
    // shore guns are for shipping: anything ashore or in orbit is not their business
    if (enemy.embarked !== "raft" && enemy.embarked !== "ship") continue;
    if (dist(state, tower.x, tower.y, enemy.x, enemy.y) > NAVAL_TOWER_RANGE) continue;
    if (!watched[idx(state, enemy.x, enemy.y)]) continue;
    actions.push({ type: "BOMBARD", x: tower.x, y: tower.y, targetId: enemy.id });
  }
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
      if (!buildingFits(def, tile.terrain, tile.resource, tile.tilled)) continue;
      if (!techs.includes(def.tech) || stars < def.cost) continue;
      actions.push({ type: "BUILD", x: tile.x, y: tile.y, building: name as keyof typeof BUILDING_DEFS });
    }
  }
}

export { REWARD_STARS_AMOUNT };
