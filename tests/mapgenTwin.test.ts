import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import { applyAction } from "../src/engine/reducer";
import { computeLegalActions } from "../src/engine/legalActions";
import { actionKey } from "../src/engine/actions";
import { HeuristicAgent } from "../src/ai/heuristicAgent";
import { BALANCED } from "../src/ai/evaluate";
import { planetOf, type GameState } from "../src/engine/state";

const TRIBES4 = ["meridia", "ashfen", "thornwood", "korvani"];

function twinGame(seed: number, tribes: string[]): GameState {
  return newGame({ seed, size: 5, mapType: "twin_globes", tribes, winMode: "domination" });
}

describe("twin-globe map generation", () => {
  it.each([
    [2, 1, 1],
    [3, 2, 1],
    [4, 2, 2],
  ])("seats %i tribes as %i + %i across the planets, human first", (count, onA, onB) => {
    const s = twinGame(42, TRIBES4.slice(0, count));
    const planets = s.cities.filter((c) => c.isCapital).map((c) => planetOf(s, c.x));
    expect(planets.filter((p) => p === 0).length).toBe(onA);
    expect(planets.filter((p) => p === 1).length).toBe(onB);
    // seat order fills planet 0 first, so the human (seat 0) is on planet 0
    expect(planets[0]).toBe(0);
    for (let i = 0; i < count; i++) expect(planets[i]).toBe(i < onA ? 0 : 1);
  });

  it("puts villages, ruins, and resources on both planets", () => {
    for (const seed of [1, 7, 99]) {
      const s = twinGame(seed, TRIBES4);
      for (const p of [0, 1]) {
        const mine = s.tiles.filter((t) => planetOf(s, t.x) === p);
        expect(mine.some((t) => t.village)).toBe(true);
        expect(mine.some((t) => t.ruin)).toBe(true);
        expect(mine.some((t) => t.resource !== null)).toBe(true);
        expect(mine.every((t) => t.terrain !== "void")).toBe(true);
      }
    }
  });

  it("generates the same twin world for the same seed", () => {
    const a = twinGame(1234, TRIBES4);
    const b = twinGame(1234, TRIBES4);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("plays clean, deterministic self-play games on twin worlds", () => {
    for (const seed of [21, 77]) {
      const play = (): { state: GameState; keys: string[] } => {
        let state = newGame({
          seed,
          size: 5,
          mapType: "twin_globes",
          tribes: ["meridia", "ashfen", "thornwood"],
          winMode: "perfection",
        });
        state.maxTurns = 25;
        const agent = new HeuristicAgent(BALANCED);
        const keys: string[] = [];
        let safety = 20000;
        while (state.winnerId === null && safety-- > 0) {
          const pid = state.currentPlayerId;
          const legal = new Set(computeLegalActions(state, pid).map(actionKey));
          const action = agent.chooseAction(state, pid);
          expect(legal.has(actionKey(action))).toBe(true);
          keys.push(actionKey(action));
          state = applyAction(state, action);
        }
        expect(safety).toBeGreaterThan(0);
        expect(state.winnerId).not.toBeNull();
        return { state, keys };
      };
      const first = play();
      const second = play();
      expect(second.keys.join("\n")).toBe(first.keys.join("\n"));
      expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
    }
  }, 120000);
});
