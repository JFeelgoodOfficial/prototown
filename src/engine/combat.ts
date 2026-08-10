import type { GameState, Unit } from "./state";
import { tileAt, playerById, hasTech, cityById, dist } from "./state";
import { UNITS, NAVAL } from "../data/units";
import {
  ATTACK_ACCELERATOR,
  DEFENCE_BONUS_TERRAIN,
  DEFENCE_BONUS_WALLS,
  FORTIFY_BONUS,
  FLANK_BONUS_PER_UNIT,
  FLANK_BONUS_MAX,
} from "../data/constants";
import { TERRAIN } from "../data/terrain";
import { abilityOf } from "./tribeAbility";

export function unitAtk(u: Unit): number {
  return u.embarked ? NAVAL[u.embarked].atk : UNITS[u.type].atk;
}

export function unitDef(u: Unit): number {
  return u.embarked ? NAVAL[u.embarked].def : UNITS[u.type].def;
}

export function unitRange(u: Unit): number {
  return u.embarked ? NAVAL[u.embarked].range : UNITS[u.type].range;
}

/** Base movement, before any tribe bonus (used where no state is at hand). */
export function unitMov(u: Unit): number {
  return u.embarked ? NAVAL[u.embarked].mov : UNITS[u.type].mov;
}

/** Movement including the owner's tribe ability. */
export function unitMovIn(state: GameState, u: Unit): number {
  const bonus = u.embarked ? abilityOf(state, u.ownerId).navalMoveBonus : 0;
  return unitMov(u) + bonus;
}

/**
 * Defence multiplier for a unit standing on its tile: 4.0 inside a walled
 * city it owns, 1.5 on defensive terrain whose bonus tech is known. Digging in
 * multiplies whichever of those applies.
 */
export function defenceBonus(state: GameState, defender: Unit): number {
  return terrainDefence(state, defender) * (defender.fortified ? FORTIFY_BONUS : 1);
}

function terrainDefence(state: GameState, defender: Unit): number {
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

/**
 * How much harder an attack lands because the defender is already pressed by
 * the attacker's other units. Surrounding a unit is worth doing.
 */
export function flankBonus(state: GameState, attacker: Unit, defender: Unit): number {
  let pressing = 0;
  for (const u of state.units) {
    if (u.ownerId !== attacker.ownerId || u.id === attacker.id) continue;
    if (dist(u.x, u.y, defender.x, defender.y) <= 1) pressing++;
  }
  return 1 + Math.min(FLANK_BONUS_MAX, pressing * FLANK_BONUS_PER_UNIT);
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

  const damageMultiplier = abilityOf(state, attacker.ownerId).damageMultiplier * flankBonus(state, attacker, defender);
  const damageToDefender = Math.round((attackForce / total) * atk * ATTACK_ACCELERATOR * damageMultiplier);
  const defenderDies = defender.hp - damageToDefender <= 0;

  let damageToAttacker = 0;
  let attackerDies = false;
  if (!defenderDies) {
    const inRetaliationRange =
      dist(attacker.x, attacker.y, defender.x, defender.y) <= unitRange(defender);
    if (inRetaliationRange) {
      // retaliation is the defender striking back, so it uses their tribe's bonus
      const retaliationMultiplier = abilityOf(state, defender.ownerId).damageMultiplier;
      damageToAttacker = Math.round((defenceForce / total) * def * ATTACK_ACCELERATOR * retaliationMultiplier);
      attackerDies = attacker.hp - damageToAttacker <= 0;
    }
  }

  return { damageToDefender, damageToAttacker, defenderDies, attackerDies };
}
