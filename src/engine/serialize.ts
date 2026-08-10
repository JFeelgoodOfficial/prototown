import type { GameState } from "./state";

export const SAVE_VERSION = 2;

export interface SaveFile {
  version: number;
  savedAt: number;
  /** AI aggression multiplier the game was started with (difficulty). */
  aggression: number;
  state: GameState;
}

export interface LoadedSave {
  state: GameState;
  savedAt: number;
  aggression: number;
}

export function serialize(state: GameState, savedAt: number, aggression: number): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt, aggression, state };
  return JSON.stringify(file);
}

export function deserialize(json: string): LoadedSave | null {
  try {
    const file = JSON.parse(json) as Partial<SaveFile>;
    if (typeof file.version !== "number" || file.version < 1 || file.version > SAVE_VERSION) return null;
    if (!file.state || !Array.isArray(file.state.tiles)) return null;
    // v1 files predate stored difficulty; normal aggression is the safe default.
    return {
      state: file.state,
      savedAt: typeof file.savedAt === "number" ? file.savedAt : 0,
      aggression: typeof file.aggression === "number" ? file.aggression : 1,
    };
  } catch {
    return null;
  }
}
