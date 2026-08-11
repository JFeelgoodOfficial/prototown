import type { GameState } from "../engine/state";
import { unitsOf } from "../engine/state";
import type { Action } from "../engine/actions";
import { computeLegalActions } from "../engine/legalActions";
import { applyAction } from "../engine/reducer";
import type { AiAgent } from "./agent";
import { objectivesFor, scoreAction, evaluatePosition, BALANCED, type AiPersonality } from "./evaluate";

/** How much the played-out result counts against the action's own score. */
const LOOKAHEAD_WEIGHT = 0.6;
/** Replies are only searched for the attacks a rival is most likely to make. */
const REPLY_BRANCH = 6;

/**
 * Scores every legal action with a cheap heuristic, then — for the most
 * promising handful — plays the action out and judges the position it leaves
 * behind. At the top difficulty it goes one step further and lets the strongest
 * rival answer, so walking into a killing blow is seen as one before it happens.
 *
 * The shortlists keep this affordable: playing out every action, let alone every
 * reply to it, would clone the state hundreds of times per decision.
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
      let after: GameState;
      try {
        after = applyAction(state, action);
      } catch {
        continue; // an action that cannot be played is not a candidate
      }
      let outcome = evaluatePosition(after, playerId);
      if (i < this.personality.replies && action.type !== "END_TURN") {
        outcome = Math.min(outcome, worstReply(after, playerId));
      }
      // Ending the turn always looks flat here; leave it to its own score.
      const delta = outcome - before;
      const value = score + (action.type === "END_TURN" ? 0 : delta * LOOKAHEAD_WEIGHT);
      if (value > bestValue) {
        bestValue = value;
        best = action;
      }
    }
    return best;
  }
}

/**
 * The position after the most damaging answer a rival has to it. Only rival
 * attacks are considered — those are the replies that actually punish a move,
 * and enumerating every rival action would cost more than the search is worth.
 */
function worstReply(state: GameState, playerId: number): number {
  const rival = strongestRival(state, playerId);
  if (rival === null) return evaluatePosition(state, playerId);

  // Rivals answer on their own turn, so ask what they could do from here.
  const probe: GameState = { ...state, currentPlayerId: rival };
  let attacks: Action[];
  try {
    attacks = computeLegalActions(probe, rival).filter((a) => a.type === "ATTACK");
  } catch {
    return evaluatePosition(state, playerId);
  }
  if (attacks.length === 0) return evaluatePosition(state, playerId);

  let worst = evaluatePosition(state, playerId);
  for (const attack of attacks.slice(0, REPLY_BRANCH)) {
    try {
      worst = Math.min(worst, evaluatePosition(applyAction(probe, attack), playerId));
    } catch {
      // an attack that cannot be played is not a threat
    }
  }
  return worst;
}

/** The living rival with the most units — the one whose answer matters most. */
function strongestRival(state: GameState, playerId: number): number | null {
  let best: number | null = null;
  let bestUnits = -1;
  for (const p of state.players) {
    if (p.id === playerId || !p.alive) continue;
    const n = unitsOf(state, p.id).length;
    if (n > bestUnits) {
      bestUnits = n;
      best = p.id;
    }
  }
  return bestUnits > 0 ? best : null;
}
