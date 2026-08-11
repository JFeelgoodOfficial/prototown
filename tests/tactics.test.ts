import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, setTerrain } from "./helpers";
import { resolveCombat, defenceBonus, flankBonus } from "../src/engine/combat";
import { applyAction } from "../src/engine/reducer";
import { computeLegalActions } from "../src/engine/legalActions";
import { FORTIFY_BONUS, FLANK_BONUS_MAX } from "../src/data/constants";

describe("digging in", () => {
  it("raises defence and survives longer", () => {
    const open = makeTestState();
    const a1 = addUnit(open, 0, "warrior", 3, 3);
    const d1 = addUnit(open, 1, "warrior", 3, 4);
    const plain = resolveCombat(open, a1, d1);

    const dug = makeTestState();
    const a2 = addUnit(dug, 0, "warrior", 3, 3);
    const d2 = addUnit(dug, 1, "warrior", 3, 4);
    d2.fortified = true;
    const held = resolveCombat(dug, a2, d2);

    expect(defenceBonus(dug, d2)).toBeCloseTo(FORTIFY_BONUS, 5);
    expect(held.damageToDefender).toBeLessThan(plain.damageToDefender);
    // retaliation rises too, though at warrior scale both round to the same integer
    expect(held.damageToAttacker).toBeGreaterThanOrEqual(plain.damageToAttacker);
  });

  it("multiplies the terrain bonus rather than replacing it", () => {
    const s = makeTestState();
    setTerrain(s, 3, 4, "forest");
    s.players[1].techs.push("archery");
    const d = addUnit(s, 1, "warrior", 3, 4);
    const terrainOnly = defenceBonus(s, d);
    d.fortified = true;
    expect(defenceBonus(s, d)).toBeCloseTo(terrainOnly * FORTIFY_BONUS, 5);
  });

  it("is offered to a ready land unit and consumes its turn", () => {
    const s = makeTestState();
    const u = addUnit(s, 0, "warrior", 3, 3);
    const legal = computeLegalActions(s, 0);
    expect(legal.some((a) => a.type === "FORTIFY" && a.unitId === u.id)).toBe(true);

    const next = applyAction(s, { type: "FORTIFY", unitId: u.id });
    const after = next.units.find((x) => x.id === u.id)!;
    expect(after.fortified).toBe(true);
    expect(after.moved && after.attacked).toBe(true);
    // and not offered twice
    expect(computeLegalActions(next, 0).some((a) => a.type === "FORTIFY")).toBe(false);
  });

  it("is given up by moving or attacking", () => {
    const s = makeTestState();
    const u = addUnit(s, 0, "warrior", 3, 3);
    u.fortified = true;
    const moved = applyAction(s, { type: "MOVE", unitId: u.id, x: 4, y: 3 });
    expect(moved.units.find((x) => x.id === u.id)!.fortified).toBe(false);

    const s2 = makeTestState();
    const a = addUnit(s2, 0, "warrior", 3, 3);
    a.fortified = true;
    const e = addUnit(s2, 1, "warrior", 3, 4);
    const fought = applyAction(s2, { type: "ATTACK", unitId: a.id, targetId: e.id });
    expect(fought.units.find((x) => x.id === a.id)!.fortified).toBe(false);
  });

  it("is not offered to a unit at sea", () => {
    const s = makeTestState();
    setTerrain(s, 4, 3, "water");
    const u = addUnit(s, 0, "warrior", 4, 3);
    u.embarked = "raft";
    expect(computeLegalActions(s, 0).some((a) => a.type === "FORTIFY" && a.unitId === u.id)).toBe(false);
  });
});

describe("flanking", () => {
  it("hits harder for each friendly unit already pressing the defender", () => {
    const s = makeTestState();
    const attacker = addUnit(s, 0, "warrior", 3, 3);
    const defender = addUnit(s, 1, "warrior", 3, 4);
    expect(flankBonus(s, attacker, defender)).toBe(1);
    const solo = resolveCombat(s, attacker, defender).damageToDefender;

    addUnit(s, 0, "warrior", 2, 4);
    const oneFlanker = flankBonus(s, attacker, defender);
    expect(oneFlanker).toBeGreaterThan(1);

    // a second presser pushes the multiplier far enough to clear rounding
    addUnit(s, 0, "warrior", 4, 4);
    expect(flankBonus(s, attacker, defender)).toBeGreaterThan(oneFlanker);
    const flanked = resolveCombat(s, attacker, defender).damageToDefender;
    expect(flanked).toBeGreaterThan(solo);
  });

  it("caps so a crowd cannot one-shot anything", () => {
    const s = makeTestState();
    const attacker = addUnit(s, 0, "warrior", 3, 3);
    const defender = addUnit(s, 1, "warrior", 3, 4);
    for (const [x, y] of [
      [2, 3],
      [2, 4],
      [2, 5],
      [3, 5],
      [4, 5],
      [4, 4],
      [4, 3],
    ] as const) {
      addUnit(s, 0, "warrior", x, y);
    }
    expect(flankBonus(s, attacker, defender)).toBeCloseTo(1 + FLANK_BONUS_MAX, 5);
  });

  it("counts only the attacker's own units, and not the attacker itself", () => {
    const s = makeTestState();
    const attacker = addUnit(s, 0, "warrior", 3, 3);
    const defender = addUnit(s, 1, "warrior", 3, 4);
    addUnit(s, 1, "warrior", 2, 4); // an enemy friend of the defender
    expect(flankBonus(s, attacker, defender)).toBe(1);
  });
});
