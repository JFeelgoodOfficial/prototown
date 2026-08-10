import type { GameState } from "./state";

export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}

export function serialize(state: GameState, savedAt: number): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt, state };
  return JSON.stringify(file);
}

export function deserialize(json: string): GameState | null {
  try {
    const file = JSON.parse(json) as SaveFile;
    if (file.version !== SAVE_VERSION) return null;
    if (!file.state || !Array.isArray(file.state.tiles)) return null;
    return file.state;
  } catch {
    return null;
  }
}
