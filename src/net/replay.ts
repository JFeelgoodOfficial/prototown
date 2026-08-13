import type { GameState, MapType, WinMode } from "../engine/state";
import { newGame } from "../engine/mapgen";
import { applyAction } from "../engine/reducer";
import { computeLegalActions } from "../engine/legalActions";
import { actionKey } from "../engine/actions";
import { SAVE_VERSION } from "../engine/serialize";
import { TRIBES } from "../data/tribes";
import type { Difficulty } from "../game/difficulty";
import type { ActionRow, OnlineConfig } from "./types";

/** A log entry the engine refuses: wrong seat or an illegal move. */
export class ReplayError extends Error {
  constructor(
    public idx: number,
    message: string,
  ) {
    super(message);
    this.name = "ReplayError";
  }
}

export function initialState(config: OnlineConfig): GameState {
  return newGame({
    seed: config.seed,
    size: config.size,
    mapType: config.mapType ?? "square",
    tribes: config.tribes,
    winMode: config.winMode,
    humanSeats: config.humanSeats,
  });
}

/**
 * Apply one log entry, first checking it against the rules. The log is written
 * by other clients we don't control, so a corrupt or malicious entry must fail
 * loudly here rather than desync or crash the renderer.
 */
export function applyStep(state: GameState, row: ActionRow): GameState {
  if (row.seat_no !== state.currentPlayerId) {
    throw new ReplayError(row.idx, `action ${row.idx} claims seat ${row.seat_no} but seat ${state.currentPlayerId} is up`);
  }
  const key = actionKey(row.action);
  if (!computeLegalActions(state, row.seat_no).some((a) => actionKey(a) === key)) {
    throw new ReplayError(row.idx, `action ${row.idx} is not legal for seat ${row.seat_no}`);
  }
  return applyAction(state, row.action);
}

/** Rebuild the full game state from its config and action log. */
export function buildState(config: OnlineConfig, log: ActionRow[]): GameState {
  let state = initialState(config);
  for (const row of log) state = applyStep(state, row);
  return state;
}

const sizeForPlayers = (n: number): number => (n <= 2 ? 11 : n === 3 ? 14 : 16);
/** Globe boards store the cube-face resolution instead of an edge length. */
const globeSizeForPlayers = (n: number): number => (n <= 2 ? 5 : n === 3 ? 6 : 7);
/** Twin worlds have 12n² tiles, so they run one face size smaller. */
const twinSizeForPlayers = (n: number): number => (n <= 2 ? 5 : 6);

/**
 * Roll the shared setup for a new online game: seed, randomly assigned tribes
 * (the user chose random assignment), and a map sized like local games with
 * the same player count. Both humans always come first, AI seats after.
 */
export function configForNewGame(
  aiCount: number,
  difficulty: Difficulty,
  winMode: WinMode,
  rng: () => number = Math.random,
  mapType: MapType = "square",
): OnlineConfig {
  const humanSeats = 2;
  const total = humanSeats + aiCount;
  const pool = TRIBES.map((t) => t.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    v: 1,
    engine: SAVE_VERSION,
    seed: Math.floor(rng() * 2 ** 31),
    size:
      mapType === "globe"
        ? globeSizeForPlayers(total)
        : mapType === "twin_globes"
          ? twinSizeForPlayers(total)
          : sizeForPlayers(total),
    mapType,
    winMode,
    difficulty,
    tribes: pool.slice(0, total),
    humanSeats,
  };
}
