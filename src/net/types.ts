import type { WinMode } from "../engine/state";
import type { Action } from "../engine/actions";
import type { Difficulty } from "../game/difficulty";

/**
 * Everything needed to regenerate an online game's starting state. Stored in
 * games.config; combined with the action log it fully determines the game.
 */
export interface OnlineConfig {
  v: 1;
  /** engine SAVE_VERSION at creation — clients on a different version must not replay */
  engine: number;
  seed: number;
  size: number;
  winMode: WinMode;
  difficulty: Difficulty;
  /** tribe per seat; the first humanSeats are humans, the rest AI */
  tribes: string[];
  humanSeats: number;
}

/** One player's claim on a seat: the contents of their personal game link. */
export interface SeatRef {
  gameId: string;
  seatNo: number;
  token: string;
}

export interface ActionRow {
  idx: number;
  seat_no: number;
  action: Action;
}

export interface GameRow {
  id: string;
  status: "active" | "finished";
  config: OnlineConfig;
  current_seat: number;
  action_count: number;
  winner_seat: number | null;
  snapshot: unknown;
  snapshot_idx: number;
  takeover_seats: number[];
  next_game_id: string | null;
  updated_at: string;
}

export type OnlineStatus = "connecting" | "live" | "syncing" | "offline" | "corrupted";

/**
 * What the game controller needs from a live online session. Kept free of any
 * supabase types so the controller (and the test suite) never touch the SDK.
 */
export interface OnlineSessionHandle {
  readonly status: OnlineStatus;
  /** Report an action this client just applied to its own state. */
  onLocalAction(action: Action): void;
  /** Seats this client should advance with the local AI (AI seats + takeovers). */
  drivesSeat(seatNo: number): boolean;
  /** How many actions have been applied to the local state. */
  localCount(): number;
  detach(): void;
}

export function gameHash(ref: SeatRef): string {
  return `#g/${ref.gameId}/${ref.seatNo}/${ref.token}`;
}

export function gameLink(ref: SeatRef): string {
  return `${location.origin}${location.pathname}${gameHash(ref)}`;
}

const HASH_RE = /^#g\/([0-9a-f-]{36})\/(\d)\/([0-9a-f-]{36})$/i;

export function parseGameHash(hash: string): SeatRef | null {
  const m = HASH_RE.exec(hash);
  if (!m) return null;
  return { gameId: m[1].toLowerCase(), seatNo: Number(m[2]), token: m[3].toLowerCase() };
}
