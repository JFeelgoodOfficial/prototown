import { TRIBES } from "../data/tribes";
import type { NewGameOptions } from "../engine/mapgen";
import type { MapType } from "../engine/state";
import type { Difficulty } from "./difficulty";

const RESULT_KEY = "polyforge-daily";

/** Everyone playing on the same date gets the same board, tribes and rules. */
export const DAILY_SIZE = 14;
export const DAILY_OPPONENTS = 2;
export const DAILY_DIFFICULTY: Difficulty = "normal";
/** Shapes the daily may roll. Derived from the date seed, so it is the same
    worldwide; grow this list once a shape has proven itself. */
export const DAILY_MAP_ROTATION: MapType[] = ["square", "circle", "continents"];

export function dailyKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Seed derived from the UTC date, so the daily board is the same worldwide. */
export function dailySeedForToday(date = new Date()): number {
  return seedFromKey(dailyKey(date));
}

export function seedFromKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2 ** 31;
}

/**
 * The daily fixes the tribe line-up as well as the map: comparing scores only
 * means something if everyone played the same tribe with the same ability.
 */
export function dailyOptions(date = new Date()): NewGameOptions {
  const seed = dailySeedForToday(date);
  const start = seed % TRIBES.length;
  const tribes = Array.from({ length: DAILY_OPPONENTS + 1 }, (_, i) => TRIBES[(start + i) % TRIBES.length].id);
  const mapType = DAILY_MAP_ROTATION[seed % DAILY_MAP_ROTATION.length];
  return { seed, size: DAILY_SIZE, mapType, tribes, winMode: "perfection" };
}

export interface DailyResult {
  key: string;
  score: number;
  won: boolean;
}

export function loadDailyResult(): DailyResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyResult;
    if (typeof parsed?.key !== "string" || typeof parsed?.score !== "number") return null;
    return parsed.key === dailyKey() ? parsed : null;
  } catch {
    return null;
  }
}

/** Keep the best score for today; a later worse run doesn't overwrite it. */
export function recordDailyResult(score: number, won: boolean): void {
  try {
    const existing = loadDailyResult();
    if (existing && existing.score >= score) return;
    localStorage.setItem(RESULT_KEY, JSON.stringify({ key: dailyKey(), score, won } satisfies DailyResult));
  } catch {
    // a result that won't persist is not worth interrupting the game for
  }
}
