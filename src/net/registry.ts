import type { SeatRef } from "./types";

/**
 * The player's own online games, remembered locally so their links can be
 * reopened from the menu after the share sheet is long gone.
 */

const KEY = "polyforge-online-games";

export interface RememberedGame extends SeatRef {
  label: string;
  createdAt: number;
}

export function listRememberedGames(): RememberedGame[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RememberedGame[]) : [];
    return Array.isArray(list) ? list.filter((g) => g && typeof g.gameId === "string") : [];
  } catch {
    return [];
  }
}

export function rememberGame(game: RememberedGame): void {
  try {
    const list = listRememberedGames().filter((g) => g.gameId !== game.gameId);
    list.unshift(game);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // storage full or blocked: the link still works, it just isn't remembered
  }
}

export function forgetGame(gameId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listRememberedGames().filter((g) => g.gameId !== gameId)));
  } catch {
    // ignore
  }
}
