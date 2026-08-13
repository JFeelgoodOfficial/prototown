import type { GameState, Unit } from "../engine/state";
import { unitById, cityById, tileAt, playerById, dist, idx, neighbors, citiesOf, unitsOf, hasTech, planetOf } from "../engine/state";
import type { Action } from "../engine/actions";
import { resolveCombat } from "../engine/combat";
import { UNITS } from "../data/units";
import { TECH_BY_ID } from "../data/techs";
import { TERRAIN } from "../data/terrain";
import { HARVEST_DEFS } from "../data/constants";
import { cityUnitCount, cityCapacity } from "../engine/economy";

export interface AiPersonality {
  /** multiplies attack/military scores; 1 = balanced */
  aggression: number;
  /** multiplies the pull toward villages and enemy cities */
  expansion: number;
  /** multiplies harvesting and building */
  economy: number;
  /** multiplies research */
  research: number;
  /**
   * How many of the best-looking actions get played out and judged by the
   * resulting position. 0 keeps the agent purely greedy.
   */
  lookahead: number;
  /**
   * How many of those candidates also get the strongest rival's best reply
   * played out against them, so a move into a killing blow is seen as one.
   * 0 stops at the agent's own move.
   */
  replies: number;
}

export const BALANCED: AiPersonality = {
  aggression: 1,
  expansion: 1,
  economy: 1,
  research: 1,
  lookahead: 3,
  replies: 0,
};

/**
 * Static worth of a position to one player: what they hold, what it is worth
 * militarily, and how exposed it is. Used to judge candidate actions by their
 * outcome rather than by the action alone.
 */
export function evaluatePosition(state: GameState, playerId: number): number {
  let value = 0;

  for (const c of state.cities) {
    const mine = c.ownerId === playerId;
    // walls and parks are counted here as well as scored as actions, or the
    // lookahead would only ever see the stars leaving and veto buying them
    const worth = 120 + c.level * 40 + (c.isCapital ? 60 : 0) + (c.walls ? 25 : 0) + c.parks * 45;
    value += mine ? worth : -worth * 0.7;
  }

  for (const u of state.units) {
    const def = UNITS[u.type];
    const health = u.hp / u.maxHp;
    const worth = (12 + def.cost * 6) * (0.5 + 0.5 * health);
    value += u.ownerId === playerId ? worth : -worth * 0.8;
  }

  const player = playerById(state, playerId);
  value += player.stars * 1.5;
  for (const techId of player.techs) value += TECH_BY_ID[techId].tier * 8;

  // Standing next to a village or an enemy city is worth something on its own:
  // it is a capture waiting to happen.
  for (const u of unitsOf(state, playerId)) {
    const tile = tileAt(state, u.x, u.y);
    if (tile.village) value += 70;
    if (tile.cityHere !== null && cityById(state, tile.cityHere)?.ownerId !== playerId) value += 90;
    if (tile.ruin) value += 40;
  }

  return value;
}

interface Objective {
  x: number;
  y: number;
  weight: number;
}

/**
 * Known objectives for a player: enemy cities and neutral villages on
 * explored tiles, plus the nearest unexplored frontier as a fallback.
 */
export function objectivesFor(state: GameState, playerId: number): Objective[] {
  const player = playerById(state, playerId);
  const out: Objective[] = [];
  for (const t of state.tiles) {
    if (player.explored[idx(state, t.x, t.y)] !== 1) continue;
    if (t.village) out.push({ x: t.x, y: t.y, weight: 3 });
    else if (t.cityHere !== null) {
      const c = cityById(state, t.cityHere);
      if (c && c.ownerId !== playerId) out.push({ x: t.x, y: t.y, weight: 2.5 });
    }
  }
  // frontier: unexplored tiles adjacent to explored ones
  const seaworthy = hasTech(player, "sailing") || wantsSeafaring(state, playerId);
  for (const t of state.tiles) {
    if (player.explored[idx(state, t.x, t.y)] === 1) continue;
    const terr = TERRAIN[t.terrain];
    if (terr.impassable) continue;
    if (terr.water) {
      // the sea is only worth exploring once boats are (or need to become) an option
      if (seaworthy) out.push({ x: t.x, y: t.y, weight: 0.5 });
      continue;
    }
    out.push({ x: t.x, y: t.y, weight: 0.8 });
  }
  return out;
}

/**
 * True when everything left worth having — a neutral village, an enemy city,
 * unexplored land — lies across water rather than within walking distance.
 * That is the moment ports and sailing stop being a luxury.
 */
/** Planets where the player has any unit or city. {0} on single-world maps. */
function planetsOf(state: GameState, playerId: number): Set<number> {
  const out = new Set<number>();
  for (const u of unitsOf(state, playerId)) out.add(planetOf(state, u.x));
  for (const c of citiesOf(state, playerId)) out.add(planetOf(state, c.x));
  return out;
}

export function wantsSeafaring(state: GameState, playerId: number): boolean {
  const player = playerById(state, playerId);
  // The twin world is reached by rocket, not raft: goals there must not read
  // as "overseas" or every tribe would buy boats forever.
  const myPlanets = planetsOf(state, playerId);

  // Everything a land unit could walk to from any of our units or cities.
  const region = new Set<number>();
  const queue: Array<[number, number]> = [];
  const push = (x: number, y: number) => {
    const key = idx(state, x, y);
    if (region.has(key)) return;
    const terr = TERRAIN[state.tiles[key].terrain];
    if (terr.water || terr.impassable) return;
    region.add(key);
    queue.push([x, y]);
  };
  for (const u of unitsOf(state, playerId)) push(u.x, u.y);
  for (const c of citiesOf(state, playerId)) push(c.x, c.y);
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [nx, ny] of neighbors(state, x, y)) push(nx, ny);
  }

  let overseas = false;
  for (const t of state.tiles) {
    if (!myPlanets.has(planetOf(state, t.x))) continue;
    const i = idx(state, t.x, t.y);
    const terr = TERRAIN[t.terrain];
    const explored = player.explored[i] === 1;
    const worthwhile =
      (explored && t.village) ||
      (explored && t.cityHere !== null && cityById(state, t.cityHere)?.ownerId !== playerId) ||
      (!explored && !terr.water && !terr.impassable);
    if (!worthwhile) continue;
    if (region.has(i)) return false; // something to walk to first
    overseas = true;
  }
  return overseas;
}

/**
 * True when the tribe should be reaching for the stars: a twin-globe map,
 * no foothold on the other world yet, and something over there worth having —
 * before the orbital survey the whole planet is unexplored, so it always is.
 */
export function wantsSpaceTravel(state: GameState, playerId: number): boolean {
  if (state.mapType !== "twin_globes") return false;
  const player = playerById(state, playerId);
  const myPlanets = planetsOf(state, playerId);
  for (const t of state.tiles) {
    if (myPlanets.has(planetOf(state, t.x))) continue;
    if (player.explored[idx(state, t.x, t.y)] !== 1) return true;
    if (t.village) return true;
    if (t.cityHere !== null && cityById(state, t.cityHere)?.ownerId !== playerId) return true;
  }
  return false;
}

/** Anything on the other planet (seen from `homePlanet`) worth flying to. */
function otherWorldWorthwhile(state: GameState, playerId: number, homePlanet: number): boolean {
  const player = playerById(state, playerId);
  for (const t of state.tiles) {
    if (planetOf(state, t.x) === homePlanet) continue;
    if (player.explored[idx(state, t.x, t.y)] !== 1) return true;
    if (t.village) return true;
    if (t.cityHere !== null && cityById(state, t.cityHere)?.ownerId !== playerId) return true;
  }
  return false;
}

export function scoreAction(
  state: GameState,
  playerId: number,
  action: Action,
  objectives: Objective[],
  personality: AiPersonality,
): number {
  const player = playerById(state, playerId);

  switch (action.type) {
    case "ATTACK": {
      const attacker = unitById(state, action.unitId);
      const defender = unitById(state, action.targetId);
      if (!attacker || !defender) return -Infinity;
      const r = resolveCombat(state, attacker, defender);
      let score = r.damageToDefender * 3 - r.damageToAttacker * 2;
      if (r.defenderDies) score += 25 + UNITS[defender.type].cost * 8;
      if (r.attackerDies) score -= 30 + UNITS[attacker.type].cost * 6;
      // finishing blows near our cities are extra valuable
      const nearOwnCity = citiesOf(state, playerId).some((c) => dist(state, defender.x, defender.y, c.x, c.y) <= 2);
      if (nearOwnCity) score += 10;
      return score * personality.aggression;
    }

    case "CAPTURE":
      return 1000 * personality.expansion;

    case "MOVE": {
      const unit = unitById(state, action.unitId);
      if (!unit) return -Infinity;
      const best = nearestObjective(state, unit, objectives);
      if (!best) return 0;
      const before = dist(state, unit.x, unit.y, best.x, best.y);
      const after = dist(state, action.x, action.y, best.x, best.y);
      let score = (before - after) * 8 * best.weight * personality.expansion;
      // landing on a village/city tile sets up next-turn capture
      const destTile = tileAt(state, action.x, action.y);
      if (destTile.village) score += 60 * personality.expansion;
      if (destTile.cityHere !== null) {
        const c = cityById(state, destTile.cityHere);
        if (c && c.ownerId !== playerId) score += 60 * personality.expansion;
      }
      // wounded units prefer own territory
      if (unit.hp < unit.maxHp / 2) {
        const own = destTile.cityId !== null && cityById(state, destTile.cityId)?.ownerId === playerId;
        if (own) score += 12;
      }
      // Stepping aboard at a port is progress in itself when the goal lies
      // overseas — by straight-line distance it usually looks like a detour.
      if (
        unit.embarked === null &&
        destTile.building === "port" &&
        cityById(state, destTile.cityId ?? -1)?.ownerId === playerId &&
        wantsSeafaring(state, playerId)
      ) {
        score += 30;
      }
      // As is walking onto our own launch pad when the other world beckons.
      if (
        unit.embarked === null &&
        destTile.building === "spaceport" &&
        cityById(state, destTile.cityId ?? -1)?.ownerId === playerId &&
        wantsSpaceTravel(state, playerId)
      ) {
        score += 30;
      }
      return score;
    }

    case "FORTIFY": {
      const unit = unitById(state, action.unitId);
      if (!unit) return -Infinity;
      // Worth doing where the ground matters: holding a settlement, or with
      // enemies close enough to attack next turn.
      const tile = tileAt(state, unit.x, unit.y);
      const holdsSettlement =
        tile.cityHere !== null && cityById(state, tile.cityHere)?.ownerId === playerId;
      const threatened = state.units.some(
        (e) => e.ownerId !== playerId && dist(state, e.x, e.y, unit.x, unit.y) <= 2,
      );
      if (!threatened && !holdsSettlement) return 1;
      return (holdsSettlement ? 26 : 0) + (threatened ? 20 : 0);
    }

    case "RECOVER": {
      const unit = unitById(state, action.unitId);
      if (!unit) return -Infinity;
      const missing = unit.maxHp - unit.hp;
      return unit.hp < unit.maxHp * 0.6 ? missing * 2.5 : 2;
    }

    case "HARVEST": {
      const def = HARVEST_DEFS[tileAt(state, action.x, action.y).resource as keyof typeof HARVEST_DEFS];
      // a whale pays stars rather than growth, so it is worth taking regardless
      const windfall = def ? def.stars * 4 : 0;
      return (55 + windfall) * personality.economy;
    }

    case "BUILD": {
      // the first port is the way off the island once the land runs out
      if (action.building === "port" && wantsSeafaring(state, playerId)) {
        const hasPort = state.tiles.some(
          (t) => t.building === "port" && t.cityId !== null && cityById(state, t.cityId)?.ownerId === playerId,
        );
        if (!hasPort) return 90 * personality.economy;
      }
      // and the first spaceport is the way off the planet
      if (action.building === "spaceport" && wantsSpaceTravel(state, playerId)) {
        const hasPad = state.tiles.some(
          (t) => t.building === "spaceport" && t.cityId !== null && cityById(state, t.cityId)?.ownerId === playerId,
        );
        if (!hasPad) return 90 * personality.economy;
      }
      return 50 * personality.economy;
    }

    case "TRAIN": {
      const city = cityById(state, action.cityId);
      if (!city) return -Infinity;
      const army = unitsOf(state, playerId).length;
      const cities = citiesOf(state, playerId).length;
      // A more aggressive opponent keeps a larger standing army, but only
      // half as much larger as its aggression — scaling it fully starves the
      // economy that pays for the army in the first place.
      const wantArmy = Math.round((cities * 2 + 1) * (1 + (personality.aggression - 1) * 0.5));
      if (army >= wantArmy) return -5;
      if (cityUnitCount(state, city.id) >= cityCapacity(state, city)) return -Infinity;
      const def = UNITS[action.unitType];
      return (20 + def.cost * 3 + (army < cities ? 15 : 0)) * personality.aggression;
    }

    case "RESEARCH": {
      const tech = TECH_BY_ID[action.techId];
      // early tiers and economy-enabling techs first
      let score = 30 - tech.tier * 6;
      if (["organization", "hunting", "fishing", "farming", "forestry", "mining"].includes(tech.id)) score += 12;
      if (["archery", "shields", "smithery", "chivalry", "rocketry"].includes(tech.id)) score += 8 * personality.aggression;
      // the one nuke is only worth researching toward while it is still on the table
      if (tech.id === "atomic_theory") score += state.nukeLaunched ? -10 : 8 * personality.aggression;
      // techs that pay for themselves: income, cheaper research, star windfalls
      if (["trade", "philosophy", "whaling"].includes(tech.id)) score += 12 * personality.economy;
      // roads is worth more the more ground there is to cover
      if (tech.id === "roads") score += 6 + citiesOf(state, playerId).length * 2;
      if (["strategy", "construction"].includes(tech.id)) score += 8 * personality.aggression;
      if (tech.id === "spiritualism") score += state.winMode === "perfection" ? 20 : 4;
      // marooned with nothing left to walk to: the sea techs jump the queue
      if (["fishing", "sailing", "navigation"].includes(tech.id) && wantsSeafaring(state, playerId)) {
        score += tech.id === "fishing" ? 15 : tech.id === "sailing" ? 25 : 18;
      }
      // a whole rival world out of reach: rocket science jumps it further
      if (tech.id === "space_travel" && wantsSpaceTravel(state, playerId)) score += 25;
      // don't spend everything on research when broke
      if (player.stars < 8) score -= 15;
      return score * personality.research;
    }

    case "CHOOSE_REWARD": {
      const prefs: Record<string, number> = {
        workshop: 10,
        explorer: 6,
        walls: 9,
        stars: 7,
        population: 10,
        border_growth: 6,
        super_unit: 10,
        park: 6,
      };
      return prefs[action.reward] ?? 5;
    }

    case "BUILD_IMPROVEMENT": {
      if (action.improvement === "walls") return 26 * personality.aggression;
      // the station is the gateway to the other world (and its survey photos)
      if (action.improvement === "station") return wantsSpaceTravel(state, playerId) ? 70 : 4;
      // a park is 250 points of nothing else; only Perfection games care
      return state.winMode === "perfection" ? 60 : 8;
    }

    case "LAUNCH_NUKE": {
      const city = cityById(state, action.cityId);
      if (!city) return -Infinity;
      let score = 300 + city.level * 80 + (city.isCapital ? 150 : 0);
      // the blast is indiscriminate: own units and cities in the 3x3 die too
      for (const u of unitsOf(state, playerId)) {
        if (dist(state, u.x, u.y, city.x, city.y) <= 1) score -= 45;
      }
      for (const c of citiesOf(state, playerId)) {
        if (dist(state, c.x, c.y, city.x, city.y) <= 1) score -= 800;
      }
      return score * personality.aggression;
    }

    case "UPGRADE_BOAT":
      return 6;

    case "LAUNCH": {
      const unit = unitById(state, action.unitId);
      if (!unit) return -Infinity;
      // Reinforcements keep flying as long as the other world has anything
      // left to take — this must not gate on having no foothold yet, or every
      // invasion would be a single lonely warrior.
      const worthGoing = otherWorldWorthwhile(state, playerId, planetOf(state, unit.x));
      return worthGoing ? 150 * personality.expansion : -20;
    }

    case "LAND": {
      const unit = unitById(state, action.unitId);
      if (!unit) return -Infinity;
      // aborting back onto the pad wastes the launch: a last resort
      if (action.x === unit.x && action.y === unit.y) return -40;
      let score = 100 * personality.expansion;
      const destTile = tileAt(state, action.x, action.y);
      if (destTile.village) score += 60 * personality.expansion;
      if (destTile.cityHere !== null) {
        const c = cityById(state, destTile.cityHere);
        if (c && c.ownerId !== playerId) score += 60 * personality.expansion;
      }
      // prefer coming down near what we came for; cross-planet objectives
      // are Infinity away and drop out on their own
      let pull = 0;
      for (const o of objectives) {
        const d = dist(state, action.x, action.y, o.x, o.y);
        if (!Number.isFinite(d)) continue;
        pull = Math.max(pull, o.weight * 10 - d);
      }
      return score + pull * 2;
    }

    case "DISBAND":
      return -100;

    case "END_TURN":
      return 4;
  }
}

function nearestObjective(state: GameState, unit: Unit, objectives: Objective[]): Objective | null {
  let best: Objective | null = null;
  let bestVal = -Infinity;
  for (const o of objectives) {
    const d = dist(state, unit.x, unit.y, o.x, o.y);
    const val = o.weight * 10 - d;
    if (val > bestVal) {
      bestVal = val;
      best = o;
    }
  }
  return best;
}
