import { describe, it, expect } from "vitest";
import { makeTestState, addUnit } from "./helpers";
import { applyAction } from "../src/engine/reducer";
import { newGame } from "../src/engine/mapgen";
import { computeLegalActions } from "../src/engine/legalActions";
import { idx } from "../src/engine/state";
import { RUIN_STARS } from "../src/data/constants";

/** Put a ruin next to a unit and walk in. */
function walkIntoRuin(seedNudge = 0) {
  const s = makeTestState();
  s.rngState = 12345 + seedNudge;
  const u = addUnit(s, 0, "warrior", 3, 3);
  s.tiles[idx(s, 4, 3)].ruin = true;
  const next = applyAction(s, { type: "MOVE", unitId: u.id, x: 4, y: 3 });
  return { before: s, next, unitId: u.id };
}

describe("ruins", () => {
  it("are consumed on entry and announce what was found", () => {
    const { next } = walkIntoRuin();
    expect(next.tiles[idx(next, 4, 3)].ruin).toBe(false);
    expect(next.lastRuinReward).not.toBeNull();
    expect(next.lastRuinReward!.label.length).toBeGreaterThan(0);
    expect(next.lastRuinReward!.playerId).toBe(0);
    expect(next.lastRuinReward!.x).toBe(4);
  });

  it("always hands out something the player can use", () => {
    for (let n = 0; n < 40; n++) {
      const { before, next, unitId } = walkIntoRuin(n * 7919);
      const reward = next.lastRuinReward!;
      const unitAfter = next.units.find((u) => u.id === unitId)!;
      switch (reward.kind) {
        case "stars":
          expect(next.players[0].stars).toBe(before.players[0].stars + RUIN_STARS);
          break;
        case "tech":
          expect(next.players[0].techs.length).toBe(before.players[0].techs.length + 1);
          break;
        case "veteran":
          expect(unitAfter.veteran).toBe(true);
          expect(unitAfter.maxHp).toBeGreaterThan(before.units[0].maxHp);
          break;
        case "population":
          expect(next.cities[0].population + next.cities[0].level).toBeGreaterThan(
            before.cities[0].population + before.cities[0].level,
          );
          break;
        case "map":
          expect(next.players[0].explored.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
          break;
      }
    }
  });

  it("the announcement is cleared by the next action", () => {
    const { next, unitId } = walkIntoRuin();
    expect(next.lastRuinReward).not.toBeNull();
    const unit = next.units.find((u) => u.id === unitId)!;
    unit.moved = false;
    const after = applyAction(next, { type: "MOVE", unitId, x: 5, y: 3 });
    expect(after.lastRuinReward).toBeNull();
  });

  it("a generated map has ruins, clear of villages and cities", () => {
    const s = newGame({ seed: 31337, size: 16, tribes: ["meridia", "ashfen"], winMode: "domination" });
    const ruins = s.tiles.filter((t) => t.ruin);
    expect(ruins.length).toBeGreaterThan(0);
    for (const r of ruins) {
      expect(r.village).toBe(false);
      expect(r.cityHere).toBeNull();
    }
  });

  it("claiming one never produces an illegal follow-up", () => {
    const { next } = walkIntoRuin();
    const actions = computeLegalActions(next, next.currentPlayerId);
    expect(actions.length).toBeGreaterThan(0);
    expect(() => applyAction(next, actions[0])).not.toThrow();
  });
});
