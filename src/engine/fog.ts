import type { GameState, PlayerState } from "./state";
import { idx, inBounds, citiesOf, unitsOf, tileAt } from "./state";

/** Sight radius from a position: 2 from mountains, else 1. */
function sightRadius(state: GameState, x: number, y: number): number {
  return tileAt(state, x, y).terrain === "mountain" ? 2 : 1;
}

/** Mark everything currently seen by the player as explored (fog never re-hides terrain). */
export function computeVisibility(state: GameState, player: PlayerState): void {
  const reveal = (cx: number, cy: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (inBounds(state, x, y)) player.explored[idx(state, x, y)] = 1;
      }
  };
  for (const u of unitsOf(state, player.id)) reveal(u.x, u.y, sightRadius(state, u.x, u.y));
  for (const c of citiesOf(state, player.id)) reveal(c.x, c.y, c.borderRadius);
}

export function isExplored(state: GameState, player: PlayerState, x: number, y: number): boolean {
  return player.explored[idx(state, x, y)] === 1;
}

/**
 * Live visibility (for hiding enemy units): a tile is watched if within
 * sight radius of any of the player's units or inside own city borders.
 */
export function watchedMask(state: GameState, player: PlayerState): number[] {
  const mask = new Array(state.size * state.size).fill(0);
  const mark = (cx: number, cy: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (inBounds(state, x, y)) mask[idx(state, x, y)] = 1;
      }
  };
  for (const u of unitsOf(state, player.id)) mark(u.x, u.y, sightRadius(state, u.x, u.y));
  for (const c of citiesOf(state, player.id)) mark(c.x, c.y, c.borderRadius);
  return mask;
}

export function revealAll(player: PlayerState): void {
  player.explored.fill(1);
}
