import { describe, it, expect } from "vitest";
import { makeTestState } from "./helpers";
import { cityIncome, addPopulation, popForNextLevel, totalPopulation } from "../src/engine/economy";
import { applyAction } from "../src/engine/reducer";

describe("economy", () => {
  it("city income: base + level-1 + capital + workshop", () => {
    const s = makeTestState();
    const c = s.cities[0];
    expect(cityIncome(s, c)).toBe(2); // level 1 capital
    c.level = 3;
    expect(cityIncome(s, c)).toBe(4);
    c.workshop = true;
    expect(cityIncome(s, c)).toBe(5);
    c.isCapital = false;
    expect(cityIncome(s, c)).toBe(4);
  });

  it("level 1 -> 2 needs 2 population, excess carries over", () => {
    const s = makeTestState();
    const c = s.cities[0];
    expect(popForNextLevel(c)).toBe(2);
    const levelled = addPopulation(c, 3);
    expect(levelled).toBe(true);
    expect(c.level).toBe(2);
    expect(c.population).toBe(1);
    expect(c.pendingReward).toEqual(["workshop", "explorer"]);
  });

  it("chained level-ups queue the highest reward tier", () => {
    const s = makeTestState();
    const c = s.cities[0];
    addPopulation(c, 2 + 3); // to level 3 exactly
    expect(c.level).toBe(3);
    expect(c.pendingReward).toEqual(["walls", "stars"]);
  });

  it("totalPopulation counts thresholds passed plus progress", () => {
    const s = makeTestState();
    const c = s.cities[0];
    addPopulation(c, 6); // 2 to reach L2, 3 to reach L3, 1 left
    expect(c.level).toBe(3);
    expect(totalPopulation(c)).toBe(6);
  });

  it("harvest spends stars, consumes the resource, grows the city", () => {
    const s = makeTestState();
    s.players[0].techs.push("organization");
    const c = s.cities[0];
    const tile = s.tiles[(c.y + 1) * s.size + c.x];
    tile.resource = "fruit";
    const next = applyAction(s, { type: "HARVEST", x: tile.x, y: tile.y });
    expect(next.players[0].stars).toBe(3);
    expect(next.tiles[(c.y + 1) * s.size + c.x].resource).toBeNull();
    expect(next.cities[0].population).toBe(1);
  });

  it("income is granted when the turn comes back around", () => {
    const s = makeTestState();
    const afterP0 = applyAction(s, { type: "END_TURN" });
    expect(afterP0.currentPlayerId).toBe(1);
    expect(afterP0.players[1].stars).toBe(7); // 5 + level-1 capital income 2
    const afterP1 = applyAction(afterP0, { type: "END_TURN" });
    expect(afterP1.currentPlayerId).toBe(0);
    expect(afterP1.turn).toBe(2);
    expect(afterP1.players[0].stars).toBe(7);
  });
});
