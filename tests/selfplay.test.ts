import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import { applyAction } from "../src/engine/reducer";
import { computeLegalActions } from "../src/engine/legalActions";
import { actionKey } from "../src/engine/actions";
import { HeuristicAgent } from "../src/ai/heuristicAgent";
import { BALANCED } from "../src/ai/evaluate";
import type { GameState, MapType } from "../src/engine/state";

/**
 * All-AI games across many seeds: every chosen action must be legal,
 * games must terminate, and a replay with the same seed must match.
 */
function playGame(seed: number, maxRounds = 40, mapType: MapType = "square"): { state: GameState; log: string[] } {
  let state = newGame({ seed, size: 11, mapType, tribes: ["meridia", "ashfen", "thornwood"], winMode: "perfection" });
  state.maxTurns = maxRounds - 5;
  const agent = new HeuristicAgent(BALANCED);
  const log: string[] = [];
  let safety = 20000;

  while (state.winnerId === null && safety-- > 0) {
    const pid = state.currentPlayerId;
    const legal = new Set(computeLegalActions(state, pid).map(actionKey));
    expect(legal.size).toBeGreaterThan(0);
    const action = agent.chooseAction(state, pid);
    expect(legal.has(actionKey(action))).toBe(true);
    log.push(`${pid}:${actionKey(action)}`);
    state = applyAction(state, action);
  }
  expect(safety).toBeGreaterThan(0);
  expect(state.winnerId).not.toBeNull();
  return { state, log };
}

describe("AI self-play", () => {
  it("terminates with only legal actions across seeds", () => {
    for (const seed of [11, 23, 37, 58, 71, 90, 104, 250]) {
      playGame(seed);
    }
  }, 60000);

  it("is fully deterministic per seed", () => {
    const a = playGame(77);
    const b = playGame(77);
    expect(b.log).toEqual(a.log);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  }, 30000);

  it("plays clean, deterministic games on circle maps", () => {
    for (const seed of [11, 37, 90]) {
      const { state } = playGame(seed, 40, "circle");
      // nothing ever ends up standing on or owning the void
      for (const u of state.units) expect(state.tiles[u.y * state.size + u.x].terrain).not.toBe("void");
      for (const t of state.tiles) {
        if (t.terrain === "void") {
          expect(t.cityId).toBeNull();
          expect(t.building).toBeNull();
          for (const p of state.players) expect(p.explored[t.y * state.size + t.x]).toBe(0);
        }
      }
    }
    const a = playGame(37, 40, "circle");
    const b = playGame(37, 40, "circle");
    expect(b.log).toEqual(a.log);
  }, 60000);
});
