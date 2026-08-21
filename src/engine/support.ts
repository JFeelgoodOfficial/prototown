import type { GameState, Unit } from "./state";
import { buildingsOf, dist, unitsOf } from "./state";
import { isAir } from "../data/units";
import {
  FLAK_DAMAGE,
  FLAK_RANGE,
  HOSPITAL_HEAL,
  HOSPITAL_RANGE,
  MEDIC_HEAL,
  MEDIC_RANGE,
} from "../data/constants";

/**
 * Field medicine, applied at the start of a player's turn. Hospitals mend
 * anyone camped in their catchment and Medics mend whoever they are standing
 * beside; a soldier inside both takes the better of the two rather than the
 * sum, so stacking clinics never outruns the damage being done to them.
 *
 * This is free healing — unlike Recover it costs the soldier nothing, which is
 * the whole point of building the hospital.
 */
export function applyMedicalCare(state: GameState, playerId: number): void {
  const hospitals = buildingsOf(state, playerId, "hospital");
  const own = unitsOf(state, playerId);
  const medics = own.filter((u) => u.type === "medic");
  if (hospitals.length === 0 && medics.length === 0) return;

  for (const u of own) {
    if (u.hp >= u.maxHp || u.embarked === "orbit") continue;
    let heal = 0;
    if (hospitals.some((h) => dist(state, h.x, h.y, u.x, u.y) <= HOSPITAL_RANGE)) heal = HOSPITAL_HEAL;
    // a medic patches the soldiers around them, not themselves
    if (medics.some((m) => m.id !== u.id && dist(state, m.x, m.y, u.x, u.y) <= MEDIC_RANGE)) {
      heal = Math.max(heal, MEDIC_HEAL);
    }
    u.hp = Math.min(u.maxHp, u.hp + heal);
  }
}

/**
 * Anti-air fire against an aircraft that has just flown somewhere. Every enemy
 * Flak Tower whose umbrella now covers it opens up — the batteries are always
 * manned, so this happens on the mover's own turn rather than waiting for their
 * owner's. Returns the damage taken; the caller removes the wreck.
 */
export function flakFireAt(state: GameState, aircraft: Unit): number {
  if (!isAir(aircraft.type)) return 0;
  let damage = 0;
  for (const player of state.players) {
    if (player.id === aircraft.ownerId || !player.alive) continue;
    for (const tower of buildingsOf(state, player.id, "flak_tower")) {
      if (dist(state, tower.x, tower.y, aircraft.x, aircraft.y) <= FLAK_RANGE) damage += FLAK_DAMAGE;
    }
  }
  return damage;
}
