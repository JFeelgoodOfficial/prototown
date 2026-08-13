import type { GameState, Unit, City, Tile, RuinRewardKind, PlayerState } from "./state";
import {
  cloneState,
  tileAt,
  unitById,
  cityById,
  playerById,
  citiesOf,
  unitsOf,
  hasTech,
  neighbors,
  idx,
  isPlayable,
  disk,
  dist,
  planetOf,
} from "./state";
import type { Action } from "./actions";
import { resolveCombat, unitRange } from "./combat";
import { terrainOpenTo } from "./movement";
import { computeVisibility } from "./fog";
import { claimTerritory } from "./mapgen";
import { updateWinState } from "./win";
import { playerScore } from "./score";
import { addPopulation, playerIncome } from "./economy";
import { nextInt } from "./rng";
import { UNITS, NAVAL } from "../data/units";
import { TERRAIN } from "../data/terrain";
import { techCost, TECHS, techAvailable } from "../data/techs";
import { tribeById } from "../data/tribes";
import {
  HARVEST_DEFS,
  BUILDING_DEFS,
  CITY_IMPROVEMENTS,
  RECOVER_HEAL,
  RECOVER_HEAL_OWN_TERRITORY,
  REWARD_STARS_AMOUNT,
  REWARD_POPULATION_AMOUNT,
  VETERAN_KILLS,
  VETERAN_HP_BONUS,
  RUIN_STARS,
  RUIN_POPULATION,
  RUIN_MAP_RADIUS,
  SURVEY_SITES,
  SURVEY_RADIUS,
} from "../data/constants";

/**
 * Apply one action for the current player and return the new state.
 * Callers are expected to pass actions from computeLegalActions; this
 * function throws on structurally invalid input.
 */
export function applyAction(prev: GameState, action: Action): GameState {
  const state = cloneState(prev);
  const player = playerById(state, state.currentPlayerId);
  state.lastRuinReward = null;

  switch (action.type) {
    case "MOVE": {
      const unit = mustUnit(state, action.unitId);
      const to = tileAt(state, action.x, action.y);
      const toWater = TERRAIN[to.terrain].water;
      if (unit.embarked === null && toWater) {
        // Boarding happens on the port tile itself (movement enforces it).
        // A player who knows Sailing puts out a Ship directly, so the tech
        // pays off at the dock instead of only as a paid refit.
        unit.embarked = hasTech(player, "sailing") ? "ship" : "raft";
      } else if (unit.embarked !== null && !toWater) {
        unit.embarked = null;
      }
      unit.x = action.x;
      unit.y = action.y;
      unit.moved = true;
      unit.fortified = false; // leaving the position gives up the dug-in bonus
      if (to.ruin) claimRuin(state, unit, to);
      computeVisibility(state, player);
      break;
    }

    case "ATTACK": {
      const attacker = mustUnit(state, action.unitId);
      const defender = mustUnit(state, action.targetId);
      const result = resolveCombat(state, attacker, defender);

      defender.hp -= result.damageToDefender;
      attacker.hp -= result.damageToAttacker;
      attacker.moved = true;
      attacker.attacked = true;
      attacker.fortified = false; // swinging out of the position breaks the dig-in

      if (result.defenderDies) {
        state.units = state.units.filter((u) => u.id !== defender.id);
        attacker.kills += 1;
        maybePromote(attacker);
        // melee attackers advance into the vacated tile when they can stand on it
        if (unitRange(attacker) === 1 && canOccupy(state, attacker, defender.x, defender.y)) {
          attacker.x = defender.x;
          attacker.y = defender.y;
        }
        computeVisibility(state, player);
        updateWinState(state);
      } else if (result.attackerDies) {
        state.units = state.units.filter((u) => u.id !== attacker.id);
        const def = mustUnit(state, action.targetId);
        def.kills += 1;
        maybePromote(def);
        updateWinState(state);
      }
      break;
    }

    case "CAPTURE": {
      const unit = mustUnit(state, action.unitId);
      const tile = tileAt(state, unit.x, unit.y);
      unit.moved = true;
      unit.attacked = true;

      if (tile.village) {
        tile.village = false;
        const tribe = tribeById(player.tribeId);
        const nameIdx = citiesOf(state, player.id).length % tribe.cityNames.length;
        const city: City = {
          id: state.nextId++,
          x: unit.x,
          y: unit.y,
          ownerId: player.id,
          name: tribe.cityNames[nameIdx],
          level: 1,
          population: 0,
          isCapital: false,
          walls: false,
          workshop: false,
          parks: 0,
          spaceStation: false,
          borderRadius: 1,
          pendingReward: null,
        };
        state.cities.push(city);
        tile.cityHere = city.id;
        claimTerritory(state, city);
        unit.homeCityId = city.id;
      } else if (tile.cityHere !== null) {
        const city = cityById(state, tile.cityHere)!;
        for (const u of unitsOf(state, city.ownerId)) {
          if (u.homeCityId === city.id) u.homeCityId = null;
        }
        city.ownerId = player.id;
        city.pendingReward = null;
        unit.homeCityId = city.id;
        updateWinState(state);
      }
      computeVisibility(state, player);
      break;
    }

    case "RECOVER": {
      const unit = mustUnit(state, action.unitId);
      const tile = tileAt(state, unit.x, unit.y);
      const ownTerritory =
        tile.cityId !== null && cityById(state, tile.cityId)?.ownerId === unit.ownerId;
      unit.hp = Math.min(unit.maxHp, unit.hp + (ownTerritory ? RECOVER_HEAL_OWN_TERRITORY : RECOVER_HEAL));
      unit.moved = true;
      unit.attacked = true;
      break;
    }

    case "FORTIFY": {
      const unit = mustUnit(state, action.unitId);
      unit.fortified = true;
      unit.moved = true;
      unit.attacked = true;
      break;
    }

    case "DISBAND": {
      const unit = mustUnit(state, action.unitId);
      player.stars += Math.floor(UNITS[unit.type].cost / 2);
      state.units = state.units.filter((u) => u.id !== unit.id);
      break;
    }

    case "UPGRADE_BOAT": {
      const unit = mustUnit(state, action.unitId);
      player.stars -= NAVAL.ship.upgradeCost;
      unit.embarked = "ship";
      break;
    }

    case "LAUNCH": {
      const unit = mustUnit(state, action.unitId);
      unit.embarked = "orbit";
      unit.moved = true;
      unit.attacked = true;
      unit.fortified = false;
      break;
    }

    case "LAND": {
      const unit = mustUnit(state, action.unitId);
      unit.embarked = null;
      unit.x = action.x;
      unit.y = action.y;
      unit.moved = true;
      unit.attacked = true;
      unit.fortified = false;
      const to = tileAt(state, action.x, action.y);
      if (to.ruin) claimRuin(state, unit, to);
      computeVisibility(state, player);
      break;
    }

    case "HARVEST": {
      const tile = tileAt(state, action.x, action.y);
      if (!tile.resource || !(tile.resource in HARVEST_DEFS)) throw new Error("no harvestable resource");
      const def = HARVEST_DEFS[tile.resource as keyof typeof HARVEST_DEFS];
      player.stars -= def.cost;
      player.stars += def.stars;
      tile.resource = null;
      // a whale is a payday, not a settlement — it feeds nobody
      if (def.pop > 0) addPopulation(cityById(state, tile.cityId!)!, def.pop);
      break;
    }

    case "BUILD": {
      const tile = tileAt(state, action.x, action.y);
      const def = BUILDING_DEFS[action.building];
      player.stars -= def.cost;
      tile.building = action.building;
      tile.resource = null;
      addPopulation(cityById(state, tile.cityId!)!, def.pop);
      break;
    }

    case "TRAIN": {
      const city = cityById(state, action.cityId)!;
      const def = UNITS[action.unitType];
      player.stars -= def.cost;
      const unit: Unit = {
        id: state.nextId++,
        type: action.unitType,
        ownerId: player.id,
        homeCityId: city.id,
        x: city.x,
        y: city.y,
        hp: def.hp,
        maxHp: def.hp,
        kills: 0,
        veteran: false,
        moved: true,
        attacked: true,
        fortified: false,
        embarked: null,
      };
      state.units.push(unit);
      break;
    }

    case "BUILD_IMPROVEMENT": {
      const city = cityById(state, action.cityId)!;
      player.stars -= CITY_IMPROVEMENTS[action.improvement].cost;
      if (action.improvement === "walls") city.walls = true;
      else if (action.improvement === "station") {
        city.spaceStation = true;
        orbitalSurvey(state, player, city);
      } else city.parks += 1;
      break;
    }

    case "RESEARCH": {
      // the discount is read before the push, so Philosophy itself pays full price
      const discounted = hasTech(player, "philosophy");
      player.stars -= techCost(action.techId, citiesOf(state, player.id).length, discounted);
      player.techs.push(action.techId);
      break;
    }

    case "LAUNCH_NUKE": {
      const target = cityById(state, action.cityId)!;
      state.nukeLaunched = true;

      // The blast is the city tile plus its 8 neighbours. Any city caught in
      // it dies with the target, or its orphaned husk would keep rendering.
      const blast: Array<[number, number]> = [[target.x, target.y], ...neighbors(state, target.x, target.y)];
      const deadCityIds = new Set<number>();
      for (const [x, y] of blast) {
        const tile = tileAt(state, x, y);
        if (tile.terrain === "void") continue;
        if (tile.cityHere !== null) deadCityIds.add(tile.cityHere);
        tile.terrain = "crater";
        tile.resource = null;
        tile.building = null;
        tile.village = false;
        tile.ruin = false;
        tile.cityHere = null;
        tile.cityId = null;
      }

      state.units = state.units.filter((u) => dist(state, u.x, u.y, target.x, target.y) > 1);
      state.cities = state.cities.filter((c) => !deadCityIds.has(c.id));
      for (const tile of state.tiles) {
        if (tile.cityId !== null && deadCityIds.has(tile.cityId)) tile.cityId = null;
      }
      for (const u of state.units) {
        if (u.homeCityId !== null && deadCityIds.has(u.homeCityId)) u.homeCityId = null;
      }

      computeVisibility(state, player);
      updateWinState(state);
      break;
    }

    case "CHOOSE_REWARD": {
      const city = cityById(state, action.cityId)!;
      city.pendingReward = null;
      applyReward(state, city, action.reward);
      computeVisibility(state, player);
      break;
    }

    case "END_TURN": {
      advanceTurn(state);
      break;
    }
  }

  return state;
}

function mustUnit(state: GameState, id: number): Unit {
  const u = unitById(state, id);
  if (!u) throw new Error(`unit ${id} not found`);
  return u;
}

function maybePromote(unit: Unit): void {
  if (!unit.veteran && unit.type !== "giant" && unit.kills >= VETERAN_KILLS) {
    unit.veteran = true;
    unit.maxHp += VETERAN_HP_BONUS;
    unit.hp = unit.maxHp;
  }
}

/** Can this unit stand on (x,y) after a kill: terrain class matches its mode. */
function canOccupy(state: GameState, unit: Unit, x: number, y: number): boolean {
  const tile = tileAt(state, x, y);
  const terr = TERRAIN[tile.terrain];
  if (terr.water) return unit.embarked !== null;
  if (unit.embarked !== null) return false;
  return terrainOpenTo(state, unit.ownerId)(tile.terrain);
}

function applyReward(state: GameState, city: City, reward: string): void {
  const player = playerById(state, city.ownerId);
  switch (reward) {
    case "workshop":
      city.workshop = true;
      break;
    case "explorer": {
      // an explorer wanders out from the city revealing terrain
      const range = disk(state, city.x, city.y, 4);
      for (let i = 0; i < 6; i++) {
        const [x, y] = range[nextInt(state, range.length)];
        for (const [nx, ny] of disk(state, x, y, 1)) {
          if (isPlayable(state, nx, ny)) player.explored[idx(state, nx, ny)] = 1;
        }
      }
      break;
    }
    case "walls":
      city.walls = true;
      break;
    case "stars":
      player.stars += REWARD_STARS_AMOUNT;
      break;
    case "border_growth":
      city.borderRadius = 2;
      claimTerritory(state, city);
      break;
    case "population":
      addPopulation(city, REWARD_POPULATION_AMOUNT);
      break;
    case "park":
      city.parks += 1;
      break;
    case "super_unit": {
      const spot = findSpawnSpot(state, city);
      if (spot) {
        const def = UNITS.giant;
        state.units.push({
          id: state.nextId++,
          type: "giant",
          ownerId: city.ownerId,
          homeCityId: city.id,
          x: spot[0],
          y: spot[1],
          hp: def.hp,
          maxHp: def.hp,
          kills: 0,
          veteran: false,
          moved: true,
          attacked: true,
          fortified: false,
        embarked: null,
        });
      }
      break;
    }
    default:
      throw new Error(`unknown reward ${reward}`);
  }
}

/**
 * A unit walks into a ruin and takes what is there. The draw comes from the
 * seeded RNG in state, so a replay of the same game finds the same things.
 */
function claimRuin(state: GameState, unit: Unit, tile: Tile): void {
  tile.ruin = false;
  const player = playerById(state, unit.ownerId);
  const canPromote = !unit.veteran && unit.type !== "giant";
  const ownCities = citiesOf(state, player.id);
  const researchable = TECHS.filter(
    (t) =>
      techAvailable(state.mapType, t.id) &&
      !player.techs.includes(t.id) &&
      (!t.requires || player.techs.includes(t.requires)),
  );

  const options: RuinRewardKind[] = ["stars", "map"];
  if (researchable.length > 0) options.push("tech");
  if (canPromote) options.push("veteran");
  if (ownCities.length > 0) options.push("population");
  const kind = options[nextInt(state, options.length)];

  let label: string;
  switch (kind) {
    case "stars":
      player.stars += RUIN_STARS;
      label = `+${RUIN_STARS} stars`;
      break;
    case "tech": {
      const tech = researchable[nextInt(state, researchable.length)];
      player.techs.push(tech.id);
      label = `${tech.name} discovered`;
      break;
    }
    case "veteran":
      unit.veteran = true;
      unit.maxHp += VETERAN_HP_BONUS;
      unit.hp = unit.maxHp;
      label = "Veteran!";
      break;
    case "population": {
      // the closest city takes in whoever was sheltering here
      let best = ownCities[0];
      for (const c of ownCities) {
        if (dist(state, unit.x, unit.y, c.x, c.y) < dist(state, unit.x, unit.y, best.x, best.y)) best = c;
      }
      addPopulation(best, RUIN_POPULATION);
      label = `${best.name} +${RUIN_POPULATION} pop`;
      break;
    }
    case "map": {
      for (const [x, y] of disk(state, unit.x, unit.y, RUIN_MAP_RADIUS)) {
        if (isPlayable(state, x, y)) player.explored[idx(state, x, y)] = 1;
      }
      label = "Maps found";
      break;
    }
  }
  state.lastRuinReward = { kind, x: unit.x, y: unit.y, playerId: player.id, label };
}

/**
 * A new Space Station photographs the twin world from orbit: a few survey
 * sites are revealed so the first landings have somewhere to aim. Draws come
 * from the state RNG, so replays survey the same places.
 */
function orbitalSurvey(state: GameState, player: PlayerState, city: City): void {
  const w = state.size * 6;
  const otherPlanet = planetOf(state, city.x) === 0 ? 1 : 0;
  for (let i = 0; i < SURVEY_SITES; i++) {
    const local = nextInt(state, w * state.size);
    const x = (local % w) + otherPlanet * w;
    const y = Math.floor(local / w);
    for (const [nx, ny] of disk(state, x, y, SURVEY_RADIUS)) {
      if (isPlayable(state, nx, ny)) player.explored[idx(state, nx, ny)] = 1;
    }
  }
}

function findSpawnSpot(state: GameState, city: City): [number, number] | null {
  const occupied = (x: number, y: number) => state.units.some((u) => u.x === x && u.y === y);
  if (!occupied(city.x, city.y)) return [city.x, city.y];
  for (const [nx, ny] of neighbors(state, city.x, city.y)) {
    const terr = TERRAIN[tileAt(state, nx, ny).terrain];
    if (!terr.water && !terr.impassable && !occupied(nx, ny)) return [nx, ny];
  }
  return null;
}

function advanceTurn(state: GameState): void {
  const order = state.players.map((p) => p.id);
  let i = order.indexOf(state.currentPlayerId);
  for (let step = 0; step < order.length; step++) {
    i = (i + 1) % order.length;
    if (i === 0) {
      // a full round has passed: snapshot everyone's score for the end-game graph
      state.scoreHistory.push(state.players.map((p) => playerScore(state, p.id)));
      state.turn += 1;
      updateWinState(state);
      if (state.winnerId !== null) return;
    }
    const candidate = playerById(state, order[i]);
    if (candidate.alive) {
      state.currentPlayerId = candidate.id;
      candidate.stars += playerIncome(state, candidate.id);
      for (const u of unitsOf(state, candidate.id)) {
        u.moved = false;
        u.attacked = false;
      }
      computeVisibility(state, candidate);
      return;
    }
  }
}
