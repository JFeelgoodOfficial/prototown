import { describe, it, expect } from "vitest";
import { makeTestState, addUnit } from "./helpers";
import { computeVisibility, watchedMask } from "../src/engine/fog";
import { computeLegalActions } from "../src/engine/legalActions";
import { idx } from "../src/engine/state";

describe("fog of war", () => {
  it("units reveal a radius-1 area (radius 2 on mountains)", () => {
    const s = makeTestState();
    const p = s.players[0];
    p.explored.fill(0);
    addUnit(s, 0, "warrior", 4, 4);
    computeVisibility(s, p);
    expect(p.explored[idx(s, 5, 5)]).toBe(1);
    expect(p.explored[idx(s, 6, 4)]).toBe(0);

    s.tiles[idx(s, 4, 4)].terrain = "mountain";
    computeVisibility(s, p);
    expect(p.explored[idx(s, 6, 4)]).toBe(1);
  });

  it("explored terrain stays explored after the unit leaves", () => {
    const s = makeTestState();
    const p = s.players[0];
    p.explored.fill(0);
    const u = addUnit(s, 0, "warrior", 4, 4);
    computeVisibility(s, p);
    u.x = 1;
    u.y = 1;
    computeVisibility(s, p);
    expect(p.explored[idx(s, 5, 5)]).toBe(1); // still explored
    expect(watchedMask(s, p)[idx(s, 5, 5)]).toBe(0); // but no longer watched
  });

  it("attacks are only offered against watched enemies", () => {
    const s = makeTestState();
    const archer = addUnit(s, 0, "archer", 4, 4);
    addUnit(s, 1, "warrior", 6, 4); // within range 2, but outside sight radius 1
    const actions = computeLegalActions(s, 0);
    expect(actions.some((a) => a.type === "ATTACK" && a.unitId === archer.id)).toBe(false);

    addUnit(s, 0, "warrior", 6, 5); // spotter next to the enemy
    const actions2 = computeLegalActions(s, 0);
    expect(actions2.some((a) => a.type === "ATTACK" && a.unitId === archer.id)).toBe(true);
  });
});
