import type { GameState } from "../engine/state";
import { serialize, deserialize } from "../engine/serialize";
import { isDifficulty, difficultyFromAggression, type Difficulty } from "./difficulty";

/** The rolling autosave. Named slots hang off the same prefix. */
const KEY = "polyforge-save-v1";
const SLOT_PREFIX = "polyforge-slot-";
export const SLOT_COUNT = 3;

/** Local saves are always single-player games where the human is seat 0. */
export const LOCAL_HUMAN = 0;

export interface SavedGame {
  state: GameState;
  savedAt: number;
  difficulty: Difficulty;
}

export function saveGame(state: GameState, difficulty: Difficulty): boolean {
  return writeTo(KEY, state, difficulty);
}

export function loadGame(): SavedGame | null {
  return readFrom(KEY);
}

export function clearSave(): void {
  remove(KEY);
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

// --- named slots -----------------------------------------------------------

const slotKey = (slot: number) => `${SLOT_PREFIX}${slot}`;

export function saveToSlot(slot: number, state: GameState, difficulty: Difficulty): boolean {
  return writeTo(slotKey(slot), state, difficulty);
}

export function loadFromSlot(slot: number): SavedGame | null {
  return readFrom(slotKey(slot));
}

export function clearSlot(slot: number): void {
  remove(slotKey(slot));
}

/** Every slot, with null where nothing has been saved yet. */
export function listSlots(): Array<SavedGame | null> {
  return Array.from({ length: SLOT_COUNT }, (_, i) => loadFromSlot(i));
}

// --- moving a game between devices -----------------------------------------

export function exportSave(state: GameState, difficulty: Difficulty): string {
  return serialize(state, Date.now(), difficulty);
}

/** Parse pasted or uploaded save text. Returns null if it isn't a save. */
export function parseSave(text: string): SavedGame | null {
  const file = deserialize(text.trim());
  if (!file) return null;
  return { state: file.state, savedAt: file.savedAt, difficulty: difficultyOf(file) };
}

// --- shared plumbing -------------------------------------------------------

function writeTo(key: string, state: GameState, difficulty: Difficulty): boolean {
  try {
    localStorage.setItem(key, serialize(state, Date.now(), difficulty));
    return true;
  } catch {
    // storage full or unavailable — playing on without a save is fine
    return false;
  }
}

function readFrom(key: string): SavedGame | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const file = deserialize(raw);
    if (!file) return null;
    return { state: file.state, savedAt: file.savedAt, difficulty: difficultyOf(file) };
  } catch {
    return null;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** v3 stores the setting by name, v2 stored a multiplier, v1 stored nothing. */
function difficultyOf(file: { difficulty: string | null; aggression: number | null }): Difficulty {
  if (isDifficulty(file.difficulty)) return file.difficulty;
  if (file.aggression !== null) return difficultyFromAggression(file.aggression);
  return "normal";
}
