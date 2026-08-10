import type { GameState } from "../engine/state";
import { serialize, deserialize } from "../engine/serialize";
import { isDifficulty, difficultyFromAggression, type Difficulty } from "./difficulty";

const KEY = "polyforge-save-v1";

export interface SavedGame {
  state: GameState;
  savedAt: number;
  difficulty: Difficulty;
}

export function saveGame(state: GameState, difficulty: Difficulty): boolean {
  try {
    localStorage.setItem(KEY, serialize(state, Date.now(), difficulty));
    return true;
  } catch {
    // storage full or unavailable — playing on without autosave is fine
    return false;
  }
}

export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const file = deserialize(raw);
    if (!file) return null;
    return { state: file.state, savedAt: file.savedAt, difficulty: difficultyOf(file) };
  } catch {
    return null;
  }
}

/** v3 stores the setting by name, v2 stored a multiplier, v1 stored nothing. */
function difficultyOf(file: { difficulty: string | null; aggression: number | null }): Difficulty {
  if (isDifficulty(file.difficulty)) return file.difficulty;
  if (file.aggression !== null) return difficultyFromAggression(file.aggression);
  return "normal";
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
