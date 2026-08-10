import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, setTerrain } from "./helpers";
import { resolveCombat, unitMovIn } from "../src/engine/combat";
import { reachableTiles } from "../src/engine/movement";
import { playerIncome } from "../src/engine/economy";
import { applyAction } from "../src/engine/reducer";
import { TRIBES } from "../src/data/tribes";

describe("tribe abilities", () => {
  it("every tribe declares one", () => {
    for (const t of TRIBES) {
      expect(t.ability.name.length).toBeGreaterThan(0);
      expect(t.ability.description.length).toBeGreaterThan(0);
    }
  });

  it("Ashfen deal more damage attacking, and retaliating", () => {
    const neutral = makeTestState();
    const a1 = addUnit(neutral, 0, "warrior", 3, 3);
    const d1 = addUnit(neutral, 1, "warrior", 3, 4);
    const base = resolveCombat(neutral, a1, d1);

    const s = makeTestState();
    s.players[0].tribeId = "ashfen";
    const a2 = addUnit(s, 0, "warrior", 3, 3);
    const d2 = addUnit(s, 1, "warrior", 3, 4);
    const buffed = resolveCombat(s, a2, d2);

    expect(buffed.damageToDefender).toBeGreaterThan(base.damageToDefender);
    // the defender is not Ashfen, so retaliation is unchanged
    expect(buffed.damageToAttacker).toBe(base.damageToAttacker);
  });

  it("Meridia earn one extra star per turn", () => {
    const s = makeTestState();
    const before = playerIncome(s, 0);
    s.players[0].tribeId = "meridia";
    expect(playerIncome(s, 0)).toBe(before + 1);
  });

  it("a tribe with no cities earns nothing, ability included", () => {
    const s = makeTestState();
    s.players[0].tribeId = "meridia";
    s.cities = s.cities.filter((c) => c.ownerId !== 0);
    expect(playerIncome(s, 0)).toBe(0);
  });

  it("Korvani boats move one tile further", () => {
    const s = makeTestState();
    const u = addUnit(s, 0, "warrior", 3, 3);
    u.embarked = "raft";
    const korvani = unitMovIn(s, u);
    s.players[0].tribeId = "thornwood";
    expect(korvani).toBe(unitMovIn(s, u) + 1);
  });

  it("Korvani get no bonus on land", () => {
    const s = makeTestState();
    const u = addUnit(s, 0, "warrior", 3, 3);
    expect(unitMovIn(s, u)).toBe(1);
  });

  it("Thornwood cross mountains without Climbing", () => {
    const s = makeTestState();
    setTerrain(s, 4, 5, "mountain");
    const u = addUnit(s, 0, "warrior", 4, 4);
    expect(reachableTiles(s, u).some(([x, y]) => x === 4 && y === 5)).toBe(false);

    s.players[0].tribeId = "thornwood";
    expect(reachableTiles(s, u).some(([x, y]) => x === 4 && y === 5)).toBe(true);
  });
});

describe("launching boats", () => {
  /** A capital with a port on an adjacent water tile, and a unit standing on it. */
  function portState(techs: string[] = []) {
    const s = makeTestState();
    const c = s.cities[0]; // player 0's capital, at (1,1)
    const port = s.tiles[2 * s.size + 1];
    port.building = "port";
    expect(port.cityId).toBe(c.id);
    setTerrain(s, 1, 3, "water");
    s.players[0].techs.push(...techs);
    const u = addUnit(s, 0, "warrior", 1, 2);
    return { s, u };
  }

  it("a port without Sailing puts out a raft", () => {
    const { s, u } = portState();
    const next = applyAction(s, { type: "MOVE", unitId: u.id, x: 1, y: 3 });
    expect(next.units.find((x) => x.id === u.id)!.embarked).toBe("raft");
  });

  it("a port with Sailing puts out a ship", () => {
    const { s, u } = portState(["sailing"]);
    const next = applyAction(s, { type: "MOVE", unitId: u.id, x: 1, y: 3 });
    expect(next.units.find((x) => x.id === u.id)!.embarked).toBe("ship");
  });

  it("coming back ashore drops the boat", () => {
    const { s, u } = portState(["sailing"]);
    const afloat = applyAction(s, { type: "MOVE", unitId: u.id, x: 1, y: 3 });
    const unit = afloat.units.find((x) => x.id === u.id)!;
    unit.moved = false;
    const ashore = applyAction(afloat, { type: "MOVE", unitId: u.id, x: 1, y: 2 });
    expect(ashore.units.find((x) => x.id === u.id)!.embarked).toBeNull();
  });
});
