import { describe, it, expect } from "vitest";
import { makeTestState, addUnit } from "./helpers";
import { HeuristicAgent } from "../src/ai/heuristicAgent";
import { computeLegalActions } from "../src/engine/legalActions";
import { unitById } from "../src/engine/state";
import { applyAction } from "../src/engine/reducer";
import { actionKey } from "../src/engine/actions";
import { DIFFICULTY_PERSONALITY } from "../src/game/difficulty";
import { newGame } from "../src/engine/mapgen";

const GREEDY = { ...DIFFICULTY_PERSONALITY.normal, lookahead: 0, replies: 0 };
const HARD = DIFFICULTY_PERSONALITY.hard;

describe("agent search", () => {
  it("only ever returns a legal action, at every difficulty", () => {
    for (const p of Object.values(DIFFICULTY_PERSONALITY)) {
      let s = newGame({ seed: 909, size: 11, tribes: ["meridia", "ashfen"], winMode: "domination" });
      const agent = new HeuristicAgent(p);
      for (let i = 0; i < 25; i++) {
        const legal = computeLegalActions(s, s.currentPlayerId);
        if (legal.length === 0) break;
        const chosen = agent.chooseAction(s, s.currentPlayerId);
        expect(legal.map(actionKey)).toContain(actionKey(chosen));
        s = applyAction(s, chosen);
      }
    }
  });

  it("is deterministic, including when searching replies", () => {
    const s = newGame({ seed: 4242, size: 11, tribes: ["meridia", "ashfen", "korvani"], winMode: "domination" });
    const agent = new HeuristicAgent(HARD);
    const first = actionKey(agent.chooseAction(s, 0));
    for (let i = 0; i < 5; i++) {
      expect(actionKey(agent.chooseAction(s, 0))).toBe(first);
    }
    // and searching does not disturb the state it searched from
    const snapshot = JSON.stringify(s);
    agent.chooseAction(s, 0);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("keeps a wounded unit out of reach when nothing else is pulling it", () => {
    // No village, no frontier: every move scores the same to the cheap
    // heuristic, so the only thing separating them is what happens next.
    const build = () => {
      const s = makeTestState(10);
      s.currentPlayerId = 0;
      const knight = addUnit(s, 0, "knight", 3, 3);
      knight.hp = 2;
      addUnit(s, 1, "swordsman", 6, 3);
      return s;
    };

    const searching = new HeuristicAgent({ ...HARD, lookahead: 30, replies: 30 }).chooseAction(build(), 0);
    const blind = new HeuristicAgent({ ...GREEDY, lookahead: 30, replies: 0 }).chooseAction(build(), 0);

    const inReach = (a: ReturnType<HeuristicAgent["chooseAction"]>) =>
      a.type === "MOVE" && Math.max(Math.abs(a.x - 6), Math.abs(a.y - 3)) <= 1;

    // The one that looks at the reply stays out of the swordsman's reach.
    expect(inReach(searching)).toBe(false);
    // Without the reply search, stepping into reach looks like any other move,
    // so nothing steers it away.
    expect(blind.type).toBe("MOVE");
  });

  it("flies the nuke with the bomber it has, from a tile the blast will not reach", () => {
    const s = makeTestState(10);
    s.currentPlayerId = 0;
    s.players[0].techs.push("atomic_theory");
    addUnit(s, 0, "warrior", 6, 6); // keeps the enemy capital watched
    const overhead = addUnit(s, 0, "bomber", 7, 8); // would die in its own blast
    const standoff = addUnit(s, 0, "bomber", 5, 6); // three tiles out, comes home

    const pick = new HeuristicAgent(HARD).chooseAction(s, 0);
    expect(pick).toMatchObject({ type: "LAUNCH_NUKE", cityId: s.cities[1].id });
    expect(pick).not.toMatchObject({ unitId: overhead.id });
    expect(pick).toMatchObject({ unitId: standoff.id });
  });

  it("never walks a unit into a firestorm, whatever is on the far side", () => {
    const s = makeTestState(10);
    s.currentPlayerId = 0;
    const rider = addUnit(s, 0, "rider", 3, 3);
    s.tiles[3 * s.size + 4].village = true; // the prize, straight through the fire
    for (let y = 2; y <= 4; y++) s.tiles[y * s.size + 4].fireOutTurn = s.turn + 2;

    const pick = new HeuristicAgent(HARD).chooseAction(s, 0);
    const burning = (a: ReturnType<HeuristicAgent["chooseAction"]>) =>
      a.type === "MOVE" && a.x === 4 && a.y >= 2 && a.y <= 4;
    expect(burning(pick)).toBe(false);
    expect(unitById(applyAction(s, pick), rider.id)).toBeDefined();
  });

  it("a strong enough prize still outweighs the risk", () => {
    // The search informs the decision, it does not veto it: a village next to
    // an enemy is still worth taking with a cheap unit.
    const s = makeTestState(10);
    s.currentPlayerId = 0;
    const warrior = addUnit(s, 0, "warrior", 3, 4);
    warrior.hp = 4;
    addUnit(s, 1, "swordsman", 5, 5);
    s.tiles[4 * s.size + 4].village = true;
    const pick = new HeuristicAgent(HARD).chooseAction(s, 0);
    expect(pick.type).toBe("MOVE");
    expect(pick).toMatchObject({ x: 4, y: 4 });
  });
});
