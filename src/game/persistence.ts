import type { GameState } from "../engine/state";
import { serialize, deserialize } from "../engine/serialize";

const KEY = "polyforge-save-v1";

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, serialize(state, Date.now()));
  } catch {
    // storage full or unavailable — playing on without autosave is fine
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return deserialize(raw);
  } catch {
    return null;
  }
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
