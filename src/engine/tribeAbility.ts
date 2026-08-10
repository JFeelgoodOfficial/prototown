import type { GameState } from "./state";
import { playerById } from "./state";
import { tribeById, type TribeAbility } from "../data/tribes";

/** The tribe ability in effect for a player. */
export function abilityOf(state: GameState, playerId: number): TribeAbility {
  return tribeById(playerById(state, playerId).tribeId).ability;
}
