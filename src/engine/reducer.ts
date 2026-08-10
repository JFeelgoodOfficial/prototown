import type { GameState, Unit, City } from "./state";
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
  inBounds,
} from "./state";
import type { Action } from "./actions";
import { resolveCombat, unitRange } from "./combat";
import { terrainOpenTo } from "./movement";
import { computeVisibility } from "./fog";
import { claimTerritory } from "./mapgen";
import { updateWinState } from "./win";
import { addPopulation, playerIncome } from "./economy";
import { nextInt } from "./rng";
import { UNITS, NAVAL } from "../data/units";
import { TERRAIN } from "../data/terrain";
import { techCost } from "../data/techs";
import { tribeById } from "../data/tribes";
import {
  HARVEST_DEFS,
  BUILDING_DEFS,
  RECOVER_HEAL,
  RECOVER_HEAL_OWN_TERRITORY,
  REWARD_STARS_AMOUNT,
  REWARD_POPULATION_AMOUNT,
  VETERAN_KILLS,
  VETERAN_HP_BONUS,
} from "../data/constants";

/**
 * Apply one action for the current player and return the new state.
 * Callers are expected to pass actions from computeLegalActions; this
 * function throws on structurally invalid input.
 */
export function applyAction(prev: GameState, action: Action): GameState {
  const state = cloneState(prev);
  const player = playerById(state, state.currentPlayerId);

  switch (action.type) {
    case "MOVE": {
      const unit = mustUnit(state, action.unitId);
      const from = tileAt(state, unit.x, unit.y);
      const to = tileAt(state, action.x, action.y);
      const toWater = TERRAIN[to.terrain].water;
      if (unit.embarked === null && toWater) {
        // Launching always happens at a port (movement enforces it). A port
        // belonging to a player who knows Sailing puts out a ship directly,
        // so the tech pays off at the dock instead of only as a paid refit.
        const fromPort = from.building === "port";
        unit.embarked = fromPort && hasTech(player, "sailing") ? "ship" : "raft";
      } else if (unit.embarked !== null && !toWater) {
        unit.embarked = null;
      }
      unit.x = action.x;
      unit.y = action.y;
      unit.moved = true;
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

    case "HARVEST": {
      const tile = tileAt(state, action.x, action.y);
      if (!tile.resource || !(tile.resource in HARVEST_DEFS)) throw new Error("no harvestable resource");
      const def = HARVEST_DEFS[tile.resource as keyof typeof HARVEST_DEFS];
      player.stars -= def.cost;
      tile.resource = null;
      addPopulation(cityById(state, tile.cityId!)!, def.pop);
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
        embarked: null,
      };
      state.units.push(unit);
      break;
    }

    case "RESEARCH": {
      player.stars -= techCost(action.techId, citiesOf(state, player.id).length);
      player.techs.push(action.techId);
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
      for (let i = 0; i < 6; i++) {
        const x = city.x + nextInt(state, 9) - 4;
        const y = city.y + nextInt(state, 9) - 4;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (inBounds(state, x + dx, y + dy)) player.explored[idx(state, x + dx, y + dy)] = 1;
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
          embarked: null,
        });
      }
      break;
    }
    default:
      throw new Error(`unknown reward ${reward}`);
  }
}

function findSpawnSpot(state: GameState, city: City): [number, number] | null {
  const occupied = (x: number, y: number) => state.units.some((u) => u.x === x && u.y === y);
  if (!occupied(city.x, city.y)) return [city.x, city.y];
  for (const [nx, ny] of neighbors(state, city.x, city.y)) {
    const terr = TERRAIN[tileAt(state, nx, ny).terrain];
    if (!terr.water && !occupied(nx, ny)) return [nx, ny];
  }
  return null;
}

function advanceTurn(state: GameState): void {
  const order = state.players.map((p) => p.id);
  let i = order.indexOf(state.currentPlayerId);
  for (let step = 0; step < order.length; step++) {
    i = (i + 1) % order.length;
    if (i === 0) {
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
