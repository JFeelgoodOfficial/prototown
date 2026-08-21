import type { GameState, PlayerState, Unit } from "./state";
import { idx, isPlayable, disk, tileCount, citiesOf, unitsOf, tileAt, buildingsOf } from "./state";
import { UNITS } from "../data/units";
import { NAVAL_TOWER_RANGE } from "../data/constants";

/** Sight radius from a position: 2 from mountains, else 1. */
function sightRadius(state: GameState, x: number, y: number): number {
  return tileAt(state, x, y).terrain === "mountain" ? 2 : 1;
}

/** What a unit sees: its own eyes, or the high ground it happens to be on. */
function unitSight(state: GameState, u: Unit): number {
  return Math.max(sightRadius(state, u.x, u.y), UNITS[u.type].sight);
}

/**
 * Every post a player watches the world from, as [x, y, radius]. Units and
 * cities, plus Naval Towers — a shore battery has to see the sea it is meant
 * to be shelling, so it watches out to its own gun range.
 */
function watchPosts(state: GameState, player: PlayerState): Array<[number, number, number]> {
  const posts: Array<[number, number, number]> = [];
  for (const u of unitsOf(state, player.id)) posts.push([u.x, u.y, unitSight(state, u)]);
  for (const c of citiesOf(state, player.id)) posts.push([c.x, c.y, c.borderRadius]);
  for (const t of buildingsOf(state, player.id, "naval_tower")) posts.push([t.x, t.y, NAVAL_TOWER_RANGE]);
  return posts;
}

/** Mark everything currently seen by the player as explored (fog never re-hides terrain). */
export function computeVisibility(state: GameState, player: PlayerState): void {
  for (const [cx, cy, r] of watchPosts(state, player)) {
    for (const [x, y] of disk(state, cx, cy, r)) {
      if (isPlayable(state, x, y)) player.explored[idx(state, x, y)] = 1;
    }
  }
}

export function isExplored(state: GameState, player: PlayerState, x: number, y: number): boolean {
  return player.explored[idx(state, x, y)] === 1;
}

/**
 * Live visibility (for hiding enemy units): a tile is watched if it lies
 * inside the reach of any of the player's watch posts — a unit's sight, a
 * city's borders, or a Naval Tower's stretch of sea.
 */
export function watchedMask(state: GameState, player: PlayerState): number[] {
  const mask = new Array(tileCount(state)).fill(0);
  for (const [cx, cy, r] of watchPosts(state, player)) {
    for (const [x, y] of disk(state, cx, cy, r)) {
      if (isPlayable(state, x, y)) mask[idx(state, x, y)] = 1;
    }
  }
  return mask;
}

export function revealAll(player: PlayerState): void {
  player.explored.fill(1);
}
