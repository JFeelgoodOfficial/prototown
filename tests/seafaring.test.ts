import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, setTerrain } from "./helpers";
import { newGame } from "../src/engine/mapgen";
import { applyAction } from "../src/engine/reducer";
import { computeLegalActions } from "../src/engine/legalActions";
import { actionKey } from "../src/engine/actions";
import { HeuristicAgent } from "../src/ai/heuristicAgent";
import { BALANCED, wantsSeafaring } from "../src/ai/evaluate";
import type { GameState } from "../src/engine/state";
import { idx } from "../src/engine/state";

/**
 * Two islands split by a water channel: player 0 on the west island,
 * player 1 on the east one. Nobody can walk across.
 */
function twoIslands(): GameState {
  const s = makeTestState(10);
  for (let y = 0; y < 10; y++)
    for (let x = 3; x <= 6; x++) setTerrain(s, x, y, "water");
  // shallow water inside the western capital's borders, joined to the channel,
  // so a port is buildable
  setTerrain(s, 2, 1, "water");
  s.players[0].techs = ["fishing", "sailing", "navigation"];
  s.players[0].stars = 30;
  s.players[1].techs = ["hunting"];
  s.players[1].stars = 5;
  addUnit(s, 0, "warrior", 1, 1);
  addUnit(s, 1, "warrior", 8, 8);
  return s;
}

describe("AI seafaring", () => {
  it("builds a port, embarks, and lands on the far island", () => {
    let s = twoIslands();
    const agent = new HeuristicAgent(BALANCED);
    let builtPort = false;
    let embarked = false;
    let landed = false;
    let safety = 3000;

    while (safety-- > 0 && !landed && s.winnerId === null) {
      const action = agent.chooseAction(s, s.currentPlayerId);
      if (s.currentPlayerId === 0 && action.type === "BUILD" && action.building === "port") builtPort = true;
      s = applyAction(s, action);
      for (const u of s.units) {
        if (u.ownerId !== 0) continue;
        if (u.embarked !== null) embarked = true;
        if (u.x >= 6 && u.embarked === null) landed = true;
      }
    }

    expect(builtPort).toBe(true);
    expect(embarked).toBe(true);
    expect(landed).toBe(true);
  }, 30000);

  it("wantsSeafaring flips exactly when the goals lie overseas", () => {
    const s = twoIslands();
    // Everything worth having — the enemy city — is across the channel.
    expect(wantsSeafaring(s, 0)).toBe(true);

    // A village still to grab on the home island keeps feet on dry land.
    s.tiles[idx(s, 1, 7)].village = true;
    expect(wantsSeafaring(s, 0)).toBe(false);
    s.tiles[idx(s, 1, 7)].village = false;

    // Unexplored land on the home island also keeps the tribe walking.
    s.players[0].explored[idx(s, 1, 8)] = 0;
    expect(wantsSeafaring(s, 0)).toBe(false);
    s.players[0].explored[idx(s, 1, 8)] = 1;

    // The east islander has no boats and no reason to want them less: the
    // same test sees its goals overseas too.
    expect(wantsSeafaring(s, 1)).toBe(true);
  });

  it("plays clean, deterministic continents games where someone crosses the sea", () => {
    const seeds = [11, 37, 90, 250];
    let crossings = 0;
    for (const seed of seeds) {
      let state = newGame({
        seed,
        size: 11,
        mapType: "continents",
        tribes: ["meridia", "ashfen", "thornwood"],
        winMode: "perfection",
      });
      state.maxTurns = 35;
      const agent = new HeuristicAgent(BALANCED);
      const homeMass = state.cities.map((c) => landKey(state, c.x, c.y));
      let crossed = false;
      let safety = 20000;
      while (state.winnerId === null && safety-- > 0) {
        const pid = state.currentPlayerId;
        const legal = new Set(computeLegalActions(state, pid).map(actionKey));
        const action = agent.chooseAction(state, pid);
        expect(legal.has(actionKey(action))).toBe(true);
        state = applyAction(state, action);
        for (const u of state.units) {
          if (u.embarked !== null) continue;
          const k = landKey(state, u.x, u.y);
          if (k !== null && homeMass[u.ownerId] !== null && k !== homeMass[u.ownerId]) crossed = true;
        }
      }
      expect(safety).toBeGreaterThan(0);
      expect(state.winnerId).not.toBeNull();
      if (crossed) crossings++;
    }
    expect(crossings).toBeGreaterThanOrEqual(1);
  }, 120000);
});

/** Stable id of the landmass containing (x,y): its smallest tile index. */
function landKey(s: GameState, x: number, y: number): number | null {
  const isLand = (t: string) => t === "field" || t === "forest" || t === "mountain";
  if (!isLand(s.tiles[idx(s, x, y)].terrain)) return null;
  const seen = new Set<number>([idx(s, x, y)]);
  const queue: Array<[number, number]> = [[x, y]];
  let min = idx(s, x, y);
  while (queue.length) {
    const [cx, cy] = queue.pop()!;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
        const key = ny * s.size + nx;
        if (seen.has(key) || !isLand(s.tiles[key].terrain)) continue;
        seen.add(key);
        min = Math.min(min, key);
        queue.push([nx, ny]);
      }
  }
  return min;
}
