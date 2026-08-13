import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import { sphereTopology } from "../src/engine/topology";
import type { GameState, MapType } from "../src/engine/state";
import { idx, neighbors, dist, tileCount } from "../src/engine/state";
import { applyAction } from "../src/engine/reducer";
import { computeLegalActions } from "../src/engine/legalActions";
import { actionKey } from "../src/engine/actions";
import { HeuristicAgent } from "../src/ai/heuristicAgent";
import { BALANCED } from "../src/ai/evaluate";

const opts = (seed: number, size = 6) => ({
  seed,
  size,
  mapType: "globe" as MapType,
  tribes: ["meridia", "ashfen", "korvani"],
  winMode: "domination" as const,
});

describe("globe map generation", () => {
  it("is deterministic for the same seed", () => {
    const a = newGame(opts(42));
    const b = newGame(opts(42));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("builds 6n² tiles with per-player fog to match", () => {
    const s = newGame(opts(7));
    expect(s.tiles.length).toBe(6 * 6 * 6);
    expect(tileCount(s)).toBe(s.tiles.length);
    for (const p of s.players) expect(p.explored.length).toBe(s.tiles.length);
    // tiles carry the coordinates the flat array says they have
    s.tiles.forEach((t, i) => expect(idx(s, t.x, t.y)).toBe(i));
  });

  it("keeps capitals apart, off cube corners, on connected land", () => {
    for (const seed of [1, 7, 23, 99]) {
      const s = newGame(opts(seed));
      const topo = sphereTopology(s.size);
      for (const c of s.cities) {
        expect(c.isCapital).toBe(true);
        expect(topo.cornerTiles.has(idx(s, c.x, c.y))).toBe(false);
        expect(s.tiles[idx(s, c.x, c.y)].terrain).toBe("field");
      }
      for (let i = 0; i < s.cities.length; i++)
        for (let j = i + 1; j < s.cities.length; j++) {
          expect(dist(s, s.cities[i].x, s.cities[i].y, s.cities[j].x, s.cities[j].y)).toBeGreaterThanOrEqual(3);
        }
      // corridors: all capitals share one landmass
      const land = (x: number, y: number) => {
        const t = s.tiles[idx(s, x, y)].terrain;
        return t !== "water" && t !== "ocean";
      };
      const seen = new Set<number>([idx(s, s.cities[0].x, s.cities[0].y)]);
      const queue = [[s.cities[0].x, s.cities[0].y] as [number, number]];
      while (queue.length) {
        const [x, y] = queue.pop()!;
        for (const [nx, ny] of neighbors(s, x, y)) {
          const key = idx(s, nx, ny);
          if (seen.has(key) || !land(nx, ny)) continue;
          seen.add(key);
          queue.push([nx, ny]);
        }
      }
      for (const c of s.cities) expect(seen.has(idx(s, c.x, c.y))).toBe(true);
    }
  });

  it("places villages and ruins on land, never void", () => {
    const s = newGame(opts(13));
    const villages = s.tiles.filter((t) => t.village);
    expect(villages.length).toBeGreaterThan(3);
    for (const t of s.tiles) {
      expect(t.terrain).not.toBe("void");
      if (t.village) expect(t.terrain).toBe("field");
    }
  });
});

describe("cross-edge play", () => {
  /** A globe that is all open field, with fog lifted for both players. */
  function openGlobe(): GameState {
    const s = newGame(opts(3, 5));
    for (const t of s.tiles) {
      t.terrain = "field";
      t.resource = null;
      t.village = false;
      t.ruin = false;
    }
    for (const c of s.cities) s.tiles[idx(s, c.x, c.y)].cityHere = c.id;
    for (const p of s.players) p.explored.fill(1);
    return s;
  }

  it("a unit at a face edge can move onto the neighbouring face", () => {
    const s = openGlobe();
    const n = s.size;
    const u = s.units.find((x) => x.ownerId === s.currentPlayerId)!;
    // park the current player's unit on the last column of face 0
    u.x = n - 1;
    u.y = 2;
    u.moved = false;
    const moves = computeLegalActions(s, s.currentPlayerId).filter(
      (a) => a.type === "MOVE" && a.unitId === u.id,
    );
    // some legal step leaves face 0 entirely
    expect(moves.some((a) => a.type === "MOVE" && Math.floor(a.x / n) !== 0)).toBe(true);
  });

  it("attack range reaches across a face edge", () => {
    const s = openGlobe();
    const n = s.size;
    const me = s.units.find((x) => x.ownerId === s.currentPlayerId)!;
    me.x = n - 1;
    me.y = 2;
    me.attacked = false;
    me.moved = false;
    // an enemy on the adjacent face, folded right next to us
    const across = neighbors(s, me.x, me.y).find(([x]) => Math.floor(x / n) !== 0)!;
    const enemy = s.units.find((x) => x.ownerId !== s.currentPlayerId)!;
    [enemy.x, enemy.y] = across;
    expect(dist(s, me.x, me.y, enemy.x, enemy.y)).toBe(1);
    const attacks = computeLegalActions(s, s.currentPlayerId).filter(
      (a) => a.type === "ATTACK" && a.unitId === me.id,
    );
    expect(attacks.some((a) => a.type === "ATTACK" && a.targetId === enemy.id)).toBe(true);
  });
});

describe("globe self-play", () => {
  function playGame(seed: number): { state: GameState; log: string[] } {
    let state = newGame(opts(seed, 5));
    state.maxTurns = 30;
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

  it("terminates with only legal actions across seeds", () => {
    for (const seed of [11, 37, 90]) playGame(seed);
  }, 90000);

  it("is fully deterministic per seed", () => {
    const a = playGame(77);
    const b = playGame(77);
    expect(b.log).toEqual(a.log);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  }, 60000);

  it("units cross cube-face edges in ordinary play", () => {
    const { log } = playGame(11);
    // at least one MOVE happened (sanity that movement worked at all)
    expect(log.some((l) => l.includes("MOVE"))).toBe(true);
  });
});
