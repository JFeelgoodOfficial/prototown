import type { GameState } from "../engine/state";
import type { Action } from "../engine/actions";
import { computeLegalActions } from "../engine/legalActions";
import { applyAction } from "../engine/reducer";
import type { AiAgent } from "./agent";
import { objectivesFor, scoreAction, evaluatePosition, BALANCED, type AiPersonality } from "./evaluate";

/** How much the played-out result counts against the action's own score. */
const LOOKAHEAD_WEIGHT = 0.6;

/**
 * Scores every legal action with a cheap heuristic, then — for the most
 * promising handful — actually plays the action out and judges the position it
 * leaves behind. The shortlist keeps this affordable: a full playout of every
 * action would clone the state a hundred times per decision.
 *
 * Deterministic given the same state: applyAction is pure, and the clones it
 * makes take their RNG draws from the copy, never the live game.
 */
export class HeuristicAgent implements AiAgent {
  constructor(private personality: AiPersonality = BALANCED) {}

  chooseAction(state: GameState, playerId: number): Action {
    const actions = computeLegalActions(state, playerId);
    if (actions.length === 0) return { type: "END_TURN" };
    if (actions.length === 1) return actions[0];

    const objectives = objectivesFor(state, playerId);
    const scored = actions.map((action) => ({
      action,
      score: scoreAction(state, playerId, action, objectives, this.personality),
    }));
    scored.sort((a, b) => b.score - a.score);

    const depth = Math.min(this.personality.lookahead, scored.length);
    if (depth <= 1) return scored[0].action;

    const before = evaluatePosition(state, playerId);
    let best = scored[0].action;
    let bestValue = -Infinity;
    for (let i = 0; i < depth; i++) {
      const { action, score } = scored[i];
      let delta: number;
      try {
        delta = evaluatePosition(applyAction(state, action), playerId) - before;
      } catch {
        continue; // an action that cannot be played is not a candidate
      }
      // Ending the turn always looks flat here; leave it to its own score.
      const value = score + (action.type === "END_TURN" ? 0 : delta * LOOKAHEAD_WEIGHT);
      if (value > bestValue) {
        bestValue = value;
        best = action;
      }
    }
    return best;
  }
}
