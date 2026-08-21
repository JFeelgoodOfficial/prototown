import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, setTerrain } from "./helpers";
import { computeLegalActions } from "../src/engine/legalActions";
import { applyAction } from "../src/engine/reducer";
import { reachableTiles } from "../src/engine/movement";
import { resolveCombat } from "../src/engine/combat";
import { tileAt, unitById, idx } from "../src/engine/state";
import { computeVisibility } from "../src/engine/fog";
import { FLAK_DAMAGE, FLAK_RANGE } from "../src/data/constants";
import { UNITS } from "../src/data/units";
import type { Action } from "../src/engine/actions";

const has = (tiles: Array<[number, number]>, x: number, y: number) =>
  tiles.some(([tx, ty]) => tx === x && ty === y);

describe("aircraft movement", () => {
  it("crosses peaks, woods and open ocean as if none of it were there", () => {
    const s = makeTestState(12);
    setTerrain(s, 5, 4, "mountain"); // needs Climbing on foot, and halts a march
    setTerrain(s, 5, 5, "ocean"); // needs Navigation on the water
    setTerrain(s, 5, 6, "forest"); // halts a march on entry
    const plane = addUnit(s, 0, "scout_plane", 4, 5);

    const reach = reachableTiles(s, plane);
    expect(has(reach, 5, 4)).toBe(true);
    expect(has(reach, 5, 5)).toBe(true);
    expect(has(reach, 5, 6)).toBe(true);
    // and it really does cover its whole move in one hop, terrain regardless
    expect(has(reach, 8, 5)).toBe(true);
    expect(has(reach, 9, 5)).toBe(false); // five tiles: beyond a scout's range
  });

  it("cannot come to rest on another unit, and ignores enemy lines below it", () => {
    const s = makeTestState(12);
    addUnit(s, 1, "warrior", 5, 5);
    const plane = addUnit(s, 0, "bomber", 4, 5);

    const reach = reachableTiles(s, plane);
    expect(has(reach, 5, 5)).toBe(false); // occupied
    // a marching unit stops the moment it steps beside an enemy; a plane does not
    expect(has(reach, 6, 6)).toBe(true);
  });

  it("holds no ground: no capture, and no plundering ruins", () => {
    const s = makeTestState(12);
    tileAt(s, 5, 5).village = true;
    tileAt(s, 6, 6).ruin = true;
    const plane = addUnit(s, 0, "scout_plane", 5, 5);

    expect(computeLegalActions(s, 0).some((a) => a.type === "CAPTURE")).toBe(false);

    const after = applyAction(s, { type: "MOVE", unitId: plane.id, x: 6, y: 6 });
    expect(tileAt(after, 6, 6).ruin).toBe(true);
    expect(after.lastRuinReward).toBeNull();
  });

  it("never boards a boat: water under the wings is just water", () => {
    const s = makeTestState(12);
    setTerrain(s, 5, 5, "water");
    const plane = addUnit(s, 0, "scout_plane", 4, 5);
    const after = applyAction(s, { type: "MOVE", unitId: plane.id, x: 5, y: 5 });
    expect(unitById(after, plane.id)!.embarked).toBeNull();
  });
});

describe("scout planes", () => {
  it("see three tiles, from wherever they happen to be", () => {
    const s = makeTestState(12);
    s.players[0].explored.fill(0);
    addUnit(s, 0, "scout_plane", 6, 6);
    computeVisibility(s, s.players[0]);
    expect(s.players[0].explored[idx(s, 9, 6)]).toBe(1);
    expect(s.players[0].explored[idx(s, 10, 6)]).toBe(0);
  });

  it("carry no weapon, so are never offered an attack", () => {
    const s = makeTestState(12);
    addUnit(s, 1, "warrior", 5, 5);
    addUnit(s, 0, "scout_plane", 5, 4);
    expect(UNITS.scout_plane.atk).toBe(0);
    expect(computeLegalActions(s, 0).some((a) => a.type === "ATTACK")).toBe(false);
  });
});

describe("bombers", () => {
  it("strike from above, so walls and dug-in cover count for nothing", () => {
    const s = makeTestState(12);
    // a defender dug in behind its own walls: about as covered as it gets
    const holed = addUnit(s, 1, "defender", 10, 10);
    holed.fortified = true;
    s.cities[1].walls = true;

    const swordsman = addUnit(s, 0, "swordsman", 9, 10);
    const bomber = addUnit(s, 0, "bomber", 9, 9);
    const ground = resolveCombat(s, swordsman, holed);
    const air = resolveCombat(s, bomber, holed);
    expect(air.damageToDefender).toBeGreaterThan(ground.damageToDefender * 2);
  });

  it("move in over the tile they cleared, whatever is underneath it", () => {
    const s = makeTestState(12);
    setTerrain(s, 5, 5, "mountain"); // no Climbing here, and none needed
    const target = addUnit(s, 1, "warrior", 5, 5);
    target.hp = 1;
    const bomber = addUnit(s, 0, "bomber", 5, 4);

    const after = applyAction(s, { type: "ATTACK", unitId: bomber.id, targetId: target.id });
    expect(unitById(after, target.id)).toBeUndefined();
    expect(unitById(after, bomber.id)).toMatchObject({ x: 5, y: 5, embarked: null });
  });
});

describe("flak towers", () => {
  /** p0's capital at (1,1); a battery on its own field, and an enemy plane nearby. */
  function skyState() {
    const s = makeTestState(12);
    tileAt(s, 2, 2).building = "flak_tower";
    s.players[1].techs.push("hunting", "forestry", "mathematics", "flight");
    return s;
  }

  it("fire on an enemy aircraft the moment it flies into range", () => {
    const s = skyState();
    s.currentPlayerId = 1;
    const plane = addUnit(s, 1, "bomber", 2, 8);

    const after = applyAction(s, { type: "MOVE", unitId: plane.id, x: 2, y: 2 + FLAK_RANGE });
    const hit = unitById(after, plane.id)!;
    expect(hit.hp).toBe(UNITS.bomber.hp - FLAK_DAMAGE);
    expect(after.lastFlakHit).toMatchObject({ unitId: plane.id, damage: FLAK_DAMAGE, destroyed: false });
  });

  it("hold their fire outside their umbrella, and against ground troops", () => {
    const s = skyState();
    s.currentPlayerId = 1;
    const plane = addUnit(s, 1, "bomber", 2, 11);
    const marcher = addUnit(s, 1, "knight", 5, 5);

    const flown = applyAction(s, { type: "MOVE", unitId: plane.id, x: 2, y: 2 + FLAK_RANGE + 1 });
    expect(unitById(flown, plane.id)!.hp).toBe(UNITS.bomber.hp);
    expect(flown.lastFlakHit).toBeNull();

    const marched = applyAction(s, { type: "MOVE", unitId: marcher.id, x: 3, y: 3 });
    expect(unitById(marched, marcher.id)!.hp).toBe(UNITS.knight.hp);
  });

  it("shoot down a plane that flies in already damaged", () => {
    const s = skyState();
    s.currentPlayerId = 1;
    const plane = addUnit(s, 1, "scout_plane", 2, 6);
    plane.hp = 4;

    const after = applyAction(s, { type: "MOVE", unitId: plane.id, x: 2, y: 4 });
    expect(unitById(after, plane.id)).toBeUndefined();
    expect(after.lastFlakHit).toMatchObject({ destroyed: true });
  });

  it("never open up on their owner's own aircraft", () => {
    const s = skyState();
    const plane = addUnit(s, 0, "scout_plane", 2, 6);
    const after = applyAction(s, { type: "MOVE", unitId: plane.id, x: 2, y: 4 });
    expect(unitById(after, plane.id)!.hp).toBe(UNITS.scout_plane.hp);
  });
});

describe("airfields", () => {
  it("gate aircraft: a city can only train them once it has a strip", () => {
    const s = makeTestState(12);
    s.players[0].techs.push("hunting", "forestry", "mathematics", "flight");
    s.players[0].stars = 60;
    const trains = (): string[] =>
      computeLegalActions(s, 0)
        .filter((a): a is Extract<Action, { type: "TRAIN" }> => a.type === "TRAIN")
        .map((a) => a.unitType);

    expect(trains()).not.toContain("scout_plane");
    expect(trains()).toContain("warrior");

    tileAt(s, 2, 2).building = "airfield";
    expect(trains()).toContain("scout_plane");
    expect(trains()).toContain("bomber");
  });
});
