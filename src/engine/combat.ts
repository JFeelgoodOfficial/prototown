import type { GameState, Unit } from "./state";
import { tileAt, playerById, hasTech, cityById, dist } from "./state";
import { UNITS, NAVAL } from "../data/units";
import { ATTACK_ACCELERATOR, DEFENCE_BONUS_TERRAIN, DEFENCE_BONUS_WALLS } from "../data/constants";
import { TERRAIN } from "../data/terrain";

export function unitAtk(u: Unit): number {
  return u.embarked ? NAVAL[u.embarked].atk : UNITS[u.type].atk;
}

export function unitDef(u: Unit): number {
  return u.embarked ? NAVAL[u.embarked].def : UNITS[u.type].def;
}

export function unitRange(u: Unit): number {
  return u.embarked ? NAVAL[u.embarked].range : UNITS[u.type].range;
}

export function unitMov(u: Unit): number {
  return u.embarked ? NAVAL[u.embarked].mov : UNITS[u.type].mov;
}

/**
 * Defence multiplier for a unit standing on its tile: 4.0 inside a walled
 * city it owns, 1.5 on defensive terrain whose bonus tech is known.
 */
export function defenceBonus(state: GameState, defender: Unit): number {
  const tile = tileAt(state, defender.x, defender.y);
  if (tile.cityHere !== null) {
    const city = cityById(state, tile.cityHere);
    if (city && city.walls && city.ownerId === defender.ownerId) return DEFENCE_BONUS_WALLS;
  }
  const terr = TERRAIN[tile.terrain];
  if (terr.defenceTech && hasTech(playerById(state, defender.ownerId), terr.defenceTech)) {
    return DEFENCE_BONUS_TERRAIN;
  }
  return 1;
}

export interface CombatResult {
  damageToDefender: number;
  damageToAttacker: number;
  defenderDies: boolean;
  attackerDies: boolean;
}

/**
 * The reference damage formula:
 *   attackForce  = atk * (hp / maxHp)
 *   defenceForce = def * (hp / maxHp) * bonus
 *   damage       = round(attackForce / (attackForce + defenceForce) * atk * 4.5)
 * Retaliation only if the defender survives and the attacker is inside
 * the defender's own attack range.
 */
export function resolveCombat(state: GameState, attacker: Unit, defender: Unit): CombatResult {
  const atk = unitAtk(attacker);
  const def = unitDef(defender);
  const attackForce = atk * (attacker.hp / attacker.maxHp);
  const defenceForce = def * (defender.hp / defender.maxHp) * defenceBonus(state, defender);
  const total = attackForce + defenceForce;

  const damageToDefender = Math.round((attackForce / total) * atk * ATTACK_ACCELERATOR);
  const defenderDies = defender.hp - damageToDefender <= 0;

  let damageToAttacker = 0;
  let attackerDies = false;
  if (!defenderDies) {
    const inRetaliationRange =
      dist(attacker.x, attacker.y, defender.x, defender.y) <= unitRange(defender);
    if (inRetaliationRange) {
      damageToAttacker = Math.round((defenceForce / total) * def * ATTACK_ACCELERATOR);
      attackerDies = attacker.hp - damageToAttacker <= 0;
    }
  }

  return { damageToDefender, damageToAttacker, defenderDies, attackerDies };
}
