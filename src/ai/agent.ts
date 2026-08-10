import type { GameState } from "../engine/state";
import type { Action } from "../engine/actions";

export interface AiAgent {
  chooseAction(state: GameState, playerId: number): Action;
}
