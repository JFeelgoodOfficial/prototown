import type { GameState, Unit } from "../engine/state";
import { unitById, cityById, tileAt, playerById, dist, idx, citiesOf, unitsOf } from "../engine/state";
import type { Action } from "../engine/actions";
import { resolveCombat } from "../engine/combat";
import { UNITS } from "../data/units";
import { TECH_BY_ID } from "../data/techs";
import { TERRAIN } from "../data/terrain";
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
}

export const BALANCED: AiPersonality = { aggression: 1, expansion: 1, economy: 1, research: 1 };

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
  for (const t of state.tiles) {
    if (player.explored[idx(state, t.x, t.y)] === 1) continue;
    if (TERRAIN[t.terrain].water) continue;
    out.push({ x: t.x, y: t.y, weight: 0.8 });
  }
  return out;
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
      const nearOwnCity = citiesOf(state, playerId).some((c) => dist(defender.x, defender.y, c.x, c.y) <= 2);
      if (nearOwnCity) score += 10;
      return score * personality.aggression;
    }

    case "CAPTURE":
      return 1000 * personality.expansion;

    case "MOVE": {
      const unit = unitById(state, action.unitId);
      if (!unit) return -Infinity;
      const best = nearestObjective(unit, objectives);
      if (!best) return 0;
      const before = dist(unit.x, unit.y, best.x, best.y);
      const after = dist(action.x, action.y, best.x, best.y);
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
      return score;
    }

    case "RECOVER": {
      const unit = unitById(state, action.unitId);
      if (!unit) return -Infinity;
      const missing = unit.maxHp - unit.hp;
      return unit.hp < unit.maxHp * 0.6 ? missing * 2.5 : 2;
    }

    case "HARVEST":
      return 55 * personality.economy;

    case "BUILD":
      return 50 * personality.economy;

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
      if (cityUnitCount(state, city.id) >= cityCapacity(city)) return -Infinity;
      const def = UNITS[action.unitType];
      return (20 + def.cost * 3 + (army < cities ? 15 : 0)) * personality.aggression;
    }

    case "RESEARCH": {
      const tech = TECH_BY_ID[action.techId];
      // early tiers and economy-enabling techs first
      let score = 30 - tech.tier * 6;
      if (["organization", "hunting", "fishing", "farming", "forestry", "mining"].includes(tech.id)) score += 12;
      if (["archery", "shields", "smithery", "chivalry"].includes(tech.id)) score += 8 * personality.aggression;
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

    case "UPGRADE_BOAT":
      return 6;

    case "DISBAND":
      return -100;

    case "END_TURN":
      return 4;
  }
}

function nearestObjective(unit: Unit, objectives: Objective[]): Objective | null {
  let best: Objective | null = null;
  let bestVal = -Infinity;
  for (const o of objectives) {
    const d = dist(unit.x, unit.y, o.x, o.y);
    const val = o.weight * 10 - d;
    if (val > bestVal) {
      bestVal = val;
      best = o;
    }
  }
  return best;
}
