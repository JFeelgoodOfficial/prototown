import type { GameState } from "./state";
import { citiesOf } from "./state";
import { playerScore } from "./score";

/**
 * Eliminate players with no cities (their units are removed), then check
 * for a winner: last tribe standing (domination) or best score once the
 * turn limit passes (perfection).
 */
export function updateWinState(state: GameState): void {
  for (const p of state.players) {
    if (p.alive && citiesOf(state, p.id).length === 0) {
      p.alive = false;
      state.units = state.units.filter((u) => u.ownerId !== p.id);
    }
  }

  const alive = state.players.filter((p) => p.alive);
  if (alive.length === 1) {
    state.winnerId = alive[0].id;
    return;
  }

  if (state.winMode === "perfection" && state.turn > state.maxTurns) {
    let best = alive[0];
    for (const p of alive) {
      if (playerScore(state, p.id) > playerScore(state, best.id)) best = p;
    }
    state.winnerId = best.id;
  }
}
