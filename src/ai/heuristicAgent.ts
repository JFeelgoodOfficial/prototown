import type { GameState } from "../engine/state";
import type { Action } from "../engine/actions";
import { computeLegalActions } from "../engine/legalActions";
import type { AiAgent } from "./agent";
import { objectivesFor, scoreAction, type AiPersonality } from "./evaluate";

/**
 * Greedy heuristic agent in the style of the reference implementation's
 * SimpleAgent: score every legal action, take the best, repeat until
 * END_TURN comes out on top. Deterministic given the same state.
 */
export class HeuristicAgent implements AiAgent {
  constructor(private personality: AiPersonality = { aggression: 1 }) {}

  chooseAction(state: GameState, playerId: number): Action {
    const actions = computeLegalActions(state, playerId);
    if (actions.length === 0) return { type: "END_TURN" };
    if (actions.length === 1) return actions[0];

    const objectives = objectivesFor(state, playerId);
    let best = actions[0];
    let bestScore = -Infinity;
    for (const a of actions) {
      const s = scoreAction(state, playerId, a, objectives, this.personality);
      if (s > bestScore) {
        bestScore = s;
        best = a;
      }
    }
    return best;
  }
}
