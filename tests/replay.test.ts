import { describe, it, expect } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { applyAction } from "../src/engine/reducer";
import { serialize } from "../src/engine/serialize";
import { HeuristicAgent } from "../src/ai/heuristicAgent";
import { DIFFICULTY_PERSONALITY } from "../src/game/difficulty";
import { buildState, configForNewGame, initialState, ReplayError } from "../src/net/replay";
import type { ActionRow } from "../src/net/types";

/** Self-play a game with every seat on the same AI, recording the action log. */
function playLog(config: ReturnType<typeof configForNewGame>, maxActions: number): ActionRow[] {
  let state = initialState(config);
  const agents = new Map(state.players.map((p) => [p.id, new HeuristicAgent(DIFFICULTY_PERSONALITY.relaxed)]));
  const log: ActionRow[] = [];
  while (log.length < maxActions && state.winnerId === null) {
    const seat = state.currentPlayerId;
    const action = agents.get(seat)!.chooseAction(state, seat);
    log.push({ idx: log.length, seat_no: seat, action });
    state = applyAction(state, action);
  }
  return log;
}

describe("online action-log replay", () => {
  const config = configForNewGame(1, "relaxed", "domination", mulberry32(11));

  it("reproduces the exact state from config + log", () => {
    const log = playLog(config, 200);
    expect(log.length).toBeGreaterThan(50);

    // replay the same log twice, as two clients would
    let direct = initialState(config);
    for (const row of log) direct = applyAction(direct, row.action);
    const replayed = buildState(config, log);

    expect(serialize(replayed, 0, config.difficulty)).toBe(serialize(direct, 0, config.difficulty));
  });

  it("rejects an entry claiming the wrong seat", () => {
    const log = playLog(config, 60);
    const tampered = log.map((r) => (r.idx === 40 ? { ...r, seat_no: (r.seat_no + 1) % config.tribes.length } : r));
    expect(() => buildState(config, tampered)).toThrowError(ReplayError);
    try {
      buildState(config, tampered);
    } catch (err) {
      expect((err as ReplayError).idx).toBe(40);
    }
  });

  it("rejects an illegal action", () => {
    const log = playLog(config, 60);
    const tampered = log.map((r) =>
      r.idx === 30 ? { ...r, action: { type: "MOVE", unitId: 99999, x: 0, y: 0 } as const } : r,
    );
    expect(() => buildState(config, tampered)).toThrowError(ReplayError);
  });
});

describe("online game config", () => {
  it("is deterministic for the same rng", () => {
    const a = configForNewGame(2, "hard", "perfection", mulberry32(5));
    const b = configForNewGame(2, "hard", "perfection", mulberry32(5));
    expect(a).toEqual(b);
  });

  it("deals two human seats plus the chosen AI count, no duplicate tribes", () => {
    for (const aiCount of [0, 1, 2]) {
      const config = configForNewGame(aiCount, "normal", "domination", mulberry32(aiCount));
      expect(config.humanSeats).toBe(2);
      expect(config.tribes.length).toBe(2 + aiCount);
      expect(new Set(config.tribes).size).toBe(config.tribes.length);
      expect(config.size).toBe(aiCount === 0 ? 11 : aiCount === 1 ? 14 : 16);
      const state = initialState(config);
      expect(state.players.filter((p) => p.isHuman).length).toBe(2);
    }
  });
});
