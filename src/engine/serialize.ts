import type { GameState } from "./state";

export const SAVE_VERSION = 3;

export interface SaveFile {
  version: number;
  savedAt: number;
  /** difficulty setting the game was started with */
  difficulty: string;
  /** v2 only: the aggression multiplier, kept so old files still load */
  aggression?: number;
  state: GameState;
}

export interface LoadedSave {
  state: GameState;
  savedAt: number;
  /** null when the file predates stored difficulty, or stored it as a number */
  difficulty: string | null;
  /** set when a v2 file stored difficulty as a bare multiplier */
  aggression: number | null;
}

export function serialize(state: GameState, savedAt: number, difficulty: string): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt, difficulty, state };
  return JSON.stringify(file);
}

export function deserialize(json: string): LoadedSave | null {
  try {
    const file = JSON.parse(json) as Partial<SaveFile>;
    if (typeof file.version !== "number" || file.version < 1 || file.version > SAVE_VERSION) return null;
    if (!file.state || !Array.isArray(file.state.tiles)) return null;
    return {
      state: file.state,
      savedAt: typeof file.savedAt === "number" ? file.savedAt : 0,
      difficulty: typeof file.difficulty === "string" ? file.difficulty : null,
      aggression: typeof file.aggression === "number" ? file.aggression : null,
    };
  } catch {
    return null;
  }
}
