import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import { applyAction } from "../src/engine/reducer";
import { computeLegalActions } from "../src/engine/legalActions";
import { actionKey } from "../src/engine/actions";
import { HeuristicAgent } from "../src/ai/heuristicAgent";
import { BALANCED } from "../src/ai/evaluate";
import { TECHS } from "../src/data/techs";
import { isAir } from "../src/data/units";
import type { GameState } from "../src/engine/state";

/**
 * The late game normally arrives only after thirty turns of research, so the
 * air war, the shore batteries and the field hospitals almost never appear in
 * an ordinary self-play run. Here every tribe starts with the whole tree and a
 * full purse, so the agents actually reach for them — and anything that
 * crashes, hangs, or picks an illegal action with them in play shows up.
 */
function playFullTech(seed: number, rounds: number): { state: GameState; log: string[] } {
  const state0 = newGame({
    seed,
    size: 12,
    mapType: "continents", // coasts and shipping, so the shore guns have a job
    tribes: ["meridia", "ashfen", "thornwood"],
    winMode: "perfection",
  });
  state0.maxTurns = rounds;
  for (const p of state0.players) {
    p.techs = TECHS.filter((t) => t.id !== "space_travel").map((t) => t.id);
    p.stars = 150;
  }

  let state = state0;
  const agent = new HeuristicAgent(BALANCED);
  const log: string[] = [];
  let safety = 30000;
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

describe("late-game self-play", () => {
  it("plays clean games with the whole tree unlocked", () => {
    for (const seed of [5, 19, 42]) {
      const { state } = playFullTech(seed, 18);
      // whatever got built stands somewhere real and inside someone's borders
      for (const t of state.tiles) {
        if (t.building === null) continue;
        expect(t.terrain).not.toBe("void");
        expect(t.cityId).not.toBeNull();
      }
      // aircraft never end up carrying a boat around with them
      for (const u of state.units) {
        if (isAir(u.type)) expect(u.embarked).toBeNull();
      }
    }
  }, 120000);

  it("is fully deterministic per seed", () => {
    const a = playFullTech(31, 14);
    const b = playFullTech(31, 14);
    expect(b.log).toEqual(a.log);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  }, 120000);

  it("actually reaches for the new works over a long game", () => {
    // one longer run, purely to prove the agents use what they have been given
    const { log } = playFullTech(19, 30);
    const built = (kind: string) => log.some((l) => l.includes(`"building":"${kind}"`));
    const trained = (kind: string) => log.some((l) => l.includes(`"unitType":"${kind}"`));
    expect(built("airfield") || built("hospital") || built("naval_tower") || built("flak_tower")).toBe(true);
    expect(trained("scout_plane") || trained("bomber") || trained("medic")).toBe(true);
  }, 120000);
});
