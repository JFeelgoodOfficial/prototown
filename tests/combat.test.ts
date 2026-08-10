import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, setTerrain } from "./helpers";
import { resolveCombat } from "../src/engine/combat";
import { applyAction } from "../src/engine/reducer";

describe("combat formula", () => {
  it("full-HP warrior vs warrior on open ground deals 5 and takes 5", () => {
    const s = makeTestState();
    const a = addUnit(s, 0, "warrior", 3, 3);
    const d = addUnit(s, 1, "warrior", 3, 4);
    const r = resolveCombat(s, a, d);
    // AF=2, DF=2 -> dmg = round(2/4 * 2 * 4.5) = round(4.5) = 5 both ways
    expect(r.damageToDefender).toBe(5);
    expect(r.damageToAttacker).toBe(5);
    expect(r.defenderDies).toBe(false);
  });

  it("terrain defence bonus (archery + forest) raises defence force", () => {
    const s = makeTestState();
    setTerrain(s, 3, 4, "forest");
    s.players[1].techs.push("archery");
    const a = addUnit(s, 0, "warrior", 3, 3);
    const d = addUnit(s, 1, "warrior", 3, 4);
    const r = resolveCombat(s, a, d);
    // AF=2, DF=2*1.5=3, total=5 -> dmg=round(2/5*9)=4, retaliation=round(3/5*9)=5
    expect(r.damageToDefender).toBe(4);
    expect(r.damageToAttacker).toBe(5);
  });

  it("walled city gives the 4x defence bonus", () => {
    const s = makeTestState();
    const city = s.cities[1];
    city.walls = true;
    const a = addUnit(s, 0, "warrior", city.x - 1, city.y);
    const d = addUnit(s, 1, "warrior", city.x, city.y);
    const r = resolveCombat(s, a, d);
    // AF=2, DF=8, total=10 -> dmg=round(2/10*9)=2, retaliation=round(8/10*9)=7
    expect(r.damageToDefender).toBe(2);
    expect(r.damageToAttacker).toBe(7);
  });

  it("ranged attacker outside defender range takes no retaliation", () => {
    const s = makeTestState();
    const a = addUnit(s, 0, "archer", 3, 3);
    const d = addUnit(s, 1, "warrior", 3, 5);
    const r = resolveCombat(s, a, d);
    expect(r.damageToDefender).toBeGreaterThan(0);
    expect(r.damageToAttacker).toBe(0);
  });

  it("wounded units hit softer", () => {
    const s = makeTestState();
    const a = addUnit(s, 0, "warrior", 3, 3);
    a.hp = 5;
    const d = addUnit(s, 1, "warrior", 3, 4);
    const r = resolveCombat(s, a, d);
    // AF=1, DF=2 -> dmg = round(1/3 * 9) = 3
    expect(r.damageToDefender).toBe(3);
  });

  it("melee attacker advances into the tile on a kill", () => {
    const s = makeTestState();
    const a = addUnit(s, 0, "giant", 3, 3);
    const d = addUnit(s, 1, "warrior", 3, 4);
    d.hp = 1;
    const next = applyAction(s, { type: "ATTACK", unitId: a.id, targetId: d.id });
    const moved = next.units.find((u) => u.id === a.id)!;
    expect(moved.x).toBe(3);
    expect(moved.y).toBe(4);
    expect(next.units.find((u) => u.id === d.id)).toBeUndefined();
    expect(moved.kills).toBe(1);
  });

  it("three kills promote a unit to veteran with +5 max HP and full heal", () => {
    const s = makeTestState();
    const a = addUnit(s, 0, "warrior", 3, 3);
    a.kills = 2;
    a.hp = 4;
    const d = addUnit(s, 1, "warrior", 3, 4);
    d.hp = 1;
    const next = applyAction(s, { type: "ATTACK", unitId: a.id, targetId: d.id });
    const vet = next.units.find((u) => u.id === a.id)!;
    expect(vet.veteran).toBe(true);
    expect(vet.maxHp).toBe(15);
    expect(vet.hp).toBe(15);
  });
});
